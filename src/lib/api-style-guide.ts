import {
  normalizeStyleGuideConfig,
  STYLE_RULES,
  type NamingConvention,
  type StyleGuideConfig,
  type StyleRuleDefinition,
  type StyleRuleId,
  type StyleSeverity,
} from "./api-style-guide-config";
import { toJsonPointer } from "./example-validation";
import { isPrivateOrLocalHostname } from "./server-url";

export type StyleViolation = {
  highlight: "key" | "value";
  id: string;
  method: string;
  params: Record<string, string>;
  path: string;
  pointer: string;
  ruleId: StyleRuleId;
  severity: StyleSeverity;
};

export type StyleRuleResult = StyleRuleDefinition & {
  checkedCount: number;
  enabled: boolean;
  violationCount: number;
};

export type StyleGuideReport = {
  counts: Record<StyleSeverity, number>;
  enabledRuleCount: number;
  passingRuleCount: number;
  rules: StyleRuleResult[];
  score: number;
  truncated: boolean;
  violations: StyleViolation[];
};

type Segments = string[];

type Operation = {
  method: string;
  node: Record<string, unknown>;
  parameters: ParameterInfo[];
  path: string;
  segments: Segments;
};

type ParameterInfo = {
  location: string;
  name: string;
  node: Record<string, unknown>;
  segments: Segments;
};

type ReportInput = {
  highlight?: StyleViolation["highlight"];
  method?: string;
  params?: Record<string, string>;
  path?: string;
  pointer: Segments;
};

type Context = {
  checked: Map<StyleRuleId, number>;
  config: StyleGuideConfig;
  disabled: Set<StyleRuleId>;
  isSwagger2: boolean;
  root: Record<string, unknown>;
  seen: Set<string>;
  truncated: boolean;
  violationCounts: Map<StyleRuleId, number>;
  violations: StyleViolation[];
};

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
const MAX_VIOLATIONS = 1000;
const MAX_SCHEMA_DEPTH = 16;
const MAX_REFERENCE_HOPS = 16;
const MAX_SUMMARY_LENGTH = 80;
const SEVERITY_WEIGHTS: Record<StyleSeverity, number> = {
  error: 3,
  info: 1,
  warning: 2,
};
const PATH_VERBS = new Set([
  "add",
  "create",
  "delete",
  "destroy",
  "edit",
  "fetch",
  "get",
  "insert",
  "list",
  "modify",
  "remove",
  "retrieve",
  "set",
  "update",
]);
const FILE_EXTENSION_PATTERN = /\.(aspx?|html?|json|jsp|php|xml|ya?ml)$/i;
const VERSION_SEGMENT_PATTERN = /^v\d+(?:\.\d+)*$/i;
const RESERVED_HEADER_PARAMETERS = new Set([
  "accept",
  "authorization",
  "content-type",
]);
const PAGE_SIZE_PARAMETERS = new Set([
  "$top",
  "count",
  "limit",
  "max_results",
  "maxresults",
  "page_size",
  "pagesize",
  "per_page",
  "perpage",
  "size",
  "take",
  "top",
]);
const CURSOR_PARAMETERS = new Set([
  "after",
  "before",
  "continuation_token",
  "continuationtoken",
  "cursor",
  "page_token",
  "pagetoken",
  "starting_after",
]);
const NAMING_PATTERNS: Record<NamingConvention, RegExp> = {
  camelCase: /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/,
  "kebab-case": /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  PascalCase: /^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/,
  snake_case: /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function splitNameWords(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

export function matchesNamingConvention(
  name: string,
  convention: NamingConvention,
) {
  return NAMING_PATTERNS[convention].test(name);
}

export function convertNameToConvention(
  name: string,
  convention: NamingConvention,
) {
  const words = splitNameWords(name).map((word) => word.toLowerCase());

  if (words.length === 0) {
    return name;
  }

  const capitalize = (word: string) =>
    word.charAt(0).toUpperCase() + word.slice(1);

  switch (convention) {
    case "camelCase":
      return words[0] + words.slice(1).map(capitalize).join("");
    case "PascalCase":
      return words.map(capitalize).join("");
    case "kebab-case":
      return words.join("-");
    case "snake_case":
      return words.join("_");
  }
}

function getReferenceSegments(reference: string): Segments | null {
  if (!reference.startsWith("#/")) {
    return reference === "#" ? [] : null;
  }

  try {
    return decodeURIComponent(reference.slice(2))
      .split("/")
      .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  } catch {
    return null;
  }
}

function readAt(root: unknown, segments: Segments) {
  let current = root;

  for (const segment of segments) {
    if (Array.isArray(current) && /^(0|[1-9]\d*)$/.test(segment)) {
      current = current[Number(segment)];
    } else if (isRecord(current) && hasOwn(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

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

    if (!referenceSegments) {
      return null;
    }

    current = readAt(root, referenceSegments);
    currentSegments = referenceSegments;
  }

  return null;
}

function isRuleEnabled(context: Context, ruleId: StyleRuleId) {
  return !context.disabled.has(ruleId);
}

function markChecked(context: Context, ruleId: StyleRuleId, count = 1) {
  if (!isRuleEnabled(context, ruleId)) {
    return false;
  }

  context.checked.set(ruleId, (context.checked.get(ruleId) ?? 0) + count);

  return true;
}

function reportViolation(
  context: Context,
  ruleId: StyleRuleId,
  input: ReportInput,
) {
  if (!isRuleEnabled(context, ruleId)) {
    return;
  }

  const pointer = toJsonPointer(input.pointer);
  const id = `${ruleId} ${pointer} ${JSON.stringify(input.params ?? {})}`;

  if (context.seen.has(id)) {
    return;
  }

  context.seen.add(id);
  context.violationCounts.set(
    ruleId,
    (context.violationCounts.get(ruleId) ?? 0) + 1,
  );

  if (context.violations.length >= MAX_VIOLATIONS) {
    context.truncated = true;
    return;
  }

  context.violations.push({
    highlight: input.highlight ?? "value",
    id,
    method: input.method ?? "",
    params: input.params ?? {},
    path: input.path ?? "",
    pointer,
    ruleId,
    severity: STYLE_RULES.find((rule) => rule.id === ruleId)!.severity,
  });
}

function collectParameters(
  context: Context,
  rawParameters: unknown,
  parametersSegments: Segments,
) {
  if (!Array.isArray(rawParameters)) {
    return [];
  }

  return rawParameters.flatMap((rawParameter, index) => {
    const resolved = resolveNode(context.root, rawParameter, [
      ...parametersSegments,
      String(index),
    ]);

    if (!resolved) {
      return [];
    }

    return [
      {
        location: readString(resolved.node.in),
        name: readString(resolved.node.name),
        node: resolved.node,
        segments: resolved.segments,
      },
    ];
  });
}

function collectOperations(context: Context) {
  const operations: Operation[] = [];

  if (!isRecord(context.root.paths)) {
    return operations;
  }

  for (const [path, rawPathItem] of Object.entries(context.root.paths)) {
    const pathItem = resolveNode(context.root, rawPathItem, ["paths", path]);

    if (!pathItem) {
      continue;
    }

    const sharedParameters = collectParameters(
      context,
      pathItem.node.parameters,
      [...pathItem.segments, "parameters"],
    );

    for (const method of HTTP_METHODS) {
      const operation = pathItem.node[method];

      if (!isRecord(operation)) {
        continue;
      }

      const segments = ["paths", path, method];
      const ownParameters = collectParameters(context, operation.parameters, [
        ...segments,
        "parameters",
      ]);
      const ownKeys = new Set(
        ownParameters.map(
          (parameter) => `${parameter.location}:${parameter.name}`,
        ),
      );

      operations.push({
        method: method.toUpperCase(),
        node: operation,
        parameters: [
          ...sharedParameters.filter(
            (parameter) =>
              !ownKeys.has(`${parameter.location}:${parameter.name}`),
          ),
          ...ownParameters,
        ],
        path,
        segments,
      });
    }
  }

  return operations;
}

function getStaticSegments(path: string) {
  return path
    .split("/")
    .filter(
      (segment) =>
        segment !== "" &&
        !segment.includes("{") &&
        !segment.includes("}") &&
        !segment.startsWith("."),
    );
}

function checkPaths(context: Context, operations: Operation[]) {
  if (!isRecord(context.root.paths)) {
    return;
  }

  const firstOperationByPath = new Map<string, Operation>();

  for (const operation of operations) {
    if (!firstOperationByPath.has(operation.path)) {
      firstOperationByPath.set(operation.path, operation);
    }
  }

  const normalizedPaths = new Map<string, string>();
  const { pathCase } = context.config;

  for (const path of Object.keys(context.root.paths)) {
    const operation = firstOperationByPath.get(path);
    const base = {
      highlight: "key" as const,
      method: operation?.method ?? "",
      path: operation ? path : "",
      pointer: ["paths", path],
    };
    const staticSegments = getStaticSegments(path);

    if (markChecked(context, "path-trailing-slash") && path.length > 1) {
      if (path.endsWith("/")) {
        reportViolation(context, "path-trailing-slash", {
          ...base,
          params: { suggestion: path.replace(/\/+$/, "") || "/" },
        });
      }
    }

    if (markChecked(context, "path-casing")) {
      const invalidSegments = staticSegments
        .map((segment) => segment.replace(FILE_EXTENSION_PATTERN, ""))
        .filter(
          (segment) =>
            segment &&
            !VERSION_SEGMENT_PATTERN.test(segment) &&
            !matchesNamingConvention(segment, pathCase),
        );

      if (invalidSegments.length > 0) {
        reportViolation(context, "path-casing", {
          ...base,
          params: {
            convention: pathCase,
            segments: invalidSegments.join(", "),
            suggestion: path
              .split("/")
              .map((segment) =>
                invalidSegments.includes(segment)
                  ? convertNameToConvention(segment, pathCase)
                  : segment,
              )
              .join("/"),
          },
        });
      }
    }

    if (markChecked(context, "path-verbs")) {
      const verbSegment = staticSegments.find((segment) => {
        const firstWord = splitNameWords(segment)[0]?.toLowerCase() ?? "";

        return PATH_VERBS.has(firstWord);
      });

      if (verbSegment) {
        reportViolation(context, "path-verbs", {
          ...base,
          params: { segment: verbSegment },
        });
      }
    }

    if (markChecked(context, "path-file-extension")) {
      const extensionSegment = staticSegments.find((segment) =>
        FILE_EXTENSION_PATTERN.test(segment),
      );

      if (extensionSegment) {
        reportViolation(context, "path-file-extension", {
          ...base,
          params: {
            extension: extensionSegment.match(FILE_EXTENSION_PATTERN)![0],
          },
        });
      }
    }

    if (markChecked(context, "path-ambiguous")) {
      const normalized =
        path.replace(/\{[^}]*\}/g, "{}").replace(/\/+$/, "") || "/";
      const conflict = normalizedPaths.get(normalized);

      if (conflict === undefined) {
        normalizedPaths.set(normalized, path);
      } else {
        reportViolation(context, "path-ambiguous", {
          ...base,
          params: { conflict },
        });
      }
    }
  }
}

function hasRequestBody(context: Context, operation: Operation) {
  return context.isSwagger2
    ? operation.parameters.some(
        (parameter) =>
          parameter.location === "body" || parameter.location === "formData",
      )
    : operation.node.requestBody !== undefined;
}

function checkOperations(context: Context, operations: Operation[]) {
  const { operationIdCase } = context.config;

  for (const operation of operations) {
    const base = { method: operation.method, path: operation.path };
    const operationId = readString(operation.node.operationId);
    const summary = readString(operation.node.summary).trim();

    if (operationId && markChecked(context, "operation-id-casing")) {
      if (!matchesNamingConvention(operationId, operationIdCase)) {
        reportViolation(context, "operation-id-casing", {
          ...base,
          params: {
            convention: operationIdCase,
            name: operationId,
            suggestion: convertNameToConvention(operationId, operationIdCase),
          },
          pointer: [...operation.segments, "operationId"],
        });
      }
    }

    if (summary && markChecked(context, "summary-style")) {
      if (summary.endsWith(".") || summary.length > MAX_SUMMARY_LENGTH) {
        reportViolation(context, "summary-style", {
          ...base,
          params: {
            length: String(summary.length),
            limit: String(MAX_SUMMARY_LENGTH),
          },
          pointer: [...operation.segments, "summary"],
        });
      }
    }

    if (
      ["GET", "HEAD", "DELETE"].includes(operation.method) &&
      markChecked(context, "request-body-on-safe-method") &&
      hasRequestBody(context, operation)
    ) {
      const bodyParameter = operation.parameters.find(
        (parameter) =>
          parameter.location === "body" || parameter.location === "formData",
      );

      reportViolation(context, "request-body-on-safe-method", {
        ...base,
        highlight: "key",
        params: { method: operation.method },
        pointer:
          context.isSwagger2 && bodyParameter
            ? bodyParameter.segments
            : [...operation.segments, "requestBody"],
      });
    }

    const lastSegment = operation.path.split("/").filter(Boolean).at(-1) ?? "";
    const responses = isRecord(operation.node.responses)
      ? operation.node.responses
      : {};
    const successStatuses = Object.keys(responses).filter((status) =>
      /^2(?:\d\d|XX)$/i.test(status),
    );

    if (
      operation.method === "POST" &&
      !lastSegment.includes("{") &&
      hasRequestBody(context, operation) &&
      successStatuses.length > 0 &&
      markChecked(context, "post-create-status") &&
      successStatuses.every((status) => status === "200")
    ) {
      reportViolation(context, "post-create-status", {
        ...base,
        highlight: "key",
        pointer: [...operation.segments, "responses", "200"],
      });
    }
  }
}

function getParameterNameParts(name: string) {
  // JSON:API style `filter[status]` and dotted names are checked per part.
  return name.split(/[[\].]+/).filter(Boolean);
}

function getPaginationStyle(names: Set<string>) {
  if ([...names].some((name) => CURSOR_PARAMETERS.has(name))) {
    return "cursor";
  }

  if (names.has("offset") || names.has("skip")) {
    return "offset";
  }

  return names.has("page") ||
    names.has("page_number") ||
    names.has("pagenumber")
    ? "page"
    : "";
}

function getDominantValue(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let dominant = "";
  let dominantCount = 0;

  for (const [value, count] of counts) {
    if (count > dominantCount) {
      dominant = value;
      dominantCount = count;
    }
  }

  return { distinctCount: counts.size, dominant };
}

function checkParameters(context: Context, operations: Operation[]) {
  const { parameterCase } = context.config;
  const checkedParameters = new Set<string>();
  const paginationUsages: Array<{
    operation: Operation;
    parameter: ParameterInfo;
    style: string;
  }> = [];
  const pageSizeUsages: Array<{
    operation: Operation;
    parameter: ParameterInfo;
  }> = [];

  for (const operation of operations) {
    const base = { method: operation.method, path: operation.path };

    for (const parameter of operation.parameters) {
      const pointer = toJsonPointer(parameter.segments);

      if (checkedParameters.has(pointer)) {
        continue;
      }

      checkedParameters.add(pointer);

      if (
        (parameter.location === "path" || parameter.location === "query") &&
        parameter.name &&
        markChecked(context, "parameter-casing")
      ) {
        const invalidParts = getParameterNameParts(parameter.name).filter(
          (part) => !matchesNamingConvention(part, parameterCase),
        );

        if (invalidParts.length > 0) {
          reportViolation(context, "parameter-casing", {
            ...base,
            params: {
              convention: parameterCase,
              location: parameter.location,
              name: parameter.name,
              suggestion: invalidParts.reduce(
                (name, part) =>
                  name.replace(
                    part,
                    convertNameToConvention(part, parameterCase),
                  ),
                parameter.name,
              ),
            },
            pointer: [...parameter.segments, "name"],
          });
        }
      }

      if (
        !context.isSwagger2 &&
        parameter.location === "header" &&
        markChecked(context, "reserved-header-parameter") &&
        RESERVED_HEADER_PARAMETERS.has(parameter.name.toLowerCase())
      ) {
        reportViolation(context, "reserved-header-parameter", {
          ...base,
          params: { name: parameter.name },
          pointer: [...parameter.segments, "name"],
        });
      }

      if (
        parameter.location !== "body" &&
        markChecked(context, "parameter-description") &&
        !readString(parameter.node.description).trim()
      ) {
        reportViolation(context, "parameter-description", {
          ...base,
          highlight: "value",
          params: { location: parameter.location, name: parameter.name },
          pointer: [...parameter.segments, "name"],
        });
      }
    }

    if (operation.method !== "GET") {
      continue;
    }

    const queryParameters = operation.parameters.filter(
      (parameter) => parameter.location === "query",
    );
    const style = getPaginationStyle(
      new Set(queryParameters.map((parameter) => parameter.name.toLowerCase())),
    );
    const styleParameter = queryParameters.find((parameter) => {
      const name = parameter.name.toLowerCase();

      return style === "cursor"
        ? CURSOR_PARAMETERS.has(name)
        : style === "offset"
          ? name === "offset" || name === "skip"
          : name.startsWith("page") && !PAGE_SIZE_PARAMETERS.has(name);
    });

    if (style && styleParameter) {
      paginationUsages.push({ operation, parameter: styleParameter, style });
    }

    const pageSizeParameter = queryParameters.find((parameter) =>
      PAGE_SIZE_PARAMETERS.has(parameter.name.toLowerCase()),
    );

    if (pageSizeParameter) {
      pageSizeUsages.push({ operation, parameter: pageSizeParameter });
    }
  }

  if (markChecked(context, "pagination-style", paginationUsages.length)) {
    const { distinctCount, dominant } = getDominantValue(
      paginationUsages.map((usage) => usage.style),
    );

    if (distinctCount > 1) {
      for (const usage of paginationUsages) {
        if (usage.style !== dominant) {
          reportViolation(context, "pagination-style", {
            method: usage.operation.method,
            params: { dominant, style: usage.style },
            path: usage.operation.path,
            pointer: [...usage.parameter.segments, "name"],
          });
        }
      }
    }
  }

  if (markChecked(context, "page-size-name", pageSizeUsages.length)) {
    const { distinctCount, dominant } = getDominantValue(
      pageSizeUsages.map((usage) => usage.parameter.name),
    );

    if (distinctCount > 1) {
      for (const usage of pageSizeUsages) {
        if (usage.parameter.name !== dominant) {
          reportViolation(context, "page-size-name", {
            method: usage.operation.method,
            params: { dominant, name: usage.parameter.name },
            path: usage.operation.path,
            pointer: [...usage.parameter.segments, "name"],
          });
        }
      }
    }
  }
}

function hasTypeInformation(schema: Record<string, unknown>) {
  return [
    "$ref",
    "allOf",
    "anyOf",
    "const",
    "enum",
    "items",
    "not",
    "oneOf",
    "properties",
    "type",
  ].some((keyword) => hasOwn(schema, keyword));
}

function getEnumCaseStyle(value: string) {
  if (!/[a-z]/i.test(value)) {
    return "";
  }

  if (value === value.toUpperCase()) {
    return "upper";
  }

  return value === value.toLowerCase() ? "lower" : "mixed";
}

function walkSchema(
  context: Context,
  schema: unknown,
  segments: Segments,
  owner: { method: string; path: string },
  visited: Set<string>,
  depth = 0,
) {
  if (!isRecord(schema) || depth > MAX_SCHEMA_DEPTH) {
    return;
  }

  const pointer = toJsonPointer(segments);

  if (visited.has(pointer)) {
    return;
  }

  visited.add(pointer);

  const { propertyCase } = context.config;

  if (Array.isArray(schema.enum) && markChecked(context, "enum-value-casing")) {
    const stringValues = schema.enum.filter(
      (value): value is string => typeof value === "string",
    );
    const styles = new Set(stringValues.map(getEnumCaseStyle).filter(Boolean));

    if (styles.size > 1) {
      reportViolation(context, "enum-value-casing", {
        ...owner,
        params: { values: stringValues.slice(0, 6).join(", ") },
        pointer: [...segments, "enum"],
      });
    }
  }

  if (isRecord(schema.properties)) {
    for (const [name, property] of Object.entries(schema.properties)) {
      const propertySegments = [...segments, "properties", name];

      // Hypermedia (`_links`), JSON-LD (`@id`), and namespaced keys follow
      // their own conventions rather than the API's property casing.
      if (
        !/^[_@$]/.test(name) &&
        !name.includes(":") &&
        markChecked(context, "property-casing") &&
        !matchesNamingConvention(name, propertyCase)
      ) {
        reportViolation(context, "property-casing", {
          ...owner,
          highlight: "key",
          params: {
            convention: propertyCase,
            name,
            suggestion: convertNameToConvention(name, propertyCase),
          },
          pointer: propertySegments,
        });
      }

      if (isRecord(property) && markChecked(context, "property-type")) {
        if (!hasTypeInformation(property)) {
          reportViolation(context, "property-type", {
            ...owner,
            highlight: "key",
            params: { name },
            pointer: propertySegments,
          });
        }
      }

      walkSchema(
        context,
        property,
        propertySegments,
        owner,
        visited,
        depth + 1,
      );
    }
  }

  if (isRecord(schema.items)) {
    walkSchema(
      context,
      schema.items,
      [...segments, "items"],
      owner,
      visited,
      depth + 1,
    );
  }

  if (isRecord(schema.additionalProperties)) {
    walkSchema(
      context,
      schema.additionalProperties,
      [...segments, "additionalProperties"],
      owner,
      visited,
      depth + 1,
    );
  }

  for (const keyword of ["allOf", "anyOf", "oneOf"]) {
    const children = schema[keyword];

    if (Array.isArray(children)) {
      children.forEach((child, index) =>
        walkSchema(
          context,
          child,
          [...segments, keyword, String(index)],
          owner,
          visited,
          depth + 1,
        ),
      );
    }
  }
}

function forEachMediaSchema(
  content: unknown,
  segments: Segments,
  callback: (
    schema: unknown,
    schemaSegments: Segments,
    mediaType: string,
  ) => void,
) {
  if (!isRecord(content)) {
    return;
  }

  for (const [mediaType, media] of Object.entries(content)) {
    if (isRecord(media) && media.schema !== undefined) {
      callback(media.schema, [...segments, mediaType, "schema"], mediaType);
    }
  }
}

function checkSchemas(context: Context, operations: Operation[]) {
  const visited = new Set<string>();
  const definitions = context.isSwagger2
    ? { schemas: context.root.definitions, segments: ["definitions"] }
    : {
        schemas: isRecord(context.root.components)
          ? context.root.components.schemas
          : undefined,
        segments: ["components", "schemas"],
      };
  const noOwner = { method: "", path: "" };

  if (isRecord(definitions.schemas)) {
    for (const [name, schema] of Object.entries(definitions.schemas)) {
      const segments = [...definitions.segments, name];

      if (
        markChecked(context, "schema-name-casing") &&
        !matchesNamingConvention(name, "PascalCase")
      ) {
        reportViolation(context, "schema-name-casing", {
          highlight: "key",
          params: {
            name,
            suggestion: convertNameToConvention(name, "PascalCase"),
          },
          pointer: segments,
        });
      }

      walkSchema(context, schema, segments, noOwner, visited);
    }
  }

  // Inline schemas are checked where they are written; referenced components
  // were already walked once above.
  for (const operation of operations) {
    const owner = { method: operation.method, path: operation.path };

    for (const parameter of operation.parameters) {
      walkSchema(
        context,
        parameter.node.schema,
        [...parameter.segments, "schema"],
        owner,
        visited,
      );
    }

    const requestBody = resolveNode(context.root, operation.node.requestBody, [
      ...operation.segments,
      "requestBody",
    ]);

    if (requestBody) {
      forEachMediaSchema(
        requestBody.node.content,
        [...requestBody.segments, "content"],
        (schema, segments) =>
          walkSchema(context, schema, segments, owner, visited),
      );
    }

    if (!isRecord(operation.node.responses)) {
      continue;
    }

    for (const [status, rawResponse] of Object.entries(
      operation.node.responses,
    )) {
      const response = resolveNode(context.root, rawResponse, [
        ...operation.segments,
        "responses",
        status,
      ]);

      if (!response) {
        continue;
      }

      if (context.isSwagger2) {
        walkSchema(
          context,
          response.node.schema,
          [...response.segments, "schema"],
          owner,
          visited,
        );
      } else {
        forEachMediaSchema(
          response.node.content,
          [...response.segments, "content"],
          (schema, segments) =>
            walkSchema(context, schema, segments, owner, visited),
        );
      }
    }
  }
}

function getSchemaIdentity(schema: unknown) {
  if (!isRecord(schema)) {
    return null;
  }

  if (typeof schema.$ref === "string") {
    const name = schema.$ref.split("/").at(-1) ?? schema.$ref;

    return {
      key: schema.$ref,
      label: name.replaceAll("~1", "/").replaceAll("~0", "~"),
    };
  }

  return { key: `inline:${JSON.stringify(schema)}`, label: "inline" };
}

function checkResponses(context: Context, operations: Operation[]) {
  const errorResponses: Array<{
    identity: { key: string; label: string };
    operation: Operation;
    status: string;
  }> = [];

  for (const operation of operations) {
    if (!isRecord(operation.node.responses)) {
      continue;
    }

    for (const [status, rawResponse] of Object.entries(
      operation.node.responses,
    )) {
      if (!/^(?:[45](?:\d\d|XX)|default)$/i.test(status)) {
        continue;
      }

      const response = resolveNode(context.root, rawResponse, [
        ...operation.segments,
        "responses",
        status,
      ]);

      if (!response) {
        continue;
      }

      let schema: unknown;

      if (context.isSwagger2) {
        schema = response.node.schema;
      } else if (isRecord(response.node.content)) {
        const jsonMedia = Object.entries(response.node.content).find(
          ([mediaType, media]) =>
            mediaType.toLowerCase().includes("json") && isRecord(media),
        );

        schema = jsonMedia
          ? (jsonMedia[1] as Record<string, unknown>).schema
          : undefined;
      }

      const identity = getSchemaIdentity(schema);

      if (identity) {
        errorResponses.push({ identity, operation, status });
      }
    }
  }

  if (
    !markChecked(context, "error-schema-consistency", errorResponses.length)
  ) {
    return;
  }

  const { distinctCount, dominant } = getDominantValue(
    errorResponses.map((response) => response.identity.key),
  );

  if (distinctCount < 2) {
    return;
  }

  const dominantLabel =
    errorResponses.find((response) => response.identity.key === dominant)
      ?.identity.label ?? "";

  for (const response of errorResponses) {
    if (response.identity.key !== dominant) {
      reportViolation(context, "error-schema-consistency", {
        highlight: "key",
        method: response.operation.method,
        params: {
          dominant: dominantLabel,
          schema: response.identity.label,
          status: response.status,
        },
        path: response.operation.path,
        pointer: [...response.operation.segments, "responses", response.status],
      });
    }
  }
}

function isInsecurePublicUrl(url: string) {
  if (!/^http:\/\//i.test(url.trim())) {
    return false;
  }

  try {
    const hostname = new URL(url.trim().replace(/\{[^}]*\}/g, "x")).hostname;

    return !isPrivateOrLocalHostname(hostname);
  } catch {
    return false;
  }
}

function checkDocument(context: Context, operations: Operation[]) {
  const { root } = context;

  if (context.isSwagger2) {
    const schemes = Array.isArray(root.schemes) ? root.schemes : [];
    const host = readString(root.host);

    if (host && markChecked(context, "server-https")) {
      if (schemes.includes("http") && isInsecurePublicUrl(`http://${host}`)) {
        reportViolation(context, "server-https", {
          params: { url: `http://${host}` },
          pointer: ["schemes"],
        });
      }
    }
  } else if (Array.isArray(root.servers)) {
    root.servers.forEach((server, index) => {
      const url = isRecord(server) ? readString(server.url) : "";

      if (
        url &&
        markChecked(context, "server-https") &&
        isInsecurePublicUrl(url)
      ) {
        reportViolation(context, "server-https", {
          params: { url },
          pointer: ["servers", String(index), "url"],
        });
      }
    });
  }

  const info = isRecord(root.info) ? root.info : {};

  for (const field of ["description", "contact", "license"]) {
    if (markChecked(context, "info-metadata")) {
      const value = info[field];

      if (value === undefined || (typeof value === "string" && !value.trim())) {
        reportViolation(context, "info-metadata", {
          highlight: "key",
          params: { field },
          pointer: ["info"],
        });
      }
    }
  }

  const declaredTags = Array.isArray(root.tags) ? root.tags : [];
  const declaredNames = new Set<string>();

  declaredTags.forEach((tag, index) => {
    const name = isRecord(tag) ? readString(tag.name) : "";

    if (!name) {
      return;
    }

    declaredNames.add(name);

    if (
      markChecked(context, "tag-description") &&
      !readString((tag as Record<string, unknown>).description).trim()
    ) {
      reportViolation(context, "tag-description", {
        params: { tag: name },
        pointer: ["tags", String(index), "name"],
      });
    }
  });

  const checkedTags = new Set<string>();

  for (const operation of operations) {
    const tags = Array.isArray(operation.node.tags) ? operation.node.tags : [];

    tags.forEach((tag, index) => {
      if (typeof tag !== "string" || checkedTags.has(tag)) {
        return;
      }

      checkedTags.add(tag);

      if (markChecked(context, "tag-declared") && !declaredNames.has(tag)) {
        reportViolation(context, "tag-declared", {
          method: operation.method,
          params: { tag },
          path: operation.path,
          pointer: [...operation.segments, "tags", String(index)],
        });
      }
    });
  }
}

export function createStyleGuideReport(
  root: Record<string, unknown>,
  config: StyleGuideConfig,
): StyleGuideReport {
  const normalizedConfig = normalizeStyleGuideConfig(config);
  const context: Context = {
    checked: new Map(),
    config: normalizedConfig,
    disabled: new Set(normalizedConfig.disabledRules),
    isSwagger2: typeof root.swagger === "string",
    root,
    seen: new Set(),
    truncated: false,
    violationCounts: new Map(),
    violations: [],
  };
  const operations = collectOperations(context);

  checkPaths(context, operations);
  checkOperations(context, operations);
  checkParameters(context, operations);
  checkSchemas(context, operations);
  checkResponses(context, operations);
  checkDocument(context, operations);

  const rules = STYLE_RULES.map((rule) => ({
    ...rule,
    checkedCount: context.checked.get(rule.id) ?? 0,
    enabled: !context.disabled.has(rule.id),
    violationCount: context.violationCounts.get(rule.id) ?? 0,
  }));
  const counts: Record<StyleSeverity, number> = {
    error: 0,
    info: 0,
    warning: 0,
  };
  let weightedTotal = 0;
  let weightedPassing = 0;

  for (const rule of rules) {
    counts[rule.severity] += rule.violationCount;

    if (!rule.enabled || rule.checkedCount === 0) {
      continue;
    }

    const weight = SEVERITY_WEIGHTS[rule.severity];

    weightedTotal += weight;
    weightedPassing +=
      weight * Math.max(0, 1 - rule.violationCount / rule.checkedCount);
  }

  const enabledRules = rules.filter((rule) => rule.enabled);

  return {
    counts,
    enabledRuleCount: enabledRules.length,
    passingRuleCount: enabledRules.filter((rule) => rule.violationCount === 0)
      .length,
    rules,
    score:
      weightedTotal === 0
        ? 100
        : Math.round((weightedPassing / weightedTotal) * 100),
    truncated: context.truncated,
    violations: context.violations,
  };
}
