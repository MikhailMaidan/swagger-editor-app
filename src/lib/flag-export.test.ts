import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { generateFlagToolkit } from "./flag-export";
import { createFlagEvaluator, type FlagDecision } from "./flag-engine";
import { demoFlagProject } from "./flag-studio";
import {
  emptyFlagProject,
  type FlagDefinition,
  type FlagContext,
} from "./flag-model";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function artifact(d: FlagDefinition = emptyFlagProject().definition) {
  const source = generateFlagToolkit(d),
    e = (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      createFlagClient: () => {
        evaluate: (id: string, c: unknown) => Promise<FlagDecision>;
        evaluateAll: (c: unknown) => Promise<FlagDecision[]>;
      };
    };
  return { source, ...e };
}
describe("standalone feature-flag SDK", () => {
  it("executes native ESM with complete decision-trace parity for all demo cases and typed variants", async () => {
    const p = demoFlagProject(),
      e = await artifact(p.definition),
      client = e.createFlagClient(),
      core = createFlagEvaluator(p.definition);
    for (const c of p.cases) {
      const expected = await core(c.context);
      expect(await client.evaluateAll(c.context)).toEqual(expected);
      for (const d of expected)
        expect(await client.evaluate(d.flagId, c.context)).toEqual(d);
    }
  });
  it("matches seeded contexts, ordered targeting, schedules and independent percentage/variant buckets", async () => {
    const p = demoFlagProject(),
      e = await artifact(p.definition),
      client = e.createFlagClient(),
      core = createFlagEvaluator(p.definition);
    let seed = 81;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 100; i++) {
      const c: FlagContext = {
        key: `generated-${random()}`,
        attributes: {
          plan: ["pro", "free", "enterprise"][random() % 3],
          staff: random() % 3 === 0,
          blocked: random() % 7 === 0,
          score: random() % 10,
        },
        nowMs: [999, 1000, 2000, 10000][random() % 4],
      };
      expect(await client.evaluateAll(c)).toEqual(await core(c));
    }
  });
  it("rejects malformed/deep/sparse contexts and unknown flags without silently serving a fallback", async () => {
    const p = demoFlagProject(),
      e = await artifact(p.definition),
      client = e.createFlagClient(),
      c = p.cases[0].context;
    for (const bad of [
      { ...c, key: "" },
      { ...c, nowMs: -1 },
      { ...c, attributes: [] },
      { ...c, attributes: { sparse: new Array(1) } },
    ])
      await expect(client.evaluateAll(bad)).rejects.toThrow();
    await expect(client.evaluate("missing", c)).rejects.toThrow("reference");
    vi.stubGlobal("crypto", {});
    await expect(client.evaluateAll(c)).rejects.toThrow("crypto");
  });
  it("snapshots contexts before asynchronous hashing and returns defensive typed values", async () => {
    const p = demoFlagProject(),
      e = await artifact(p.definition),
      client = e.createFlagClient(),
      c = structuredClone(p.cases[0].context),
      pending = client.evaluateAll(c);
    c.attributes.plan = "free";
    const rows = await pending;
    expect(rows.find((r) => r.flagId === "theme")!.served).toBe(true);
    rows.find((r) => r.flagId === "limits")!.value = { leaked: true };
    expect((await client.evaluate("limits", p.cases[0].context)).value).toEqual(
      { rate: 10 },
    );
  });
  it("escapes embedded metadata and contains no subject fixtures, candidate definitions or persistence/network calls", async () => {
    const p = demoFlagProject();
    p.definition.flags[0].name = "</script>\u2028\u2029";
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    const e = await artifact(p.definition);
    expect(e.source).not.toContain("</script>");
    expect(e.source).not.toContain("\u2028");
    expect(e.source).not.toMatch(
      /enterprise-2|staff-1|case-1|localStorage|fetch\(/,
    );
    expect(e.source).toContain('"rolloutPpm":500000');
    await e.createFlagClient().evaluateAll(p.cases[0].context);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
});
