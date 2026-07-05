import YAML from "yaml";

export type SchemaFormat = "json" | "yaml";

export type EndpointParameter = {
  name: string;
  location: "path" | "query" | "header" | "cookie";
};

export type EndpointSummary = {
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: EndpointParameter[];
  requestContentTypes: string[];
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
      responses:
        '200':
          description: Updated user`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isParameterLocation(value: unknown): value is EndpointParameter["location"] {
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

function readStringKeys(value: unknown) {
  return isRecord(value) ? Object.keys(value) : [];
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

        const requestBody = isRecord(operation.requestBody)
          ? operation.requestBody
          : {};
        const requestBodyContent = isRecord(requestBody.content)
          ? requestBody.content
          : {};

        endpoints.push({
          description: readString(operation.description),
          method: method.toUpperCase(),
          parameters: [
            ...sharedParameters,
            ...normalizeParameters(operation.parameters),
          ],
          path,
          requestContentTypes: Object.keys(requestBodyContent),
          responseStatuses: readStringKeys(operation.responses),
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
