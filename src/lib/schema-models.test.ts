import { describe, expect, it } from "vitest";
import { extractSchemaModels, getSchemaTypeScriptName } from "./schema-models";

describe("schema models", () => {
  it.each([false, true])(
    "ignores overridden parameter model usage with referenced parameters=%s",
    (referenced) => {
      const shared = {
        in: "query",
        name: "filter",
        schema: { $ref: "#/components/schemas/Shared" },
      };
      const local = {
        in: "query",
        name: "filter",
        schema: { $ref: "#/components/schemas/Local" },
      };
      const inherited = {
        in: "query",
        name: "other",
        schema: { $ref: "#/components/schemas/Inherited" },
      };
      const models = extractSchemaModels({
        components: {
          schemas: {
            Shared: { type: "string" },
            Local: { type: "string" },
            Inherited: { type: "string" },
          },
          parameters: { Shared: shared, Local: local },
        },
        paths: {
          "/value": {
            parameters: [
              referenced ? { $ref: "#/components/parameters/Shared" } : shared,
              inherited,
            ],
            get: {
              parameters: [
                referenced ? { $ref: "#/components/parameters/Local" } : local,
              ],
            },
            post: {
              responses: {
                "200": { description: "Inherits shared parameters" },
              },
            },
          },
        },
      });

      expect(models.find(({ name }) => name === "Shared")?.usages).toEqual([
        { kind: "request", method: "POST", path: "/value" },
      ]);
      expect(models.find(({ name }) => name === "Local")?.usages).toEqual([
        { kind: "request", method: "GET", path: "/value" },
      ]);
      expect(models.find(({ name }) => name === "Inherited")?.usages).toEqual([
        { kind: "request", method: "GET", path: "/value" },
        { kind: "request", method: "POST", path: "/value" },
      ]);
    },
  );

  it.each([
    { pathItem: "Shared", overrideParameters: false },
    { pathItem: "Alias", overrideParameters: true },
  ])(
    "tracks usage through Path Item $pathItem with overrideParameters=$overrideParameters",
    ({ pathItem, overrideParameters }) => {
      const response = (name: string) => ({
        "200": {
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${name}` },
            },
          },
        },
      });
      const models = extractSchemaModels({
        components: {
          schemas: {
            Request: { type: "string" },
            Response: { type: "boolean" },
            SharedParameter: { type: "string" },
            Overridden: { type: "number" },
          },
          pathItems: {
            Alias: { $ref: "#/components/pathItems/Shared" },
            Shared: {
              parameters: [
                {
                  in: "query",
                  name: "filter",
                  schema: { $ref: "#/components/schemas/SharedParameter" },
                },
              ],
              get: { responses: response("Overridden") },
              post: {
                requestBody: {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Request" },
                    },
                  },
                },
                responses: response("Response"),
              },
            },
          },
        },
        paths: {
          "/values": {
            $ref: `#/components/pathItems/${pathItem}`,
            ...(overrideParameters ? { parameters: [] } : {}),
            get: { responses: { "200": { description: "Local override" } } },
          },
        },
      });

      expect(models.find(({ name }) => name === "Request")?.usages).toEqual([
        { kind: "request", method: "POST", path: "/values" },
      ]);
      expect(models.find(({ name }) => name === "Response")?.usages).toEqual([
        { kind: "response", method: "POST", path: "/values" },
      ]);
      expect(
        models.find(({ name }) => name === "SharedParameter")?.usages,
      ).toEqual(
        overrideParameters
          ? []
          : [
              { kind: "request", method: "GET", path: "/values" },
              { kind: "request", method: "POST", path: "/values" },
            ],
      );
      expect(models.find(({ name }) => name === "Overridden")?.usages).toEqual(
        [],
      );
    },
  );

  it.each(["Missing", "Cycle"])(
    "keeps local operation usage when a Path Item reference is %s",
    (pathItem) => {
      const [model] = extractSchemaModels({
        components: {
          schemas: { Used: { type: "string" } },
          pathItems: { Cycle: { $ref: "#/components/pathItems/Cycle" } },
        },
        paths: {
          "/value": {
            $ref: `#/components/pathItems/${pathItem}`,
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Used" },
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(model.usages).toEqual([
        { kind: "response", method: "GET", path: "/value" },
      ]);
    },
  );

  it.each(["#/components/schemas/", "#/definitions/"])(
    "resolves nested model pointers under %s without using the container type",
    (prefix) => {
      const schemas = {
        Child: { type: "string", example: "child" },
        Unused: { type: "boolean" },
        Container: {
          type: "object",
          properties: {
            code: { type: "integer", example: 7 },
            child: { $ref: `${prefix}Child` },
            unused: { $ref: `${prefix}Unused` },
          },
        },
        Envelope: {
          type: "object",
          required: ["code", "child", "nullableCode"],
          properties: {
            code: { $ref: `${prefix}Container/properties/code` },
            child: { $ref: `${prefix}Container/properties/child` },
            nullableCode: {
              $ref: `${prefix}Container/properties/code`,
              nullable: true,
            },
          },
        },
      };
      const models = extractSchemaModels({
        ...(prefix.includes("components")
          ? { components: { schemas } }
          : { definitions: schemas }),
        paths: {
          "/value": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: `${prefix}Envelope` },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const envelope = models.find(({ name }) => name === "Envelope");

      expect(envelope?.typeScript).toContain("code: number;");
      expect(envelope?.typeScript).toContain("child: Child;");
      expect(envelope?.typeScript).toContain("nullableCode: number | null;");
      expect(envelope?.references).toEqual(["Child"]);
      expect(JSON.parse(envelope!.example)).toEqual({
        code: 7,
        child: "child",
        nullableCode: 7,
      });
      expect(envelope?.properties).toEqual([
        expect.objectContaining({ name: "code", type: "integer" }),
        expect.objectContaining({ name: "child", type: "Child" }),
        expect.objectContaining({
          name: "nullableCode",
          type: "integer",
          nullable: true,
        }),
      ]);
      expect(
        models.find(({ name }) => name === "Child")?.referencedBy,
      ).toContain("Envelope");
      expect(models.find(({ name }) => name === "Child")?.usages).toEqual([
        { kind: "response", method: "GET", path: "/value" },
      ]);
      expect(models.find(({ name }) => name === "Container")?.usages).toEqual(
        [],
      );
      expect(models.find(({ name }) => name === "Unused")?.usages).toEqual([]);
    },
  );

  it.each([
    {
      reference: "#/x-shared/0",
      type: "string",
      tsType: "string",
      example: "resolved",
    },
    {
      reference: "#/x-shared/1/oneOf/0",
      type: "integer",
      tsType: "number",
      example: 7,
    },
    {
      reference: "#/x-shared/%31/oneOf/%30",
      type: "integer",
      tsType: "number",
      example: 7,
    },
    {
      reference: "#/x-named/__proto__",
      type: "boolean",
      tsType: "boolean",
      example: false,
    },
  ])(
    "resolves schema details through the local pointer $reference",
    ({ reference, type, tsType, example }) => {
      const [model] = extractSchemaModels({
        "x-shared": [
          { type: "string", example: "resolved" },
          { oneOf: [{ type: "integer", example: 7 }] },
        ],
        "x-named": { ["__proto__"]: { type: "boolean", example: false } },
        components: {
          schemas: {
            Envelope: {
              type: "object",
              properties: { value: { $ref: reference } },
              required: ["value"],
            },
          },
        },
      });

      expect(model.typeScript).toContain(`value: ${tsType};`);
      expect(model.properties).toEqual([
        expect.objectContaining({ name: "value", type }),
      ]);
      expect(JSON.parse(model.example)).toEqual({ value: example });
    },
  );

  it.each([
    { type: "string", expected: "string" },
    { type: "number", expected: "number" },
    { type: "integer", expected: "number" },
    { type: "boolean", expected: "boolean" },
    { type: "array", expected: "Array<string>" },
    { type: ["string"], expected: "string" },
    { type: ["array"], expected: "Array<string>" },
  ])(
    "keeps the explicit type $type in model declarations with unrelated properties",
    ({ type, expected }) => {
      const [model] = extractSchemaModels({
        components: {
          schemas: {
            Value: {
              type,
              properties: { ignored: { type: "boolean" } },
              items: { type: "string" },
            },
          },
        },
      });

      expect(model.typeScript).toBe(`export type Value = ${expected};`);
    },
  );

  it.each([
    {
      name: "string with object properties",
      schema: { type: "string", properties: { ignored: { type: "boolean" } } },
      expected: "string",
    },
    {
      name: "string with array items",
      schema: { type: "string", items: { type: "integer" } },
      expected: "string",
    },
    {
      name: "array with object properties",
      schema: {
        type: "array",
        items: { type: "integer" },
        properties: { ignored: { type: "boolean" } },
      },
      expected: [0],
    },
    {
      name: "object with array items",
      schema: { type: "object", items: { type: "boolean" } },
      expected: {},
    },
    {
      name: "null-only type with structural keywords",
      schema: {
        type: ["null"],
        items: { type: "integer" },
        properties: { ignored: { type: "boolean" } },
      },
      expected: null,
    },
    {
      name: "first mixed type with array items",
      schema: { type: ["string", "array"], items: { type: "integer" } },
      expected: "string",
    },
    {
      name: "inferred object",
      schema: { properties: { id: { type: "integer" } } },
      expected: { id: 0 },
    },
    {
      name: "inferred array",
      schema: { items: { type: "boolean" } },
      expected: [false],
    },
  ])(
    "generates the correct example shape for $name",
    ({ schema, expected }) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            Value: schema,
            Envelope: { type: "object", properties: { value: schema } },
          },
        },
      });

      expect(
        JSON.parse(models.find(({ name }) => name === "Value")!.example),
      ).toEqual(expected);
      expect(
        JSON.parse(models.find(({ name }) => name === "Envelope")!.example),
      ).toEqual({ value: expected });
    },
  );

  it.each([
    { type: "array", maxItems: 0, items: { type: "string" } },
    { maxItems: 0, items: { type: "string" } },
  ])("generates empty arrays when maxItems is zero: %j", (schema) => {
    const models = extractSchemaModels({
      components: {
        schemas: {
          Value: schema,
          Envelope: { type: "object", properties: { value: schema } },
        },
      },
    });

    expect(
      JSON.parse(models.find(({ name }) => name === "Value")!.example),
    ).toEqual([]);
    expect(
      JSON.parse(models.find(({ name }) => name === "Envelope")!.example),
    ).toEqual({ value: [] });
  });

  it.each([
    { type: "integer", minimum: 0.5, expected: 1 },
    { type: "integer", minimum: -1.5, expected: -1 },
    { type: "integer", maximum: -0.5, expected: -1 },
    { type: "integer", maximum: 10, expected: 0 },
    { type: "number", minimum: 0.5, expected: 0.5 },
    { type: "number", maximum: -0.5, expected: -0.5 },
  ])(
    "generates a bounded numeric example for $type: $expected",
    ({ expected, ...schema }) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            Value: schema,
            Envelope: { type: "object", properties: { value: schema } },
          },
        },
      });

      expect(
        JSON.parse(models.find(({ name }) => name === "Value")!.example),
      ).toBe(expected);
      expect(
        JSON.parse(models.find(({ name }) => name === "Envelope")!.example),
      ).toEqual({ value: expected });
    },
  );

  it.each([
    {
      type: ["string", "array", "null"],
      items: { type: "integer" },
      expected: "string | array<integer>",
      nullable: true,
    },
    {
      type: ["array", "object"],
      items: { type: "string" },
      expected: "array<string> | object",
      nullable: false,
    },
  ])(
    "displays every alternative of mixed array types $type",
    ({ expected, nullable, ...schema }) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            Mixed: schema,
            Envelope: { type: "object", properties: { value: schema } },
          },
        },
      });

      expect(models.find(({ name }) => name === "Mixed")?.type).toBe(expected);
      expect(
        models.find(({ name }) => name === "Envelope")?.properties,
      ).toEqual([
        expect.objectContaining({ name: "value", type: expected, nullable }),
      ]);
    },
  );

  it.each([
    { type: ["string", "number"], expected: "string | number" },
    { type: ["integer", "number", "boolean"], expected: "number | boolean" },
    {
      type: ["null", "string", "boolean"],
      expected: "string | boolean | null",
    },
    {
      type: ["object", "string"],
      properties: { id: { type: "integer" } },
      required: ["id"],
      expected: "{ id: number; } | string",
    },
    {
      type: ["string", "array", "null"],
      items: { type: "integer" },
      expected: "string | Array<number> | null",
    },
    {
      type: ["array", "object"],
      items: { type: "string" },
      properties: { id: { type: "integer" } },
      expected: "Array<string> | { id?: number; }",
    },
  ])(
    "preserves all schema type alternatives $type",
    ({ expected, ...schema }) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            Value: schema,
            Envelope: {
              type: "object",
              properties: { value: schema },
              required: ["value"],
            },
          },
        },
      });

      expect(models.find(({ name }) => name === "Value")?.typeScript).toBe(
        `export type Value = ${expected};`,
      );
      expect(
        models.find(({ name }) => name === "Envelope")?.typeScript,
      ).toContain(`value: ${expected};`);
    },
  );

  it.each(["created", "", 42, 0, true, false, null])(
    "preserves the primitive const value %j in TypeScript models and examples",
    (value) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            Constant: { const: value },
            Event: {
              type: "object",
              properties: { kind: { const: value } },
              required: ["kind"],
            },
          },
        },
      });
      const constant = models.find(({ name }) => name === "Constant");
      const event = models.find(({ name }) => name === "Event");

      expect(constant?.typeScript).toBe(
        `export type Constant = ${JSON.stringify(value)};`,
      );
      expect(event?.typeScript).toContain(`kind: ${JSON.stringify(value)};`);
      expect(JSON.parse(constant?.example ?? "")).toEqual(value);
      expect(JSON.parse(event?.example ?? "")).toEqual({ kind: value });
    },
  );

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

  it.each([
    { name: "User.Profile", encoded: "User%2EProfile" },
    { name: "User Name", encoded: "User%20Name" },
    { name: "Модель", encoded: "%D0%9C%D0%BE%D0%B4%D0%B5%D0%BB%D1%8C" },
    { name: "A/B~C", encoded: "A%7E1B%7E0C" },
    { name: "A~2B", encoded: "A~02B" },
    { name: "100%", encoded: "100%25" },
  ])(
    "resolves the percent-encoded model reference $encoded",
    ({ name, encoded }) => {
      const reference = `#/components/schemas/${encoded}`;
      const models = extractSchemaModels({
        components: {
          schemas: {
            [name]: { type: "string", example: "resolved" },
            Envelope: {
              type: "object",
              properties: { value: { $ref: reference } },
              required: ["value"],
            },
          },
        },
        paths: {
          "/result": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": { schema: { $ref: reference } },
                  },
                },
              },
            },
          },
        },
      });
      const referenced = models.find((model) => model.name === name);
      expect(referenced).toMatchObject({
        referencedBy: ["Envelope"],
        usages: [{ kind: "response", method: "GET", path: "/result" }],
      });
      const envelope = models.find((model) => model.name === "Envelope");
      expect(envelope?.references).toEqual([name]);
      expect(envelope?.example).toBe('{\n  "value": "resolved"\n}');
      expect(envelope?.typeScript).toContain(
        `value: ${getSchemaTypeScriptName(name)};`,
      );
    },
  );

  it.each([
    { name: "A~2B", encoded: "A~2B" },
    { name: "A~", encoded: "A~" },
    { name: "A~xB", encoded: "A~xB" },
    { name: "A~2B", encoded: "A%7E2B" },
  ])(
    "does not resolve a malformed JSON Pointer escape in $encoded",
    ({ name, encoded }) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            [name]: { type: "string", example: "must not resolve" },
            Envelope: {
              type: "object",
              properties: {
                value: { $ref: `#/components/schemas/${encoded}` },
              },
              required: ["value"],
            },
          },
        },
      });
      const envelope = models.find(({ name }) => name === "Envelope");

      expect(envelope?.references).toEqual([]);
      expect(envelope?.typeScript).toContain("value: unknown;");
      expect(JSON.parse(envelope!.example)).toEqual({ value: null });
      expect(models.find((model) => model.name === name)?.referencedBy).toEqual(
        [],
      );
    },
  );

  it.each(["%", "%ZZ", "%E0%A4%A"])(
    "handles malformed percent escapes in references without linking a model: %s",
    (encoded) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            [encoded]: { type: "string" },
            Envelope: {
              type: "object",
              properties: {
                value: { $ref: `#/components/schemas/${encoded}` },
              },
              required: ["value"],
            },
          },
        },
      });
      const envelope = models.find(({ name }) => name === "Envelope");
      expect(envelope?.references).toEqual([]);
      expect(envelope?.typeScript).toContain("value: unknown;");
      expect(envelope?.example).toBe('{\n  "value": null\n}');
    },
  );

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

  it.each([{ type: "null" }, { type: ["null"] }])(
    "preserves the null-only type $type in model declarations and properties",
    ({ type }) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            NullResult: { type },
            Envelope: {
              type: "object",
              required: ["value", "result", "items"],
              properties: {
                value: { type },
                result: { $ref: "#/components/schemas/NullResult" },
                items: { type: "array", items: { type } },
              },
            },
          },
        },
      });

      expect(models.find(({ name }) => name === "NullResult")).toMatchObject({
        example: "null",
        type: "null",
        typeScript: "export type NullResult = null;",
      });
      const envelope = models.find(({ name }) => name === "Envelope");
      expect(envelope?.typeScript).toContain("value: null;");
      expect(envelope?.typeScript).toContain("result: NullResult;");
      expect(envelope?.typeScript).toContain("items: Array<null>;");
      expect(envelope?.properties).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "value",
            type: "null",
            nullable: true,
          }),
          expect.objectContaining({ name: "result", nullable: true }),
          expect.objectContaining({ name: "items", type: "array<null>" }),
        ]),
      );
    },
  );

  it.each([
    {
      name: "enum text",
      schema: { type: "string", nullable: true, enum: ["a | null | b"] },
      expected: '"a | null | b" | null',
    },
    {
      name: "escaped constant text",
      schema: { const: 'a " | null | " b', nullable: true },
      expected: `${JSON.stringify('a " | null | " b')} | null`,
    },
    {
      name: "nullable object properties",
      schema: {
        type: "object",
        nullable: true,
        properties: { value: { enum: ["a", null, "b"] } },
      },
      expected: '{ value?: "a" | null | "b"; } | null',
    },
    {
      name: "nullable array items",
      schema: { type: ["array", "null"], items: { enum: ["a", null, "b"] } },
      expected: 'Array<"a" | null | "b"> | null',
    },
    {
      name: "model names containing null",
      schema: { $ref: "#/components/schemas/$null", nullable: true },
      expected: "$null | null",
    },
    {
      name: "intersections containing null",
      schema: { allOf: [{ type: "string" }, { type: "null" }], nullable: true },
      expected: "string & null | null",
    },
    ...[
      { enum: [null, "a", "b"], expected: 'null | "a" | "b"' },
      { enum: ["a", null, "b"], expected: '"a" | null | "b"' },
      { enum: ["a", "b", null], expected: '"a" | "b" | null' },
    ].map(({ enum: values, expected }) => ({
      name: `top-level null in ${expected}`,
      schema: { enum: values, nullable: true },
      expected,
    })),
  ])("preserves outer nullability with $name", ({ schema, expected }) => {
    const models = extractSchemaModels({
      components: {
        schemas: { Value: schema, $null: { type: "string" } },
      },
    });

    expect(models.find(({ name }) => name === "Value")?.typeScript).toBe(
      `export type Value = ${expected};`,
    );
  });

  it.each([{ type: "object", nullable: true }, { type: ["object", "null"] }])(
    "exports nullable object model $type with its null alternative",
    (schema) => {
      const models = extractSchemaModels({
        components: {
          schemas: {
            MaybeUser: {
              ...schema,
              properties: { name: { type: "string" } },
              required: ["name"],
            },
            Holder: {
              type: "object",
              properties: { user: { $ref: "#/components/schemas/MaybeUser" } },
              required: ["user"],
            },
          },
        },
      });

      const model = models.find(({ name }) => name === "MaybeUser");
      expect(model?.typeScript).toBe(
        "export type MaybeUser = { name: string; } | null;",
      );
      expect(model?.properties).toEqual([
        expect.objectContaining({
          name: "name",
          required: true,
          type: "string",
        }),
      ]);
      const holder = models.find(({ name }) => name === "Holder");
      expect(holder?.typeScript).toContain("export interface Holder");
      expect(holder?.typeScript).toContain("user: MaybeUser;");
    },
  );

  it.each([{ unionFirst: true }, { unionFirst: false }])(
    "keeps union grouping in intersections with unionFirst=$unionFirst",
    ({ unionFirst }) => {
      const choice = {
        oneOf: [
          {
            type: "object",
            properties: { kind: { enum: ["a"] } },
            required: ["kind"],
          },
          {
            type: "object",
            properties: { kind: { enum: ["b"] } },
            required: ["kind"],
          },
        ],
      };
      const tag = {
        type: "object",
        properties: { tag: { type: "string" } },
        required: ["tag"],
      };
      const [model] = extractSchemaModels({
        components: {
          schemas: {
            TaggedValue: { allOf: unionFirst ? [choice, tag] : [tag, choice] },
          },
        },
      });

      const union = '({ kind: "a"; } | { kind: "b"; })';
      const intersection = unionFirst
        ? `${union} & { tag: string; }`
        : `{ tag: string; } & ${union}`;
      expect(model.typeScript).toBe(
        `export type TaggedValue = ${intersection};`,
      );
    },
  );
});
