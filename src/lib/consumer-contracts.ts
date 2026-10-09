import {
  parseTransformPointer,
  parseTransformValue,
  readTransformSource,
  escapeTransformPointer,
  type JsonValue,
} from "./api-transform";
import { validateExampleValue } from "./example-validation";
import { getByteSize } from "./text-encoding";

export const MAX_CONSUMER_BYTES = 2 * 1024 * 1024;
export const MAX_CONSUMERS = 20;
export const MAX_CONTRACTS = 100;
export const MAX_CONSUMER_FIELDS = 1000;
export const CONSUMER_TYPES = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
] as const;
export type ConsumerType = (typeof CONSUMER_TYPES)[number];
type Obj = Record<string, JsonValue>;
type Scalar = string | number | boolean | null;
export type ConsumerField = {
  pointer: string;
  types: ConsumerType[];
  required: boolean;
  enum?: Scalar[];
};
export type ConsumerRequest = {
  parameters: {
    name: string;
    location: "path" | "query" | "header" | "cookie";
    value: JsonValue;
  }[];
  body?: { mediaType: string; value: JsonValue };
};
export type ConsumerContract = {
  key: string;
  name: string;
  enabled: boolean;
  method: string;
  path: string;
  status: string;
  mediaType: string;
  requirePublic: boolean;
  fields: ConsumerField[];
  request?: ConsumerRequest;
};
export type ApiConsumer = {
  key: string;
  name: string;
  enabled: boolean;
  contracts: ConsumerContract[];
};
export type ConsumerProject = {
  kind: "rsswag-consumer-contracts";
  version: 1;
  name: string;
  consumers: ApiConsumer[];
};
export type ConsumerStatus = "compatible" | "breaking" | "review" | "untracked";
export type ConsumerIssueCode =
  | "operation-missing"
  | "response-missing"
  | "media-missing"
  | "schema-unknown"
  | "field-missing"
  | "field-optional"
  | "nullable-parent"
  | "type-expanded"
  | "enum-expanded"
  | "security-required"
  | "request-parameter-missing"
  | "request-body-missing"
  | "request-media-missing"
  | "request-invalid"
  | "parameter-removed"
  | "schema-unsupported"
  | "reference-unresolved"
  | "limit"
  | "deprecated";
export type ConsumerFinding = {
  severity: "breaking" | "review";
  code: ConsumerIssueCode;
  pointer: string;
  detail: string;
};
export type ConsumerContractResult = {
  key: string;
  name: string;
  method: string;
  path: string;
  status: ConsumerStatus;
  findings: ConsumerFinding[];
  hiddenFindings: number;
  fieldCount: number;
};
export type ConsumerResult = {
  key: string;
  name: string;
  status: ConsumerStatus;
  contracts: ConsumerContractResult[];
};
export type ConsumerReport = {
  kind: "rsswag-consumer-impact";
  version: 1;
  projectName: string;
  providerTitle: string;
  providerVersion: string;
  consumers: ConsumerResult[];
  counts: Record<ConsumerStatus, number>;
  contractCounts: Record<ConsumerStatus, number>;
};
export type ConsumerSource = {
  title: string;
  version: string;
  root: Obj;
  family: "3.0" | "3.1";
};
export type ConsumerOperation = {
  method: string;
  path: string;
  operation: Obj;
  pathItem: Obj;
  responses: { status: string; mediaType: string }[];
};
export type ConsumerInventoryField = ConsumerField & { review: boolean };
export type ConsumerErrorCode =
  "source" | "project" | "json" | "limit" | "contract";
export class ConsumerError extends Error {
  constructor(public code: ConsumerErrorCode) {
    super(code);
  }
}
const obj = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: unknown, key: string): JsonValue | undefined =>
  obj(v) && Object.hasOwn(v, key) ? v[key] : undefined;
const str = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
const key = (v: unknown): v is string =>
  str(v, 64) && /^[a-z][a-z0-9-]*$/.test(v);
const scalar = (v: unknown): v is Scalar =>
  v === null ||
  typeof v === "string" ||
  typeof v === "boolean" ||
  typeof v === "number";
const methods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
];
const json = (value: unknown) => JSON.stringify(value);
function parse(text: string): JsonValue {
  if (getByteSize(text) > MAX_CONSUMER_BYTES) throw new ConsumerError("limit");
  try {
    return parseTransformValue(text);
  } catch (error) {
    throw new ConsumerError(
      obj(error) && error.code === "limit" ? "limit" : "json",
    );
  }
}
export function validateConsumerProject(input: unknown): ConsumerProject {
  const value = parse(json(input));
  if (
    !obj(value) ||
    value.kind !== "rsswag-consumer-contracts" ||
    value.version !== 1 ||
    !str(value.name, 120) ||
    !value.name.trim() ||
    !Array.isArray(value.consumers)
  )
    throw new ConsumerError("project");
  if (value.consumers.length > MAX_CONSUMERS) throw new ConsumerError("limit");
  let contractCount = 0,
    fieldCount = 0;
  const consumerKeys = new Set<string>(),
    contractKeys = new Set<string>();
  for (const consumer of value.consumers) {
    if (
      !obj(consumer) ||
      !key(consumer.key) ||
      consumerKeys.has(consumer.key) ||
      !str(consumer.name, 120) ||
      !consumer.name.trim() ||
      typeof consumer.enabled !== "boolean" ||
      !Array.isArray(consumer.contracts)
    )
      throw new ConsumerError("project");
    consumerKeys.add(consumer.key);
    for (const contract of consumer.contracts) {
      if (++contractCount > MAX_CONTRACTS) throw new ConsumerError("limit");
      if (
        !obj(contract) ||
        !key(contract.key) ||
        contractKeys.has(contract.key) ||
        !str(contract.name, 120) ||
        !contract.name.trim() ||
        typeof contract.enabled !== "boolean" ||
        typeof contract.requirePublic !== "boolean" ||
        !str(contract.method, 10) ||
        !methods.includes(contract.method) ||
        !str(contract.path, 2048) ||
        !contract.path.startsWith("/") ||
        /[?#\u0000-\u001f]/.test(contract.path) ||
        !str(contract.status, 3) ||
        !/^[1-5]\d{2}$/.test(contract.status) ||
        !str(contract.mediaType, 256) ||
        (contract.mediaType !== "" && !validMedia(contract.mediaType)) ||
        !Array.isArray(contract.fields)
      )
        throw new ConsumerError("contract");
      contractKeys.add(contract.key);
      const pointers = new Set<string>();
      for (const field of contract.fields) {
        if (++fieldCount > MAX_CONSUMER_FIELDS)
          throw new ConsumerError("limit");
        if (
          !obj(field) ||
          !str(field.pointer, 1024) ||
          pointers.has(field.pointer) ||
          typeof field.required !== "boolean" ||
          !Array.isArray(field.types) ||
          field.types.some(
            (t) =>
              typeof t !== "string" ||
              !CONSUMER_TYPES.includes(t as ConsumerType),
          ) ||
          new Set(field.types).size !== field.types.length ||
          (Object.hasOwn(field, "enum") &&
            (!Array.isArray(field.enum) ||
              field.enum.length === 0 ||
              field.enum.length > 50 ||
              !field.enum.every(scalar)))
        )
          throw new ConsumerError("contract");
        try {
          parseTransformPointer(field.pointer);
        } catch {
          throw new ConsumerError("contract");
        }
        pointers.add(field.pointer);
      }
      if (Object.hasOwn(contract, "request")) validateRequest(contract.request);
    }
  }
  return value as unknown as ConsumerProject;
}
function validateRequest(value: unknown): asserts value is ConsumerRequest {
  if (
    !obj(value) ||
    !Array.isArray(value.parameters) ||
    value.parameters.length > 64
  )
    throw new ConsumerError("contract");
  const keys = new Set<string>();
  for (const p of value.parameters) {
    if (
      !obj(p) ||
      !str(p.name, 256) ||
      !p.name ||
      typeof p.location !== "string" ||
      !["path", "query", "header", "cookie"].includes(p.location) ||
      !Object.hasOwn(p, "value")
    )
      throw new ConsumerError("contract");
    const id = `${p.location}:${p.location === "header" ? p.name.toLowerCase() : p.name}`;
    if (keys.has(id)) throw new ConsumerError("contract");
    keys.add(id);
  }
  if (
    Object.hasOwn(value, "body") &&
    (!obj(value.body) ||
      !str(value.body.mediaType, 256) ||
      !validMedia(value.body.mediaType) ||
      !Object.hasOwn(value.body, "value"))
  )
    throw new ConsumerError("contract");
  if (getByteSize(json(value)) > 64 * 1024) throw new ConsumerError("limit");
}
export function parseConsumerRequest(text: string): ConsumerRequest {
  const value = parse(text);
  validateRequest(value);
  return value;
}
export function parseConsumerFields(text: string): ConsumerField[] {
  const fields = parse(text);
  const test = emptyConsumerProject();
  test.consumers = [
    {
      key: "test",
      name: "Test",
      enabled: true,
      contracts: [
        {
          key: "test",
          name: "Test",
          enabled: true,
          method: "GET",
          path: "/",
          status: "200",
          mediaType: "application/json",
          requirePublic: false,
          fields: fields as ConsumerField[],
        },
      ],
    },
  ];
  return validateConsumerProject(test).consumers[0].contracts[0].fields;
}
export function emptyConsumerProject(): ConsumerProject {
  return {
    kind: "rsswag-consumer-contracts",
    version: 1,
    name: "API consumers",
    consumers: [],
  };
}
export function parseConsumerProject(text: string) {
  return validateConsumerProject(parse(text));
}
export function serializeConsumerProject(project: ConsumerProject) {
  const text = JSON.stringify(validateConsumerProject(project), null, 2) + "\n";
  if (getByteSize(text) > MAX_CONSUMER_BYTES) throw new ConsumerError("limit");
  return text;
}
function validMedia(media: string) {
  return /^[a-z0-9!#$&^_.+*-]+\/[a-z0-9!#$&^_.+*-]+$/i.test(media);
}
function refValue(source: ConsumerSource, ref: string): JsonValue | undefined {
  if (!ref.startsWith("#/")) return undefined;
  try {
    let current: JsonValue | undefined = source.root;
    for (const part of parseTransformPointer(decodeURIComponent(ref.slice(1))))
      current = own(current, part);
    return current;
  } catch {
    return undefined;
  }
}
function resolveObject(
  source: ConsumerSource,
  input: unknown,
  seen = new Set<string>(),
): Obj | null {
  if (!obj(input)) return null;
  if (typeof input.$ref !== "string") return input;
  if (seen.size >= 32 || seen.has(input.$ref)) return null;
  const next = new Set(seen);
  next.add(input.$ref);
  return resolveObject(source, refValue(source, input.$ref), next);
}
export function readConsumerSource(text: string): ConsumerSource {
  try {
    const { document, title } = readTransformSource(text);
    if (
      !obj(document) ||
      typeof document.openapi !== "string" ||
      !/^3\.[01]\./.test(document.openapi)
    )
      throw new ConsumerError("source");
    if (
      document.jsonSchemaDialect !== undefined &&
      (typeof document.jsonSchemaDialect !== "string" ||
        ![
          "https://spec.openapis.org/oas/3.1/dialect/base",
          "https://json-schema.org/draft/2020-12/schema",
        ].includes(document.jsonSchemaDialect))
    )
      throw new ConsumerError("source");
    return {
      title,
      version: String(own(document.info, "version") ?? ""),
      root: document,
      family: document.openapi.startsWith("3.0.") ? "3.0" : "3.1",
    };
  } catch (error) {
    throw error instanceof ConsumerError
      ? error
      : new ConsumerError(
          obj(error) && error.code === "limit" ? "limit" : "source",
        );
  }
}
export function listConsumerOperations(
  source: ConsumerSource,
): ConsumerOperation[] {
  const result: ConsumerOperation[] = [];
  for (const [path, raw] of Object.entries(
    obj(source.root.paths) ? source.root.paths : {},
  )) {
    const pathItem = resolveObject(source, raw);
    if (!pathItem) continue;
    for (const method of methods) {
      const operation = own(pathItem, method.toLowerCase());
      if (!obj(operation)) continue;
      const responses: ConsumerOperation["responses"] = [];
      for (const [status, rawResponse] of Object.entries(
        obj(operation.responses) ? operation.responses : {},
      )) {
        const response = resolveObject(source, rawResponse);
        const concrete = representativeStatus(
          status,
          obj(operation.responses) ? operation.responses : {},
        );
        if (!concrete) continue;
        const media =
          response && obj(response.content)
            ? Object.keys(response.content)
            : [];
        for (const mediaType of media.length ? media : [""])
          responses.push({ status: concrete, mediaType });
      }
      result.push({
        method,
        path,
        operation,
        pathItem,
        responses: responses.filter(
          (r, i) =>
            responses.findIndex(
              (other) =>
                other.status === r.status && other.mediaType === r.mediaType,
            ) === i,
        ),
      });
      if (result.length > 1000) throw new ConsumerError("limit");
    }
  }
  return result;
}
function representativeStatus(key: string, responses: Obj): string {
  if (/^[1-5]\d{2}$/.test(key)) return key;
  const keys = Object.keys(responses);
  const range = /^[1-5]XX$/i.test(key);
  if (!range && key !== "default") return "";
  const candidates = range
    ? Array.from({ length: 100 }, (_, i) => Number(key[0]) * 100 + i)
    : [
        200,
        201,
        400,
        404,
        500,
        ...Array.from({ length: 500 }, (_, i) => 100 + i),
      ];
  const match = candidates.find(
    (code) =>
      !Object.hasOwn(responses, String(code)) &&
      (range || !keys.some((k) => k.toUpperCase() === `${String(code)[0]}XX`)),
  );
  return match === undefined ? "" : String(match);
}
function matchingMediaKey(content: Obj, mediaType: string): string {
  return (
    Object.keys(content).find(
      (k) => k.toLowerCase() === mediaType.toLowerCase(),
    ) ??
    Object.keys(content).find(
      (k) => k.toLowerCase() === `${mediaType.split("/")[0].toLowerCase()}/*`,
    ) ??
    (Object.hasOwn(content, "*/*") ? "*/*" : "")
  );
}
function operationFor(
  source: ConsumerSource,
  contract: Pick<ConsumerContract, "method" | "path">,
) {
  const raw = own(source.root.paths, contract.path);
  const pathItem = resolveObject(source, raw);
  const operation = pathItem && own(pathItem, contract.method.toLowerCase());
  return pathItem && obj(operation) ? { pathItem, operation } : null;
}
function responseSchema(
  source: ConsumerSource,
  operation: Obj,
  status: string,
  mediaType: string,
): { schema?: JsonValue; code?: ConsumerIssueCode } {
  const responses = obj(operation.responses) ? operation.responses : {};
  const responseKey = Object.hasOwn(responses, status)
    ? status
    : (Object.keys(responses).find(
        (k) => k.toUpperCase() === `${status[0]}XX`,
      ) ?? (Object.hasOwn(responses, "default") ? "default" : ""));
  if (!responseKey) return { code: "response-missing" };
  const response = resolveObject(source, responses[responseKey]);
  if (!response) return { code: "reference-unresolved" };
  if (!mediaType) return {};
  const content = obj(response.content) ? response.content : {};
  const mediaKey = matchingMediaKey(content, mediaType);
  if (!mediaKey) return { code: "media-missing" };
  const media = content[mediaKey];
  return obj(media) && Object.hasOwn(media, "schema")
    ? { schema: media.schema }
    : { code: "schema-unknown" };
}
type View = {
  parts: Obj[];
  types: ConsumerType[] | null;
  enum: Scalar[] | null;
  required: Set<string>;
  review: ConsumerIssueCode | null;
  impossible: boolean;
};
const risky = [
  "oneOf",
  "anyOf",
  "not",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "dependentRequired",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "prefixItems",
  "$dynamicRef",
  "$recursiveRef",
  "$id",
  "$anchor",
  "$dynamicAnchor",
  "$schema",
];
function typeOf(value: JsonValue): ConsumerType {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value === "number"
        ? Number.isInteger(value)
          ? "integer"
          : "number"
        : typeof value === "object"
          ? "object"
          : (typeof value as ConsumerType);
}
const acceptsType = (types: ConsumerType[], type: ConsumerType) =>
  types.includes(type) || (type === "integer" && types.includes("number"));
type AnalysisBudget = { remaining: number };
function schemaView(
  source: ConsumerSource,
  input: unknown,
  budget?: AnalysisBudget,
): View {
  const view: View = {
    parts: [],
    types: null,
    enum: null,
    required: new Set(),
    review: null,
    impossible: false,
  };
  let steps = 0;
  function collect(raw: unknown, refs: Set<string>, depth: number) {
    if (++steps > 300 || depth > 32 || (budget && --budget.remaining < 0)) {
      view.review = "limit";
      return;
    }
    if (raw === false) {
      view.impossible = true;
      return;
    }
    if (raw === true) return;
    if (!obj(raw)) {
      view.review = "schema-unknown";
      return;
    }
    if (risky.some((k) => Object.hasOwn(raw, k)))
      view.review = "schema-unsupported";
    if (typeof raw.$ref === "string") {
      if (refs.has(raw.$ref)) {
        view.review = "reference-unresolved";
        return;
      }
      const target = refValue(source, raw.$ref);
      if (target === undefined) {
        view.review = "reference-unresolved";
        return;
      }
      const next = new Set(refs);
      next.add(raw.$ref);
      collect(target, next, depth + 1);
      if (source.family === "3.0") return;
    }
    view.parts.push(raw);
    if (Object.hasOwn(raw, "type")) {
      const values = Array.isArray(raw.type) ? raw.type : [raw.type];
      if (
        !values.length ||
        values.some(
          (v) =>
            typeof v !== "string" ||
            !CONSUMER_TYPES.includes(v as ConsumerType),
        )
      )
        view.review = "schema-unsupported";
      else {
        const types = values as ConsumerType[];
        const allowed =
          source.family === "3.0" && raw.nullable === true
            ? [...types, "null" as const]
            : types;
        view.types =
          view.types === null
            ? [...new Set(allowed)]
            : CONSUMER_TYPES.filter(
                (t) => acceptsType(view.types!, t) && acceptsType(allowed, t),
              );
      }
    }
    const enumValue = Object.hasOwn(raw, "const") ? [raw.const] : raw.enum;
    if (Array.isArray(enumValue)) {
      if (!enumValue.length || !enumValue.every(scalar))
        view.review = "schema-unsupported";
      else
        view.enum =
          view.enum === null
            ? enumValue
            : view.enum.filter((v) => enumValue.some((e) => e === v));
    }
    if (
      Array.isArray(raw.required) &&
      raw.required.every((v) => typeof v === "string")
    )
      for (const name of raw.required) view.required.add(name as string);
    else if (raw.required !== undefined) view.review = "schema-unsupported";
    if (Array.isArray(raw.allOf))
      for (const part of raw.allOf) collect(part, refs, depth + 1);
    else if (raw.allOf !== undefined) view.review = "schema-unsupported";
  }
  collect(input, new Set(), 0);
  if (view.enum !== null) {
    if (view.types)
      view.enum = view.enum.filter((v) => acceptsType(view.types!, typeOf(v)));
    const enumTypes = [...new Set(view.enum.map(typeOf))];
    view.types = enumTypes;
  }
  if (view.types?.length === 0 || view.enum?.length === 0)
    view.impossible = true;
  return view;
}
function childSchema(
  view: View,
  name: string,
  items: boolean,
): JsonValue | undefined {
  const children: JsonValue[] = [];
  for (const part of view.parts) {
    if (items) {
      if (Object.hasOwn(part, "items")) children.push(part.items);
    } else {
      const properties = obj(part.properties) ? part.properties : {};
      if (Object.hasOwn(properties, name)) children.push(properties[name]);
      else if (Object.hasOwn(part, "additionalProperties"))
        children.push(part.additionalProperties);
    }
  }
  return children.length === 0
    ? undefined
    : children.length === 1
      ? children[0]
      : { allOf: children };
}
function declaredProperty(view: View, name: string) {
  return view.parts.some(
    (p) => obj(p.properties) && Object.hasOwn(p.properties, name),
  );
}
function fieldAnalysis(
  source: ConsumerSource,
  schema: unknown,
  pointer: string,
  budget?: AnalysisBudget,
) {
  let current: unknown = schema;
  let guaranteed = true,
    nullableParent = false;
  let review: ConsumerIssueCode | null = null;
  const segments = parseTransformPointer(pointer);
  for (const segment of segments) {
    const view = schemaView(source, current, budget);
    if (view.review) review = view.review;
    if (view.impossible)
      return {
        view,
        guaranteed: false,
        nullableParent,
        review: "schema-unsupported" as const,
        missing: false,
      };
    const isItems = segment === "*";
    const parentType = isItems ? "array" : "object";
    if (view.types?.includes("null")) nullableParent = true;
    if (view.types === null || view.types.some((t) => t !== parentType)) {
      guaranteed = false;
      if (view.types === null) review ??= "schema-unknown";
    }
    if (
      !isItems &&
      (!view.required.has(segment) || !declaredProperty(view, segment))
    )
      guaranteed = false;
    current = childSchema(view, segment, isItems);
    if (current === undefined)
      return {
        view: schemaView(source, true),
        guaranteed: false,
        nullableParent,
        review,
        missing: true,
      };
  }
  const view = schemaView(source, current, budget);
  if (view.parts.some((p) => p.writeOnly === true)) {
    guaranteed = false;
    review ??= "schema-unsupported";
  }
  return {
    view,
    guaranteed,
    nullableParent,
    review: view.review ?? review,
    missing: false,
  };
}
export function consumerFieldInventory(
  source: ConsumerSource,
  operation: ConsumerOperation,
  status: string,
  mediaType: string,
): ConsumerInventoryField[] {
  const response = responseSchema(
    source,
    operation.operation,
    status,
    mediaType,
  );
  if (response.code || response.schema === undefined) return [];
  const result: ConsumerInventoryField[] = [];
  const budget = { remaining: 20000 };
  function walk(schema: unknown, pointer: string, depth: number) {
    if (depth > 10 || result.length >= 200) return;
    const analysis = fieldAnalysis(source, response.schema, pointer, budget);
    const view = schemaView(source, schema, budget);
    result.push({
      pointer,
      types: view.types ?? [],
      required: analysis.guaranteed && !analysis.nullableParent,
      ...(view.enum !== null && view.enum.length <= 50
        ? { enum: view.enum }
        : {}),
      review: !!analysis.review || view.types === null,
    });
    if (view.review || view.impossible) return;
    const names = new Set(
      view.parts.flatMap((p) =>
        obj(p.properties) ? Object.keys(p.properties) : [],
      ),
    );
    for (const name of names)
      if (name !== "*")
        walk(
          childSchema(view, name, false),
          `${pointer}/${escapeTransformPointer(name)}`,
          depth + 1,
        );
    if (view.types?.every((t) => t === "array")) {
      const child = childSchema(view, "*", true);
      if (child !== undefined) walk(child, `${pointer}/*`, depth + 1);
    }
  }
  walk(response.schema, "", 0);
  return result;
}
export function captureConsumerContract(
  source: ConsumerSource,
  operation: ConsumerOperation,
  status: string,
  mediaType: string,
  fields: ConsumerField[],
  keyValue: string,
): ConsumerContract {
  const effective = Object.hasOwn(operation.operation, "security")
    ? operation.operation.security
    : source.root.security;
  const requirePublic =
    effective === undefined ||
    (Array.isArray(effective) &&
      (!effective.length ||
        effective.some((v) => obj(v) && !Object.keys(v).length)));
  return {
    key: keyValue,
    name: `${operation.method} ${operation.path}`,
    enabled: true,
    method: operation.method,
    path: operation.path,
    status,
    mediaType,
    requirePublic,
    fields: fields.map(({ pointer, types, required, enum: values }) => ({
      pointer,
      types,
      required,
      ...(values ? { enum: values } : {}),
    })),
  };
}
function aggregate(statuses: ConsumerStatus[]): ConsumerStatus {
  return statuses.includes("breaking")
    ? "breaking"
    : statuses.includes("review")
      ? "review"
      : statuses.includes("compatible")
        ? "compatible"
        : "untracked";
}
function requestSchemaReview(
  source: ConsumerSource,
  schema: unknown,
): ConsumerIssueCode | null {
  let steps = 0;
  const seen = new Set<string>();
  const allowed = new Set([
    "$ref",
    "type",
    "nullable",
    "properties",
    "required",
    "items",
    "additionalProperties",
    "allOf",
    "enum",
    "const",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minProperties",
    "maxProperties",
    "format",
    "readOnly",
    "writeOnly",
    "description",
    "title",
    "example",
    "examples",
    "default",
    "deprecated",
    "$defs",
    "definitions",
  ]);
  function visit(raw: unknown, depth: number): ConsumerIssueCode | null {
    if (++steps > 1000 || depth > 32) return "limit";
    if (typeof raw === "boolean") return null;
    if (!obj(raw)) return "schema-unknown";
    if (Object.hasOwn(raw, "type")) {
      const types = Array.isArray(raw.type) ? raw.type : [raw.type];
      if (
        !types.length ||
        types.some(
          (t) =>
            typeof t !== "string" ||
            !CONSUMER_TYPES.includes(t as ConsumerType),
        )
      )
        return "schema-unsupported";
    }
    if (
      (raw.properties !== undefined && !obj(raw.properties)) ||
      (raw.required !== undefined &&
        (!Array.isArray(raw.required) ||
          raw.required.some((v) => typeof v !== "string"))) ||
      (raw.enum !== undefined &&
        (!Array.isArray(raw.enum) || !raw.enum.length)) ||
      (raw.allOf !== undefined &&
        (!Array.isArray(raw.allOf) || !raw.allOf.length))
    )
      return "schema-unsupported";
    for (const k of [
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "minProperties",
      "maxProperties",
    ])
      if (
        raw[k] !== undefined &&
        (typeof raw[k] !== "number" ||
          !Number.isInteger(raw[k]) ||
          (raw[k] as number) < 0)
      )
        return "schema-unsupported";
    for (const k of ["minimum", "maximum", "multipleOf"])
      if (
        raw[k] !== undefined &&
        (typeof raw[k] !== "number" ||
          (k === "multipleOf" && (raw[k] as number) <= 0))
      )
        return "schema-unsupported";
    if (Object.keys(raw).some((k) => !allowed.has(k) && !k.startsWith("x-")))
      return "schema-unsupported";
    if (typeof raw.$ref === "string") {
      const target = refValue(source, raw.$ref);
      if (target === undefined || seen.has(raw.$ref))
        return "reference-unresolved";
      seen.add(raw.$ref);
      const issue = visit(target, depth + 1);
      seen.delete(raw.$ref);
      if (issue) return issue;
      if (source.family === "3.0") return null;
    }
    const schemas = [
      ...(obj(raw.properties) ? Object.values(raw.properties) : []),
      ...(Array.isArray(raw.allOf) ? raw.allOf : []),
      ...[raw.items, raw.additionalProperties].filter((v) => v !== undefined),
    ];
    for (const child of schemas) {
      const issue = visit(child, depth + 1);
      if (issue) return issue;
    }
    return null;
  }
  return visit(schema, 0);
}
function normalizedRequestSchema(
  source: ConsumerSource,
  raw: unknown,
): JsonValue {
  if (!obj(raw)) return raw as JsonValue;
  const target =
    typeof raw.$ref === "string"
      ? normalizedRequestSchema(source, refValue(source, raw.$ref))
      : undefined;
  if (target !== undefined && source.family === "3.0") return target;
  const result = Object.fromEntries(
    Object.entries(raw).filter(
      ([key]) => !["$ref", "nullable", "x-nullable"].includes(key),
    ),
  );
  // Nullable in 3.0 adds a type; enum and other constraints still apply to null.
  if (
    source.family === "3.0" &&
    raw.nullable === true &&
    typeof raw.type === "string"
  )
    result.type = [raw.type, "null"];
  if (obj(raw.properties))
    result.properties = Object.fromEntries(
      Object.entries(raw.properties).map(([key, schema]) => [
        key,
        normalizedRequestSchema(source, schema),
      ]),
    );
  if (Array.isArray(raw.allOf))
    result.allOf = raw.allOf.map((schema) =>
      normalizedRequestSchema(source, schema),
    );
  for (const key of ["items", "additionalProperties"])
    if (raw[key] !== undefined)
      result[key] = normalizedRequestSchema(source, raw[key]);
  if (target !== undefined)
    return {
      allOf: [target, result],
      ...(own(target, "readOnly") === true || result.readOnly === true
        ? { readOnly: true }
        : {}),
      ...(own(target, "writeOnly") === true || result.writeOnly === true
        ? { writeOnly: true }
        : {}),
    };
  return result;
}
function checkRequest(
  source: ConsumerSource,
  pathItem: Obj,
  operation: Obj,
  request: ConsumerRequest,
  add: (
    severity: ConsumerFinding["severity"],
    code: ConsumerIssueCode,
    pointer?: string,
    detail?: string,
  ) => void,
) {
  const parameters = new Map<string, Obj>();
  for (const container of [pathItem, operation]) {
    if (
      container.parameters !== undefined &&
      !Array.isArray(container.parameters)
    )
      add("review", "schema-unsupported", "", "parameters");
    for (const raw of Array.isArray(container.parameters)
      ? container.parameters
      : []) {
      const parameter = resolveObject(source, raw);
      if (
        !parameter ||
        typeof parameter.name !== "string" ||
        typeof parameter.in !== "string"
      ) {
        add("review", "reference-unresolved");
        continue;
      }
      parameters.set(
        `${parameter.in}:${parameter.in === "header" ? parameter.name.toLowerCase() : parameter.name}`,
        parameter,
      );
    }
  }
  const examples = new Map(
    request.parameters.map((p) => [
      `${p.location}:${p.location === "header" ? p.name.toLowerCase() : p.name}`,
      p,
    ]),
  );
  for (const [id, parameter] of parameters)
    if (
      (parameter.required === true || parameter.in === "path") &&
      !examples.has(id)
    )
      add("breaking", "request-parameter-missing", "", id);
  for (const [id, example] of examples) {
    const parameter = parameters.get(id);
    if (!parameter) {
      add("review", "parameter-removed", "", id);
      continue;
    }
    const schema = parameter.schema;
    validate(schema, example.value, id);
  }
  const body =
    operation.requestBody === undefined
      ? null
      : resolveObject(source, operation.requestBody);
  if (operation.requestBody !== undefined && !body)
    add("review", "reference-unresolved");
  if (body?.required === true && !request.body)
    add("breaking", "request-body-missing");
  if (request.body) {
    if (!body) {
      add("review", "request-media-missing");
      return;
    }
    const content = obj(body.content) ? body.content : {};
    const media = own(
      content,
      matchingMediaKey(content, request.body.mediaType),
    );
    if (!obj(media)) {
      add("breaking", "request-media-missing");
      return;
    }
    validate(media.schema, request.body.value, "body");
  }
  function validate(schema: unknown, value: JsonValue, label: string) {
    const review = requestSchemaReview(source, schema);
    // Unsupported vocabularies can alter validation; avoid certifying a partial interpretation.
    if (review) {
      add("review", review, "", label);
      return;
    }
    const result = validateExampleValue(
      source.root,
      normalizedRequestSchema(source, schema),
      value,
      "request",
    );
    for (const issue of result.issues)
      add(
        issue.severity === "error" ? "breaking" : "review",
        "request-invalid",
        issue.instancePath,
        `${label}: ${issue.keyword}`,
      );
    if (result.limited) add("review", "limit", "", label);
  }
}
export function checkConsumerCompatibility(
  projectInput: ConsumerProject,
  source: ConsumerSource,
): ConsumerReport {
  const project = validateConsumerProject(projectInput);
  const budget = { remaining: 100000 };
  const consumers: ConsumerResult[] = project.consumers.map((consumer) => {
    const contracts: ConsumerContractResult[] = consumer.contracts.map(
      (contract) => {
        const findings: ConsumerFinding[] = [];
        const seen = new Set<string>();
        let total = 0,
          breaking = false,
          review = false;
        const add = (
          severity: ConsumerFinding["severity"],
          code: ConsumerIssueCode,
          pointer = "",
          detail = "",
        ) => {
          const signature = json([severity, code, pointer, detail]);
          if (seen.has(signature)) return;
          seen.add(signature);
          total++;
          if (severity === "breaking") breaking = true;
          else review = true;
          findings.push({ severity, code, pointer, detail });
          findings.sort((a, b) =>
            a.severity === b.severity ? 0 : a.severity === "breaking" ? -1 : 1,
          );
          if (findings.length > 20) findings.pop();
        };
        const result = (): ConsumerContractResult => ({
          key: contract.key,
          name: contract.name,
          method: contract.method,
          path: contract.path,
          status:
            !consumer.enabled || !contract.enabled
              ? "untracked"
              : breaking
                ? "breaking"
                : review
                  ? "review"
                  : "compatible",
          findings,
          hiddenFindings: total - findings.length,
          fieldCount: contract.fields.length,
        });
        if (!consumer.enabled || !contract.enabled) return result();
        const rawPathItem = own(source.root.paths, contract.path);
        if (
          obj(rawPathItem) &&
          typeof rawPathItem.$ref === "string" &&
          Object.keys(rawPathItem).some(
            (k) => !["$ref", "summary", "description"].includes(k),
          )
        ) {
          add(
            "review",
            "schema-unsupported",
            "",
            "path-item reference siblings",
          );
          return result();
        }
        const target = operationFor(source, contract);
        if (!target) {
          const unresolved =
            obj(rawPathItem) && typeof rawPathItem.$ref === "string";
          add(
            unresolved ? "review" : "breaking",
            unresolved ? "reference-unresolved" : "operation-missing",
          );
          return result();
        }
        const { operation, pathItem } = target;
        if (operation.deprecated === true) add("review", "deprecated");
        if (contract.requirePublic) {
          const security = Object.hasOwn(operation, "security")
            ? operation.security
            : source.root.security;
          if (security !== undefined && !Array.isArray(security))
            add("review", "schema-unsupported", "", "security");
          else if (
            Array.isArray(security) &&
            security.length &&
            !security.some((s) => obj(s) && !Object.keys(s).length)
          )
            add("breaking", "security-required");
        }
        const response = responseSchema(
          source,
          operation,
          contract.status,
          contract.mediaType,
        );
        if (response.code)
          add(
            ["response-missing", "media-missing"].includes(response.code)
              ? "breaking"
              : "review",
            response.code,
          );
        if (
          contract.fields.length &&
          (!contract.mediaType || response.schema === undefined)
        )
          add("review", "schema-unknown");
        if (response.schema !== undefined)
          for (const field of contract.fields) {
            const analysis = fieldAnalysis(
              source,
              response.schema,
              field.pointer,
              budget,
            );
            if (analysis.review || analysis.view.impossible) {
              add(
                "review",
                analysis.review ?? "schema-unsupported",
                field.pointer,
              );
              continue;
            }
            if (field.required && !analysis.guaranteed)
              add(
                "breaking",
                analysis.missing ? "field-missing" : "field-optional",
                field.pointer,
              );
            if (field.required && analysis.nullableParent)
              add("breaking", "nullable-parent", field.pointer);
            if (analysis.view.impossible) continue;
            if (field.types.length) {
              if (analysis.view.types === null)
                add("review", "schema-unknown", field.pointer);
              else if (
                analysis.view.types.some((t) => !acceptsType(field.types, t))
              )
                add("breaking", "type-expanded", field.pointer);
            }
            if (
              field.enum &&
              (analysis.view.enum === null ||
                analysis.view.enum.some(
                  (v) => !field.enum!.some((allowed) => allowed === v),
                ))
            )
              add("breaking", "enum-expanded", field.pointer);
          }
        if (contract.request)
          checkRequest(source, pathItem, operation, contract.request, add);
        return result();
      },
    );
    return {
      key: consumer.key,
      name: consumer.name,
      contracts,
      status: aggregate(contracts.map((c) => c.status)),
    };
  });
  const counts = { compatible: 0, breaking: 0, review: 0, untracked: 0 },
    contractCounts = { ...counts };
  for (const consumer of consumers) {
    counts[consumer.status]++;
    for (const contract of consumer.contracts)
      contractCounts[contract.status]++;
  }
  return {
    kind: "rsswag-consumer-impact",
    version: 1,
    projectName: project.name,
    providerTitle: source.title,
    providerVersion: source.version,
    consumers,
    counts,
    contractCounts,
  };
}
export function serializeConsumerReport(report: ConsumerReport) {
  const text = JSON.stringify(report, null, 2) + "\n";
  if (getByteSize(text) > MAX_CONSUMER_BYTES) throw new ConsumerError("limit");
  return text;
}
export function consumerReportMarkdown(report: ConsumerReport) {
  const escape = (s: string) =>
    s.replace(/[\\`*_{}\[\]()<>#+!|]/g, "\\$&").replace(/[\r\n]/g, " ");
  const lines = [
    `# Consumer impact: ${escape(report.projectName)}`,
    "",
    `Provider: ${escape(report.providerTitle)} (${escape(report.providerVersion)})`,
    "",
    "This is a bounded contract analysis, not a runtime guarantee. Review unsupported schemas before release.",
    "",
  ];
  for (const consumer of report.consumers) {
    lines.push(`## ${escape(consumer.name)} — ${consumer.status}`, "");
    for (const contract of consumer.contracts) {
      lines.push(
        `- [${contract.status === "compatible" ? "x" : " "}] ${escape(contract.method)} ${escape(contract.path)} — ${escape(contract.name)} (${contract.status})`,
      );
      for (const finding of contract.findings)
        lines.push(
          `  - ${finding.severity}: ${finding.code}${finding.pointer ? ` at ${escape(finding.pointer)}` : ""}${finding.detail ? ` (${escape(finding.detail)})` : ""}`,
        );
      if (contract.hiddenFindings)
        lines.push(`  - ${contract.hiddenFindings} more findings`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
