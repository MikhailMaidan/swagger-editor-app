import { describe, expect, it } from "vitest";
import type { JsonValue } from "./api-transform";
import {
  CollectionError,
  collectionDataset,
  collectionNextLink,
  collectionNextUrl,
  collectionStartUrl,
  collectionUrl,
  collectionUrlKey,
  collectionValue,
  defaultCollectionPlan,
  demoCollectionProject,
  normalizeCollectionFixture,
  normalizeCollectionPlan,
  parseCollectionHeaders,
  parseCollectionProject,
  serializeCollectionProject,
} from "./api-collection";

const plan = defaultCollectionPlan();
describe("API collection definitions", () => {
  it("round-trips a portable five-strategy demo", () => {
    const demo = demoCollectionProject();
    expect(parseCollectionProject(serializeCollectionProject(demo))).toEqual(
      demo,
    );
    expect(demo.plans.map((p) => p.strategy)).toEqual([
      "link",
      "next-url",
      "cursor",
      "page",
      "offset",
    ]);
    expect(demo.fixtures).toHaveLength(15);
  });
  it("strips unknown metadata, secrets, reports, and response cookie headers", () => {
    const demo = demoCollectionProject();
    const parsed = parseCollectionProject(
      JSON.stringify({
        ...demo,
        headers: { Authorization: "secret" },
        runs: ["secret"],
        plans: demo.plans.map((p) => ({ ...p, token: "secret" })),
        fixtures: demo.fixtures.map((f) => ({
          ...f,
          headers: {
            ...f.headers,
            "Set-Cookie": "secret",
            Authorization: "secret",
          },
        })),
      }),
    );
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });
  it.each([
    "file:///tmp/data",
    "javascript:alert(1)",
    "https://user:password@example.com/x",
    "/relative",
  ])("rejects unsafe initial URL %s", (url) => {
    expect(() => normalizeCollectionPlan({ ...plan, url })).toThrow(
      CollectionError,
    );
  });
  it("resolves relative URLs and removes fragments", () => {
    expect(
      collectionUrl("../items?x=1#section", "https://api.example/v1/items"),
    ).toBe("https://api.example/items?x=1");
    expect(collectionUrlKey("https://api.example/items?b=2&a=1")).toBe(
      collectionUrlKey("https://api.example/items?a=1&b=2"),
    );
  });
  it.each([
    { maxPages: 101 },
    { pageSize: 0 },
    { intervalMs: -1 },
    { requestTimeoutMs: NaN },
    { minRecords: 5, expectedMaxRecords: 2 },
    { strategy: "cursor", parameter: "" },
    { strategy: "page", parameter: "limit", sizeParameter: "limit" },
  ])("rejects invalid numeric/strategy settings %j", (patch) => {
    expect(() => normalizeCollectionPlan({ ...plan, ...patch })).toThrow(
      CollectionError,
    );
  });
  it("uses own properties and strict JSON Pointer escapes and array indexes", () => {
    const body = JSON.parse('{"a/b":{"~key":[{"__proto__":7}]}}');
    expect(collectionValue(body, "/a~1b/~0key/0/__proto__")).toBe(7);
    expect(collectionValue(body, "/constructor")).toBeUndefined();
    expect(collectionValue(body, "/a~1b/~0key/00")).toBeUndefined();
    expect(() =>
      normalizeCollectionPlan({ ...plan, itemsPointer: "/bad~2" }),
    ).toThrow(CollectionError);
  });
  it("rejects duplicate plan IDs and normalized fixture URLs", () => {
    const demo = demoCollectionProject();
    expect(() =>
      parseCollectionProject(JSON.stringify({ ...demo, plans: [plan, plan] })),
    ).toThrow(CollectionError);
    expect(() =>
      parseCollectionProject(
        JSON.stringify({
          ...demo,
          fixtures: [demo.fixtures[0], { ...demo.fixtures[0], id: "another" }],
        }),
      ),
    ).toThrow(CollectionError);
  });
  it("validates record assertions and keeps only definition fields", () => {
    expect(() =>
      normalizeCollectionPlan({
        ...plan,
        assertions: [
          {
            target: "status",
            path: "",
            operator: "equals",
            expected: "200",
            name: "Status",
          },
        ],
      }),
    ).toThrow(CollectionError);
    expect(() =>
      normalizeCollectionPlan({
        ...plan,
        assertions: [
          {
            target: "body",
            path: "/id",
            operator: "type",
            expected: "garbage",
            name: "ID",
          },
        ],
      }),
    ).toThrow(CollectionError);
  });
  it("bounds fixture payloads and projects", () => {
    expect(() =>
      normalizeCollectionFixture({
        ...demoCollectionProject().fixtures[0],
        headers: { Link: "</a>; rel=next", link: "</b>; rel=next" },
      }),
    ).toThrowError("fixture");
    expect(() =>
      normalizeCollectionFixture({
        ...demoCollectionProject().fixtures[0],
        body: "я".repeat(300000),
      }),
    ).toThrow(CollectionError);
    expect(() =>
      parseCollectionProject(" ".repeat(2 * 1024 * 1024 + 1)),
    ).toThrow(CollectionError);
  });
  it("accepts explicit headers without allowing duplicate or browser-owned credentials", () => {
    expect(
      parseCollectionHeaders(
        '{"Authorization":"Bearer token","X-Trace":"demo"}',
      ),
    ).toEqual({ Authorization: "Bearer token", "X-Trace": "demo" });
    for (const value of [
      '{"Cookie":"x=1"}',
      '{"X":"a","x":"b"}',
      '{"Origin":"https://evil.example"}',
      '{"X":"a\\nb"}',
      '{"Sec-Fetch-Site":"same-origin"}',
      "[]",
      '{"X":12}',
    ])
      expect(() => parseCollectionHeaders(value)).toThrow(CollectionError);
  });
});
describe("pagination navigation", () => {
  it("reads relation lists, commas in targets/titles, escaped quotes, and case-insensitive parameters", () => {
    expect(
      collectionNextLink(
        '<https://api.example/x?a=1,2>; title="Part, \\"quoted\\""; REL="previous NEXT", </last>; rel=last',
      ),
    ).toBe("https://api.example/x?a=1,2");
    expect(
      collectionNextLink(
        '</other>; rel=next; anchor="/elsewhere", </last>; rel=last',
      ),
    ).toBeNull();
    expect(collectionNextLink("</last>; rel=last")).toBeNull();
    expect(collectionNextLink("")).toBeNull();
    expect(collectionNextLink("<>; rel=next; extension")).toBe("");
    expect(
      collectionNextUrl(
        { ...plan, strategy: "link" },
        plan.url,
        [],
        { link: "<>; rel=next" },
        0,
        1,
      ),
    ).toBe(plan.url);
  });
  it.each([
    '</a>; rel="next", </b>; rel=next',
    '</a>; rel="next',
    "not-a-link",
  ])("rejects malformed or ambiguous Link header %s", (value) =>
    expect(() => collectionNextLink(value)).toThrow(CollectionError),
  );
  it("resolves JSON continuation URLs and refuses cross-origin navigation", () => {
    expect(
      collectionNextUrl(plan, plan.url, { next: "?after=2" }, {}, 2, 1),
    ).toBe("https://api.example/items?after=2");
    expect(() =>
      collectionNextUrl(
        plan,
        plan.url,
        { next: "https://other.example/steal" },
        {},
        2,
        1,
      ),
    ).toThrowError("origin");
    expect(() =>
      collectionNextUrl(plan, plan.url, { next: false }, {}, 2, 1),
    ).toThrowError("cursor");
    expect(collectionNextUrl(plan, plan.url, {}, {}, 2, 1)).toBeNull();
  });
  it("encodes opaque and numeric-zero cursors without destroying unrelated parameters", () => {
    const p = {
      ...plan,
      strategy: "cursor" as const,
      url: plan.url + "?filter=yes",
      nextPointer: "/cursor",
      sizeParameter: "limit",
      pageSize: 20,
    };
    const url = collectionStartUrl(p);
    expect(new URL(url).searchParams.get("limit")).toBe("20");
    expect(
      new URL(
        collectionNextUrl(p, url, { cursor: "a+/= &" }, {}, 2, 1)!,
      ).searchParams.get("cursor"),
    ).toBe("a+/= &");
    expect(
      new URL(
        collectionNextUrl(p, url, { cursor: 0 }, {}, 2, 1)!,
      ).searchParams.get("cursor"),
    ).toBe("0");
    expect(new URL(url).searchParams.get("filter")).toBe("yes");
  });
  it("increments page/offset counters and respects explicit empty/short-page completion", () => {
    const p = {
      ...plan,
      strategy: "offset" as const,
      parameter: "offset",
      start: 0,
      pageSize: 2,
      stopOnShortPage: false,
    };
    expect(new URL(collectionStartUrl(p)).searchParams.get("offset")).toBe("0");
    expect(
      new URL(collectionNextUrl(p, p.url, {}, {}, 1, 2)!).searchParams.get(
        "offset",
      ),
    ).toBe("4");
    expect(collectionNextUrl(p, p.url, {}, {}, 0, 3)).toBeNull();
    expect(
      collectionNextUrl({ ...p, stopOnShortPage: true }, p.url, {}, {}, 1, 1),
    ).toBeNull();
    expect(
      new URL(
        collectionNextUrl(
          { ...p, strategy: "page", start: 1 },
          p.url,
          {},
          {},
          2,
          2,
        )!,
      ).searchParams.get("offset"),
    ).toBe("3");
  });
});
describe("dataset exports", () => {
  it("bounds wide CSV exports before building a sparse row/column matrix", () => {
    expect(() =>
      collectionDataset(
        [
          Object.fromEntries(
            Array.from({ length: 201 }, (_, i) => [`field${i}`, i]),
          ),
        ],
        "csv",
      ),
    ).toThrowError("max-bytes");
  });
  it("exports JSON, NDJSON, nested CSV values and neutralizes spreadsheet formulas", () => {
    const records: JsonValue[] = [
      { id: 1, name: '=HYPERLINK("x")', nested: { active: true } },
      { id: 2, name: "Line\nBreak" },
    ];
    expect(JSON.parse(collectionDataset(records, "json"))).toEqual(records);
    expect(
      collectionDataset(records, "ndjson")
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s)),
    ).toEqual(records);
    const csv = collectionDataset(records, "csv");
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"{""active"":true}"');
    expect(csv).toContain('"Line\nBreak"');
    expect(collectionDataset([true, null, 3], "csv")).toContain('"$value"');
  });
});
