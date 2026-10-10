import YAML, { isScalar, visit } from "yaml";
import {
  escapeTransformPointer,
  parseTransformPointer,
  parseTransformValue,
  type JsonValue,
} from "./api-transform";
import { validateExampleValue } from "./example-validation";
import { inferResponseSchema, parseSchemaSample } from "./response-schema";
import { getByteSize } from "./text-encoding";

export const MAX_ASYNC_BYTES = 2 * 1024 * 1024;
export const MAX_EVENT_BYTES = 128 * 1024;
export const MAX_EVENT_JOURNAL = 200;
export type AsyncIssueCode =
  | "reference"
  | "external-reference"
  | "structure"
  | "traits"
  | "reply"
  | "schema-format"
  | "schema-keyword"
  | "schema-limit"
  | "content-type"
  | "correlation"
  | "address";
export type AsyncFinding = { pointer: string; code: AsyncIssueCode };
export type AsyncMessage = {
  key: string;
  pointer: string;
  name: string;
  contentType: string;
  payload: unknown;
  headers: unknown;
  correlation: string;
  examples: {
    name: string;
    payload: JsonValue;
    headers: Record<string, JsonValue>;
  }[];
  findings: AsyncFinding[];
};
export type AsyncChannel = {
  key: string;
  address: string | null;
  description: string;
  parameters: { name: string; defaultValue?: string; enumValues: string[] }[];
  messages: AsyncMessage[];
  serverKeys: string[];
};
export type AsyncOperation = {
  key: string;
  name: string;
  action: "send" | "receive";
  channelKey: string;
  messageKeys: string[];
  findings: AsyncFinding[];
};
export type AsyncCatalog = {
  title: string;
  version: string;
  channels: AsyncChannel[];
  operations: AsyncOperation[];
  servers: { key: string; protocol: string; address: string }[];
  findings: AsyncFinding[];
};
export type AsyncDocument = {
  root: Record<string, JsonValue>;
  text: string;
  format: "json" | "yaml";
  catalog: AsyncCatalog;
};
export type EventCheck = {
  status: "valid" | "invalid" | "partial";
  issues: {
    part: "payload" | "headers" | "correlation";
    path: string;
    keyword: string;
    severity: "error" | "warning";
  }[];
  findings: AsyncFinding[];
  correlation: string | number | boolean | null;
};
export type RehearsalInput = {
  operationKey: string;
  messageKey: string;
  parameters: Record<string, string>;
  payload: JsonValue;
  headers: Record<string, JsonValue>;
};
export type EventEntry = RehearsalInput & {
  sequence: number;
  address: string;
  action: "send" | "receive";
  check: EventCheck;
  replayOf: number | null;
};
export type AsyncProject = {
  kind: "rsswag-asyncapi-project";
  version: 1;
  name: string;
  document: string;
  journal: EventEntry[];
};
export type AsyncErrorCode =
  | "document"
  | "version"
  | "limit"
  | "json"
  | "selection"
  | "parameters"
  | "builder"
  | "project"
  | "journal";
export class AsyncError extends Error {
  constructor(public code: AsyncErrorCode) {
    super(code);
  }
}
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 4096): v is string =>
  typeof v === "string" && v.length <= max;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const ptr = (base: string, name: string) =>
  `${base}/${escapeTransformPointer(name)}`;
const own = (v: Record<string, unknown>, k: string) =>
  Object.hasOwn(v, k) ? v[k] : undefined;
function boundedJson(text: string, max = MAX_ASYNC_BYTES): JsonValue {
  if (getByteSize(text) > max) throw new AsyncError("limit");
  try {
    return parseTransformValue(text);
  } catch {
    throw new AsyncError("json");
  }
}
function at(root: unknown, pointer: string): unknown {
  let v = root;
  for (const key of parseTransformPointer(pointer)) {
    if ((!obj(v) && !Array.isArray(v)) || !Object.hasOwn(v, key))
      return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}
function refPointer(ref: string): string | null {
  if (!ref.startsWith("#")) return null;
  try {
    const p = decodeURIComponent(ref.slice(1));
    parseTransformPointer(p);
    return p;
  } catch {
    return null;
  }
}
function resolve(
  root: Record<string, unknown>,
  value: unknown,
  pointer: string,
  findings: AsyncFinding[],
): { value: Record<string, unknown>; pointer: string } | null {
  const seen = new Set<string>();
  while (obj(value) && typeof value.$ref === "string") {
    const target = refPointer(value.$ref);
    if (target === null) {
      findings.push({
        pointer,
        code: value.$ref.startsWith("#") ? "reference" : "external-reference",
      });
      return null;
    }
    if (seen.has(target) || seen.size >= 32) {
      findings.push({ pointer, code: "reference" });
      return null;
    }
    seen.add(target);
    value = at(root, target);
    pointer = target;
  }
  if (!obj(value)) {
    findings.push({ pointer, code: seen.size ? "reference" : "structure" });
    return null;
  }
  return { value, pointer };
}
function schemaValue(
  root: Record<string, unknown>,
  value: unknown,
  pointer: string,
  findings: AsyncFinding[],
): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (obj(value) && typeof value.$ref === "string") {
    const target = refPointer(value.$ref);
    const pointed = target === null ? undefined : at(root, target);
    if (typeof pointed === "boolean") return pointed;
  }
  const resolved = resolve(root, value, pointer, findings);
  if (!resolved) return undefined;
  const schema = resolved.value;
  if (typeof schema.schemaFormat === "string") {
    if (!supportedFormat(schema.schemaFormat)) {
      findings.push({ pointer: resolved.pointer, code: "schema-format" });
      return undefined;
    }
    if (!Object.hasOwn(schema, "schema")) {
      findings.push({ pointer: resolved.pointer, code: "structure" });
      return undefined;
    }
    return schema.schema;
  }
  return schema;
}
function supportedFormat(format: string) {
  return /^(application\/vnd\.aai\.asyncapi(?:\+json|\+yaml)?(?:;version=[23]\.\d+\.\d+)?|application\/schema\+(?:json|yaml);version=draft-07)$/.test(
    format,
  );
}
function message(
  root: Record<string, unknown>,
  raw: unknown,
  key: string,
  pointer: string,
): AsyncMessage | null {
  const findings: AsyncFinding[] = [];
  const resolved = resolve(root, raw, pointer, findings);
  if (!resolved)
    return {
      key,
      pointer,
      name: key,
      contentType: "",
      payload: undefined,
      headers: undefined,
      correlation: "",
      examples: [],
      findings,
    };
  const m = resolved.value,
    p = resolved.pointer;
  if (Array.isArray(m.traits) && m.traits.length)
    findings.push({ pointer: p, code: "traits" });
  const format = s(m.schemaFormat);
  if (format && !supportedFormat(format))
    findings.push({ pointer: p, code: "schema-format" });
  const payload =
    format && !supportedFormat(format)
      ? undefined
      : schemaValue(root, m.payload, ptr(p, "payload"), findings);
  const headers = schemaValue(root, m.headers, ptr(p, "headers"), findings);
  const contentType =
    s(m.contentType) || s(root.defaultContentType) || "application/json";
  if (!/^(?:application\/(?:[\w.-]+\+)?json)(?:;|$)/i.test(contentType))
    findings.push({ pointer: p, code: "content-type" });
  let correlation = "";
  if (m.correlationId !== undefined) {
    const c = resolve(root, m.correlationId, ptr(p, "correlationId"), findings);
    correlation = s(c?.value.location);
    if (!/^\$message\.(?:header|payload)#/.test(correlation))
      findings.push({ pointer: p, code: "correlation" });
  }
  const examples: AsyncMessage["examples"] = [];
  if (Array.isArray(m.examples))
    for (const [i, e] of m.examples.slice(0, 20).entries()) {
      if (
        !obj(e) ||
        !Object.hasOwn(e, "payload") ||
        (e.headers !== undefined && !obj(e.headers))
      )
        continue;
      examples.push({
        name: s(e.name) || `Example ${i + 1}`,
        payload: e.payload as JsonValue,
        headers: (e.headers ?? {}) as Record<string, JsonValue>,
      });
    }
  return {
    key,
    pointer,
    name: s(m.title) || s(m.name) || key,
    contentType,
    payload,
    headers,
    correlation,
    examples,
    findings,
  };
}
export function inspectAsyncDocument(
  root: Record<string, JsonValue>,
): AsyncCatalog {
  const findings: AsyncFinding[] = [];
  const v3 = s(root.asyncapi).startsWith("3.");
  const rawChannels = obj(root.channels) ? root.channels : {};
  const rawServers = obj(root.servers) ? root.servers : {};
  const channels: AsyncChannel[] = [],
    operations: AsyncOperation[] = [],
    servers: AsyncCatalog["servers"] = [];
  for (const [key, raw] of Object.entries(rawServers)) {
    const resolved = resolve(root, raw, ptr("/servers", key), findings);
    if (!resolved) continue;
    const server = resolved.value;
    servers.push({
      key,
      protocol: s(server.protocol),
      address: v3
        ? [s(server.host), s(server.pathname)].filter(Boolean).join("")
        : s(server.url),
    });
  }
  for (const [key, raw] of Object.entries(rawChannels)) {
    const p = ptr("/channels", key),
      resolved = resolve(root, raw, p, findings);
    if (!resolved) continue;
    const c = resolved.value;
    const address = v3
      ? typeof c.address === "string"
        ? c.address
        : null
      : key;
    if (address === null) findings.push({ pointer: p, code: "address" });
    const parameters: AsyncChannel["parameters"] = [];
    if (obj(c.parameters))
      for (const [name, param] of Object.entries(c.parameters)) {
        const r = resolve(
          root,
          param,
          ptr(ptr(p, "parameters"), name),
          findings,
        );
        if (!r) continue;
        const schema = obj(r.value.schema) ? r.value.schema : r.value;
        const def = schema.default;
        parameters.push({
          name,
          ...(typeof def === "string" ||
          typeof def === "number" ||
          typeof def === "boolean"
            ? { defaultValue: String(def) }
            : {}),
          enumValues: Array.isArray(schema.enum)
            ? schema.enum
                .filter((v) =>
                  ["string", "number", "boolean"].includes(typeof v),
                )
                .map(String)
            : [],
        });
      }
    const messages: AsyncMessage[] = [];
    if (v3) {
      if (obj(c.messages))
        for (const [name, m] of Object.entries(c.messages)) {
          const found = message(root, m, name, ptr(ptr(p, "messages"), name));
          if (found) messages.push(found);
        }
    } else {
      for (const [kind, action] of [
        ["subscribe", "send"],
        ["publish", "receive"],
      ] as const) {
        if (c[kind] === undefined) continue;
        const opFindings: AsyncFinding[] = [];
        const op = resolve(root, c[kind], ptr(p, kind), opFindings);
        if (!op) {
          findings.push(...opFindings);
          continue;
        }
        if (Array.isArray(op.value.traits) && op.value.traits.length)
          opFindings.push({ pointer: op.pointer, code: "traits" });
        const msg = resolve(
          root,
          op.value.message,
          ptr(op.pointer, "message"),
          opFindings,
        );
        const variants =
          msg && Array.isArray(msg.value.oneOf)
            ? msg.value.oneOf
            : msg
              ? [op.value.message]
              : [];
        const messageKeys: string[] = [];
        for (const [i, rawMessage] of variants.entries()) {
          const msgKey = `${kind}-${i + 1}`,
            mp =
              msg && Array.isArray(msg.value.oneOf)
                ? ptr(ptr(msg.pointer, "oneOf"), String(i))
                : ptr(op.pointer, "message");
          const found = message(root, rawMessage, msgKey, mp);
          if (found) {
            messages.push(found);
            messageKeys.push(msgKey);
          }
        }
        operations.push({
          key: `${p}/${kind}`,
          name: s(op.value.operationId) || `${kind} ${key}`,
          action,
          channelKey: key,
          messageKeys,
          findings: opFindings,
        });
      }
    }
    if (messages.length > 100) throw new AsyncError("limit");
    let serverKeys = servers.map((v) => v.key);
    if (Array.isArray(c.servers))
      serverKeys = c.servers.flatMap((raw) => {
        if (!v3 && typeof raw === "string")
          return servers.some((v) => v.key === raw) ? [raw] : [];
        if (!obj(raw) || typeof raw.$ref !== "string") return [];
        const ref = refPointer(raw.$ref);
        const segments = ref === null ? [] : parseTransformPointer(ref);
        return segments.length === 2 &&
          segments[0] === "servers" &&
          servers.some((v) => v.key === segments[1])
          ? [segments[1]]
          : [];
      });
    channels.push({
      key,
      address,
      description: s(c.description) || s(c.summary),
      parameters,
      messages,
      serverKeys,
    });
  }
  if (v3 && obj(root.operations))
    for (const [key, raw] of Object.entries(root.operations)) {
      const opFindings: AsyncFinding[] = [],
        p = ptr("/operations", key),
        op = resolve(root, raw, p, opFindings);
      if (!op) {
        findings.push(...opFindings);
        continue;
      }
      if (op.value.action !== "send" && op.value.action !== "receive") {
        findings.push({ pointer: p, code: "structure" });
        continue;
      }
      const channelRef = obj(op.value.channel) ? s(op.value.channel.$ref) : "",
        channelPointer = refPointer(channelRef);
      const parts =
        channelPointer === null ? [] : parseTransformPointer(channelPointer);
      const channel =
        parts.length === 2 && parts[0] === "channels"
          ? channels.find((c) => c.key === parts[1])
          : undefined;
      if (!channel) {
        findings.push({
          pointer: ptr(p, "channel"),
          code:
            channelRef && !channelRef.startsWith("#")
              ? "external-reference"
              : "reference",
        });
        continue;
      }
      let messageKeys = channel.messages.map((m) => m.key);
      if (op.value.messages !== undefined) {
        if (!Array.isArray(op.value.messages)) {
          opFindings.push({ pointer: p, code: "structure" });
          messageKeys = [];
        } else
          messageKeys = op.value.messages.flatMap((rawMsg) => {
            const rp = obj(rawMsg) ? refPointer(s(rawMsg.$ref)) : null;
            const sp = rp === null ? [] : parseTransformPointer(rp);
            // Operation messages must reference a message belonging to its channel.
            if (
              sp.length === 4 &&
              sp[0] === "channels" &&
              sp[1] === channel.key &&
              sp[2] === "messages" &&
              channel.messages.some((m) => m.key === sp[3])
            )
              return [sp[3]];
            opFindings.push({ pointer: ptr(p, "messages"), code: "reference" });
            return [];
          });
      }
      if (Array.isArray(op.value.traits) && op.value.traits.length)
        opFindings.push({ pointer: p, code: "traits" });
      if (op.value.reply !== undefined)
        opFindings.push({ pointer: p, code: "reply" });
      operations.push({
        key,
        name: s(op.value.title) || s(op.value.summary) || key,
        action: op.value.action,
        channelKey: channel.key,
        messageKeys: [...new Set(messageKeys)],
        findings: opFindings,
      });
    }
  if (
    channels.length > 100 ||
    operations.length > 200 ||
    channels.reduce((n, c) => n + c.messages.length, 0) > 400 ||
    servers.length > 100
  )
    throw new AsyncError("limit");
  for (const channel of channels)
    for (const msg of channel.messages) findings.push(...msg.findings);
  for (const op of operations) findings.push(...op.findings);
  return {
    title: obj(root.info) ? s(root.info.title) : "",
    version: s(root.asyncapi),
    channels,
    operations,
    servers,
    findings,
  };
}
export function readAsyncDocument(input: string): AsyncDocument {
  if (getByteSize(input) > MAX_ASYNC_BYTES) throw new AsyncError("limit");
  const clean = input.replace(/^\uFEFF/, "");
  let value: JsonValue, format: AsyncDocument["format"];
  try {
    if (clean.trimStart().startsWith("{")) {
      value = boundedJson(clean);
      format = "json";
    } else {
      const doc = YAML.parseDocument(clean, { uniqueKeys: true });
      if (doc.errors.length) throw new Error();
      visit(doc, {
        Pair: (_key, pair) => {
          if (!isScalar(pair.key) || typeof pair.key.value !== "string")
            throw new AsyncError("document");
        },
      });
      value = boundedJson(JSON.stringify(doc.toJS({ maxAliasCount: 50 })));
      format = "yaml";
    }
  } catch (error) {
    throw error instanceof AsyncError ? error : new AsyncError("document");
  }
  if (
    !obj(value) ||
    !obj(value.info) ||
    !str(value.info.title, 256) ||
    !value.info.title.trim() ||
    !str(value.info.version, 128) ||
    !value.info.version.trim()
  )
    throw new AsyncError("document");
  if (
    typeof value.asyncapi !== "string" ||
    !/^(?:2\.[0-6]|3\.[01])\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(value.asyncapi)
  )
    throw new AsyncError("version");
  for (const name of ["channels", "operations", "servers", "components"])
    if (value[name] !== undefined && !obj(value[name]))
      throw new AsyncError("document");
  if (
    Object.keys(obj(value.channels) ? value.channels : {}).length > 100 ||
    Object.keys(obj(value.operations) ? value.operations : {}).length > 200
  )
    throw new AsyncError("limit");
  const root = value as Record<string, JsonValue>;
  return { root, text: input, format, catalog: inspectAsyncDocument(root) };
}
export const emptyAsyncDocument = () =>
  readAsyncDocument(
    JSON.stringify(
      {
        asyncapi: "3.1.0",
        info: { title: "Event API", version: "1.0.0" },
        defaultContentType: "application/json",
        channels: {},
        operations: {},
      },
      null,
      2,
    ),
  );
export function exportAsyncDocument(
  doc: AsyncDocument,
  format: "json" | "yaml",
) {
  const content =
    format === "json"
      ? JSON.stringify(doc.root, null, 2) + "\n"
      : YAML.stringify(doc.root);
  if (getByteSize(content) > MAX_ASYNC_BYTES) throw new AsyncError("limit");
  return content;
}
const supportedKeywords = new Set([
  "$ref",
  "$schema",
  "$id",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "title",
  "description",
  "default",
  "example",
  "examples",
  "readOnly",
  "writeOnly",
  "deprecated",
  "externalDocs",
]);
function schemaFindings(
  root: Record<string, JsonValue>,
  schema: unknown,
  pointer: string,
): AsyncFinding[] {
  const findings: AsyncFinding[] = [],
    seen = new Set<unknown>();
  let count = 0;
  function walk(v: unknown, p: string, depth: number) {
    if (count > 5000 || findings.length >= 100) return;
    if (++count > 5000 || depth > 32) {
      findings.push({ pointer: p, code: "schema-limit" });
      return;
    }
    if (typeof v === "boolean") return;
    if (!obj(v)) {
      findings.push({ pointer: p, code: "structure" });
      return;
    }
    if (seen.has(v)) {
      findings.push({ pointer: p, code: "schema-limit" });
      return;
    }
    seen.add(v);
    const malformed =
      (v.required !== undefined &&
        (!Array.isArray(v.required) ||
          v.required.some((name) => typeof name !== "string"))) ||
      (v.properties !== undefined && !obj(v.properties)) ||
      (v.enum !== undefined && !Array.isArray(v.enum)) ||
      ["allOf", "oneOf", "anyOf"].some(
        (name) => v[name] !== undefined && !Array.isArray(v[name]),
      ) ||
      [
        "minimum",
        "maximum",
        "multipleOf",
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "minProperties",
        "maxProperties",
      ].some((name) => v[name] !== undefined && typeof v[name] !== "number") ||
      (v.type !== undefined &&
        !(
          typeof v.type === "string" ||
          (Array.isArray(v.type) &&
            v.type.every((type) => typeof type === "string"))
        )) ||
      (v.pattern !== undefined && typeof v.pattern !== "string");
    if (malformed) findings.push({ pointer: p, code: "structure" });
    if (
      v.format !== undefined &&
      ![
        "date",
        "date-time",
        "email",
        "ipv4",
        "ipv6",
        "uri",
        "uuid",
        "int32",
        "int64",
      ].includes(String(v.format))
    )
      findings.push({ pointer: ptr(p, "format"), code: "schema-keyword" });
    if (typeof v.pattern === "string") {
      try {
        new RegExp(v.pattern, "u");
      } catch {
        try {
          new RegExp(v.pattern);
        } catch {
          findings.push({ pointer: ptr(p, "pattern"), code: "schema-keyword" });
        }
      }
    }
    for (const name of Object.keys(v))
      if (!supportedKeywords.has(name) && !name.startsWith("x-"))
        findings.push({ pointer: ptr(p, name), code: "schema-keyword" });
    if (typeof v.$ref === "string") {
      const target = refPointer(v.$ref),
        value = target === null ? undefined : at(root, target);
      if (target === null || value === undefined)
        findings.push({
          pointer: p,
          code:
            target === null && !v.$ref.startsWith("#")
              ? "external-reference"
              : "reference",
        });
      else if (typeof value === "boolean")
        findings.push({ pointer: p, code: "schema-keyword" });
      else walk(value, target, depth + 1);
    }
    for (const name of ["properties"])
      if (obj(v[name]))
        for (const [k, value] of Object.entries(
          v[name] as Record<string, unknown>,
        ))
          walk(value, ptr(ptr(p, name), k), depth + 1);
    for (const name of ["items", "additionalProperties", "not"])
      if (v[name] !== undefined) walk(v[name], ptr(p, name), depth + 1);
    for (const name of ["allOf", "oneOf", "anyOf"])
      if (Array.isArray(v[name]))
        for (const [i, value] of (v[name] as unknown[]).entries())
          walk(value, ptr(ptr(p, name), String(i)), depth + 1);
    seen.delete(v);
  }
  if (schema !== undefined) walk(schema, pointer, 0);
  return findings.slice(0, 100);
}
export function checkEventMessage(
  doc: AsyncDocument,
  message: AsyncMessage,
  payload: JsonValue,
  headers: Record<string, JsonValue>,
): EventCheck {
  const issues: EventCheck["issues"] = [],
    findings = [...message.findings];
  const pending: unknown[] = [payload, headers];
  let nodes = 0;
  while (pending.length) {
    const value = pending.pop();
    if (++nodes > 20000 || (Array.isArray(value) && value.length > 1000)) {
      findings.push({ pointer: message.pointer, code: "schema-limit" });
      break;
    }
    if (value !== null && typeof value === "object")
      pending.push(...Object.values(value));
  }
  for (const [part, schema, value] of [
    ["payload", message.payload, payload],
    ["headers", message.headers, headers],
  ] as const) {
    if (schema === undefined) {
      if (part === "payload")
        findings.push({ pointer: message.pointer, code: "structure" });
      continue;
    }
    findings.push(
      ...schemaFindings(doc.root, schema, ptr(message.pointer, part)),
    );
    const checked = validateExampleValue(doc.root, schema, value);
    if (checked.limited)
      findings.push({ pointer: message.pointer, code: "schema-limit" });
    for (const issue of checked.issues.slice(0, 50))
      issues.push({
        part,
        path: issue.instancePath,
        keyword: issue.keyword,
        severity: issue.keyword === "oneOfMultiple" ? "error" : issue.severity,
      });
  }
  let correlation: EventCheck["correlation"] = null;
  if (message.correlation) {
    try {
      const match = /^\$message\.(header|payload)#(.*)$/.exec(
        message.correlation,
      );
      if (!match) throw new Error();
      const p = decodeURIComponent(match[2]),
        value = at(match[1] === "header" ? headers : payload, p);
      if (value === undefined || (value !== null && typeof value === "object"))
        throw new Error();
      correlation = value as EventCheck["correlation"];
    } catch {
      issues.push({
        part: "correlation",
        path: "",
        keyword: "missing-correlation",
        severity: "error",
      });
    }
  }
  const status = issues.some((i) => i.severity === "error")
    ? "invalid"
    : findings.length || issues.length
      ? "partial"
      : "valid";
  return { status, issues, findings: findings.slice(0, 100), correlation };
}
export function parseEventPayload(text: string) {
  return boundedJson(text, MAX_EVENT_BYTES);
}
export function parseEventHeaders(text: string): Record<string, JsonValue> {
  const v = parseEventPayload(text);
  if (!obj(v) || Object.keys(v).length > 100) throw new AsyncError("json");
  return v as Record<string, JsonValue>;
}
export function parseEventParameters(text: string): Record<string, string> {
  const v = parseEventPayload(text);
  if (
    !obj(v) ||
    Object.keys(v).length > 32 ||
    Object.entries(v).some(([k, v]) => !k || !str(v, 1024))
  )
    throw new AsyncError("parameters");
  return v as Record<string, string>;
}
export function resolveEventAddress(
  channel: AsyncChannel,
  parameters: Record<string, string>,
) {
  if (channel.address === null || channel.address.length > 2048)
    throw new AsyncError("parameters");
  const address = channel.address.replace(
    /\{([^{}]+)\}/g,
    (_, name: string) => {
      const def = channel.parameters.find((p) => p.name === name),
        value = own(parameters, name) ?? def?.defaultValue;
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 1024 ||
        /[\u0000-\u001f{}]/.test(value) ||
        (def?.enumValues.length && !def.enumValues.includes(value))
      )
        throw new AsyncError("parameters");
      return value;
    },
  );
  if (!address || /[{}\u0000-\u001f]/.test(address) || address.length > 2048)
    throw new AsyncError("parameters");
  return address;
}
export function rehearseEvent(
  doc: AsyncDocument,
  journal: EventEntry[],
  input: RehearsalInput,
  replayOf: number | null = null,
): EventEntry[] {
  if (journal.length >= MAX_EVENT_JOURNAL) throw new AsyncError("journal");
  const op = doc.catalog.operations.find((o) => o.key === input.operationKey),
    channel = doc.catalog.channels.find((c) => c.key === op?.channelKey),
    message = channel?.messages.find(
      (m) => m.key === input.messageKey && op?.messageKeys.includes(m.key),
    );
  if (!op || !channel || !message) throw new AsyncError("selection");
  const payload = parseEventPayload(JSON.stringify(input.payload)),
    headers = parseEventHeaders(JSON.stringify(input.headers)),
    parameters = parseEventParameters(JSON.stringify(input.parameters));
  const address = resolveEventAddress(channel, parameters),
    check = checkEventMessage(doc, message, payload, headers);
  check.findings.push(...op.findings);
  if (check.status === "valid" && op.findings.length) check.status = "partial";
  const entry: EventEntry = {
    operationKey: op.key,
    messageKey: message.key,
    parameters,
    payload,
    headers,
    sequence: (journal.at(-1)?.sequence ?? 0) + 1,
    address,
    action: op.action,
    check,
    replayOf,
  };
  if (getByteSize(JSON.stringify([...journal, entry])) > MAX_ASYNC_BYTES)
    throw new AsyncError("journal");
  return [...journal, entry];
}
export function replayEvent(
  doc: AsyncDocument,
  journal: EventEntry[],
  sequence: number,
) {
  const event = journal.find((e) => e.sequence === sequence);
  if (!event) throw new AsyncError("selection");
  return rehearseEvent(doc, journal, event, sequence);
}
export function eventJournalReport(doc: AsyncDocument, journal: EventEntry[]) {
  return {
    kind: "rsswag-event-rehearsal-report",
    version: 1,
    title: doc.catalog.title,
    counts: {
      valid: journal.filter((e) => e.check.status === "valid").length,
      invalid: journal.filter((e) => e.check.status === "invalid").length,
      partial: journal.filter((e) => e.check.status === "partial").length,
    },
    events: journal.map((e) => ({
      sequence: e.sequence,
      operationKey: e.operationKey,
      messageKey: e.messageKey,
      action: e.action,
      replayOf: e.replayOf,
      status: e.check.status,
      issues: e.check.issues,
      findings: e.check.findings,
    })),
  };
}
export function parseAsyncProject(text: string): {
  project: AsyncProject;
  doc: AsyncDocument;
} {
  const raw = boundedJson(text);
  if (
    !obj(raw) ||
    raw.kind !== "rsswag-asyncapi-project" ||
    raw.version !== 1 ||
    !str(raw.name, 120) ||
    !raw.name.trim() ||
    typeof raw.document !== "string" ||
    !Array.isArray(raw.journal) ||
    raw.journal.length > MAX_EVENT_JOURNAL
  )
    throw new AsyncError("project");
  const doc = readAsyncDocument(raw.document);
  let journal: EventEntry[] = [];
  for (const [i, event] of raw.journal.entries()) {
    if (
      !obj(event) ||
      event.sequence !== i + 1 ||
      !str(event.operationKey) ||
      !str(event.messageKey) ||
      !obj(event.parameters) ||
      !obj(event.headers) ||
      !Object.hasOwn(event, "payload") ||
      (event.replayOf !== null &&
        (!Number.isInteger(event.replayOf) ||
          Number(event.replayOf) < 1 ||
          Number(event.replayOf) > i))
    )
      throw new AsyncError("project");
    journal = rehearseEvent(
      doc,
      journal,
      event as unknown as RehearsalInput,
      event.replayOf as number | null,
    );
  }
  return {
    doc,
    project: {
      kind: "rsswag-asyncapi-project",
      version: 1,
      name: raw.name,
      document: raw.document,
      journal,
    },
  };
}
export function serializeAsyncProject(
  doc: AsyncDocument,
  journal: EventEntry[],
  name: string,
) {
  const text =
    JSON.stringify(
      {
        kind: "rsswag-asyncapi-project",
        version: 1,
        name,
        document: exportAsyncDocument(doc, "json"),
        journal,
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_ASYNC_BYTES) throw new AsyncError("limit");
  parseAsyncProject(text);
  return text;
}
export function addAsyncChannel(
  doc: AsyncDocument,
  input: {
    key: string;
    address: string;
    messageName: string;
    action: "send" | "receive";
    example: string;
  },
) {
  if (
    !doc.catalog.version.startsWith("3.") ||
    !/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(input.key) ||
    !str(input.messageName, 120) ||
    !input.messageName.trim() ||
    !str(input.address, 2048) ||
    !input.address.trim() ||
    /[\u0000-\u001f{}]/.test(input.address) ||
    !["send", "receive"].includes(input.action)
  )
    throw new AsyncError("builder");
  const root = boundedJson(JSON.stringify(doc.root)) as Record<
    string,
    JsonValue
  >;
  const channels = obj(root.channels) ? root.channels : {};
  if (Object.hasOwn(channels, input.key)) throw new AsyncError("builder");
  const parsed = parseSchemaSample(input.example);
  if (!parsed.ok || parsed.sample.bytes > MAX_EVENT_BYTES)
    throw new AsyncError("json");
  const inferred = inferResponseSchema([parsed.sample]);
  const m = {
    name: input.messageName,
    contentType: "application/json",
    payload: inferred.schema,
    examples: [
      { name: "Seed example", payload: parsed.sample.value, headers: {} },
    ],
  };
  root.channels = {
    ...channels,
    [input.key]: { address: input.address, messages: { event: m } },
  } as JsonValue;
  const operations = obj(root.operations) ? root.operations : {};
  let operationKey = `${input.action}_${input.key}`,
    n = 1;
  while (Object.hasOwn(operations, operationKey))
    operationKey = `${input.action}_${input.key}_${n++}`;
  root.operations = {
    ...operations,
    [operationKey]: {
      action: input.action,
      channel: { $ref: `#/channels/${escapeTransformPointer(input.key)}` },
      messages: [
        {
          $ref: `#/channels/${escapeTransformPointer(input.key)}/messages/event`,
        },
      ],
    },
  } as JsonValue;
  return readAsyncDocument(JSON.stringify(root, null, 2));
}
export function asyncCatalogMarkdown(doc: AsyncDocument) {
  const safe = (v: string) => v.replace(/[\r\n|`<>]/g, " ");
  const lines = [
    `# ${safe(doc.catalog.title)}`,
    "",
    `AsyncAPI ${safe(doc.catalog.version)}`,
    "",
    "| Channel | Address | Action | Operation | Message |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const op of doc.catalog.operations) {
    const c = doc.catalog.channels.find((c) => c.key === op.channelKey)!;
    for (const key of op.messageKeys)
      lines.push(
        `| ${safe(c.key)} | ${safe(c.address ?? "dynamic")} | ${op.action} | ${safe(op.key)} | ${safe(key)} |`,
      );
  }
  lines.push("", "## Review findings", "");
  for (const finding of doc.catalog.findings)
    lines.push(`- ${finding.code}: ${safe(finding.pointer)}`);
  lines.push(
    "",
    "Generated by RSSwag. This inventory does not certify complete AsyncAPI or broker compatibility.",
    "",
  );
  return lines.join("\n");
}
