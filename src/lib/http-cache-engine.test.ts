import { describe, expect, it } from "vitest";
import { runCacheProject, cacheRunReport } from "./http-cache-engine";
import {
  defaultCacheStep,
  emptyCacheProject,
  type CacheStep,
} from "./http-cache-project";
import { demoCacheProject } from "./http-cache-demo";
const project = (steps: CacheStep[]) => {
  const p = emptyCacheProject();
  p.policies = [p.policies[0]];
  p.scenarios[0].steps = steps;
  return p;
};
const request = (
  id: string,
  atMs: number,
  options: Partial<CacheStep> = {},
): CacheStep => ({ ...defaultCacheStep(id, atMs), ...options });
const origin = (
  control: string,
  extra = {},
  status = 200,
  body = "payload",
  delayMs = 0,
): CacheStep["origin"] => ({
  kind: "response",
  status,
  body,
  headers: { "cache-control": control, ...extra },
  delayMs,
});
const rows = (steps: CacheStep[]) =>
  runCacheProject(project(steps)).simulations[0].rows;
describe("offline HTTP cache engine", () => {
  it.each([206, 471, 599])(
    "does not store unsupported status %s despite explicit cacheability",
    (status) => {
      const r = rows([
        request("a", 0, { origin: origin("public, max-age=60", {}, status) }),
        request("b", 1000, { origin: null }),
      ]);
      expect(r[0]).toMatchObject({ status, stored: false });
      expect(r[0].notes).toContain("status");
      expect(r[1].outcome).toBe("error");
    },
  );
  it("requires valid selections instead of producing a misleading empty run", () => {
    expect(() =>
      runCacheProject(project([request("a", 0)]), { policyId: "missing" }),
    ).toThrow("project");
    expect(() =>
      runCacheProject(project([request("a", 0)]), { scenarioId: "missing" }),
    ).toThrow("project");
  });
  it("honors Pragma no-cache for revalidation and stale fallback when Cache-Control is absent", () => {
    const r = rows([
      request("a", 0, {
        origin: origin("max-age=1, stale-if-error=60", { etag: '"v1"' }),
      }),
      request("b", 3000, {
        headers: { pragma: "no-cache" },
        origin: { kind: "network-error", delayMs: 0 },
      }),
    ]);
    expect(r[1]).toMatchObject({
      outcome: "error",
      conditional: { "if-none-match": '"v1"' },
    });
  });
  it("tracks real LRU access, retaining a recently hit entry instead of the oldest insertion", () => {
    const p = project([
      request("a", 0, { origin: origin("max-age=60") }),
      request("b", 1000, {
        url: "https://cache.example/b",
        origin: origin("max-age=60"),
      }),
      request("hit-a", 2000, { origin: null }),
      request("c", 3000, {
        url: "https://cache.example/c",
        origin: origin("max-age=60"),
      }),
      request("still-a", 4000, { origin: null }),
    ]);
    p.policies[0].capacity = 2;
    const result = runCacheProject(p).simulations[0];
    expect(result.rows[4].outcome).toBe("fresh");
    expect(result.entries.map((e) => e.url)).toEqual([
      "https://cache.example/items",
      "https://cache.example/c",
    ]);
  });
  it("does not mutate input fixtures and serializes overlapping scheduled requests", () => {
    const p = project([
      request("a", 0, { origin: origin("max-age=0", {}, 200, "one", 2000) }),
      request("b", 1000, { origin: origin("max-age=60", {}, 200, "two", 100) }),
    ]);
    const original = JSON.stringify(p),
      result = runCacheProject(p).simulations[0];
    expect(JSON.stringify(p)).toBe(original);
    expect(result.rows[1]).toMatchObject({ atMs: 2000, completedMs: 2100 });
    expect(result.metrics.totalWaitMs).toBe(2100);
  });
  it("uses Last-Modified alone for revalidation and rejects inconsistent metadata", () => {
    const modified = "Wed, 31 Dec 2025 00:00:00 GMT";
    const seed = request("a", 0, {
      origin: origin("max-age=0", { "last-modified": modified }),
    });
    expect(
      rows([
        seed,
        request("b", 1000, { origin: origin("max-age=60", {}, 304, "") }),
      ])[1],
    ).toMatchObject({
      outcome: "revalidated",
      conditional: { "if-modified-since": modified },
    });
    expect(
      rows([
        seed,
        request("b", 1000, {
          origin: origin(
            "max-age=60",
            { "last-modified": "Thu, 01 Jan 2026 00:00:00 GMT" },
            304,
            "",
          ),
        }),
      ])[1].outcome,
    ).toBe("error");
  });
  it("passes every demo scenario for both private and shared caches without network access", () => {
    const run = runCacheProject(demoCacheProject());
    expect(run.simulations).toHaveLength(10);
    expect(
      run.simulations.map((s) => [
        s.scenarioId,
        s.policyId,
        s.rows.map((r) => [r.outcome, r.status]),
        s.passed,
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          "freshness",
          "private",
          expect.any(Array),
          true,
        ]),
      ]),
    );
    expect(run.simulations.every((s) => s.passed)).toBe(true);
    expect(run).toEqual(runCacheProject(demoCacheProject()));
  });
  it("serves fresh bodies with increasing Age and never consumes unused origin fixtures", () => {
    const r = rows([
      request("a", 0, { origin: origin("max-age=60", { etag: '"v1"' }) }),
      request("b", 10000, { origin: { kind: "network-error", delayMs: 500 } }),
    ]);
    expect(r[1]).toMatchObject({
      outcome: "fresh",
      body: "payload",
      headers: { age: "10" },
      originUsed: false,
      completedMs: 10000,
      cacheBodyBytes: 7,
    });
  });
  it("separates Vary variants, including an absent versus an explicitly empty header", () => {
    const r = rows([
      request("a", 0, { origin: origin("max-age=60", { vary: "X-Language" }) }),
      request("b", 1000, {
        headers: { "x-language": "" },
        origin: origin("max-age=60", { vary: "X-Language" }, 200, "empty"),
      }),
      request("c", 2000, { origin: null }),
    ]);
    expect(r[1].notes).toContain("vary-miss");
    expect(r[2]).toMatchObject({
      outcome: "fresh",
      body: "payload",
      entries: 2,
    });
  });
  it("revalidates with both validators and retains the original body and status after 304", () => {
    const modified = "Wed, 31 Dec 2025 00:00:00 GMT";
    const r = rows([
      request("a", 0, {
        origin: origin("max-age=1", {
          etag: 'W/"v1"',
          "last-modified": modified,
        }),
      }),
      request("b", 2000, {
        origin: origin(
          "max-age=90",
          { etag: '"v1"', "content-length": "0" },
          304,
          "",
        ),
      }),
      request("c", 3000, { origin: null }),
    ]);
    expect(r[1]).toMatchObject({
      outcome: "revalidated",
      status: 200,
      body: "payload",
      conditional: { "if-none-match": 'W/"v1"', "if-modified-since": modified },
      originBodyBytes: 0,
    });
    expect(r[1].headers["content-length"]).toBeUndefined();
    expect(r[2].outcome).toBe("fresh");
  });
  it("resets an old upstream Age and Date when a 304 omits them", () => {
    const r = rows([
      request("a", 0, {
        origin: origin("max-age=60", {
          etag: '"v1"',
          age: "90",
          date: "Wed, 31 Dec 2025 00:00:00 GMT",
        }),
      }),
      request("b", 1000, { origin: origin("max-age=120", {}, 304, "") }),
      request("c", 2000, { origin: null }),
    ]);
    expect(r[1].freshness?.ageMs).toBe(0);
    expect(r[2]).toMatchObject({ outcome: "fresh", headers: { age: "1" } });
  });
  it.each([null, origin("max-age=10", { etag: '"wrong"' }, 304, "")])(
    "does not invent a body for an unusable 304 or absent fixture",
    (fixture) => {
      const r = rows([
        request("a", 0, { origin: origin("max-age=0", { etag: '"v1"' }) }),
        request("b", 1000, { origin: fixture }),
      ]);
      expect(r[1]).toMatchObject({
        outcome: "error",
        body: "",
        status: 0,
        passed: false,
      });
    },
  );
  it("rejects a 304 without a stored representation or without a generated validator", () => {
    expect(
      rows([request("a", 0, { origin: origin("max-age=10", {}, 304, "") })])[0]
        .notes,
    ).toContain("invalid-304");
    expect(
      rows([
        request("a", 0, { origin: origin("max-age=0") }),
        request("b", 1000, { origin: origin("max-age=10", {}, 304, "") }),
      ])[1].outcome,
    ).toBe("error");
  });
  it.each(["no-store", "max-age=60, max-age=120"])(
    "does not store %s",
    (control) => {
      const r = rows([
        request("a", 0, { origin: origin(control) }),
        request("b", 1000, { origin: null }),
      ]);
      expect(r[0].stored).toBe(false);
      expect(r[1].outcome).toBe("error");
    },
  );
  it("stores no-cache but validates every reuse even while fresh", () => {
    const r = rows([
      request("a", 0, {
        origin: origin('no-cache="X-Secret", max-age=60', { etag: '"v1"' }),
      }),
      request("b", 1000, {
        origin: origin("no-cache, max-age=60", {}, 304, ""),
      }),
    ]);
    expect(r[0].stored).toBe(true);
    expect(r[1].outcome).toBe("revalidated");
  });
  it("distinguishes private responses and authorization permissions in shared caches", () => {
    const p = project([
      request("a", 0, {
        headers: { authorization: "Bearer token" },
        origin: origin("max-age=60"),
      }),
      request("b", 1000, {
        headers: { authorization: "Bearer token" },
        origin: origin("max-age=60"),
      }),
    ]);
    p.policies.push({ ...p.policies[0], id: "shared", mode: "shared" });
    const run = runCacheProject(p);
    expect(run.simulations[0].rows[1].outcome).toBe("fresh");
    expect(run.simulations[1].rows[0].notes).toContain("authorization");
    p.scenarios[0].steps[0].origin = origin("public, max-age=60");
    expect(runCacheProject(p).simulations[1].rows[1].outcome).toBe("fresh");
  });
  it("never serves a public-request entry to an authorized shared request without permission", () => {
    const p = project([
      request("a", 0, { origin: origin("max-age=60") }),
      request("b", 1000, {
        headers: { authorization: "Bearer token" },
        origin: origin("no-store", {}, 200, "personal"),
      }),
    ]);
    p.policies[0].mode = "shared";
    expect(runCacheProject(p).simulations[0].rows[1]).toMatchObject({
      outcome: "miss",
      body: "personal",
    });
  });
  it("supports bounded max-stale and cache-only 504 without contacting the origin", () => {
    const r = rows([
      request("a", 0, { origin: origin("max-age=1") }),
      request("b", 2000, {
        headers: { "cache-control": "max-stale=2, only-if-cached" },
        origin: null,
      }),
      request("c", 5000, {
        headers: { "cache-control": "max-stale=2, only-if-cached" },
        origin: origin("max-age=60"),
      }),
    ]);
    expect(r[1].outcome).toBe("stale");
    expect(r[2]).toMatchObject({
      outcome: "only-if-cached",
      status: 504,
      originUsed: false,
    });
  });
  it.each(["no-cache", "must-revalidate", "proxy-revalidate", "s-maxage=1"])(
    "shared %s blocks stale fallback and max-stale",
    (directive) => {
      const p = project([
        request("a", 0, {
          origin: origin(`max-age=1, stale-if-error=60, ${directive}`),
        }),
        request("b", 3000, {
          headers: { "cache-control": "max-stale" },
          origin: { kind: "network-error", delayMs: 0 },
        }),
      ]);
      p.policies[0].mode = "shared";
      expect(runCacheProject(p).simulations[0].rows[1].outcome).toBe("error");
    },
  );
  it("checks stale-if-error at response completion rather than request start", () => {
    const r = rows([
      request("a", 0, { origin: origin("max-age=1, stale-if-error=2") }),
      request("b", 2000, {
        origin: origin("no-store", {}, 503, "failed", 2000),
      }),
    ]);
    expect(r[1]).toMatchObject({ status: 503, outcome: "miss" });
  });
  it.each(["no-cache", "max-age=1", "min-fresh=60"])(
    "honors the request %s constraint",
    (directive) => {
      const r = rows([
        request("a", 0, { origin: origin("max-age=60", { etag: '"v1"' }) }),
        request("b", 2000, {
          headers: { "cache-control": directive },
          origin: origin("max-age=60", {}, 304, ""),
        }),
      ]);
      expect(r[1].outcome).toBe("revalidated");
    },
  );
  it("bypasses range, client preconditions, and no-store without altering existing entries", () => {
    const r = rows([
      request("a", 0, { origin: origin("max-age=60") }),
      request("b", 1000, {
        headers: { "cache-control": "no-store" },
        origin: origin("max-age=60", {}, 200, "new"),
      }),
      request("c", 2000, {
        headers: { range: "bytes=0-1" },
        origin: origin("max-age=60", {}, 206, "pa"),
      }),
      request("d", 3000, { origin: null }),
    ]);
    expect(r.slice(1, 3).map((v) => v.outcome)).toEqual(["bypass", "bypass"]);
    expect(r[3]).toMatchObject({ outcome: "fresh", body: "payload" });
  });
  it("invalidates all target variants and same-origin Location resources after successful writes", () => {
    const p = project([
      request("a", 0, { origin: origin("max-age=60") }),
      request("b", 1000, {
        url: "https://cache.example/other",
        origin: origin("max-age=60"),
      }),
      request("c", 2000, {
        method: "PATCH",
        origin: origin("", { location: "/other" }, 204, ""),
      }),
      request("d", 3000, { origin: null }),
    ]);
    const r = runCacheProject(p).simulations[0].rows;
    expect(r[2]).toMatchObject({
      outcome: "bypass",
      invalidated: 2,
      entries: 0,
    });
    expect(r[3].outcome).toBe("error");
  });
  it("does not invalidate cross-origin URLs or invalidate after a failed write", () => {
    const r = rows([
      request("a", 0, { origin: origin("max-age=60") }),
      request("b", 1000, { method: "DELETE", origin: origin("", {}, 500) }),
      request("c", 2000, {
        url: "https://other.test/write",
        method: "POST",
        origin: origin(
          "",
          { location: "https://cache.example/items" },
          204,
          "",
        ),
      }),
      request("d", 3000, { origin: null }),
    ]);
    expect(r[3].outcome).toBe("fresh");
  });
  it("enforces LRU capacity and body size without partially admitting a response", () => {
    const p = project([
      request("a", 0),
      request("b", 1000, { url: "https://cache.example/other" }),
      request("c", 2000, { origin: null }),
    ]);
    p.policies[0].capacity = 1;
    const simulation = runCacheProject(p).simulations[0];
    expect(simulation.metrics.evictions).toBe(1);
    expect(simulation.rows[2].outcome).toBe("error");
    p.policies[0].maxBodyBytes = 1;
    expect(runCacheProject(p).simulations[0].rows[0].notes).toContain(
      "body-limit",
    );
  });
  it("removes obsolete variant families when an origin changes Vary", () => {
    const r = rows([
      request("a", 0, { origin: origin("max-age=0", { vary: "X-A" }) }),
      request("b", 1000, { origin: origin("max-age=60", { vary: "X-B" }) }),
    ]);
    expect(r[1].entries).toBe(1);
  });
  it("runs isolated what-if policies, evaluates budgets, and excludes raw values from reports", () => {
    const p = project([
      request("a", 0, {
        url: "https://secret.test/?key=private-query",
        headers: { authorization: "private-request" },
        origin: origin(
          "no-store",
          { etag: '"private-validator"' },
          200,
          "private-body",
        ),
      }),
      request("b", 1000, {
        url: "https://secret.test/?key=private-query",
        origin: origin("no-store"),
      }),
    ]);
    p.policies.push({
      ...p.policies[0],
      id: "candidate",
      responseCacheControl: "max-age=60",
    });
    p.scenarios[0].budgets.maxOriginRequests = 1;
    const run = runCacheProject(p),
      report = cacheRunReport(run);
    expect(run.simulations.map((s) => s.metrics.hits)).toEqual([0, 1]);
    expect(run.simulations.map((s) => s.passed)).toEqual([false, true]);
    for (const sensitive of [
      "secret.test",
      "private-query",
      "private-request",
      "private-validator",
      "private-body",
      "max-age=60",
    ])
      expect(report).not.toContain(sensitive);
    expect(JSON.parse(report).simulations[1].overrideApplied).toBe(true);
  });
});
