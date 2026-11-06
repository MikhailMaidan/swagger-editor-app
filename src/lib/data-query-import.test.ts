import { describe, expect, it } from "vitest";
import {
  importDqText,
  extractDqRows,
  readDqHar,
  dqDatasetInventory,
  exportDqCsv,
} from "./data-query-import";
import { MAX_DQ_IMPORT } from "./data-query-model";
describe("API dataset import and export", () => {
  it("extracts nested object records, preserves scalar types and supports explicit scalar wrapping", () => {
    expect(
      importDqText(
        '{"data":{"rows":[{"id":1,"active":false},{"id":"1","active":null}]}}',
        "json",
        "/data/rows",
      ),
    ).toEqual([
      { active: false, id: 1 },
      { active: null, id: "1" },
    ]);
    expect(importDqText('[1,"1",null]', "json", "", "values")).toEqual([
      { value: 1 },
      { value: "1" },
      { value: null },
    ]);
    expect(importDqText('{"id":1}', "json")).toEqual([{ id: 1 }]);
    expect(() => importDqText("[1]", "json")).toThrow("import");
    expect(() => extractDqRows({}, "/missing")).toThrow("reference");
  });
  it("reads NDJSON with blank lines and BOMs without silently truncating combined arrays", () => {
    expect(importDqText('\uFEFF{"id":1}\r\n\r\n{"id":2}\n', "ndjson")).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
    expect(() => importDqText('{"id":1}\nnot-json', "ndjson")).toThrow("json");
    const list = JSON.stringify(
      Array.from({ length: 1100 }, () => ({ id: 1 })),
    );
    expect(() => importDqText(`${list}\n${list}`, "ndjson")).toThrow("limit");
    expect(() =>
      importDqText(
        JSON.stringify(Array.from({ length: 2001 }, () => 1)),
        "json",
        "",
        "values",
      ),
    ).toThrow("limit");
  });
  it("parses quoted CSV fields, commas, doubled quotes and CRLF without guessing column types", () => {
    expect(
      importDqText(
        '\uFEFFid,note,active\r\n001,"hello, ""Ada""\r\nnext",false\r\n',
        "csv",
      ),
    ).toEqual([{ id: "001", note: 'hello, "Ada"\r\nnext', active: "false" }]);
    const own = importDqText("__proto__,constructor\nkept,also-kept", "csv")[0];
    expect(Object.hasOwn(own, "__proto__")).toBe(true);
    expect(own.__proto__).toBe("kept");
  });
  it.each([
    "id,id\n1,2",
    "id,note\n1",
    'id\n"unfinished',
    'id\n"closed"suffix',
    ",note\na,b",
  ])("rejects malformed or ambiguous CSV source", (text) => {
    expect(() => importDqText(text, "csv")).toThrow("import");
  });
  it("bounds import bytes and records and never resolves inherited pointer fields", () => {
    expect(() => importDqText(" ".repeat(MAX_DQ_IMPORT + 1), "json")).toThrow(
      "limit",
    );
    expect(() => extractDqRows({}, "/constructor")).toThrow("reference");
    expect(() =>
      importDqText(JSON.stringify([{ text: "x".repeat(17000) }]), "json"),
    ).toThrow("limit");
  });
  it("discovers HAR JSON captures including UTF-8 Base64, while reporting unsupported captures", () => {
    const content = (
      text: string,
      mimeType = "application/json",
      encoding?: string,
    ) => ({
      response: {
        status: 200,
        content: { text, mimeType, ...(encoding ? { encoding } : {}) },
      },
      request: {
        method: "GET",
        url: "https://example.test/private?token=secret",
      },
    });
    const source = JSON.stringify({
      log: {
        entries: [
          content('[{"id":1}]'),
          content(
            Buffer.from('{"rows":[{"name":"Ada"}]}').toString("base64"),
            "application/problem+json",
            "base64",
          ),
          content("<html/>", "text/html"),
          content("%%%", "application/json", "base64"),
          content("/w==", "application/json", "base64"),
        ],
      },
    });
    const har = readDqHar(source);
    expect(har.skipped).toBe(3);
    expect(har.entries.map((e) => e.index)).toEqual([0, 1]);
    expect(extractDqRows(har.entries[1].value, "/rows")).toEqual([
      { name: "Ada" },
    ]);
  });
  it("inventories escaped object pointers and distinguishes missing, null and array types", () => {
    const inventory = dqDatasetInventory([
      { "a/b": { "~": null }, items: [1] },
      { items: [] },
    ]);
    expect(inventory.fields.find((f) => f.pointer === "/a~1b/~0")).toEqual({
      pointer: "/a~1b/~0",
      kinds: ["null"],
      present: 1,
      missing: 1,
    });
    expect(inventory.fields.find((f) => f.pointer === "/items")?.kinds).toEqual(
      ["array"],
    );
    expect(inventory.truncated).toBe(false);
  });
  it("exports complete CSV cells with formula guards, typed nulls, missing cells and nested JSON", () => {
    const csv = exportDqCsv([
      {
        name: "=SUM(A1)",
        note: 'say "hi"\nnext',
        value: null,
        object: { id: 1 },
      },
      { name: "Ada" },
    ]);
    expect(csv).toContain('"\'=SUM(A1)"');
    expect(csv).toContain('"say ""hi""\nnext"');
    expect(csv).toContain('"null"');
    expect(csv).toContain('"{""id"":1}"');
    expect(csv.split("\r\n").at(-1)).toBe('"Ada","","",""');
  });
});
