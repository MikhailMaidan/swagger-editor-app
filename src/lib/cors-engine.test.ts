import { describe, expect, it } from "vitest";
import { corsRunReport, runCorsProject } from "./cors-engine";
import {
  defaultCorsCase,
  emptyCorsProject,
  type CorsCase,
} from "./cors-project";
import { demoCorsProject } from "./cors-demo";
const c = (
  id: string,
  atMs: number,
  change: Partial<CorsCase> = {},
): CorsCase => ({ ...defaultCorsCase(id, atMs), ...change });
const project = (cases: CorsCase[]) => {
  const p = emptyCorsProject();
  p.policies = [p.policies[0]];
  p.scenarios[0].cases = cases;
  return p;
};
const rows = (cases: CorsCase[]) =>
  runCorsProject(project(cases)).simulations[0].rows;
describe("offline CORS replay", () => {
  it("removes grants that expired during a preflight before enforcing capacity", () => {
    const second = c("other", 500, {
      method: "PUT",
      url: "https://api.example/other",
    });
    second.preflight.delayMs = 800;
    const p = project([c("first", 0, { method: "PUT" }), second]);
    p.maxAgeCap = 1;
    p.cacheCapacity = 10;
    expect(runCorsProject(p).simulations[0].rows[1].evicted).toBe(0);
  });
  it("replays the demo deterministically with ten passing policy/scenario combinations", () => {
    const p = demoCorsProject(),
      run = runCorsProject(p);
    expect(run.simulations).toHaveLength(10);
    expect(
      run.simulations.map((s) => [
        s.scenarioId,
        s.policyId,
        s.rows.filter((r) => !r.passed).map((r) => [r.id, r.notes]),
        s.passed,
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(["cache", "trusted", [], true]),
      ]),
    );
    expect(run.simulations.every((s) => s.passed)).toBe(true);
    expect(run).toEqual(runCorsProject(p));
  });
  it("uses no preflight for simple requests or just because credentials are enabled", () => {
    const r = rows([
      c("get", 0),
      c("cookie", 1000, { credentials: "include" }),
      c("plain", 2000, {
        method: "POST",
        headers: { "content-type": "text/plain" },
      }),
    ]);
    expect(r.map((r) => r.preflight)).toEqual([
      "not-needed",
      "not-needed",
      "not-needed",
    ]);
    expect(r[1]).toMatchObject({
      ambientCredentials: true,
      requestSent: true,
      preflightCredentialsSent: false,
      outcome: "allowed",
    });
  });
  it("preflights JSON, custom methods and explicit authorization with sorted names and no credential values", () => {
    const r = rows([
      c("put", 0, {
        method: "PUT",
        credentials: "include",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
      }),
    ])[0];
    expect(r).toMatchObject({
      preflight: "sent",
      outcome: "allowed",
      preflightRequest: {
        origin: "https://app.example",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(JSON.stringify(r.preflightRequest)).not.toContain("secret");
    expect(r.preflightCredentialsSent).toBe(false);
  });
  it("reuses only matching origin, URL, partition and credential grants", () => {
    const r = rows([
      c("first", 0, { method: "PUT" }),
      c("repeat", 1000, { method: "PUT" }),
      c("credentialed", 2000, { method: "PUT", credentials: "include" }),
      c("downgrade", 3000, { method: "PUT" }),
      c("other-url", 4000, { method: "PUT", url: "https://api.example/other" }),
      c("other-partition", 5000, { method: "PUT", partition: "another-site" }),
    ]);
    expect(r.map((r) => r.preflight)).toEqual([
      "sent",
      "cached",
      "sent",
      "cached",
      "sent",
      "sent",
    ]);
  });
  it("expires grants at the exact capped boundary and permits a disabled cache", () => {
    const p = project([
      c("a", 0, { method: "PUT" }),
      c("b", 1080, { method: "PUT" }),
    ]);
    p.maxAgeCap = 1;
    expect(runCorsProject(p).simulations[0].rows[1].preflight).toBe("sent");
    p.maxAgeCap = 0;
    p.scenarios[0].cases[1].atMs = 500;
    expect(runCorsProject(p).simulations[0].rows[1].preflight).toBe("sent");
  });
  it("blocks failed preflights before the actual request or ambient credentials are attempted", () => {
    const first = c("denied", 0, { method: "PUT", credentials: "include" });
    first.preflight.status = 403;
    const r = rows([first])[0];
    expect(r).toMatchObject({
      outcome: "blocked",
      stage: "preflight",
      requestSent: false,
      ambientCredentials: false,
      scriptStatus: 0,
      networkStatus: 0,
      completedMs: 80,
    });
  });
  it("shows that response CORS failures happen after an actual request attempt", () => {
    const first = c("denied", 0, {
      method: "POST",
      headers: { "content-type": "text/plain" },
    });
    first.response.usePolicy = false;
    const r = rows([first])[0];
    expect(r).toMatchObject({
      outcome: "blocked",
      stage: "response",
      requestSent: true,
      networkStatus: 200,
      scriptStatus: 0,
      visibleHeaders: {},
      visibleBody: "",
    });
  });
  it("keeps HTTP errors readable when CORS allows them", () => {
    const first = c("http-error", 0);
    first.response.status = 500;
    expect(rows([first])[0]).toMatchObject({
      outcome: "allowed",
      scriptStatus: 500,
      networkStatus: 500,
    });
  });
  it("handles same-origin and opaque responses without exposing forbidden headers", () => {
    const same = c("same", 0, {
      origin: "https://api.example",
      credentials: "same-origin",
    });
    same.response.headers["set-cookie"] = "secret=value";
    const r = rows([same, c("opaque", 1000, { mode: "no-cors" })]);
    expect(r[0]).toMatchObject({
      outcome: "allowed",
      ambientCredentials: true,
    });
    expect(r[0].visibleHeaders["set-cookie"]).toBeUndefined();
    expect(r[1]).toMatchObject({
      outcome: "opaque",
      requestSent: true,
      scriptStatus: 0,
      visibleHeaders: {},
      visibleBody: "",
    });
  });
  it("rejects unsupported no-cors inputs and browser-controlled headers instead of silently changing them", () => {
    const r = rows([
      c("method", 0, { mode: "no-cors", method: "PATCH" }),
      c("header", 1000, {
        mode: "no-cors",
        headers: { authorization: "Bearer test" },
      }),
      c("cookie", 2000, { headers: { cookie: "secret=value" } }),
      c("range", 3000, { mode: "no-cors", headers: { range: "bytes=0-10" } }),
    ]);
    expect(r.every((r) => r.outcome === "invalid" && !r.requestSent)).toBe(
      true,
    );
  });
  it("clears grants after a failed CORS response but keeps them for a same-origin-mode refusal", () => {
    const broken = c("broken", 1000, { method: "PUT" });
    broken.response.usePolicy = false;
    const r = rows([
      c("first", 0, { method: "PUT" }),
      c("mode", 500, { mode: "same-origin" }),
      broken,
      c("last", 2000, { method: "PUT" }),
    ]);
    expect(r.map((r) => r.preflight)).toEqual([
      "sent",
      "not-needed",
      "cached",
      "sent",
    ]);
  });
  it("updates already cached grants to a zero lifetime after a successful preflight", () => {
    const refresh = c("refresh", 1000, {
      method: "PUT",
      headers: { "x-new": "v" },
    });
    refresh.preflight = {
      usePolicy: false,
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "PUT",
        "access-control-allow-headers": "x-new",
        "access-control-max-age": "0",
      },
      body: "",
      delayMs: 80,
    };
    const r = rows([
      c("first", 0, { method: "PUT" }),
      refresh,
      c("last", 2000, { method: "PUT" }),
    ]);
    expect(r.map((r) => r.preflight)).toEqual(["sent", "sent", "sent"]);
  });
  it("bounds cache entries and supports forced preflight without otherwise unsafe inputs", () => {
    const p = project([
      c("first", 0, { forcePreflight: true }),
      c("next", 1000, { forcePreflight: true }),
    ]);
    p.cacheCapacity = 1;
    const simulation = runCorsProject(p).simulations[0];
    expect(simulation.cache.length).toBeLessThanOrEqual(1);
    expect(simulation.metrics.evictions).toBeGreaterThan(0);
    expect(simulation.rows[0].preflight).toBe("sent");
  });
  it("never grants additional credentialed methods from a cached literal wildcard", () => {
    const first = c("first", 0, { method: "PUT", credentials: "include" });
    first.preflight = {
      usePolicy: false,
      status: 204,
      headers: {
        "access-control-allow-origin": first.origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "PUT, *",
        "access-control-max-age": "60",
      },
      body: "",
      delayMs: 80,
    };
    expect(
      rows([
        first,
        c("second", 1000, { method: "DELETE", credentials: "include" }),
      ])[1].preflight,
    ).toBe("sent");
  });
  it("reports network failures, refuses redirect chains and retains no body for HEAD", () => {
    const offline = c("offline", 0);
    offline.response.status = 0;
    offline.response.body = "";
    const redirect = c("redirect", 1000);
    redirect.response.status = 302;
    expect(
      rows([offline, redirect, c("head", 2000, { method: "HEAD" })]).map(
        (r) => [r.outcome, r.visibleBody],
      ),
    ).toEqual([
      ["blocked", ""],
      ["invalid", ""],
      ["allowed", ""],
    ]);
  });
  it("isolates policy runs, checks expectations and budgets, and never exports captured values in reports", () => {
    const p = emptyCorsProject();
    p.scenarios[0].cases = [
      c("request", 0, {
        credentials: "include",
        headers: { authorization: "Bearer private-token" },
        url: "https://private-api.test/items?secret=query",
        expect: { outcome: "allowed" },
      }),
    ];
    p.scenarios[0].budgets.maxBlocked = 0;
    const original = JSON.stringify(p),
      run = runCorsProject(p),
      report = corsRunReport(run);
    expect(run.simulations.map((s) => s.passed)).toEqual([true, false]);
    expect(JSON.stringify(p)).toBe(original);
    for (const literal of [
      "private-token",
      "private-api.test",
      "secret=query",
      "demo-trace",
      "app.example",
      'items"',
    ])
      expect(report).not.toContain(literal);
    expect(JSON.parse(report).simulations[0].rows[0].unsafeHeaderCount).toBe(1);
  });
  it("rejects unknown selection IDs instead of returning a vacuous success", () => {
    expect(() =>
      runCorsProject(emptyCorsProject(), { policyId: "missing" }),
    ).toThrow("project");
  });
});
