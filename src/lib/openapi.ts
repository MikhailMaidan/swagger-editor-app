import YAML from "yaml";
import { buildCookieHeaderValue, buildRequestUrl } from "./request-url";

export type SchemaFormat = "json" | "yaml";

export type EndpointParameter = {
  name: string;
  location: "path" | "query" | "header" | "cookie";
};

export type CurlParameter = EndpointParameter & {
  value: string;
};

export type SchemaDetails = {
  type: string;
  properties: string[];
  example: string;
};

export type RequestBodySummary = {
  contentType: string;
  schema: SchemaDetails;
};

export type ResponseSummary = {
  status: string;
  description: string;
  contentTypes: string[];
  schema: SchemaDetails | null;
};

export type EndpointSummary = {
  curl: string;
  method: string;
  path: string;
  serverUrl: string;
  summary: string;
  description: string;
  parameters: EndpointParameter[];
  requestBodies: RequestBodySummary[];
  requestContentTypes: string[];
  responses: ResponseSummary[];
  responseStatuses: string[];
};

export type ParsedOpenApiSchema = {
  format: SchemaFormat;
  title: string;
  version: string;
  serverUrl: string;
  schema: Record<string, unknown>;
  endpoints: EndpointSummary[];
};

export type OpenApiParseResult =
  | {
      ok: true;
      value: ParsedOpenApiSchema;
    }
  | {
      ok: false;
      format: SchemaFormat;
      error: string;
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

export const DEFAULT_OPENAPI_SCHEMA = `openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
servers:
  - url: https://jsonplaceholder.typicode.com
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      summary: Get user by id
      parameters:
        - name: search
          in: query
          schema:
            type: string
        - name: X-Trace-Id
          in: header
          schema:
            type: string
        - name: sessionId
          in: cookie
          schema:
            type: string
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  name:
                    type: string
              example:
                id: "42"
                name: "Alex Smith"
        '404':
          description: User not found
    post:
      summary: Update user
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
            example:
              name: "Alex Smith"
      responses:
        '200':
          description: Updated user
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  name:
                    type: string`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isParameterLocation(
  value: unknown,
): value is EndpointParameter["location"] {
  return (
    value === "path" ||
    value === "query" ||
    value === "header" ||
    value === "cookie"
  );
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export const DEFAULT_SERVER_URL = "https://api.example.com";

function readSwagger2ServerUrl(schema: Record<string, unknown>) {
  const host = readString(schema.host);

  if (!host) {
    return null;
  }

  const schemes = Array.isArray(schema.schemes)
    ? schema.schemes.filter((scheme) => scheme === "http" || scheme === "https")
    : [];
  const scheme = schemes.includes("https")
    ? "https"
    : schemes[0] === "http"
      ? "http"
      : "https";
  const basePath = readString(schema.basePath);
  const normalizedBasePath = basePath && !basePath.startsWith("/")
    ? `/${basePath}`
    : basePath;

  return `${scheme}://${host}${normalizedBasePath}`;
}

function readServerUrl(schema: Record<string, unknown>) {
  if (Array.isArray(schema.servers)) {
    const firstServer = schema.servers.find(isRecord);

    if (firstServer) {
      return readString(firstServer.url, DEFAULT_SERVER_URL);
    }
  }

  return readSwagger2ServerUrl(schema) ?? DEFAULT_SERVER_URL;
}

function formatExample(value: unknown) {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function readSchemaDetails(value: unknown, example?: unknown): SchemaDetails {
  const schema = isRecord(value) ? value : {};
  const properties = isRecord(schema.properties)
    ? Object.keys(schema.properties)
    : [];

  return {
    example: formatExample(example ?? schema.example),
    properties,
    type: readString(schema.type, properties.length > 0 ? "object" : "unknown"),
  };
}

function normalizeParameters(value: unknown): EndpointParameter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<EndpointParameter[]>((parameters, parameter) => {
    if (!isRecord(parameter) || !isParameterLocation(parameter.in)) {
      return parameters;
    }

    parameters.push({
      location: parameter.in,
      name: readString(parameter.name, "Unnamed parameter"),
    });

    return parameters;
  }, []);
}

function mergeParameters(
  sharedParameters: EndpointParameter[],
  operationParameters: EndpointParameter[],
): EndpointParameter[] {
  const parametersByKey = new Map<string, EndpointParameter>();

  [...sharedParameters, ...operationParameters].forEach((parameter) => {
    parametersByKey.set(`${parameter.location}:${parameter.name}`, parameter);
  });

  return Array.from(parametersByKey.values());
}

function normalizeRequestBodies(value: unknown): RequestBodySummary[] {
  if (!isRecord(value)) {
    return [];
  }

  const content = isRecord(value.content) ? value.content : {};

  return Object.entries(content).reduce<RequestBodySummary[]>(
    (requestBodies, [contentType, contentConfig]) => {
      if (!isRecord(contentConfig)) {
        return requestBodies;
      }

      requestBodies.push({
        contentType,
        schema: readSchemaDetails(contentConfig.schema, contentConfig.example),
      });

      return requestBodies;
    },
    [],
  );
}

function normalizeResponses(value: unknown): ResponseSummary[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).reduce<ResponseSummary[]>(
    (responses, [status, responseConfig]) => {
      if (!isRecord(responseConfig)) {
        return responses;
      }

      const content = isRecord(responseConfig.content)
        ? responseConfig.content
        : {};
      const contentTypes = Object.keys(content);
      const firstContentType = contentTypes[0];
      const firstContent = firstContentType ? content[firstContentType] : null;
      const firstContentConfig = isRecord(firstContent) ? firstContent : null;

      responses.push({
        contentTypes,
        description: readString(responseConfig.description, "No description"),
        schema: firstContentConfig
          ? readSchemaDetails(
              firstContentConfig.schema,
              firstContentConfig.example,
            )
          : null,
        status,
      });

      return responses;
    },
    [],
  );
}

// Backslash, double quote, `$`, and backtick all have special meaning inside
// a double-quoted shell string; left raw, a header value containing any of
// them (e.g. `say "hi"`) produces a cURL command with an unterminated quote
// or, worse, one that runs `$(...)`/backtick command substitution if pasted
// into a real shell.
function escapeCurlDoubleQuoted(value: string) {
  return value.replace(/[\\"$`]/g, "\\$&");
}

export function createCurlPreview(
  method: string,
  path: string,
  hasRequestBody: boolean,
  serverUrl = "https://api.example.com",
  parameters: CurlParameter[] = [],
  requestBody = "",
  contentType = "application/json",
) {
  const url = buildRequestUrl(serverUrl, path, parameters);
  const parts = [`curl -X ${method}`, `"${url}"`];

  parameters
    .filter((parameter) => parameter.location === "header")
    .forEach((parameter) => {
      parts.push(
        `-H "${escapeCurlDoubleQuoted(parameter.name)}: ${escapeCurlDoubleQuoted(parameter.value)}"`,
      );
    });

  const cookieHeader = buildCookieHeaderValue(parameters);

  if (cookieHeader) {
    parts.push(`-H "Cookie: ${cookieHeader}"`);
  }

  if (hasRequestBody) {
    const body = requestBody.trim() || "{...}";

    parts.push(
      `-H "Content-Type: ${escapeCurlDoubleQuoted(contentType)}"`,
      `-d '${body.replaceAll("'", "'\\''")}'`,
    );
  }

  return parts.join(" \\\n  ");
}

export function detectSchemaFormat(schemaText: string): SchemaFormat {
  const trimmedText = schemaText.trim();

  if (trimmedText.startsWith("{") || trimmedText.startsWith("[")) {
    return "json";
  }

  return "yaml";
}

export function parseSchemaText(schemaText: string, format: SchemaFormat) {
  return format === "json" ? JSON.parse(schemaText) : YAML.parse(schemaText);
}

export function extractEndpoints(schema: Record<string, unknown>) {
  const paths = isRecord(schema.paths) ? schema.paths : {};
  const serverUrl = readServerUrl(schema);

  return Object.entries(paths).flatMap(([path, pathConfig]) => {
    if (!isRecord(pathConfig)) {
      return [];
    }

    const sharedParameters = normalizeParameters(pathConfig.parameters);

    return Object.entries(pathConfig).reduce<EndpointSummary[]>(
      (endpoints, [method, operation]) => {
        if (!HTTP_METHODS.has(method) || !isRecord(operation)) {
          return endpoints;
        }

        const requestBodies = normalizeRequestBodies(operation.requestBody);
        const responses = normalizeResponses(operation.responses);

        endpoints.push({
          curl: createCurlPreview(
            method.toUpperCase(),
            path,
            requestBodies.length > 0,
            serverUrl,
          ),
          description: readString(operation.description),
          method: method.toUpperCase(),
          parameters: mergeParameters(
            sharedParameters,
            normalizeParameters(operation.parameters),
          ),
          path,
          requestBodies,
          requestContentTypes: requestBodies.map(
            (requestBody) => requestBody.contentType,
          ),
          responses,
          responseStatuses: responses.map((response) => response.status),
          serverUrl,
          summary: readString(operation.summary, "Untitled endpoint"),
        });

        return endpoints;
      },
      [],
    );
  });
}

export function validateOpenApiSchema(value: unknown) {
  if (!isRecord(value)) {
    return "Schema must be an object.";
  }

  if (!value.openapi && !value.swagger) {
    return "Schema must include an openapi or swagger version.";
  }

  if (!isRecord(value.info) || !readString(value.info.title)) {
    return "Schema info.title is required.";
  }

  if (!isRecord(value.paths)) {
    return "Schema paths object is required.";
  }

  return "";
}

export function parseOpenApiSchema(schemaText: string): OpenApiParseResult {
  const format = detectSchemaFormat(schemaText);

  try {
    const parsedSchema = parseSchemaText(schemaText, format);
    const validationError = validateOpenApiSchema(parsedSchema);

    if (validationError) {
      return {
        error: validationError,
        format,
        ok: false,
      };
    }

    const schema = parsedSchema as Record<string, unknown>;
    const info = schema.info as Record<string, unknown>;
    const serverUrl = readServerUrl(schema);

    return {
      ok: true,
      value: {
        endpoints: extractEndpoints(schema),
        format,
        schema,
        serverUrl,
        title: readString(info.title, "Untitled API"),
        version: readString(info.version, "0.0.0"),
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to parse the OpenAPI schema.",
      format,
      ok: false,
    };
  }
}

export function formatOpenApiSchema(
  schema: Record<string, unknown>,
  format: SchemaFormat,
) {
  return format === "json"
    ? JSON.stringify(schema, null, 2)
    : YAML.stringify(schema);
}
