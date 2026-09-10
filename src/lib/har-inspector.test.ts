import { describe, expect, it } from "vitest";
import type { EndpointSummary } from "./openapi";
import {
  analyzeHarCapture,
  MAX_HAR_BYTES,
  MAX_HAR_ENTRIES,
  parseHarCapture,
  serializeHarAnalysis,
  validHarPrefix,
} from "./har-inspector";

const endpoint = (
  path = "/users/{id}",
  method = "GET",
  statuses = ["200"],
): EndpointSummary => ({
  path,
  method,
  operationId: "",
  deprecated: false,
  secured: false,
  securityRequirements: [],
  serverUrl: "https://schema.test",
  summary: "",
  description: "",
  parameters: [],
  requestBodies: [],
  tags: [],
  responses: statuses.map((status) => ({
    status,
    description: "",
    contentTypes: [],
    schema: null,
  })),
});
const entry = (
  url = "https://example.test/users/42",
  status = 200,
  time: unknown = 100,
  method = "GET",
) => ({ request: { url, method }, response: { status }, time });
const har = (entries: unknown[]) => JSON.stringify({ log: { entries } });
function capture(entries: unknown[]) {
  const parsed = parseHarCapture(har(entries));
  if (!parsed.ok) throw new Error(parsed.issue);
  return parsed.capture;
}

describe("HAR imports", () => {
  it("retains only request metadata and strips credentials, fragments, queries, headers, cookies, and bodies", () => {
    const input = entry(
      "https://alice:password@example.test/users/42?token=secret#private",
      200,
      12.5,
      "get",
    );
    const parsed = parseHarCapture(
      "\uFEFF" +
        har([
          {
            ...input,
            request: {
              ...input.request,
              headers: [{ name: "Authorization", value: "secret" }],
              cookies: [{ value: "cookie-secret" }],
              postData: { text: "body-secret" },
            },
            response: { status: 200, content: { text: "response-secret" } },
          },
        ]),
    );
    expect(parsed).toEqual({
      ok: true,
      capture: {
        total: 1,
        skipped: 0,
        requests: [
          {
            index: 1,
            method: "GET",
            origin: "https://example.test",
            path: "/users/42",
            status: 200,
            durationMs: 12.5,
          },
        ],
      },
    });
  });

  it.each(["{", "null", "[]", "{}", '{"log":{}}', '{"log":{"entries":{}}}'])(
    "rejects malformed capture %s",
    (value) => {
      expect(parseHarCapture(value)).toEqual({
        ok: false,
        issue: "invalid-har",
      });
    },
  );

  it("counts skipped entries and preserves original indices", () => {
    const data = capture([
      null,
      {},
      entry("file:///tmp/private"),
      entry("not a URL"),
      entry(undefined, 600),
      entry(undefined, 99),
      entry(undefined, 200.5),
      entry(undefined, 200, 1, "bad method"),
      entry("https://example.test/" + "a".repeat(4096)),
      entry("https://example.test/?" + "a".repeat(16384)),
      { request: { url: 4, method: 9 }, response: {} },
      entry(undefined, 0, -1),
    ]);
    expect(data).toMatchObject({
      total: 12,
      skipped: 11,
      requests: [{ index: 12, status: 0, durationMs: null }],
    });
    expect(parseHarCapture(har([]))).toEqual({
      ok: false,
      issue: "no-requests",
    });
  });

  it("limits UTF-8 bytes and entry count before analyzing", () => {
    expect(parseHarCapture(" ".repeat(MAX_HAR_BYTES + 1))).toEqual({
      ok: false,
      issue: "too-large",
    });
    expect(parseHarCapture("я".repeat(MAX_HAR_BYTES / 2 + 1))).toEqual({
      ok: false,
      issue: "too-large",
    });
    expect(parseHarCapture(har(Array(MAX_HAR_ENTRIES + 1).fill(null)))).toEqual(
      { ok: false, issue: "too-many" },
    );
    expect(capture(Array(MAX_HAR_ENTRIES).fill(entry())).requests).toHaveLength(
      MAX_HAR_ENTRIES,
    );
  });

  it("keeps zero durations and omits unknown, negative, nonnumeric, and excessive times", () => {
    expect(
      capture(
        [0, null, -1, "12", Number.MAX_VALUE].map((time) =>
          entry(undefined, 200, time),
        ),
      ).requests.map((row) => row.durationMs),
    ).toEqual([0, null, null, null, null]);
  });
});

describe("HAR analysis", () => {
  it("prefers static routes, respects methods, and flags equal-specificity matches as ambiguous", () => {
    const data = capture([
      entry("https://example.test/users/me"),
      entry(),
      entry(undefined, 200, 10, "POST"),
      entry("https://example.test/users/42/"),
    ]);
    const endpoints = [
      endpoint(),
      endpoint("/users/{name}"),
      endpoint("/users/me"),
    ];
    const analysis = analyzeHarCapture(data, endpoints);
    expect(analysis.matches.map((row) => [row.state, row.endpoint])).toEqual([
      ["matched", "GET /users/me"],
      ["ambiguous", null],
      ["unmatched", null],
      ["unmatched", null],
    ]);
    expect(analysis.matches[1].candidates).toEqual([
      "GET /users/{id}",
      "GET /users/{name}",
    ]);
    expect(analysis.summary).toMatchObject({
      operations: 3,
      observed: 1,
      matched: 1,
      ambiguous: 1,
      unmatched: 2,
    });
  });

  it("strips only a complete prefix and matches the root path", () => {
    const data = capture(
      ["/api/users/42", "/apix/users/42", "/api", "/users/42"].map((path) =>
        entry("https://example.test" + path),
      ),
    );
    expect(
      analyzeHarCapture(data, [endpoint(), endpoint("/")], {
        pathPrefix: "/api/",
      }).matches.map((row) => row.endpoint),
    ).toEqual(["GET /users/{id}", null, "GET /", null]);
    expect(
      analyzeHarCapture(data, [endpoint()], { pathPrefix: "/" }).summary
        .matched,
    ).toBe(1);
  });

  it.each([
    "api",
    "/a?token=1",
    "/a#x",
    "/a b",
    "/a\\b",
    "/{id}",
    "/" + "a".repeat(512),
  ])("rejects invalid prefix %s", (prefix) => {
    expect(validHarPrefix(prefix)).toBe(false);
    expect(() =>
      analyzeHarCapture(capture([entry()]), [], { pathPrefix: prefix }),
    ).toThrow("invalid-prefix");
  });

  it("decodes literal path segments without converting encoded slashes into separators", () => {
    const endpoints = [
      endpoint("/люди/{id}"),
      endpoint("/files/a%2Fb"),
      endpoint("/bad/%ZZ"),
      endpoint("/files/{id}.json"),
      endpoint("/bad/{"),
    ];
    const data = capture(
      [
        "/%D0%BB%D1%8E%D0%B4%D0%B8/42",
        "/files/a%2Fb",
        "/files/a/b",
        "/bad/%ZZ",
        "/files/42.json",
      ].map((path) => entry("https://example.test" + path)),
    );
    expect(
      analyzeHarCapture(data, endpoints).matches.map((row) => row.endpoint),
    ).toEqual([
      "GET /люди/{id}",
      "GET /files/a%2Fb",
      null,
      "GET /bad/%ZZ",
      null,
    ]);
  });

  it("supports documented exact, class, and default statuses while separating network failures", () => {
    const data = capture(
      [200, 201, 404, 0].map((status) => entry(undefined, status)),
    );
    expect(
      analyzeHarCapture(data, [endpoint()]).matches.map(
        (row) => row.undocumented,
      ),
    ).toEqual([false, true, true, false]);
    expect(
      analyzeHarCapture(data, [
        endpoint(undefined, undefined, ["2XX"]),
      ]).matches.map((row) => row.undocumented),
    ).toEqual([false, false, true, false]);
    const analysis = analyzeHarCapture(data, [
      endpoint(undefined, undefined, ["default"]),
    ]);
    expect(analysis.summary).toMatchObject({ failed: 2, undocumented: 0 });
    expect(analysis.operations[0].statuses).toEqual({
      "0": 1,
      "200": 1,
      "201": 1,
      "404": 1,
    });
  });

  it("filters origins, accepts empty endpoint scopes, and deduplicates operations", () => {
    const data = capture([entry(), entry("https://other.test/users/7", 500)]);
    const analysis = analyzeHarCapture(data, [endpoint(), endpoint()], {
      origin: "https://example.test",
    });
    expect(analysis.summary).toMatchObject({
      requests: 1,
      matched: 1,
      operations: 1,
      failed: 0,
    });
    expect(analyzeHarCapture(data, []).summary).toMatchObject({
      unmatched: 2,
      operations: 0,
    });
    expect(
      analyzeHarCapture(data, [endpoint()], { origin: "https://absent.test" })
        .summary,
    ).toMatchObject({
      requests: 0,
      count: 0,
      averageMs: null,
      p95Ms: null,
      maxMs: null,
    });
  });

  it("computes average, nearest-rank P95, and maximum from known durations", () => {
    const data = capture([
      ...Array.from({ length: 20 }, (_, i) => entry(undefined, 200, i + 1)),
      entry(undefined, 200, -1),
    ]);
    const analysis = analyzeHarCapture(data, [endpoint()]);
    expect(analysis.summary).toMatchObject({
      requests: 21,
      count: 20,
      averageMs: 10.5,
      p95Ms: 19,
      maxMs: 20,
    });
    expect(analysis.operations[0].timing).toEqual({
      count: 20,
      averageMs: 10.5,
      p95Ms: 19,
      maxMs: 20,
    });
  });

  it("exports only aggregates and schema templates, with imported counts independent of origin filtering", () => {
    const data = capture([
      entry("https://private.test/users/customer-secret?token=secret", 404),
      entry(),
      null,
    ]);
    const report = serializeHarAnalysis(
      analyzeHarCapture(data, [endpoint()], { origin: "https://private.test" }),
      data,
    );
    expect(report).not.toMatch(/private|customer-secret|token|example\.test/);
    expect(JSON.parse(report)).toMatchObject({
      kind: "rsswag-har-analysis",
      version: 1,
      imported: { total: 3, accepted: 2, skipped: 1 },
      summary: { requests: 1, undocumented: 1 },
      operations: [{ path: "/users/{id}", requests: 1 }],
    });
  });
});
