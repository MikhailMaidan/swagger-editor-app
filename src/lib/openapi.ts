import YAML from "yaml";

export type SchemaFormat = "json" | "yaml";

export type EndpointParameter = {
  name: string;
  location: "path" | "query" | "header" | "cookie";
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
      const firstContent =
        firstContentType && isRecord(content[firstContentType])
          ? content[firstContentType]
          : null;

      if (firstContent && !isRecord(firstContent)) {
        return responses;
      }

      const firstContentConfig = firstContent as Record<string, unknown> | null;

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

export function createCurlPreview(
  method: string,
  path: string,
  hasRequestBody: boolean,
) {
  const parts = [`curl -X ${method}`, `"https://api.example.com${path}"`];

  if (hasRequestBody) {
    parts.push('-H "Content-Type: application/json"', "-d '{...}'");
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
          ),
          description: readString(operation.description),
          method: method.toUpperCase(),
          parameters: [
            ...sharedParameters,
            ...normalizeParameters(operation.parameters),
          ],
          path,
          requestBodies,
          requestContentTypes: requestBodies.map(
            (requestBody) => requestBody.contentType,
          ),
          responses,
          responseStatuses: responses.map((response) => response.status),
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

    return {
      ok: true,
      value: {
        endpoints: extractEndpoints(schema),
        format,
        schema,
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
