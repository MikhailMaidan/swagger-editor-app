import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAPI_SCHEMA,
  createEndpointStats,
  createCurlPreview,
  createFetchPreview,
  createHttpPreview,
  detectSchemaFormat,
  extractEndpoints,
  extractSecuritySchemes,
  formatOpenApiSchema,
  parseOpenApiSchema,
  selectDefaultResponse,
  validateOpenApiSchema,
} from "./openapi";

describe("openapi helpers", () => {
  it("detects schema format from text", () => {
    expect(detectSchemaFormat('{"openapi":"3.0.0"}')).toBe("json");
    expect(detectSchemaFormat("openapi: 3.0.0")).toBe("yaml");
  });

  it("resolves the server url for legacy Swagger 2.0 documents", () => {
    const result = parseOpenApiSchema(
      JSON.stringify({
        basePath: "/v2",
        host: "legacy.example.com",
        info: { title: "Legacy API", version: "1.0.0" },
        paths: {},
        schemes: ["https"],
        swagger: "2.0",
      }),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.serverUrl).toBe("https://legacy.example.com/v2");
  });

  it("defaults to http when Swagger 2.0 only advertises http", () => {
    const result = parseOpenApiSchema(
      JSON.stringify({
        host: "legacy.example.com",
        info: { title: "Legacy API", version: "1.0.0" },
        paths: {},
        schemes: ["http"],
        swagger: "2.0",
      }),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.serverUrl).toBe("http://legacy.example.com");
  });

  it("normalizes OpenAPI security schemes including local references", () => {
    const schema = {
      components: {
        securitySchemes: {
          bearerAuth: {
            bearerFormat: "JWT",
            description: "Short-lived access token",
            scheme: "bearer",
            type: "http",
          },
          queryKey: { $ref: "#/x-security/queryKey" },
          signIn: { flows: {}, type: "oauth2" },
        },
      },
      "x-security": {
        queryKey: { in: "query", name: "api_key", type: "apiKey" },
      },
    };

    expect(extractSecuritySchemes(schema)).toEqual([
      {
        bearerFormat: "JWT",
        description: "Short-lived access token",
        location: "",
        name: "bearerAuth",
        parameterName: "",
        scheme: "bearer",
        type: "http",
      },
      {
        bearerFormat: "",
        description: "",
        location: "query",
        name: "queryKey",
        parameterName: "api_key",
        scheme: "",
        type: "apiKey",
      },
      expect.objectContaining({ name: "signIn", type: "oauth2" }),
    ]);
  });

  it("normalizes Swagger 2 basic and API key security definitions", () => {
    expect(
      extractSecuritySchemes({
        securityDefinitions: {
          basicAuth: { type: "basic" },
          headerKey: { in: "header", name: "X-API-Key", type: "apiKey" },
        },
        swagger: "2.0",
      }),
    ).toEqual([
      expect.objectContaining({
        name: "basicAuth",
        scheme: "basic",
        type: "http",
      }),
      expect.objectContaining({
        location: "header",
        name: "headerKey",
        parameterName: "X-API-Key",
        type: "apiKey",
      }),
    ]);
  });

  it("resolves OpenAPI server variables from their default values", () => {
    const result = parseOpenApiSchema(
      JSON.stringify({
        info: { title: "Variable Server API", version: "1.0.0" },
        openapi: "3.0.0",
        paths: {
          "/users": {
            get: { responses: { "200": { description: "OK" } } },
          },
        },
        servers: [
          {
            url: "https://{environment}.example.com/{version}/{region}",
            variables: {
              environment: { default: "api" },
              region: { description: "No default in this invalid schema" },
              version: { default: "v2" },
            },
          },
          { url: "https://staging.example.com/v2" },
          { url: "https://staging.example.com/v2" },
        ],
      }),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.serverUrl).toBe("https://api.example.com/v2/{region}");
    expect(result.value.serverUrls).toEqual([
      "https://api.example.com/v2/{region}",
      "https://staging.example.com/v2",
    ]);
    expect(result.value.endpoints[0].serverUrl).toBe(
      "https://api.example.com/v2/{region}",
    );
  });

  it("lets an operation-level parameter override a shared path-level parameter of the same name and location", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/items/{id}": {
          get: {
            parameters: [
              {
                description: "Overridden: item id must be numeric",
                in: "path",
                name: "id",
                required: true,
                schema: { pattern: "^[0-9]+$", type: "string" },
              },
            ],
            responses: {
              "200": { description: "OK" },
            },
          },
          parameters: [
            {
              description: "Shared: any item id",
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
        },
      },
    });

    expect(endpoints[0].parameters).toEqual([
      expect.objectContaining({
        description: "Overridden: item id must be numeric",
        location: "path",
        name: "id",
        pattern: "^[0-9]+$",
        type: "string",
      }),
    ]);
  });

  it("resolves reusable parameters and extracts their input constraints", () => {
    const endpoints = extractEndpoints({
      components: {
        parameters: {
          StatusFilter: {
            description: "Filter by status",
            in: "query",
            name: "status",
            schema: {
              enum: ["active", "paused"],
              minLength: 3,
              pattern: "^[a-z]+$",
              type: "string",
            },
          },
        },
      },
      paths: {
        "/items": {
          get: {
            parameters: [{ $ref: "#/components/parameters/StatusFilter" }],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });

    expect(endpoints[0].parameters).toEqual([
      expect.objectContaining({
        description: "Filter by status",
        enumValues: ["active", "paused"],
        location: "query",
        minLength: 3,
        name: "status",
        pattern: "^[a-z]+$",
        type: "string",
      }),
    ]);
  });

  it("extracts Swagger 2 parameter constraints without a schema wrapper", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/items": {
          get: {
            parameters: [
              {
                default: 20,
                enum: [10, 20, 50],
                in: "query",
                maximum: 100,
                minimum: 1,
                name: "limit",
                type: "integer",
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
      swagger: "2.0",
    });

    expect(endpoints[0].parameters).toEqual([
      expect.objectContaining({
        enumValues: ["10", "20", "50"],
        example: "20",
        maximum: 100,
        minimum: 1,
        name: "limit",
        type: "integer",
      }),
    ]);
  });

  it("extracts required flags and example values from parameters", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/items/{id}": {
          get: {
            parameters: [
              {
                description: "Filter by item status",
                example: "active",
                in: "query",
                name: "status",
                schema: { type: "string" },
              },
              {
                in: "header",
                name: "X-Trace-Id",
                required: true,
                schema: { default: "trace-1", type: "string" },
              },
            ],
            responses: {
              "200": { description: "OK" },
            },
          },
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { example: 42, type: "integer" },
            },
          ],
        },
      },
    });

    expect(endpoints[0].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          example: "42",
          location: "path",
          name: "id",
          required: true,
        }),
        expect.objectContaining({
          description: "Filter by item status",
          example: "active",
          location: "query",
          name: "status",
          required: false,
        }),
        expect.objectContaining({
          example: "trace-1",
          location: "header",
          name: "X-Trace-Id",
          required: true,
        }),
      ]),
    );
  });

  it("extracts named media type examples for request and response bodies", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/users": {
          post: {
            requestBody: {
              description: "User payload",
              required: true,
              content: {
                "application/json": {
                  examples: {
                    createUser: {
                      value: { name: "Ada" },
                    },
                  },
                  schema: { type: "object" },
                },
                "application/xml": {
                  example: "<user><name>Ada</name></user>",
                  schema: { type: "string" },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    examples: {
                      externalExample: {
                        externalValue: "https://example.com/user.json",
                      },
                      createdUser: {
                        value: { id: 7, name: "Ada" },
                      },
                    },
                    schema: { type: "object" },
                  },
                },
                description: "Created",
              },
            },
          },
        },
      },
    });

    expect(endpoints[0].requestBodies[0].schema).toMatchObject({
      example: '{\n  "name": "Ada"\n}',
      exampleName: "createUser",
    });
    expect(endpoints[0].requestBodies[0]).toMatchObject({
      description: "User payload",
      required: true,
    });
    expect(endpoints[0].requestBodies[1]).toMatchObject({
      contentType: "application/xml",
      description: "User payload",
      required: true,
      schema: {
        example: "<user><name>Ada</name></user>",
      },
    });
    expect(endpoints[0].responses[0].schema).toMatchObject({
      example: '{\n  "id": 7,\n  "name": "Ada"\n}',
      exampleName: "createdUser",
    });
    expect(
      endpoints[0].responses[0].schemasByContentType?.["application/json"],
    ).toMatchObject({
      exampleName: "createdUser",
      type: "object",
    });
  });

  it("resolves referenced response schemas and required properties", () => {
    const endpoints = extractEndpoints({
      components: {
        responses: {
          UserResponse: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
            description: "User",
          },
        },
        schemas: {
          User: {
            properties: { id: { type: "integer" }, name: { type: "string" } },
            required: ["id"],
            type: "object",
          },
        },
      },
      paths: {
        "/users/7": {
          get: {
            responses: {
              "200": { $ref: "#/components/responses/UserResponse" },
            },
          },
        },
      },
    });

    expect(endpoints[0].responses[0]).toMatchObject({
      contentTypes: ["application/json"],
      schema: {
        hasExplicitExample: false,
        properties: ["id", "name"],
        propertyTypes: { id: "integer", name: "string" },
        requiredProperties: ["id"],
        type: "object",
      },
    });
  });

  it("preserves explicit empty response examples", () => {
    const endpoints = extractEndpoints({
      openapi: "3.0.0",
      paths: {
        "/empty": {
          get: {
            responses: {
              "200": {
                content: {
                  "text/plain": {
                    example: "",
                    schema: { type: "string" },
                  },
                },
                description: "Empty response",
              },
            },
          },
        },
      },
    });

    expect(endpoints[0].responses[0].schema).toMatchObject({
      example: "",
      hasExplicitExample: true,
      type: "string",
    });
  });

  it("uses Swagger 2 produces, schemas, and response examples", () => {
    const endpoints = extractEndpoints({
      definitions: {
        User: {
          properties: { id: { type: "integer" } },
          required: ["id"],
          type: "object",
        },
      },
      paths: {
        "/users/7": {
          get: {
            responses: {
              "200": {
                description: "User",
                examples: { "application/json": { id: 7 } },
                schema: { $ref: "#/definitions/User" },
              },
            },
          },
        },
      },
      produces: ["application/json"],
      swagger: "2.0",
    });

    expect(endpoints[0].responses[0]).toMatchObject({
      contentTypes: ["application/json"],
      schema: {
        example: '{\n  "id": 7\n}',
        properties: ["id"],
        requiredProperties: ["id"],
        type: "object",
      },
    });
  });

  it("parses the default YAML schema and extracts endpoints", () => {
    const result = parseOpenApiSchema(DEFAULT_OPENAPI_SCHEMA);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.title).toBe("RSSwag Demo API");
    expect(result.value.format).toBe("yaml");
    expect(result.value.serverUrl).toBe("https://jsonplaceholder.typicode.com");
    expect(result.value.endpoints).toHaveLength(2);
    expect(result.value.endpoints[0]).toMatchObject({
      deprecated: false,
      method: "GET",
      operationId: "",
      path: "/users/{id}",
      secured: false,
      securityRequirements: [],
      serverUrl: "https://jsonplaceholder.typicode.com",
      tags: [],
    });
    expect(
      result.value.endpoints[0].responses.map((response) => response.status),
    ).toEqual(["200", "404"]);
    expect(result.value.endpoints[0].responses[0]).toMatchObject({
      contentTypes: ["application/json"],
      description: "Successful response",
      status: "200",
    });
    expect(result.value.endpoints[0].responses[0].schema?.properties).toEqual([
      "id",
      "name",
    ]);
    expect(result.value.endpoints[1].requestBodies[0]).toMatchObject({
      contentType: "application/json",
      schema: {
        properties: ["name"],
        type: "object",
      },
    });
    expect(result.value.endpoints[0].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: "path", name: "id" }),
        expect.objectContaining({ location: "query", name: "search" }),
        expect.objectContaining({ location: "header", name: "X-Trace-Id" }),
        expect.objectContaining({ location: "cookie", name: "sessionId" }),
      ]),
    );
  });

  it("extracts endpoint tags and deprecated flags", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/reports": {
          get: {
            deprecated: true,
            operationId: "listReports",
            responses: {
              "200": { description: "OK" },
            },
            summary: "List reports",
            tags: ["reports", "admin"],
          },
        },
      },
    });

    expect(endpoints[0]).toMatchObject({
      deprecated: true,
      method: "GET",
      operationId: "listReports",
      path: "/reports",
      tags: ["reports", "admin"],
    });
  });

  it("extracts inherited and operation-level security requirements", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/admin": {
          get: {
            responses: { "200": { description: "OK" } },
          },
        },
        "/login": {
          post: {
            responses: { "200": { description: "OK" } },
            security: [],
          },
        },
        "/reports": {
          get: {
            responses: { "200": { description: "OK" } },
            security: [{ oauth2: ["reports:read"] }],
          },
        },
      },
      security: [{ apiKeyAuth: [] }],
    });

    expect(endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/admin",
          secured: true,
          securityRequirements: ["apiKeyAuth"],
        }),
        expect.objectContaining({
          path: "/login",
          secured: false,
          securityRequirements: [],
        }),
        expect.objectContaining({
          path: "/reports",
          secured: true,
          securityRequirementGroups: [["oauth2"]],
          securityRequirements: ["oauth2"],
        }),
      ]),
    );
  });

  it("creates endpoint statistics for viewer filters and summary cards", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/reports": {
          get: {
            deprecated: true,
            responses: { "200": { description: "OK" } },
            tags: ["reports", "admin"],
          },
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            responses: { "201": { description: "Created" } },
            tags: ["reports"],
          },
        },
        "/users": {
          get: {
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });

    expect(createEndpointStats(endpoints)).toEqual({
      deprecatedCount: 1,
      endpointCount: 3,
      methodCounts: {
        GET: 2,
        POST: 1,
      },
      methods: ["GET", "POST"],
      requestBodyCount: 1,
      securedCount: 0,
      tagCounts: {
        admin: 1,
        reports: 2,
      },
      tags: ["admin", "reports"],
    });
  });

  it("selects an exact 200 response before other successful responses", () => {
    const endpoints = extractEndpoints({
      paths: {
        "/created": {
          post: {
            responses: {
              "400": { description: "Bad request" },
              "201": { description: "Created" },
            },
          },
        },
        "/ok": {
          get: {
            responses: {
              "201": { description: "Created" },
              "200": { description: "OK" },
            },
          },
        },
      },
    });

    expect(selectDefaultResponse(endpoints[0].responses)?.status).toBe("201");
    expect(selectDefaultResponse(endpoints[1].responses)?.status).toBe("200");
  });

  it("creates cURL previews with optional request bodies", () => {
    expect(createCurlPreview("GET", "/users", false)).toBe(
      'curl -X GET \\\n  "https://api.example.com/users"',
    );
    expect(createCurlPreview("POST", "/users", true)).toContain(
      '-H "Content-Type: application/json"',
    );
  });

  it("creates cURL previews from current request values", () => {
    expect(
      createCurlPreview(
        "POST",
        "/users/{id}",
        true,
        "https://api.example.com/",
        [
          { location: "path", name: "id", value: "42" },
          { location: "query", name: "search", value: "Alex Smith" },
          { location: "header", name: "X-Trace-Id", value: "trace-1" },
        ],
        '{"name":"Mikhail"}',
      ),
    ).toBe(
      'curl -X POST \\\n  "https://api.example.com/users/42?search=Alex%20Smith" \\\n  -H "X-Trace-Id: trace-1" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"Mikhail"}\'',
    );
  });

  it("uses the endpoint's declared content type instead of always assuming JSON", () => {
    expect(
      createCurlPreview(
        "POST",
        "/users",
        true,
        "https://api.example.com",
        [],
        "<user><name>Mikhail</name></user>",
        "application/xml",
      ),
    ).toBe(
      'curl -X POST \\\n  "https://api.example.com/users" \\\n  -H "Content-Type: application/xml" \\\n  -d \'<user><name>Mikhail</name></user>\'',
    );
  });

  it("escapes double quotes and shell metacharacters in header values", () => {
    expect(
      createCurlPreview("GET", "/users", false, "https://api.example.com", [
        {
          location: "header",
          name: "X-Note",
          value: 'say "hi" `whoami` $HOME',
        },
      ]),
    ).toBe(
      'curl -X GET \\\n  "https://api.example.com/users" \\\n  -H "X-Note: say \\"hi\\" \\`whoami\\` \\$HOME"',
    );
  });

  it("includes cookie parameters in cURL previews, matching the server-side request", () => {
    expect(
      createCurlPreview(
        "GET",
        "/users/{id}",
        false,
        "https://api.example.com",
        [
          { location: "path", name: "id", value: "42" },
          { location: "cookie", name: "sessionId", value: "abc 123" },
          { location: "cookie", name: "theme", value: "dark" },
        ],
      ),
    ).toBe(
      'curl -X GET \\\n  "https://api.example.com/users/42" \\\n  -H "Cookie: sessionId=abc%20123; theme=dark"',
    );
  });

  it("creates executable fetch previews from current request values", () => {
    expect(
      createFetchPreview(
        "post",
        "/users/{id}",
        true,
        "https://api.example.com/",
        [
          { location: "path", name: "id", value: "42" },
          { location: "query", name: "search", value: "Alex Smith" },
          { location: "header", name: "X-Trace-Id", value: 'trace-"1"' },
          { location: "cookie", name: "sessionId", value: "abc 123" },
        ],
        '{"name":"Mikhail"}',
      ),
    ).toBe(`fetch("https://api.example.com/users/42?search=Alex%20Smith", {
  "method": "POST",
  "headers": {
    "X-Trace-Id": "trace-\\"1\\"",
    "Cookie": "sessionId=abc%20123",
    "Content-Type": "application/json"
  },
  "body": "{\\"name\\":\\"Mikhail\\"}"
});`);
  });

  it("omits fetch headers and body when they are not needed", () => {
    expect(createFetchPreview("GET", "/users", false)).toBe(
      'fetch("https://api.example.com/users", {\n  "method": "GET"\n});',
    );
  });

  it("creates raw HTTP previews from the current request values", () => {
    expect(
      createHttpPreview(
        "post",
        "/users/{id}",
        true,
        "https://api.example.com/",
        [
          { location: "path", name: "id", value: "42" },
          { location: "query", name: "search", value: "Alex Smith" },
          { location: "header", name: "X-Trace-Id", value: "trace-1" },
          { location: "cookie", name: "sessionId", value: "abc 123" },
        ],
        '{"name":"Mikhail"}',
      ),
    ).toBe(`POST https://api.example.com/users/42?search=Alex%20Smith HTTP/1.1
X-Trace-Id: trace-1
Cookie: sessionId=abc%20123
Content-Type: application/json

{"name":"Mikhail"}`);
  });

  it("omits HTTP preview headers and body when they are not needed", () => {
    expect(createHttpPreview("GET", "/users", false)).toBe(
      "GET https://api.example.com/users HTTP/1.1",
    );
  });

  it("keeps raw HTTP header values on a single line", () => {
    const preview = createHttpPreview(
      "GET",
      "/users",
      false,
      "https://api.example.com",
      [
        {
          location: "header",
          name: "X-Trace-Id",
          value: "trace-1\r\nX-Injected: true",
        },
      ],
    );

    expect(preview.split("\n")).toEqual([
      "GET https://api.example.com/users HTTP/1.1",
      "X-Trace-Id: trace-1 X-Injected: true",
    ]);
  });

  it("parses JSON schemas and supports format conversion", () => {
    const jsonSchema = {
      info: {
        title: "Pets API",
        version: "1.0.0",
      },
      openapi: "3.0.0",
      paths: {
        "/pets": {
          get: {
            responses: {
              "200": {
                description: "OK",
              },
            },
            summary: "List pets",
          },
        },
      },
    };
    const result = parseOpenApiSchema(JSON.stringify(jsonSchema));

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.format).toBe("json");
    expect(formatOpenApiSchema(result.value.schema, "yaml")).toContain(
      "title: Pets API",
    );
    expect(formatOpenApiSchema(result.value.schema, "json")).toContain(
      '"title": "Pets API"',
    );
  });

  it("returns validation errors for invalid schemas", () => {
    expect(validateOpenApiSchema([])).toBe("Schema must be an object.");
    expect(validateOpenApiSchema({ info: {}, paths: {} })).toBe(
      "Schema must include an openapi or swagger version.",
    );
    expect(
      validateOpenApiSchema({ info: {}, openapi: "3.0.0", paths: {} }),
    ).toBe("Schema info.title is required.");
    expect(
      validateOpenApiSchema({
        info: { title: "No paths" },
        openapi: "3.0.0",
      }),
    ).toBe("Schema paths object is required.");
    expect(parseOpenApiSchema("openapi: [")).toMatchObject({
      format: "yaml",
      ok: false,
    });
  });

  it("reports the location of malformed YAML and JSON", () => {
    expect(parseOpenApiSchema("openapi: [")).toMatchObject({
      errorPosition: { column: 11, line: 1, offset: 10 },
      format: "yaml",
      ok: false,
    });

    const invalidJson = `{
  "openapi": "3.0.0",
}`;

    expect(parseOpenApiSchema(invalidJson)).toMatchObject({
      errorPosition: { column: 1, line: 3, offset: 24 },
      format: "json",
      ok: false,
    });
  });

  it("ignores malformed path items while extracting endpoints", () => {
    expect(
      extractEndpoints({
        paths: {
          "/broken": null,
        },
      }),
    ).toEqual([]);
  });
});
