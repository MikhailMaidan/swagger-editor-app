import type { EndpointParameter, EndpointSummary } from "./openapi";
import {
  getSchemaTypeScriptName,
  getSchemaTypeScriptType,
  type SchemaModel,
} from "./schema-models";

export type TypeScriptClientOptions = {
  clientName?: string;
  includeDeprecated?: boolean;
  includeDocumentation?: boolean;
  includeUnusedModels?: boolean;
};

export type TypeScriptClientOperation = {
  deprecated: boolean;
  generatedName: boolean;
  method: string;
  name: string;
  path: string;
  requestType: string;
  responseType: string;
  summary: string;
};

export type TypeScriptClientBuild = {
  clientName: string;
  operations: TypeScriptClientOperation[];
  source: string;
  summary: {
    excludedDeprecatedCount: number;
    generatedNameCount: number;
    modelCount: number;
    operationCount: number;
  };
};

type MediaSchema = {
  contentType: string;
  schema: Record<string, unknown> | null;
  status?: string;
};

type OperationSchemas = {
  requestBodies: MediaSchema[];
  responses: MediaSchema[];
};

type GeneratedOperation = TypeScriptClientOperation & {
  accept: string;
  inputRequired: boolean;
  requestBodyContentTypes: string[];
  requestBodyRequired: boolean;
  requestBodyType: string;
};

const DEFAULT_OPTIONS: Required<TypeScriptClientOptions> = {
  clientName: "",
  includeDeprecated: true,
  includeDocumentation: true,
  includeUnusedModels: false,
};

const RESERVED_IDENTIFIERS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
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
    return null;
  }

  return decoded.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveLocalReference(
  rootSchema: Record<string, unknown>,
  reference: string,
) {
  if (!reference.startsWith("#/")) {
    return null;
  }

  let current: unknown = rootSchema;

  for (const rawSegment of reference.slice(2).split("/")) {
    const segment = decodePointerSegment(rawSegment);

    if (segment === null) {
      return null;
    }

    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else if (isRecord(current) && segment in current) {
      current = current[segment];
    } else {
      return null;
    }
  }

  return current;
}

function resolveReferenceObject(
  value: unknown,
  rootSchema: Record<string, unknown>,
  visited = new Set<string>(),
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const reference = readString(value.$ref);

  if (!reference || visited.has(reference)) {
    return value;
  }

  const resolved = resolveLocalReference(rootSchema, reference);

  if (!isRecord(resolved)) {
    return value;
  }

  visited.add(reference);

  return {
    ...resolveReferenceObject(resolved, rootSchema, visited),
    ...value,
  };
}

function splitWords(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean);
}

function toPascalCase(value: string, fallback: string) {
  const words = splitWords(value);
  const identifier = words
    .map((word) => {
      const normalizedWord =
        word.length > 1 && word === word.toUpperCase()
          ? word.toLowerCase()
          : word;

      return `${normalizedWord.charAt(0).toUpperCase()}${normalizedWord.slice(1)}`;
    })
    .join("");
  const normalized = identifier || fallback;

  return /^[A-Za-z_$]/.test(normalized) ? normalized : `_${normalized}`;
}

function toCamelCase(value: string, fallback: string) {
  const pascalName = toPascalCase(value, fallback);
  const identifier = `${pascalName.charAt(0).toLowerCase()}${pascalName.slice(1)}`;

  return RESERVED_IDENTIFIERS.has(identifier)
    ? `call${pascalName}`
    : identifier;
}

export function createDefaultTypeScriptClientName(title: string) {
  const titleName = toPascalCase(title, "Api");

  return `create${titleName.endsWith("Api") ? titleName : `${titleName}Api`}Client`;
}

export function normalizeTypeScriptClientName(value: string, title = "") {
  const trimmedValue = value.trim();
  const fallback = createDefaultTypeScriptClientName(title);

  if (!trimmedValue) {
    return fallback;
  }

  const identifier = toCamelCase(trimmedValue, "createApiClient");

  return RESERVED_IDENTIFIERS.has(identifier)
    ? `create${identifier}`
    : identifier;
}

function getClientTypePrefix(clientName: string) {
  const withoutCreate = clientName.replace(/^create(?=[A-Z_$])/, "");

  return toPascalCase(withoutCreate, "ApiClient");
}

function getOperationConfig(
  rootSchema: Record<string, unknown>,
  endpoint: EndpointSummary,
) {
  const paths = isRecord(rootSchema.paths) ? rootSchema.paths : {};
  const pathItem = resolveReferenceObject(paths[endpoint.path], rootSchema);
  const operation = resolveReferenceObject(
    pathItem[endpoint.method.toLowerCase()],
    rootSchema,
  );

  return { operation, pathItem };
}

function getContentSchemas(
  content: unknown,
  rootSchema: Record<string, unknown>,
  status?: string,
) {
  if (!isRecord(content)) {
    return [];
  }

  return Object.entries(content).map<MediaSchema>(
    ([contentType, rawMediaType]) => {
      const mediaType = resolveReferenceObject(rawMediaType, rootSchema);

      return {
        contentType,
        schema: isRecord(mediaType.schema) ? mediaType.schema : null,
        ...(status ? { status } : {}),
      };
    },
  );
}

function readRequestSchemas(
  rootSchema: Record<string, unknown>,
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
) {
  const requestBody = resolveReferenceObject(operation.requestBody, rootSchema);
  const openApiSchemas = getContentSchemas(requestBody.content, rootSchema);

  if (openApiSchemas.length > 0) {
    return {
      required: requestBody.required === true,
      schemas: openApiSchemas,
    };
  }

  const parameters = [pathItem.parameters, operation.parameters]
    .filter(Array.isArray)
    .flat() as unknown[];
  const bodyParameter = parameters
    .map((parameter) => resolveReferenceObject(parameter, rootSchema))
    .find((parameter) => readString(parameter.in) === "body");

  if (!bodyParameter || !isRecord(bodyParameter.schema)) {
    return { required: false, schemas: [] };
  }

  const contentTypes =
    readStringArray(operation.consumes).length > 0
      ? readStringArray(operation.consumes)
      : readStringArray(rootSchema.consumes).length > 0
        ? readStringArray(rootSchema.consumes)
        : ["application/json"];

  return {
    required: bodyParameter.required === true,
    schemas: contentTypes.map((contentType) => ({
      contentType,
      schema: bodyParameter.schema as Record<string, unknown>,
    })),
  };
}

function readResponseSchemas(
  rootSchema: Record<string, unknown>,
  operation: Record<string, unknown>,
) {
  if (!isRecord(operation.responses)) {
    return [];
  }

  return Object.entries(operation.responses).flatMap<MediaSchema>(
    ([status, rawResponse]) => {
      const response = resolveReferenceObject(rawResponse, rootSchema);
      const contentSchemas = getContentSchemas(
        response.content,
        rootSchema,
        status,
      );

      if (contentSchemas.length > 0) {
        return contentSchemas;
      }

      if (isRecord(response.schema)) {
        const contentTypes =
          readStringArray(operation.produces).length > 0
            ? readStringArray(operation.produces)
            : readStringArray(rootSchema.produces).length > 0
              ? readStringArray(rootSchema.produces)
              : ["application/json"];

        return contentTypes.map((contentType) => ({
          contentType,
          schema: response.schema as Record<string, unknown>,
          status,
        }));
      }

      return [{ contentType: "", schema: null, status }];
    },
  );
}

function readOperationSchemas(
  rootSchema: Record<string, unknown>,
  endpoint: EndpointSummary,
): OperationSchemas & { requestBodyRequired: boolean } {
  const { operation, pathItem } = getOperationConfig(rootSchema, endpoint);
  const request = readRequestSchemas(rootSchema, operation, pathItem);

  return {
    requestBodies: request.schemas,
    requestBodyRequired: request.required,
    responses: readResponseSchemas(rootSchema, operation),
  };
}

function quotePropertyName(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function getPropertyAccess(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    ? `.${name}`
    : `[${JSON.stringify(name)}]`;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function getSchemaTypes(
  schemas: MediaSchema[],
  rootSchema: Record<string, unknown>,
) {
  return unique(
    schemas.map(({ schema }) =>
      schema ? getSchemaTypeScriptType(schema, rootSchema) : "void",
    ),
  );
}

function isSuccessStatus(status: string) {
  return /^2(?:\d{2}|xx)$/i.test(status);
}

function getResponseDetails(
  schemas: MediaSchema[],
  rootSchema: Record<string, unknown>,
) {
  const successfulSchemas = schemas.filter((schema) =>
    isSuccessStatus(schema.status ?? ""),
  );
  const defaultSchemas = schemas.filter(
    (schema) => schema.status?.toLowerCase() === "default",
  );
  const selectedSchemas =
    successfulSchemas.length > 0
      ? successfulSchemas
      : defaultSchemas.length > 0
        ? defaultSchemas
        : schemas.slice(0, 1);
  const responseTypes = getSchemaTypes(selectedSchemas, rootSchema);

  return {
    accept:
      selectedSchemas.find((schema) => schema.contentType)?.contentType ?? "",
    type: responseTypes.join(" | ") || "unknown",
  };
}

function getParameterType(parameter: EndpointParameter) {
  if (parameter.enumValues && parameter.enumValues.length > 0) {
    if (parameter.type === "integer" || parameter.type === "number") {
      const numbers = parameter.enumValues
        .map(Number)
        .filter((value) => Number.isFinite(value));

      if (numbers.length === parameter.enumValues.length) {
        return unique(numbers.map(String)).join(" | ");
      }
    }

    if (parameter.type === "boolean") {
      const booleans = parameter.enumValues.filter(
        (value) => value === "true" || value === "false",
      );

      if (booleans.length === parameter.enumValues.length) {
        return unique(booleans).join(" | ");
      }
    }

    return unique(
      parameter.enumValues.map((value) => JSON.stringify(value)),
    ).join(" | ");
  }

  switch (parameter.type) {
    case "boolean":
      return "boolean";
    case "integer":
    case "number":
      return "number";
    case "array":
      return "ReadonlyArray<string | number | boolean>";
    default:
      return "string";
  }
}

function createPropertyBlock(parameters: EndpointParameter[]) {
  return `{ ${parameters
    .map(
      (parameter) =>
        `${quotePropertyName(parameter.name)}${parameter.required ? "" : "?"}: ${getParameterType(parameter)};`,
    )
    .join(" ")} }`;
}

function getPathParameters(endpoint: EndpointSummary) {
  const documentedParameters = endpoint.parameters.filter(
    (parameter) => parameter.location === "path",
  );
  const documentedNames = new Set(
    documentedParameters.map((parameter) => parameter.name),
  );
  const missingParameters = Array.from(
    endpoint.path.matchAll(/\{([^{}]+)\}/g),
    (match) => match[1],
  )
    .filter((name) => !documentedNames.has(name))
    .map<EndpointParameter>((name) => ({
      description: "",
      example: "",
      location: "path",
      name,
      required: true,
      type: "string",
    }));

  return [...documentedParameters, ...missingParameters].map((parameter) => ({
    ...parameter,
    required: true,
  }));
}

function createRequestInterface(
  endpoint: EndpointSummary,
  operation: GeneratedOperation,
  typePrefix: string,
) {
  const lines = [`export interface ${operation.requestType} {`];
  const locationGroups = [
    ["path", getPathParameters(endpoint)],
    [
      "query",
      endpoint.parameters.filter((parameter) => parameter.location === "query"),
    ],
    [
      "headers",
      endpoint.parameters.filter(
        (parameter) => parameter.location === "header",
      ),
    ],
    [
      "cookies",
      endpoint.parameters.filter(
        (parameter) => parameter.location === "cookie",
      ),
    ],
  ] as const;

  locationGroups.forEach(([property, parameters]) => {
    if (parameters.length === 0 && property !== "headers") {
      return;
    }

    const isRequired = parameters.some((parameter) => parameter.required);
    const parameterType =
      parameters.length > 0 ? createPropertyBlock(parameters) : "{}";
    const type =
      property === "headers"
        ? `${typePrefix}HeaderValues & ${parameterType}`
        : parameterType;

    lines.push(`  ${property}${isRequired ? "" : "?"}: ${type};`);
  });

  if (operation.requestBodyContentTypes.length > 0) {
    lines.push(
      `  body${operation.requestBodyRequired ? "" : "?"}: ${operation.requestBodyType};`,
      `  contentType?: ${operation.requestBodyContentTypes
        .map((contentType) => JSON.stringify(contentType))
        .join(" | ")};`,
    );
  }

  lines.push("  accept?: string;", "  signal?: AbortSignal;", "}");

  return lines.join("\n");
}

function deriveOperationName(endpoint: EndpointSummary) {
  if (endpoint.operationId.trim()) {
    return toCamelCase(endpoint.operationId, endpoint.method.toLowerCase());
  }

  const pathName = endpoint.path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const parameterMatch = segment.match(/^\{([^{}]+)\}$/);

      return parameterMatch
        ? `By ${parameterMatch[1]}`
        : segment.replace(/[{}]/g, " ");
    })
    .join(" ");

  return toCamelCase(
    `${endpoint.method.toLowerCase()} ${pathName || "root"}`,
    "request",
  );
}

function sanitizeComment(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replaceAll("*/", "* /")
    .trim();
}

function createDocumentation(
  endpoint: EndpointSummary,
  includeDocumentation: boolean,
  indentation = "",
) {
  if (!includeDocumentation && !endpoint.deprecated) {
    return [];
  }

  const summary = sanitizeComment(endpoint.summary);
  const description = sanitizeComment(endpoint.description);
  const lines = [`${indentation}/**`];

  if (includeDocumentation && (summary || description)) {
    lines.push(`${indentation} * ${summary || description}`);
  }

  if (endpoint.deprecated) {
    lines.push(`${indentation} * @deprecated`);
  }

  lines.push(`${indentation} */`);
  return lines;
}

function createOperationMethod(
  endpoint: EndpointSummary,
  operation: GeneratedOperation,
) {
  const input = operation.inputRequired
    ? `input: ${operation.requestType}`
    : `input: ${operation.requestType} = {}`;
  const lines = [
    `    async ${operation.name}(${input}): Promise<${operation.responseType}> {`,
    `      let path = ${JSON.stringify(endpoint.path)};`,
  ];

  getPathParameters(endpoint).forEach((parameter) => {
    lines.push(
      `      path = path.replace(${JSON.stringify(`{${parameter.name}}`)}, encodeURIComponent(String(input.path${getPropertyAccess(parameter.name)})));`,
    );
  });

  lines.push(
    `      return request<${operation.responseType}>(${JSON.stringify(
      endpoint.method,
    )}, path, {`,
  );

  if (operation.accept) {
    lines.push(
      `        accept: input.accept ?? ${JSON.stringify(operation.accept)},`,
    );
  } else {
    lines.push("        accept: input.accept,");
  }

  if (operation.requestBodyContentTypes.length > 0) {
    lines.push(
      "        body: input.body,",
      `        contentType: input.contentType ?? ${JSON.stringify(operation.requestBodyContentTypes[0])},`,
    );
  }

  if (
    endpoint.parameters.some((parameter) => parameter.location === "cookie")
  ) {
    lines.push("        cookies: input.cookies,");
  }

  lines.push("        headers: input.headers,");

  if (endpoint.parameters.some((parameter) => parameter.location === "query")) {
    lines.push("        query: input.query,");
  }

  lines.push("        signal: input.signal,", "      });", "    }");

  return lines;
}

function createRuntime(
  typePrefix: string,
  clientName: string,
  baseUrl: string,
) {
  return `export type ${typePrefix}ParameterValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<string | number | boolean>;

export type ${typePrefix}HeaderValues = Record<
  string,
  string | number | boolean | undefined
>;

type ${typePrefix}RequestConfig = {
  accept?: string;
  body?: unknown;
  contentType?: string;
  cookies?: Record<string, ${typePrefix}ParameterValue>;
  headers?: ${typePrefix}HeaderValues;
  query?: Record<string, ${typePrefix}ParameterValue>;
  signal?: AbortSignal;
};

export interface ${typePrefix}Options {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
}

export class ${typePrefix}Error extends Error {
  readonly body: unknown;
  readonly status: number;

  constructor(status: number, statusText: string, body: unknown) {
    super(\`Request failed with \${status} \${statusText}\`);
    this.name = ${JSON.stringify(`${typePrefix}Error`)};
    this.body = body;
    this.status = status;
  }
}

export function ${clientName}(options: ${typePrefix}Options = {}) {
  const baseUrl = (options.baseUrl ?? ${JSON.stringify(baseUrl || "http://localhost")}).replace(/\\/+$/, "");
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    method: string,
    path: string,
    config: ${typePrefix}RequestConfig = {},
  ): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : \`/\${path}\`;
    const url = new URL(\`\${baseUrl}\${normalizedPath}\`);

    Object.entries(config.query ?? {}).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((item) => url.searchParams.append(name, String(item)));
    });

    const headers = new Headers(options.headers);
    Object.entries(config.headers ?? {}).forEach(([name, value]) => {
      if (value !== undefined) headers.set(name, String(value));
    });

    const cookieHeader = Object.entries(config.cookies ?? {})
      .filter((entry) => entry[1] !== undefined && entry[1] !== null)
      .map(([name, value]) => \`\${encodeURIComponent(name)}=\${encodeURIComponent(String(value))}\`)
      .join("; ");

    if (cookieHeader && !headers.has("Cookie")) headers.set("Cookie", cookieHeader);
    if (config.accept && !headers.has("Accept")) headers.set("Accept", config.accept);
    if (config.body !== undefined && config.contentType && !headers.has("Content-Type")) {
      headers.set("Content-Type", config.contentType);
    }

    const isJsonBody = config.contentType?.toLowerCase().includes("json");
    const body =
      config.body === undefined
        ? undefined
        : typeof config.body === "string" || !isJsonBody
          ? (config.body as BodyInit)
          : JSON.stringify(config.body);
    const response = await fetcher(url, {
      body,
      headers,
      method,
      signal: config.signal,
    });
    const text = await response.text();
    let data: unknown;

    if (text) {
      try {
        data = response.headers.get("content-type")?.toLowerCase().includes("json")
          ? JSON.parse(text)
          : text;
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw new ${typePrefix}Error(response.status, response.statusText, data);
    }

    return data as T;
  }

  return {`;
}

function selectModels(
  models: SchemaModel[],
  endpoints: EndpointSummary[],
  operations: GeneratedOperation[],
  includeUnusedModels: boolean,
) {
  if (includeUnusedModels) {
    return models;
  }

  const endpointKeys = new Set(
    endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
  );
  const operationTypes = operations
    .flatMap((operation) => [operation.requestBodyType, operation.responseType])
    .join(" ");
  const selectedNames = new Set(
    models
      .filter(
        (model) =>
          model.usages.some((usage) =>
            endpointKeys.has(`${usage.method} ${usage.path}`),
          ) || operationTypes.includes(getSchemaTypeScriptName(model.name)),
      )
      .map((model) => model.name),
  );
  const modelByName = new Map(models.map((model) => [model.name, model]));
  const pending = [...selectedNames];

  while (pending.length > 0) {
    const model = modelByName.get(pending.shift() as string);

    model?.references.forEach((reference) => {
      if (!selectedNames.has(reference)) {
        selectedNames.add(reference);
        pending.push(reference);
      }
    });
  }

  return models.filter((model) => selectedNames.has(model.name));
}

export function createTypeScriptClient(
  endpoints: EndpointSummary[],
  models: SchemaModel[],
  rootSchema: Record<string, unknown>,
  schema: { serverUrl: string; title: string; version: string },
  rawOptions: TypeScriptClientOptions = {},
): TypeScriptClientBuild {
  const options = { ...DEFAULT_OPTIONS, ...rawOptions };
  const clientName = normalizeTypeScriptClientName(
    options.clientName,
    schema.title,
  );
  const typePrefix = getClientTypePrefix(clientName);
  const includedEndpoints = options.includeDeprecated
    ? endpoints
    : endpoints.filter((endpoint) => !endpoint.deprecated);
  const usedOperationNames = new Set<string>();
  const generatedOperations = includedEndpoints.map<GeneratedOperation>(
    (endpoint) => {
      const baseName = deriveOperationName(endpoint);
      let name = baseName;
      let duplicateIndex = 2;

      while (usedOperationNames.has(name)) {
        name = `${baseName}${duplicateIndex}`;
        duplicateIndex += 1;
      }

      usedOperationNames.add(name);

      const operationSchemas = readOperationSchemas(rootSchema, endpoint);
      const requestBodyTypes = getSchemaTypes(
        operationSchemas.requestBodies,
        rootSchema,
      ).filter((type) => type !== "void");
      const response = getResponseDetails(
        operationSchemas.responses,
        rootSchema,
      );
      const requestType = `${typePrefix}${toPascalCase(name, "Request")}Request`;
      const requestBodyType = requestBodyTypes.join(" | ") || "unknown";
      const hasRequiredParameter = [
        ...getPathParameters(endpoint),
        ...endpoint.parameters.filter(
          (parameter) => parameter.location !== "path",
        ),
      ].some((parameter) => parameter.required);

      return {
        accept: response.accept,
        deprecated: endpoint.deprecated,
        generatedName:
          !endpoint.operationId.trim() || name !== endpoint.operationId.trim(),
        inputRequired:
          hasRequiredParameter || operationSchemas.requestBodyRequired,
        method: endpoint.method,
        name,
        path: endpoint.path,
        requestBodyContentTypes: unique(
          operationSchemas.requestBodies.map((body) => body.contentType),
        ),
        requestBodyRequired: operationSchemas.requestBodyRequired,
        requestBodyType,
        requestType,
        responseType: response.type,
        summary: endpoint.summary,
      };
    },
  );
  const selectedModels = selectModels(
    models,
    includedEndpoints,
    generatedOperations,
    options.includeUnusedModels,
  );
  const title = sanitizeComment(schema.title) || "OpenAPI schema";
  const version = sanitizeComment(schema.version);
  const sourceLabel = version ? `${title} v${version}` : title;
  const lines = [
    `// Generated from ${sourceLabel} by RSSwag.`,
    "// This client has no runtime dependencies and uses the global Fetch API.",
    "",
  ];

  if (selectedModels.length > 0) {
    lines.push(
      selectedModels.map((model) => model.typeScript).join("\n\n"),
      "",
    );
  }

  generatedOperations.forEach((operation, index) => {
    lines.push(
      ...createDocumentation(
        includedEndpoints[index],
        options.includeDocumentation,
      ),
      createRequestInterface(includedEndpoints[index], operation, typePrefix),
      "",
    );
  });

  lines.push(createRuntime(typePrefix, clientName, schema.serverUrl));

  generatedOperations.forEach((operation, index) => {
    lines.push(
      ...createDocumentation(
        includedEndpoints[index],
        options.includeDocumentation,
        "    ",
      ),
      ...createOperationMethod(includedEndpoints[index], operation)
        .map((line) => `${line},`)
        .map((line, lineIndex, methodLines) =>
          lineIndex === methodLines.length - 1 ? line : line.replace(/,$/, ""),
        ),
    );
  });

  lines.push(
    "  };",
    "}",
    "",
    `export type ${typePrefix} = ReturnType<typeof ${clientName}>;`,
    "",
  );

  const operations = generatedOperations.map<TypeScriptClientOperation>(
    ({
      deprecated,
      generatedName,
      method,
      name,
      path,
      requestType,
      responseType,
      summary,
    }) => ({
      deprecated,
      generatedName,
      method,
      name,
      path,
      requestType,
      responseType,
      summary,
    }),
  );

  return {
    clientName,
    operations,
    source: lines.join("\n"),
    summary: {
      excludedDeprecatedCount: endpoints.length - includedEndpoints.length,
      generatedNameCount: operations.filter(
        (operation) => operation.generatedName,
      ).length,
      modelCount: selectedModels.length,
      operationCount: operations.length,
    },
  };
}
