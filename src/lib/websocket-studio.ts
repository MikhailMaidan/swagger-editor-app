import {
  parseTransformPointer,
  parseTransformValue,
  type JsonValue,
} from "./api-transform";
import {
  evaluateResponseAssertions,
  validateResponseAssertion,
  type ResponseAssertion,
} from "./response-assertions";
import { getByteSize } from "./text-encoding";

export const MAX_WS_MESSAGE_BYTES = 64 * 1024;
export const MAX_WS_PROJECT_BYTES = 1024 * 1024;
export const MAX_WS_MESSAGES = 200;
export const MAX_WS_HISTORY_BYTES = 256 * 1024;
export const MAX_WS_STEPS = 40;
export const MAX_WS_CONVERSATIONS = 10;
export type WsErrorCode =
  | "project"
  | "connection"
  | "url"
  | "protocol"
  | "message"
  | "json"
  | "binary"
  | "limit"
  | "step"
  | "check"
  | "variable"
  | "pointer"
  | "closed"
  | "timeout"
  | "buffer"
  | "cancelled"
  | "exhausted"
  | "mismatch";
export class WsError extends Error {
  constructor(public code: WsErrorCode) {
    super(code);
  }
}
export const wsError = (e: unknown) =>
  e instanceof WsError ? e : new WsError("connection");
export type WsFormat = "text" | "json" | "binary";
export type WsPayload = { format: WsFormat; data: string };
export type WsMessage = WsPayload & {
  sequence: number;
  direction: "send" | "receive";
  bytes: number;
  atMs: number;
};
export type WsConnection = {
  url: string;
  protocols: string[];
  timeoutMs: number;
};
export type WsCapture = { name: string; pointer: string };
type StepBase = { id: string; name: string };
export type WsStep = StepBase &
  (
    | { type: "send"; format: WsFormat; data: string; template: boolean }
    | { type: "pause"; durationMs: number }
    | {
        type: "expect";
        template: boolean;
        format: WsFormat | "any";
        timeoutMs: number;
        match: "next" | "matching";
        textMode: "any" | "equals" | "contains";
        textValue: string;
        checks: ResponseAssertion[];
        captures: WsCapture[];
      }
  );
export type WsConversation = { id: string; name: string; steps: WsStep[] };
export type WsProject = {
  kind: "rsswag-websocket-project";
  version: 1;
  name: string;
  connection: WsConnection;
  variables: Record<string, JsonValue>;
  conversations: WsConversation[];
  fixtures: WsPayload[];
};
export type WsStepResult = {
  id: string;
  name: string;
  type: WsStep["type"];
  status: "passed" | "failed" | "cancelled" | "skipped";
  durationMs: number;
  received: number;
  skippedMessages: number;
  messageSequence?: number;
  error?: WsErrorCode;
};
export type WsRun = {
  mode: "live" | "replay";
  conversationId: string;
  status: "passed" | "failed" | "cancelled";
  durationMs: number;
  steps: WsStepResult[];
  error?: WsErrorCode;
};
export type WsTransport = {
  send(payload: WsPayload): void;
  receive(timeoutMs: number, signal?: AbortSignal): Promise<WsMessage>;
  pause(durationMs: number, signal?: AbortSignal): Promise<void>;
};
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: object, k: string) =>
  Object.prototype.hasOwnProperty.call(v, k);
const named = (v: unknown, max = 120): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const integer = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
const variableName = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(v);
const formats: readonly string[] = ["text", "json", "binary"];
function parse(
  text: string,
  code: WsErrorCode,
  max = MAX_WS_PROJECT_BYTES,
): JsonValue {
  if (getByteSize(text) > max) throw new WsError("limit");
  try {
    return parseTransformValue(text);
  } catch {
    throw new WsError(code);
  }
}
export function validateWsConnection(value: unknown): WsConnection {
  if (
    !record(value) ||
    typeof value.url !== "string" ||
    !integer(value.timeoutMs, 100, 30000)
  )
    throw new WsError("connection");
  if (
    value.url.length > 2048 ||
    /[\s\x00-\x1f]/.test(value.url) ||
    !/^wss?:\/\//i.test(value.url)
  )
    throw new WsError("url");
  try {
    const url = new URL(value.url);
    if (
      !url.hostname ||
      url.username ||
      url.password ||
      value.url.includes("#")
    )
      throw new Error();
  } catch {
    throw new WsError("url");
  }
  if (
    !Array.isArray(value.protocols) ||
    value.protocols.length > 10 ||
    value.protocols.some(
      (p) =>
        typeof p !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(p),
    ) ||
    new Set(value.protocols).size !== value.protocols.length
  )
    throw new WsError("protocol");
  return {
    url: value.url,
    protocols: [...value.protocols] as string[],
    timeoutMs: value.timeoutMs,
  };
}
export function decodeWsBinary(data: string): Uint8Array {
  if (data.length > Math.ceil(MAX_WS_MESSAGE_BYTES / 3) * 4)
    throw new WsError("limit");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      data,
    )
  )
    throw new WsError("binary");
  try {
    const raw = atob(data);
    if (raw.length > MAX_WS_MESSAGE_BYTES) throw new WsError("limit");
    if (btoa(raw) !== data) throw new WsError("binary");
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch (e) {
    throw e instanceof WsError ? e : new WsError("binary");
  }
}
export function encodeWsBinary(data: ArrayBuffer): string {
  if (data.byteLength > MAX_WS_MESSAGE_BYTES) throw new WsError("limit");
  let raw = "";
  for (const byte of new Uint8Array(data)) raw += String.fromCharCode(byte);
  return btoa(raw);
}
export function wsPayload(value: unknown): WsPayload {
  if (
    !record(value) ||
    typeof value.format !== "string" ||
    !formats.includes(value.format) ||
    typeof value.data !== "string"
  )
    throw new WsError("message");
  if (value.format === "binary") decodeWsBinary(value.data);
  else {
    if (getByteSize(value.data) > MAX_WS_MESSAGE_BYTES)
      throw new WsError("limit");
    if (value.format === "json")
      parse(value.data, "json", MAX_WS_MESSAGE_BYTES);
  }
  return { format: value.format as WsFormat, data: value.data };
}
export function wsPayloadBytes(payload: WsPayload): number {
  return payload.format === "binary"
    ? decodeWsBinary(payload.data).length
    : getByteSize(payload.data);
}
export function wsIncoming(data: unknown): WsPayload {
  if (data instanceof ArrayBuffer)
    return { format: "binary", data: encodeWsBinary(data) };
  if (typeof data !== "string") throw new WsError("message");
  wsPayload({ format: "text", data });
  try {
    parse(data, "json", MAX_WS_MESSAGE_BYTES);
    return { format: "json", data };
  } catch {
    return { format: "text", data };
  }
}
export function parseWsVariables(source: string): Record<string, JsonValue> {
  const value = parse(source, "variable", MAX_WS_MESSAGE_BYTES);
  if (
    !record(value) ||
    Object.keys(value).length > 30 ||
    Object.keys(value).some((k) => !variableName(k))
  )
    throw new WsError("variable");
  return value as Record<string, JsonValue>;
}
export function parseWsFixtures(source: string): WsPayload[] {
  const value = parse(source, "message");
  if (!Array.isArray(value) || value.length > MAX_WS_MESSAGES)
    throw new WsError("limit");
  return value.map(wsPayload);
}
export function validateWsStep(value: unknown): WsStep {
  if (!record(value) || !named(value.id, 80) || !named(value.name))
    throw new WsError("step");
  const base = { id: value.id, name: value.name };
  if (value.template !== undefined && typeof value.template !== "boolean")
    throw new WsError("step");
  const template = value.template !== false;
  if (value.type === "send") {
    // JSON templates must themselves be valid JSON before variables are expanded.
    return { ...base, type: "send", template, ...wsPayload(value) };
  }
  if (value.type === "pause") {
    if (!integer(value.durationMs, 0, 10000)) throw new WsError("step");
    return { ...base, type: "pause", durationMs: value.durationMs };
  }
  if (
    value.type !== "expect" ||
    typeof value.format !== "string" ||
    ![...formats, "any"].includes(value.format) ||
    !integer(value.timeoutMs, 1, 30000) ||
    typeof value.match !== "string" ||
    !["next", "matching"].includes(value.match) ||
    typeof value.textMode !== "string" ||
    !["any", "equals", "contains"].includes(value.textMode) ||
    typeof value.textValue !== "string" ||
    getByteSize(value.textValue) > MAX_WS_MESSAGE_BYTES ||
    !Array.isArray(value.checks) ||
    value.checks.length > 20 ||
    !Array.isArray(value.captures) ||
    value.captures.length > 20
  )
    throw new WsError("step");
  const checks = value.checks.map((c) => {
    if (
      !record(c) ||
      c.target !== "body" ||
      validateResponseAssertion(c as ResponseAssertion)
    )
      throw new WsError("check");
    try {
      parseTransformPointer(c.path as string);
    } catch {
      throw new WsError("pointer");
    }
    return {
      name: c.name,
      target: "body",
      path: c.path,
      operator: c.operator,
      expected: c.expected,
    } as ResponseAssertion;
  });
  const names = new Set<string>();
  const captures = value.captures.map((c) => {
    if (
      !record(c) ||
      !variableName(c.name) ||
      names.has(c.name) ||
      typeof c.pointer !== "string"
    )
      throw new WsError("variable");
    names.add(c.name);
    try {
      parseTransformPointer(c.pointer);
    } catch {
      throw new WsError("pointer");
    }
    return { name: c.name, pointer: c.pointer };
  });
  return {
    ...base,
    type: "expect",
    template,
    format: value.format as WsFormat | "any",
    timeoutMs: value.timeoutMs,
    match: value.match as "next" | "matching",
    textMode: value.textMode as "any" | "equals" | "contains",
    textValue: value.textValue,
    checks,
    captures,
  };
}
export function parseWsStep(source: string) {
  return validateWsStep(parse(source, "step"));
}
export function validateWsConversation(value: unknown): WsConversation {
  if (
    !record(value) ||
    !named(value.id, 80) ||
    !named(value.name) ||
    !Array.isArray(value.steps) ||
    value.steps.length > MAX_WS_STEPS
  )
    throw new WsError("step");
  const steps = value.steps.map(validateWsStep);
  if (
    new Set(steps.map((s) => s.id)).size !== steps.length ||
    steps.reduce(
      (sum, s) =>
        sum +
        (s.type === "expect"
          ? s.timeoutMs
          : s.type === "pause"
            ? s.durationMs
            : 0),
      0,
    ) > 120000
  )
    throw new WsError("limit");
  return { id: value.id, name: value.name, steps };
}
export function parseWsProject(source: string): WsProject {
  const v = parse(source, "project");
  if (
    !record(v) ||
    v.kind !== "rsswag-websocket-project" ||
    v.version !== 1 ||
    !named(v.name, 200) ||
    !Array.isArray(v.conversations) ||
    !v.conversations.length ||
    v.conversations.length > MAX_WS_CONVERSATIONS ||
    !Array.isArray(v.fixtures) ||
    !record(v.variables)
  )
    throw new WsError("project");
  const conversations = v.conversations.map(validateWsConversation);
  if (new Set(conversations.map((c) => c.id)).size !== conversations.length)
    throw new WsError("project");
  return {
    kind: "rsswag-websocket-project",
    version: 1,
    name: v.name,
    connection: validateWsConnection(v.connection),
    variables: parseWsVariables(JSON.stringify(v.variables)),
    conversations,
    fixtures: parseWsFixtures(JSON.stringify(v.fixtures)),
  };
}
export function serializeWsProject(project: WsProject): string {
  const output = JSON.stringify(
    parseWsProject(JSON.stringify(project)),
    null,
    2,
  );
  if (getByteSize(output) > MAX_WS_PROJECT_BYTES) throw new WsError("limit");
  return output;
}
export function newWsStep(type: "send"): Extract<WsStep, { type: "send" }>;
export function newWsStep(type: "expect"): Extract<WsStep, { type: "expect" }>;
export function newWsStep(type: "pause"): Extract<WsStep, { type: "pause" }>;
export function newWsStep(type: WsStep["type"]): WsStep;
export function newWsStep(type: WsStep["type"]): WsStep {
  const base = {
    id: crypto.randomUUID(),
    name:
      type === "send"
        ? "Send message"
        : type === "expect"
          ? "Receive message"
          : "Pause",
  };
  return type === "send"
    ? { ...base, type, template: true, format: "json", data: '{"type":"ping"}' }
    : type === "pause"
      ? { ...base, type, durationMs: 100 }
      : {
          ...base,
          type,
          template: true,
          format: "any",
          timeoutMs: 5000,
          match: "next",
          textMode: "any",
          textValue: "",
          checks: [],
          captures: [],
        };
}
export function emptyWsProject(): WsProject {
  return {
    kind: "rsswag-websocket-project",
    version: 1,
    name: "WebSocket project",
    connection: {
      url: "wss://example.com/socket",
      protocols: [],
      timeoutMs: 10000,
    },
    variables: {},
    conversations: [
      { id: crypto.randomUUID(), name: "Conversation", steps: [] },
    ],
    fixtures: [],
  };
}
function pointer(root: JsonValue, path: string): JsonValue {
  let v = root;
  for (const key of parseTransformPointer(path)) {
    if (
      v === null ||
      typeof v !== "object" ||
      !own(v, key) ||
      (Array.isArray(v) && !/^(0|[1-9]\d*)$/.test(key))
    )
      throw new WsError("pointer");
    v = (v as Record<string, JsonValue>)[key];
  }
  return v;
}
function variable(vars: Record<string, JsonValue>, name: string): JsonValue {
  if (!own(vars, name)) throw new WsError("variable");
  return vars[name];
}
export function wsTextTemplate(
  text: string,
  vars: Record<string, JsonValue>,
): string {
  const parts: string[] = [];
  let end = 0,
    size = 0;
  const append = (part: string) => {
    size += getByteSize(part);
    if (size > MAX_WS_MESSAGE_BYTES) throw new WsError("limit");
    parts.push(part);
  };
  for (const match of text.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)) {
    append(text.slice(end, match.index));
    const v = variable(vars, match[1]);
    if (v !== null && typeof v === "object") throw new WsError("variable");
    append(String(v));
    end = match.index + match[0].length;
  }
  append(text.slice(end));
  return parts.join("");
}
export function wsSendTemplate(
  payload: WsPayload,
  vars: Record<string, JsonValue>,
): WsPayload {
  if (payload.format === "binary") return wsPayload(payload);
  if (payload.format === "text")
    return wsPayload({ ...payload, data: wsTextTemplate(payload.data, vars) });
  let size = 0;
  function charge(bytes: number) {
    size += bytes;
    if (size > MAX_WS_MESSAGE_BYTES) throw new WsError("limit");
  }
  function walk(v: JsonValue): JsonValue {
    if (typeof v === "string") {
      const exact = /^\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}$/.exec(v);
      const rendered = exact
        ? variable(vars, exact[1])
        : wsTextTemplate(v, vars);
      charge(getByteSize(JSON.stringify(rendered)));
      return rendered;
    }
    if (Array.isArray(v)) {
      charge(2 + Math.max(0, v.length - 1));
      return v.map(walk);
    }
    if (v !== null && typeof v === "object") {
      charge(2 + Math.max(0, Object.keys(v).length - 1));
      return Object.fromEntries(
        Object.entries(v).map(([k, child]) => {
          charge(getByteSize(JSON.stringify(k)) + 1);
          return [k, walk(child)];
        }),
      );
    }
    charge(getByteSize(JSON.stringify(v)));
    return v;
  }
  return wsPayload({
    format: "json",
    data: JSON.stringify(
      walk(parse(payload.data, "json", MAX_WS_MESSAGE_BYTES)),
    ),
  });
}
function matches(
  step: Extract<WsStep, { type: "expect" }>,
  message: WsMessage,
  vars: Record<string, JsonValue>,
): boolean {
  if (
    step.format !== "any" &&
    !(step.format === "text" && message.format === "json") &&
    step.format !== message.format
  )
    return false;
  const expected =
    step.textMode === "any"
      ? ""
      : step.template
        ? wsTextTemplate(step.textValue, vars)
        : step.textValue;
  if (
    (step.textMode === "equals" && message.data !== expected) ||
    (step.textMode === "contains" && !message.data.includes(expected))
  )
    return false;
  if (!step.checks.length) return true;
  if (message.format !== "json") return false;
  const checks = !step.template
    ? step.checks
    : step.checks.map((c) => ({
        ...c,
        expected:
          c.operator === "exists" || c.operator === "absent"
            ? c.expected
            : c.operator === "equals"
              ? wsSendTemplate({ format: "json", data: c.expected }, vars).data
              : wsTextTemplate(c.expected, vars),
      }));
  if (checks.some((c) => validateResponseAssertion(c)))
    throw new WsError("check");
  return evaluateResponseAssertions(checks, {
    body: message.data,
    headers: {},
    status: "200",
    durationMs: 0,
    source: "mock",
  }).every((c) => c.outcome === "pass");
}
export function wsAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new WsError("cancelled");
}
export function wsPause(ms: number, signal?: AbortSignal): Promise<void> {
  wsAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new WsError("cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function runWsConversation(
  conversation: WsConversation,
  initial: Record<string, JsonValue>,
  transport: WsTransport,
  mode: WsRun["mode"],
  signal?: AbortSignal,
): Promise<WsRun> {
  const clean = validateWsConversation(conversation);
  if (!clean.steps.length) throw new WsError("step");
  const variables = parseWsVariables(JSON.stringify(initial)),
    started = performance.now();
  const steps: WsStepResult[] = [];
  let status: WsRun["status"] = "passed";
  for (const step of clean.steps) {
    const result: WsStepResult = {
      id: step.id,
      name: step.name,
      type: step.type,
      status: "skipped",
      durationMs: 0,
      received: 0,
      skippedMessages: 0,
    };
    steps.push(result);
    if (status !== "passed") continue;
    const before = performance.now();
    try {
      wsAbort(signal);
      if (step.type === "send")
        transport.send(
          step.template ? wsSendTemplate(step, variables) : wsPayload(step),
        );
      else if (step.type === "pause")
        await transport.pause(step.durationMs, signal);
      else {
        const deadline = performance.now() + step.timeoutMs;
        for (;;) {
          wsAbort(signal);
          const remaining = deadline - performance.now();
          if (remaining <= 0) throw new WsError("timeout");
          const message = await transport.receive(remaining, signal);
          wsAbort(signal);
          result.received++;
          if (!matches(step, message, variables)) {
            if (step.match === "next") throw new WsError("mismatch");
            if (++result.skippedMessages >= MAX_WS_MESSAGES)
              throw new WsError("limit");
            continue;
          }
          if (step.captures.length) {
            if (message.format !== "json") throw new WsError("json");
            const value = parse(message.data, "json", MAX_WS_MESSAGE_BYTES);
            const captures = step.captures.map(
              (c) => [c.name, pointer(value, c.pointer)] as const,
            );
            if (
              new Set([
                ...Object.keys(variables),
                ...captures.map(([name]) => name),
              ]).size > 30
            )
              throw new WsError("limit");
            for (const [name, v] of captures)
              Object.defineProperty(variables, name, {
                value: v,
                enumerable: true,
                configurable: true,
                writable: true,
              });
          }
          result.messageSequence = message.sequence;
          break;
        }
      }
      wsAbort(signal);
      result.status = "passed";
    } catch (error) {
      result.error = wsError(error).code;
      status = result.error === "cancelled" ? "cancelled" : "failed";
      result.status = status;
    }
    result.durationMs = Math.max(0, Math.round(performance.now() - before));
  }
  return {
    mode,
    conversationId: clean.id,
    status,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    steps,
  };
}
export function createWsReplay(
  fixtures: WsPayload[],
  onMessage: (message: WsMessage) => void,
): WsTransport {
  const clean = parseWsFixtures(JSON.stringify(fixtures));
  let cursor = 0,
    sequence = 0,
    elapsed = 0;
  function log(payload: WsPayload, direction: WsMessage["direction"]) {
    const message = {
      ...payload,
      sequence: ++sequence,
      direction,
      bytes: wsPayloadBytes(payload),
      atMs: elapsed,
    };
    onMessage(message);
    return message;
  }
  return {
    send: (payload) => {
      log(wsPayload(payload), "send");
    },
    receive: async (_timeout, signal) => {
      wsAbort(signal);
      if (!clean[cursor]) throw new WsError("exhausted");
      return log(clean[cursor++], "receive");
    },
    pause: async (ms, signal) => {
      wsAbort(signal);
      elapsed += ms;
    },
  };
}
export function appendWsMessage(
  history: WsMessage[],
  message: WsMessage,
): { messages: WsMessage[]; dropped: number } {
  const messages = [...history, message];
  let size = messages.reduce((sum, m) => sum + getByteSize(m.data), 0),
    dropped = 0;
  while (messages.length > MAX_WS_MESSAGES || size > MAX_WS_HISTORY_BYTES) {
    size -= getByteSize(messages.shift()!.data);
    dropped++;
  }
  return { messages, dropped };
}
export function parseWsTranscript(source: string): WsMessage[] {
  const value = parse(source, "message", 4 * MAX_WS_PROJECT_BYTES);
  if (
    !record(value) ||
    value.kind !== "rsswag-websocket-transcript" ||
    value.version !== 1 ||
    !Array.isArray(value.messages) ||
    value.messages.length > MAX_WS_MESSAGES
  )
    throw new WsError("message");
  let last = 0;
  const messages = value.messages.map((m, index) => {
    if (
      !record(m) ||
      typeof m.direction !== "string" ||
      !["send", "receive"].includes(m.direction) ||
      typeof m.atMs !== "number" ||
      !Number.isFinite(m.atMs) ||
      m.atMs < last ||
      m.atMs > Number.MAX_SAFE_INTEGER
    )
      throw new WsError("message");
    last = m.atMs;
    const payload = wsPayload(m);
    return {
      ...payload,
      sequence: index + 1,
      direction: m.direction as WsMessage["direction"],
      atMs: m.atMs,
      bytes: wsPayloadBytes(payload),
    };
  });
  if (
    messages.reduce((sum, m) => sum + getByteSize(m.data), 0) >
    MAX_WS_HISTORY_BYTES
  )
    throw new WsError("limit");
  return messages;
}
export function serializeWsTranscript(messages: WsMessage[]): string {
  const source = JSON.stringify(
    { kind: "rsswag-websocket-transcript", version: 1, messages },
    null,
    2,
  );
  parseWsTranscript(source);
  return source;
}
export function conversationFromWsTranscript(
  messages: WsMessage[],
): WsConversation {
  const clean = parseWsTranscript(serializeWsTranscript(messages));
  if (!clean.length || clean.length > MAX_WS_STEPS) throw new WsError("limit");
  return validateWsConversation({
    id: crypto.randomUUID(),
    name: "Recorded conversation",
    steps: clean.map((m) =>
      m.direction === "send"
        ? {
            ...newWsStep("send"),
            template: false,
            format: m.format,
            data: m.data,
          }
        : {
            ...newWsStep("expect"),
            template: false,
            format: m.format,
            textMode:
              m.format === "json" && getByteSize(m.data) <= 4096
                ? "any"
                : "equals",
            textValue:
              m.format === "json" && getByteSize(m.data) <= 4096 ? "" : m.data,
            checks:
              m.format === "json" && getByteSize(m.data) <= 4096
                ? [
                    {
                      name: "Recorded JSON",
                      target: "body",
                      path: "",
                      operator: "equals",
                      expected: m.data,
                    },
                  ]
                : [],
          },
    ),
  });
}
export function wsRunReport(run: WsRun) {
  return {
    kind: "rsswag-websocket-run-report",
    version: 1,
    mode: run.mode,
    conversationId: run.conversationId,
    status: run.status,
    error: run.error,
    durationMs: run.durationMs,
    steps: run.steps.map(
      ({
        id,
        name,
        type,
        status,
        durationMs,
        received,
        skippedMessages,
        messageSequence,
        error,
      }) => ({
        id,
        name,
        type,
        status,
        durationMs,
        received,
        skippedMessages,
        messageSequence,
        error,
      }),
    ),
  };
}
export function demoWsProject(): WsProject {
  const project = emptyWsProject();
  project.name = "Realtime task board";
  project.variables = { room: "tasks" };
  project.conversations[0].name = "Subscribe, receive and acknowledge";
  project.conversations[0].steps = [
    {
      ...newWsStep("expect"),
      name: "Wait for welcome",
      type: "expect",
      format: "json",
      timeoutMs: 5000,
      match: "next",
      textMode: "any",
      textValue: "",
      checks: [
        {
          name: "Welcome event",
          target: "body",
          path: "/type",
          operator: "equals",
          expected: '"welcome"',
        },
      ],
      captures: [],
    },
    {
      ...newWsStep("send"),
      name: "Subscribe to room",
      type: "send",
      format: "json",
      data: '{"type":"subscribe","room":"{{room}}"}',
    },
    {
      ...newWsStep("expect"),
      name: "Capture task identifier",
      type: "expect",
      format: "json",
      timeoutMs: 5000,
      match: "matching",
      textMode: "any",
      textValue: "",
      checks: [
        {
          name: "Task event",
          target: "body",
          path: "/type",
          operator: "equals",
          expected: '"task"',
        },
      ],
      captures: [{ name: "taskId", pointer: "/task/id" }],
    },
    {
      ...newWsStep("send"),
      name: "Acknowledge task",
      type: "send",
      format: "json",
      data: '{"type":"ack","id":"{{taskId}}"}',
    },
  ];
  project.fixtures = [
    { format: "json", data: '{"type":"welcome"}' },
    { format: "json", data: '{"type":"heartbeat"}' },
    {
      format: "json",
      data: '{"type":"task","task":{"id":42,"title":"Ship realtime support"}}',
    },
  ];
  return project;
}
