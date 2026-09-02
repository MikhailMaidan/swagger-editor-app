import type { EndpointSummary } from "./openapi";

export type ApiEventKind = "callback" | "webhook";

export type ApiEventIssueCode =
  | "external-reference"
  | "missing-documentation"
  | "missing-operation-id"
  | "missing-responses"
  | "unresolved-reference";

export type ApiEventFindingCode =
  "empty-channel" | "external-reference" | "unresolved-reference";

export type ApiEventSource = {
  method: string;
  operationId: string;
  path: string;
  summary: string;
};

export type ApiEventPayload = {
  contentType: string;
  description: string;
  example: string;
  required: boolean;
  schemaName: string;
  schemaType: string;
};

export type ApiEventResponse = {
  contentTypes: string[];
  description: string;
  status: string;
};

export type ApiEventOperation = {
  deprecated: boolean;
  description: string;
  expression: string;
  issueCodes: ApiEventIssueCode[];
  key: string;
  kind: ApiEventKind;
  method: string;
  name: string;
  operationId: string;
  payloads: ApiEventPayload[];
  referenceIssues: string[];
  responses: ApiEventResponse[];
  securityRequirements: string[];
  source: ApiEventSource | null;
  summary: string;
  tags: string[];
};

export type ApiEventFinding = {
  code: ApiEventFindingCode;
  expression: string;
  kind: ApiEventKind;
  name: string;
  reference: string;
  source: ApiEventSource | null;
};

export type ApiEventReport = {
  brokenReferenceCount: number;
  callbackOperationCount: number;
  channelCount: number;
  documentedOperationCount: number;
  findings: ApiEventFinding[];
  issueOperationCount: number;
  operations: ApiEventOperation[];
  payloadOperationCount: number;
  totalOperationCount: number;
  webhookOperationCount: number;
};

type ReferenceIssue = "external-reference" | "unresolved-reference";

type ReferenceResolution = {
  issue: ReferenceIssue | null;
  reference: string;
  value: Record<string, unknown> | null;
};

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function decodePointerSegment(value: string) {
  let decoded = value;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Leave malformed fragments intact so they can be reported to the user.
  }

  return decoded.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolvePointer(root: Record<string, unknown>, reference: string) {
  if (!reference.startsWith("#/")) {
    return null;
  }

  const segments = reference.slice(2).split("/").map(decodePointerSegment);
  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

function resolveObjectReference(
  root: Record<string, unknown>,
  value: unknown,
): ReferenceResolution {
  if (!isRecord(value)) {
    return { issue: "unresolved-reference", reference: "", value: null };
  }

  let current = value;
  let firstReference = "";
  const visited = new Set<string>();

  while (true) {
    const reference = readString(current.$ref);

    if (!reference) {
      return { issue: null, reference: firstReference, value: current };
    }

    firstReference ||= reference;

    if (!reference.startsWith("#/")) {
      return {
        issue: "external-reference",
        reference,
        value: null,
      };
    }

    if (visited.has(reference)) {
      return {
        issue: "unresolved-reference",
        reference,
        value: null,
      };
    }

    const resolved = resolvePointer(root, reference);

    if (!isRecord(resolved)) {
      return {
        issue: "unresolved-reference",
        reference,
        value: null,
      };
    }

    visited.add(reference);
    current = resolved;
  }
}

function readSecurityRequirements(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.flatMap((requirement) =>
        isRecord(requirement) ? Object.keys(requirement) : [],
      ),
    ),
  );
}

function readSchemaName(value: unknown) {
  if (!isRecord(value)) {
    return "";
  }

  const reference = readString(value.$ref);

  if (!reference) {
    return readString(value.title);
  }

  return decodePointerSegment(reference.split("/").at(-1) ?? "");
}

function inferSchemaType(schema: Record<string, unknown>) {
  const type = readString(schema.type);

  if (type) {
    return type;
  }

  if (isRecord(schema.properties)) {
    return "object";
  }

  if (schema.items) {
    return "array";
  }

  return "unknown";
}

function createStringExample(schema: Record<string, unknown>) {
  const format = readString(schema.format);

  if (format === "date") {
    return "2026-01-01";
  }

  if (format === "date-time") {
    return "2026-01-01T00:00:00Z";
  }

  if (format === "email") {
    return "user@example.com";
  }

  if (format === "uuid") {
    return "00000000-0000-4000-8000-000000000000";
  }

  if (format === "uri" || format === "url") {
    return "https://example.com";
  }

  return "string";
}

function createSchemaExample(
  schemaValue: unknown,
  root: Record<string, unknown>,
  visitedReferences = new Set<string>(),
  depth = 0,
): unknown {
  if (!isRecord(schemaValue) || depth > 6) {
    return null;
  }

  if (schemaValue.example !== undefined) {
    return schemaValue.example;
  }

  if (schemaValue.const !== undefined) {
    return schemaValue.const;
  }

  if (schemaValue.default !== undefined) {
    return schemaValue.default;
  }

  if (Array.isArray(schemaValue.enum) && schemaValue.enum.length > 0) {
    return schemaValue.enum[0];
  }

  const reference = readString(schemaValue.$ref);

  if (reference) {
    if (visitedReferences.has(reference)) {
      return null;
    }

    const resolved = resolveObjectReference(root, schemaValue);

    if (!resolved.value) {
      return null;
    }

    const nextVisited = new Set(visitedReferences);
    nextVisited.add(reference);
    return createSchemaExample(resolved.value, root, nextVisited, depth + 1);
  }

  const alternatives = [schemaValue.oneOf, schemaValue.anyOf].find(
    (value) => Array.isArray(value) && value.length > 0,
  );

  if (Array.isArray(alternatives)) {
    return createSchemaExample(
      alternatives[0],
      root,
      visitedReferences,
      depth + 1,
    );
  }

  if (Array.isArray(schemaValue.allOf)) {
    const values = schemaValue.allOf.map((part) =>
      createSchemaExample(part, root, visitedReferences, depth + 1),
    );

    if (values.every(isRecord)) {
      return Object.assign({}, ...values);
    }

    return values.find((value) => value !== null) ?? null;
  }

  const type = inferSchemaType(schemaValue);

  if (type === "object") {
    const properties = isRecord(schemaValue.properties)
      ? schemaValue.properties
      : {};

    return Object.fromEntries(
      Object.entries(properties).map(([name, propertySchema]) => [
        name,
        createSchemaExample(propertySchema, root, visitedReferences, depth + 1),
      ]),
    );
  }

  if (type === "array") {
    return [
      createSchemaExample(
        schemaValue.items,
        root,
        visitedReferences,
        depth + 1,
      ),
    ];
  }

  if (type === "integer" || type === "number") {
    return typeof schemaValue.minimum === "number" ? schemaValue.minimum : 0;
  }

  if (type === "boolean") {
    return true;
  }

  if (type === "string") {
    return createStringExample(schemaValue);
  }

  return null;
}

function formatExample(value: unknown, contentType: string) {
  if (value === undefined || value === null) {
    return "";
  }

  if (
    typeof value === "string" &&
    !contentType.toLowerCase().includes("json")
  ) {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readMediaExample(
  media: Record<string, unknown>,
  schema: unknown,
  root: Record<string, unknown>,
) {
  if (media.example !== undefined) {
    return media.example;
  }

  if (isRecord(media.examples)) {
    for (const rawExample of Object.values(media.examples)) {
      const example = resolveObjectReference(root, rawExample);

      if (example.value) {
        if (example.value.value !== undefined) {
          return example.value.value;
        }

        if (example.value.serializedValue !== undefined) {
          return example.value.serializedValue;
        }
      }
    }
  }

  return createSchemaExample(schema, root);
}

function addReferenceIssue(
  issueCodes: ApiEventIssueCode[],
  referenceIssues: string[],
  resolution: ReferenceResolution,
) {
  if (!resolution.issue) {
    return;
  }

  if (!issueCodes.includes(resolution.issue)) {
    issueCodes.push(resolution.issue);
  }

  if (resolution.reference && !referenceIssues.includes(resolution.reference)) {
    referenceIssues.push(resolution.reference);
  }
}

function readPayloads(
  operation: Record<string, unknown>,
  root: Record<string, unknown>,
  issueCodes: ApiEventIssueCode[],
  referenceIssues: string[],
) {
  if (!operation.requestBody) {
    return [];
  }

  const requestBody = resolveObjectReference(root, operation.requestBody);
  addReferenceIssue(issueCodes, referenceIssues, requestBody);

  if (!requestBody.value || !isRecord(requestBody.value.content)) {
    return [];
  }

  return Object.entries(requestBody.value.content).flatMap(
    ([contentType, rawMedia]) => {
      if (!isRecord(rawMedia)) {
        return [];
      }

      const rawSchema = rawMedia.schema;
      const schemaResolution = resolveObjectReference(root, rawSchema);

      if (rawSchema) {
        addReferenceIssue(issueCodes, referenceIssues, schemaResolution);
      }

      const schema =
        schemaResolution.value ?? (isRecord(rawSchema) ? rawSchema : {});

      return [
        {
          contentType,
          description: readString(requestBody.value?.description),
          example: formatExample(
            readMediaExample(rawMedia, rawSchema, root),
            contentType,
          ),
          required: requestBody.value?.required === true,
          schemaName: readSchemaName(rawSchema),
          schemaType: inferSchemaType(schema),
        },
      ];
    },
  );
}

function readResponses(
  operation: Record<string, unknown>,
  root: Record<string, unknown>,
  issueCodes: ApiEventIssueCode[],
  referenceIssues: string[],
) {
  if (!isRecord(operation.responses)) {
    return [];
  }

  return Object.entries(operation.responses).flatMap(
    ([status, rawResponse]) => {
      const response = resolveObjectReference(root, rawResponse);
      addReferenceIssue(issueCodes, referenceIssues, response);

      if (!response.value) {
        return [];
      }

      return [
        {
          contentTypes: isRecord(response.value.content)
            ? Object.keys(response.value.content)
            : [],
          description: readString(response.value.description),
          status,
        },
      ];
    },
  );
}

function createSource(
  path: string,
  method: string,
  operation: Record<string, unknown>,
  endpointByKey: Map<string, EndpointSummary>,
): ApiEventSource {
  const endpoint = endpointByKey.get(`${method.toUpperCase()} ${path}`);

  return endpoint
    ? {
        method: endpoint.method,
        operationId: endpoint.operationId,
        path: endpoint.path,
        summary: endpoint.summary,
      }
    : {
        method: method.toUpperCase(),
        operationId: readString(operation.operationId),
        path,
        summary:
          readString(operation.summary) || `${method.toUpperCase()} ${path}`,
      };
}

export function createApiEventReport(
  schema: Record<string, unknown>,
  endpoints: EndpointSummary[],
): ApiEventReport {
  const operations: ApiEventOperation[] = [];
  const findings: ApiEventFinding[] = [];
  const channels = new Set<string>();
  const endpointByKey = new Map(
    endpoints.map((endpoint) => [
      `${endpoint.method.toUpperCase()} ${endpoint.path}`,
      endpoint,
    ]),
  );

  function addFinding(
    code: ApiEventFindingCode,
    kind: ApiEventKind,
    name: string,
    expression: string,
    reference: string,
    source: ApiEventSource | null,
  ) {
    findings.push({ code, expression, kind, name, reference, source });
  }

  function collectPathItem(
    rawPathItem: unknown,
    kind: ApiEventKind,
    name: string,
    expression: string,
    source: ApiEventSource | null,
  ) {
    const pathItem = resolveObjectReference(schema, rawPathItem);

    if (!pathItem.value) {
      addFinding(
        pathItem.issue ?? "unresolved-reference",
        kind,
        name,
        expression,
        pathItem.reference,
        source,
      );
      return;
    }

    let operationCount = 0;

    Object.entries(pathItem.value).forEach(([method, rawOperation]) => {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !isRecord(rawOperation)) {
        return;
      }

      operationCount += 1;
      const operation = rawOperation;
      const issueCodes: ApiEventIssueCode[] = [];
      const referenceIssues: string[] = [];
      const summary =
        readString(operation.summary) || readString(pathItem.value?.summary);
      const description =
        readString(operation.description) ||
        readString(pathItem.value?.description);
      const operationId = readString(operation.operationId);

      if (!operationId) {
        issueCodes.push("missing-operation-id");
      }

      if (!summary && !description) {
        issueCodes.push("missing-documentation");
      }

      const responses = readResponses(
        operation,
        schema,
        issueCodes,
        referenceIssues,
      );

      if (responses.length === 0) {
        issueCodes.push("missing-responses");
      }

      operations.push({
        deprecated: operation.deprecated === true,
        description,
        expression,
        issueCodes,
        key: [
          kind,
          source ? `${source.method} ${source.path}` : "independent",
          name,
          expression,
          method.toUpperCase(),
          operations.length,
        ].join("\u0000"),
        kind,
        method: method.toUpperCase(),
        name,
        operationId,
        payloads: readPayloads(operation, schema, issueCodes, referenceIssues),
        referenceIssues,
        responses,
        securityRequirements: readSecurityRequirements(
          "security" in operation ? operation.security : schema.security,
        ),
        source,
        summary,
        tags: readStringArray(operation.tags),
      });
    });

    if (operationCount === 0) {
      addFinding("empty-channel", kind, name, expression, "", source);
    }
  }

  const paths = isRecord(schema.paths) ? schema.paths : {};

  Object.entries(paths).forEach(([path, rawPathItem]) => {
    const pathItem = resolveObjectReference(schema, rawPathItem);

    if (!pathItem.value) {
      return;
    }

    Object.entries(pathItem.value).forEach(([method, rawOperation]) => {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !isRecord(rawOperation)) {
        return;
      }

      const operation = rawOperation;

      if (!isRecord(operation.callbacks)) {
        return;
      }

      const source = createSource(path, method, operation, endpointByKey);

      Object.entries(operation.callbacks).forEach(
        ([callbackName, rawCallback]) => {
          const callback = resolveObjectReference(schema, rawCallback);

          if (!callback.value) {
            channels.add(
              `callback\u0000${source.method} ${source.path}\u0000${callbackName}`,
            );
            addFinding(
              callback.issue ?? "unresolved-reference",
              "callback",
              callbackName,
              "",
              callback.reference,
              source,
            );
            return;
          }

          const expressions = Object.entries(callback.value).filter(
            ([expression]) =>
              expression !== "$ref" && !expression.startsWith("x-"),
          );

          if (expressions.length === 0) {
            channels.add(
              `callback\u0000${source.method} ${source.path}\u0000${callbackName}`,
            );
            addFinding(
              "empty-channel",
              "callback",
              callbackName,
              "",
              "",
              source,
            );
            return;
          }

          expressions.forEach(([expression, callbackPathItem]) => {
            channels.add(
              `callback\u0000${source.method} ${source.path}\u0000${callbackName}\u0000${expression}`,
            );
            collectPathItem(
              callbackPathItem,
              "callback",
              callbackName,
              expression,
              source,
            );
          });
        },
      );
    });
  });

  const webhooks = isRecord(schema.webhooks) ? schema.webhooks : {};

  Object.entries(webhooks).forEach(([webhookName, rawPathItem]) => {
    channels.add(`webhook\u0000${webhookName}`);
    collectPathItem(rawPathItem, "webhook", webhookName, "", null);
  });

  const callbackOperationCount = operations.filter(
    (operation) => operation.kind === "callback",
  ).length;
  const webhookOperationCount = operations.filter(
    (operation) => operation.kind === "webhook",
  ).length;

  return {
    brokenReferenceCount:
      findings.filter(
        (finding) =>
          finding.code === "external-reference" ||
          finding.code === "unresolved-reference",
      ).length +
      operations.filter((operation) =>
        operation.issueCodes.some(
          (code) =>
            code === "external-reference" || code === "unresolved-reference",
        ),
      ).length,
    callbackOperationCount,
    channelCount: channels.size,
    documentedOperationCount: operations.filter(
      (operation) => operation.summary || operation.description,
    ).length,
    findings,
    issueOperationCount: operations.filter(
      (operation) => operation.issueCodes.length > 0,
    ).length,
    operations,
    payloadOperationCount: operations.filter(
      (operation) => operation.payloads.length > 0,
    ).length,
    totalOperationCount: operations.length,
    webhookOperationCount,
  };
}
