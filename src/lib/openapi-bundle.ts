import YAML from "yaml";
import { getByteSize } from "./text-encoding";
import type { SchemaFormat } from "./openapi";

export const MAX_BUNDLE_FILES = 50;
export const MAX_BUNDLE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_BUNDLE_PROJECT_BYTES = 8 * 1024 * 1024;
export const MAX_BUNDLE_OUTPUT_BYTES = 16 * 1024 * 1024;
export type BundleFile = { path: string; text: string };
export type BundleProject = { root: string; files: BundleFile[] };
export type BundleIssueCode =
  | "path"
  | "duplicate"
  | "limit"
  | "parse"
  | "root"
  | "missing-file"
  | "missing-pointer"
  | "reference"
  | "remote"
  | "dialect"
  | "discriminator"
  | "relative-resource"
  | "project";
export class BundleError extends Error {
  constructor(
    public code: BundleIssueCode,
    public file = "",
  ) {
    super(code);
  }
}
export type BundleIssue = {
  code: BundleIssueCode;
  file: string;
  pointer: string;
  reference?: string;
};
export type BundleReference = {
  file: string;
  pointer: string;
  reference: string;
  targetFile?: string;
  targetPointer?: string;
  outputRef?: string;
};
export type BundleResult = {
  document: Record<string, unknown> | null;
  issues: BundleIssue[];
  references: BundleReference[];
  files: { path: string; bytes: number; used: boolean }[];
  namespace: string;
  embeddedCount: number;
};
type Json = null | string | number | boolean | Json[] | { [key: string]: Json };
type Kind =
  | "document"
  | "paths"
  | "responses"
  | "components"
  | "schema"
  | "pathItem"
  | "operation"
  | "parameter"
  | "response"
  | "requestBody"
  | "media"
  | "example"
  | "link"
  | "callback"
  | "encoding"
  | "discriminator"
  | "mapping"
  | "security"
  | "literal"
  | `map:${string}`
  | `array:${string}`;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const escapePointer = (key: string) =>
  key.replace(/~/g, "~0").replace(/\//g, "~1");
const appendPointer = (pointer: string, key: string) =>
  `${pointer}/${escapePointer(key)}`;
const fragment = (pointer: string) =>
  `#${pointer
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;

export function normalizeBundlePath(input: string): string {
  if (
    !input ||
    input.length > 512 ||
    /^[\/\\]/.test(input) ||
    /[\\:#?\u0000-\u001f\u007f]/.test(input)
  )
    throw new BundleError("path", input);
  const parts: string[] = [];
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new BundleError("path", input);
      parts.pop();
    } else parts.push(part);
  }
  if (!parts.length) throw new BundleError("path", input);
  return parts.join("/");
}

export function validateBundleFiles(files: BundleFile[]): BundleFile[] {
  if (!Array.isArray(files) || files.length > MAX_BUNDLE_FILES)
    throw new BundleError("limit");
  const seen = new Set<string>();
  let bytes = 0;
  return files.map((file) => {
    if (
      !record(file) ||
      typeof file.path !== "string" ||
      typeof file.text !== "string"
    )
      throw new BundleError("project");
    const path = normalizeBundlePath(file.path);
    if (seen.has(path)) throw new BundleError("duplicate", path);
    seen.add(path);
    const size = getByteSize(file.text);
    bytes += size;
    if (size > MAX_BUNDLE_FILE_BYTES || bytes > MAX_BUNDLE_PROJECT_BYTES)
      throw new BundleError("limit", path);
    return { path, text: file.text };
  });
}
export function mergeBundleFiles(
  current: BundleFile[],
  incoming: BundleFile[],
  replace = false,
) {
  const additions = validateBundleFiles(incoming);
  const result = new Map(
    validateBundleFiles(current).map((file) => [file.path, file]),
  );
  for (const file of additions) {
    if (!replace && result.has(file.path))
      throw new BundleError("duplicate", file.path);
    result.set(file.path, file);
  }
  return validateBundleFiles([...result.values()]);
}
export function serializeBundleProject(project: BundleProject) {
  const files = validateBundleFiles(project.files);
  if (project.root && !files.some((file) => file.path === project.root))
    throw new BundleError("root");
  const text =
    JSON.stringify(
      {
        kind: "rsswag-multi-file-project",
        version: 1,
        root: project.root,
        files,
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_BUNDLE_OUTPUT_BYTES)
    throw new BundleError("limit");
  return text;
}
export function parseBundleProject(text: string): BundleProject {
  if (getByteSize(text) > MAX_BUNDLE_OUTPUT_BYTES)
    throw new BundleError("limit");
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new BundleError("project");
  }
  if (
    !record(value) ||
    value.kind !== "rsswag-multi-file-project" ||
    value.version !== 1 ||
    typeof value.root !== "string" ||
    !Array.isArray(value.files)
  )
    throw new BundleError("project");
  const files = validateBundleFiles(value.files);
  const root = value.root ? normalizeBundlePath(value.root) : "";
  if (root && !files.some((file) => file.path === root))
    throw new BundleError("root");
  return { root, files };
}

function parseFile(file: BundleFile): Json {
  try {
    const doc = YAML.parseDocument(file.text, { uniqueKeys: true });
    if (doc.errors.length || doc.warnings.length) throw new Error();
    const value: unknown = doc.toJS({ maxAliasCount: 100 });
    const ancestors = new Set<object>();
    let nodes = 0;
    function clone(value: unknown, depth: number): Json {
      if (++nodes > 100000 || depth > 80)
        throw new BundleError("limit", file.path);
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean"
      )
        return value;
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (!Number.isInteger(value) || Number.isSafeInteger(value))
      )
        return value;
      if (!record(value) && !Array.isArray(value)) throw new Error();
      if (ancestors.has(value)) throw new Error();
      ancestors.add(value);
      const result = Array.isArray(value)
        ? value.map((child) => clone(child, depth + 1))
        : Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              clone(child, depth + 1),
            ]),
          );
      ancestors.delete(value);
      return result;
    }
    return clone(value, 0);
  } catch (error) {
    if (error instanceof BundleError) throw error;
    throw new BundleError("parse", file.path);
  }
}

const componentKinds: Record<string, Kind> = {
  schemas: "schema",
  parameters: "parameter",
  headers: "parameter",
  responses: "response",
  requestBodies: "requestBody",
  examples: "example",
  links: "link",
  callbacks: "callback",
  pathItems: "pathItem",
  securitySchemes: "security",
};
function childKind(kind: Kind, key: string, value: Json): Kind {
  if (kind.startsWith("map:") || kind.startsWith("array:")) {
    const child = kind.slice(kind.indexOf(":") + 1) as Kind;
    return child;
  }
  if (kind === "paths") return key.startsWith("/") ? "pathItem" : "literal";
  if (kind === "responses")
    return /^(default|[1-5][0-9xX]{2})$/.test(key) ? "response" : "literal";
  if (kind === "document") {
    if (key === "components") return "components";
    if (key === "paths") return "paths";
    if (key === "webhooks") return "map:pathItem";
    if (key === "definitions") return "map:schema";
    if (key === "parameters") return "map:parameter";
    if (key === "responses") return "map:response";
  }
  if (kind === "components" && Object.hasOwn(componentKinds, key))
    return `map:${componentKinds[key]}`;
  if (kind === "schema") {
    if (
      [
        "properties",
        "patternProperties",
        "$defs",
        "definitions",
        "dependentSchemas",
      ].includes(key)
    )
      return "map:schema";
    if (key === "dependencies") return "map:schema";
    if (["allOf", "anyOf", "oneOf", "prefixItems"].includes(key))
      return "array:schema";
    if (
      [
        "items",
        "additionalItems",
        "additionalProperties",
        "contains",
        "propertyNames",
        "not",
        "if",
        "then",
        "else",
        "unevaluatedItems",
        "unevaluatedProperties",
        "contentSchema",
      ].includes(key)
    )
      return Array.isArray(value) ? "array:schema" : "schema";
    if (key === "discriminator") return "discriminator";
  }
  if (kind === "discriminator" && key === "mapping") return "mapping";
  if (kind === "pathItem") {
    if (/^(get|put|post|delete|options|head|patch|trace|query)$/.test(key))
      return "operation";
    if (key === "additionalOperations") return "map:operation";
    if (key === "parameters") return "array:parameter";
  }
  if (kind === "operation") {
    if (key === "parameters") return "array:parameter";
    if (key === "responses") return "responses";
    if (key === "requestBody") return "requestBody";
    if (key === "callbacks") return "map:callback";
  }
  if (["parameter", "response", "requestBody"].includes(kind)) {
    if (key === "schema" || key === "items") return "schema";
    if (key === "content") return "map:media";
    if (key === "headers") return "map:parameter";
    if (key === "links") return "map:link";
    if (kind === "parameter" && key === "examples") return "map:example";
  }
  if (kind === "media") {
    if (key === "schema" || key === "itemSchema") return "schema";
    if (key === "examples") return "map:example";
    if (key === "encoding") return "map:encoding";
  }
  if (kind === "encoding" && key === "headers") return "map:parameter";
  if (kind === "callback" && !key.startsWith("x-") && key !== "$ref")
    return "pathItem";
  return "literal";
}
const refKinds = new Set<Kind>([
  "schema",
  "pathItem",
  "parameter",
  "response",
  "requestBody",
  "example",
  "link",
  "callback",
  "security",
]);

function resolveReference(source: string, reference: string) {
  if (reference.length > 4096) throw new BundleError("limit");
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//"))
    throw new BundleError("remote");
  const hash = reference.indexOf("#");
  const path = hash < 0 ? reference : reference.slice(0, hash);
  const rawPointer = hash < 0 ? "" : reference.slice(hash + 1);
  if (path.includes("?")) throw new BundleError("reference");
  let decoded: string, pointer: string;
  try {
    decoded = decodeURIComponent(path);
    pointer = decodeURIComponent(rawPointer);
  } catch {
    throw new BundleError("reference");
  }
  if (pointer && (!pointer.startsWith("/") || /~(?![01])/.test(pointer)))
    throw new BundleError("reference");
  if (decoded.startsWith("/")) throw new BundleError("path");
  const directory = source.includes("/")
    ? source.slice(0, source.lastIndexOf("/") + 1)
    : "";
  const file = decoded ? normalizeBundlePath(directory + decoded) : source;
  return { file, pointer };
}
function atPointer(value: Json, pointer: string): Json {
  if (!pointer) return value;
  for (const part of pointer.slice(1).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) ||
      !Object.hasOwn(value, key)
    )
      throw new BundleError("missing-pointer");
    value = (value as Record<string, Json>)[key];
  }
  return value;
}

export function bundleOpenApiProject(project: BundleProject): BundleResult {
  const result: BundleResult = {
    document: null,
    issues: [],
    references: [],
    files: [],
    namespace: "",
    embeddedCount: 0,
  };
  const documents = new Map<string, Json>();
  const used = new Set<string>();
  let root = "";
  function issue(
    code: BundleIssueCode,
    file: string,
    pointer = "",
    reference?: string,
  ) {
    if (result.issues.length < 1000)
      result.issues.push({
        code,
        file,
        pointer,
        ...(reference !== undefined ? { reference } : {}),
      });
  }
  try {
    const files = validateBundleFiles(project.files);
    root = normalizeBundlePath(project.root);
    result.files = files.map((file) => ({
      path: file.path,
      bytes: getByteSize(file.text),
      used: false,
    }));
    for (const file of files) {
      try {
        documents.set(file.path, parseFile(file));
      } catch (error) {
        issue(error instanceof BundleError ? error.code : "parse", file.path);
      }
    }
    const original = documents.get(root);
    if (
      !record(original) ||
      !(
        original.swagger === "2.0" ||
        (typeof original.openapi === "string" &&
          /^3\.(0|1|2)\.\d+$/.test(original.openapi))
      )
    ) {
      issue("root", root);
      return result;
    }
    used.add(root);
    if (
      typeof original.jsonSchemaDialect === "string" &&
      original.jsonSchemaDialect !==
        "https://spec.openapis.org/oas/3.1/dialect/base" &&
      original.jsonSchemaDialect !==
        "https://spec.openapis.org/oas/3.2/dialect/base"
    )
      issue("dialect", root, "/jsonSchemaDialect");
    let namespace = "x-rsswag-bundled";
    let suffix = 1;
    while (Object.hasOwn(original, namespace))
      namespace = `x-rsswag-bundled-${++suffix}`;
    result.namespace = namespace;
    const rootContexts = new Map<string, Kind>();
    function index(value: Json, pointer: string, kind: Kind) {
      if (kind === "literal") return;
      rootContexts.set(pointer, kind);
      if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value))
          index(
            child,
            appendPointer(pointer, key),
            childKind(kind, key, child),
          );
    }
    index(original as Json, "", "document");
    const slots = new Map<string, string>();
    const queue: {
      file: string;
      pointer: string;
      kind: Kind;
      name: string;
      value: Json;
    }[] = [];
    const embedded: Record<string, Json> = {};
    let visits = 0;
    function rewrite(
      reference: unknown,
      file: string,
      pointer: string,
      kind: Kind,
    ): Json {
      if (typeof reference !== "string") {
        issue("reference", file, pointer);
        return reference as Json;
      }
      if (result.references.length >= 5000)
        throw new BundleError("limit", file);
      const entry: BundleReference = { file, pointer, reference };
      result.references.push(entry);
      try {
        const target = resolveReference(file, reference);
        entry.targetFile = target.file;
        entry.targetPointer = target.pointer;
        const document = documents.get(target.file);
        if (document === undefined) throw new BundleError("missing-file");
        const value = atPointer(document, target.pointer);
        if (
          !record(value) &&
          !(kind === "schema" && typeof value === "boolean")
        )
          throw new BundleError("reference");
        // An ancestor resource identifier changes the base of nested references.
        const segments = target.pointer
          ? target.pointer.slice(1).split("/")
          : [];
        for (let i = 0; i < segments.length; i++) {
          const ancestor = atPointer(
            document,
            i ? `/${segments.slice(0, i).join("/")}` : "",
          );
          if (
            record(ancestor) &&
            (Object.hasOwn(ancestor, "$id") || Object.hasOwn(ancestor, "id"))
          )
            throw new BundleError("dialect");
        }
        used.add(target.file);
        // Preserve existing root component identities, including implicit schema names.
        if (target.file === root && rootContexts.get(target.pointer) === kind)
          entry.outputRef = fragment(target.pointer);
        else {
          const id = JSON.stringify([target.file, target.pointer, kind]);
          let name = slots.get(id);
          if (!name) {
            if (slots.size >= 1000) throw new BundleError("limit");
            name = `ref${slots.size + 1}`;
            slots.set(id, name);
            queue.push({ ...target, kind, name, value });
          }
          entry.outputRef = fragment(`/${namespace}/${name}`);
        }
        return entry.outputRef;
      } catch (error) {
        issue(
          error instanceof BundleError ? error.code : "reference",
          file,
          pointer,
          reference,
        );
        return reference;
      }
    }
    function walk(
      value: Json,
      file: string,
      pointer: string,
      kind: Kind,
    ): Json {
      if (++visits > 200000) throw new BundleError("limit", file);
      if (kind === "literal" || value === null || typeof value !== "object")
        return value;
      if (Array.isArray(value))
        return value.map((child, i) =>
          walk(
            child,
            file,
            appendPointer(pointer, String(i)),
            childKind(kind, String(i), child),
          ),
        );
      if (kind === "schema") {
        for (const key of [
          "id",
          "$vocabulary",
          "$id",
          "$anchor",
          "$dynamicAnchor",
          "$dynamicRef",
          "$recursiveRef",
          "$recursiveAnchor",
        ])
          if (Object.hasOwn(value, key))
            issue("dialect", file, appendPointer(pointer, key));
        if (
          typeof value.$schema === "string" &&
          !/^(?:https?:\/\/json-schema\.org\/(?:draft-0[467]\/schema#?|draft\/(?:2019-09|2020-12)\/schema#?)|https:\/\/spec\.openapis\.org\/oas\/3\.[12]\/dialect\/base)$/.test(
            value.$schema,
          )
        )
          issue("dialect", file, appendPointer(pointer, "$schema"));
        if (record(value.discriminator) && !record(value.discriminator.mapping))
          issue("discriminator", file, appendPointer(pointer, "discriminator"));
      }
      if (file !== root) {
        const resources = [
          value.externalDocs,
          ...(Array.isArray(value.servers) ? value.servers : []),
          ...(kind === "link" ? [value.server] : []),
        ];
        if (
          resources.some(
            (resource) =>
              record(resource) &&
              typeof resource.url === "string" &&
              !/^[a-z][a-z0-9+.-]*:/i.test(resource.url),
          )
        )
          issue("relative-resource", file, pointer);
      }
      if (
        kind === "example" &&
        typeof value.externalValue === "string" &&
        !/^[a-z][a-z0-9+.-]*:/i.test(value.externalValue)
      )
        issue(
          "relative-resource",
          file,
          appendPointer(pointer, "externalValue"),
        );
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => {
          const location = appendPointer(pointer, key);
          if (
            (key === "$ref" && refKinds.has(kind)) ||
            (key === "operationRef" && kind === "link")
          )
            return [
              key,
              rewrite(
                child,
                file,
                location,
                key === "operationRef" ? "operation" : kind,
              ),
            ];
          if (kind === "mapping" && typeof child === "string") {
            const isName = !/[\/#.:]/.test(child);
            if (isName && file === root) return [key, child];
            return [
              key,
              rewrite(
                isName ? `#/components/schemas/${escapePointer(child)}` : child,
                file,
                location,
                "schema",
              ),
            ];
          }
          return [
            key,
            walk(child, file, location, childKind(kind, key, child)),
          ];
        }),
      );
    }
    const output = walk(original as Json, root, "", "document") as Record<
      string,
      Json
    >;
    // Queueing avoids recursive expansion of reference cycles and long file chains.
    for (let i = 0; i < queue.length; i++) {
      const target = queue[i];
      embedded[target.name] = walk(
        target.value,
        target.file,
        target.pointer,
        target.kind,
      );
    }
    result.embeddedCount = slots.size;
    if (slots.size)
      Object.defineProperty(output, namespace, {
        value: embedded,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    if (!result.issues.length) {
      if (getByteSize(JSON.stringify(output)) > MAX_BUNDLE_OUTPUT_BYTES)
        throw new BundleError("limit");
      result.document = output;
    }
  } catch (error) {
    issue(
      error instanceof BundleError ? error.code : "limit",
      error instanceof BundleError ? error.file : root,
    );
  }
  result.files = result.files.map((file) => ({
    ...file,
    used: used.has(file.path),
  }));
  return result;
}

export function serializeOpenApiBundle(
  result: BundleResult,
  format: SchemaFormat,
) {
  if (!result.document || result.issues.length)
    throw new BundleError("reference");
  const text =
    format === "json"
      ? JSON.stringify(result.document, null, 2) + "\n"
      : YAML.stringify(result.document, {
          lineWidth: 0,
          aliasDuplicateObjects: false,
        });
  if (getByteSize(text) > MAX_BUNDLE_OUTPUT_BYTES)
    throw new BundleError("limit");
  return text;
}
