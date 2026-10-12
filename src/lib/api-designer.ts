import YAML from "yaml";
import {
  describeTransformChanges,
  escapeTransformPointer,
  parseTransformValue,
  readTransformSource,
  TransformError,
  type JsonValue,
} from "./api-transform";
import { createComponentRegistryReport } from "./component-registry";
import type { SchemaFormat } from "./openapi";
import { getByteSize } from "./text-encoding";

export const MAX_DESIGN_BYTES = 1024 * 1024;
export const MAX_DESIGN_SCHEMA_BYTES = 64 * 1024;
export const MAX_DESIGN_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_DESIGN_HISTORY = 20;
export type DesignDocument = { [key: string]: JsonValue };
export type DesignErrorCode =
  | "source"
  | "version"
  | "limit"
  | "operation"
  | "exists"
  | "path"
  | "schema"
  | "model"
  | "parameter"
  | "payload"
  | "reference"
  | "security"
  | "project"
  | "stale";
export class DesignError extends Error {
  constructor(public code: DesignErrorCode) {
    super(code);
  }
}
export type DesignOperation = {
  key: string;
  path: string;
  method: string;
  operation: DesignDocument;
  inheritedParameters: number;
};
export type DesignOperationForm = {
  key: string;
  path: string;
  method: string;
  summary: string;
  description: string;
  operationId: string;
  tags: string;
  deprecated: boolean;
};
export type DesignParameterForm = {
  index: number;
  name: string;
  location: "path" | "query" | "header" | "cookie";
  description: string;
  required: boolean;
  schema: string;
};
export type DesignPayloadForm = {
  kind: "request" | "response";
  status: string;
  mediaType: string;
  description: string;
  required: boolean;
  schema: string;
};
export type DesignProject = {
  kind: "rsswag-api-design-project";
  version: 1;
  name: string;
  document: DesignDocument;
};
export type DesignHistory = {
  document: DesignDocument;
  past: DesignDocument[];
  future: DesignDocument[];
};
export type DesignReview = {
  changes: { path: string; kind: "added" | "removed" | "changed" }[];
  truncated: boolean;
  editorValid: boolean;
  operationCount: number;
  modelCount: number;
  brokenReferences: number;
  externalReferences: number;
};
export type DesignPreview = {
  before: string;
  after: string;
  documentText: string;
  format: SchemaFormat;
  review: DesignReview;
};
export const DESIGN_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
] as const;
export const designRecord = (v: unknown): v is DesignDocument =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: object, key: string) =>
  Object.prototype.hasOwnProperty.call(v, key);
function put(object: DesignDocument, key: string, value: JsonValue) {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
function child(object: DesignDocument, key: string): DesignDocument {
  if (!own(object, key)) put(object, key, {});
  if (!designRecord(object[key])) throw new DesignError("schema");
  return object[key] as DesignDocument;
}
function reference(value: unknown) {
  return designRecord(value) && own(value, "$ref");
}
const text = (v: unknown) => (typeof v === "string" ? v : "");
const json = (v: unknown) => JSON.stringify(v ?? {}, null, 2);
function optional(object: DesignDocument, key: string, value: string) {
  if (value.trim()) put(object, key, value);
  else delete object[key];
}
function bounded(value: DesignDocument): DesignDocument {
  const source = JSON.stringify(value);
  if (getByteSize(source) > MAX_DESIGN_BYTES) throw new DesignError("limit");
  try {
    return parseTransformValue(source) as DesignDocument;
  } catch (e) {
    throw new DesignError(
      e instanceof TransformError && e.code === "limit" ? "limit" : "schema",
    );
  }
}
export function readDesignDocument(source: string): DesignDocument {
  if (getByteSize(source) > MAX_DESIGN_BYTES) throw new DesignError("limit");
  let document: DesignDocument;
  try {
    document = readTransformSource(source).document as DesignDocument;
  } catch {
    throw new DesignError("source");
  }
  if (
    typeof document.openapi !== "string" ||
    !/^3\.[012]\.\d+(?:[-+].*)?$/.test(document.openapi)
  )
    throw new DesignError("version");
  if (
    designOperations(document).length > 2000 ||
    designModels(document).length > 1000
  )
    throw new DesignError("limit");
  return document;
}
function mutate(
  document: DesignDocument,
  action: (draft: DesignDocument) => void,
): DesignDocument {
  const draft = bounded(document);
  action(draft);
  return readDesignDocument(JSON.stringify(draft));
}
export function newDesignDocument(): DesignDocument {
  return {
    openapi: "3.1.0",
    info: { title: "New API", version: "1.0.0" },
    paths: {},
    components: { schemas: {} },
  };
}
export function designOperations(document: DesignDocument): DesignOperation[] {
  const paths = designRecord(document.paths) ? document.paths : {},
    operations: DesignOperation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!path.startsWith("/") || !designRecord(item) || reference(item))
      continue;
    for (const method of DESIGN_METHODS)
      if (designRecord(item[method]) && !reference(item[method]))
        operations.push({
          key: `/paths/${escapeTransformPointer(path)}/${method}`,
          path,
          method,
          operation: item[method] as DesignDocument,
          inheritedParameters: Array.isArray(item.parameters)
            ? item.parameters.length
            : 0,
        });
  }
  return operations;
}
export function designModels(
  document: DesignDocument,
): { name: string; schema: JsonValue }[] {
  const components = designRecord(document.components)
      ? document.components
      : {},
    schemas = designRecord(components.schemas) ? components.schemas : {};
  return Object.entries(schemas).map(([name, schema]) => ({ name, schema }));
}
export function designOperationForm(
  operation?: DesignOperation,
): DesignOperationForm {
  return {
    key: operation?.key ?? "",
    path: operation?.path ?? "/new-resource",
    method: operation?.method ?? "get",
    summary: text(operation?.operation.summary),
    description: text(operation?.operation.description),
    operationId: text(operation?.operation.operationId),
    tags: Array.isArray(operation?.operation.tags)
      ? operation.operation.tags.filter((t) => typeof t === "string").join(", ")
      : "",
    deprecated: operation?.operation.deprecated === true,
  };
}
function operationAt(document: DesignDocument, key: string): DesignOperation {
  const operation = designOperations(document).find((o) => o.key === key);
  if (!operation) throw new DesignError("operation");
  return operation;
}
function pathNames(path: string): string[] {
  if (!path.startsWith("/") || path.length > 512 || /[\s?#\\]/.test(path))
    throw new DesignError("path");
  const names = [...path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  if (
    /[{}]/.test(path.replace(/\{[^{}]+\}/g, "")) ||
    names.some((name) => !/^[\w.-]{1,100}$/.test(name))
  )
    throw new DesignError("path");
  return [...new Set(names)];
}
function resolveParameter(
  document: DesignDocument,
  parameter: JsonValue,
): JsonValue {
  const seen = new Set<string>();
  for (let i = 0; i < 16 && reference(parameter); i++) {
    const ref = text((parameter as DesignDocument).$ref);
    if (!ref.startsWith("#/components/parameters/") || seen.has(ref))
      throw new DesignError("reference");
    seen.add(ref);
    const name = ref
      .slice("#/components/parameters/".length)
      .replace(/~1/g, "/")
      .replace(/~0/g, "~");
    const components = designRecord(document.components)
        ? document.components
        : {},
      parameters = designRecord(components.parameters)
        ? components.parameters
        : {};
    if (!own(parameters, name)) throw new DesignError("reference");
    parameter = parameters[name];
  }
  if (reference(parameter)) throw new DesignError("reference");
  return parameter;
}
export function saveDesignOperation(
  document: DesignDocument,
  form: DesignOperationForm,
): DesignDocument {
  const names = pathNames(form.path);
  if (
    !DESIGN_METHODS.includes(form.method as (typeof DESIGN_METHODS)[number]) ||
    form.summary.length > 10000 ||
    form.description.length > 64000 ||
    form.operationId.length > 200 ||
    form.tags.length > 2000
  )
    throw new DesignError("operation");
  const previous = form.key ? operationAt(document, form.key) : null;
  if (
    previous &&
    (previous.path !== form.path || previous.method !== form.method)
  )
    throw new DesignError("operation");
  if (
    previous &&
    text(previous.operation.operationId) &&
    form.operationId !== previous.operation.operationId
  )
    throw new DesignError("operation");
  const identifier =
    previous && text(previous.operation.operationId)
      ? form.operationId
      : form.operationId.trim();
  if (
    identifier &&
    designOperations(document).some(
      (o) => o.key !== form.key && o.operation.operationId === identifier,
    )
  )
    throw new DesignError("exists");
  return mutate(document, (draft) => {
    const paths = child(draft, "paths");
    if (!previous) {
      if (
        Object.keys(paths).some(
          (p) =>
            p !== form.path &&
            p.replace(/\{[^{}]+\}/g, "{}") ===
              form.path.replace(/\{[^{}]+\}/g, "{}"),
        )
      )
        throw new DesignError("path");
      const existingItem = paths[form.path];
      if (designRecord(existingItem) && own(existingItem, form.method))
        throw new DesignError("exists");
    }
    const item = child(paths, form.path);
    if (reference(item)) throw new DesignError("reference");
    const operation: DesignDocument = previous
      ? (item[form.method] as DesignDocument)
      : { responses: { "200": { description: "Successful response" } } };
    const original = previous ? designOperationForm(previous) : null;
    if (!original || form.summary !== original.summary)
      optional(operation, "summary", form.summary);
    if (!original || form.description !== original.description)
      optional(operation, "description", form.description);
    if (!original || form.operationId !== original.operationId)
      optional(operation, "operationId", form.operationId.trim());
    if (!original || form.tags !== original.tags) {
      const tags = [
        ...new Set(
          form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ];
      if (tags.length) put(operation, "tags", tags);
      else delete operation.tags;
    }
    if (!original || form.deprecated !== original.deprecated) {
      if (form.deprecated) put(operation, "deprecated", true);
      else delete operation.deprecated;
    }
    if (!previous && names.length) {
      const inherited = Array.isArray(item.parameters)
        ? item.parameters.map((p) => resolveParameter(draft, p))
        : [];
      const missing = names.filter(
        (name) =>
          !inherited.some(
            (p) => designRecord(p) && p.in === "path" && p.name === name,
          ),
      );
      if (missing.length)
        put(
          operation,
          "parameters",
          missing.map((name) => ({
            name,
            in: "path",
            required: true,
            schema: { type: "string" },
          })),
        );
    }
    put(item, form.method, operation);
  });
}
export function saveDesignInfo(
  document: DesignDocument,
  title: string,
  version: string,
  description: string,
): DesignDocument {
  if (
    !title.trim() ||
    !version.trim() ||
    title.length > 200 ||
    version.length > 100 ||
    description.length > 64000
  )
    throw new DesignError("source");
  return mutate(document, (draft) => {
    const info = child(draft, "info");
    put(info, "title", title);
    put(info, "version", version);
    optional(info, "description", description);
  });
}
export function addDesignServer(
  document: DesignDocument,
  url: string,
  description: string,
): DesignDocument {
  if (
    !url.trim() ||
    url.length > 2048 ||
    description.length > 1000 ||
    /[\s\x00-\x1f{}]/.test(url)
  )
    throw new DesignError("source");
  if (!url.startsWith("/") && !/^https?:\/\//i.test(url))
    throw new DesignError("source");
  if (!url.startsWith("/")) {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password || parsed.hash || parsed.search)
        throw new Error();
    } catch {
      throw new DesignError("source");
    }
  }
  return mutate(document, (draft) => {
    const servers = Array.isArray(draft.servers) ? draft.servers : [];
    if (servers.length >= 30) throw new DesignError("limit");
    if (servers.some((s) => designRecord(s) && s.url === url))
      throw new DesignError("exists");
    put(draft, "servers", [
      ...servers,
      { url, ...(description ? { description } : {}) },
    ]);
  });
}
export function parseDesignSchema(
  document: DesignDocument,
  source: string,
): JsonValue {
  if (getByteSize(source) > MAX_DESIGN_SCHEMA_BYTES)
    throw new DesignError("limit");
  let schema: JsonValue;
  try {
    schema = parseTransformValue(source);
  } catch {
    throw new DesignError("schema");
  }
  if (
    (!designRecord(schema) && typeof schema !== "boolean") ||
    (typeof schema === "boolean" && text(document.openapi).startsWith("3.0."))
  )
    throw new DesignError("schema");
  return schema;
}
export function createDesignSchema(
  document: DesignDocument,
  kind: string,
  nullable: boolean,
  model = "",
  enumText = "",
  format = "",
): string {
  if (model && !designModels(document).some((m) => m.name === model))
    throw new DesignError("model");
  let schema: DesignDocument;
  if (kind === "reference") {
    if (!designModels(document).some((m) => m.name === model))
      throw new DesignError("model");
    schema = { $ref: `#/components/schemas/${escapeTransformPointer(model)}` };
    if (nullable)
      schema = text(document.openapi).startsWith("3.0.")
        ? { anyOf: [schema, { type: "object", nullable: true, enum: [null] }] }
        : { anyOf: [schema, { type: "null" }] };
  } else {
    if (
      !["string", "integer", "number", "boolean", "object", "array"].includes(
        kind,
      )
    )
      throw new DesignError("schema");
    schema = {
      type:
        nullable && !text(document.openapi).startsWith("3.0.")
          ? [kind, "null"]
          : kind,
    };
    if (nullable && text(document.openapi).startsWith("3.0."))
      schema.nullable = true;
    if (kind === "object") schema.properties = {};
    if (kind === "array")
      schema.items = model
        ? { $ref: `#/components/schemas/${escapeTransformPointer(model)}` }
        : { type: "string" };
    if (format.trim()) schema.format = format.trim();
    if (enumText.trim()) {
      let values: JsonValue;
      try {
        values = parseTransformValue(enumText);
      } catch {
        throw new DesignError("schema");
      }
      if (!Array.isArray(values) || !values.length || values.length > 100)
        throw new DesignError("schema");
      schema.enum = values;
    }
  }
  return json(schema);
}
export function saveDesignModel(
  document: DesignDocument,
  name: string,
  schemaText: string,
  editing = false,
): DesignDocument {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new DesignError("model");
  const schema = parseDesignSchema(document, schemaText);
  return mutate(document, (draft) => {
    const schemas = child(child(draft, "components"), "schemas");
    if (own(schemas, name) !== editing)
      throw new DesignError(editing ? "model" : "exists");
    put(schemas, name, schema);
  });
}
export function saveDesignProperty(
  document: DesignDocument,
  model: string,
  name: string,
  schemaText: string,
  required: boolean,
  editing = false,
): DesignDocument {
  if (!name || name.length > 200) throw new DesignError("model");
  const schema = parseDesignSchema(document, schemaText);
  return mutate(document, (draft) => {
    const schemas = child(child(draft, "components"), "schemas");
    if (!own(schemas, model) || !designRecord(schemas[model]))
      throw new DesignError("model");
    const object = schemas[model] as DesignDocument;
    if (
      reference(object) ||
      (object.type !== undefined &&
        object.type !== "object" &&
        !(Array.isArray(object.type) && object.type.includes("object")))
    )
      throw new DesignError("model");
    const properties = child(object, "properties");
    if (own(properties, name) !== editing)
      throw new DesignError(editing ? "model" : "exists");
    put(properties, name, schema);
    const requiredNames = Array.isArray(object.required)
      ? object.required.filter((n) => n !== name)
      : [];
    if (required) requiredNames.push(name);
    if (requiredNames.length) put(object, "required", requiredNames);
    else delete object.required;
  });
}
export function designParameterForm(
  parameter?: JsonValue,
  index = -1,
): DesignParameterForm {
  const p = designRecord(parameter) ? parameter : {};
  return {
    index,
    name: text(p.name) || "query",
    location: ["path", "query", "header", "cookie"].includes(text(p.in))
      ? (p.in as DesignParameterForm["location"])
      : "query",
    description: text(p.description),
    required: p.required === true,
    schema: json(p.schema),
  };
}
export function saveDesignParameter(
  document: DesignDocument,
  key: string,
  form: DesignParameterForm,
): DesignDocument {
  if (
    !form.name ||
    form.name.length > 200 ||
    !["path", "query", "header", "cookie"].includes(form.location) ||
    form.description.length > 64000 ||
    !Number.isInteger(form.index) ||
    form.index < -1
  )
    throw new DesignError("parameter");
  const schema = parseDesignSchema(document, form.schema);
  return mutate(document, (draft) => {
    const op = operationAt(draft, key),
      parameters = Array.isArray(op.operation.parameters)
        ? op.operation.parameters
        : [];
    const previous = form.index >= 0 ? parameters[form.index] : undefined;
    if (
      form.index >= 0 &&
      (!designRecord(previous) ||
        reference(previous) ||
        own(previous, "content") ||
        previous.name !== form.name ||
        previous.in !== form.location)
    )
      throw new DesignError("reference");
    if (parameters.length >= 100 && form.index < 0)
      throw new DesignError("limit");
    if (
      parameters.some((p, i) => {
        if (i === form.index) return false;
        const resolved = resolveParameter(draft, p);
        return (
          designRecord(resolved) &&
          resolved.name === form.name &&
          resolved.in === form.location
        );
      })
    )
      throw new DesignError("exists");
    if (form.location === "path" && !pathNames(op.path).includes(form.name))
      throw new DesignError("parameter");
    const parameter = designRecord(previous) ? previous : {};
    put(parameter, "name", form.name);
    put(parameter, "in", form.location);
    put(parameter, "required", form.location === "path" || form.required);
    optional(parameter, "description", form.description);
    put(parameter, "schema", schema);
    if (form.index < 0) parameters.push(parameter);
    else parameters[form.index] = parameter;
    put(op.operation, "parameters", parameters);
  });
}
export function designPayloadForm(
  operation?: DesignOperation,
  kind: "request" | "response" = "response",
  status = "200",
  mediaType = "application/json",
): DesignPayloadForm {
  const value =
    kind === "request"
      ? operation?.operation.requestBody
      : designRecord(operation?.operation.responses)
        ? operation.operation.responses[status]
        : undefined;
  const container = designRecord(value) ? value : {},
    content = designRecord(container.content) ? container.content : {},
    media = designRecord(content[mediaType]) ? content[mediaType] : {};
  return {
    kind,
    status,
    mediaType,
    description:
      text(container.description) ||
      (kind === "response" ? "Successful response" : ""),
    required: container.required === true,
    schema: json(media.schema),
  };
}
export function saveDesignPayload(
  document: DesignDocument,
  key: string,
  form: DesignPayloadForm,
): DesignDocument {
  if (
    !["request", "response"].includes(form.kind) ||
    !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:\s*;[^\r\n]+)?$/.test(form.mediaType) ||
    form.mediaType.length > 200 ||
    form.description.length > 64000 ||
    (form.kind === "response" &&
      (!/^(?:[1-5](?:\d{2}|XX)|default)$/.test(form.status) ||
        !form.description.trim()))
  )
    throw new DesignError("payload");
  const schema = parseDesignSchema(document, form.schema);
  return mutate(document, (draft) => {
    const op = operationAt(draft, key).operation;
    const parent = form.kind === "request" ? op : child(op, "responses"),
      field = form.kind === "request" ? "requestBody" : form.status;
    const container = child(parent, field);
    if (reference(container)) throw new DesignError("reference");
    if (form.kind === "response")
      put(container, "description", form.description);
    else {
      optional(container, "description", form.description);
      put(container, "required", form.required);
    }
    const content = child(container, "content"),
      media = child(content, form.mediaType);
    if (reference(media)) throw new DesignError("reference");
    put(media, "schema", schema);
  });
}
export function saveDesignSecurity(
  document: DesignDocument,
  key: string,
  mode: "inherit" | "public" | "custom",
  source = "[]",
): DesignDocument {
  let requirements: JsonValue = [];
  if (mode === "custom") {
    if (getByteSize(source) > MAX_DESIGN_SCHEMA_BYTES)
      throw new DesignError("limit");
    try {
      requirements = parseTransformValue(source);
    } catch {
      throw new DesignError("security");
    }
    const components = designRecord(document.components)
        ? document.components
        : {},
      schemes = designRecord(components.securitySchemes)
        ? components.securitySchemes
        : {};
    if (
      !Array.isArray(requirements) ||
      requirements.length > 20 ||
      requirements.some(
        (r) =>
          !designRecord(r) ||
          Object.entries(r).some(
            ([name, scopes]) =>
              !own(schemes, name) ||
              !Array.isArray(scopes) ||
              scopes.length > 100 ||
              scopes.some((s) => typeof s !== "string") ||
              (text(document.openapi).startsWith("3.0.") &&
                designRecord(schemes[name]) &&
                typeof schemes[name].type === "string" &&
                !["oauth2", "openIdConnect"].includes(
                  text(schemes[name].type),
                ) &&
                scopes.length > 0),
          ),
      )
    )
      throw new DesignError("security");
  } else if (!["inherit", "public"].includes(mode))
    throw new DesignError("security");
  return mutate(document, (draft) => {
    const op = operationAt(draft, key).operation;
    if (mode === "inherit") delete op.security;
    else put(op, "security", requirements);
  });
}
export function commitDesign(
  history: DesignHistory,
  document: DesignDocument,
): DesignHistory {
  const clean = readDesignDocument(JSON.stringify(document));
  if (JSON.stringify(history.document) === JSON.stringify(clean))
    return history;
  let past = [...history.past, history.document].slice(-MAX_DESIGN_HISTORY);
  while (
    past.reduce((sum, d) => sum + getByteSize(JSON.stringify(d)), 0) >
    4 * MAX_DESIGN_BYTES
  )
    past = past.slice(1);
  return { document: clean, past, future: [] };
}
export function undoDesign(history: DesignHistory): DesignHistory {
  const previous = history.past.at(-1);
  return previous
    ? {
        document: previous,
        past: history.past.slice(0, -1),
        future: [history.document, ...history.future].slice(
          0,
          MAX_DESIGN_HISTORY,
        ),
      }
    : history;
}
export function redoDesign(history: DesignHistory): DesignHistory {
  const next = history.future[0];
  return next
    ? {
        document: next,
        past: [...history.past, history.document].slice(-MAX_DESIGN_HISTORY),
        future: history.future.slice(1),
      }
    : history;
}
export function serializeDesignDocument(
  document: DesignDocument,
  format: SchemaFormat,
): string {
  readDesignDocument(JSON.stringify(document));
  let output =
    format === "yaml"
      ? YAML.stringify(document, { lineWidth: 0 })
      : json(document);
  if (getByteSize(output) > MAX_DESIGN_BYTES && format === "json")
    output = JSON.stringify(document);
  if (getByteSize(output) > MAX_DESIGN_BYTES) throw new DesignError("limit");
  return output;
}
export function prepareDesignUpdate(
  document: DesignDocument,
  before: string,
  format: SchemaFormat,
): DesignPreview {
  if (getByteSize(before) > MAX_DESIGN_BYTES) throw new DesignError("limit");
  const after = serializeDesignDocument(document, format);
  let previous: JsonValue = {},
    editorValid = false;
  try {
    previous = readTransformSource(before).document;
    editorValid = true;
  } catch {
    /* Invalid editor input can be explicitly replaced after review. */
  }
  const changes = describeTransformChanges(previous, document),
    registry = createComponentRegistryReport(document);
  return {
    before,
    after,
    documentText: JSON.stringify(document),
    format,
    review: {
      changes: changes.changes.map((c) => ({ path: c.path, kind: c.kind })),
      truncated: changes.truncated,
      editorValid,
      operationCount: designOperations(document).length,
      modelCount: designModels(document).length,
      brokenReferences: registry.brokenReferenceCount,
      externalReferences: registry.externalReferenceCount,
    },
  };
}
export function applyDesignUpdate(
  preview: DesignPreview,
  document: DesignDocument,
  current: string,
): string {
  if (
    current !== preview.before ||
    JSON.stringify(document) !== preview.documentText
  )
    throw new DesignError("stale");
  return serializeDesignDocument(document, preview.format);
}
export function serializeDesignProject(
  document: DesignDocument,
  name: string,
): string {
  if (!name.trim() || name.length > 200) throw new DesignError("project");
  const project: DesignProject = {
    kind: "rsswag-api-design-project",
    version: 1,
    name,
    document: readDesignDocument(JSON.stringify(document)),
  };
  const source = JSON.stringify(project, null, 2);
  if (getByteSize(source) > MAX_DESIGN_PROJECT_BYTES)
    throw new DesignError("limit");
  return source;
}
export function parseDesignProject(source: string): DesignProject {
  if (getByteSize(source) > MAX_DESIGN_PROJECT_BYTES)
    throw new DesignError("limit");
  let value: JsonValue;
  try {
    value = parseTransformValue(source);
  } catch {
    throw new DesignError("project");
  }
  if (
    !designRecord(value) ||
    value.kind !== "rsswag-api-design-project" ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 200 ||
    !designRecord(value.document)
  )
    throw new DesignError("project");
  return {
    kind: "rsswag-api-design-project",
    version: 1,
    name: value.name,
    document: readDesignDocument(JSON.stringify(value.document)),
  };
}
export function demoDesignDocument(): DesignDocument {
  let doc = newDesignDocument();
  doc = saveDesignInfo(
    doc,
    "Task board API",
    "1.0.0",
    "A contract created in the API design studio.",
  );
  doc = saveDesignModel(doc, "Task", '{"type":"object","properties":{}}');
  doc = saveDesignProperty(doc, "Task", "id", '{"type":"string"}', true);
  doc = saveDesignProperty(
    doc,
    "Task",
    "title",
    '{"type":"string","minLength":1}',
    true,
  );
  doc = saveDesignProperty(
    doc,
    "Task",
    "done",
    '{"type":"boolean","default":false}',
    false,
  );
  doc = saveDesignOperation(doc, {
    ...designOperationForm(),
    path: "/tasks/{id}",
    summary: "Read a task",
    operationId: "getTask",
    tags: "Tasks",
  });
  const getKey = designOperations(doc)[0].key;
  doc = saveDesignPayload(doc, getKey, {
    ...designPayloadForm(),
    kind: "response",
    schema: '{"$ref":"#/components/schemas/Task"}',
  });
  doc = saveDesignOperation(doc, {
    ...designOperationForm(),
    path: "/tasks",
    method: "post",
    summary: "Create a task",
    operationId: "createTask",
    tags: "Tasks",
  });
  const postKey = designOperations(doc).find((o) => o.method === "post")!.key;
  doc = saveDesignPayload(doc, postKey, {
    ...designPayloadForm(),
    kind: "request",
    description: "Task fields",
    required: true,
    schema:
      '{"type":"object","required":["title"],"properties":{"title":{"type":"string"},"done":{"type":"boolean"}}}',
  });
  return doc;
}
