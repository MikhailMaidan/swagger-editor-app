import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "./openapi";
import { extractSchemaModels } from "./schema-models";
import {
  createDefaultTypeScriptClientName,
  createTypeScriptClient,
  normalizeTypeScriptClientName,
} from "./typescript-client";

function parseSchema(source: string) {
  const result = parseOpenApiSchema(source);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.value;
}

const openApiSchema = `openapi: 3.1.0
info:
  title: People API
  version: 2.0.0
servers:
  - url: https://api.example.com/v1
components:
  schemas:
    Address:
      type: object
      required: [city]
      properties:
        city:
          type: string
    Orphan:
      type: string
    User:
      type: object
      required: [id]
      properties:
        id:
          type: integer
        address:
          $ref: '#/components/schemas/Address'
paths:
  /users/{user-id}:
    get:
      summary: Get a user
      operationId: getUser
      parameters:
        - name: user-id
          in: path
          required: true
          schema:
            type: string
        - name: verbose
          in: query
          schema:
            type: boolean
        - name: X-Trace
          in: header
          schema:
            type: string
      responses:
        '200':
          description: User
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
  /legacy:
    get:
      deprecated: true
      summary: Legacy list
      responses:
        '204':
          description: Empty`;

describe("TypeScript client generation", () => {
  it("preserves mixed type arrays in generated request and response types", () => {
    const content = {
      "application/json": {
        schema: {
          type: ["string", "array", "null"],
          items: { type: "integer" },
        },
      },
    };
    const parsed = parseSchema(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Mixed types", version: "1" },
        paths: {
          "/values": {
            post: {
              requestBody: { required: true, content },
              responses: { "200": { description: "Value", content } },
            },
          },
        },
      }),
    );
    const build = createTypeScriptClient(
      parsed.endpoints,
      [],
      parsed.schema,
      parsed,
    );

    expect(build.source).toContain("body: string | Array<number> | null;");
    expect(build.operations[0].responseType).toBe(
      "string | Array<number> | null",
    );
  });

  it("excludes models whose names appear only as inline property names", () => {
    const content = {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            User: { type: "string" },
            Profile: { $ref: "#/components/schemas/Used" },
            $User: { type: "number" },
          },
          required: ["User"],
        },
      },
    };
    const parsed = parseSchema(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Inline properties", version: "1" },
        components: {
          schemas: {
            User: { type: "boolean" },
            Profile: { type: "boolean" },
            $User: { type: "boolean" },
            Used: { type: "boolean" },
          },
        },
        paths: {
          "/users": {
            post: {
              requestBody: { required: true, content },
              responses: { "200": { description: "User", content } },
            },
          },
        },
      }),
    );
    const build = createTypeScriptClient(
      parsed.endpoints,
      extractSchemaModels(parsed.schema),
      parsed.schema,
      parsed,
    );

    expect(build.summary.modelCount).toBe(1);
    expect(build.source).toContain("export type Used = boolean;");
    expect(build.operations[0].responseType).toBe(
      "{ User: string; Profile?: Used; $User?: number; }",
    );
    expect(build.source).toContain(
      "body: { User: string; Profile?: Used; $User?: number; };",
    );
    for (const name of ["User", "Profile", "$User"]) {
      expect(build.source).not.toContain(`export type ${name} =`);
    }
  });

  it("keeps request and response objects nullable when a property accepts null", () => {
    const content = {
      "application/json": {
        schema: {
          type: ["object", "null"],
          properties: { value: { enum: ["a", null, "b"] } },
          required: ["value"],
        },
      },
    };
    const parsed = parseSchema(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Nullable API", version: "1" },
        paths: {
          "/values": {
            post: {
              requestBody: { required: true, content },
              responses: { "200": { description: "Value", content } },
            },
          },
        },
      }),
    );
    const build = createTypeScriptClient(
      parsed.endpoints,
      [],
      parsed.schema,
      parsed,
    );
    const expectedType = '{ value: "a" | null | "b"; } | null';

    expect(build.source).toContain(`body: ${expectedType};`);
    expect(build.operations[0].responseType).toBe(expectedType);
  });

  it.each(["\u2028", "\u2029"])(
    "generates valid TypeScript when metadata contains Unicode separator %j",
    (separator) => {
      const build = createTypeScriptClient(
        [],
        [],
        {},
        {
          title: `Catalog${separator}API`,
          version: `2.0${separator}Internal`,
          serverUrl: "https://example.test",
        },
      );
      const compiled = ts.transpileModule(build.source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
        reportDiagnostics: true,
      });

      expect(
        compiled.diagnostics?.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
      ).toEqual([]);
      expect(build.source.split("\n")[0]).toBe(
        "// Generated from Catalog API v2.0 Internal by RSSwag.",
      );
    },
  );

  it("retains primitive constants in request and response types", () => {
    const parsed = parseSchema(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Constant API", version: "1" },
        paths: {
          "/events": {
            post: {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["kind"],
                      properties: {
                        kind: { type: "string", const: "created" },
                      },
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Acknowledged",
                  content: {
                    "application/json": {
                      schema: { type: "boolean", const: false },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
    const build = createTypeScriptClient(
      parsed.endpoints,
      extractSchemaModels(parsed.schema),
      parsed.schema,
      parsed,
    );

    expect(build.source).toContain('body: { kind: "created"; };');
    expect(build.operations[0].responseType).toBe("false");
  });

  it.each(["request", "response"])(
    "excludes models whose names appear only in %s string literals",
    (location) => {
      const literals = ["User", 'quoted "Escaped"', "\\Backslash"];
      const content = {
        "application/json": {
          schema: {
            oneOf: [
              { type: "string", enum: literals },
              { $ref: "#/components/schemas/Used" },
            ],
          },
        },
      };
      const parsed = parseSchema(
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Literal models", version: "1" },
          components: {
            schemas: {
              User: { type: "boolean" },
              Escaped: { type: "boolean" },
              Backslash: { type: "boolean" },
              Used: { type: "object", properties: { id: { type: "integer" } } },
            },
          },
          paths: {
            "/result": {
              post: {
                requestBody:
                  location === "request"
                    ? { required: true, content }
                    : undefined,
                responses: {
                  "200": {
                    description: "Result",
                    ...(location === "response" ? { content } : {}),
                  },
                },
              },
            },
          },
        }),
      );
      const models = extractSchemaModels(parsed.schema);
      const build = createTypeScriptClient(
        parsed.endpoints,
        models,
        parsed.schema,
        parsed,
      );

      expect(build.summary.modelCount).toBe(1);
      expect(build.source).toContain("export interface Used");
      expect(build.source).toContain(
        `${literals.map((value) => JSON.stringify(value)).join(" | ")} | Used`,
      );
      for (const modelName of ["User", "Escaped", "Backslash"]) {
        expect(build.source).not.toContain(`export type ${modelName} =`);
      }
      expect(
        createTypeScriptClient(
          parsed.endpoints,
          models,
          parsed.schema,
          parsed,
          { includeUnusedModels: true },
        ).summary.modelCount,
      ).toBe(4);
    },
  );

  it.each(["UserProfile", "User_Profile"])(
    "excludes models whose names are only substrings of the referenced type %s",
    (modelName) => {
      const parsed = parseSchema(
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Selected models", version: "1" },
          components: {
            schemas: {
              User: { type: "string" },
              Profile: { type: "boolean" },
              [modelName]: {
                type: "object",
                properties: { name: { type: "string" } },
              },
            },
          },
          paths: {
            "/profile": {
              get: {
                responses: {
                  "200": {
                    description: "Profile",
                    content: {
                      "application/json": {
                        schema: { $ref: `#/components/schemas/${modelName}` },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const models = extractSchemaModels(parsed.schema);
      const build = createTypeScriptClient(
        parsed.endpoints,
        models,
        parsed.schema,
        parsed,
      );

      expect(build.summary.modelCount).toBe(1);
      expect(build.source).toContain(`export interface ${modelName}`);
      expect(build.source).not.toContain("export type User =");
      expect(build.source).not.toContain("export type Profile =");
      expect(
        createTypeScriptClient(
          parsed.endpoints,
          models,
          parsed.schema,
          parsed,
          { includeUnusedModels: true },
        ).summary.modelCount,
      ).toBe(3);
    },
  );

  it("includes models reached through percent-encoded dependency references", () => {
    const parsed = parseSchema(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Encoded references", version: "1" },
        components: {
          schemas: {
            "User.Profile": { type: "string" },
            Envelope: {
              type: "object",
              properties: {
                value: { $ref: "#/components/schemas/User%2EProfile" },
              },
              required: ["value"],
            },
          },
        },
        paths: {
          "/result": {
            get: {
              responses: {
                "200": {
                  description: "Result",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Envelope" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
    const build = createTypeScriptClient(
      parsed.endpoints,
      extractSchemaModels(parsed.schema),
      parsed.schema,
      parsed,
    );

    expect(build.operations[0].responseType).toBe("Envelope");
    expect(build.summary.modelCount).toBe(2);
    expect(build.source).toContain("export type User_Profile = string;");
    expect(build.source).toContain("value: User_Profile;");
    expect(build.source).not.toContain("User_2EProfile");
  });

  it.each([
    { version: "3.0.3", schema: { type: "object", nullable: true } },
    { version: "3.1.0", schema: { type: ["object", "null"] } },
  ])(
    "retains nullable response models in generated clients for OpenAPI $version",
    ({ schema, version }) => {
      const parsed = parseSchema(
        JSON.stringify({
          openapi: version,
          info: { title: "Nullable API", version: "1" },
          components: {
            schemas: {
              MaybeUser: {
                ...schema,
                properties: { name: { type: "string" } },
                required: ["name"],
              },
            },
          },
          paths: {
            "/user": {
              get: {
                responses: {
                  "200": {
                    description: "An optional user",
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/MaybeUser" },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const build = createTypeScriptClient(
        parsed.endpoints,
        extractSchemaModels(parsed.schema),
        parsed.schema,
        parsed,
      );

      expect(build.operations[0].responseType).toBe("MaybeUser");
      expect(build.source).toContain(
        "export type MaybeUser = { name: string; } | null;",
      );
    },
  );

  it.each([" 200 ", " 2XX ", " DeFaUlT "])(
    "selects the response type and Accept header for the padded status %j",
    (status) => {
      const parsed = parseSchema(
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Response selection", version: "1" },
          paths: {
            "/result": {
              get: {
                operationId: "getResult",
                responses: {
                  "400": {
                    description: "Error",
                    content: {
                      "application/problem+json": {
                        schema: { type: "object" },
                      },
                    },
                  },
                  [status]: {
                    description: "Result",
                    content: { "text/plain": { schema: { type: "string" } } },
                  },
                },
              },
            },
          },
        }),
      );
      const build = createTypeScriptClient(
        parsed.endpoints,
        [],
        parsed.schema,
        parsed,
      );

      expect(build.operations[0].responseType).toBe("string");
      expect(build.source).toContain('accept: input.accept ?? "text/plain",');
    },
  );

  it.each([{ type: "null" }, { type: ["null"] }])(
    "keeps null-only request and response schemas precise for $type",
    ({ type }) => {
      const content = { "application/json": { schema: { type } } };
      const parsed = parseSchema(
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Null API", version: "1" },
          paths: {
            "/result": {
              post: {
                operationId: "sendResult",
                requestBody: { required: true, content },
                responses: { "200": { description: "Null result", content } },
              },
            },
          },
        }),
      );
      const build = createTypeScriptClient(
        parsed.endpoints,
        extractSchemaModels(parsed.schema),
        parsed.schema,
        parsed,
      );

      expect(build.operations[0]).toMatchObject({
        responseType: "null",
      });
      expect(build.source).toContain("body: null;");
    },
  );

  it("generates typed model closure, request inputs, and Fetch runtime", () => {
    const parsed = parseSchema(openApiSchema);
    const build = createTypeScriptClient(
      parsed.endpoints,
      extractSchemaModels(parsed.schema),
      parsed.schema,
      parsed,
      { includeDeprecated: false },
    );

    expect(build).toMatchObject({
      clientName: "createPeopleApiClient",
      summary: {
        excludedDeprecatedCount: 1,
        generatedNameCount: 0,
        modelCount: 2,
        operationCount: 1,
      },
    });
    expect(build.operations[0]).toMatchObject({
      name: "getUser",
      requestType: "PeopleApiClientGetUserRequest",
      responseType: "User",
    });
    expect(build.source).toContain("export interface Address");
    expect(build.source).toContain("export interface User");
    expect(build.source).not.toContain("export type Orphan");
    expect(build.source).toContain('"user-id": string;');
    expect(build.source).toContain("verbose?: boolean;");
    expect(build.source).toContain('input.path["user-id"]');
    expect(build.source).toContain("export class PeopleApiClientError");
  });

  it("produces executable request methods with encoded paths and query values", async () => {
    const parsed = parseSchema(openApiSchema);
    const build = createTypeScriptClient(
      parsed.endpoints,
      extractSchemaModels(parsed.schema),
      parsed.schema,
      parsed,
      { includeDeprecated: false },
    );
    const transpiled = ts.transpileModule(build.source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });

    expect(transpiled.diagnostics).toEqual([]);

    const generatedModule = { exports: {} as Record<string, unknown> };
    const executeModule = new Function(
      "module",
      "exports",
      transpiled.outputText,
    );
    executeModule(generatedModule, generatedModule.exports);

    const fetchMock = vi.fn().mockResolvedValue({
      headers: new Headers({ "content-type": "application/json" }),
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => '{"id":42}',
    });
    const createClient = generatedModule.exports.createPeopleApiClient as (
      options: Record<string, unknown>,
    ) => {
      getUser: (input: Record<string, unknown>) => Promise<unknown>;
    };
    const client = createClient({
      baseUrl: "https://api.example.com/v1",
      fetch: fetchMock,
    });
    const response = await client.getUser({
      headers: { "X-Trace": "trace-1" },
      path: { "user-id": "a b" },
      query: { verbose: true },
    });

    expect(response).toEqual({ id: 42 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [
      URL,
      { headers: Headers; method: string },
    ];
    expect(url.toString()).toBe(
      "https://api.example.com/v1/users/a%20b?verbose=true",
    );
    expect(request.method).toBe("GET");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.get("X-Trace")).toBe("trace-1");
  });

  it("normalizes duplicate, reserved, and missing operation names", () => {
    const parsed = parseSchema(`openapi: 3.0.0
info:
  title: Names
  version: 1.0.0
paths:
  /first:
    get:
      operationId: class
      responses:
        '200': { description: OK }
  /second:
    get:
      operationId: class
      responses:
        '200': { description: OK }
  /users/{id}:
    delete:
      responses:
        '204': { description: Deleted }`);
    const build = createTypeScriptClient(
      parsed.endpoints,
      [],
      parsed.schema,
      parsed,
    );

    expect(build.operations.map((operation) => operation.name)).toEqual([
      "callClass",
      "callClass2",
      "deleteUsersById",
    ]);
    expect(build.summary.generatedNameCount).toBe(3);
  });

  it.each([{ documented: true }, { documented: false }])(
    "replaces every repeated path placeholder with documented=$documented",
    async ({ documented }) => {
      const parsed = parseSchema(
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Repeated paths", version: "1" },
          paths: {
            "/users/{id}/connections/{id}": {
              get: {
                operationId: "getConnections",
                parameters: documented
                  ? [
                      {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string" },
                      },
                    ]
                  : [],
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      );
      const build = createTypeScriptClient(
        parsed.endpoints,
        [],
        parsed.schema,
        parsed,
      );
      expect(build.source).toContain("path: { id: string; };");
      const compiled = ts.transpileModule(build.source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
        reportDiagnostics: true,
      });
      expect(compiled.diagnostics).toEqual([]);
      const generatedModule = { exports: {} as Record<string, unknown> };
      new Function("module", "exports", compiled.outputText)(
        generatedModule,
        generatedModule.exports,
      );
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
      const createClient = generatedModule.exports[build.clientName] as (
        options: Record<string, unknown>,
      ) => {
        getConnections(input: { path: { id: string } }): Promise<unknown>;
      };
      const client = createClient({
        baseUrl: "https://api.example.com",
        fetch: fetchMock,
      });

      await expect(
        client.getConnections({ path: { id: "a b/c" } }),
      ).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledOnce();
      const url = fetchMock.mock.calls[0][0] as URL;
      expect(url.href).toBe(
        "https://api.example.com/users/a%20b%2Fc/connections/a%20b%2Fc",
      );
    },
  );

  it.each([
    { required: true, useReference: false },
    { required: false, useReference: true },
  ])(
    "prefers operation body overrides with required=$required and useReference=$useReference",
    ({ required, useReference }) => {
      const sharedBody = {
        in: "body",
        name: "payload",
        required: !required,
        schema: { type: "string" },
      };
      const operationBody = {
        in: "body",
        name: "payload",
        required,
        schema: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      };
      const parsed = parseSchema(
        JSON.stringify({
          swagger: "2.0",
          info: { title: "Body overrides", version: "1" },
          consumes: ["application/json"],
          parameters: { SharedBody: sharedBody, OperationBody: operationBody },
          paths: {
            "/items": {
              parameters: [
                useReference ? { $ref: "#/parameters/SharedBody" } : sharedBody,
              ],
              post: {
                operationId: "updateItem",
                parameters: [
                  useReference
                    ? { $ref: "#/parameters/OperationBody" }
                    : operationBody,
                ],
                responses: { "204": { description: "Updated" } },
              },
              put: {
                operationId: "inheritItem",
                parameters: [{ in: "query", name: "filter", type: "string" }],
                responses: { "204": { description: "Updated" } },
              },
            },
          },
        }),
      );
      const build = createTypeScriptClient(
        parsed.endpoints,
        [],
        parsed.schema,
        parsed,
      );

      expect(build.source).toContain(
        `body${required ? "" : "?"}: { name: string; };`,
      );
      expect(build.source).toContain(`body${required ? "?" : ""}: string;`);
    },
  );

  it("supports Swagger 2 body and response schemas", () => {
    const parsed = parseSchema(`swagger: '2.0'
info:
  title: Pets
  version: 1.0.0
basePath: /v1
consumes: [application/json]
produces: [application/json]
definitions:
  NewPet:
    type: object
    required: [name]
    properties:
      name: { type: string }
  Pet:
    allOf:
      - $ref: '#/definitions/NewPet'
      - type: object
        properties:
          id: { type: integer }
paths:
  /pets:
    post:
      operationId: createPet
      parameters:
        - in: body
          name: pet
          required: true
          schema:
            $ref: '#/definitions/NewPet'
      responses:
        '201':
          description: Created
          schema:
            $ref: '#/definitions/Pet'`);
    const build = createTypeScriptClient(
      parsed.endpoints,
      extractSchemaModels(parsed.schema),
      parsed.schema,
      parsed,
    );

    expect(build.source).toContain("body: NewPet;");
    expect(build.operations[0].responseType).toBe("Pet");
    expect(build.summary.modelCount).toBe(2);
  });

  it("creates stable client names", () => {
    expect(createDefaultTypeScriptClientName("Billing Service")).toBe(
      "createBillingServiceApiClient",
    );
    expect(createDefaultTypeScriptClientName("Orders API")).toBe(
      "createOrdersApiClient",
    );
    expect(normalizeTypeScriptClientName("  custom-client ")).toBe(
      "customClient",
    );
    expect(normalizeTypeScriptClientName("", "People API")).toBe(
      "createPeopleApiClient",
    );
  });
});
