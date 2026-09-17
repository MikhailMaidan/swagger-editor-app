import YAML from "yaml";
import { parseOpenApiSchema, type SchemaFormat } from "./openapi";
import { getByteSize } from "./text-encoding";

export const MAX_TRANSFORM_BYTES = 2 * 1024 * 1024;
export const MAX_TRANSFORM_STEPS = 100;
const MAX_NODES = 50000;
const MAX_DEPTH = 64;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type PatchOperation =
  | { op: "add" | "replace" | "test"; path: string; value: JsonValue }
  | { op: "move" | "copy"; path: string; from: string }
  | { op: "remove"; path: string };
export type TransformIssue =
  | "limit"
  | "json"
  | "recipe"
  | "pointer"
  | "missing"
  | "index"
  | "descendant"
  | "test"
  | "source"
  | "result";
export class TransformError extends Error {
  constructor(
    public code: TransformIssue,
    public step: number | null = null,
  ) {
    super(code);
  }
}
export type TransformChange = {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
};
export type TransformSource = {
  text: string;
  document: JsonValue;
  format: SchemaFormat;
  title: string;
};
export type TransformPreview = {
  source: TransformSource;
  document: JsonValue;
  changes: TransformChange[];
  truncated: boolean;
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const escapeTransformPointer = (key: string) =>
  key.replace(/~/g, "~0").replace(/\//g, "~1");

// Clone only JSON data, bounding alias expansion, nesting and resource use before
// anything reaches the editor's parser. Own keys remain ordinary data, even
// when a schema has properties named __proto__ or constructor.
function cloneJson(input: unknown): JsonValue {
  const ancestors = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  function visit(value: unknown, depth: number): JsonValue {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH)
      throw new TransformError("limit");
    bytes += typeof value === "string" ? getByteSize(value) : 8;
    if (bytes > MAX_TRANSFORM_BYTES) throw new TransformError("limit");
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "string"
    )
      return value;
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value))
    )
      return value;
    if ((!record(value) && !Array.isArray(value)) || ancestors.has(value))
      throw new TransformError("json");
    ancestors.add(value);
    let result: JsonValue;
    if (Array.isArray(value))
      result = value.map((child) => visit(child, depth + 1));
    else {
      if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        throw new TransformError("json");
      result = Object.fromEntries(
        Object.entries(value).map(([key, child]) => {
          bytes += getByteSize(key);
          return [key, visit(child, depth + 1)];
        }),
      );
    }
    ancestors.delete(value);
    return result;
  }
  return visit(input, 0);
}

export function parseTransformPointer(pointer: string): string[] {
  if (
    typeof pointer !== "string" ||
    pointer.length > 4096 ||
    (pointer !== "" && !pointer.startsWith("/")) ||
    /~(?:[^01]|$)/.test(pointer)
  )
    throw new TransformError("pointer");
  const parts =
    pointer === ""
      ? []
      : pointer
          .slice(1)
          .split("/")
          .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (parts.length > MAX_DEPTH) throw new TransformError("limit");
  return parts;
}

export function parseTransformValue(text: string): JsonValue {
  if (getByteSize(text) > MAX_TRANSFORM_BYTES)
    throw new TransformError("limit");
  try {
    return cloneJson(JSON.parse(text.replace(/^\uFEFF/, "")));
  } catch (error) {
    throw error instanceof TransformError ? error : new TransformError("json");
  }
}

export function validatePatch(input: unknown): PatchOperation[] {
  if (!Array.isArray(input)) throw new TransformError("recipe");
  if (input.length > MAX_TRANSFORM_STEPS) throw new TransformError("limit");
  // Validate the aggregate, not just individual values.
  cloneJson(input);
  return input.map((entry, step) => {
    try {
      if (
        !record(entry) ||
        typeof entry.op !== "string" ||
        typeof entry.path !== "string"
      )
        throw new TransformError("recipe");
      parseTransformPointer(entry.path);
      switch (entry.op) {
        case "remove":
          return { op: entry.op, path: entry.path };
        case "add":
        case "replace":
        case "test":
          if (!Object.hasOwn(entry, "value"))
            throw new TransformError("recipe");
          return {
            op: entry.op,
            path: entry.path,
            value: cloneJson(entry.value),
          };
        case "copy":
        case "move":
          if (typeof entry.from !== "string")
            throw new TransformError("recipe");
          parseTransformPointer(entry.from);
          return { op: entry.op, path: entry.path, from: entry.from };
        default:
          throw new TransformError("recipe");
      }
    } catch (error) {
      if (error instanceof TransformError) error.step = step;
      throw error;
    }
  });
}
export const parsePatch = (text: string) =>
  validatePatch(parseTransformValue(text));
export function serializePatch(operations: PatchOperation[]) {
  const text = JSON.stringify(validatePatch(operations), null, 2) + "\n";
  if (getByteSize(text) > MAX_TRANSFORM_BYTES)
    throw new TransformError("limit");
  return text;
}

function arrayIndex(key: string, length: number, insert = false) {
  if (key === "-" && insert) return length;
  if (!/^(0|[1-9]\d*)$/.test(key)) throw new TransformError("index");
  const index = Number(key);
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > length ||
    (!insert && index === length)
  )
    throw new TransformError("index");
  return index;
}
function readAt(root: JsonValue | undefined, parts: string[]): JsonValue {
  let value = root;
  for (const key of parts) {
    if (Array.isArray(value)) value = value[arrayIndex(key, value.length)];
    else if (record(value) && Object.hasOwn(value, key))
      value = value[key] as JsonValue;
    else throw new TransformError("missing");
  }
  if (value === undefined) throw new TransformError("missing");
  return value;
}
function writeAt(
  root: JsonValue | undefined,
  parts: string[],
  action: "add" | "replace" | "remove",
  value?: JsonValue,
): JsonValue | undefined {
  if (!parts.length) {
    if (action !== "add" && root === undefined)
      throw new TransformError("missing");
    return action === "remove" ? undefined : value;
  }
  const parent = readAt(root, parts.slice(0, -1));
  const key = parts[parts.length - 1];
  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length, action === "add");
    if (action === "remove") parent.splice(index, 1);
    else if (action === "add") parent.splice(index, 0, value!);
    else parent[index] = value!;
  } else if (record(parent)) {
    if (action !== "add" && !Object.hasOwn(parent, key))
      throw new TransformError("missing");
    if (action === "remove") delete parent[key];
    else
      Object.defineProperty(parent, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
  } else throw new TransformError("missing");
  return root;
}
function equalJson(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((item, index) => equalJson(item, right[index]))
    );
  if (record(left) && record(right))
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.entries(left).every(
        ([key, value]) =>
          Object.hasOwn(right, key) &&
          equalJson(value as JsonValue, right[key] as JsonValue),
      )
    );
  return false;
}

export function applyPatch(
  source: JsonValue,
  input: PatchOperation[],
): JsonValue | undefined {
  const operations = validatePatch(input);
  let document: JsonValue | undefined = cloneJson(source);
  operations.forEach((operation, step) => {
    try {
      const path = parseTransformPointer(operation.path);
      if (operation.op === "test") {
        if (!equalJson(readAt(document, path), operation.value))
          throw new TransformError("test");
      } else if (operation.op === "move" || operation.op === "copy") {
        const from = parseTransformPointer(operation.from);
        if (
          operation.op === "move" &&
          from.length < path.length &&
          from.every((part, index) => part === path[index])
        )
          throw new TransformError("descendant");
        const value = cloneJson(readAt(document, from));
        if (operation.op === "move")
          document = writeAt(document, from, "remove");
        document = writeAt(document, path, "add", value);
      } else {
        document = writeAt(
          document,
          path,
          operation.op,
          "value" in operation ? cloneJson(operation.value) : undefined,
        );
      }
      // A sequence of copies must not grow without bounds. Cloning also keeps
      // copied branches independent and catches excessive resulting depth.
      if (document !== undefined) {
        document = cloneJson(document);
        if (getByteSize(JSON.stringify(document)) > MAX_TRANSFORM_BYTES)
          throw new TransformError("limit");
      }
    } catch (error) {
      if (error instanceof TransformError) error.step = step;
      throw error;
    }
  });
  return document;
}

export function readTransformSource(text: string): TransformSource {
  if (getByteSize(text) > MAX_TRANSFORM_BYTES)
    throw new TransformError("limit");
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  const format: SchemaFormat = /^[{[]/.test(trimmed) ? "json" : "yaml";
  let document: JsonValue;
  try {
    if (format === "json") document = parseTransformValue(trimmed);
    else {
      const parsed = YAML.parseDocument(text, { uniqueKeys: true });
      if (parsed.errors.length || parsed.warnings.length)
        throw new TransformError("source");
      document = cloneJson(parsed.toJS({ maxAliasCount: 50 }));
    }
  } catch (error) {
    throw error instanceof TransformError
      ? error
      : new TransformError("source");
  }
  const parsed = parseOpenApiSchema(JSON.stringify(document));
  if (!parsed.ok) throw new TransformError("source");
  return { text, document, format, title: parsed.value.title };
}

function summarize(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (record(value)) return `{${Object.keys(value).length} keys}`;
  const text = JSON.stringify(value);
  return text.length > 180 ? text.slice(0, 180) + "…" : text;
}
export function describeTransformChanges(before: JsonValue, after: JsonValue) {
  const changes: TransformChange[] = [];
  let truncated = false;
  function visit(
    left: JsonValue | undefined,
    right: JsonValue | undefined,
    path: string,
  ) {
    if (
      truncated ||
      (left !== undefined && right !== undefined && equalJson(left, right))
    )
      return;
    if (record(left) && record(right)) {
      for (const key of new Set([
        ...Object.keys(left),
        ...Object.keys(right),
      ])) {
        visit(
          Object.hasOwn(left, key) ? (left[key] as JsonValue) : undefined,
          Object.hasOwn(right, key) ? (right[key] as JsonValue) : undefined,
          `${path}/${escapeTransformPointer(key)}`,
        );
        if (truncated) break;
      }
      return;
    }
    if (changes.length >= 200) {
      truncated = true;
      return;
    }
    changes.push({
      path,
      kind:
        left === undefined
          ? "added"
          : right === undefined
            ? "removed"
            : "changed",
      ...(left === undefined ? {} : { before: summarize(left) }),
      ...(right === undefined ? {} : { after: summarize(right) }),
    });
  }
  visit(before, after, "");
  return { changes, truncated };
}
export function previewTransformation(
  source: TransformSource,
  operations: PatchOperation[],
): TransformPreview {
  const document = applyPatch(source.document, operations);
  if (
    document === undefined ||
    !parseOpenApiSchema(JSON.stringify(document)).ok
  )
    throw new TransformError("result");
  return {
    source,
    document,
    ...describeTransformChanges(source.document, document),
  };
}
export function serializeTransformation(
  preview: TransformPreview,
  format: SchemaFormat,
) {
  const text =
    format === "json"
      ? JSON.stringify(preview.document, null, 2) + "\n"
      : YAML.stringify(preview.document, { aliasDuplicateObjects: false });
  // Indentation may expand a valid input, but output is still explicitly bounded.
  if (getByteSize(text) > MAX_TRANSFORM_BYTES * 4)
    throw new TransformError("limit");
  return text;
}
export function listTransformPointers(document: JsonValue) {
  const pointers: { path: string; summary: string }[] = [];
  function visit(value: JsonValue, path: string) {
    if (pointers.length >= MAX_NODES) return;
    pointers.push({ path, summary: summarize(value) });
    if (Array.isArray(value))
      value.forEach((child, index) => visit(child, `${path}/${index}`));
    else if (record(value))
      Object.entries(value).forEach(([key, child]) =>
        visit(child as JsonValue, `${path}/${escapeTransformPointer(key)}`),
      );
  }
  visit(document, "");
  return pointers;
}
