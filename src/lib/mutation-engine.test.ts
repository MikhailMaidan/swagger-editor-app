import { describe, expect, it } from "vitest";
import {
  emptyMTProject,
  normalizeMTProject,
  parseMTProject,
  serializeMTProject,
  MT_OPERATORS,
  MT_LIMITS,
  type MTProject,
} from "./mutation-model";
import {
  planMTMutations,
  runMTProject,
  materializeMTMutation,
  mtCheckMatrix,
  reduceMTChecks,
  suggestMTAssertion,
  mtRecordedExpectation,
  mtReport,
} from "./mutation-engine";
import { readMutationJson, mtNumberEqualsSmall } from "./mutation-json";
import { demoMTProject } from "./mutation-demo";
import { evaluateResponseAssertions } from "./response-assertions";

const fast = { yield: async () => {} };
function only(
  operator: MTProject["operators"][number],
  body = '{"a":1,"b":"x","c":true,"list":[1,2],"obj":{}}',
) {
  const p = emptyMTProject();
  p.operators = [operator];
  p.maxMutants = 128;
  p.fixtures[0].response.body = body;
  return p;
}
describe("mutation project contracts", () => {
  it("round-trips projects and strips untrusted results and response source labels", () => {
    const p = demoMTProject();
    expect(parseMTProject(`\uFEFF${serializeMTProject(p)}`)).toEqual(p);
    const normalized = normalizeMTProject({
      ...p,
      results: { score: 100 },
      fixtures: p.fixtures.map((f) => ({
        ...f,
        response: { ...f.response, source: "live" },
      })),
    });
    expect(normalized).not.toHaveProperty("results");
    expect(normalized.fixtures[0].response.source).toBe("mock");
  });
  it.each([
    (p: MTProject) => ({ ...p, operators: [] }),
    (p: MTProject) => ({ ...p, operators: ["status", "status"] }),
    (p: MTProject) => ({ ...p, maxMutants: 129 }),
    (p: MTProject) => ({ ...p, fixtures: [p.fixtures[0], p.fixtures[0]] }),
    (p: MTProject) => ({
      ...p,
      fixtures: [{ ...p.fixtures[0], scope: "/bad~2pointer" }],
    }),
    (p: MTProject) => ({
      ...p,
      fixtures: [
        {
          ...p.fixtures[0],
          response: { ...p.fixtures[0].response, status: "0" },
        },
      ],
    }),
    (p: MTProject) => ({
      ...p,
      fixtures: [
        {
          ...p.fixtures[0],
          response: { ...p.fixtures[0].response, durationMs: Infinity },
        },
      ],
    }),
    (p: MTProject) => ({
      ...p,
      fixtures: [
        {
          ...p.fixtures[0],
          response: {
            ...p.fixtures[0].response,
            headers: { "X-Key": "1", "x-key": "2" },
          },
        },
      ],
    }),
    (p: MTProject) => ({
      ...p,
      fixtures: [
        {
          ...p.fixtures[0],
          response: {
            ...p.fixtures[0].response,
            headers: { "X-Key": "bad\r\nvalue" },
          },
        },
      ],
    }),
    (p: MTProject) => ({
      ...p,
      fixtures: [
        {
          ...p.fixtures[0],
          checks: [
            {
              ...p.fixtures[0].checks[0],
              rule: {
                name: "Bad",
                target: "body",
                path: "bad",
                operator: "exists",
                expected: "",
              },
            },
          ],
        },
      ],
    }),
    (p: MTProject) => ({
      ...p,
      waivers: [{ fixture: "missing", key: "key", reason: "Reason" }],
    }),
    (p: MTProject) => ({
      ...p,
      waivers: [{ fixture: p.fixtures[0].id, key: "key", reason: "" }],
    }),
  ])("rejects malformed definitions atomically (%#)", (change) => {
    expect(() => normalizeMTProject(change(emptyMTProject()))).toThrow();
  });
  it("checks actual UTF-8 import size", () => {
    expect(() =>
      parseMTProject(`{"padding":"${"\u20ac".repeat(710_000)}"}`),
    ).toThrow("limit");
  });
});
describe("lossless JSON mutation plans", () => {
  it.each(["status", "duration", "header-remove", "header-change"] as const)(
    "keeps %s-only plans independent of JSON diagnostics and body scope",
    (operator) => {
      for (const body of ["plain text", '{"a":1,"a":2}', '{"a":1}']) {
        const project = only(operator, body),
          fixture = project.fixtures[0];
        fixture.scope = "/missing";
        const plan = planMTMutations(project, fixture);
        expect(plan.diagnostic).toBeNull();
        expect(plan.mutations.length).toBeGreaterThan(0);
        for (const mutation of plan.mutations)
          expect(materializeMTMutation(fixture.response, mutation).body).toBe(
            body,
          );
      }
    },
  );
  it.each(MT_OPERATORS)(
    "generates applicable %s plans with valid output except deliberate syntax faults",
    (op) => {
      const p = only(op),
        fixture = p.fixtures[0],
        before = JSON.stringify(fixture),
        plans = planMTMutations(p, fixture);
      expect(plans.mutations.length).toBeGreaterThan(0);
      for (const mutation of plans.mutations) {
        const body = materializeMTMutation(fixture.response, mutation).body;
        if (op === "invalid-json") expect(() => JSON.parse(body)).toThrow();
        else expect(() => JSON.parse(body)).not.toThrow();
      }
      expect(JSON.stringify(fixture)).toBe(before);
    },
  );
  it("preserves unrelated high-precision numbers, escapes, property order and a leading BOM", () => {
    const p = only(
      "string-change",
      '\uFEFF{ "id":9007199254740993, "decimal":1.234567890123456789, "text":"\\u0041", "value":"hello" }',
    );
    p.fixtures[0].scope = "/value";
    const mutation = planMTMutations(p, p.fixtures[0]).mutations[0];
    expect(materializeMTMutation(p.fixtures[0].response, mutation).body).toBe(
      '\uFEFF{ "id":9007199254740993, "decimal":1.234567890123456789, "text":"\\u0041", "value":"__mutated__" }',
    );
  });
  it("removes first, middle, last and sole properties and items without invalid delimiters", () => {
    for (const [op, body] of [
      ["field-remove", '{ "a": 1,\n "b":2, "c":3 }'],
      ["field-remove", '{"a":1}'],
      ["array-drop", "[ 1,\n 2, 3 ]"],
      ["array-drop", "[1]"],
    ] as const) {
      const p = only(op, body),
        mutations = planMTMutations(p, p.fixtures[0]).mutations;
      expect(mutations).toHaveLength(
        body === '{"a":1}' || body === "[1]" ? 1 : 3,
      );
      for (const m of mutations) {
        const value = JSON.parse(
          materializeMTMutation(p.fixtures[0].response, m).body,
        );
        expect(Object.keys(value)).toHaveLength(mutations.length === 1 ? 0 : 2);
      }
    }
  });
  it("handles escaped pointers and restricts scope, including removal of the selected subtree", () => {
    const p = only("field-remove", '{"a/b":{"~key":1},"other":2}');
    p.fixtures[0].scope = "/a~1b";
    const plan = planMTMutations(p, p.fixtures[0]);
    expect(plan.mutations.map((m) => m.pointer)).toEqual([
      "/a~1b",
      "/a~1b/~0key",
    ]);
    expect(
      JSON.parse(
        materializeMTMutation(p.fixtures[0].response, plan.mutations[0]).body,
      ),
    ).toEqual({ other: 2 });
    p.fixtures[0].scope = "/missing";
    expect(planMTMutations(p, p.fixtures[0])).toMatchObject({
      mutations: [],
      diagnostic: "scope-missing",
    });
  });
  it("rejects ambiguous duplicate keys and deep/large JSON without a partial AST", () => {
    for (const body of ['{"a":1,"\\u0061":2}', '{"a":{"x":1,"x":2}}'])
      expect(readMutationJson(body)).toEqual({
        nodes: [],
        diagnostic: "duplicate-keys",
      });
    expect(readMutationJson("[".repeat(22) + "0" + "]".repeat(22))).toEqual({
      nodes: [],
      diagnostic: "json-limit",
    });
    expect(
      readMutationJson(JSON.stringify(Array.from({ length: 2001 }, () => 0))),
    ).toEqual({ nodes: [], diagnostic: "json-limit" });
    expect(readMutationJson("not json")).toEqual({
      nodes: [],
      diagnostic: "non-json",
    });
  });
  it("recognizes exact small numeric no-ops without rounding other decimals", () => {
    for (const raw of ["0", "-0", "0e999999", "0.000"])
      expect(mtNumberEqualsSmall(raw, 0)).toBe(true);
    for (const raw of ["1", "1.0", "100e-2", "0.001e3"])
      expect(mtNumberEqualsSmall(raw, 1)).toBe(true);
    expect(mtNumberEqualsSmall("-1.000e0", -1)).toBe(true);
    expect(mtNumberEqualsSmall("1.00000000000000001", 1)).toBe(false);
    const p = only("number", "1.0");
    expect(
      planMTMutations(p, p.fixtures[0]).mutations.map((m) => m.variant),
    ).toEqual(["0", "-1"]);
  });
  it("reports cap truncation and keeps stable waiver keys across operator ordering", () => {
    const p = demoMTProject();
    p.maxMutants = 3;
    const first = planMTMutations(p, p.fixtures[0]);
    expect(first.mutations).toHaveLength(3);
    expect(first.truncated).toBe(true);
    expect(
      planMTMutations(
        { ...p, operators: [...p.operators].reverse() },
        p.fixtures[0],
      ),
    ).toEqual(first);
  });
});
describe("mutation scoring and assertion diagnostics", () => {
  it("still evaluates JSON assertions when only protocol mutations are enabled", async () => {
    const project = only("status", "not JSON");
    project.fixtures[0].checks.push({
      id: "json",
      enabled: true,
      pinned: false,
      rule: {
        name: "JSON body",
        target: "body",
        path: "",
        operator: "type",
        expected: "object",
      },
    });
    const [run] = await runMTProject(project, undefined, fast);
    expect(run).toMatchObject({ blocked: true, score: null, mutants: [] });
    expect(run.baseline[1]).toEqual({
      outcome: "error",
      issue: "unreadable-body",
    });
  });
  it("scores weak and strict checks differently while leaving the project untouched", async () => {
    const p = demoMTProject(),
      before = serializeMTProject(p),
      runs = await runMTProject(p, undefined, fast);
    expect(runs[0].score).toBeLessThan(100);
    expect(runs[0].survived).toBeGreaterThan(0);
    expect(runs[1]).toMatchObject({
      score: 100,
      survived: 0,
      inconclusive: 0,
      blocked: false,
    });
    expect(serializeMTProject(p)).toBe(before);
    expect(await runMTProject(p, undefined, fast)).toEqual(runs);
  });
  it("blocks failing baselines and refuses vacuous runs with no enabled checks", async () => {
    const p = only("status");
    p.fixtures[0].response.status = "500";
    expect((await runMTProject(p, undefined, fast))[0]).toMatchObject({
      blocked: true,
      score: null,
      mutants: [],
    });
    p.fixtures[0].checks[0].enabled = false;
    await expect(runMTProject(p, undefined, fast)).rejects.toThrow("no-checks");
  });
  it("keeps assertion evaluation errors inconclusive instead of treating them as kills", async () => {
    const p = only("invalid-json");
    p.fixtures[0].checks.push({
      id: "json",
      enabled: true,
      pinned: false,
      rule: {
        name: "JSON",
        target: "body",
        path: "",
        operator: "type",
        expected: "object",
      },
    });
    const [run] = await runMTProject(p, undefined, fast);
    expect(run).toMatchObject({
      score: 0,
      killed: 0,
      inconclusive: 1,
      survived: 0,
    });
    expect(
      run.mutants[0].results.some((r) => r.issue === "unreadable-body"),
    ).toBe(true);
  });
  it("excludes reasoned waivers and never assigns 100 percent to an empty denominator", async () => {
    const p = only("status"),
      plan = planMTMutations(p, p.fixtures[0]);
    p.waivers = plan.mutations.map((m) => ({
      fixture: p.fixtures[0].id,
      key: m.key,
      reason: "Intentional acceptable variant",
    }));
    p.waivers.push({
      fixture: p.fixtures[0].id,
      key: "stale-key",
      reason: "Retain for review",
    });
    const [run] = await runMTProject(p, undefined, fast);
    expect(run).toMatchObject({
      score: null,
      killed: 0,
      waived: 2,
      staleWaivers: 1,
    });
    expect(() => mtRecordedExpectation(run)).toThrow("expectation");
  });
  it("preserves observed kills and enabled pins when proposing a smaller check subset", async () => {
    const p = demoMTProject(),
      fixture = p.fixtures[1];
    fixture.checks.push({
      ...fixture.checks[0],
      id: "redundant-status",
      pinned: false,
    });
    const [run] = await runMTProject(p, [fixture.id], fast),
      subset = reduceMTChecks(fixture, run);
    expect(subset).toContain("status");
    expect(subset).not.toContain("redundant-status");
    for (const mutant of run.mutants.filter((m) => m.outcome === "killed"))
      expect(mutant.killedBy.some((id) => subset.includes(id))).toBe(true);
    expect(
      mtCheckMatrix(run).find((r) => r.id === "redundant-status")?.uniqueKills,
    ).toBe(0);
  });
  it("suggests only assertions that pass the baseline and fail the selected mutant", async () => {
    const p = demoMTProject(),
      fixture = p.fixtures[0],
      [run] = await runMTProject(p, [fixture.id], fast);
    for (const mutant of run.mutants.filter((m) => m.outcome === "survived")) {
      const rule = suggestMTAssertion(fixture, mutant);
      expect(rule).not.toBeNull();
      expect(
        evaluateResponseAssertions([rule!], fixture.response)[0].outcome,
      ).toBe("pass");
      expect(
        evaluateResponseAssertions(
          [rule!],
          materializeMTMutation(fixture.response, mutant),
        )[0].outcome,
      ).toBe("fail");
    }
  });
  it("records budgets, detects weakened assertions, and rejects unapproved truncation", async () => {
    const p = demoMTProject(),
      first = await runMTProject(p, undefined, fast);
    p.fixtures.forEach((f, i) => {
      f.expectation = mtRecordedExpectation(first[i]);
    });
    expect(
      (await runMTProject(p, undefined, fast)).every((r) => r.matched),
    ).toBe(true);
    p.fixtures[1].checks.find((c) => c.id === "body")!.enabled = false;
    expect((await runMTProject(p, undefined, fast))[1].matched).toBe(false);
    p.maxMutants = 1;
    expect((await runMTProject(p, undefined, fast))[0].matched).toBe(false);
  });
  it("cancels cooperatively without publishing partial runs", async () => {
    const abort = new AbortController();
    await expect(
      runMTProject(demoMTProject(), undefined, {
        signal: abort.signal,
        yield: async () => {
          abort.abort();
        },
      }),
    ).rejects.toThrow("cancelled");
  });
  it("enforces the total mutant work cap before evaluation", async () => {
    const p = only(
      "array-drop",
      JSON.stringify(Array.from({ length: 200 }, (_, i) => i)),
    );
    p.fixtures = Array.from({ length: MT_LIMITS.fixtures }, (_, i) => ({
      ...p.fixtures[0],
      id: `fixture-${i}`,
    }));
    await expect(runMTProject(p, undefined, fast)).rejects.toThrow("limit");
  });
  it("omits bodies, header values, assertion literals and replacements from reports", async () => {
    const p = only("string-change", '{"secret":"PRIVATE_BODY_VALUE"}');
    p.fixtures[0].response.headers["x-secret"] = "PRIVATE_HEADER_VALUE";
    const report = JSON.stringify(
      mtReport(await runMTProject(p, undefined, fast)),
    );
    expect(report).not.toMatch(
      /PRIVATE_BODY_VALUE|PRIVATE_HEADER_VALUE|"replacement"\s*:|"expected"\s*:|"body"\s*:/,
    );
  });
});
