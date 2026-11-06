import { describe, expect, it } from "vitest";
import {
  defaultLcHarRules,
  inspectLcHar,
  importLcOperations,
  normalizeLcHarRules,
} from "./consistency-import";
import { emptyLcProject, MAX_LC_PROJECT } from "./consistency-model";
import { analyzeConsistency } from "./consistency-engine";
const p = emptyLcProject(),
  objects = p.objects,
  rules = defaultLcHarRules("value");
const entry = (method = "GET", value = 0, offset = 0) => ({
  startedDateTime: new Date(Date.UTC(2026, 0, 1) + offset).toISOString(),
  time: 1,
  request: {
    method,
    url: "https://example.test/value",
    headers: [{ name: "X-Client", value: "client-a" }],
    postData: { text: JSON.stringify({ value }) },
  },
  response: {
    status: 200,
    content: { mimeType: "application/json", text: JSON.stringify({ value }) },
  },
});
const har = (entries: unknown[]) => JSON.stringify({ log: { entries } });
describe("concurrent operation history imports", () => {
  it("imports JSON and NDJSON operations without changing the source", () => {
    const op = {
        id: "r",
        client: "a",
        objectId: "value",
        method: "read",
        start: 0,
        end: 1,
        input: null,
        output: 0,
      },
      text = JSON.stringify(op);
    expect(
      importLcOperations(`[${text}]`, p.histories[0], objects).operations,
    ).toEqual([op]);
    expect(
      importLcOperations(`\n${text}\r\n`, p.histories[0], objects).operations,
    ).toEqual([op]);
    expect(p.histories[0].operations).toEqual([]);
    const existing = importLcOperations(text, p.histories[0], objects);
    expect(() => importLcOperations(text, existing, objects, true)).toThrow(
      "operation",
    );
    expect(existing.operations).toEqual([op]);
  });
  it("rejects oversized text and excessive NDJSON lines before expanding data", () => {
    expect(() =>
      importLcOperations(
        " ".repeat(MAX_LC_PROJECT + 1),
        p.histories[0],
        objects,
      ),
    ).toThrow("limit");
    expect(() =>
      importLcOperations(
        Array(25).fill("{}").join("\n"),
        p.histories[0],
        objects,
      ),
    ).toThrow("limit");
    expect(() => importLcOperations("{", p.histories[0], objects)).toThrow(
      "json",
    );
  });
  it("maps exact methods and paths into relative microsecond intervals and detects stale reads", async () => {
    const preview = inspectLcHar(
      har([entry("PUT", 1), entry("GET", 0, 2)]),
      rules,
      objects,
    );
    expect(preview.skipped).toEqual([]);
    expect(preview.origin).toBe("2026-01-01T00:00:00.000Z");
    expect(preview.operations.map((op) => [op.start, op.end])).toEqual([
      [0, 1000],
      [2000, 3000],
    ]);
    expect(preview.operations.map((op) => op.client)).toEqual([
      "capture-1",
      "capture-2",
    ]);
    p.histories[0].operations = preview.operations;
    expect((await analyzeConsistency(p, "history-1")).verdict).toBe("invalid");
    p.histories[0].operations = [];
  });
  it("retains overlapping durations, supports explicit sequential-client headers and rejects impossible client timelines", () => {
    const first = entry("PUT", 1);
    first.time = 5;
    const second = entry("GET", 1, 2);
    expect(
      inspectLcHar(har([first, second]), rules, objects).operations[0].end,
    ).toBe(5000);
    expect(() =>
      inspectLcHar(har([first, second]), rules, objects, "x-client"),
    ).toThrow("client-overlap");
    first.time = 1;
    expect(
      inspectLcHar(
        har([first, second]),
        rules,
        objects,
        "X-Client",
      ).operations.map((op) => op.client),
    ).toEqual(["client-a", "client-a"]);
  });
  it("diagnoses every rejected entry instead of silently truncating or guessing", () => {
    const unmatched = entry();
    unmatched.request.url += "/other";
    const status = entry();
    status.response.status = 500;
    const timing = entry();
    timing.time = 0;
    const body = entry();
    body.response.content.text = "invalid";
    const client = entry();
    client.request.headers = [];
    const preview = inspectLcHar(
      har([null, unmatched, status, timing, body, client]),
      rules,
      objects,
      "X-Client",
    );
    expect(preview.operations).toEqual([]);
    expect(preview.skipped.map((skip) => skip.reason)).toEqual([
      "entry",
      "unmatched",
      "status",
      "timing",
      "body",
      "client",
    ]);
    expect(preview.origin).toBeNull();
    expect(() =>
      inspectLcHar(
        har(Array.from({ length: 25 }, (_, i) => entry("GET", 0, i * 2))),
        rules,
        objects,
      ),
    ).toThrow("limit");
  });
  it("decodes base64 UTF-8 response JSON and RFC 6901 pointers without reading inherited properties", () => {
    const e = entry();
    const encoded = {
      ...e,
      response: {
        ...e.response,
        content: {
          ...e.response.content,
          text: Buffer.from('{"a/b":{"~":"Привет"}}').toString("base64"),
          encoding: "base64",
        },
      },
    };
    const mapping = [
      { ...rules[1], output: { kind: "body", pointer: "/a~1b/~0" } },
    ];
    expect(
      inspectLcHar(har([encoded]), mapping, objects).operations[0].output,
    ).toBe("Привет");
    expect(
      inspectLcHar(
        har([e]),
        [{ ...rules[1], output: { kind: "body", pointer: "/constructor" } }],
        objects,
      ).skipped[0].reason,
    ).toBe("body");
    encoded.response.content.text = "/w==";
    expect(
      inspectLcHar(har([encoded]), mapping, objects).skipped[0].reason,
    ).toBe("body");
  });
  it("validates mapping references, duplicate routes and ambiguous client headers", () => {
    expect(() => normalizeLcHarRules([...rules, rules[0]], objects)).toThrow(
      "capture",
    );
    expect(() =>
      normalizeLcHarRules([{ ...rules[0], objectId: "missing" }], objects),
    ).toThrow("reference");
    expect(() =>
      normalizeLcHarRules(
        [{ ...rules[1], output: { kind: "body", pointer: "/bad~2" } }],
        objects,
      ),
    ).toThrow("capture");
    const e = entry();
    e.request.headers.push({ name: "x-client", value: "client-b" });
    expect(
      inspectLcHar(har([e]), rules, objects, "X-Client").skipped[0].reason,
    ).toBe("client");
    expect(() => inspectLcHar(har([]), rules, objects, "Bad Header")).toThrow(
      "capture",
    );
  });
});
