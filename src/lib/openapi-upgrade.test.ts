import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { parseOpenApiSchema } from "./openapi";
import {
  compareUpgradeEndpoints,
  detectUpgradeSource,
  getUpgradeTargets,
  serializeUpgradedDocument,
  upgradeOpenApiDocument,
} from "./openapi-upgrade";

const swaggerDocument = YAML.parse(`
swagger: "2.0"
info:
  title: Pet Store
  version: 1.0.0
host: petstore.example.com
basePath: /v2
schemes: [https, http]
consumes: [application/json]
produces: [application/json, application/xml]
tags:
  - name: pets
paths:
  /pets:
    parameters:
      - $ref: '#/parameters/TraceId'
    get:
      operationId: listPets
      tags: [pets]
      parameters:
        - name: tags
          in: query
          type: array
          items: { type: string }
          collectionFormat: csv
        - name: limit
          in: query
          type: integer
          format: int32
          maximum: 100
          x-example: 20
      responses:
        "200":
          description: Pets
          headers:
            X-Rate-Limit:
              type: integer
              description: Calls per hour
          schema:
            type: array
            items: { $ref: '#/definitions/Pet' }
          examples:
            application/json: [{ id: 1, name: Rex }]
        default:
          $ref: '#/responses/Error'
    post:
      operationId: createPet
      parameters:
        - $ref: '#/parameters/PetBody'
      responses:
        "201":
          description: Created
      security:
        - petstore_auth: [write:pets]
  /pets/{petId}/photo:
    post:
      consumes: [multipart/form-data]
      parameters:
        - name: petId
          in: path
          type: integer
          required: true
        - name: file
          in: formData
          type: file
          required: true
          description: Photo
        - name: labels
          in: formData
          type: array
          items: { type: string }
      responses:
        "204":
          description: Uploaded
  /legacy:
    get:
      schemes: [http]
      parameters:
        - name: ids
          in: query
          type: array
          items: { type: string }
          collectionFormat: tsv
        - name: payload
          in: body
          schema: { type: object }
      responses:
        "200": {}
parameters:
  TraceId:
    name: X-Trace-Id
    in: header
    type: string
  PetBody:
    name: pet
    in: body
    required: true
    schema: { $ref: '#/definitions/Pet' }
responses:
  Error:
    description: Unexpected error
    schema: { $ref: '#/definitions/Error' }
definitions:
  Pet:
    type: object
    discriminator: petType
    required: [name]
    properties:
      id: { type: integer, format: int64, readOnly: true }
      name: { type: string, example: Rex }
      nickname: { type: string, x-nullable: true }
      photo: { type: file }
  Error:
    type: object
    properties:
      message: { type: string }
securityDefinitions:
  petstore_auth:
    type: oauth2
    flow: accessCode
    authorizationUrl: https://auth.example.com/authorize
    tokenUrl: https://auth.example.com/token
    scopes:
      write:pets: Modify pets
  api_key:
    type: apiKey
    name: api_key
    in: header
  basic:
    type: basic
x-owner: platform
`);

describe("OpenAPI upgrade assistant", () => {
  it("detects upgradeable document versions", () => {
    expect(detectUpgradeSource({ swagger: "2.0" })).toBe("swagger-2.0");
    expect(detectUpgradeSource({ swagger: 2 })).toBe("swagger-2.0");
    expect(detectUpgradeSource({ openapi: "3.0.3" })).toBe("openapi-3.0");
    expect(detectUpgradeSource({ openapi: "3.1.0" })).toBeNull();
    expect(getUpgradeTargets("swagger-2.0")).toEqual(["3.0.3", "3.1.0"]);
    expect(getUpgradeTargets("openapi-3.0")).toEqual(["3.1.0"]);
    expect(() => upgradeOpenApiDocument({ openapi: "3.0.0" }, "3.0.3")).toThrow(
      "Cannot upgrade",
    );
  });

  it("converts Swagger 2.0 structure, parameters, bodies, responses, and security", () => {
    const { changes, document, warnings } = upgradeOpenApiDocument(
      swaggerDocument,
      "3.0.3",
    );
    const paths = document.paths as Record<string, Record<string, unknown>>;

    expect(Object.keys(document)).toEqual([
      "openapi",
      "info",
      "servers",
      "tags",
      "paths",
      "components",
      "x-owner",
    ]);
    expect(document.openapi).toBe("3.0.3");
    expect(document.servers).toEqual([
      { url: "https://petstore.example.com/v2" },
      { url: "http://petstore.example.com/v2" },
    ]);
    expect(paths["/pets"].parameters).toEqual([
      { $ref: "#/components/parameters/TraceId" },
    ]);
    expect(paths["/pets"].get).toEqual({
      operationId: "listPets",
      parameters: [
        {
          explode: false,
          in: "query",
          name: "tags",
          schema: { items: { type: "string" }, type: "array" },
          style: "form",
        },
        {
          example: 20,
          in: "query",
          name: "limit",
          schema: { format: "int32", maximum: 100, type: "integer" },
        },
      ],
      responses: {
        "200": {
          content: {
            "application/json": {
              example: [{ id: 1, name: "Rex" }],
              schema: {
                items: { $ref: "#/components/schemas/Pet" },
                type: "array",
              },
            },
            "application/xml": {
              schema: {
                items: { $ref: "#/components/schemas/Pet" },
                type: "array",
              },
            },
          },
          description: "Pets",
          headers: {
            "X-Rate-Limit": {
              description: "Calls per hour",
              schema: { type: "integer" },
            },
          },
        },
        default: { $ref: "#/components/responses/Error" },
      },
      tags: ["pets"],
    });
    expect(paths["/pets"].post).toEqual({
      operationId: "createPet",
      requestBody: { $ref: "#/components/requestBodies/PetBody" },
      responses: { "201": { description: "Created" } },
      security: [{ petstore_auth: ["write:pets"] }],
    });
    expect(paths["/pets/{petId}/photo"].post).toEqual({
      parameters: [
        {
          in: "path",
          name: "petId",
          required: true,
          schema: { type: "integer" },
        },
      ],
      requestBody: {
        content: {
          "multipart/form-data": {
            encoding: { labels: { explode: false, style: "form" } },
            schema: {
              properties: {
                file: {
                  description: "Photo",
                  format: "binary",
                  type: "string",
                },
                labels: { items: { type: "string" }, type: "array" },
              },
              required: ["file"],
              type: "object",
            },
          },
        },
        required: true,
      },
      responses: { "204": { description: "Uploaded" } },
    });

    const components = document.components as Record<
      string,
      Record<string, unknown>
    >;

    expect(components.schemas.Pet).toEqual({
      discriminator: { propertyName: "petType" },
      properties: {
        id: { format: "int64", readOnly: true, type: "integer" },
        name: { example: "Rex", type: "string" },
        nickname: { nullable: true, type: "string" },
        photo: { format: "binary", type: "string" },
      },
      required: ["name"],
      type: "object",
    });
    expect(components.requestBodies.PetBody).toEqual({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Pet" },
        },
      },
      required: true,
      "x-codegen-request-body-name": "pet",
    });
    expect(components.responses.Error).toEqual({
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
        "application/xml": { schema: { $ref: "#/components/schemas/Error" } },
      },
      description: "Unexpected error",
    });
    expect(components.securitySchemes).toEqual({
      api_key: { in: "header", name: "api_key", type: "apiKey" },
      basic: { scheme: "basic", type: "http" },
      petstore_auth: {
        flows: {
          authorizationCode: {
            authorizationUrl: "https://auth.example.com/authorize",
            scopes: { "write:pets": "Modify pets" },
            tokenUrl: "https://auth.example.com/token",
          },
        },
        type: "oauth2",
      },
    });
    expect(
      Object.fromEntries(changes.map(({ code, count }) => [code, count])),
    ).toMatchObject({
      "file-types": 2,
      "form-data": 2,
      nullable: 1,
      "request-bodies": 3,
      responses: 2,
      schemas: 2,
      "security-schemes": 3,
      "serialization-styles": 2,
      servers: 2,
      version: 1,
    });
    expect(warnings).toEqual([
      {
        code: "unsupported-collection-format",
        params: { format: "tsv", name: "ids" },
        pointer: "/paths/~1legacy/get/parameters/0",
      },
      {
        code: "missing-response-description",
        params: {},
        pointer: "/paths/~1legacy/get/responses/200",
      },
      {
        code: "operation-schemes",
        params: { schemes: "http" },
        pointer: "/paths/~1legacy/get/schemes",
      },
    ]);
  });

  it("keeps every endpoint and produces a parseable OpenAPI 3 document", () => {
    const { document } = upgradeOpenApiDocument(swaggerDocument, "3.0.3");
    const yaml = serializeUpgradedDocument(document, "yaml");
    const parsed = parseOpenApiSchema(yaml);

    expect(yaml).not.toMatch(/[&*]a\d/);
    expect(parsed.ok).toBe(true);
    expect(compareUpgradeEndpoints(swaggerDocument, document)).toEqual({
      missing: [],
      sourceCount: 4,
      upgradedCount: 4,
    });
    expect(
      compareUpgradeEndpoints(swaggerDocument, { openapi: "3.0.3", paths: {} }),
    ).toMatchObject({ missing: expect.arrayContaining(["GET /pets"]) });
    expect(JSON.parse(serializeUpgradedDocument(document, "json"))).toEqual(
      document,
    );
  });

  it("upgrades OpenAPI 3.0 schemas to 3.1 JSON Schema semantics", () => {
    const { changes, document, warnings } = upgradeOpenApiDocument(
      {
        components: {
          examples: { Sample: { value: { nullable: true } } },
          schemas: {
            Order: {
              properties: {
                note: { nullable: true, type: "string" },
                status: {
                  enum: ["open", "closed"],
                  nullable: true,
                  type: "string",
                },
                total: { exclusiveMinimum: true, minimum: 0, type: "number" },
                discount: {
                  exclusiveMaximum: false,
                  maximum: 50,
                  type: "number",
                },
                customer: {
                  allOf: [{ $ref: "#/components/schemas/Customer" }],
                  nullable: true,
                },
              },
              example: { total: 1 },
              type: "object",
            },
          },
        },
        info: { title: "Shop", version: "1" },
        openapi: "3.0.3",
        paths: {
          "/orders": {
            get: {
              parameters: [
                {
                  example: 10,
                  in: "query",
                  name: "limit",
                  schema: { maximum: 100, nullable: true, type: "integer" },
                },
              ],
              responses: {},
            },
          },
        },
        "x-webhooks": {
          orderCreated: {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Order" },
                  },
                },
              },
              responses: {},
            },
          },
        },
      },
      "3.1.0",
    );
    const schemas = (
      document.components as Record<string, Record<string, unknown>>
    ).schemas;

    expect(document.openapi).toBe("3.1.0");
    expect(schemas.Order).toEqual({
      examples: [{ total: 1 }],
      properties: {
        customer: {
          anyOf: [
            { allOf: [{ $ref: "#/components/schemas/Customer" }] },
            { type: "null" },
          ],
        },
        discount: { maximum: 50, type: "number" },
        note: { type: ["string", "null"] },
        status: { enum: ["open", "closed", null], type: ["string", "null"] },
        total: { exclusiveMinimum: 0, type: "number" },
      },
      type: "object",
    });
    expect((document.components as Record<string, unknown>).examples).toEqual({
      Sample: { value: { nullable: true } },
    });
    expect(
      (
        (
          document.paths as Record<
            string,
            Record<string, Record<string, unknown>>
          >
        )["/orders"].get.parameters as Array<Record<string, unknown>>
      )[0],
    ).toEqual({
      example: 10,
      in: "query",
      name: "limit",
      schema: { maximum: 100, type: ["integer", "null"] },
    });
    expect(document.webhooks).toBeDefined();
    expect(document).not.toHaveProperty("x-webhooks");
    expect(
      Object.fromEntries(changes.map(({ code, count }) => [code, count])),
    ).toEqual({
      bounds: 1,
      nullable: 4,
      "schema-examples": 1,
      version: 1,
      webhooks: 1,
    });
    expect(warnings).toEqual([
      {
        code: "nullable-composition",
        params: {},
        pointer: "/components/schemas/Order/properties/customer",
      },
    ]);
  });

  it("chains Swagger 2.0 upgrades to OpenAPI 3.1 and maps schema warnings back to definitions", () => {
    const { document, warnings } = upgradeOpenApiDocument(
      {
        definitions: {
          Owner: {
            properties: {
              pet: {
                allOf: [{ $ref: "#/definitions/Pet" }],
                "x-nullable": true,
              },
            },
          },
          Pet: { type: "object" },
        },
        info: { title: "Pets", version: "1" },
        paths: {},
        swagger: "2.0",
      },
      "3.1.0",
    );

    expect(document.openapi).toBe("3.1.0");
    expect(
      (document.components as Record<string, Record<string, unknown>>).schemas
        .Owner,
    ).toEqual({
      properties: {
        pet: {
          anyOf: [
            { allOf: [{ $ref: "#/components/schemas/Pet" }] },
            { type: "null" },
          ],
        },
      },
    });
    expect(warnings).toEqual([
      {
        code: "nullable-composition",
        params: {},
        pointer: "/definitions/Owner/properties/pet",
      },
    ]);
  });

  it("warns about external, unresolved, and unsupported constructs", () => {
    const { document, warnings } = upgradeOpenApiDocument(
      {
        info: { title: "Edge", version: "1" },
        paths: {
          "/a": {
            post: {
              consumes: ["application/json"],
              parameters: [
                { $ref: "common.yaml#/parameters/Page" },
                { $ref: "#/parameters/Missing" },
                { in: "body", name: "body", schema: { type: "object" } },
                { in: "formData", name: "field", type: "string" },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
        schemes: ["wss"],
        host: "stream.example.com",
        securityDefinitions: {
          legacy: { flow: "hybrid", type: "oauth2" },
        },
        swagger: "2.0",
      },
      "3.0.3",
    );

    expect(warnings.map((warning) => warning.code)).toEqual([
      "websocket-scheme",
      "unresolved-reference",
      "external-reference",
      "body-and-form-data",
      "unsupported-oauth-flow",
    ]);
    expect(
      (
        document.paths as Record<
          string,
          Record<string, Record<string, unknown>>
        >
      )["/a"].post.parameters as unknown[],
    ).toEqual([
      { $ref: "common.yaml#/components/parameters/Page" },
      { $ref: "#/components/parameters/Missing" },
    ]);
  });
});
