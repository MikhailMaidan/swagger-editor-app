import { parseTransformValue } from "./api-transform";
import {
  evaluateResponseAssertions,
  validateResponseAssertion,
  type ResponseAssertion,
} from "./response-assertions";
import { encodeUtf8, getByteSize } from "./text-encoding";

export const MAX_STREAM_RECORD_BYTES = 64 * 1024;
export const MAX_STREAM_BYTES = 2 * 1024 * 1024;
export const MAX_STREAM_RECORDS = 1000;
export const MAX_STREAM_PROJECT_BYTES = 1024 * 1024;
export const MAX_STREAM_CASES = 10;
export const MAX_STREAM_HISTORY_BYTES = 256 * 1024;
export const MAX_STREAM_HISTORY_RECORDS = 200;
export const STREAM_SWEEP_CHUNKS = [1, 2, 3, 7, 64, 4096] as const;
export type StreamFormat = "sse" | "ndjson";
export type StreamErrorCode =
  | "project"
  | "connection"
  | "url"
  | "headers"
  | "json"
  | "utf8"
  | "framing"
  | "limit"
  | "case"
  | "check"
  | "transcript"
  | "cancelled"
  | "network";
export class StreamError extends Error {
  constructor(public code: StreamErrorCode) {
    super(code);
  }
}
export const streamError = (e: unknown) =>
  e instanceof StreamError ? e : new StreamError("network");
export type StreamFrame = {
  format: StreamFormat;
  data: string;
  event: string;
  id: string;
  bytes: number;
};
export type StreamRecord = StreamFrame & {
  sequence: number;
  atMs: number;
  connection: number;
};
export type StreamParserOptions = {
  requireFinalNewline: boolean;
  ignoreEmptyLines: boolean;
};
export type StreamConnection = StreamParserOptions & {
  url: string;
  format: StreamFormat;
  method: "GET" | "POST";
  body: string;
  requireContentType: boolean;
  handshakeMs: number;
  idleMs: number;
  durationMs: number;
  maxRecords: number;
  reconnects: number;
  retryMs: number;
  lastEventId: string;
  stopText: string;
};
export type StreamCheck = {
  name: string;
  select: "index" | "last" | "every" | "some";
  index: number;
  event: string;
  textMode: "any" | "equals" | "contains";
  text: string;
  json: ResponseAssertion[];
};
export type StreamParserError = "none" | "json" | "utf8" | "framing" | "limit";
export type StreamCase = StreamParserOptions & {
  id: string;
  name: string;
  format: StreamFormat;
  wire: string;
  wireEncoding: "utf8" | "base64";
  chunkBytes: number;
  expectedError: StreamParserError;
  minRecords: number;
  maxRecords: number;
  checks: StreamCheck[];
};
export type StreamProject = {
  kind: "rsswag-streaming-project";
  version: 1;
  name: string;
  connection: StreamConnection;
  cases: StreamCase[];
};
export type StreamCheckResult = {
  name: string;
  passed: boolean;
  matched: number;
  selected: number;
  issue?: "missing-record" | "text" | "json-check";
};
export type StreamCaseResult = {
  id: string;
  name: string;
  format: StreamFormat;
  chunkBytes: number;
  status: "passed" | "failed";
  error: StreamParserError;
  errorMatched: boolean;
  countMatched: boolean;
  count: number;
  bytes: number;
  comments: number;
  checks: StreamCheckResult[];
};
export type StreamCaseRun = {
  kind: "rsswag-streaming-case-report";
  version: 1;
  complete: boolean;
  total: number;
  completed: number;
  results: StreamCaseResult[];
};
export type StreamTranscript = {
  kind: "rsswag-streaming-transcript";
  version: 1;
  format: StreamFormat;
  dropped: number;
  records: StreamRecord[];
};
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const named = (v: unknown, max = 120): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const format = (v: unknown): v is StreamFormat => v === "sse" || v === "ndjson";
const parserErrors: readonly string[] = [
  "none",
  "json",
  "utf8",
  "framing",
  "limit",
];
function parse(
  source: string,
  code: StreamErrorCode,
  max = MAX_STREAM_PROJECT_BYTES,
): unknown {
  if (getByteSize(source) > max) throw new StreamError("limit");
  try {
    return parseTransformValue(source);
  } catch {
    throw new StreamError(code);
  }
}
function serialize(v: unknown, max = MAX_STREAM_PROJECT_BYTES) {
  const source = JSON.stringify(v, null, 2) + "\n";
  if (getByteSize(source) > max) throw new StreamError("limit");
  return source;
}
export function validateStreamConnection(
  v: unknown,
  live = false,
): StreamConnection {
  if (
    !record(v) ||
    !format(v.format) ||
    (v.method !== "GET" && v.method !== "POST") ||
    !text(v.url, 2048) ||
    !text(v.body, MAX_STREAM_RECORD_BYTES) ||
    getByteSize(v.body) > MAX_STREAM_RECORD_BYTES ||
    !integer(v.handshakeMs, 100, 30000) ||
    !integer(v.idleMs, 100, 60000) ||
    !integer(v.durationMs, 100, 120000) ||
    !integer(v.maxRecords, 1, MAX_STREAM_RECORDS) ||
    !integer(v.reconnects, 0, 5) ||
    !integer(v.retryMs, 0, 30000) ||
    !text(v.lastEventId, 1024) ||
    /[\x00\r\n]/.test(v.lastEventId) ||
    !text(v.stopText, 4096) ||
    ["requireFinalNewline", "ignoreEmptyLines", "requireContentType"].some(
      (k) => typeof v[k] !== "boolean",
    ) ||
    (v.method === "GET" && !!v.body) ||
    (v.reconnects > 0 && (v.method !== "GET" || v.format !== "sse"))
  )
    throw new StreamError("connection");
  if (v.url || live) {
    try {
      if (
        !/^https?:\/\//i.test(v.url) ||
        /[\s\x00-\x1f]/.test(v.url) ||
        v.url.includes("#")
      )
        throw new Error();
      const u = new URL(v.url);
      if (!u.hostname || u.username || u.password) throw new Error();
    } catch {
      throw new StreamError("url");
    }
  }
  return {
    url: v.url,
    format: v.format,
    method: v.method,
    body: v.body,
    requireContentType: v.requireContentType as boolean,
    handshakeMs: v.handshakeMs,
    idleMs: v.idleMs,
    durationMs: v.durationMs,
    maxRecords: v.maxRecords,
    reconnects: v.reconnects,
    retryMs: v.retryMs,
    lastEventId: v.lastEventId,
    stopText: v.stopText,
    requireFinalNewline: v.requireFinalNewline as boolean,
    ignoreEmptyLines: v.ignoreEmptyLines as boolean,
  };
}
export function parseStreamHeaders(source: string): Record<string, string> {
  const v = parse(source, "headers", 16 * 1024);
  if (!record(v) || Object.keys(v).length > 30)
    throw new StreamError("headers");
  const seen = new Set<string>();
  return Object.fromEntries(
    Object.entries(v).map(([name, value]) => {
      const lower = name.toLowerCase();
      if (
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) ||
        typeof value !== "string" ||
        value.length > 4096 ||
        /[^\t\x20-\x7e\x80-\xff]/.test(value) ||
        seen.has(lower) ||
        /^(?:sec-|proxy-)/.test(lower) ||
        [
          "cookie",
          "cookie2",
          "host",
          "content-length",
          "origin",
          "referer",
          "connection",
          "accept-encoding",
          "access-control-request-headers",
          "access-control-request-method",
          "expect",
          "date",
          "dnt",
          "keep-alive",
          "te",
          "trailer",
          "transfer-encoding",
          "upgrade",
          "via",
          "accept",
          "last-event-id",
        ].includes(lower)
      )
        throw new StreamError("headers");
      seen.add(lower);
      return [name, value];
    }),
  );
}
export function streamLastEventIdHeader(id: string): string {
  if (id.length > 1024 || /[\x00-\x1f\x7f]/.test(id) || /^\s|\s$/.test(id))
    throw new StreamError("headers");
  return Array.from(encodeUtf8(id), (b) => String.fromCharCode(b)).join("");
}

// Incremental framing never assumes that a transport chunk ends on a line,
// code point, CRLF pair or application record boundary.
export class StreamingDecoder {
  lastEventId: string;
  retryMs: number | null = null;
  comments = 0;
  records = 0;
  bytes = 0;
  private decoder: TextDecoder;
  private line = "";
  private afterCr = false;
  private data = "";
  private dataBytes = 0;
  private event = "";
  private idBuffer = "";
  private ended = false;
  private stopped = false;
  private ndBytes: number[] = [];
  constructor(
    public readonly format: StreamFormat,
    private options: StreamParserOptions,
    lastEventId = "",
  ) {
    if (!format || (format !== "sse" && format !== "ndjson"))
      throw new StreamError("framing");
    this.lastEventId = lastEventId;
    this.decoder = new TextDecoder("utf-8", {
      fatal: format === "ndjson",
      ignoreBOM: format === "ndjson",
    });
  }
  push(chunk: Uint8Array, emit: (frame: StreamFrame) => boolean | void) {
    if (this.ended) throw new StreamError("framing");
    if (this.stopped) return;
    this.bytes += chunk.byteLength;
    if (this.bytes > MAX_STREAM_BYTES) throw new StreamError("limit");
    if (this.format === "ndjson") {
      for (const byte of chunk) {
        if (this.stopped) break;
        if (byte === 10) {
          if (this.ndBytes.at(-1) === 13) this.ndBytes.pop();
          this.ndLine(emit);
          this.ndBytes = [];
        } else {
          this.ndBytes.push(byte);
          if (this.ndBytes.length > MAX_STREAM_RECORD_BYTES + 1)
            throw new StreamError("limit");
        }
      }
      return;
    }
    let source: string;
    try {
      source = this.decoder.decode(chunk, { stream: true });
    } catch {
      throw new StreamError("utf8");
    }
    this.consume(source, emit);
  }
  finish(emit: (frame: StreamFrame) => boolean | void) {
    if (this.ended) throw new StreamError("framing");
    this.ended = true;
    if (this.stopped) return;
    if (this.format === "ndjson") {
      if (this.ndBytes.length) {
        if (this.options.requireFinalNewline) throw new StreamError("framing");
        this.ndLine(emit);
      }
      this.ndBytes = [];
      return;
    }
    let tail: string;
    try {
      tail = this.decoder.decode();
    } catch {
      throw new StreamError("utf8");
    }
    this.consume(tail, emit);
    if (this.stopped) return;
    // SSE only dispatches on a blank line; EOF never invents that delimiter.
    this.line = this.data = this.event = "";
  }
  private ndLine(emit: (frame: StreamFrame) => boolean | void) {
    let line: string;
    try {
      line = this.decoder.decode(Uint8Array.from(this.ndBytes));
    } catch {
      throw new StreamError("utf8");
    }
    this.processLine(line, emit);
  }
  private consume(
    source: string,
    emit: (frame: StreamFrame) => boolean | void,
  ) {
    for (const char of source) {
      if (this.stopped) break;
      if (this.afterCr) {
        this.afterCr = false;
        if (char === "\n") continue;
      }
      if (char === "\r" || char === "\n") {
        this.processLine(this.line, emit);
        this.line = "";
        this.afterCr = char === "\r";
        continue;
      }
      this.line += char;
      if (this.line.length > MAX_STREAM_RECORD_BYTES)
        throw new StreamError("limit");
    }
  }
  private emit(
    data: string,
    event: string,
    id: string,
    callback: (frame: StreamFrame) => boolean | void,
  ) {
    const bytes = getByteSize(data);
    if (bytes > MAX_STREAM_RECORD_BYTES || ++this.records > MAX_STREAM_RECORDS)
      throw new StreamError("limit");
    if (callback({ format: this.format, data, event, id, bytes }) === false)
      this.stopped = true;
  }
  private processLine(
    line: string,
    emit: (frame: StreamFrame) => boolean | void,
  ) {
    if (getByteSize(line) > MAX_STREAM_RECORD_BYTES)
      throw new StreamError("limit");
    if (this.format === "ndjson") {
      if (line.includes("\r")) throw new StreamError("framing");
      if (!line && this.options.ignoreEmptyLines) return;
      try {
        if (line.startsWith("\uFEFF")) throw new Error();
        parseTransformValue(line);
      } catch {
        throw new StreamError("json");
      }
      this.emit(line, "record", "", emit);
      return;
    }
    if (!line) {
      this.lastEventId = this.idBuffer;
      const data = this.data,
        event = this.event || "message";
      this.data = this.event = "";
      this.dataBytes = 0;
      if (data) this.emit(data.slice(0, -1), event, this.lastEventId, emit);
      return;
    }
    if (line.startsWith(":")) {
      this.comments++;
      return;
    }
    const colon = line.indexOf(":"),
      name = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (name === "data") {
      this.dataBytes += getByteSize(value) + 1;
      if (this.dataBytes > MAX_STREAM_RECORD_BYTES + 1)
        throw new StreamError("limit");
      this.data += value + "\n";
    } else if (name === "event") {
      if (value.length > 200) throw new StreamError("limit");
      this.event = value;
    } else if (name === "id" && !value.includes("\0")) {
      if (value.length > 1024) throw new StreamError("limit");
      this.idBuffer = value;
    } else if (name === "retry" && /^[0-9]+$/.test(value)) {
      const n = Number(value);
      this.retryMs = Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
    }
  }
}

export function normalizeStreamCase(v: unknown): StreamCase {
  if (
    !record(v) ||
    !named(v.id, 80) ||
    !named(v.name) ||
    !format(v.format) ||
    !text(v.wire, 384 * 1024) ||
    getByteSize(v.wire) > 384 * 1024 ||
    (v.wireEncoding !== undefined &&
      v.wireEncoding !== "utf8" &&
      v.wireEncoding !== "base64") ||
    !integer(v.chunkBytes, 1, 65536) ||
    typeof v.requireFinalNewline !== "boolean" ||
    typeof v.ignoreEmptyLines !== "boolean" ||
    typeof v.expectedError !== "string" ||
    !parserErrors.includes(v.expectedError) ||
    !integer(v.minRecords, 0, MAX_STREAM_RECORDS) ||
    !integer(v.maxRecords, v.minRecords, MAX_STREAM_RECORDS) ||
    !Array.isArray(v.checks) ||
    v.checks.length > 20
  )
    throw new StreamError("case");
  decodeStreamWire(v.wire, v.wireEncoding === "base64" ? "base64" : "utf8");
  const checks: StreamCheck[] = v.checks.map((c) => {
    if (
      !record(c) ||
      !named(c.name) ||
      typeof c.select !== "string" ||
      !["index", "last", "every", "some"].includes(c.select) ||
      !integer(c.index, 0, MAX_STREAM_RECORDS - 1) ||
      !text(c.event, 200) ||
      typeof c.textMode !== "string" ||
      !["any", "equals", "contains"].includes(c.textMode) ||
      !text(c.text, 4096) ||
      !Array.isArray(c.json) ||
      c.json.length > 20
    )
      throw new StreamError("check");
    const json = c.json.map((rule) => {
      if (
        !record(rule) ||
        rule.target !== "body" ||
        validateResponseAssertion(rule as ResponseAssertion)
      )
        throw new StreamError("check");
      const { name, target, path, operator, expected } =
        rule as ResponseAssertion;
      return { name, target, path, operator, expected };
    });
    return {
      name: c.name,
      select: c.select as StreamCheck["select"],
      index: c.index,
      event: c.event,
      textMode: c.textMode as StreamCheck["textMode"],
      text: c.text,
      json,
    };
  });
  return {
    id: v.id,
    name: v.name,
    format: v.format,
    wire: v.wire,
    wireEncoding: v.wireEncoding === "base64" ? "base64" : "utf8",
    chunkBytes: v.chunkBytes,
    requireFinalNewline: v.requireFinalNewline,
    ignoreEmptyLines: v.ignoreEmptyLines,
    expectedError: v.expectedError as StreamParserError,
    minRecords: v.minRecords,
    maxRecords: v.maxRecords,
    checks,
  };
}
export function parseStreamProject(source: string): StreamProject {
  const v = parse(source, "project");
  if (
    !record(v) ||
    v.kind !== "rsswag-streaming-project" ||
    v.version !== 1 ||
    !named(v.name, 200) ||
    !Array.isArray(v.cases) ||
    !v.cases.length ||
    v.cases.length > MAX_STREAM_CASES
  )
    throw new StreamError("project");
  const cases = v.cases.map(normalizeStreamCase);
  if (new Set(cases.map((c) => c.id)).size !== cases.length)
    throw new StreamError("project");
  return {
    kind: "rsswag-streaming-project",
    version: 1,
    name: v.name,
    connection: validateStreamConnection(v.connection),
    cases,
  };
}
export const serializeStreamProject = (p: StreamProject) =>
  serialize(parseStreamProject(JSON.stringify(p)));
export const parseStreamCase = (source: string) =>
  normalizeStreamCase(parse(source, "case"));
export function decodeStreamWire(
  source: string,
  encoding: "utf8" | "base64",
): Uint8Array {
  let bytes: Uint8Array;
  if (encoding === "utf8") bytes = encodeUtf8(source);
  else {
    try {
      if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          source,
        )
      )
        throw new Error();
      const raw = atob(source);
      if (btoa(raw) !== source) throw new Error();
      bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    } catch {
      throw new StreamError("case");
    }
  }
  if (bytes.byteLength > 256 * 1024) throw new StreamError("limit");
  return bytes;
}
export function defaultStreamCase(
  id = "starter",
  name = "SSE greeting",
): StreamCase {
  return {
    id,
    name,
    format: "sse",
    wire: 'data: {"hello":"world"}\n\n',
    wireEncoding: "utf8",
    chunkBytes: 1,
    requireFinalNewline: false,
    ignoreEmptyLines: true,
    expectedError: "none",
    minRecords: 1,
    maxRecords: 1,
    checks: [],
  };
}
export function emptyStreamProject(): StreamProject {
  return {
    kind: "rsswag-streaming-project",
    version: 1,
    name: "Streaming HTTP project",
    connection: {
      url: "",
      format: "sse",
      method: "GET",
      body: "",
      requireContentType: true,
      handshakeMs: 10000,
      idleMs: 15000,
      durationMs: 60000,
      maxRecords: 200,
      reconnects: 0,
      retryMs: 1000,
      lastEventId: "",
      stopText: "",
      requireFinalNewline: false,
      ignoreEmptyLines: true,
    },
    cases: [defaultStreamCase()],
  };
}
export function demoStreamProject(): StreamProject {
  const c = defaultStreamCase();
  return {
    ...emptyStreamProject(),
    name: "Streaming framing and replay demo",
    cases: [
      {
        ...c,
        id: "sse-unicode",
        name: "SSE Unicode, heartbeats and multiline data",
        wire: '\uFEFF: keepalive\r\nretry: 500\r\nid: task-42\r\nevent: task\r\ndata: {"task":\r\ndata: {"id":42,"title":"Привет 🌍"}}\r\n\r\n',
        checks: [
          {
            name: "Task id is preserved",
            select: "last",
            index: 0,
            event: "task",
            textMode: "any",
            text: "",
            json: [
              {
                name: "Task id",
                target: "body",
                path: "/task/id",
                operator: "equals",
                expected: "42",
              },
            ],
          },
        ],
      },
      {
        ...c,
        id: "ndjson-values",
        name: "NDJSON records and primitive values",
        format: "ndjson",
        wire: '{"city":"Токио 🌸"}\r\n42\nnull\n',
        minRecords: 3,
        maxRecords: 3,
        checks: [
          {
            name: "Last record is null",
            select: "last",
            index: 0,
            event: "",
            textMode: "equals",
            text: "null",
            json: [],
          },
        ],
      },
      {
        ...c,
        id: "ndjson-invalid",
        name: "Reject malformed NDJSON after a valid record",
        format: "ndjson",
        wire: '{"ok":true}\n{broken}\n',
        expectedError: "json",
      },
      {
        ...c,
        id: "sse-eof",
        name: "Do not dispatch an incomplete SSE event",
        wire: 'data: {"incomplete":true}\n',
        minRecords: 0,
        maxRecords: 0,
      },
      {
        ...c,
        id: "sse-sentinel",
        name: "SSE text completion sentinel",
        wire: "event: done\ndata: [DONE]\n\n",
        checks: [
          {
            name: "Completion text",
            select: "last",
            index: 0,
            event: "done",
            textMode: "equals",
            text: "[DONE]",
            json: [],
          },
        ],
      },
    ],
  };
}

function evaluateCheck(
  c: StreamCheck,
  records: StreamRecord[],
): StreamCheckResult {
  const filtered = c.event
    ? records.filter((r) => r.event === c.event)
    : records;
  const selected =
    c.select === "index"
      ? filtered.slice(c.index, c.index + 1)
      : c.select === "last"
        ? filtered.slice(-1)
        : filtered;
  let matched = 0,
    issue: StreamCheckResult["issue"];
  for (const r of selected) {
    if (
      (c.textMode === "equals" && r.data !== c.text) ||
      (c.textMode === "contains" && !r.data.includes(c.text))
    ) {
      issue ??= "text";
      continue;
    }
    if (
      evaluateResponseAssertions(c.json, {
        body: r.data,
        headers: {},
        status: "200",
        durationMs: 0,
        source: "mock",
      }).some((result) => result.outcome !== "pass")
    ) {
      issue ??= "json-check";
      continue;
    }
    matched++;
  }
  const passed =
    selected.length > 0 &&
    (c.select === "some" ? matched > 0 : matched === selected.length);
  return {
    name: c.name,
    passed,
    matched,
    selected: selected.length,
    ...(!passed
      ? { issue: !selected.length ? ("missing-record" as const) : issue }
      : {}),
  };
}
function* replaySteps(
  input: StreamCase,
  chunkBytes: number,
): Generator<void, { result: StreamCaseResult; records: StreamRecord[] }> {
  const c = normalizeStreamCase(input);
  if (!integer(chunkBytes, 1, 65536)) throw new StreamError("case");
  const bytes = decodeStreamWire(c.wire, c.wireEncoding),
    decoder = new StreamingDecoder(c.format, c),
    records: StreamRecord[] = [];
  let error: StreamParserError = "none",
    chunks = 0;
  const emit = (frame: StreamFrame) => {
    records.push({
      ...frame,
      sequence: records.length + 1,
      atMs: 0,
      connection: 1,
    });
  };
  try {
    for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
      decoder.push(bytes.subarray(offset, offset + chunkBytes), emit);
      if (++chunks % 64 === 0) yield;
    }
    decoder.finish(emit);
  } catch (e) {
    const code = streamError(e).code;
    if (!parserErrors.includes(code)) throw e;
    error = code as StreamParserError;
  }
  const checks = c.checks.map((check) => evaluateCheck(check, records)),
    errorMatched = error === c.expectedError,
    countMatched =
      records.length >= c.minRecords && records.length <= c.maxRecords;
  return {
    result: {
      id: c.id,
      name: c.name,
      format: c.format,
      chunkBytes,
      status:
        errorMatched && countMatched && checks.every((c) => c.passed)
          ? "passed"
          : "failed",
      error,
      errorMatched,
      countMatched,
      count: records.length,
      bytes: bytes.length,
      comments: decoder.comments,
      checks,
    },
    records,
  };
}
export function replayStreamCase(c: StreamCase, chunkBytes = c.chunkBytes) {
  const iterator = replaySteps(c, chunkBytes);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}
export async function replayStreamCaseAsync(
  c: StreamCase,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return null;
  const iterator = replaySteps(c, c.chunkBytes);
  let step = iterator.next();
  while (!step.done && !signal?.aborted) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    step = iterator.next();
  }
  return signal?.aborted ? null : step.value!;
}
export async function runStreamCases(
  project: StreamProject,
  options: { caseId?: string; sweep?: boolean } = {},
  signal?: AbortSignal,
  progress?: (count: number, total: number) => void,
): Promise<StreamCaseRun> {
  const p = parseStreamProject(JSON.stringify(project)),
    cases = options.caseId
      ? p.cases.filter((c) => c.id === options.caseId)
      : p.cases;
  if (!cases.length) throw new StreamError("case");
  const total = cases.length * (options.sweep ? STREAM_SWEEP_CHUNKS.length : 1),
    results: StreamCaseResult[] = [];
  const report = (): StreamCaseRun => ({
    kind: "rsswag-streaming-case-report",
    version: 1,
    complete: results.length === total,
    total,
    completed: results.length,
    results,
  });
  for (const c of cases)
    for (const chunkBytes of options.sweep
      ? STREAM_SWEEP_CHUNKS
      : [c.chunkBytes]) {
      if (signal?.aborted) return report();
      const iterator = replaySteps(c, chunkBytes);
      let step = iterator.next();
      while (!step.done && !signal?.aborted) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        step = iterator.next();
      }
      if (signal?.aborted) return report();
      results.push(step.value!.result);
      progress?.(results.length, total);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  return report();
}
export function streamCasesReport(run: StreamCaseRun) {
  return serialize(run, 2 * MAX_STREAM_PROJECT_BYTES);
}
export function appendStreamRecord(
  journal: { records: StreamRecord[]; dropped: number },
  next: StreamRecord,
) {
  const records = [...journal.records, next];
  let dropped = journal.dropped;
  let bytes = records.reduce(
    (n, r) => n + r.bytes + getByteSize(r.id) + getByteSize(r.event) + 64,
    0,
  );
  while (
    records.length > MAX_STREAM_HISTORY_RECORDS ||
    bytes > MAX_STREAM_HISTORY_BYTES
  ) {
    const old = records.shift()!;
    bytes -= old.bytes + getByteSize(old.id) + getByteSize(old.event) + 64;
    dropped++;
  }
  return { records, dropped };
}
export function parseStreamTranscript(source: string): StreamTranscript {
  const v = parse(source, "transcript");
  if (
    !record(v) ||
    v.kind !== "rsswag-streaming-transcript" ||
    v.version !== 1 ||
    !format(v.format) ||
    !integer(v.dropped, 0, 1000000) ||
    !Array.isArray(v.records) ||
    v.records.length > MAX_STREAM_HISTORY_RECORDS
  )
    throw new StreamError("transcript");
  let previous = 0,
    time = 0,
    connection = 0,
    bytes = 0;
  const records = v.records.map((r): StreamRecord => {
    if (
      !record(r) ||
      r.format !== v.format ||
      !text(r.data, MAX_STREAM_RECORD_BYTES) ||
      !text(r.event, 200) ||
      !text(r.id, 1024) ||
      /[\0\r\n]/.test(r.id) ||
      /[\r\n]/.test(r.event) ||
      !integer(r.sequence, previous + 1, 1000000) ||
      !integer(r.atMs, time, 120000) ||
      !integer(r.connection, Math.max(1, connection), 6) ||
      (v.format === "ndjson" &&
        (r.id !== "" || r.event !== "record" || /[\r\n]/.test(r.data))) ||
      (v.format === "sse" && r.data.includes("\r"))
    )
      throw new StreamError("transcript");
    const size = getByteSize(r.data);
    if (size > MAX_STREAM_RECORD_BYTES) throw new StreamError("limit");
    if (v.format === "ndjson") {
      try {
        if (r.data.startsWith("\uFEFF")) throw new Error();
        parseTransformValue(r.data);
      } catch {
        throw new StreamError("json");
      }
    }
    previous = r.sequence;
    time = r.atMs;
    connection = r.connection;
    bytes += size + getByteSize(r.id) + getByteSize(r.event) + 64;
    return {
      format: v.format as StreamFormat,
      data: r.data,
      event: r.event,
      id: r.id,
      bytes: size,
      sequence: r.sequence,
      atMs: r.atMs,
      connection: r.connection,
    };
  });
  if (bytes > MAX_STREAM_HISTORY_BYTES) throw new StreamError("limit");
  return {
    kind: "rsswag-streaming-transcript",
    version: 1,
    format: v.format,
    dropped: v.dropped,
    records,
  };
}
export const serializeStreamTranscript = (t: StreamTranscript) =>
  serialize(parseStreamTranscript(JSON.stringify(t)));
export function streamCaseFromTranscript(
  transcript: StreamTranscript,
): StreamCase {
  const t = parseStreamTranscript(JSON.stringify(transcript));
  if (!t.records.length) throw new StreamError("case");
  const wire = t.records
    .map((r) =>
      t.format === "ndjson"
        ? r.data + "\n"
        : `id: ${r.id}\nevent: ${r.event || "message"}\n${r.data
            .split("\n")
            .map((line) => `data: ${line}\n`)
            .join("")}\n`,
    )
    .join("");
  return normalizeStreamCase({
    ...defaultStreamCase(crypto.randomUUID(), "Captured stream records"),
    format: t.format,
    wire,
    minRecords: t.records.length,
    maxRecords: t.records.length,
  });
}
