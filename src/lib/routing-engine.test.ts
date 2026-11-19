import { describe, expect, it } from "vitest";
import {
  emptyRTProject,
  normalizeRTProject,
  parseRTProject,
  serializeRTProject,
  RTError,
  type RTProject,
  type RTRequest,
  type RTTraffic,
} from "./routing-model";
import {
  createRTRouter,
  runRTProject,
  recordRTExpectation,
  compareRTPolicies,
  routingDiagnostics,
  rtReport,
} from "./routing-engine";
import { demoRTProject } from "./routing-demo";

const fast = { yield: async () => {} };
const request = (
  id = "r",
  url = "/items",
  headers: Record<string, string> = {},
): RTRequest => ({ id, url, headers, method: "GET" });
const traffic = (id: string, atMs: number, durationMs = 10): RTTraffic => ({
  ...request(id),
  atMs,
  outcome: { status: 200, durationMs },
  backendOutcomes: {},
});
function balanced(): RTProject {
  const p = emptyRTProject();
  p.backends = [
    {
      id: "a",
      name: "A",
      url: "https://a.test/base",
      weight: 3,
      capacity: 4,
      healthy: true,
    },
    {
      id: "b",
      name: "B",
      url: "https://b.test/base",
      weight: 1,
      capacity: 4,
      healthy: true,
    },
  ];
  p.pools[0].members = ["a", "b"];
  return p;
}
describe("routing project contracts", () => {
  it("round-trips projects and strips imported computed results", () => {
    const p = demoRTProject();
    expect(parseRTProject(`\uFEFF${serializeRTProject(p)}`)).toEqual(p);
    expect(
      normalizeRTProject({ ...p, results: { passed: true } }),
    ).not.toHaveProperty("results");
  });
  it.each([
    (p: RTProject) => ({ ...p, backends: [] }),
    (p: RTProject) => ({ ...p, backends: [p.backends[0], p.backends[0]] }),
    (p: RTProject) => ({
      ...p,
      backends: [{ ...p.backends[0], url: "javascript:alert(1)" }],
    }),
    (p: RTProject) => ({
      ...p,
      backends: [
        { ...p.backends[0], url: "https://user:password@backend.test" },
      ],
    }),
    (p: RTProject) => ({
      ...p,
      backends: [
        { ...p.backends[0], url: "https://backend.test?secret=value" },
      ],
    }),
    (p: RTProject) => ({ ...p, backends: [{ ...p.backends[0], capacity: 0 }] }),
    (p: RTProject) => ({
      ...p,
      pools: [{ ...p.pools[0], members: ["missing"] }],
    }),
    (p: RTProject) => ({
      ...p,
      routes: [{ ...p.routes[0], path: "/{id}/{id}" }],
    }),
    (p: RTProject) => ({
      ...p,
      routes: [{ ...p.routes[0], path: "/{*rest}/after" }],
    }),
    (p: RTProject) => ({
      ...p,
      routes: [{ ...p.routes[0], rewrite: "/{missing}" }],
    }),
    (p: RTProject) => ({
      ...p,
      routes: [{ ...p.routes[0], path: "/%2e%2e/admin" }],
    }),
    (p: RTProject) => ({
      ...p,
      routes: [
        {
          ...p.routes[0],
          filters: [{ target: "query", name: "x", op: ["equals"], value: "1" }],
        },
      ],
    }),
    (p: RTProject) => ({
      ...p,
      cases: [
        {
          ...p.cases[0],
          requests: [
            {
              ...p.cases[0].requests[0],
              headers: { "X-Key": "1", "x-key": "2" },
            },
          ],
        },
      ],
    }),
  ])("rejects malformed definitions (%#)", (change) => {
    expect(() => normalizeRTProject(change(emptyRTProject()))).toThrow(RTError);
  });
  it("bounds actual UTF-8 project input", () => {
    expect(() =>
      parseRTProject(`{"padding":"${"\u20ac".repeat(710000)}"}`),
    ).toThrow("limit");
  });
  it.each([
    ["request", 4096, "https://client.test/"],
    ["backend", 2048, "https://backend.test/"],
  ] as const)(
    "keeps normalized %s URLs within their %i-character limit",
    (target, limit, prefix) => {
      const projectWithUrl = (url: string) => {
        const project = emptyRTProject();
        if (target === "request") project.cases[0].requests[0].url = url;
        else project.backends[0].url = url;
        return project;
      };
      const unicodeUrl =
        prefix + "é".repeat(Math.floor((limit - prefix.length) / 6));
      const boundaryUrl =
        unicodeUrl + "a".repeat(limit - new URL(unicodeUrl).href.length);
      expect(new URL(boundaryUrl).href).toHaveLength(limit);
      const normalized = normalizeRTProject(projectWithUrl(boundaryUrl));
      expect(normalizeRTProject(normalized)).toEqual(normalized);
      expect(parseRTProject(serializeRTProject(normalized))).toEqual(
        normalized,
      );

      const expandedUrl = prefix + "é".repeat(Math.ceil(limit / 6));
      expect(expandedUrl.length).toBeLessThan(limit);
      expect(new URL(expandedUrl).href.length).toBeGreaterThan(limit);
      expect(() => normalizeRTProject(projectWithUrl(expandedUrl))).toThrow(
        "limit",
      );
    },
  );
});
describe("stateful routing decisions", () => {
  it("balances smooth round-robin weights exactly for sequential completed calls", () => {
    const p = balanced(),
      router = createRTRouter(p),
      counts = { a: 0, b: 0 };
    for (let i = 0; i < 40; i++) {
      const decision = router.dispatch(request(`r${i}`), i);
      counts[decision.backend as "a" | "b"]++;
      expect(router.complete(decision.token!, 200, i)).toBe(true);
    }
    expect(counts).toEqual({ a: 30, b: 10 });
    expect(router.snapshot().every((state) => state.active === 0)).toBe(true);
  });
  it("chooses weighted least-active backends and uses weighted tie-breaking", () => {
    const p = balanced();
    p.backends.forEach((b) => {
      b.weight = 1;
    });
    p.pools[0].algorithm = "least-active";
    const router = createRTRouter(p),
      first = router.dispatch(request("first")),
      second = router.dispatch(request("second"));
    expect(first.backend).toBe("a");
    expect(second.backend).toBe("b");
    router.complete(first.token!, 200);
    expect(router.dispatch(request("third")).backend).toBe("a");
  });
  it("uses deterministic weighted sticky assignment with missing-key rejection", () => {
    const p = balanced();
    p.pools[0].algorithm = "sticky";
    const router = createRTRouter(p),
      decisions = new Map<string, string>(),
      counts = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) {
      const key = `client-${i}`,
        decision = router.dispatch(
          request(`r${i}`, "/items", { "X-Client-Id": key }),
        );
      decisions.set(key, decision.backend!);
      counts[decision.backend as "a" | "b"]++;
      router.complete(decision.token!, 200);
    }
    expect(counts.a).toBeGreaterThan(650);
    expect(counts.a).toBeLessThan(850);
    for (const [key, backend] of [...decisions].reverse().slice(0, 50)) {
      const next = router.dispatch(
        request("repeat", "/items", { "x-client-id": key }),
      );
      expect(next.backend).toBe(backend);
      router.complete(next.token!, 200);
    }
    expect(router.dispatch(request("missing"))).toMatchObject({
      status: 400,
      reason: "sticky-key",
      backend: null,
    });
  });
  it("honors ordered templates, repeated queries and case-insensitive headers", () => {
    const p = balanced();
    p.routes.unshift({
      ...p.routes[0],
      id: "specific",
      path: "/items/{id}",
      methods: ["GET"],
      filters: [
        { target: "header", name: "X-Canary", op: "equals", value: "yes" },
        { target: "query", name: "tag", op: "equals", value: "b" },
      ],
      rewrite: "/internal/{id}",
      setHeaders: { "X-Routed": "yes" },
    });
    const router = createRTRouter(p),
      decision = router.dispatch(
        request("r", "/items/x%2Fy?tag=a&tag=b#fragment", {
          "X-CANARY": " yes ",
        }),
      );
    expect(decision).toMatchObject({
      route: "specific",
      upstreamUrl: "https://a.test/base/internal/x%2Fy?tag=a&tag=b",
      headers: { "x-canary": "yes", "x-routed": "yes" },
    });
    expect(
      router.dispatch(
        request("fallback", "/items/x?tag=a", { "x-canary": "yes" }),
      ).route,
    ).toBe("all");
  });
  it("handles root and empty catch-all matches, Unicode literals and origin-safe rewrites", () => {
    const p = balanced();
    p.routes[0].path = "/api/{*rest}";
    p.routes[0].rewrite = "/{rest}";
    const router = createRTRouter(p);
    expect(router.dispatch(request("root", "/api")).upstreamUrl).toBe(
      "https://a.test/base/",
    );
    const escaped = router.dispatch(
      request("escaped", "/api/http%3A%2F%2Fevil.test?x=1"),
    );
    expect(new URL(escaped.upstreamUrl!).origin).toBe("https://a.test");
    expect(new URL(escaped.upstreamUrl!).pathname.startsWith("/base/")).toBe(
      true,
    );
    p.routes[0].path = "/café/{id}";
    p.routes[0].rewrite = "/réponse/{id}";
    expect(
      createRTRouter(p).dispatch(request("unicode", "/caf%C3%A9/42"))
        .upstreamUrl,
    ).toBe("https://a.test/base/r%C3%A9ponse/42");
  });
  it("does not fall through after matching an unavailable pool", () => {
    const p = balanced();
    p.backends[0].healthy = false;
    p.pools.push({ ...p.pools[0], id: "offline", members: ["a"] });
    p.routes.unshift({ ...p.routes[0], id: "first", pool: "offline" });
    const result = createRTRouter(p).dispatch(request());
    expect(result).toMatchObject({
      route: "first",
      status: 503,
      reason: "unavailable",
      backend: null,
    });
    expect(result.audit).toHaveLength(1);
  });
  it("shares capacity across pools and releases each reservation only once", () => {
    const p = emptyRTProject();
    p.backends[0].capacity = 1;
    p.pools.push({ ...p.pools[0], id: "second" });
    p.routes.unshift({
      ...p.routes[0],
      id: "other",
      path: "/other",
      pool: "second",
    });
    const router = createRTRouter(p),
      first = router.dispatch(request());
    expect(router.dispatch(request("other", "/other"))).toMatchObject({
      status: 503,
      reason: "capacity",
    });
    expect(router.complete(first.token!, 200)).toBe(true);
    expect(router.complete(first.token!, 200)).toBe(false);
    expect(router.snapshot()[0].active).toBe(0);
  });
  it("drains in-flight work during health changes and rejects clock rewinds", () => {
    const router = createRTRouter(emptyRTProject()),
      call = router.dispatch(request(), 10);
    router.setHealthy("primary", false, 11);
    expect(router.snapshot()[0]).toMatchObject({ healthy: false, active: 1 });
    router.complete(call.token!, 200, 12);
    expect(router.snapshot()[0].active).toBe(0);
    expect(() => router.dispatch(request(), 9)).toThrow("clock");
    router.setHealthy("primary", true, 13);
    expect(router.dispatch(request(), 13).backend).toBe("primary");
  });
  it("reports exact duplicate route predicates without treating capture names as distinct", () => {
    const p = balanced();
    p.routes = [
      { ...p.routes[0], id: "first", path: "/items/{id}" },
      { ...p.routes[0], id: "second", path: "/items/{item}" },
    ];
    expect(routingDiagnostics(p)).toEqual([
      { route: "second", shadowedBy: "first" },
    ]);
    p.routes[0].enabled = false;
    expect(routingDiagnostics(p)).toEqual([]);
  });
});
describe("deterministic traffic replay and comparisons", () => {
  it("releases capacity before same-time arrivals and leaves no active reservations", async () => {
    const p = balanced();
    p.backends.forEach((backend) => {
      backend.capacity = 1;
      backend.weight = 1;
    });
    p.cases[0].requests = [
      traffic("r1", 0),
      traffic("r2", 0),
      traffic("r3", 0),
      traffic("r4", 10),
    ];
    const [run] = await runRTProject(p, undefined, fast);
    expect(run.requests.map((r) => r.status)).toEqual([200, 200, 503, 200]);
    expect(
      run.journal.at(-1)!.states.every((state) => state.active === 0),
    ).toBe(true);
  });
  it("ejects on completion and restores eligibility exactly at cooldown expiry", async () => {
    const p = balanced();
    p.health = { failureThreshold: 1, cooldownMs: 10 };
    p.cases[0].requests = [
      { ...traffic("failure", 0, 5), outcome: { status: 500, durationMs: 5 } },
      traffic("ejected", 5, 0),
      traffic("recovered", 15, 0),
    ];
    const [run] = await runRTProject(p, undefined, fast);
    expect(run.requests.map((r) => r.backend)).toEqual(["a", "b", "a"]);
    expect(run.upstreamFailures).toBe(1);
  });
  it("applies manual health recovery after same-time completions", async () => {
    const p = emptyRTProject();
    p.health = { failureThreshold: 1, cooldownMs: 100 };
    p.cases[0].requests = [
      { ...traffic("failure", 0, 5), outcome: { status: 500, durationMs: 5 } },
      traffic("recovered", 5, 0),
    ];
    p.cases[0].healthEvents = [{ atMs: 5, backend: "primary", healthy: true }];
    const [run] = await runRTProject(p, undefined, fast);
    expect(run.requests[1].backend).toBe("primary");
    expect(run.journal.filter((e) => e.atMs === 5).map((e) => e.kind)).toEqual([
      "complete",
      "health",
      "dispatch",
      "complete",
    ]);
  });
  it("records routing expectations and detects policy changes without mutating source", async () => {
    const p = demoRTProject(),
      before = serializeRTProject(p),
      runs = await runRTProject(p, undefined, fast);
    expect(serializeRTProject(p)).toBe(before);
    p.cases.forEach((scenario, i) => {
      scenario.expected = recordRTExpectation(runs[i]);
    });
    expect(
      (await runRTProject(p, undefined, fast)).every((run) => run.matched),
    ).toBe(true);
    p.backends[0].weight = 1;
    expect((await runRTProject(p, ["balanced"], fast))[0].matched).toBe(false);
  });
  it("compares removed routes against fixed traffic even with recorded expectations", async () => {
    const p = balanced(),
      [run] = await runRTProject(p, undefined, fast);
    p.cases[0].expected = recordRTExpectation(run);
    const comparison = await compareRTPolicies(
      p,
      { ...p, routes: [] },
      "baseline",
      fast,
    );
    expect(comparison.changes).toHaveLength(1);
    expect(comparison.candidate.requests[0].status).toBe(404);
    expect(p.cases[0].expected).not.toBeNull();
  });
  it("ignores header insertion order during policy comparison", async () => {
    const p = balanced();
    p.routes[0].setHeaders = { "x-a": "1", "x-b": "2" };
    const candidate = {
      ...p,
      routes: p.routes.map((route) => ({
        ...route,
        setHeaders: { "x-b": "2", "x-a": "1" },
      })),
    };
    expect(
      (await compareRTPolicies(p, candidate, "baseline", fast)).changes,
    ).toEqual([]);
  });
  it("cancels cooperatively and excludes request values from reports", async () => {
    const p = balanced();
    p.cases[0].requests[0].headers = { authorization: "PRIVATE_TOKEN" };
    p.cases[0].requests[0].url =
      "https://client.test/PRIVATE_PATH?secret=PRIVATE_QUERY";
    expect(
      JSON.stringify(rtReport(await runRTProject(p, undefined, fast))),
    ).not.toMatch(
      /PRIVATE_TOKEN|PRIVATE_PATH|PRIVATE_QUERY|upstreamUrl|"headers"/,
    );
    const abort = new AbortController();
    await expect(
      runRTProject(p, undefined, {
        signal: abort.signal,
        yield: async () => {
          abort.abort();
        },
      }),
    ).rejects.toThrow("cancelled");
  });
});
