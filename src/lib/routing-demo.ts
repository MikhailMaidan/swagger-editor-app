import {
  emptyRTProject,
  normalizeRTProject,
  type RTProject,
  type RTTraffic,
} from "./routing-model";

export function demoRTProject(): RTProject {
  const request = (
    id: string,
    atMs: number,
    url: string,
    headers: Record<string, string> = {},
  ): RTTraffic => ({
    id,
    atMs,
    method: "GET",
    url: `https://client.example.test${url}`,
    headers,
    outcome: { status: 200, durationMs: 100 },
    backendOutcomes: {},
  });
  return normalizeRTProject({
    ...emptyRTProject(),
    name: "API gateway traffic rehearsal",
    health: { failureThreshold: 1, cooldownMs: 500 },
    backends: [
      {
        id: "stable-a",
        name: "Stable A",
        url: "https://stable-a.example.test/base",
        weight: 3,
        capacity: 2,
        healthy: true,
      },
      {
        id: "stable-b",
        name: "Stable B",
        url: "https://stable-b.example.test/base",
        weight: 1,
        capacity: 2,
        healthy: true,
      },
      {
        id: "canary",
        name: "Canary",
        url: "https://canary.example.test",
        weight: 1,
        capacity: 1,
        healthy: true,
      },
    ],
    pools: [
      {
        id: "stable",
        name: "Weighted stable",
        algorithm: "round-robin",
        members: ["stable-a", "stable-b"],
        key: { target: "header", name: "x-client-id" },
      },
      {
        id: "canary-pool",
        name: "Canary pool",
        algorithm: "least-active",
        members: ["canary"],
        key: { target: "header", name: "x-client-id" },
      },
      {
        id: "sessions",
        name: "Sticky sessions",
        algorithm: "sticky",
        members: ["stable-a", "stable-b"],
        key: { target: "header", name: "x-client-id" },
      },
    ],
    routes: [
      {
        id: "canary-route",
        name: "Opt-in canary",
        enabled: true,
        methods: ["GET"],
        path: "/v1/items/{id}",
        filters: [
          { target: "header", name: "x-canary", op: "equals", value: "yes" },
        ],
        pool: "canary-pool",
        rewrite: "/preview/items/{id}",
        setHeaders: { "x-release": "canary" },
      },
      {
        id: "session-route",
        name: "Sticky session API",
        enabled: true,
        methods: ["GET"],
        path: "/session/{*rest}",
        filters: [],
        pool: "sessions",
        rewrite: "/{rest}",
        setHeaders: {},
      },
      {
        id: "stable-route",
        name: "Stable API",
        enabled: true,
        methods: ["GET", "POST"],
        path: "/v1/{*rest}",
        filters: [],
        pool: "stable",
        rewrite: "/{rest}",
        setHeaders: { "x-release": "stable" },
      },
    ],
    cases: [
      {
        id: "balanced",
        name: "Weighted traffic and rewrites",
        expected: null,
        healthEvents: [],
        requests: Array.from({ length: 8 }, (_, i) =>
          request(
            `balanced-${i + 1}`,
            i * 150,
            `/v1/items/${i + 1}?page=1&tag=a&tag=b`,
          ),
        ),
      },
      {
        id: "canary-capacity",
        name: "Canary burst and capacity",
        expected: null,
        healthEvents: [],
        requests: [
          request("canary-1", 0, "/v1/items/1", { "x-canary": "yes" }),
          request("canary-2", 0, "/v1/items/2", { "x-canary": "yes" }),
          request("stable", 0, "/v1/items/3"),
          request("canary-recovered", 100, "/v1/items/4", {
            "x-canary": "yes",
          }),
        ],
      },
      {
        id: "outage",
        name: "Backend outage and recovery",
        expected: null,
        healthEvents: [
          { atMs: 50, backend: "stable-a", healthy: false },
          { atMs: 350, backend: "stable-a", healthy: true },
        ],
        requests: Array.from({ length: 6 }, (_, i) =>
          request(`outage-${i + 1}`, i * 100, `/v1/items/${i}`),
        ),
      },
      {
        id: "passive",
        name: "5xx ejection and cooldown",
        expected: null,
        healthEvents: [],
        requests: [
          {
            ...request("failure", 0, "/v1/items/1"),
            backendOutcomes: { "stable-a": { status: 503, durationMs: 50 } },
          },
          request("during-ejection", 50, "/v1/items/2"),
          request("after-cooldown", 550, "/v1/items/3"),
        ],
      },
      {
        id: "sticky",
        name: "Sticky clients and missing keys",
        expected: null,
        healthEvents: [],
        requests: [
          request("alice-1", 0, "/session/profile", { "x-client-id": "alice" }),
          request("bob", 150, "/session/profile", { "x-client-id": "bob" }),
          request("alice-2", 300, "/session/orders", {
            "x-client-id": "alice",
          }),
          request("missing-key", 450, "/session/profile"),
          request("no-route", 600, "/unknown"),
        ],
      },
    ],
  });
}
