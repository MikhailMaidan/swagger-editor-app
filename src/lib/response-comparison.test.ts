import { describe, expect, it } from "vitest";
import {
  compareResponses,
  isComparisonPointer,
  MAX_COMPARISON_BODY_BYTES,
  serializeResponseComparison,
  type ComparisonResponse,
} from "./response-comparison";

function response(
  body: string,
  overrides: Partial<ComparisonResponse> = {},
): ComparisonResponse {
  return {
    body,
    headers: { "content-type": "application/json" },
    status: "200",
    durationMs: 10,
    source: "live",
    ...overrides,
  };
}
function compare(before: unknown, after: unknown) {
  return compareResponses(
    response(JSON.stringify(before)),
    response(JSON.stringify(after)),
  );
}

describe("response comparison", () => {
  it("ignores JSON formatting and object key order while retaining timing and sizes", () => {
    const baseline = response('{ "b": 2, "a": 1 }');
    const current = response('{"a":1,"b":2}', { durationMs: 35 });
    const report = compareResponses(baseline, current);
    expect(report).toMatchObject({
      bodyMode: "json",
      differences: [],
      limited: false,
      durationDeltaMs: 25,
    });
    expect(report.baseline.bodyBytes).toBeGreaterThan(report.current.bodyBytes);
  });

  it("identifies added, removed, and changed fields at escaped JSON pointers", () => {
    const report = compare(
      { "a/b~c": { value: 1 }, removed: true },
      { "a/b~c": { value: "1" }, added: null },
    );
    expect(report.differences).toEqual([
      {
        area: "body",
        kind: "changed",
        path: "/a~1b~0c/value",
        before: "1",
        after: '"1"',
      },
      {
        area: "body",
        kind: "added",
        path: "/added",
        before: undefined,
        after: "null",
      },
      {
        area: "body",
        kind: "removed",
        path: "/removed",
        before: "true",
        after: undefined,
      },
    ]);
  });

  it.each([998, 997])(
    "keeps emoji intact at the preview boundary after %s characters",
    (prefixLength) => {
      const prefix = "a".repeat(prefixLength);
      const report = compare(prefix + "😀old", prefix + "😀new");
      const preview = '"' + prefix + (prefixLength === 997 ? "😀" : "") + "…";

      expect(report.differences).toEqual([
        {
          area: "body",
          kind: "changed",
          path: "",
          before: preview,
          after: preview,
        },
      ]);
      expect(report.bodyMode).toBe("json");
    },
  );

  it("compares arrays by index, including nested fields and length changes", () => {
    expect(compare([{ id: 1 }, { id: 2 }], [{ id: 3 }]).differences).toEqual([
      expect.objectContaining({
        path: "/0/id",
        kind: "changed",
        before: "1",
        after: "3",
      }),
      expect.objectContaining({
        path: "/1",
        kind: "removed",
        before: "{…} (1)",
      }),
    ]);
    expect(compare([], [null]).differences[0]).toMatchObject({
      path: "/0",
      kind: "added",
      after: "null",
    });
  });

  it.each([
    [null, false],
    [false, 0],
    [1, "1"],
    [{ id: 1 }, [1]],
    [[], {}],
  ])("detects root type changes: %j to %j", (before, after) => {
    expect(compare(before, after).differences).toEqual([
      expect.objectContaining({ path: "", kind: "changed" }),
    ]);
  });

  it("skips exact ignored pointers and descendants without hiding similarly named fields", () => {
    const before = response(
      JSON.stringify({
        meta: { time: 1 },
        metadata: 1,
        items: [{ id: 1, value: 1 }],
      }),
    );
    const after = response(
      JSON.stringify({
        meta: { time: 2 },
        metadata: 2,
        items: [{ id: 2, value: 2 }],
      }),
    );
    const original = JSON.stringify(before);
    const report = compareResponses(before, after, {
      ignoredBodyPaths: ["/meta", "/items/0/id"],
      ignoredHeaders: [],
    });
    expect(report.differences.map(({ path }) => path)).toEqual([
      "/items/0/value",
      "/metadata",
    ]);
    expect(JSON.stringify(before)).toBe(original);
  });

  it("supports escaped paths and empty property names without confusing the body root", () => {
    const report = compareResponses(
      response('{"":1,"a/b~c":1}'),
      response('{"":2,"a/b~c":2}'),
      { ignoredBodyPaths: ["/", "/a~1b~0c"], ignoredHeaders: [] },
    );
    expect(report.differences).toEqual([]);
    expect(compare({}, { "": 1 }).differences[0].path).toBe("/");
  });

  it("normalizes header names and detects status and header changes", () => {
    const report = compareResponses(
      response("", {
        headers: {
          "Content-Type": " text/plain ",
          Date: "yesterday",
          "X-Removed": "yes",
        },
      }),
      response("", {
        status: "404",
        headers: {
          "content-type": "text/plain",
          date: "today",
          "X-Added": "yes",
        },
      }),
      { ignoredBodyPaths: [], ignoredHeaders: [" DATE "] },
    );
    expect(
      report.differences.map(({ area, kind, path }) => ({ area, kind, path })),
    ).toEqual([
      { area: "status", kind: "changed", path: "/status" },
      { area: "headers", kind: "added", path: "/x-added" },
      { area: "headers", kind: "removed", path: "/x-removed" },
    ]);
  });

  it("compares duplicate header names consistently", () => {
    expect(
      compareResponses(
        response("", { headers: { Vary: "Accept", vary: "Origin" } }),
        response("", { headers: { vary: "Accept, Origin" } }),
      ).differences,
    ).toEqual([]);
  });

  it("redacts known credential headers while still detecting their changes", () => {
    const report = compareResponses(
      response("", {
        headers: {
          "Set-Cookie": "secret=old",
          Authorization: "Bearer old",
          "x-api-key": "old",
        },
      }),
      response("", {
        headers: {
          "Set-Cookie": "secret=new",
          Authorization: "Bearer new",
          "x-api-key": "new",
        },
      }),
    );
    expect(report.differences).toHaveLength(3);
    for (const difference of report.differences)
      expect(difference).toMatchObject({
        before: "[redacted]",
        after: "[redacted]",
      });
    const exported = serializeResponseComparison(
      report,
      { method: "GET", path: "/items" },
      true,
    );
    expect(exported).not.toMatch(/secret=|Bearer|"old"|"new"/);
  });

  it("compares plain text and invalid JSON literally without applying JSON exclusions", () => {
    const report = compareResponses(
      response("hello\nworld"),
      response("hello world"),
      { ignoredBodyPaths: ["/hello"], ignoredHeaders: [] },
    );
    expect(report).toMatchObject({ bodyMode: "text", limited: false });
    expect(report.differences[0]).toMatchObject({ path: "", kind: "changed" });
    expect(
      compareResponses(response("invalid{"), response("invalid{")).differences,
    ).toEqual([]);
  });

  it("does not falsely equate large numeric IDs after JavaScript rounding", () => {
    const report = compareResponses(
      response('{"id":9007199254740992}'),
      response('{"id":9007199254740993}'),
    );
    expect(report.bodyMode).toBe("text");
    expect(report.differences).toHaveLength(1);
    expect(
      compareResponses(response("1e999"), response("2e999")).differences,
    ).toHaveLength(1);
  });

  it("measures UTF-8 bytes and keeps unavailable timing values out of latency deltas", () => {
    const report = compareResponses(
      response('"Привет"', { durationMs: -1 }),
      response('"Hi"', { durationMs: Number.NaN, source: "mock" }),
    );
    expect(report.baseline.bodyBytes).toBe(14);
    expect(report.durationDeltaMs).toBeNull();
    expect(report.baseline.durationMs).toBeNull();
    expect(report.current.durationMs).toBeNull();
    expect(report.current.source).toBe("mock");
  });

  it("marks oversized bodies partial while still comparing status and headers", () => {
    const report = compareResponses(
      response("x".repeat(MAX_COMPARISON_BODY_BYTES + 1)),
      response("ok", { status: "500" }),
    );
    expect(report).toMatchObject({ bodyMode: "too-large", limited: true });
    expect(report.differences.map(({ area }) => area)).toEqual(["status"]);
  });

  it("bounds the number of displayed differences", () => {
    const report = compare(
      Array.from({ length: 600 }, () => 1),
      Array.from({ length: 600 }, () => 2),
    );
    expect(report.differences).toHaveLength(500);
    expect(report.limited).toBe(true);
  });

  it("does not mark a comparison with exactly the maximum differences as limited", () => {
    const report = compare(
      { a: Array.from({ length: 500 }, () => 1), b: {} },
      { a: Array.from({ length: 500 }, () => 2), b: {} },
    );
    expect(report.differences).toHaveLength(500);
    expect(report.limited).toBe(false);
  });

  it("limits deeply nested or very wide comparisons without claiming equality", () => {
    let before: unknown = 1;
    let after: unknown = 2;
    for (let i = 0; i < 70; i++) {
      before = { child: before };
      after = { child: after };
    }
    expect(compare(before, after).limited).toBe(true);
    const left = Array.from({ length: 20010 }, () => 1);
    const right = [...left];
    right[right.length - 1] = 2;
    expect(compare(left, right).limited).toBe(true);
    expect(compare(left, left).limited).toBe(false);
  });

  it("bounds value previews and summarizes containers", () => {
    const report = compare("a".repeat(2000), "b".repeat(2000));
    expect(report.differences[0].before).toHaveLength(1001);
    expect(report.differences[0].before).toMatch(/…$/);
    expect(compare({}, { added: [1, 2] }).differences[0].after).toBe("[…] (2)");
  });

  it("handles own prototype-shaped keys as response data", () => {
    const report = compareResponses(
      response('{"__proto__":{"token":1},"constructor":0}'),
      response('{"__proto__":{"token":2},"constructor":1}'),
    );
    expect(report.differences.map(({ path }) => path)).toEqual([
      "/__proto__/token",
      "/constructor",
    ]);
  });

  it("exports metadata and paths by default, with value previews only when requested", () => {
    const report = compare({ secret: "before" }, { secret: "after" });
    const exported = JSON.parse(
      serializeResponseComparison(report, { method: "POST", path: "/users" }),
    );
    expect(exported).toMatchObject({
      version: 1,
      endpoint: { method: "POST", path: "/users" },
      valuesIncluded: false,
    });
    expect(exported.differences[0]).toEqual({
      area: "body",
      kind: "changed",
      path: "/secret",
    });
    expect(
      JSON.parse(
        serializeResponseComparison(
          report,
          { method: "POST", path: "/users" },
          true,
        ),
      ).differences[0].before,
    ).toBe('"before"');
  });

  it("validates pointers and normalizes duplicate ignore settings", () => {
    expect(isComparisonPointer("/")).toBe(true);
    expect(isComparisonPointer("/a~0b~1c")).toBe(true);
    for (const pointer of ["", "a", "#/a", "/a~2", `/${"a".repeat(512)}`])
      expect(isComparisonPointer(pointer)).toBe(false);
    const report = compareResponses(response("{}"), response("{}"), {
      ignoredBodyPaths: ["/time", "/time", "bad"],
      ignoredHeaders: [" DATE ", "date", ""],
    });
    expect(report.options).toEqual({
      ignoredBodyPaths: ["/time"],
      ignoredHeaders: ["date"],
    });
  });
});
