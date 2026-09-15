import YAML, { isAlias, isMap, isScalar, isSeq } from "yaml";
import type { Node as YamlNode } from "yaml";

export type ExampleValidationKind =
  "header" | "parameter" | "request-body" | "response" | "schema";

export type ExampleValidationStatus =
  "invalid" | "skipped" | "valid" | "warning";

export type ExampleValidationSkipReason =
  | "external-value"
  | "limit"
  | "media-type"
  | "missing-schema"
  | "unresolved-reference";

export type ExampleValidationKeyword =
  | "additionalProperties"
  | "anyOf"
  | "const"
  | "enum"
  | "format"
  | "maxItems"
  | "maxLength"
  | "maxProperties"
  | "maximum"
  | "minItems"
  | "minLength"
  | "minProperties"
  | "minimum"
  | "multipleOf"
  | "not"
  | "oneOf"
  | "oneOfMultiple"
  | "pattern"
  | "readOnly"
  | "required"
  | "serialized"
  | "type"
  | "uniqueItems"
  | "writeOnly";

export type ExampleValidationIssue = {
  instancePath: string;
  keyword: ExampleValidationKeyword;
  params: Record<string, string>;
  severity: "error" | "warning";
};

export type ExampleValidationEntry = {
  exampleName: string;
  hiddenIssueCount: number;
  id: string;
  issues: ExampleValidationIssue[];
  kind: ExampleValidationKind;
  label: string;
  mediaType: string;
  method: string;
  path: string;
  pointer: string;
  skipReason?: ExampleValidationSkipReason;
  status: ExampleValidationStatus;
};

export type ExampleValidationReport = {
  entries: ExampleValidationEntry[];
  invalidCount: number;
  issueCount: number;
  skippedCount: number;
  totalCount: number;
  truncated: boolean;
  validCount: number;
  warningCount: number;
};

type Direction = "none" | "request" | "response";

type ValidationContext = {
  budget: { steps: number };
  direction: Direction;
  limited: boolean;
  root: Record<string, unknown>;
};

type EntryMeta = {
  direction: Direction;
  kind: ExampleValidationKind;
  label: string;
  mediaType: string;
  method: string;
  path: string;
};

type CollectContext = {
  budget: { steps: number };
  entries: ExampleValidationEntry[];
  root: Record<string, unknown>;
  seen: Set<string>;
  truncated: boolean;
};

type Segments = string[];

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];
const MAX_EXAMPLES = 1000;
const MAX_ISSUES_PER_EXAMPLE = 20;
const MAX_STEPS_PER_EXAMPLE = 20_000;
const MAX_TOTAL_STEPS = 250_000;
const MAX_SCHEMA_DEPTH = 64;
const MAX_SCHEMA_WALK_DEPTH = 16;
const MAX_REFERENCE_HOPS = 16;
const MAX_UNIQUE_ITEMS_CHECK = 1000;
const MAX_PARAM_VALUE_LENGTH = 120;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const regexCache = new Map<string, RegExp | null>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function escapePointerSegment(segment: string) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function toJsonPointer(segments: Segments) {
  return segments
    .map((segment) => `/${escapePointerSegment(segment)}`)
    .join("");
}

function decodePointerSegment(segment: string) {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

export function parseJsonPointer(pointer: string): Segments | null {
  if (pointer === "") {
    return [];
  }

  if (!pointer.startsWith("/") || /~(?![01])/.test(pointer)) {
    return null;
  }

  return pointer.slice(1).split("/").map(decodePointerSegment);
}

function readPointerTarget(root: unknown, segments: Segments) {
  let current = root;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) {
        return { found: false as const };
      }

      current = current[Number(segment)];
      continue;
    }

    if (!isRecord(current) || !hasOwn(current, segment)) {
      return { found: false as const };
    }

    current = current[segment];
  }

  return current === undefined
    ? { found: false as const }
    : { found: true as const, value: current };
}

function getReferenceSegments(reference: string): Segments | null {
  if (!reference.startsWith("#")) {
    return null;
  }

  let pointer = reference.slice(1);

  try {
    pointer = decodeURIComponent(pointer);
  } catch {
    return null;
  }

  return parseJsonPointer(pointer);
}

// Follows local `$ref` chains so shared parameters, responses, and examples
// are validated at (and deduplicated by) the location that defines them.
function resolveNode(
  root: Record<string, unknown>,
  node: unknown,
  segments: Segments,
): { node: Record<string, unknown>; segments: Segments } | null {
  let current = node;
  let currentSegments = segments;

  for (let hop = 0; hop <= MAX_REFERENCE_HOPS; hop += 1) {
    if (!isRecord(current)) {
      return null;
    }

    if (typeof current.$ref !== "string") {
      return { node: current, segments: currentSegments };
    }

    const referenceSegments = getReferenceSegments(current.$ref);
    const target = referenceSegments
      ? readPointerTarget(root, referenceSegments)
      : { found: false as const };

    if (!referenceSegments || !target.found) {
      return null;
    }

    current = target.value;
    currentSegments = referenceSegments;
  }

  return null;
}

function resolveSchema(root: Record<string, unknown>, schema: unknown) {
  return resolveNode(root, schema, [])?.node ?? null;
}

function getValueType(value: unknown) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }

  return typeof value;
}

function readSchemaTypes(schema: Record<string, unknown>) {
  if (typeof schema.type === "string") {
    return [schema.type];
  }

  return Array.isArray(schema.type)
    ? schema.type.filter((type): type is string => typeof type === "string")
    : [];
}

function isNullable(schema: Record<string, unknown>) {
  return schema.nullable === true || schema["x-nullable"] === true;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }

  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);

  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every(
      (key) => hasOwn(right, key) && deepEqual(left[key], right[key]),
    )
  );
}

function formatParamValue(value: unknown) {
  const text =
    typeof value === "string" ? JSON.stringify(value) : stableStringify(value);

  return text.length > MAX_PARAM_VALUE_LENGTH
    ? `${text.slice(0, MAX_PARAM_VALUE_LENGTH)}…`
    : text;
}

function countCodePoints(value: string) {
  let count = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);

      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
      }
    }

    count += 1;
  }

  return count;
}

function getPattern(pattern: string) {
  if (!regexCache.has(pattern)) {
    let compiled: RegExp | null = null;

    try {
      compiled = new RegExp(pattern, "u");
    } catch {
      try {
        compiled = new RegExp(pattern);
      } catch {
        compiled = null;
      }
    }

    if (regexCache.size > 500) {
      regexCache.clear();
    }

    regexCache.set(pattern, compiled);
  }

  return regexCache.get(pattern) ?? null;
}

function isValidCalendarDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return day <= daysInMonth;
}

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return Boolean(
    match &&
    isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])),
  );
}

function isValidDateTime(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );

  if (
    !match ||
    !isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
  ) {
    return false;
  }

  return (
    Number(match[4]) < 24 &&
    Number(match[5]) < 60 &&
    Number(match[6]) <= 60 &&
    (match[7] === undefined || (Number(match[7]) < 24 && Number(match[8]) < 60))
  );
}

function isValidIpv6(value: string) {
  if (!value.includes(":") || /[^0-9a-f:.]/i.test(value)) {
    return false;
  }

  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

const STRING_FORMAT_CHECKS: Record<string, (value: string) => boolean> = {
  date: isValidDate,
  "date-time": isValidDateTime,
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  ipv4: (value) =>
    /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(
      value,
    ),
  ipv6: isValidIpv6,
  uri: (value) => /^[a-z][a-z0-9+.-]*:\S*$/i.test(value),
  uuid: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
};

function createIssue(
  keyword: ExampleValidationKeyword,
  instancePath: string,
  params: Record<string, string> = {},
  severity: ExampleValidationIssue["severity"] = "error",
): ExampleValidationIssue {
  return { instancePath, keyword, params, severity };
}

function hasErrors(issues: ExampleValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

function childPath(instancePath: string, key: string | number) {
  return `${instancePath}/${escapePointerSegment(String(key))}`;
}

function validateString(
  schema: Record<string, unknown>,
  value: string,
  instancePath: string,
  issues: ExampleValidationIssue[],
) {
  const needsLength =
    typeof schema.minLength === "number" ||
    typeof schema.maxLength === "number";
  const length = needsLength ? countCodePoints(value) : 0;

  if (typeof schema.minLength === "number" && length < schema.minLength) {
    issues.push(
      createIssue("minLength", instancePath, {
        limit: String(schema.minLength),
      }),
    );
  }

  if (typeof schema.maxLength === "number" && length > schema.maxLength) {
    issues.push(
      createIssue("maxLength", instancePath, {
        limit: String(schema.maxLength),
      }),
    );
  }

  if (typeof schema.pattern === "string") {
    const pattern = getPattern(schema.pattern);

    if (pattern && !pattern.test(value)) {
      issues.push(
        createIssue("pattern", instancePath, { pattern: schema.pattern }),
      );
    }
  }

  if (typeof schema.format === "string") {
    const check = STRING_FORMAT_CHECKS[schema.format];

    if (check && !check(value)) {
      issues.push(
        createIssue("format", instancePath, { format: schema.format }),
      );
    }
  }
}

function validateNumber(
  schema: Record<string, unknown>,
  value: number,
  instancePath: string,
  issues: ExampleValidationIssue[],
) {
  if (typeof schema.minimum === "number") {
    const exclusive = schema.exclusiveMinimum === true;

    if (exclusive ? value <= schema.minimum : value < schema.minimum) {
      issues.push(
        createIssue("minimum", instancePath, {
          comparison: exclusive ? ">" : "≥",
          limit: String(schema.minimum),
        }),
      );
    }
  }

  if (
    typeof schema.exclusiveMinimum === "number" &&
    value <= schema.exclusiveMinimum
  ) {
    issues.push(
      createIssue("minimum", instancePath, {
        comparison: ">",
        limit: String(schema.exclusiveMinimum),
      }),
    );
  }

  if (typeof schema.maximum === "number") {
    const exclusive = schema.exclusiveMaximum === true;

    if (exclusive ? value >= schema.maximum : value > schema.maximum) {
      issues.push(
        createIssue("maximum", instancePath, {
          comparison: exclusive ? "<" : "≤",
          limit: String(schema.maximum),
        }),
      );
    }
  }

  if (
    typeof schema.exclusiveMaximum === "number" &&
    value >= schema.exclusiveMaximum
  ) {
    issues.push(
      createIssue("maximum", instancePath, {
        comparison: "<",
        limit: String(schema.exclusiveMaximum),
      }),
    );
  }

  if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
    const quotient = value / schema.multipleOf;

    if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
      issues.push(
        createIssue("multipleOf", instancePath, {
          divisor: String(schema.multipleOf),
        }),
      );
    }
  }

  if (
    (schema.format === "int32" || schema.format === "int64") &&
    (!Number.isInteger(value) ||
      (schema.format === "int32" && (value < INT32_MIN || value > INT32_MAX)))
  ) {
    issues.push(createIssue("format", instancePath, { format: schema.format }));
  }
}

function validateArray(
  schema: Record<string, unknown>,
  value: unknown[],
  instancePath: string,
  depth: number,
  context: ValidationContext,
  issues: ExampleValidationIssue[],
) {
  if (typeof schema.minItems === "number" && value.length < schema.minItems) {
    issues.push(
      createIssue("minItems", instancePath, {
        limit: String(schema.minItems),
      }),
    );
  }

  if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
    issues.push(
      createIssue("maxItems", instancePath, {
        limit: String(schema.maxItems),
      }),
    );
  }

  if (schema.uniqueItems === true && value.length <= MAX_UNIQUE_ITEMS_CHECK) {
    const seen = new Set<string>();

    for (const [index, item] of value.entries()) {
      const key = stableStringify(item);

      if (seen.has(key)) {
        issues.push(
          createIssue("uniqueItems", instancePath, { index: String(index) }),
        );
        break;
      }

      seen.add(key);
    }
  }

  const prefixItems = Array.isArray(schema.prefixItems)
    ? schema.prefixItems
    : Array.isArray(schema.items)
      ? schema.items
      : [];
  const restItems =
    Array.isArray(schema.items) || schema.items === undefined
      ? undefined
      : schema.items;

  for (const [index, item] of value.entries()) {
    const itemSchema =
      index < prefixItems.length ? prefixItems[index] : restItems;

    if (itemSchema !== undefined) {
      issues.push(
        ...validateSchema(
          itemSchema,
          item,
          childPath(instancePath, index),
          depth + 1,
          context,
        ),
      );
    }

    if (context.limited) {
      return;
    }
  }
}

function validateObject(
  schema: Record<string, unknown>,
  value: Record<string, unknown>,
  instancePath: string,
  depth: number,
  context: ValidationContext,
  issues: ExampleValidationIssue[],
) {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const patternProperties = isRecord(schema.patternProperties)
    ? Object.entries(schema.patternProperties)
    : [];
  const required = Array.isArray(schema.required)
    ? schema.required.filter(
        (property): property is string => typeof property === "string",
      )
    : [];

  for (const property of required) {
    if (hasOwn(value, property)) {
      continue;
    }

    // Read-only fields are server-generated and write-only fields are never
    // returned, so their absence is expected in the matching direction.
    const propertySchema = hasOwn(properties, property)
      ? resolveSchema(context.root, properties[property])
      : null;

    if (
      (context.direction === "request" && propertySchema?.readOnly === true) ||
      (context.direction === "response" && propertySchema?.writeOnly === true)
    ) {
      continue;
    }

    issues.push(createIssue("required", instancePath, { property }));
  }

  const keys = Object.keys(value);

  if (
    typeof schema.minProperties === "number" &&
    keys.length < schema.minProperties
  ) {
    issues.push(
      createIssue("minProperties", instancePath, {
        limit: String(schema.minProperties),
      }),
    );
  }

  if (
    typeof schema.maxProperties === "number" &&
    keys.length > schema.maxProperties
  ) {
    issues.push(
      createIssue("maxProperties", instancePath, {
        limit: String(schema.maxProperties),
      }),
    );
  }

  for (const key of keys) {
    const propertyPath = childPath(instancePath, key);
    let matched = false;

    if (hasOwn(properties, key)) {
      matched = true;

      const propertySchema = resolveSchema(context.root, properties[key]);

      if (
        context.direction === "request" &&
        propertySchema?.readOnly === true
      ) {
        issues.push(
          createIssue("readOnly", propertyPath, { property: key }, "warning"),
        );
      }

      if (
        context.direction === "response" &&
        propertySchema?.writeOnly === true
      ) {
        issues.push(
          createIssue("writeOnly", propertyPath, { property: key }, "warning"),
        );
      }

      issues.push(
        ...validateSchema(
          properties[key],
          value[key],
          propertyPath,
          depth + 1,
          context,
        ),
      );
    }

    for (const [pattern, patternSchema] of patternProperties) {
      if (getPattern(pattern)?.test(key)) {
        matched = true;
        issues.push(
          ...validateSchema(
            patternSchema,
            value[key],
            propertyPath,
            depth + 1,
            context,
          ),
        );
      }
    }

    if (!matched) {
      if (schema.additionalProperties === false) {
        issues.push(
          createIssue("additionalProperties", propertyPath, { property: key }),
        );
      } else if (
        isRecord(schema.additionalProperties) ||
        schema.additionalProperties === true
      ) {
        issues.push(
          ...validateSchema(
            schema.additionalProperties,
            value[key],
            propertyPath,
            depth + 1,
            context,
          ),
        );
      }
    }

    if (context.limited) {
      return;
    }
  }
}

function selectDiscriminatedSchema(
  schema: Record<string, unknown>,
  candidates: unknown[],
  value: unknown,
) {
  if (!isRecord(schema.discriminator) || !isRecord(value)) {
    return undefined;
  }

  const propertyName = schema.discriminator.propertyName;

  if (typeof propertyName !== "string") {
    return undefined;
  }

  const discriminatorValue = value[propertyName];

  if (typeof discriminatorValue !== "string") {
    return undefined;
  }

  const mapping = isRecord(schema.discriminator.mapping)
    ? schema.discriminator.mapping
    : {};
  const mappedReference = hasOwn(mapping, discriminatorValue)
    ? mapping[discriminatorValue]
    : undefined;
  const expectedReference =
    typeof mappedReference === "string"
      ? mappedReference.startsWith("#")
        ? mappedReference
        : `#/components/schemas/${mappedReference}`
      : null;

  return candidates.find((candidate) => {
    if (!isRecord(candidate) || typeof candidate.$ref !== "string") {
      return false;
    }

    return expectedReference
      ? candidate.$ref === expectedReference
      : candidate.$ref.endsWith(`/${escapePointerSegment(discriminatorValue)}`);
  });
}

function validateComposition(
  schema: Record<string, unknown>,
  value: unknown,
  instancePath: string,
  depth: number,
  context: ValidationContext,
  issues: ExampleValidationIssue[],
) {
  if (Array.isArray(schema.allOf)) {
    for (const subschema of schema.allOf) {
      issues.push(
        ...validateSchema(subschema, value, instancePath, depth + 1, context),
      );
    }
  }

  for (const keyword of ["anyOf", "oneOf"] as const) {
    const candidates = schema[keyword];

    if (!Array.isArray(candidates) || candidates.length === 0) {
      continue;
    }

    const discriminated = selectDiscriminatedSchema(schema, candidates, value);

    if (discriminated !== undefined) {
      issues.push(
        ...validateSchema(
          discriminated,
          value,
          instancePath,
          depth + 1,
          context,
        ),
      );
      continue;
    }

    const branchResults = candidates.map((candidate) =>
      validateSchema(candidate, value, instancePath, depth + 1, context),
    );
    const matchCount = branchResults.filter(
      (branchIssues) => !hasErrors(branchIssues),
    ).length;

    if (matchCount === 0) {
      issues.push(
        createIssue(keyword, instancePath, {
          options: String(candidates.length),
        }),
      );
    } else if (keyword === "oneOf" && matchCount > 1) {
      issues.push(
        createIssue(
          "oneOfMultiple",
          instancePath,
          { matches: String(matchCount) },
          "warning",
        ),
      );
    }
  }

  if (schema.not !== undefined) {
    const notIssues = validateSchema(
      schema.not,
      value,
      instancePath,
      depth + 1,
      context,
    );

    if (!hasErrors(notIssues)) {
      issues.push(createIssue("not", instancePath));
    }
  }
}

function validateSchema(
  schema: unknown,
  value: unknown,
  instancePath: string,
  depth: number,
  context: ValidationContext,
): ExampleValidationIssue[] {
  context.budget.steps += 1;

  if (
    context.limited ||
    context.budget.steps > MAX_STEPS_PER_EXAMPLE ||
    depth > MAX_SCHEMA_DEPTH
  ) {
    context.limited = true;
    return [];
  }

  if (schema === false) {
    return [createIssue("not", instancePath)];
  }

  if (!isRecord(schema)) {
    return [];
  }

  if (value === null && isNullable(schema)) {
    return [];
  }

  const issues: ExampleValidationIssue[] = [];

  if (typeof schema.$ref === "string") {
    const target = resolveSchema(context.root, schema);

    // Unresolvable nested references are treated as permissive so one broken
    // link does not hide every other finding in the example.
    if (target) {
      issues.push(
        ...validateSchema(target, value, instancePath, depth + 1, context),
      );
    }
  }

  const types = readSchemaTypes(schema);

  if (types.length > 0) {
    const actualType = getValueType(value);
    const matchesType = types.some(
      (type) =>
        type === actualType || (type === "number" && actualType === "integer"),
    );

    if (!matchesType) {
      issues.push(
        createIssue("type", instancePath, {
          actual: actualType,
          expected: types.join(" | "),
        }),
      );

      return issues;
    }
  }

  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((option) => deepEqual(option, value))
  ) {
    issues.push(
      createIssue("enum", instancePath, {
        allowed: schema.enum.slice(0, 10).map(formatParamValue).join(", "),
      }),
    );
  }

  if (hasOwn(schema, "const") && !deepEqual(schema.const, value)) {
    issues.push(
      createIssue("const", instancePath, {
        expected: formatParamValue(schema.const),
      }),
    );
  }

  if (typeof value === "string") {
    validateString(schema, value, instancePath, issues);
  } else if (typeof value === "number") {
    validateNumber(schema, value, instancePath, issues);
  } else if (Array.isArray(value)) {
    validateArray(schema, value, instancePath, depth, context, issues);
  } else if (isRecord(value)) {
    validateObject(schema, value, instancePath, depth, context, issues);
  }

  validateComposition(schema, value, instancePath, depth, context, issues);

  return issues;
}

export function validateExampleValue(
  root: Record<string, unknown>,
  schema: unknown,
  value: unknown,
  direction: Direction = "none",
) {
  const context: ValidationContext = {
    budget: { steps: 0 },
    direction,
    limited: false,
    root,
  };
  const issues = validateSchema(schema, value, "", 0, context);

  return { issues, limited: context.limited, steps: context.budget.steps };
}

function isUnvalidatedMediaType(mediaType: string) {
  const normalized = mediaType.split(";", 1)[0].trim().toLowerCase();

  return (
    normalized.endsWith("/xml") ||
    normalized.endsWith("+xml") ||
    normalized === "application/octet-stream" ||
    normalized === "application/pdf" ||
    normalized === "application/zip" ||
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/")
  );
}

function isStructuredMediaType(mediaType: string) {
  const normalized = mediaType.split(";", 1)[0].trim().toLowerCase();

  return (
    normalized === "" || normalized === "*/*" || normalized.includes("json")
  );
}

function schemaRejectsStrings(root: Record<string, unknown>, schema: unknown) {
  const resolved = resolveSchema(root, schema);

  if (!resolved) {
    return false;
  }

  const types = readSchemaTypes(resolved);

  return types.length > 0
    ? !types.includes("string")
    : isRecord(resolved.properties) || resolved.items !== undefined;
}

function readSerializedExample(value: string) {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function addEntry(
  context: CollectContext,
  meta: EntryMeta,
  input: {
    exampleName: string;
    pointerSegments: Segments;
    schema: unknown;
    schemaSegments: Segments;
    skipReason?: ExampleValidationSkipReason;
    value: unknown;
  },
) {
  const pointer = toJsonPointer(input.pointerSegments);
  const dedupeKey = `${pointer}\u0000${toJsonPointer(input.schemaSegments)}`;

  if (context.seen.has(dedupeKey)) {
    return;
  }

  context.seen.add(dedupeKey);

  if (context.entries.length >= MAX_EXAMPLES) {
    context.truncated = true;
    return;
  }

  const entry: ExampleValidationEntry = {
    exampleName: input.exampleName,
    hiddenIssueCount: 0,
    id: dedupeKey,
    issues: [],
    kind: meta.kind,
    label: meta.label,
    mediaType: meta.mediaType,
    method: meta.method,
    path: meta.path,
    pointer,
    status: "valid",
  };
  let skipReason = input.skipReason;

  if (!skipReason && input.schema === undefined) {
    skipReason = "missing-schema";
  }

  if (
    !skipReason &&
    isRecord(input.schema) &&
    typeof input.schema.$ref === "string" &&
    !resolveSchema(context.root, input.schema)
  ) {
    skipReason = "unresolved-reference";
  }

  if (!skipReason && context.budget.steps >= MAX_TOTAL_STEPS) {
    skipReason = "limit";
    context.truncated = true;
  }

  if (skipReason) {
    context.entries.push({ ...entry, skipReason, status: "skipped" });
    return;
  }

  let value = input.value;
  const issues: ExampleValidationIssue[] = [];

  if (
    typeof value === "string" &&
    isStructuredMediaType(meta.mediaType) &&
    schemaRejectsStrings(context.root, input.schema)
  ) {
    const serialized = readSerializedExample(value);

    if (serialized !== undefined) {
      value = serialized;
      issues.push(createIssue("serialized", "", {}, "warning"));
    }
  }

  const validation = validateExampleValue(
    context.root,
    input.schema,
    value,
    meta.direction,
  );

  context.budget.steps += validation.steps;
  issues.push(...validation.issues);

  if (validation.limited && !hasErrors(issues)) {
    context.entries.push({ ...entry, skipReason: "limit", status: "skipped" });
    return;
  }

  context.entries.push({
    ...entry,
    hiddenIssueCount: Math.max(0, issues.length - MAX_ISSUES_PER_EXAMPLE),
    issues: issues.slice(0, MAX_ISSUES_PER_EXAMPLE),
    status: hasErrors(issues)
      ? "invalid"
      : issues.length > 0
        ? "warning"
        : "valid",
  });
}

function collectExampleHolder(
  context: CollectContext,
  meta: EntryMeta,
  holder: Record<string, unknown>,
  holderSegments: Segments,
  schema: unknown,
  schemaSegments: Segments,
) {
  const skipReason = isUnvalidatedMediaType(meta.mediaType)
    ? "media-type"
    : undefined;

  if (hasOwn(holder, "example")) {
    addEntry(context, meta, {
      exampleName: "",
      pointerSegments: [...holderSegments, "example"],
      schema,
      schemaSegments,
      skipReason,
      value: holder.example,
    });
  }

  if (!isRecord(holder.examples)) {
    return;
  }

  for (const [name, rawExample] of Object.entries(holder.examples)) {
    const exampleSegments = [...holderSegments, "examples", name];
    const resolved = resolveNode(context.root, rawExample, exampleSegments);

    if (!resolved) {
      addEntry(context, meta, {
        exampleName: name,
        pointerSegments: exampleSegments,
        schema,
        schemaSegments,
        skipReason: "unresolved-reference",
        value: undefined,
      });
      continue;
    }

    if (hasOwn(resolved.node, "value")) {
      addEntry(context, meta, {
        exampleName: name,
        pointerSegments: [...resolved.segments, "value"],
        schema,
        schemaSegments,
        skipReason,
        value: resolved.node.value,
      });
    } else if (typeof resolved.node.externalValue === "string") {
      addEntry(context, meta, {
        exampleName: name,
        pointerSegments: resolved.segments,
        schema,
        schemaSegments,
        skipReason: "external-value",
        value: undefined,
      });
    }
  }
}

function walkSchemaExamples(
  context: CollectContext,
  meta: EntryMeta,
  schema: unknown,
  schemaSegments: Segments,
  label: string,
  depth = 0,
) {
  if (!isRecord(schema) || depth > MAX_SCHEMA_WALK_DEPTH) {
    return;
  }

  const schemaMeta = { ...meta, label, mediaType: "" };

  if (hasOwn(schema, "example")) {
    addEntry(context, schemaMeta, {
      exampleName: "",
      pointerSegments: [...schemaSegments, "example"],
      schema,
      schemaSegments,
      value: schema.example,
    });
  }

  if (Array.isArray(schema.examples)) {
    schema.examples.forEach((example, index) => {
      addEntry(context, schemaMeta, {
        exampleName: `#${index + 1}`,
        pointerSegments: [...schemaSegments, "examples", String(index)],
        schema,
        schemaSegments,
        value: example,
      });
    });
  }

  // Referenced schemas are walked once at their definition instead of at
  // every use, which keeps findings deduplicated and recursion bounded.
  if (typeof schema.$ref === "string") {
    return;
  }

  const visit = (child: unknown, segments: Segments, childLabel: string) =>
    walkSchemaExamples(context, meta, child, segments, childLabel, depth + 1);

  if (isRecord(schema.properties)) {
    for (const [name, property] of Object.entries(schema.properties)) {
      visit(
        property,
        [...schemaSegments, "properties", name],
        `${label}.${name}`,
      );
    }
  }

  if (isRecord(schema.items)) {
    visit(schema.items, [...schemaSegments, "items"], `${label}[]`);
  }

  if (isRecord(schema.additionalProperties)) {
    visit(
      schema.additionalProperties,
      [...schemaSegments, "additionalProperties"],
      `${label}.*`,
    );
  }

  for (const keyword of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    const children = schema[keyword];

    if (Array.isArray(children)) {
      children.forEach((child, index) =>
        visit(child, [...schemaSegments, keyword, String(index)], label),
      );
    }
  }
}

function collectMediaTypes(
  context: CollectContext,
  meta: EntryMeta,
  content: unknown,
  contentSegments: Segments,
  getLabel: (mediaType: string) => string,
) {
  if (!isRecord(content)) {
    return;
  }

  for (const [mediaType, mediaObject] of Object.entries(content)) {
    if (!isRecord(mediaObject)) {
      continue;
    }

    const mediaSegments = [...contentSegments, mediaType];
    const mediaMeta = { ...meta, label: getLabel(mediaType), mediaType };

    collectExampleHolder(
      context,
      mediaMeta,
      mediaObject,
      mediaSegments,
      mediaObject.schema,
      [...mediaSegments, "schema"],
    );
    walkSchemaExamples(
      context,
      mediaMeta,
      mediaObject.schema,
      [...mediaSegments, "schema"],
      mediaMeta.label,
    );
  }
}

function collectParameter(
  context: CollectContext,
  operation: { method: string; path: string },
  rawParameter: unknown,
  parameterSegments: Segments,
  isSwagger2: boolean,
) {
  const resolved = resolveNode(context.root, rawParameter, parameterSegments);

  if (!resolved) {
    return;
  }

  const { node: parameter, segments } = resolved;
  const location = typeof parameter.in === "string" ? parameter.in : "";
  const name = typeof parameter.name === "string" ? parameter.name : "";
  const meta: EntryMeta = {
    ...operation,
    direction: "request",
    kind: location === "body" ? "request-body" : "parameter",
    label: location === "body" ? name || "body" : `${location} · ${name}`,
    mediaType: "",
  };

  if (isSwagger2 && location !== "body") {
    // Swagger 2.0 non-body parameters describe their own schema inline.
    if (hasOwn(parameter, "x-example")) {
      addEntry(context, meta, {
        exampleName: "x-example",
        pointerSegments: [...segments, "x-example"],
        schema: parameter,
        schemaSegments: segments,
        value: parameter["x-example"],
      });
    }

    return;
  }

  if (isRecord(parameter.content)) {
    collectMediaTypes(
      context,
      meta,
      parameter.content,
      [...segments, "content"],
      (mediaType) => `${meta.label} · ${mediaType}`,
    );
    return;
  }

  collectExampleHolder(context, meta, parameter, segments, parameter.schema, [
    ...segments,
    "schema",
  ]);
  walkSchemaExamples(
    context,
    meta,
    parameter.schema,
    [...segments, "schema"],
    meta.label,
  );
}

function collectHeader(
  context: CollectContext,
  operation: { method: string; path: string },
  labelPrefix: string,
  name: string,
  rawHeader: unknown,
  headerSegments: Segments,
) {
  const resolved = resolveNode(context.root, rawHeader, headerSegments);

  if (!resolved) {
    return;
  }

  const { node: header, segments } = resolved;
  const meta: EntryMeta = {
    ...operation,
    direction: "response",
    kind: "header",
    label: labelPrefix ? `${labelPrefix} · ${name}` : name,
    mediaType: "",
  };

  if (isRecord(header.content)) {
    collectMediaTypes(
      context,
      meta,
      header.content,
      [...segments, "content"],
      (mediaType) => `${meta.label} · ${mediaType}`,
    );
    return;
  }

  collectExampleHolder(context, meta, header, segments, header.schema, [
    ...segments,
    "schema",
  ]);
  walkSchemaExamples(
    context,
    meta,
    header.schema,
    [...segments, "schema"],
    meta.label,
  );
}

function collectRequestBody(
  context: CollectContext,
  operation: { method: string; path: string },
  rawRequestBody: unknown,
  requestBodySegments: Segments,
  labelPrefix = "",
) {
  const resolved = resolveNode(
    context.root,
    rawRequestBody,
    requestBodySegments,
  );

  if (!resolved) {
    return;
  }

  collectMediaTypes(
    context,
    {
      ...operation,
      direction: "request",
      kind: "request-body",
      label: "",
      mediaType: "",
    },
    resolved.node.content,
    [...resolved.segments, "content"],
    (mediaType) => (labelPrefix ? `${labelPrefix} · ${mediaType}` : mediaType),
  );
}

function collectResponse(
  context: CollectContext,
  operation: { method: string; path: string },
  status: string,
  rawResponse: unknown,
  responseSegments: Segments,
  isSwagger2: boolean,
) {
  const resolved = resolveNode(context.root, rawResponse, responseSegments);

  if (!resolved) {
    return;
  }

  const { node: response, segments } = resolved;
  const meta: EntryMeta = {
    ...operation,
    direction: "response",
    kind: "response",
    label: status,
    mediaType: "",
  };

  if (isSwagger2) {
    if (isRecord(response.examples)) {
      for (const [mediaType, value] of Object.entries(response.examples)) {
        addEntry(
          context,
          { ...meta, label: `${status} · ${mediaType}`, mediaType },
          {
            exampleName: "",
            pointerSegments: [...segments, "examples", mediaType],
            schema: response.schema,
            schemaSegments: [...segments, "schema"],
            skipReason: isUnvalidatedMediaType(mediaType)
              ? "media-type"
              : undefined,
            value,
          },
        );
      }
    }

    walkSchemaExamples(
      context,
      meta,
      response.schema,
      [...segments, "schema"],
      status,
    );
    return;
  }

  collectMediaTypes(
    context,
    meta,
    response.content,
    [...segments, "content"],
    (mediaType) => `${status} · ${mediaType}`,
  );

  if (isRecord(response.headers)) {
    for (const [name, header] of Object.entries(response.headers)) {
      collectHeader(context, operation, status, name, header, [
        ...segments,
        "headers",
        name,
      ]);
    }
  }
}

function collectOperations(context: CollectContext, isSwagger2: boolean) {
  if (!isRecord(context.root.paths)) {
    return;
  }

  for (const [path, rawPathItem] of Object.entries(context.root.paths)) {
    const resolvedPathItem = resolveNode(context.root, rawPathItem, [
      "paths",
      path,
    ]);

    if (!resolvedPathItem) {
      continue;
    }

    const { node: pathItem, segments: pathSegments } = resolvedPathItem;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];

      if (!isRecord(operation)) {
        continue;
      }

      const operationRef = { method: method.toUpperCase(), path };
      const operationSegments = [...pathSegments, method];

      for (const [parameters, parametersSegments] of [
        [pathItem.parameters, [...pathSegments, "parameters"]],
        [operation.parameters, [...operationSegments, "parameters"]],
      ] as const) {
        if (!Array.isArray(parameters)) {
          continue;
        }

        parameters.forEach((parameter, index) =>
          collectParameter(
            context,
            operationRef,
            parameter,
            [...parametersSegments, String(index)],
            isSwagger2,
          ),
        );
      }

      if (!isSwagger2 && operation.requestBody !== undefined) {
        collectRequestBody(context, operationRef, operation.requestBody, [
          ...operationSegments,
          "requestBody",
        ]);
      }

      if (isRecord(operation.responses)) {
        for (const [status, response] of Object.entries(operation.responses)) {
          collectResponse(
            context,
            operationRef,
            status,
            response,
            [...operationSegments, "responses", status],
            isSwagger2,
          );
        }
      }
    }
  }
}

function collectComponents(context: CollectContext, isSwagger2: boolean) {
  const noOperation = { method: "", path: "" };
  const components = isSwagger2
    ? {
        parameters: context.root.parameters,
        parametersSegments: ["parameters"],
        responses: context.root.responses,
        responsesSegments: ["responses"],
        schemas: context.root.definitions,
        schemasSegments: ["definitions"],
      }
    : {
        parameters: isRecord(context.root.components)
          ? context.root.components.parameters
          : undefined,
        parametersSegments: ["components", "parameters"],
        responses: isRecord(context.root.components)
          ? context.root.components.responses
          : undefined,
        responsesSegments: ["components", "responses"],
        schemas: isRecord(context.root.components)
          ? context.root.components.schemas
          : undefined,
        schemasSegments: ["components", "schemas"],
      };

  if (isRecord(components.parameters)) {
    for (const [name, parameter] of Object.entries(components.parameters)) {
      collectParameter(
        context,
        noOperation,
        parameter,
        [...components.parametersSegments, name],
        isSwagger2,
      );
    }
  }

  if (!isSwagger2 && isRecord(context.root.components)) {
    const { headers, requestBodies } = context.root.components;

    if (isRecord(requestBodies)) {
      for (const [name, requestBody] of Object.entries(requestBodies)) {
        collectRequestBody(
          context,
          noOperation,
          requestBody,
          ["components", "requestBodies", name],
          name,
        );
      }
    }

    if (isRecord(headers)) {
      for (const [name, header] of Object.entries(headers)) {
        collectHeader(context, noOperation, "", name, header, [
          "components",
          "headers",
          name,
        ]);
      }
    }
  }

  if (isRecord(components.responses)) {
    for (const [name, response] of Object.entries(components.responses)) {
      collectResponse(
        context,
        noOperation,
        name,
        response,
        [...components.responsesSegments, name],
        isSwagger2,
      );
    }
  }

  if (isRecord(components.schemas)) {
    for (const [name, schema] of Object.entries(components.schemas)) {
      walkSchemaExamples(
        context,
        {
          ...noOperation,
          direction: "none",
          kind: "schema",
          label: name,
          mediaType: "",
        },
        schema,
        [...components.schemasSegments, name],
        name,
      );
    }
  }
}

export function createExampleValidationReport(
  root: Record<string, unknown>,
): ExampleValidationReport {
  const context: CollectContext = {
    budget: { steps: 0 },
    entries: [],
    root,
    seen: new Set(),
    truncated: false,
  };
  const isSwagger2 = typeof root.swagger === "string";

  collectOperations(context, isSwagger2);
  collectComponents(context, isSwagger2);

  const counts = { invalid: 0, skipped: 0, valid: 0, warning: 0 };
  let issueCount = 0;

  for (const entry of context.entries) {
    counts[entry.status] += 1;
    issueCount += entry.issues.length + entry.hiddenIssueCount;
  }

  return {
    entries: context.entries,
    invalidCount: counts.invalid,
    issueCount,
    skippedCount: counts.skipped,
    totalCount: context.entries.length,
    truncated: context.truncated,
    validCount: counts.valid,
    warningCount: counts.warning,
  };
}

export function getExampleConformancePercentage(
  report: ExampleValidationReport,
) {
  const checkedCount = report.totalCount - report.skippedCount;

  return checkedCount === 0
    ? 100
    : Math.floor(
        ((report.validCount + report.warningCount) / checkedCount) * 100,
      );
}

function findYamlChild(
  document: YAML.Document,
  node: unknown,
  segment: string,
): unknown {
  const target = isAlias(node) ? node.resolve(document) : node;

  if (isMap(target)) {
    const pair = target.items.find((item) => {
      const key = isScalar(item.key) ? item.key.value : item.key;

      return String(key) === segment;
    });

    return pair?.value;
  }

  if (isSeq(target) && /^(0|[1-9]\d*)$/.test(segment)) {
    return target.items[Number(segment)];
  }

  return undefined;
}

// Maps a JSON pointer from the parsed document back to the source text, so
// the editor can highlight the example exactly as the author wrote it.
export function findJsonPointerSourceRange(
  sourceText: string,
  pointer: string,
): { end: number; start: number } | null {
  const segments = parseJsonPointer(pointer);

  if (!segments) {
    return null;
  }

  try {
    const document = YAML.parseDocument(sourceText, { uniqueKeys: false });
    let node: unknown = document.contents;

    for (const segment of segments) {
      node = findYamlChild(document, node, segment);

      if (node === undefined || node === null) {
        return null;
      }
    }

    const range = (node as YamlNode).range;

    if (!range) {
      return null;
    }

    let end = range[1];

    // Block collections end after their final line break; trimming it keeps
    // the editor selection on the example itself.
    while (end > range[0] && /\s/.test(sourceText[end - 1] ?? "")) {
      end -= 1;
    }

    return { end, start: range[0] };
  } catch {
    return null;
  }
}
