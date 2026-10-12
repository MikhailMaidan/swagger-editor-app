import * as protobuf from "protobufjs";
import {
  parseTransformValue,
  TransformError,
  type JsonValue,
} from "./api-transform";
import { getByteSize } from "./text-encoding";

export const MAX_PROTO_FILES = 40;
export const MAX_PROTO_SOURCE_BYTES = 512 * 1024;
export const MAX_PROTO_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_PROTO_PAYLOAD_BYTES = 128 * 1024;
export const MAX_PROTO_BINARY_BYTES = 256 * 1024;
export const MAX_PROTO_CASES = 50;
const MAX_WORK = 5000;
const MAX_DEPTH = 24;
export type ProtoErrorCode =
  | "schema"
  | "import"
  | "path"
  | "limit"
  | "payload"
  | "binary"
  | "frame"
  | "project"
  | "case"
  | "generation";
export class ProtoStudioError extends Error {
  constructor(
    public code: ProtoErrorCode,
    public details = "",
  ) {
    super(code);
  }
}
export type ProtoFile = { path: string; source: string };
export type ProtoField = {
  name: string;
  number: number;
  type: string;
  repeated: boolean;
  required: boolean;
  hasPresence: boolean;
  mapKey: string;
  oneof: string;
  description: string;
};
export type ProtoType = {
  name: string;
  kind: "message" | "enum";
  description: string;
  fields: ProtoField[];
  values: { name: string; number: number }[];
  dependencies: string[];
  reserved: (number[] | string)[];
};
export type ProtoMethod = {
  key: string;
  service: string;
  name: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
  description: string;
};
export type ProtoContract = {
  files: ProtoFile[];
  entry: string;
  root: protobuf.Root;
  types: ProtoType[];
  methods: ProtoMethod[];
  imports: {
    from: string;
    path: string;
    builtin: boolean;
    weak: boolean;
    missing: boolean;
  }[];
  fieldCount: number;
};
export type ProtoDraft = {
  name: string;
  method: string;
  requests: string;
  responses: string;
};
export type ProtoCase = ProtoDraft & { id: string };
export type ProtoProject = {
  kind: "rsswag-protobuf-project";
  version: 1;
  name: string;
  files: ProtoFile[];
  entry: string;
  draft: ProtoDraft;
  cases: ProtoCase[];
};
export type ProtoIssue = {
  path: string;
  code:
    | "object"
    | "unknown"
    | "required"
    | "oneof"
    | "array"
    | "map"
    | "key"
    | "scalar"
    | "enum"
    | "null";
};
export type ProtoCheck = { valid: boolean; issues: ProtoIssue[] };
export type ProtoEncoded = {
  type: string;
  byteLength: number;
  base64: string;
  hex: string;
  json: JsonValue;
};
export type ProtoRehearsal = {
  method: string;
  requests: ProtoEncoded[];
  responses: ProtoEncoded[];
  requestFrames: string;
  responseFrames: string;
  byteLength: number;
};
export type ProtoChangeCode =
  | "typeRemoved"
  | "methodRemoved"
  | "methodChanged"
  | "fieldRemoved"
  | "fieldReserved"
  | "fieldAdded"
  | "requiredAdded"
  | "fieldChanged"
  | "fieldRenamed"
  | "tagChanged"
  | "enumRemoved"
  | "enumRenamed"
  | "added";
export type ProtoChange = {
  severity: "error" | "warning" | "info";
  code: ProtoChangeCode;
  location: string;
};
export type ProtoComparison = {
  changes: ProtoChange[];
  errors: number;
  warnings: number;
  additions: number;
};

const record = (v: unknown): v is Record<string, JsonValue> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: object, key: string) =>
  Object.prototype.hasOwnProperty.call(v, key);
const full = (v: protobuf.ReflectionObject) => v.fullName.replace(/^\./, "");
const pointer = (p: string, key: string) =>
  `${p}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
const signed64 = new Set(["int64", "sint64", "sfixed64"]);
const unsigned64 = new Set(["uint64", "fixed64"]);
const signed32 = new Set(["int32", "sint32", "sfixed32"]);
const unsigned32 = new Set(["uint32", "fixed32"]);
const builtinNames = [
  "any",
  "duration",
  "empty",
  "field_mask",
  "struct",
  "timestamp",
  "wrappers",
].map((n) => `google/protobuf/${n}.proto`);

export function normalizeProtoPath(path: string, origin = ""): string {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 512 ||
    /[\x00-\x1f:?*<>|]/.test(path) ||
    /^[\\/]/.test(path)
  )
    throw new ProtoStudioError("path");
  const parts = origin.split("/").slice(0, -1);
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new ProtoStudioError("path");
      parts.pop();
    } else parts.push(part);
  }
  const result = parts.join("/");
  if (!result.endsWith(".proto")) throw new ProtoStudioError("path");
  return result;
}

function preflightSource(source: string) {
  if (getByteSize(source) > MAX_PROTO_SOURCE_BYTES)
    throw new ProtoStudioError("limit");
  const lexer = protobuf.tokenize(source, true);
  let token: string | null,
    count = 0,
    depth = 0;
  while ((token = lexer.next()) !== null) {
    if (++count > 20000) throw new ProtoStudioError("limit");
    if (token === '"' || token === "'") {
      lexer.next();
      lexer.skip(token);
      continue;
    }
    if (token === "{") {
      if (++depth > MAX_DEPTH) throw new ProtoStudioError("limit");
    }
    if (token === "}") depth--;
    if (token === "__proto__" || token === "edition")
      throw new ProtoStudioError(
        "schema",
        "Use proto2/proto3 declarations without __proto__ identifiers.",
      );
  }
}

export function readProtoContract(
  input: ProtoFile[],
  entry: string,
): ProtoContract {
  if (!Array.isArray(input) || !input.length || input.length > MAX_PROTO_FILES)
    throw new ProtoStudioError("limit");
  const files = input.map((file) => {
    if (!file || typeof file.source !== "string")
      throw new ProtoStudioError("schema");
    return {
      path: normalizeProtoPath(file.path),
      source: file.source.replace(/^\uFEFF/, ""),
    };
  });
  if (files.reduce((n, f) => n + getByteSize(f.source), 0) > 1024 * 1024)
    throw new ProtoStudioError("limit");
  const byPath = new Map(files.map((f) => [f.path, f]));
  if (byPath.size !== files.length)
    throw new ProtoStudioError("path", "Duplicate file path.");
  entry = normalizeProtoPath(entry);
  if (!byPath.has(entry)) throw new ProtoStudioError("import", entry);
  const root = new protobuf.Root(),
    visited = new Set<string>();
  const imports: ProtoContract["imports"] = [];
  const queue = [entry];
  try {
    for (let index = 0; index < queue.length; index++) {
      const path = queue[index];
      if (visited.has(path)) continue;
      visited.add(path);
      const file = byPath.get(path);
      if (!file) {
        const builtin = (
          protobuf.common as unknown as Record<string, protobuf.INamespace>
        )[path];
        if (!builtin || !builtinNames.includes(path))
          throw new ProtoStudioError("import", path);
        root.addJSON(builtin.nested ?? {});
        continue;
      }
      preflightSource(file.source);
      const parsed = protobuf.parse(file.source, root, {
        keepCase: true,
        alternateCommentMode: true,
      });
      for (const [paths, weak] of [
        [parsed.imports ?? [], false],
        [parsed.weakImports ?? [], true],
      ] as const) {
        for (const dependency of paths) {
          const relative = normalizeProtoPath(dependency, path);
          const absolute = dependency.replace(/\\/g, "/").startsWith("../")
            ? relative
            : normalizeProtoPath(dependency);
          const resolved = byPath.has(relative)
            ? relative
            : byPath.has(absolute) || builtinNames.includes(absolute)
              ? absolute
              : relative;
          const builtin =
              !byPath.has(resolved) && builtinNames.includes(resolved),
            missing = !byPath.has(resolved) && !builtin;
          imports.push({ from: path, path: resolved, builtin, weak, missing });
          if (missing && !weak)
            throw new ProtoStudioError("import", `${path}: ${dependency}`);
          if (!missing && !visited.has(resolved)) queue.push(resolved);
          if (imports.length > 1000) throw new ProtoStudioError("limit");
        }
      }
    }
    root.resolveAll();
    const types: ProtoType[] = [],
      methods: ProtoMethod[] = [];
    let fieldCount = 0,
      work = 0;
    function walk(object: protobuf.ReflectionObject, depth: number) {
      if (++work > 8000 || depth > MAX_DEPTH || full(object).length > 1024)
        throw new ProtoStudioError("limit");
      if (object instanceof protobuf.Type) {
        if ((object as protobuf.Type & { group?: boolean }).group)
          throw new ProtoStudioError(
            "schema",
            "Legacy groups are unsupported.",
          );
        fieldCount += object.fieldsArray.length;
        if (
          object.fieldsArray.some(
            (f) =>
              f.id < 1 || f.id > 536870911 || (f.id >= 19000 && f.id <= 19999),
          )
        )
          throw new ProtoStudioError(
            "schema",
            "Field tags must be 1–536870911, excluding the reserved 19000–19999 range.",
          );
        const fields = object.fieldsArray.map((f) => ({
          name: f.name,
          number: f.id,
          type: f.resolvedType ? full(f.resolvedType) : f.type,
          repeated: f.repeated,
          required: f.required,
          hasPresence: Boolean(f.hasPresence),
          mapKey: f instanceof protobuf.MapField ? f.keyType : "",
          oneof: f.partOf?.name ?? "",
          description: f.comment ?? "",
        }));
        types.push({
          name: full(object),
          kind: "message",
          description: object.comment ?? "",
          fields,
          values: [],
          dependencies: [
            ...new Set(
              object.fieldsArray.flatMap((f) =>
                f.resolvedType ? [full(f.resolvedType)] : [],
              ),
            ),
          ],
          reserved: object.reserved ?? [],
        });
      } else if (object instanceof protobuf.Enum) {
        const values = Object.values(object.values);
        if (
          !values.length ||
          values.some(
            (n) => !Number.isInteger(n) || n < -2147483648 || n > 2147483647,
          )
        )
          throw new ProtoStudioError(
            "schema",
            "Enum values must be int32 numbers and an enum must contain at least one value.",
          );
        types.push({
          name: full(object),
          kind: "enum",
          description: object.comment ?? "",
          fields: [],
          values: Object.entries(object.values).map(([name, number]) => ({
            name,
            number,
          })),
          dependencies: [],
          reserved: object.reserved ?? [],
        });
      } else if (object instanceof protobuf.Service) {
        for (const m of object.methodsArray) {
          methods.push({
            key: `/${full(object)}/${m.name}`,
            service: full(object),
            name: m.name,
            requestType: full(m.resolvedRequestType!),
            responseType: full(m.resolvedResponseType!),
            requestStream: Boolean(m.requestStream),
            responseStream: Boolean(m.responseStream),
            description: m.comment ?? "",
          });
        }
      }
      if (
        types.length > 1000 ||
        fieldCount > MAX_WORK ||
        methods.length > 500 ||
        types.reduce((n, t) => n + t.values.length, 0) > MAX_WORK
      )
        throw new ProtoStudioError("limit");
      if (object instanceof protobuf.Namespace)
        object.nestedArray.forEach((child) => walk(child, depth + 1));
    }
    walk(root, 0);
    if (!types.length)
      throw new ProtoStudioError(
        "schema",
        "No messages or enums in the entry contract.",
      );
    return { files, entry, root, types, methods, imports, fieldCount };
  } catch (error) {
    if (error instanceof ProtoStudioError) throw error;
    throw new ProtoStudioError(
      "schema",
      error instanceof Error ? error.message.slice(0, 1000) : "",
    );
  }
}

function parsePayload(text: string): JsonValue {
  if (getByteSize(text) > MAX_PROTO_PAYLOAD_BYTES)
    throw new ProtoStudioError("limit");
  try {
    const value: JsonValue = JSON.parse(text.replace(/^\uFEFF/, ""));
    let steps = 0;
    function inspect(v: JsonValue, depth: number) {
      if (++steps > MAX_WORK || depth > MAX_DEPTH)
        throw new ProtoStudioError("limit");
      if (typeof v === "number" && !Number.isFinite(v))
        throw new ProtoStudioError("payload");
      if (Array.isArray(v)) v.forEach((child) => inspect(child, depth + 1));
      else if (record(v))
        Object.values(v).forEach((child) => inspect(child, depth + 1));
    }
    inspect(value, 0);
    return value;
  } catch (e) {
    if (e instanceof ProtoStudioError) throw e;
    throw new ProtoStudioError(
      e instanceof TransformError && e.code === "limit" ? "limit" : "payload",
    );
  }
}
function messageType(contract: ProtoContract, name: string): protobuf.Type {
  const type = contract.root.lookup(name);
  if (!(type instanceof protobuf.Type))
    throw new ProtoStudioError("payload", name);
  return type;
}
function valid64(value: JsonValue, unsigned: boolean) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return false;
  } else if (
    typeof value !== "string" ||
    !/^-?(0|[1-9]\d*)$/.test(value) ||
    value.length > 21
  )
    return false;
  try {
    const n = BigInt(value as string | number);
    return (
      n >= (unsigned ? BigInt(0) : -(BigInt(1) << BigInt(63))) &&
      n <= (BigInt(1) << BigInt(unsigned ? 64 : 63)) - BigInt(1)
    );
  } catch {
    return false;
  }
}
function validBase64(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    return false;
  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}

function checkValue(type: protobuf.Type, value: JsonValue): ProtoCheck {
  const issues: ProtoIssue[] = [];
  let steps = 0;
  const issue = (path: string, code: ProtoIssue["code"]) => {
    if (issues.length < 100) issues.push({ path, code });
  };
  function visit(
    current: protobuf.Type,
    v: JsonValue,
    path: string,
    depth: number,
  ) {
    if (++steps > MAX_WORK || depth > MAX_DEPTH)
      throw new ProtoStudioError("limit");
    if (!record(v)) {
      issue(path, "object");
      return;
    }
    for (const key of Object.keys(v))
      if (!own(current.fields, key)) issue(pointer(path, key), "unknown");
    for (const group of current.oneofsArray) {
      if (group.oneof.filter((k) => own(v, k)).length > 1) issue(path, "oneof");
    }
    for (const f of current.fieldsArray) {
      const p = pointer(path, f.name);
      if (!own(v, f.name)) {
        if (f.required) issue(p, "required");
        continue;
      }
      const child = v[f.name];
      if (f instanceof protobuf.MapField) {
        if (!record(child)) {
          issue(p, "map");
          continue;
        }
        for (const [key, item] of Object.entries(child)) {
          if (++steps > MAX_WORK) throw new ProtoStudioError("limit");
          const k = pointer(p, key);
          if (
            ["__proto__", "constructor", "prototype"].includes(key) ||
            (f.keyType === "bool"
              ? !["true", "false"].includes(key)
              : f.keyType === "string"
                ? false
                : !validScalar(f.keyType, key, true))
          )
            issue(k, "key");
          scalar(f, item, k, depth + 1);
        }
      } else if (f.repeated) {
        if (!Array.isArray(child)) issue(p, "array");
        else
          child.forEach((item, i) =>
            scalar(f, item, pointer(p, String(i)), depth + 1),
          );
      } else scalar(f, child, p, depth + 1);
    }
  }
  function validScalar(name: string, v: JsonValue, mapKey = false) {
    if (signed64.has(name) || unsigned64.has(name))
      return valid64(v, unsigned64.has(name));
    if (signed32.has(name) || unsigned32.has(name)) {
      const n =
        mapKey && typeof v === "string" && /^-?(0|[1-9]\d*)$/.test(v)
          ? Number(v)
          : v;
      return (
        typeof n === "number" &&
        Number.isInteger(n) &&
        n >= (unsigned32.has(name) ? 0 : -2147483648) &&
        n <= (unsigned32.has(name) ? 4294967295 : 2147483647)
      );
    }
    if (name === "float" || name === "double")
      return (
        typeof v === "number" &&
        Number.isFinite(v) &&
        (name === "double" || Math.abs(v) <= 3.4028234663852886e38)
      );
    if (name === "bool") return typeof v === "boolean";
    if (name === "string") return typeof v === "string";
    if (name === "bytes") return validBase64(v);
    return false;
  }
  function scalar(f: protobuf.Field, v: JsonValue, p: string, depth: number) {
    if (++steps > MAX_WORK || depth > MAX_DEPTH)
      throw new ProtoStudioError("limit");
    if (v === null) {
      issue(p, "null");
      return;
    }
    if (f.resolvedType instanceof protobuf.Type)
      visit(f.resolvedType, v, p, depth);
    else if (f.resolvedType instanceof protobuf.Enum) {
      // protobuf.js resolves proto2 closed / proto3 open enum behavior here.
      // The dependency is pinned, and both semantics have round-trip coverage.
      const closed =
        (
          f.resolvedType as protobuf.Enum & {
            _features?: { enum_type?: string };
          }
        )._features?.enum_type === "CLOSED";
      if (
        !(typeof v === "string" && own(f.resolvedType.values, v)) &&
        !(
          typeof v === "number" &&
          Number.isInteger(v) &&
          v >= -2147483648 &&
          v <= 2147483647 &&
          (!closed || own(f.resolvedType.valuesById, String(v)))
        )
      )
        issue(p, "enum");
    } else if (!validScalar(f.type, v)) issue(p, "scalar");
  }
  visit(type, value, "", 0);
  return { valid: issues.length === 0, issues };
}

export function checkProtoPayload(
  contract: ProtoContract,
  typeName: string,
  text: string,
): ProtoCheck {
  return checkValue(messageType(contract, typeName), parsePayload(text));
}

// Scan known nested messages before allocating decoded objects. This also bounds
// packed primitives, maps, and unknown fields; discarded bytes cannot hide work.
function preflightWire(type: protobuf.Type, bytes: Uint8Array) {
  let steps = 0;
  function count(depth: number) {
    if (++steps > MAX_WORK || depth > MAX_DEPTH)
      throw new ProtoStudioError("limit");
  }
  function varint(state: { pos: number }, end: number): bigint {
    let n = BigInt(0);
    for (let i = 0; i < 10; i++) {
      if (state.pos >= end) throw new ProtoStudioError("binary");
      const b = bytes[state.pos++];
      if (i === 9 && b > 1) throw new ProtoStudioError("binary");
      n |= BigInt(b & 127) << BigInt(7 * i);
      if (!(b & 128)) return n;
    }
    throw new ProtoStudioError("binary");
  }
  function expected(name: string) {
    return ["double", "fixed64", "sfixed64"].includes(name)
      ? 1
      : ["float", "fixed32", "sfixed32"].includes(name)
        ? 5
        : ["string", "bytes"].includes(name)
          ? 2
          : 0;
  }
  function item(
    state: { pos: number },
    end: number,
    wire: number,
    name: string,
    nested: protobuf.Type | undefined,
    repeated: boolean,
    depth: number,
    known: boolean,
  ) {
    count(depth);
    const wanted = nested ? 2 : expected(name);
    if (known && wire !== wanted && !(repeated && wire === 2 && wanted !== 2))
      throw new ProtoStudioError("binary");
    if (wire === 0) {
      varint(state, end);
      return;
    }
    if (wire === 1 || wire === 5) {
      state.pos += wire === 1 ? 8 : 4;
      if (state.pos > end) throw new ProtoStudioError("binary");
      return;
    }
    if (wire !== 2)
      throw new ProtoStudioError(
        "binary",
        "Groups and invalid wire types are unsupported.",
      );
    const length = varint(state, end);
    if (length > BigInt(end - state.pos)) throw new ProtoStudioError("binary");
    const stop = state.pos + Number(length);
    if (nested) scan(nested, state, stop, depth + 1);
    else if (known && repeated && wanted !== 2)
      while (state.pos < stop)
        item(state, stop, wanted, name, undefined, false, depth + 1, true);
    else {
      if (known && name === "string") {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(state.pos, stop),
          );
        } catch {
          throw new ProtoStudioError("binary", "Invalid UTF-8 string.");
        }
      }
      state.pos = stop;
    }
  }
  function scan(
    current: protobuf.Type | undefined,
    state: { pos: number },
    end: number,
    depth: number,
    map?: protobuf.MapField,
  ) {
    count(depth);
    while (state.pos < end) {
      const tag = varint(state, end);
      if (tag > BigInt(4294967295) || tag >> BigInt(3) === BigInt(0))
        throw new ProtoStudioError("binary");
      const id = Number(tag >> BigInt(3)),
        wire = Number(tag & BigInt(7));
      const f = current?.fieldsById[id];
      if (f instanceof protobuf.MapField) {
        if (wire !== 2) throw new ProtoStudioError("binary");
        const length = varint(state, end);
        if (length > BigInt(end - state.pos))
          throw new ProtoStudioError("binary");
        scan(undefined, state, state.pos + Number(length), depth + 1, f);
      } else {
        const mapped = map && id === 2 ? map : f;
        const name = map && id === 1 ? map.keyType : (mapped?.type ?? "");
        const nested =
          mapped?.resolvedType instanceof protobuf.Type
            ? mapped.resolvedType
            : undefined;
        item(
          state,
          end,
          wire,
          name,
          nested,
          Boolean(f?.repeated),
          depth,
          Boolean(f || (map && (id === 1 || id === 2))),
        );
      }
    }
  }
  scan(type, { pos: 0 }, bytes.length, 0);
}

export function readProtoBytes(
  text: string,
  format: "base64" | "hex",
): Uint8Array {
  if (text.length > MAX_PROTO_BINARY_BYTES * 3)
    throw new ProtoStudioError("limit");
  text = text.replace(/\s/g, "");
  if (format === "base64") {
    if (!validBase64(text)) throw new ProtoStudioError("binary");
    const decoded = atob(text);
    if (decoded.length > MAX_PROTO_BINARY_BYTES)
      throw new ProtoStudioError("limit");
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  }
  if (!/^(?:[\da-fA-F]{2})*$/.test(text)) throw new ProtoStudioError("binary");
  if (text.length / 2 > MAX_PROTO_BINARY_BYTES)
    throw new ProtoStudioError("limit");
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}
function byteText(bytes: Uint8Array): { base64: string; hex: string } {
  if (bytes.length > MAX_PROTO_BINARY_BYTES)
    throw new ProtoStudioError("limit");
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return {
    base64: btoa(binary),
    hex: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  };
}
function decodeValue(type: protobuf.Type, bytes: Uint8Array): JsonValue {
  preflightWire(type, bytes);
  try {
    const reader = protobuf.Reader.create(bytes);
    reader.discardUnknown = true;
    const result = type.toObject(type.decode(reader), {
      longs: String,
      enums: String,
      bytes: String,
      defaults: false,
      arrays: false,
      objects: false,
    });
    function finite(v: unknown) {
      if (typeof v === "number" && !Number.isFinite(v))
        throw new ProtoStudioError(
          "binary",
          "Non-finite floating-point values cannot be represented in this JSON editor.",
        );
      if (Array.isArray(v)) v.forEach(finite);
      else if (v && typeof v === "object") Object.values(v).forEach(finite);
    }
    finite(result);
    const text = JSON.stringify(result);
    if (getByteSize(text) > MAX_PROTO_PAYLOAD_BYTES)
      throw new ProtoStudioError("limit");
    return parsePayload(text);
  } catch (e) {
    if (e instanceof ProtoStudioError) throw e;
    throw new ProtoStudioError(
      "binary",
      e instanceof Error ? e.message.slice(0, 300) : "",
    );
  }
}
export function encodeProtoPayload(
  contract: ProtoContract,
  typeName: string,
  text: string,
): ProtoEncoded {
  const type = messageType(contract, typeName),
    value = parsePayload(text),
    check = checkValue(type, value);
  if (!check.valid)
    throw new ProtoStudioError(
      "payload",
      check.issues
        .map((i) => `${i.path || "/"}: ${i.code}`)
        .slice(0, 10)
        .join("; "),
    );
  try {
    const bytes = type.encode(type.fromObject(value as object)).finish();
    return {
      type: typeName,
      byteLength: bytes.length,
      ...byteText(bytes),
      json: decodeValue(type, bytes),
    };
  } catch (e) {
    if (e instanceof ProtoStudioError) throw e;
    throw new ProtoStudioError("payload");
  }
}
export function decodeProtoPayload(
  contract: ProtoContract,
  typeName: string,
  text: string,
  format: "base64" | "hex",
): ProtoEncoded {
  const bytes = readProtoBytes(text, format);
  return {
    type: typeName,
    byteLength: bytes.length,
    ...byteText(bytes),
    json: decodeValue(messageType(contract, typeName), bytes),
  };
}

export function frameProtoMessages(messages: Uint8Array[]): Uint8Array {
  const length = messages.reduce((n, b) => n + b.length + 5, 0);
  if (
    !messages.length ||
    messages.length > 100 ||
    length > MAX_PROTO_BINARY_BYTES
  )
    throw new ProtoStudioError("limit");
  const result = new Uint8Array(length),
    view = new DataView(result.buffer);
  let offset = 0;
  for (const bytes of messages) {
    view.setUint32(offset + 1, bytes.length, false);
    result.set(bytes, offset + 5);
    offset += bytes.length + 5;
  }
  return result;
}
export function decodeProtoFrames(
  contract: ProtoContract,
  typeName: string,
  text: string,
  format: "base64" | "hex",
): ProtoEncoded[] {
  const bytes = readProtoBytes(text, format),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    results: ProtoEncoded[] = [];
  let offset = 0,
    jsonBytes = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 5 || bytes[offset] !== 0)
      throw new ProtoStudioError(
        "frame",
        "Only complete, uncompressed gRPC message frames are supported.",
      );
    const length = view.getUint32(offset + 1, false);
    if (length > bytes.length - offset - 5) throw new ProtoStudioError("frame");
    const body = bytes.subarray(offset + 5, offset + 5 + length);
    const json = decodeValue(messageType(contract, typeName), body);
    jsonBytes += getByteSize(JSON.stringify(json));
    if (results.length >= 100 || jsonBytes > MAX_PROTO_PAYLOAD_BYTES)
      throw new ProtoStudioError("limit");
    results.push({
      type: typeName,
      byteLength: length,
      ...byteText(body),
      json,
    });
    offset += length + 5;
  }
  if (!results.length) throw new ProtoStudioError("frame");
  return results;
}

export function generateProtoSample(
  contract: ProtoContract,
  typeName: string,
  depth = 3,
): string {
  if (!Number.isInteger(depth) || depth < 1 || depth > 6)
    throw new ProtoStudioError("generation");
  let steps = 0;
  function sample(
    type: protobuf.Type,
    level: number,
    ancestors: Set<string>,
  ): JsonValue {
    if (++steps > 1000) throw new ProtoStudioError("limit");
    const fields: [string, JsonValue][] = [],
      groups = new Set<string>();
    for (const f of type.fieldsArray) {
      if (++steps > 1000) throw new ProtoStudioError("limit");
      if (f.partOf && groups.has(f.partOf.name)) continue;
      let v: JsonValue;
      if (f.resolvedType instanceof protobuf.Type) {
        if (level >= depth || ancestors.has(full(f.resolvedType))) {
          if (f.required)
            throw new ProtoStudioError("generation", full(f.resolvedType));
          if (!f.repeated && !(f instanceof protobuf.MapField)) continue;
          v = {};
        } else
          v = sample(
            f.resolvedType,
            level + 1,
            new Set([...ancestors, full(f.resolvedType)]),
          );
      } else if (f.resolvedType instanceof protobuf.Enum)
        v = Object.keys(f.resolvedType.values)[0];
      else if (f.type === "string")
        v = f.name === "id" || f.name.endsWith("_id") ? "1" : "example";
      else if (f.type === "bytes") v = "aGVsbG8=";
      else if (f.type === "bool") v = true;
      else if (signed64.has(f.type) || unsigned64.has(f.type)) v = "1";
      else v = 1;
      if (f instanceof protobuf.MapField) v = {};
      else if (f.repeated)
        v =
          f.resolvedType instanceof protobuf.Type &&
          (level >= depth || ancestors.has(full(f.resolvedType)))
            ? []
            : [v];
      fields.push([f.name, v]);
      if (f.partOf) groups.add(f.partOf.name);
    }
    return Object.fromEntries(fields);
  }
  const type = messageType(contract, typeName),
    text = JSON.stringify(sample(type, 0, new Set([full(type)])), null, 2);
  if (getByteSize(text) > MAX_PROTO_PAYLOAD_BYTES)
    throw new ProtoStudioError("limit");
  return text;
}

export function generateProtoDraft(
  contract: ProtoContract,
  methodKey: string,
): ProtoDraft {
  const method = contract.methods.find((m) => m.key === methodKey);
  if (!method) throw new ProtoStudioError("case");
  return {
    name: method.name,
    method: method.key,
    requests: JSON.stringify(
      [JSON.parse(generateProtoSample(contract, method.requestType))],
      null,
      2,
    ),
    responses: JSON.stringify(
      [JSON.parse(generateProtoSample(contract, method.responseType))],
      null,
      2,
    ),
  };
}
function exchangeMessages(
  contract: ProtoContract,
  type: string,
  text: string,
  streaming: boolean,
) {
  const array = parsePayload(text);
  if (
    !Array.isArray(array) ||
    !array.length ||
    array.length > 100 ||
    (!streaming && array.length !== 1)
  )
    throw new ProtoStudioError(
      "case",
      streaming
        ? "Provide 1–100 messages in a JSON array."
        : "Provide exactly one message in a JSON array.",
    );
  return array.map((value) =>
    encodeProtoPayload(contract, type, JSON.stringify(value)),
  );
}
export function rehearseProtoExchange(
  contract: ProtoContract,
  draft: ProtoDraft,
): ProtoRehearsal {
  const method = contract.methods.find((m) => m.key === draft.method);
  if (!method) throw new ProtoStudioError("case", draft.method);
  const requests = exchangeMessages(
      contract,
      method.requestType,
      draft.requests,
      method.requestStream,
    ),
    responses = exchangeMessages(
      contract,
      method.responseType,
      draft.responses,
      method.responseStream,
    );
  const requestFrames = frameProtoMessages(
      requests.map((m) => readProtoBytes(m.base64, "base64")),
    ),
    responseFrames = frameProtoMessages(
      responses.map((m) => readProtoBytes(m.base64, "base64")),
    );
  return {
    method: method.key,
    requests,
    responses,
    requestFrames: byteText(requestFrames).base64,
    responseFrames: byteText(responseFrames).base64,
    byteLength: requestFrames.length + responseFrames.length,
  };
}
export function protoRehearsalReport(result: ProtoRehearsal) {
  return {
    kind: "rsswag-protobuf-rehearsal-report",
    version: 1,
    method: result.method,
    requestMessages: result.requests.map((m) => ({
      type: m.type,
      byteLength: m.byteLength,
    })),
    responseMessages: result.responses.map((m) => ({
      type: m.type,
      byteLength: m.byteLength,
    })),
    byteLength: result.byteLength,
  };
}

export function compareProtoContracts(
  base: ProtoContract,
  candidate: ProtoContract,
): ProtoComparison {
  const changes: ProtoChange[] = [];
  function add(
    code: ProtoChangeCode,
    severity: ProtoChange["severity"],
    location: string,
  ) {
    if (changes.length >= 10000) throw new ProtoStudioError("limit");
    changes.push({ code, severity, location });
  }
  const types = new Map(candidate.types.map((t) => [t.name, t]));
  for (const before of base.types) {
    const after = types.get(before.name);
    if (!after || before.kind !== after.kind) {
      add("typeRemoved", "error", before.name);
      continue;
    }
    if (before.kind === "enum") {
      for (const v of before.values) {
        const same = after.values.find((n) => n.number === v.number);
        if (!same)
          add(
            "enumRemoved",
            "warning",
            `${before.name}.${v.name} = ${v.number}`,
          );
        else if (
          !after.values.some((n) => n.name === v.name && n.number === v.number)
        )
          add(
            "enumRenamed",
            "warning",
            `${before.name}.${v.name} = ${v.number}`,
          );
      }
      continue;
    }
    for (const f of before.fields) {
      const next = after.fields.find((n) => n.number === f.number),
        location = `${before.name}.${f.name} #${f.number}`;
      const moved = after.fields.find(
        (n) => n.name === f.name && n.number !== f.number,
      );
      if (moved) add("tagChanged", "error", location);
      if (!next) {
        const reserved = after.reserved.some(
          (r) => Array.isArray(r) && f.number >= r[0] && f.number <= r[1],
        );
        add(
          reserved && !f.required ? "fieldReserved" : "fieldRemoved",
          f.required ? "error" : "warning",
          location,
        );
      } else {
        if (
          f.type !== next.type ||
          f.mapKey !== next.mapKey ||
          f.repeated !== next.repeated ||
          f.required !== next.required ||
          f.hasPresence !== next.hasPresence ||
          f.oneof !== next.oneof
        )
          add("fieldChanged", "error", location);
        if (f.name !== next.name) add("fieldRenamed", "warning", location);
      }
    }
    for (const f of after.fields)
      if (!before.fields.some((n) => n.number === f.number))
        add(
          f.required ? "requiredAdded" : "fieldAdded",
          f.required ? "error" : "info",
          `${after.name}.${f.name} #${f.number}`,
        );
  }
  for (const type of candidate.types)
    if (!base.types.some((t) => t.name === type.name))
      add("added", "info", type.name);
  for (const method of base.methods) {
    const next = candidate.methods.find((m) => m.key === method.key);
    if (!next) add("methodRemoved", "error", method.key);
    else if (
      method.requestType !== next.requestType ||
      method.responseType !== next.responseType ||
      method.requestStream !== next.requestStream ||
      method.responseStream !== next.responseStream
    )
      add("methodChanged", "error", method.key);
  }
  for (const method of candidate.methods)
    if (!base.methods.some((m) => m.key === method.key))
      add("added", "info", method.key);
  return {
    changes,
    errors: changes.filter((c) => c.severity === "error").length,
    warnings: changes.filter((c) => c.severity === "warning").length,
    additions: changes.filter((c) => c.severity === "info").length,
  };
}

export function emptyProtoProject(): ProtoProject {
  return {
    kind: "rsswag-protobuf-project",
    version: 1,
    name: "Protobuf project",
    files: [{ path: "service.proto", source: "" }],
    entry: "service.proto",
    draft: {
      name: "RPC rehearsal",
      method: "",
      requests: "[{}]",
      responses: "[{}]",
    },
    cases: [],
  };
}
function readDraft(value: JsonValue): ProtoDraft {
  if (
    !record(value) ||
    typeof value.name !== "string" ||
    value.name.length > 200 ||
    !value.name.trim() ||
    typeof value.method !== "string" ||
    value.method.length > 1024 ||
    typeof value.requests !== "string" ||
    typeof value.responses !== "string"
  )
    throw new ProtoStudioError("project");
  parsePayload(value.requests);
  parsePayload(value.responses);
  return {
    name: value.name,
    method: value.method,
    requests: value.requests,
    responses: value.responses,
  };
}
export function saveProtoCase(
  project: ProtoProject,
  contract: ProtoContract,
  id = "",
): ProtoProject {
  readDraft(project.draft);
  rehearseProtoExchange(contract, project.draft);
  if (id && !project.cases.some((c) => c.id === id))
    throw new ProtoStudioError("case");
  if (!id && project.cases.length >= MAX_PROTO_CASES)
    throw new ProtoStudioError("limit");
  const item = { ...project.draft, id: id || crypto.randomUUID() };
  return {
    ...project,
    cases: id
      ? project.cases.map((c) => (c.id === id ? item : c))
      : [...project.cases, item],
  };
}
export function serializeProtoProject(project: ProtoProject): string {
  const text = JSON.stringify(project, null, 2);
  if (getByteSize(text) > MAX_PROTO_PROJECT_BYTES)
    throw new ProtoStudioError("limit");
  parseProtoProject(text);
  return text;
}
export function parseProtoProject(text: string): {
  project: ProtoProject;
  contract: ProtoContract;
} {
  if (getByteSize(text) > MAX_PROTO_PROJECT_BYTES)
    throw new ProtoStudioError("limit");
  let v: JsonValue;
  try {
    v = parseTransformValue(text);
  } catch {
    throw new ProtoStudioError("project");
  }
  if (
    !record(v) ||
    v.kind !== "rsswag-protobuf-project" ||
    v.version !== 1 ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 200 ||
    typeof v.entry !== "string" ||
    !Array.isArray(v.files) ||
    !Array.isArray(v.cases) ||
    v.cases.length > MAX_PROTO_CASES
  )
    throw new ProtoStudioError("project");
  const files = v.files.map((f) => {
    if (
      !record(f) ||
      typeof f.path !== "string" ||
      typeof f.source !== "string"
    )
      throw new ProtoStudioError("project");
    return { path: f.path, source: f.source };
  });
  const contract = readProtoContract(files, v.entry),
    ids = new Set<string>();
  const cases = v.cases.map((c) => {
    const draft = readDraft(c);
    if (
      !record(c) ||
      typeof c.id !== "string" ||
      !c.id ||
      c.id.length > 100 ||
      ids.has(c.id)
    )
      throw new ProtoStudioError("project");
    ids.add(c.id);
    return { ...draft, id: c.id };
  });
  return {
    contract,
    project: {
      kind: "rsswag-protobuf-project",
      version: 1,
      name: v.name,
      entry: contract.entry,
      files: contract.files,
      draft: readDraft(v.draft),
      cases,
    },
  };
}

export const DEMO_PROTO_FILES: ProtoFile[] = [
  {
    path: "shop/models.proto",
    source: `syntax = "proto3";
package shop;
// A stored product with precise inventory identifiers.
message Product {
  int64 id = 1;
  string name = 2;
  double price = 3;
  enum State { STATE_UNSPECIFIED = 0; ACTIVE = 1; ARCHIVED = 2; }
  State state = 4;
  repeated string tags = 5;
  map<string, string> labels = 6;
  oneof reference { string sku = 7; bytes barcode = 8; }
}
message GetProductRequest { int64 product_id = 1; }
message ProductBatch { repeated Product products = 1; }
`,
  },
  {
    path: "shop/service.proto",
    source: `syntax = "proto3";
package shop;
import "models.proto";
// Product catalog with all four RPC interaction patterns.
service Catalog {
  rpc GetProduct (GetProductRequest) returns (Product);
  rpc WatchProducts (GetProductRequest) returns (stream Product);
  rpc ImportProducts (stream Product) returns (ProductBatch);
  rpc ExchangeProducts (stream Product) returns (stream Product);
}
`,
  },
];
