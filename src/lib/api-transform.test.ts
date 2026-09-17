import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  applyPatch,
  describeTransformChanges,
  listTransformPointers,
  MAX_TRANSFORM_BYTES,
  parsePatch,
  parseTransformPointer,
  parseTransformValue,
  previewTransformation,
  readTransformSource,
  serializePatch,
  serializeTransformation,
  TransformError,
  type JsonValue,
  type PatchOperation,
} from "./api-transform";

const api = {
  openapi: "3.1.0",
  info: { title: "Shop", version: "1" },
  paths: { "/items": { get: { responses: { "200": { description: "OK" } } } } },
};
function expectIssue(run: () => unknown, code: string, step?: number) {
  try {
    run();
    throw new Error("Expected an error");
  } catch (error) {
    expect(error).toBeInstanceOf(TransformError);
    expect(error).toMatchObject({
      code,
      ...(step === undefined ? {} : { step }),
    });
  }
}

describe("JSON Patch transformations", () => {
  it.each<{
    name: string;
    source: JsonValue;
    patch: PatchOperation[];
    expected: JsonValue | undefined;
  }>([
    {
      name: "add object member",
      source: { foo: "bar" },
      patch: [{ op: "add", path: "/baz", value: "qux" }],
      expected: { baz: "qux", foo: "bar" },
    },
    {
      name: "replace via add",
      source: { foo: "bar" },
      patch: [{ op: "add", path: "/foo", value: false }],
      expected: { foo: false },
    },
    {
      name: "insert array element",
      source: { foo: ["bar", "baz"] },
      patch: [{ op: "add", path: "/foo/1", value: "qux" }],
      expected: { foo: ["bar", "qux", "baz"] },
    },
    {
      name: "append array value as one element",
      source: { foo: ["bar"] },
      patch: [{ op: "add", path: "/foo/-", value: ["abc", "def"] }],
      expected: { foo: ["bar", ["abc", "def"]] },
    },
    {
      name: "insert at array length",
      source: [],
      patch: [{ op: "add", path: "/0", value: null }],
      expected: [null],
    },
    {
      name: "remove object member",
      source: { baz: "qux", foo: "bar" },
      patch: [{ op: "remove", path: "/baz" }],
      expected: { foo: "bar" },
    },
    {
      name: "remove array element",
      source: { foo: ["bar", "qux", "baz"] },
      patch: [{ op: "remove", path: "/foo/1" }],
      expected: { foo: ["bar", "baz"] },
    },
    {
      name: "replace existing value",
      source: { foo: "bar" },
      patch: [{ op: "replace", path: "/foo", value: 42 }],
      expected: { foo: 42 },
    },
    {
      name: "move object member",
      source: { foo: { bar: "baz", waldo: "fred" }, qux: { corge: "grault" } },
      patch: [{ op: "move", from: "/foo/waldo", path: "/qux/thud" }],
      expected: { foo: { bar: "baz" }, qux: { corge: "grault", thud: "fred" } },
    },
    {
      name: "move with indices after removal",
      source: ["all", "grass", "cows", "eat"],
      patch: [{ op: "move", from: "/1", path: "/3" }],
      expected: ["all", "cows", "eat", "grass"],
    },
    {
      name: "move to identical array index",
      source: [1, 2],
      patch: [{ op: "move", from: "/0", path: "/0" }],
      expected: [1, 2],
    },
    {
      name: "replace document root",
      source: { foo: true },
      patch: [{ op: "replace", path: "", value: [1] }],
      expected: [1],
    },
    {
      name: "copy descendant into root",
      source: { foo: [1] },
      patch: [{ op: "copy", from: "/foo", path: "" }],
      expected: [1],
    },
    {
      name: "remove root",
      source: null,
      patch: [{ op: "remove", path: "" }],
      expected: undefined,
    },
    {
      name: "restore removed root",
      source: null,
      patch: [
        { op: "remove", path: "" },
        { op: "add", path: "", value: false },
      ],
      expected: false,
    },
    {
      name: "move root to itself",
      source: { a: true },
      patch: [{ op: "move", from: "", path: "" }],
      expected: { a: true },
    },
    {
      name: "empty member key",
      source: {},
      patch: [{ op: "add", path: "/", value: "empty" }],
      expected: { "": "empty" },
    },
    {
      name: "ordered pointer unescaping",
      source: { "~1": 10, "/": 20 },
      patch: [
        { op: "test", path: "/~01", value: 10 },
        { op: "replace", path: "/~1", value: 30 },
      ],
      expected: { "~1": 10, "/": 30 },
    },
  ])("$name", ({ source, patch, expected }) => {
    const before = JSON.stringify(source);
    expect(applyPatch(source, patch)).toEqual(expected);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("compares objects without key ordering, but respects types and array ordering", () => {
    expect(
      applyPatch({ a: [1, null], b: false }, [
        { op: "test", path: "", value: { b: false, a: [1, null] } },
      ]),
    ).toEqual({ a: [1, null], b: false });
    for (const value of ["1", [null, 1], { a: [1, null] }])
      expectIssue(
        () =>
          applyPatch({ a: [1, null], b: false }, [
            { op: "test", path: "", value },
          ]),
        "test",
        0,
      );
  });

  it("runs atomically and reports the failing step without modifying the recipe", () => {
    const source = { a: 1 };
    const patch: PatchOperation[] = [
      { op: "replace", path: "/a", value: 2 },
      { op: "test", path: "/a", value: 1 },
      { op: "add", path: "/b", value: true },
    ];
    const original = JSON.stringify(patch);
    expectIssue(() => applyPatch(source, patch), "test", 1);
    expect(source).toEqual({ a: 1 });
    expect(JSON.stringify(patch)).toBe(original);
  });

  it("copies independently and allows copying into descendants", () => {
    const result = applyPatch({ a: { value: 1 } }, [
      { op: "copy", from: "/a", path: "/b" },
      { op: "replace", path: "/b/value", value: 2 },
      { op: "copy", from: "/a", path: "/a/child" },
    ]);
    expect(result).toEqual({
      a: { value: 1, child: { value: 1 } },
      b: { value: 2 },
    });
  });

  it.each(["/a/child", "/a/~1"])(
    "rejects moving a parent into its descendant %s",
    (path) => {
      expectIssue(
        () => applyPatch({ a: {} }, [{ op: "move", from: "/a", path }]),
        "descendant",
        0,
      );
    },
  );
  it("does not confuse sibling prefixes with descendants", () => {
    expect(
      applyPatch({ a: 1, ab: {} }, [{ op: "move", from: "/a", path: "/ab/x" }]),
    ).toEqual({ ab: { x: 1 } });
  });
  it.each([
    "/01",
    "/-1",
    "/+1",
    "/1.0",
    "/1e0",
    "/9007199254740992",
    "/2",
    "/-",
    "/length",
  ])("rejects invalid existing array indices %s", (path) => {
    expectIssue(() => applyPatch([1], [{ op: "remove", path }]), "index", 0);
  });
  it.each<PatchOperation>([
    { op: "add", path: "/missing/child", value: true },
    { op: "replace", path: "/missing", value: true },
    { op: "remove", path: "/missing" },
    { op: "copy", path: "/a", from: "/missing" },
    { op: "test", path: "/missing", value: null },
    { op: "move", path: "/missing", from: "/missing" },
    { op: "add", path: "/a/child", value: 1 },
  ])("rejects absent parents and values ($op $path)", (operation) => {
    expectIssue(() => applyPatch({ a: null }, [operation]), "missing", 0);
  });

  it("treats prototype-looking keys as own data and never traverses inherited properties", () => {
    const result = applyPatch(
      {},
      parsePatch(
        '[{"op":"add","path":"/__proto__","value":{"polluted":true}},{"op":"add","path":"/constructor","value":{"prototype":{"flag":1}}},{"op":"replace","path":"/__proto__/polluted","value":false}]',
      ),
    );
    expect(Object.hasOwn(result as object, "__proto__")).toBe(true);
    expect(JSON.stringify(result)).toContain('"polluted":false');
    expect(Object.prototype).not.toHaveProperty("polluted");
    expectIssue(
      () =>
        applyPatch({}, [
          { op: "add", path: "/__proto__/polluted", value: true },
        ]),
      "missing",
      0,
    );
    expectIssue(
      () => applyPatch({}, [{ op: "test", path: "/constructor", value: {} }]),
      "missing",
      0,
    );
  });

  it("imports standard patch arrays, ignores extension fields and round-trips recipes", () => {
    const patch = parsePatch(
      '\uFEFF[{"op":"add","path":"/x","value":false,"comment":"ignored"}]',
    );
    expect(patch).toEqual([{ op: "add", path: "/x", value: false }]);
    expect(parsePatch(serializePatch(patch))).toEqual(patch);
    expect(parsePatch("[]")).toEqual([]);
  });
  it.each([
    "{}",
    "[null]",
    '[{"op":"unknown","path":""}]',
    '[{"op":"add","path":""}]',
    '[{"op":"copy","path":""}]',
    '[{"op":"remove"}]',
  ])("rejects malformed recipes %s", (text) => {
    expectIssue(() => parsePatch(text), "recipe");
  });
  it.each(["#", "#/paths", "info/title", "/a~", "/a~2"])(
    "rejects invalid JSON Pointers %s",
    (pointer) => {
      expectIssue(() => parseTransformPointer(pointer), "pointer");
    },
  );
  it("preserves percent escapes and Unicode in pointers", () => {
    expect(parseTransformPointer("/%2F/имя/~0/~1/")).toEqual([
      "%2F",
      "имя",
      "~",
      "/",
      "",
    ]);
  });

  it("bounds malformed, oversized, deeply nested and unsafe JSON values", () => {
    expectIssue(() => parseTransformValue("not json"), "json");
    expectIssue(() => parseTransformValue("1e999"), "json");
    expectIssue(() => parseTransformValue("9007199254740992"), "json");
    expectIssue(
      () =>
        parseTransformValue(JSON.stringify("x".repeat(MAX_TRANSFORM_BYTES))),
      "limit",
    );
    expectIssue(
      () => parseTransformValue("[".repeat(66) + "0" + "]".repeat(66)),
      "limit",
    );
    expectIssue(
      () => parseTransformValue(JSON.stringify(Array(50001).fill(null))),
      "limit",
    );
    expectIssue(
      () =>
        parsePatch(
          JSON.stringify(Array(101).fill({ op: "remove", path: "/x" })),
        ),
      "limit",
    );
  });
  it("bounds cumulative copy growth and resulting nesting", () => {
    const operations: PatchOperation[] = Array.from({ length: 20 }, () => ({
      op: "copy",
      path: "/next",
      from: "",
    }));
    expectIssue(
      () => applyPatch({ text: "x".repeat(150000) }, operations),
      "limit",
    );
    expectIssue(
      () =>
        applyPatch(
          {},
          Array.from({ length: 65 }, () => ({
            op: "copy",
            path: "/nested",
            from: "",
          })),
        ),
      "limit",
    );
  });
});

describe("OpenAPI transformation previews", () => {
  it("preserves untouched operations and exports JSON and YAML", () => {
    const text = YAML.stringify(api);
    const source = readTransformSource(text);
    const preview = previewTransformation(source, [
      { op: "test", path: "/info/version", value: "1" },
      { op: "replace", path: "/info/version", value: "2" },
      { op: "add", path: "/servers", value: [{ url: "https://example.com" }] },
    ]);
    expect(source.format).toBe("yaml");
    expect(preview.source.text).toBe(text);
    const result = JSON.parse(serializeTransformation(preview, "json"));
    expect(result.paths).toEqual(api.paths);
    expect(result.info.version).toBe("2");
    expect(YAML.parse(serializeTransformation(preview, "yaml"))).toEqual(
      result,
    );
    expect(preview.changes.map((entry) => [entry.kind, entry.path])).toEqual([
      ["changed", "/info/version"],
      ["added", "/servers"],
    ]);
    expect(source.document).toEqual(api);
  });
  it("works with Swagger 2 as well as OpenAPI 3", () => {
    const source = readTransformSource(
      JSON.stringify({
        swagger: "2.0",
        info: api.info,
        paths: api.paths,
        host: "example.com",
      }),
    );
    expect(source.format).toBe("json");
    expect(
      previewTransformation(source, [
        { op: "replace", path: "/host", value: "staging.example.com" },
      ]).document,
    ).toMatchObject({ host: "staging.example.com", swagger: "2.0" });
  });
  it("rejects invalid sources and final results without rejecting temporary intermediate states", () => {
    expectIssue(() => readTransformSource("info: ["), "source");
    expectIssue(() => readTransformSource("{}"), "source");
    const source = readTransformSource(JSON.stringify(api));
    expectIssue(
      () => previewTransformation(source, [{ op: "remove", path: "/info" }]),
      "result",
    );
    expectIssue(
      () => previewTransformation(source, [{ op: "remove", path: "" }]),
      "result",
    );
    expect(
      previewTransformation(source, [
        { op: "remove", path: "/info" },
        { op: "add", path: "/info", value: api.info },
      ]).changes,
    ).toEqual([]);
  });
  it("rejects duplicate YAML keys, cycles, unknown tags and excessive alias expansion", () => {
    for (const text of [
      "openapi: 3.1.0\nopenapi: 3.0.0",
      "a: &a\n  self: *a",
      "a: !custom value",
      "a: .inf",
    ])
      expect(() => readTransformSource(text)).toThrow(TransformError);
  });
  it("expands ordinary YAML aliases into independent values", () => {
    const source = readTransformSource(
      'openapi: 3.1.0\ninfo: {title: Shop, version: "1"}\npaths: {}\nx-a: &a {value: 1}\nx-b: *a\n',
    );
    expect(
      previewTransformation(source, [
        { op: "replace", path: "/x-b/value", value: 2 },
      ]).document,
    ).toMatchObject({ "x-a": { value: 1 }, "x-b": { value: 2 } });
  });
  it("provides escaped source pointers, including the root and array items", () => {
    expect(
      listTransformPointers({ "a/b~": [true], "": null }).map(
        (entry) => entry.path,
      ),
    ).toEqual(["", "/a~1b~0", "/a~1b~0/0", "/"]);
  });
  it("summarizes changed arrays, detects removals and truncates large reports", () => {
    const result = describeTransformChanges({ a: [1], b: null }, { a: [1, 2] });
    expect(result.changes).toEqual([
      { path: "/a", kind: "changed", before: "[1 items]", after: "[2 items]" },
      { path: "/b", kind: "removed", before: "null" },
    ]);
    const large = describeTransformChanges(
      {},
      Object.fromEntries(
        Array.from({ length: 201 }, (_, index) => [String(index), index]),
      ),
    );
    expect(large.truncated).toBe(true);
    expect(large.changes).toHaveLength(200);
    expect(describeTransformChanges({ x: 1 }, { x: 1 })).toEqual({
      changes: [],
      truncated: false,
    });
  });
});
