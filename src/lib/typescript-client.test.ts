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
