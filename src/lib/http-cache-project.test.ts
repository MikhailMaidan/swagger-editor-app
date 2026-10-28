import { describe, expect, it } from "vitest";
import { cacheProjectFromHar } from "./http-cache-har";
import { demoCacheProject } from "./http-cache-demo";
import {
  MAX_CACHE_BODY_BYTES,
  MAX_CACHE_PROJECT_BYTES,
  defaultCacheStep,
  emptyCacheProject,
  normalizeCacheProject,
  parseCacheProject,
  serializeCacheProject,
} from "./http-cache-project";
import { runCacheProject } from "./http-cache-engine";
const capture = (overrides: Record<string, unknown> = {}) => ({
  startedDateTime: "2026-01-01T00:00:00Z",
  time: 100,
  request: {
    method: "GET",
    url: "https://example.test/items",
    headers: [{ name: "Authorization", value: "Bearer captured" }],
  },
  response: {
    status: 200,
    headers: [{ name: "Cache-Control", value: "private, max-age=60" }],
    content: { text: "hello" },
  },
  ...overrides,
});
const har = (entries: unknown[]) =>
  JSON.stringify({ log: { version: "1.2", entries } });
describe("portable HTTP cache projects", () => {
  it("requires a literal private/shared cache type without coercing arrays", () => {
    const p = emptyCacheProject();
    expect(() =>
      normalizeCacheProject({
        ...p,
        policies: [{ ...p.policies[0], mode: ["shared"] }],
      }),
    ).toThrow("project");
    expect(() =>
      normalizeCacheProject({
        ...p,
        policies: [{ ...p.policies[0], mode: { toString: "private" } }],
      }),
    ).toThrow("project");
  });
  it("round-trips demo projects but never trusts imported results or unknown metadata", () => {
    const p = demoCacheProject();
    expect(parseCacheProject(serializeCacheProject(p))).toEqual(p);
    const raw = {
      ...p,
      results: { passed: true },
      secrets: "discard",
      policies: p.policies.map((p) => ({ ...p, response: "discard" })),
    };
    const serialized = serializeCacheProject(normalizeCacheProject(raw));
    expect(serialized).not.toContain("discard");
    expect(serialized).not.toContain('"results"');
  });
  it("rejects unsupported versions, invalid dates and impossible calendar dates", () => {
    const p = emptyCacheProject();
    for (const change of [
      { version: 2 },
      { kind: "other" },
      { name: "" },
      { startTime: "2026-02-30T00:00:00Z" },
      { startTime: "2026-01-01" },
    ])
      expect(() => normalizeCacheProject({ ...p, ...change })).toThrow(
        "project",
      );
    expect(
      normalizeCacheProject({ ...p, startTime: "2026-01-01T00:00:00Z" })
        .startTime,
    ).toBe("2026-01-01T00:00:00.000Z");
  });
  it("requires unique identities, ascending times and finite integer budgets", () => {
    const p = emptyCacheProject();
    p.policies[1].id = p.policies[0].id;
    expect(() => normalizeCacheProject(p)).toThrow("project");
    p.policies.pop();
    p.scenarios[0].steps = [
      defaultCacheStep("a", 1000),
      defaultCacheStep("b", 0),
    ];
    expect(() => normalizeCacheProject(p)).toThrow("project");
    p.scenarios[0].steps.reverse();
    p.scenarios[0].budgets.maxErrors = NaN;
    expect(() => normalizeCacheProject(p)).toThrow("project");
  });
  it("bounds body UTF-8 bytes and requires empty 304/204/205 bodies", () => {
    const p = emptyCacheProject(),
      r = p.scenarios[0].steps[0].origin;
    if (r?.kind !== "response") throw new Error("fixture");
    r.body = "я".repeat(MAX_CACHE_BODY_BYTES / 2 + 1);
    expect(() => normalizeCacheProject(p)).toThrow("project");
    r.body = "nonempty";
    r.status = 304;
    expect(() => normalizeCacheProject(p)).toThrow("project");
    r.body = "";
    expect(normalizeCacheProject(p).scenarios[0].steps[0].origin).toMatchObject(
      { status: 304 },
    );
  });
  it("validates policy controls and expectations without accepting raw string numbers", () => {
    const p = emptyCacheProject();
    p.policies[0].responseCacheControl = 'max-age="broken';
    expect(() => normalizeCacheProject(p)).toThrow("project");
    p.policies[0].responseCacheControl = null;
    expect(() =>
      normalizeCacheProject({
        ...p,
        policies: [{ ...p.policies[0], capacity: "20" }],
      }),
    ).toThrow("project");
    p.scenarios[0].steps[0].expect = { outcome: "other" as never };
    expect(() => normalizeCacheProject(p)).toThrow("project");
  });
  it("rejects large projects before parsing and limits counts", () => {
    expect(() =>
      parseCacheProject(" ".repeat(MAX_CACHE_PROJECT_BYTES + 1)),
    ).toThrow("limit");
    expect(() => parseCacheProject("{")).toThrow("json");
    const p = emptyCacheProject();
    p.scenarios[0].steps = Array.from({ length: 101 }, (_, i) =>
      defaultCacheStep(`s-${i}`),
    );
    expect(() => normalizeCacheProject(p)).toThrow("project");
  });
});
describe("HAR cache scenario imports", () => {
  it("imports exact request headers and decoded responses with a stable virtual epoch", () => {
    const imported = cacheProjectFromHar(
      har([
        capture(),
        capture({ startedDateTime: "2026-01-01T00:00:10+00:00" }),
      ]),
    );
    expect(imported).toMatchObject({ missingBodies: 0, skipped: 0 });
    expect(imported.project.scenarios[0].steps[1]).toMatchObject({
      atMs: 10000,
      headers: { authorization: "Bearer captured" },
    });
    const run = runCacheProject(imported.project);
    expect(run.simulations.map((s) => s.rows[1].outcome)).toEqual([
      "fresh",
      "miss",
    ]);
  });
  it("combines repeated header fields and omits HTTP/2 pseudo-fields and decoded entity metadata", () => {
    const entry = capture({
      response: {
        status: 200,
        headers: [
          { name: ":status", value: "200" },
          { name: "Cache-Control", value: "public" },
          { name: "cache-control", value: "max-age=60" },
          { name: "Content-Encoding", value: "gzip" },
          { name: "Content-Length", value: "33" },
        ],
        content: { text: "aGVsbG8=", encoding: "base64" },
      },
    });
    const r = cacheProjectFromHar(har([entry])).project.scenarios[0].steps[0]
      .origin;
    expect(r).toMatchObject({
      body: "hello",
      headers: { "cache-control": "public, max-age=60" },
    });
    if (r?.kind !== "response") throw new Error("fixture");
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.headers["content-length"]).toBeUndefined();
  });
  it("sorts captured times, counts missing bodies and unsupported methods, and models network errors", () => {
    const imported = cacheProjectFromHar(
      har([
        capture({
          startedDateTime: "2026-01-01T00:00:10Z",
          response: { status: 200, headers: [], content: {} },
        }),
        capture({ response: { status: 0, headers: [] } }),
        capture({ request: { method: "CONNECT" } }),
      ]),
    );
    expect(imported).toMatchObject({ skipped: 1, missingBodies: 1 });
    expect(
      imported.project.scenarios[0].steps.map((s) => [s.atMs, s.origin?.kind]),
    ).toEqual([
      [0, "network-error"],
      [10000, "response"],
    ]);
  });
  it("retains client preconditions instead of silently changing the request", () => {
    const p = cacheProjectFromHar(
      har([
        capture({
          request: {
            method: "GET",
            url: "https://example.test/items",
            headers: [{ name: "If-None-Match", value: '"v1"' }],
          },
          response: { status: 304, headers: [], content: {} },
        }),
      ]),
    ).project;
    expect(runCacheProject(p).simulations[0].rows[0]).toMatchObject({
      outcome: "bypass",
      status: 304,
    });
  });
  it.each(["/w==", "invalid==="])(
    "rejects binary or invalid base64: %s",
    (text) => {
      expect(() =>
        cacheProjectFromHar(
          har([
            capture({
              response: {
                status: 200,
                headers: [],
                content: { text, encoding: "base64" },
              },
            }),
          ]),
        ),
      ).toThrow("har");
    },
  );
  it("rejects invalid captures and oversized schedules without returning partial work", () => {
    expect(() => cacheProjectFromHar("{}")).toThrow("har");
    expect(() =>
      cacheProjectFromHar(har([capture(), capture({ time: -1 })])),
    ).toThrow("har");
    expect(() =>
      cacheProjectFromHar(har(Array.from({ length: 101 }, () => capture()))),
    ).toThrow("limit");
    expect(() =>
      cacheProjectFromHar(
        har([capture(), capture({ startedDateTime: "2027-01-01T00:00:00Z" })]),
      ),
    ).toThrow("project");
  });
});
