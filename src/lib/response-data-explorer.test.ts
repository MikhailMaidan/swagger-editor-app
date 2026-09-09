import { describe, expect, it } from "vitest";
import {
  createExplorerTable,
  escapeExplorerPointer,
  explorerCell,
  exportExplorerCsv,
  filterExplorerRows,
  indexResponseJson,
  isExplorerPointer,
  MAX_EXPLORER_BYTES,
  MAX_EXPLORER_NODES,
  previewJsonValue,
  searchExplorerNodes,
  type JsonValue,
} from "./response-data-explorer";

function index(body: string) {
  const result = indexResponseJson(body);
  if (!result.ok) throw new Error(result.issue);
  return result;
}
function table(value: JsonValue) {
  const result = createExplorerTable(value);
  if (!result.ok) throw new Error(result.issue);
  return result;
}

describe("response data explorer", () => {
  it("indexes JSON hierarchy in source order with exact pointer escaping", () => {
    const result = index('{"items":[{"a/b":{"~id":7}}],"":null}');
    expect([...result.nodes.keys()]).toEqual([
      "",
      "/items",
      "/items/0",
      "/items/0/a~1b",
      "/items/0/a~1b/~0id",
      "/",
    ]);
    expect(result.nodes.get("/items/0/a~1b/~0id")).toMatchObject({
      parent: "/items/0/a~1b",
      key: "~id",
      type: "number",
      value: 7,
      children: [],
    });
    expect(result.nodes.get("/")?.type).toBe("null");
    expect(result.nodes.get("")?.children).toEqual(["/items", "/"]);
    expect(escapeExplorerPointer("~/")).toBe("~0~1");
  });

  it("handles primitive roots and prototype-shaped own keys without following inherited properties", () => {
    for (const body of ["null", "false", "0", '""'])
      expect(index(body).nodes.size).toBe(1);
    const result = index('{"__proto__":{"constructor":"value"}}');
    expect(result.nodes.get("/__proto__/constructor")?.value).toBe("value");
    expect(result.nodes.has("/constructor")).toBe(false);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
  });

  it.each(["", "/", "/items/0", "/a~1b/~0id", "/~01"])(
    "accepts JSON Pointer syntax %s",
    (pointer) => {
      expect(isExplorerPointer(pointer)).toBe(true);
    },
  );
  it.each(["items", "#/items", "/~", "/bad~2"])(
    "rejects invalid pointer syntax %s",
    (pointer) => {
      expect(isExplorerPointer(pointer)).toBe(false);
    },
  );

  it("searches full scalar values, keys, and paths with AND terms and type filters", () => {
    const result = index(
      JSON.stringify({
        users: [{ name: "Ada Lovelace", active: false }],
        other: "x".repeat(300) + "needle",
        count: null,
      }),
    );
    expect(
      searchExplorerNodes(result, "USERS ada").map((node) => node.pointer),
    ).toEqual(["/users/0/name"]);
    expect(
      searchExplorerNodes(result, "needle", "string").map(
        (node) => node.pointer,
      ),
    ).toEqual(["/other"]);
    expect(
      searchExplorerNodes(result, "", "boolean").map((node) => node.value),
    ).toEqual([false]);
    expect(searchExplorerNodes(result, "null", "null")).toHaveLength(1);
    expect(searchExplorerNodes(result, "users needle")).toHaveLength(0);
    expect(searchExplorerNodes(result, "")).toHaveLength(result.nodes.size);
  });

  it("summarizes containers and marks truncated scalar previews", () => {
    expect(previewJsonValue([1, 2])).toBe("[2]");
    expect(previewJsonValue({ a: 1 })).toBe("{1}");
    expect(previewJsonValue(null)).toBe("null");
    expect(previewJsonValue("abcdef", 4)).toBe('"abc…');
  });

  it("rejects malformed JSON, oversized UTF-8 bodies, excessive depth, and excessive nodes", () => {
    expect(indexResponseJson("not json")).toEqual({
      ok: false,
      issue: "invalid-json",
    });
    for (const body of [
      "a".repeat(MAX_EXPLORER_BYTES + 1),
      JSON.stringify("я".repeat(MAX_EXPLORER_BYTES / 2)),
    ]) {
      expect(indexResponseJson(body)).toEqual({
        ok: false,
        issue: "size-limit",
      });
    }
    expect(indexResponseJson("[".repeat(66) + "0" + "]".repeat(66))).toEqual({
      ok: false,
      issue: "structure-limit",
    });
    expect(
      indexResponseJson(JSON.stringify(Array(MAX_EXPLORER_NODES).fill(null))),
    ).toEqual({ ok: false, issue: "structure-limit" });
    expect(
      indexResponseJson(
        JSON.stringify(Array(MAX_EXPLORER_NODES - 1).fill(null)),
      ).ok,
    ).toBe(true);
  });

  it.each([
    "9007199254740993",
    "-9007199254740993",
    "1e999",
    '{"nested":[9007199254740993]}',
  ])("blocks unsafe numeric exports for %s", (body) => {
    expect(indexResponseJson(body)).toEqual({
      ok: false,
      issue: "unsafe-number",
    });
  });

  it("unions object columns while keeping null and missing distinct", () => {
    const result = table([
      { id: 1, name: "Ada" },
      { id: 2, extra: null },
    ]);
    expect(result.columns).toEqual(["id", "name", "extra"]);
    expect(explorerCell(result.rows[0], "extra")).toBeUndefined();
    expect(explorerCell(result.rows[1], "extra")).toBeNull();
    expect(explorerCell(result.rows[0], "constructor")).toBeUndefined();
    expect(explorerCell(null, "x")).toBeUndefined();
    expect(explorerCell({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it("uses one value column for primitive, mixed, empty, and empty-object arrays", () => {
    for (const rows of [[], [1, null, false, ""], [{ a: 1 }, 2], [{}, {}]])
      expect(table(rows).columns).toEqual([null]);
    expect(table([{ "": 1 }]).columns).toEqual([""]);
  });

  it("reports table limits without silently dropping rows or columns", () => {
    expect(createExplorerTable({})).toEqual({ ok: false, issue: "not-array" });
    expect(createExplorerTable(Array(5001).fill(0))).toEqual({
      ok: false,
      issue: "row-limit",
    });
    expect(
      createExplorerTable([
        Object.fromEntries(
          Array.from({ length: 65 }, (_, i) => [String(i), i]),
        ),
      ]),
    ).toEqual({ ok: false, issue: "column-limit" });
    expect(createExplorerTable(Array(5000).fill(0)).ok).toBe(true);
  });

  it("filters across selected columns and retains original row indices", () => {
    const result = table([
      { name: "Ada", team: "Blue" },
      { name: "Grace", team: "Ada" },
      { name: "Lin", team: null },
    ]);
    expect(
      filterExplorerRows(result, ["name"], "ADA").map((row) => row.index),
    ).toEqual([0]);
    expect(
      filterExplorerRows(result, ["team"], "ada").map((row) => row.index),
    ).toEqual([1]);
    expect(
      filterExplorerRows(result, ["team"], "null").map((row) => row.index),
    ).toEqual([2]);
    expect(filterExplorerRows(result, [], "ada")).toHaveLength(0);
    expect(filterExplorerRows(result, ["name"], "")).toHaveLength(3);
  });

  it("exports all filtered rows and only selected columns as BOM-prefixed CSV", () => {
    const result = table(
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        group: i % 2 ? "odd" : "even",
      })),
    );
    const csv = exportExplorerCsv(result, ["group"], "odd");
    expect(csv.startsWith('\uFEFF"#","group"\r\n')).toBe(true);
    expect(csv).toContain('"59","odd"\r\n');
    expect(csv).not.toContain('"id"');
    expect(csv.split("\r\n")).toHaveLength(32);
  });

  it("quotes commas, quotes and newlines, protects formulas, and preserves numeric cells", () => {
    const result = table([
      { "=header": " \t=SUM(1,2)", text: 'a,"b"\nc', number: -3, empty: null },
      { "=header": "\0@cmd", text: "plain" },
    ]);
    const csv = exportExplorerCsv(result, result.columns, "");
    expect(csv).toContain('"\'=header"');
    expect(csv).toContain('"\' \t=SUM(1,2)"');
    expect(csv).toContain('"a,""b""\nc"');
    expect(csv).toContain('"-3","null"');
    expect(csv).toContain('"\'@cmd","plain","",""');
    expect(csv).not.toContain("\0");
  });

  it("serializes nested and heterogeneous values completely and handles empty-key columns", () => {
    const result = table([{ "": { nested: [1, 2] } }]);
    expect(exportExplorerCsv(result, [""], "")).toContain(
      '"{""nested"":[1,2]}"',
    );
    expect(
      exportExplorerCsv(table(["x", null, false]), [null], "", "Значение"),
    ).toContain('"#","Значение"');
    expect(exportExplorerCsv(table([]), [null], "")).toBe(
      '\uFEFF"#","Value"\r\n',
    );
  });
});
