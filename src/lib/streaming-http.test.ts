import { describe, expect, it } from "vitest";
import {
  StreamingDecoder,
  MAX_STREAM_RECORD_BYTES,
  MAX_STREAM_PROJECT_BYTES,
  appendStreamRecord,
  defaultStreamCase,
  decodeStreamWire,
  demoStreamProject,
  emptyStreamProject,
  normalizeStreamCase,
  parseStreamHeaders,
  parseStreamProject,
  parseStreamTranscript,
  replayStreamCase,
  runStreamCases,
  serializeStreamProject,
  serializeStreamTranscript,
  streamCaseFromTranscript,
  streamCasesReport,
  streamLastEventIdHeader,
  validateStreamConnection,
  type StreamCheck,
  type StreamFormat,
  type StreamFrame,
  type StreamRecord,
} from "./streaming-http";

const bytes = (s: string) => new TextEncoder().encode(s);
const options = { requireFinalNewline: false, ignoreEmptyLines: true };
function decode(
  source: string | Uint8Array,
  format: StreamFormat = "sse",
  size = 1,
  settings = options,
) {
  const parser = new StreamingDecoder(format, settings),
    records: StreamFrame[] = [],
    data = typeof source === "string" ? bytes(source) : source;
  const emit = (frame: StreamFrame) => {
    records.push(frame);
  };
  let error = "none";
  try {
    for (let offset = 0; offset < data.length; offset += size)
      parser.push(data.subarray(offset, offset + size), emit);
    parser.finish(emit);
  } catch (e) {
    error = (e as { code: string }).code;
  }
  return { parser, records, error };
}
const throws = (work: () => unknown, code: string) =>
  expect(work).toThrowError(expect.objectContaining({ code }));
const check = (patch: Partial<StreamCheck> = {}): StreamCheck => ({
  name: "Check",
  select: "last",
  index: 0,
  event: "",
  textMode: "any",
  text: "",
  json: [],
  ...patch,
});

describe("incremental SSE framing", () => {
  it.each([1, 2, 3, 7, 64, 4096])(
    "handles BOM, split Unicode, CRLF, comments, event names and multiline data at %i-byte boundaries",
    (size) => {
      const parsed = decode(
        "\uFEFF: beat\r\nretry: 123\r\nid: 42\r\nevent: task\r\ndata: Привет 🌍\r\ndata: two\r\n\r\ndata:\r\n\r\n",
        "sse",
        size,
      );
      expect(parsed.error).toBe("none");
      expect(parsed.records.map((r) => [r.data, r.event, r.id])).toEqual([
        ["Привет 🌍\ntwo", "task", "42"],
        ["", "message", "42"],
      ]);
      expect(parsed.parser).toMatchObject({
        comments: 1,
        retryMs: 123,
        lastEventId: "42",
      });
    },
  );
  it("accepts lone CR/LF, strips one field space, compares field names literally and ignores unknown fields", () => {
    const parsed = decode(
      "event: ignored\r\rid: first\rdata:  leading\rData: ignored\rfoo: bar\r\rdata\n\nid:\n\ndata: last\n\n",
    );
    expect(parsed.records.map((r) => [r.data, r.event, r.id])).toEqual([
      [" leading", "message", "first"],
      ["", "message", "first"],
      ["last", "message", ""],
    ]);
  });
  it("commits ids on blank blocks, ignores null-containing ids and does not dispatch incomplete events at EOF", () => {
    const parsed = decode(
      "id: saved\n\nid: bad\0value\ndata: ok\n\nid: unfinished\ndata: discard\n",
    );
    expect(parsed.records.map((r) => [r.data, r.id])).toEqual([
      ["ok", "saved"],
    ]);
    expect(parsed.parser.lastEventId).toBe("saved");
    expect(decode("data: never").records).toEqual([]);
    expect(decode("data: never\n").records).toEqual([]);
    expect(decode("data: yes\n\n").records).toHaveLength(1);
  });
  it("uses a fresh id buffer on each response while retaining the resume cursor until a block commits", () => {
    const parser = new StreamingDecoder("sse", options, "previous"),
      records: StreamFrame[] = [];
    parser.push(bytes("data: next\n"), (r) => {
      records.push(r);
    });
    expect(parser.lastEventId).toBe("previous");
    parser.push(bytes("\n"), (r) => {
      records.push(r);
    });
    expect(records[0].id).toBe("");
    expect(parser.lastEventId).toBe("");
  });
  it("accepts only ASCII-digit retry fields and never wraps large hints into short delays", () => {
    expect(
      decode("retry: 0010\nretry: +2\nretry: 1.5\nretry: -1\nretry: １２\n\n")
        .parser.retryMs,
    ).toBe(10);
    expect(decode(`retry: ${"9".repeat(200)}\n\n`).parser.retryMs).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
  it("decodes invalid SSE UTF-8 using replacement characters instead of dropping the record", () => {
    const wire = new Uint8Array([...bytes("data: "), 0xff, ...bytes("\n\n")]);
    expect(decode(wire).records[0].data).toBe("\uFFFD");
  });
  it("bounds fields, lines, accumulated event bytes and record count, and permits caller-directed stopping", () => {
    expect(
      decode(
        `data: ${"x".repeat(MAX_STREAM_RECORD_BYTES + 1)}\n\n`,
        "sse",
        4096,
      ).error,
    ).toBe("limit");
    expect(decode(`id: ${"x".repeat(1025)}\n\n`).error).toBe("limit");
    expect(decode(`event: ${"x".repeat(201)}\n\n`).error).toBe("limit");
    expect(
      decode(
        ("data: " + "x".repeat(1000) + "\n").repeat(66) + "\n",
        "sse",
        4096,
      ).error,
    ).toBe("limit");
    const parser = new StreamingDecoder("sse", options),
      records: StreamFrame[] = [];
    parser.push(bytes("data: first\n\ndata: second\n\n"), (frame) => {
      records.push(frame);
      return false;
    });
    parser.finish(() => {});
    expect(records).toHaveLength(1);
    throws(() => parser.push(bytes("data: late\n\n"), () => {}), "framing");
  });
});

describe("incremental NDJSON framing", () => {
  it.each([1, 2, 3, 7, 64, 4096])(
    "accepts split UTF-8, CRLF and JSON primitive values at %i-byte boundaries",
    (size) => {
      const parsed = decode(
        '\n{"city":"東京 🌸"}\r\n42\ntrue\nnull\n[1,2]\n"text"',
        "ndjson",
        size,
      );
      expect(parsed.error).toBe("none");
      expect(parsed.records.map((r) => JSON.parse(r.data))).toEqual([
        { city: "東京 🌸" },
        42,
        true,
        null,
        [1, 2],
        "text",
      ]);
    },
  );
  it("keeps valid prefixes before malformed UTF-8 independently of chunk boundaries", () => {
    const wire = new Uint8Array([
      ...bytes('{"ok":true}\n"'),
      0xff,
      ...bytes('"\n'),
    ]);
    for (const size of [1, 2, 7, 4096]) {
      const parsed = decode(wire, "ndjson", size);
      expect(parsed.error).toBe("utf8");
      expect(parsed.records.map((r) => r.data)).toEqual(['{"ok":true}']);
    }
  });
  it("supports strict final-newline and empty-line policies without accepting bare CR or BOM records", () => {
    expect(
      decode("{}", "ndjson", 3, { ...options, requireFinalNewline: true })
        .error,
    ).toBe("framing");
    expect(
      decode("{}\n", "ndjson", 3, { ...options, requireFinalNewline: true })
        .error,
    ).toBe("none");
    expect(
      decode("\n", "ndjson", 1, { ...options, ignoreEmptyLines: false }).error,
    ).toBe("json");
    expect(decode("{}\r{}\n", "ndjson").error).toBe("framing");
    expect(decode("{}\r", "ndjson").error).toBe("framing");
    expect(decode("\uFEFF{}\n", "ndjson").error).toBe("json");
    expect(decode(" \n", "ndjson").error).toBe("json");
  });
  it("rejects malformed JSON, unsafe numbers, oversized records and more than 1000 records", () => {
    for (const wire of ["{bad}\n", "9007199254740993\n", "1e999\n"])
      expect(decode(wire, "ndjson").error).toBe("json");
    expect(
      decode('"' + "x".repeat(MAX_STREAM_RECORD_BYTES) + '"\n', "ndjson", 4096)
        .error,
    ).toBe("limit");
    const parsed = decode("1\n".repeat(1001), "ndjson", 4096);
    expect(parsed.error).toBe("limit");
    expect(parsed.records).toHaveLength(1000);
  });
});

describe("stream replay cases and portable definitions", () => {
  it("replays raw Base64 byte fixtures for malformed UTF-8 across every byte boundary", async () => {
    const raw = new Uint8Array([...bytes('1\n"'), 0xff, ...bytes('"\n')]);
    const encoded = btoa(
      Array.from(raw, (b) => String.fromCharCode(b)).join(""),
    );
    const c = {
      ...defaultStreamCase(),
      format: "ndjson" as const,
      wireEncoding: "base64" as const,
      wire: encoded,
      expectedError: "utf8" as const,
    };
    expect(decodeStreamWire(encoded, "base64")).toEqual(raw);
    const p = { ...emptyStreamProject(), cases: [c] },
      report = await runStreamCases(p, { sweep: true });
    expect(
      report.results.every(
        (r) => r.status === "passed" && r.error === "utf8" && r.count === 1,
      ),
    ).toBe(true);
    expect(
      parseStreamProject(serializeStreamProject(p)).cases[0].wireEncoding,
    ).toBe("base64");
    throws(() => decodeStreamWire("not base64!", "base64"), "case");
    throws(() => decodeStreamWire("YR==", "base64"), "case");
  });
  it("passes all demo cases and all 30 byte-boundary sweep variants", async () => {
    const p = demoStreamProject(),
      snapshot = JSON.stringify(p);
    for (const c of p.cases)
      expect(replayStreamCase(c).result.status).toBe("passed");
    const report = await runStreamCases(p, { sweep: true });
    expect(report).toMatchObject({ complete: true, completed: 30, total: 30 });
    expect(report.results.every((r) => r.status === "passed")).toBe(true);
    expect(JSON.stringify(p)).toBe(snapshot);
    expect((await runStreamCases(p, { caseId: "sse-eof" })).completed).toBe(1);
  });
  it("supports indexed, last, every and some checks with event filtering and non-vacuous missing-record failures", () => {
    const c = {
      ...defaultStreamCase(),
      wire: 'event: a\ndata: {"n":1}\n\nevent: a\ndata: {"n":2}\n\n',
      minRecords: 2,
      maxRecords: 2,
      checks: [
        check({
          select: "index",
          index: 1,
          textMode: "contains",
          text: '"n":2',
        }),
        check({
          select: "every",
          event: "a",
          json: [
            {
              name: "Number",
              target: "body" as const,
              path: "/n",
              operator: "type" as const,
              expected: "number",
            },
          ],
        }),
        check({ select: "some", textMode: "equals", text: '{"n":2}' }),
      ],
    };
    expect(replayStreamCase(c).result.status).toBe("passed");
    const r = replayStreamCase({
      ...c,
      checks: [
        check({ select: "every", event: "absent" }),
        check({ textMode: "equals", text: "missing" }),
        check({
          json: [
            {
              name: "Wrong",
              target: "body",
              path: "/n",
              operator: "equals",
              expected: "3",
            },
          ],
        }),
      ],
    }).result;
    expect(r.checks.map((c) => c.issue)).toEqual([
      "missing-record",
      "text",
      "json-check",
    ]);
    expect(r.status).toBe("failed");
  });
  it("does not call an expected parser rejection a pass unless record bounds and checks match", () => {
    const c = {
      ...defaultStreamCase(),
      format: "ndjson" as const,
      wire: "1\n{bad}\n",
      expectedError: "json" as const,
    };
    expect(replayStreamCase(c).result.status).toBe("passed");
    expect(
      replayStreamCase({ ...c, minRecords: 2, maxRecords: 2 }).result.status,
    ).toBe("failed");
    expect(
      replayStreamCase({ ...c, expectedError: "none" }).result.status,
    ).toBe("failed");
  });
  it("retains completed cases on cancellation and omits incomplete case results", async () => {
    const abort = new AbortController();
    const r = await runStreamCases(
      demoStreamProject(),
      { sweep: true },
      abort.signal,
      (n) => {
        if (n === 2) abort.abort();
      },
    );
    expect(r).toMatchObject({ complete: false, total: 30, completed: 2 });
    const p = emptyStreamProject();
    p.cases[0].wire = "data: " + "x".repeat(1000) + "\n\n";
    const cancelled = new AbortController(),
      pending = runStreamCases(p, {}, cancelled.signal);
    cancelled.abort();
    expect(await pending).toMatchObject({
      complete: false,
      completed: 0,
      results: [],
    });
  });
  it("exports value-free check reports and definitions without importing results or session headers", async () => {
    const p = demoStreamProject(),
      r = await runStreamCases(p);
    const report = streamCasesReport(r);
    expect(report).not.toContain("Привет");
    expect(report).not.toContain('"expected"');
    expect(report).not.toContain('"wire"');
    expect(report).not.toContain('"data"');
    const restored = parseStreamProject(
      JSON.stringify({
        ...p,
        headers: { Authorization: "private-token" },
        results: [{ status: "passed" }],
      }),
    );
    expect(restored).toEqual(p);
    expect(serializeStreamProject(restored)).not.toContain("private-token");
    expect(serializeStreamProject(restored)).not.toContain('"results"');
    throws(
      () => parseStreamProject(" ".repeat(MAX_STREAM_PROJECT_BYTES + 1)),
      "limit",
    );
    throws(
      () =>
        parseStreamProject(
          JSON.stringify({ ...p, cases: [p.cases[0], p.cases[0]] }),
        ),
      "project",
    );
  });
  it("bounds transcript memory, restores canonical records and creates replay cases from retained data", () => {
    let journal: { records: StreamRecord[]; dropped: number } = {
      records: [],
      dropped: 0,
    };
    for (let i = 0; i < 250; i++)
      journal = appendStreamRecord(journal, {
        format: "sse",
        data: `line ${i}\nsecond`,
        event: "task",
        id: String(i),
        bytes: bytes(`line ${i}\nsecond`).length,
        sequence: i + 1,
        atMs: i,
        connection: 1,
      });
    expect(journal).toMatchObject({ dropped: 50 });
    expect(journal.records).toHaveLength(200);
    const transcript = parseStreamTranscript(
      serializeStreamTranscript({
        kind: "rsswag-streaming-transcript",
        version: 1,
        format: "sse",
        ...journal,
      }),
    );
    const captured = streamCaseFromTranscript(transcript),
      replay = replayStreamCase(captured);
    expect(replay.result.status).toBe("passed");
    expect(replay.records.map((r) => r.data)).toEqual(
      journal.records.map((r) => r.data),
    );
    expect(
      parseStreamTranscript(
        JSON.stringify({
          ...transcript,
          records: [{ ...transcript.records[0], bytes: -1 }],
        }),
      ).records[0].bytes,
    ).toBe(transcript.records[0].bytes);
    throws(
      () =>
        parseStreamTranscript(
          JSON.stringify({
            ...transcript,
            records: [transcript.records[0], transcript.records[0]],
          }),
        ),
      "transcript",
    );
  });
  it("validates connection/retry rules, session headers, UTF-8 resume ids and malformed checks", () => {
    const c = emptyStreamProject().connection;
    expect(validateStreamConnection(c).url).toBe("");
    throws(() => validateStreamConnection(c, true), "url");
    for (const patch of [
      { url: "file:///tmp/a" },
      { url: "https://u:p@host/a" },
      { url: "https://host/a#b" },
    ])
      throws(() => validateStreamConnection({ ...c, ...patch }), "url");
    for (const patch of [
      { reconnects: 1, method: "POST" },
      { reconnects: 1, format: "ndjson" },
      { idleMs: NaN },
      { maxRecords: 1001 },
      { method: "GET", body: "body" },
    ])
      throws(() => validateStreamConnection({ ...c, ...patch }), "connection");
    expect(
      parseStreamHeaders('{"Authorization":"Bearer private","X-Trace":"123"}'),
    ).toEqual({ Authorization: "Bearer private", "X-Trace": "123" });
    for (const h of [
      { Cookie: "x" },
      { Origin: "x" },
      { Accept: "x" },
      { "Last-Event-ID": "x" },
      { "Sec-Test": "x" },
      { A: "x", a: "y" },
      { A: "line\nbreak" },
    ])
      throws(() => parseStreamHeaders(JSON.stringify(h)), "headers");
    expect(
      new TextDecoder().decode(
        Uint8Array.from(streamLastEventIdHeader("事件🌍"), (c) =>
          c.charCodeAt(0),
        ),
      ),
    ).toBe("事件🌍");
    throws(() => streamLastEventIdHeader(" leading"), "headers");
    throws(
      () =>
        normalizeStreamCase({
          ...defaultStreamCase(),
          checks: [{ ...check(), select: ["last"] }],
        }),
      "check",
    );
    throws(
      () =>
        normalizeStreamCase({
          ...defaultStreamCase(),
          checks: [
            check({
              json: [
                {
                  name: "Invalid",
                  target: "status",
                  path: "",
                  operator: "equals",
                  expected: "200",
                },
              ],
            }),
          ],
        }),
      "check",
    );
  });
});
