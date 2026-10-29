import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-engine";
import {
  MAX_RATE_BYTES,
  MAX_RATE_HISTORY,
  emptyRateProject,
  newRateRule,
  newRateRequest,
  newRateScenario,
  normalizeRateProject,
  parseRateProject,
  serializeRateProject,
  type RateAlgorithm,
  type RatePolicy,
} from "./rate-project";
import {
  demoRateProject,
  generateRateSchedule,
  importRateHar,
  rateRunReport,
  runRateProject,
  runRateMatrix,
} from "./rate-studio";
const identity = (
  client = "client-a",
  cost = 1,
  route = "/orders",
  method = "GET",
) => ({ client, cost, route, method });
const policy = (algorithm: RateAlgorithm = "token"): RatePolicy => ({
  id: "test",
  name: "Test",
  rules: [newRateRule("rule", algorithm)],
});
describe("exact rate-limit algorithms", () => {
  it("compares all sixteen demo policy/scenario combinations against explicit outcomes", () => {
    const runs = runRateProject(demoRateProject());
    expect(runs).toHaveLength(16);
    expect(runs.map((r) => [r.policyId, r.scenarioId, r.passed])).toEqual(
      runs.map((r) => [r.policyId, r.scenarioId, true]),
    );
    expect(
      runs.find((r) => r.policyId === "fixed" && r.scenarioId === "boundary")!
        .accepted,
    ).toBe(7);
    expect(
      runs.find((r) => r.policyId === "token" && r.scenarioId === "boundary")!
        .limited,
    ).toBe(2);
  });
  it("keeps fractional token credit exact across repeated denials", () => {
    const p = policy();
    p.rules[0].limit = 1;
    p.rules[0].refillMs = 3;
    const limiter = createRateLimiter(p);
    expect(limiter.take(identity(), 0).allowed).toBe(true);
    expect(limiter.take(identity(), 1)).toMatchObject({
      allowed: false,
      retryAfterMs: 2,
    });
    expect(limiter.take(identity(), 2)).toMatchObject({
      allowed: false,
      retryAfterMs: 1,
    });
    expect(limiter.take(identity(), 3).allowed).toBe(true);
  });
  it("preserves fractional credit after partial spends and clamps idle refill to capacity", () => {
    const p = policy();
    p.rules[0].refillTokens = 2;
    p.rules[0].refillMs = 3;
    const limiter = createRateLimiter(p);
    expect(limiter.take(identity("a", 3), 0).allowed).toBe(true);
    expect(limiter.take(identity("a"), 1).retryAfterMs).toBe(1);
    expect(limiter.take(identity("a"), 2).rules[0].remaining).toBe(0);
    expect(limiter.take(identity("a"), 3).allowed).toBe(true);
    expect(limiter.take(identity("a"), 100000).rules[0].remaining).toBe(2);
  });
  it("resets fixed windows at exact epoch-aligned boundaries", () => {
    const limiter = createRateLimiter(policy("fixed"));
    expect(limiter.take(identity("a", 3), 999).allowed).toBe(true);
    expect(limiter.take(identity("a", 3), 1000).allowed).toBe(true);
    expect(limiter.take(identity("a"), 1001).retryAfterMs).toBe(999);
  });
  it("uses weighted rolling costs and expires records exactly at the rolling boundary", () => {
    const p = policy("sliding");
    p.rules[0].limit = 5;
    const limiter = createRateLimiter(p);
    limiter.take(identity("a", 2), 0);
    limiter.take(identity("a", 2), 100);
    expect(limiter.take(identity("a", 2), 150)).toMatchObject({
      outcome: "limited",
      retryAfterMs: 850,
    });
    expect(limiter.take(identity("a", 3), 1000)).toMatchObject({
      allowed: true,
      rules: [{ remaining: 0, history: 2 }],
    });
  });
  it.each(["token", "fixed", "sliding"] as const)(
    "handles impossible costs without inventing a finite retry for %s",
    (algorithm) => {
      const limiter = createRateLimiter(policy(algorithm));
      expect(limiter.take(identity("a", 4), 0)).toMatchObject({
        allowed: false,
        outcome: "limited",
        retryAfterMs: null,
        rules: [{ reason: "cost", keys: 0, charged: false }],
      });
      expect(limiter.take(identity("a", 3), 0).allowed).toBe(true);
    },
  );
  it("charges global and per-client quotas atomically and never reserves a rejected identity", () => {
    const p = policy();
    p.rules[0].limit = 1;
    p.rules.push({
      ...newRateRule("global", "fixed"),
      scope: "global",
      limit: 1,
    });
    const limiter = createRateLimiter(p);
    expect(limiter.take(identity("a"), 0).allowed).toBe(true);
    const refused = limiter.take(identity("b"), 500);
    expect(refused.allowed).toBe(false);
    expect(refused.rules[0]).toMatchObject({
      wouldAllow: true,
      charged: false,
      remaining: 1,
      keys: 1,
    });
    expect(limiter.take(identity("b"), 1000).allowed).toBe(true);
  });
  it("combines retry lower bounds across all blocking rules", () => {
    const p = policy("fixed");
    p.rules[0].limit = 1;
    p.rules.push({
      ...newRateRule("other", "sliding"),
      limit: 1,
      windowMs: 2000,
    });
    const limiter = createRateLimiter(p);
    limiter.take(identity(), 0);
    expect(limiter.take(identity(), 500).retryAfterMs).toBe(1500);
  });
  it.each(["token", "fixed", "sliding"] as const)(
    "bounds key cardinality without evicting quota debt for %s",
    (algorithm) => {
      const p = policy(algorithm);
      p.rules[0].keyCapacity = 1;
      const limiter = createRateLimiter(p);
      limiter.take(identity("a"), 0);
      expect(limiter.take(identity("b"), 1)).toMatchObject({
        outcome: "capacity",
        retryAfterMs: 999,
        rules: [{ reason: "key-capacity", keys: 1 }],
      });
      expect(limiter.take(identity("b"), 1000).allowed).toBe(true);
    },
  );
  it("bounds rolling history and coalesces same-millisecond admissions", () => {
    const p = policy("sliding");
    p.rules[0].limit = 10000;
    p.rules[0].windowMs = 10000;
    const limiter = createRateLimiter(p);
    for (let n = 0; n < MAX_RATE_HISTORY; n++)
      expect(limiter.take(identity(), n).allowed).toBe(true);
    expect(
      limiter.take(identity(), MAX_RATE_HISTORY - 1).rules[0].history,
    ).toBe(MAX_RATE_HISTORY);
    expect(limiter.take(identity(), MAX_RATE_HISTORY)).toMatchObject({
      outcome: "capacity",
      rules: [{ reason: "history-capacity" }],
    });
    expect(limiter.take(identity(), 10000).allowed).toBe(true);
  });
  it("distinguishes global, client, route and client-route scopes with unambiguous tuple keys", () => {
    for (const scope of [
      "global",
      "client",
      "route",
      "client-route",
    ] as const) {
      const p = policy("fixed");
      p.rules[0].scope = scope;
      p.rules[0].limit = 1;
      const limiter = createRateLimiter(p);
      limiter.take(identity("a"), 0);
      expect(limiter.take(identity("b"), 0).allowed).toBe(
        scope === "client" || scope === "client-route",
      );
    }
    const p = policy("fixed");
    p.rules[0].scope = "client-route";
    p.rules[0].limit = 1;
    const limiter = createRateLimiter(p);
    limiter.take(identity("a,b", 1, "c"), 0);
    expect(limiter.take(identity("a", 1, "b,c"), 0).allowed).toBe(true);
    expect(limiter.take(identity("a", 1, "b,c", "POST"), 0).allowed).toBe(true);
  });
  it("treats disabled or unmatched rules as an explicit uncharged bypass", () => {
    const p = policy();
    p.rules[0].matchRoute = "/limited";
    p.rules[0].matchMethod = "POST";
    const limiter = createRateLimiter(p);
    expect(limiter.take(identity(), 0)).toEqual({
      allowed: true,
      outcome: "unmatched",
      retryAfterMs: 0,
      rules: [],
    });
    p.rules[0].enabled = false;
    expect(
      createRateLimiter(p).take(identity("a", 1, "/limited", "POST"), 0)
        .outcome,
    ).toBe("unmatched");
  });
  it("rejects backwards/invalid clocks and malformed demands, and supports explicit reset", () => {
    const limiter = createRateLimiter(policy());
    limiter.take(identity(), 100);
    expect(() => limiter.take(identity(), 99)).toThrow("clock");
    expect(() => limiter.take(identity(), NaN)).toThrow("clock");
    expect(() => limiter.take(identity("", 1), 100)).toThrow("request");
    expect(() => limiter.take(identity("a", 0), 100)).toThrow("request");
    limiter.reset();
    expect(limiter.take(identity(), 0).allowed).toBe(true);
  });
});
describe("rate-limit projects, budgets and imports", () => {
  it("sorts arrivals stably, isolates policy/scenario state and supports outcome expectations", () => {
    const p = emptyRateProject(),
      scenario = p.scenarios[0];
    scenario.requests = [
      { ...scenario.requests[0], id: "late", atMs: 1000 },
      { ...scenario.requests[0], id: "first", atMs: 0, cost: 3 },
      {
        ...scenario.requests[0],
        id: "second",
        atMs: 0,
        expect: { "policy-1": "limited" },
      },
    ];
    const first = runRateProject(p)[0];
    expect(first.rows.map((r) => r.request.id)).toEqual([
      "first",
      "second",
      "late",
    ]);
    expect(first.passed).toBe(true);
    expect(runRateProject(p)).toEqual(runRateProject(p));
  });
  it("checks unmatched coverage, capacity and finite retry budgets without treating zero as disabled", () => {
    const p = emptyRateProject();
    p.policies[0].rules[0].enabled = false;
    expect(
      runRateProject(p)[0].checks.find((c) => c.code === "maxUnmatched")!
        .passed,
    ).toBe(false);
    p.policies[0].rules[0].enabled = true;
    p.scenarios[0].requests[0].cost = 4;
    p.scenarios[0].budgets.maxRetryMs = 10000;
    expect(
      runRateProject(p)[0].checks.find((c) => c.code === "maxRetryMs"),
    ).toMatchObject({ value: null, passed: false, checked: true });
    p.scenarios[0].budgets.maxRetryMs = null;
    expect(
      runRateProject(p)[0].checks.find((c) => c.code === "maxRetryMs"),
    ).toMatchObject({ checked: false, passed: true });
  });
  it("round-trips portable source data and drops injected results/runtime state", () => {
    const p = demoRateProject();
    expect(parseRateProject(serializeRateProject(p))).toEqual(p);
    expect(
      parseRateProject(
        JSON.stringify({
          ...p,
          results: [{ passed: true }],
          state: { private: "secret" },
        }),
      ),
    ).toEqual(p);
    expect(() =>
      normalizeRateProject({ ...p, policies: [p.policies[0], p.policies[0]] }),
    ).toThrow("project");
    expect(() => normalizeRateProject({ ...p, version: "1" })).toThrow(
      "project",
    );
    expect(() =>
      normalizeRateProject({
        ...p,
        policies: [
          {
            ...p.policies[0],
            rules: [{ ...p.policies[0].rules[0], algorithm: ["token"] }],
          },
        ],
      }),
    ).toThrow("project");
    expect(() => parseRateProject(" ".repeat(MAX_RATE_BYTES + 1))).toThrow(
      "limit",
    );
  });
  it("projects reports without client or route identities, including scoped rule keys", () => {
    const p = emptyRateProject();
    p.scenarios[0].requests[0].client = "private-client-value";
    p.scenarios[0].requests[0].route = "/private/route/value";
    const source = rateRunReport(runRateProject(p));
    expect(source).not.toContain("private-client-value");
    expect(source).not.toContain("/private/route/value");
    expect(JSON.parse(source).simulations[0].clients[0].index).toBe(0);
    expect(JSON.parse(source).simulations[0].rows).toBeUndefined();
    const detailed = rateRunReport(runRateProject(p), true);
    expect(JSON.parse(detailed).simulations[0].rows).toHaveLength(1);
    expect(detailed).not.toContain("private-client-value");
  });
  it("cancels matrices without returning partial results and preserves a snapshot during asynchronous work", async () => {
    const p = demoRateProject();
    let stopped = false;
    await expect(
      runRateMatrix(
        p,
        undefined,
        () => stopped,
        () => {
          stopped = true;
        },
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
    const expected = runRateProject(p),
      pending = runRateMatrix(p);
    p.policies[0].rules[0].limit = 10000;
    p.scenarios[0].requests[0].cost = 10000;
    expect(await pending).toEqual(expected);
  });
  it("round-trips projects near the byte limit with compact serialization and refuses oversized edits", () => {
    const p = emptyRateProject();
    p.scenarios = Array.from({ length: 8 }, (_, n) => ({
      ...newRateScenario(`s-${n}`),
      requests: Array.from({ length: 300 }, (_, i) => newRateRequest(`r-${i}`)),
    }));
    let remaining =
      MAX_RATE_BYTES - 64 - new TextEncoder().encode(JSON.stringify(p)).length;
    for (const scenario of p.scenarios)
      for (const request of scenario.requests) {
        if (!remaining) break;
        const growth = Math.min(remaining, 1499),
          encoded = growth + request.route.length;
        // Replace the original ASCII route with an exactly sized escaped JSON string.
        const controls = Math.floor(encoded / 6),
          ascii = encoded % 6;
        request.route = "\u0001".repeat(controls) + "x".repeat(ascii);
        remaining -= growth;
      }
    expect(remaining).toBe(0);
    const source = serializeRateProject(p);
    expect(new TextEncoder().encode(source).length).toBe(MAX_RATE_BYTES - 64);
    expect(source).toBe(JSON.stringify(p));
    expect(parseRateProject(source)).toEqual(p);
    expect(() => normalizeRateProject({ ...p, name: "x".repeat(120) })).toThrow(
      "limit",
    );
  });
  it("refuses invalid calendar dates and oversized usable HAR schedules atomically", () => {
    const p = emptyRateProject(),
      entry = (date: string) => ({
        startedDateTime: date,
        request: { method: "GET", url: "https://example.test/items" },
      });
    expect(() =>
      importRateHar(
        p,
        JSON.stringify({ log: { entries: [entry("2026-02-30T00:00:00Z")] } }),
      ),
    ).toThrow("har");
    expect(() =>
      importRateHar(
        p,
        JSON.stringify({
          log: {
            entries: Array.from({ length: 301 }, () =>
              entry("2026-01-01T00:00:00Z"),
            ),
          },
        }),
      ),
    ).toThrow("limit");
    expect(p.scenarios).toHaveLength(1);
  });
  it("generates deterministic weighted traffic with round-robin clients and exact spacing", () => {
    const rows = generateRateSchedule(5, 100, 2, "/orders/{id}", "POST", 3);
    expect(rows.map((r) => [r.atMs, r.client, r.cost])).toEqual([
      [0, "client-1", 3],
      [100, "client-2", 3],
      [200, "client-1", 3],
      [300, "client-2", 3],
      [400, "client-1", 3],
    ]);
    expect(() => generateRateSchedule(301, 0, 1, "/", "GET", 1)).toThrow(
      "project",
    );
  });
  it("imports relative HAR traffic while discarding origins, queries, credentials and response/body data", () => {
    const p = emptyRateProject(),
      capture = {
        log: {
          entries: [
            {
              startedDateTime: "2026-10-01T00:00:01Z",
              request: {
                method: "GET",
                url: "https://private.example/orders?id=SECRET",
                headers: [{ name: "Authorization", value: "Bearer SECRET" }],
              },
              response: { content: { text: "PRIVATE BODY" } },
            },
            {
              startedDateTime: "2026-10-01T00:00:00Z",
              request: {
                method: "POST",
                url: "https://private.example/create",
              },
            },
            { request: { method: "GET", url: "not a URL" } },
          ],
        },
      };
    const result = importRateHar(p, JSON.stringify(capture));
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.project.scenarios[1].requests.map((r) => r.atMs)).toEqual([
      1000, 0,
    ]);
    const source = serializeRateProject(result.project);
    for (const secret of [
      "private.example",
      "SECRET",
      "PRIVATE BODY",
      "2026-10",
    ])
      expect(source).not.toContain(secret);
    expect(p.scenarios).toHaveLength(1);
  });
});
