import { describe, expect, it } from "vitest";
import { extractSchemaModels } from "./schema-models";

describe("schema models", () => {
  it("extracts OpenAPI models, dependencies, examples, and operation usages", () => {
    const models = extractSchemaModels({
      components: {
        schemas: {
          Address: {
            properties: {
              street: { type: "string" },
              zip: { nullable: true, type: "string" },
            },
            required: ["street"],
            type: "object",
          },
          Orphan: {
            description: "Not connected to an operation",
            type: "boolean",
          },
          Role: {
            enum: ["admin", "viewer"],
            type: "string",
          },
          User: {
            description: "A registered user",
            properties: {
              address: { $ref: "#/components/schemas/Address" },
              email: { format: "email", type: "string" },
              id: { format: "int64", type: "integer" },
              roles: {
                items: { $ref: "#/components/schemas/Role" },
                type: "array",
              },
            },
            required: ["id", "address"],
            type: "object",
          },
        },
      },
      paths: {
        "/users": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/User" },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
        },
      },
    });
    const address = models.find((model) => model.name === "Address");
    const orphan = models.find((model) => model.name === "Orphan");
    const role = models.find((model) => model.name === "Role");
    const user = models.find((model) => model.name === "User");

    expect(models.map((model) => model.name)).toEqual([
      "Address",
      "Orphan",
      "Role",
      "User",
    ]);
    expect(user).toMatchObject({
      description: "A registered user",
      referencedBy: [],
      references: ["Address", "Role"],
      type: "object",
      usages: [
        { kind: "request", method: "POST", path: "/users" },
        { kind: "response", method: "POST", path: "/users" },
      ],
    });
    expect(user?.properties).toMatchObject([
      { name: "address", required: true, type: "Address" },
      { format: "email", name: "email", required: false, type: "string" },
      { format: "int64", name: "id", required: true, type: "integer" },
      { name: "roles", required: false, type: "array<Role>" },
    ]);
    expect(address).toMatchObject({
      referencedBy: ["User"],
      usages: [
        { kind: "request", method: "POST", path: "/users" },
        { kind: "response", method: "POST", path: "/users" },
      ],
    });
    expect(role).toMatchObject({
      referencedBy: ["User"],
      typeScript: 'export type Role = "admin" | "viewer";',
    });
    expect(orphan?.usages).toEqual([]);
    expect(JSON.parse(user?.example ?? "{}")).toEqual({
      address: { street: "string", zip: "string" },
      email: "user@example.com",
      id: 0,
      roles: ["admin"],
    });
    expect(user?.typeScript).toContain("export interface User");
    expect(user?.typeScript).toContain("address: Address;");
    expect(user?.typeScript).toContain("roles?: Array<Role>;");
  });

  it("supports Swagger 2 definitions and references behind response wrappers", () => {
    const models = extractSchemaModels({
      definitions: {
        Error: {
          properties: { message: { type: "string" } },
          required: ["message"],
          type: "object",
        },
      },
      paths: {
        "/legacy": {
          get: {
            responses: {
              default: { $ref: "#/responses/ErrorResponse" },
            },
          },
        },
      },
      responses: {
        ErrorResponse: {
          description: "Legacy error",
          schema: { $ref: "#/definitions/Error" },
        },
      },
      swagger: "2.0",
    });

    expect(models).toMatchObject([
      {
        name: "Error",
        properties: [{ name: "message", required: true, type: "string" }],
        usages: [{ kind: "response", method: "GET", path: "/legacy" }],
      },
    ]);
  });

  it("handles recursive and composed models without following cycles forever", () => {
    const models = extractSchemaModels({
      components: {
        schemas: {
          Entity: {
            properties: { id: { type: "string" } },
            required: ["id"],
            type: "object",
          },
          Tree: {
            properties: {
              child: { $ref: "#/components/schemas/Tree" },
              value: { type: ["string", "null"] },
            },
            type: "object",
          },
          UserEntity: {
            allOf: [
              { $ref: "#/components/schemas/Entity" },
              {
                properties: { name: { type: "string" } },
                required: ["name"],
                type: "object",
              },
            ],
            properties: { kind: { enum: ["user"], type: "string" } },
          },
        },
      },
      paths: {},
    });
    const tree = models.find((model) => model.name === "Tree");
    const userEntity = models.find((model) => model.name === "UserEntity");

    expect(tree).toMatchObject({
      referencedBy: ["Tree"],
      references: ["Tree"],
    });
    expect(JSON.parse(tree?.example ?? "{}")).toEqual({
      child: { child: null, value: "string" },
      value: "string",
    });
    expect(userEntity?.properties).toMatchObject([
      { name: "id", required: true },
      { name: "name", required: true },
      { name: "kind", required: false },
    ]);
    expect(userEntity?.typeScript).toContain("Entity &");
    expect(JSON.parse(userEntity?.example ?? "{}")).toEqual({
      id: "string",
      kind: "user",
      name: "string",
    });
  });

  it("ignores missing and malformed model collections", () => {
    expect(extractSchemaModels({ paths: {} })).toEqual([]);
    expect(
      extractSchemaModels({
        components: { schemas: { Broken: null, Valid: { type: "string" } } },
      }),
    ).toMatchObject([{ name: "Valid", type: "string" }]);
  });
});
