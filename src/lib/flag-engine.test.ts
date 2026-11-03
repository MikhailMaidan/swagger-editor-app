import { webcrypto, createHash } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  checkFlagCondition,
  createFlagEvaluator,
  flagBucket,
} from "./flag-engine";
import {
  emptyFlagProject,
  newFeatureFlag,
  normalizeFlagDefinition,
  normalizeFlagProject,
  normalizeFlagJson,
  type FlagCondition,
  type FlagContext,
} from "./flag-model";
const context: FlagContext = {
  key: "subject-1",
  attributes: {
    plan: "pro",
    score: 7,
    nothing: null,
    list: [1, 2],
    "a/b": { "~": true },
  },
  nowMs: 1000,
};
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe("typed feature-flag evaluation and stable SHA-256 cohorts", () => {
  it("matches independent SHA-256 vectors with unambiguous UTF-8 domain separation", async () => {
    const args = [
        "environment-v1",
        "flag-1",
        "stable-v1",
        "rollout",
        "subject-1",
      ] as const,
      expected = Math.floor(
        (createHash("sha256")
          .update(JSON.stringify(["rsswag-flags-v1", ...args]))
          .digest()
          .readUInt32BE(0) *
          1000000) /
          4294967296,
      );
    expect(await flagBucket(...args)).toBe(expected);
    expect(await flagBucket(...args)).toBe(await flagBucket(...args));
    expect(await flagBucket(...args)).not.toBe(
      await flagBucket(args[0], args[1], args[2], "allocation", args[4]),
    );
    expect(await flagBucket("a", "b", "c", "d", "é")).not.toBe(
      await flagBucket("a", "b", "c", "d", "e\u0301"),
    );
  });
  it("distinguishes missing attributes from null and compares typed JSON without coercion or inherited properties", () => {
    const check = (
      operator: FlagCondition["operator"],
      pointer: string,
      value?: unknown,
    ) =>
      checkFlagCondition(
        {
          operator,
          pointer,
          ...(value === undefined ? {} : { value: normalizeFlagJson(value) }),
        },
        context.attributes,
      );
    expect(check("exists", "/nothing").passed).toBe(true);
    expect(check("absent", "/missing").passed).toBe(true);
    expect(check("notEqual", "/missing", null)).toMatchObject({
      passed: false,
      reason: "missing",
    });
    expect(check("equal", "/nothing", null).passed).toBe(true);
    expect(check("equal", "/score", "7").passed).toBe(false);
    expect(check("greater", "/plan", 1).reason).toBe("type");
    expect(check("equal", "/a~1b/~0", true).passed).toBe(true);
    expect(check("exists", "/list/01").passed).toBe(false);
    expect(check("exists", "/constructor").passed).toBe(false);
    expect(check("in", "/plan", ["free", "pro"]).passed).toBe(true);
    expect(check("contains", "/list", 2).passed).toBe(true);
    expect(check("startsWith", "/plan", "pr").passed).toBe(true);
  });
  it("uses start-inclusive/end-exclusive schedules and an explicit evaluation clock", async () => {
    const d = emptyFlagProject().definition;
    d.flags[0].rolloutPpm = 1000000;
    d.flags[0].startMs = 1000;
    d.flags[0].endMs = 2000;
    const evaluate = createFlagEvaluator(d);
    for (const [nowMs, served] of [
      [999, false],
      [1000, true],
      [1999, true],
      [2000, false],
    ] as const)
      expect((await evaluate({ ...context, nowMs }))[0].served).toBe(served);
  });
  it("checks enabled/schedule/exclusion gates before rules and respects include-all/exclude-any audiences", async () => {
    const d = emptyFlagProject().definition;
    d.segments = [
      {
        id: "paid",
        name: "Paid",
        conditions: [{ pointer: "/plan", operator: "equal", value: "pro" }],
      },
      {
        id: "blocked",
        name: "Blocked",
        conditions: [{ pointer: "/blocked", operator: "equal", value: true }],
      },
    ];
    const f = d.flags[0];
    f.rolloutPpm = 1000000;
    f.include = ["paid"];
    f.exclude = ["blocked"];
    f.rules = [
      {
        id: "always",
        name: "Always",
        include: [],
        exclude: [],
        conditions: [],
        rolloutPpm: 1000000,
        variantId: "on",
      },
    ];
    const evaluate = createFlagEvaluator(d);
    expect((await evaluate(context))[0].reason).toBe("rule");
    expect(
      (await evaluate({ ...context, attributes: { plan: "free" } }))[0].reason,
    ).toBe("audience");
    expect(
      (
        await evaluate({
          ...context,
          attributes: { plan: "pro", blocked: true },
        })
      )[0].reason,
    ).toBe("excluded");
    f.enabled = false;
    expect((await createFlagEvaluator(d)(context))[0].reason).toBe("disabled");
  });
  it("uses ordered rules, fails a zero-percent rule into the next rule and bypasses only the default rollout gate", async () => {
    const d = emptyFlagProject().definition,
      f = d.flags[0];
    f.rolloutPpm = 0;
    f.rules = [
      {
        id: "zero",
        name: "Zero",
        include: [],
        exclude: [],
        conditions: [],
        rolloutPpm: 0,
        variantId: "on",
      },
      {
        id: "staff",
        name: "Staff",
        include: [],
        exclude: [],
        conditions: [
          { pointer: "/score", operator: "greaterOrEqual", value: 7 },
        ],
        rolloutPpm: 1000000,
        variantId: "on",
      },
    ];
    const [r] = await createFlagEvaluator(d)(context);
    expect(r).toMatchObject({ served: true, variantId: "on", reason: "rule" });
    expect(r.rules.map((x) => x.status)).toEqual(["percentage", "matched"]);
  });
  it("requires a served prerequisite variant even if an off value happens to match that variant's value", async () => {
    const d = emptyFlagProject().definition;
    d.flags[0].rolloutPpm = 0;
    d.flags[0].offValue = true;
    d.flags.push({
      ...newFeatureFlag("child"),
      rolloutPpm: 1000000,
      prerequisites: [{ flagId: "flag-1", variantId: "on" }],
    });
    const rows = await createFlagEvaluator(d)(context);
    expect(rows[0]).toMatchObject({ served: false, value: true });
    expect(rows[1]).toMatchObject({
      served: false,
      reason: "prerequisite",
      prerequisites: [{ passed: false }],
    });
  });
  it("treats a false-valued variant as a served assignment and validates every declared value kind", async () => {
    for (const [kind, value, offValue] of [
      ["boolean", false, true],
      ["number", 7, 0],
      ["string", "blue", "none"],
      ["json", { b: 2, a: 1 }, null],
    ] as const) {
      const d = emptyFlagProject().definition;
      d.flags[0] = {
        ...d.flags[0],
        kind,
        offValue,
        rolloutPpm: 1000000,
        variants: [{ id: "value", name: "Value", weightPpm: 1000000, value }],
      };
      expect((await createFlagEvaluator(d)(context))[0]).toMatchObject({
        served: true,
        variantId: "value",
        value,
      });
    }
    const d = emptyFlagProject().definition;
    d.flags[0].variants[0].value = "wrong";
    expect(() => normalizeFlagDefinition(d)).toThrow("definition");
  });
  it("admits exact bucket boundaries, skips zero weights and keeps allocation independent of admission", async () => {
    const d = emptyFlagProject().definition,
      f = d.flags[0],
      bucket = await flagBucket(d.salt, f.id, f.salt, "rollout", context.key);
    f.rolloutPpm = bucket;
    expect((await createFlagEvaluator(d)(context))[0].served).toBe(false);
    f.rolloutPpm = bucket + 1;
    f.variants = [
      { id: "zero", name: "Zero", weightPpm: 0, value: false },
      { id: "on", name: "On", weightPpm: 1000000, value: true },
    ];
    const small = (await createFlagEvaluator(d)(context))[0];
    f.rolloutPpm = 1000000;
    const full = (await createFlagEvaluator(d)(context))[0];
    expect(small).toMatchObject({ served: true, variantId: "on" });
    expect(full.allocationBucket).toBe(small.allocationBucket);
  });
  it("rejects dangling segment/prerequisite/variant references, duplicate IDs and all dependency cycles", () => {
    const base = emptyFlagProject().definition;
    for (const modify of [
      (d: typeof base) => {
        d.flags[0].include = ["missing"];
      },
      (d) => {
        d.flags[0].prerequisites = [{ flagId: "flag-1", variantId: "on" }];
      },
      (d) => {
        d.flags.push({
          ...newFeatureFlag("child"),
          prerequisites: [{ flagId: "flag-1", variantId: "on" }],
        });
        d.flags[0].prerequisites = [{ flagId: "child", variantId: "on" }];
      },
      (d) => {
        d.flags[0].prerequisites = [{ flagId: "missing", variantId: "on" }];
      },
      (d) => {
        d.flags[0].variants[0].weightPpm = 999999;
      },
      (d) => {
        d.flags.push(d.flags[0]);
      },
    ] as ((d: typeof base) => void)[]) {
      const d = structuredClone(base);
      modify(d);
      expect(() => normalizeFlagDefinition(d)).toThrow();
    }
  });
  it("snapshots asynchronous inputs and policy, defensively returns values and rejects malformed contexts/selectors", async () => {
    const d = emptyFlagProject().definition;
    d.flags[0].rolloutPpm = 1000000;
    const evaluate = createFlagEvaluator(d),
      input = structuredClone(context),
      pending = evaluate(input);
    input.key = "changed";
    input.attributes.plan = "free";
    d.flags[0].enabled = false;
    const rows = await pending;
    expect(rows[0].served).toBe(true);
    rows[0].value = "leaked";
    expect((await evaluate(context))[0].value).toBe(true);
    await expect(evaluate({ ...context, key: "" })).rejects.toThrow("context");
    await expect(evaluate(context, ["missing"])).rejects.toThrow("reference");
    await expect(evaluate(context, new Array(1))).rejects.toThrow();
  });
  it("bounds payloads/prototypes and maps unavailable cryptography to an explicit error", async () => {
    for (const v of [new Date(), Infinity, undefined, new Array(2)])
      expect(() => normalizeFlagJson(v)).toThrow();
    expect(() => normalizeFlagJson("x".repeat(2049))).toThrow("limit");
    const p = emptyFlagProject();
    p.cases[0].context.attributes = JSON.parse('{"__proto__":{"safe":true}}');
    expect(normalizeFlagProject(p).cases[0].context.attributes).toHaveProperty(
      "__proto__",
    );
    expect(({} as { safe?: boolean }).safe).toBeUndefined();
    vi.stubGlobal("crypto", {});
    await expect(
      createFlagEvaluator(emptyFlagProject().definition)(context),
    ).rejects.toThrow("crypto");
  });
});
