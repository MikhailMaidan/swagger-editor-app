import {
  MAX_RPC_CONTRACT_BYTES,
  RpcError,
  rpcJson,
  rpcObject,
  rpcOwn,
  rpcText,
  type JsonValue,
} from "./rpc-json";
import { parseJsonPointer } from "./example-validation";

export type RpcDescriptor = {
  name: string;
  schema: JsonValue;
  required: boolean;
};
export type RpcMethod = {
  name: string;
  summary: string;
  index: number;
  params: RpcDescriptor[];
  result: RpcDescriptor | null;
  structure: "by-name" | "by-position" | "either";
  deprecated: boolean;
  source: Record<string, unknown>;
};
export type RpcContract = {
  root: Record<string, unknown>;
  title: string;
  methods: RpcMethod[];
  issues: { index: number; code: "reference" | "reserved" }[];
};
export function resolveRpcRef(
  root: Record<string, unknown>,
  input: unknown,
): unknown {
  let value = input;
  const seen = new Set<string>();
  for (let hops = 0; hops <= 16; hops++) {
    if (!rpcObject(value) || !rpcOwn(value, "$ref")) return value;
    if (
      typeof value.$ref !== "string" ||
      !value.$ref.startsWith("#") ||
      seen.has(value.$ref)
    )
      throw new RpcError("reference");
    seen.add(value.$ref);
    let parts: string[] | null;
    try {
      parts = parseJsonPointer(decodeURIComponent(value.$ref.slice(1)));
    } catch {
      throw new RpcError("reference");
    }
    if (!parts) throw new RpcError("reference");
    value = root;
    for (const part of parts) {
      if ((rpcObject(value) || Array.isArray(value)) && rpcOwn(value, part))
        value = (value as Record<string, unknown>)[part];
      else throw new RpcError("reference");
    }
  }
  throw new RpcError("reference");
}
function descriptor(
  root: Record<string, unknown>,
  input: unknown,
): RpcDescriptor {
  const value = resolveRpcRef(root, input);
  if (
    !rpcObject(value) ||
    !rpcText(value.name, 256) ||
    !value.name ||
    !rpcOwn(value, "schema") ||
    !(typeof value.schema === "boolean" || rpcObject(value.schema)) ||
    (value.required !== undefined && typeof value.required !== "boolean")
  )
    throw new RpcError("contract");
  return {
    name: value.name,
    schema: value.schema as JsonValue,
    required: value.required === true,
  };
}
export function readRpcContract(source: string): RpcContract {
  const root = rpcJson(source, MAX_RPC_CONTRACT_BYTES);
  if (
    !rpcObject(root) ||
    typeof root.openrpc !== "string" ||
    !/^1\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(root.openrpc) ||
    !rpcObject(root.info) ||
    !rpcText(root.info.title, 256) ||
    !root.info.title ||
    !rpcText(root.info.version, 120) ||
    !root.info.version ||
    !Array.isArray(root.methods) ||
    root.methods.length > 100
  )
    throw new RpcError("contract");
  const methods: RpcMethod[] = [],
    issues: RpcContract["issues"] = [];
  const names = new Set<string>();
  root.methods.forEach((input, index) => {
    try {
      const value = resolveRpcRef(root, input);
      if (
        !rpcObject(value) ||
        !rpcText(value.name, 256) ||
        !value.name ||
        names.has(value.name) ||
        !Array.isArray(value.params) ||
        value.params.length > 40 ||
        (value.paramStructure !== undefined &&
          !["by-name", "by-position", "either"].includes(
            value.paramStructure as string,
          ))
      )
        throw new RpcError("contract");
      const params = value.params.map((p) => descriptor(root, p));
      if (
        new Set(params.map((p) => p.name)).size !== params.length ||
        params.some(
          (p, i) => p.required && params.slice(0, i).some((p) => !p.required),
        )
      )
        throw new RpcError("contract");
      names.add(value.name);
      if (value.name.startsWith("rpc.") && value.name !== "rpc.discover")
        issues.push({ index, code: "reserved" });
      methods.push({
        name: value.name,
        summary:
          typeof value.summary === "string" ? value.summary.slice(0, 1000) : "",
        index,
        params,
        result: rpcOwn(value, "result") ? descriptor(root, value.result) : null,
        structure: (value.paramStructure ?? "either") as RpcMethod["structure"],
        deprecated: value.deprecated === true,
        source: value,
      });
    } catch (e) {
      if (e instanceof RpcError && e.code === "reference")
        issues.push({ index, code: "reference" });
      else throw e;
    }
  });
  return { root, title: root.info.title, methods, issues };
}
export function saveRpcMethod(
  source: string,
  original: string | null,
  draft: string,
): string {
  const contract = readRpcContract(source),
    method = rpcJson(draft);
  if (!rpcObject(method)) throw new RpcError("contract");
  const index =
    original === null
      ? -1
      : contract.methods.find((m) => m.name === original)?.index;
  if (index === undefined) throw new RpcError("contract");
  const methods = [...(contract.root.methods as JsonValue[])];
  if (index === -1) methods.push(method);
  else methods[index] = method;
  const next = JSON.stringify({ ...contract.root, methods }, null, 2);
  readRpcContract(next);
  return next;
}

export type RpcSchemaIssue = {
  path: string;
  code:
    | "type"
    | "required"
    | "additional"
    | "bounds"
    | "enum"
    | "unsupported"
    | "reference"
    | "limit";
  error: boolean;
};
export type RpcSchemaBudget = { steps: number };
const supported = new Set([
  "$ref",
  "$schema",
  "$id",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "enum",
  "const",
  "title",
  "description",
  "default",
  "examples",
  "example",
  "deprecated",
  "readOnly",
  "writeOnly",
  "definitions",
  "$defs",
]);
const valueType = (v: unknown) =>
  v === null
    ? "null"
    : Array.isArray(v)
      ? "array"
      : typeof v === "number" && Number.isInteger(v)
        ? "integer"
        : typeof v;
export function checkRpcSchema(
  root: Record<string, unknown>,
  schema: unknown,
  value: unknown,
  budget: RpcSchemaBudget = { steps: 0 },
): RpcSchemaIssue[] {
  const issues: RpcSchemaIssue[] = [];
  const issue = (path: string, code: RpcSchemaIssue["code"], error = true) => {
    if (issues.length < 50) issues.push({ path, code, error });
    else if (error && !issues.some((i) => i.error))
      issues[issues.length - 1] = { path, code, error };
  };
  const equal = (a: unknown, b: unknown): boolean => {
    if (++budget.steps > 10000) return false;
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b))
      return a.length === b.length && a.every((v, i) => equal(v, b[i]));
    if (rpcObject(a) && rpcObject(b))
      return (
        Object.keys(a).length === Object.keys(b).length &&
        Object.keys(a).every((k) => rpcOwn(b, k) && equal(a[k], b[k]))
      );
    return false;
  };
  const visit = (s: unknown, v: unknown, path: string, depth: number) => {
    if (++budget.steps > 10000 || depth > 32) {
      issue(path, "limit", false);
      return;
    }
    try {
      s = resolveRpcRef(root, s);
    } catch {
      issue(path, "reference", false);
      return;
    }
    if (s === false) {
      issue(path, "type");
      return;
    }
    if (s === true) return;
    if (!rpcObject(s)) {
      issue(path, "unsupported", false);
      return;
    }
    if (Object.keys(s).some((k) => !supported.has(k) && !k.startsWith("x-")))
      issue(path, "unsupported", false);
    if (
      (s.type !== undefined &&
        !(typeof s.type === "string" || Array.isArray(s.type))) ||
      (typeof s.$schema === "string" && !s.$schema.includes("draft-07"))
    )
      issue(path, "unsupported", false);
    const types =
      typeof s.type === "string"
        ? [s.type]
        : Array.isArray(s.type)
          ? s.type
          : [];
    if (
      types.length &&
      !types.some(
        (t) =>
          t === valueType(v) || (t === "number" && valueType(v) === "integer"),
      )
    ) {
      issue(path, "type");
      return;
    }
    const enumInvalid =
      Array.isArray(s.enum) && !s.enum.some((option) => equal(option, v));
    const constInvalid = rpcOwn(s, "const") && !equal(s.const, v);
    if (budget.steps > 10000) {
      issue(path, "limit", false);
      return;
    }
    if (enumInvalid || constInvalid) issue(path, "enum");
    if (typeof v === "number") {
      if (
        (typeof s.minimum === "number" && v < s.minimum) ||
        (typeof s.maximum === "number" && v > s.maximum) ||
        (typeof s.exclusiveMinimum === "number" && v <= s.exclusiveMinimum) ||
        (typeof s.exclusiveMaximum === "number" && v >= s.exclusiveMaximum)
      )
        issue(path, "bounds");
    }
    if (typeof v === "string") {
      const length = Array.from(v).length;
      if (
        (typeof s.minLength === "number" && length < s.minLength) ||
        (typeof s.maxLength === "number" && length > s.maxLength)
      )
        issue(path, "bounds");
    }
    if (Array.isArray(v)) {
      if (
        (typeof s.minItems === "number" && v.length < s.minItems) ||
        (typeof s.maxItems === "number" && v.length > s.maxItems)
      )
        issue(path, "bounds");
      if (Array.isArray(s.items)) issue(path, "unsupported", false);
      else if (s.items !== undefined)
        for (let i = 0; i < v.length && budget.steps <= 10000; i++)
          visit(s.items, v[i], `${path}/${i}`, depth + 1);
    }
    if (rpcObject(v)) {
      const props = rpcObject(s.properties) ? s.properties : {};
      if (Array.isArray(s.required))
        for (const key of s.required)
          if (typeof key === "string" && !rpcOwn(v, key))
            issue(path, "required");
      for (const [key, child] of Object.entries(v)) {
        if (budget.steps > 10000) break;
        const childPath = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
        if (rpcOwn(props, key)) visit(props[key], child, childPath, depth + 1);
        else if (s.additionalProperties === false)
          issue(childPath, "additional");
        else if (rpcObject(s.additionalProperties))
          visit(s.additionalProperties, child, childPath, depth + 1);
      }
    }
  };
  visit(schema, value, "", 0);
  return issues;
}
export function rpcSample(
  root: Record<string, unknown>,
  input: unknown,
  depth = 0,
): JsonValue {
  if (depth > 8) return null;
  let s: unknown;
  try {
    s = resolveRpcRef(root, input);
  } catch {
    return null;
  }
  if (!rpcObject(s)) return null;
  for (const key of ["example", "default", "const"])
    if (rpcOwn(s, key)) return s[key] as JsonValue;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0] as JsonValue;
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (type === "object" || rpcObject(s.properties))
    return Object.fromEntries(
      Object.entries(rpcObject(s.properties) ? s.properties : {})
        .slice(0, 30)
        .map(([k, v]) => [k, rpcSample(root, v, depth + 1)]),
    );
  if (type === "array")
    return Array.from(
      {
        length: Math.min(
          3,
          typeof s.minItems === "number"
            ? Math.max(0, Math.floor(s.minItems))
            : 1,
        ),
      },
      () => rpcSample(root, s.items, depth + 1),
    );
  if (type === "boolean") return false;
  if (type === "number" || type === "integer")
    return typeof s.minimum === "number"
      ? s.minimum
      : typeof s.maximum === "number" && s.maximum < 0
        ? s.maximum
        : 0;
  if (type === "null") return null;
  return "example";
}
