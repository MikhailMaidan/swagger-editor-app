import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  createExampleValidationReport,
  findJsonPointerSourceRange,
  getExampleConformancePercentage,
  parseJsonPointer,
  toJsonPointer,
  validateExampleValue,
} from "./example-validation";

function validate(schema: unknown, value: unknown, root = {}) {
  return validateExampleValue(root, schema, value).issues.map(
    ({ instancePath, keyword }) => `${keyword}@${instancePath}`,
  );
}

describe("example validation", () => {
  it("checks types, nullability, enums, and constants", () => {
    expect(validate({ type: "integer" }, 1.5)).toEqual(["type@"]);
    expect(validate({ type: "number" }, 3)).toEqual([]);
    expect(validate({ type: ["string", "null"] }, null)).toEqual([]);
    expect(validate({ nullable: true, type: "string" }, null)).toEqual([]);
    expect(validate({ "x-nullable": true, type: "string" }, null)).toEqual([]);
    expect(validate({ enum: ["a", { b: 1 }] }, { b: 1 })).toEqual([]);
    expect(validate({ enum: ["a", "b"] }, "c")).toEqual(["enum@"]);
    expect(validate({ const: [1, 2] }, [1, 2])).toEqual([]);
    expect(validate({ const: 1 }, 2)).toEqual(["const@"]);
  });

  it("checks string lengths, patterns, and common formats", () => {
    expect(validate({ maxLength: 2, minLength: 2 }, "😀😀")).toEqual([]);
    expect(validate({ minLength: 3 }, "ab")).toEqual(["minLength@"]);
    expect(validate({ pattern: "^[a-z]+$" }, "Abc")).toEqual(["pattern@"]);
    expect(validate({ pattern: "([" }, "anything")).toEqual([]);

    const valid = [
      ["date", "2024-02-29"],
      ["date-time", "2024-01-31T23:59:60.5+03:00"],
      ["email", "dev@example.com"],
      ["ipv4", "192.168.0.1"],
      ["ipv6", "2001:db8::1"],
      ["uri", "https://example.com/a?b=c"],
      ["uuid", "123e4567-e89b-12d3-a456-426614174000"],
      ["password", "anything goes"],
    ];
    const invalid = [
      ["date", "2023-02-29"],
      ["date-time", "2024-01-31 10:00:00"],
      ["email", "not-an-email"],
      ["ipv4", "256.1.1.1"],
      ["ipv6", "localhost"],
      ["uri", "/relative/path"],
      ["uuid", "123"],
    ];

    for (const [format, value] of valid) {
      expect(validate({ format, type: "string" }, value)).toEqual([]);
    }

    for (const [format, value] of invalid) {
      expect(validate({ format, type: "string" }, value)).toEqual(["format@"]);
    }
  });

  it("checks numeric bounds in OpenAPI 3.0 and 3.1 styles", () => {
    expect(validate({ maximum: 10, minimum: 1 }, 10)).toEqual([]);
    expect(validate({ exclusiveMaximum: true, maximum: 10 }, 10)).toEqual([
      "maximum@",
    ]);
    expect(validate({ exclusiveMinimum: 0 }, 0)).toEqual(["minimum@"]);
    expect(validate({ multipleOf: 0.1 }, 0.3)).toEqual([]);
    expect(validate({ multipleOf: 5 }, 12)).toEqual(["multipleOf@"]);
    expect(validate({ format: "int32", type: "integer" }, 2 ** 31)).toEqual([
      "format@",
    ]);
  });

  it("checks arrays, objects, and nested instance paths", () => {
    const schema = {
      additionalProperties: false,
      properties: {
        "a/b": { type: "string" },
        tags: {
          items: { type: "string" },
          maxItems: 3,
          uniqueItems: true,
        },
      },
      required: ["id"],
      type: "object",
    };

    expect(
      validate(schema, { "a/b": 1, extra: true, tags: ["x", 2, "x"] }),
    ).toEqual([
      "required@",
      "type@/a~1b",
      "additionalProperties@/extra",
      "uniqueItems@/tags",
      "type@/tags/1",
    ]);
    expect(
      validate(
        { additionalProperties: { type: "integer" }, maxProperties: 1 },
        { a: 1, b: "2" },
      ),
    ).toEqual(["maxProperties@", "type@/b"]);
    expect(
      validate(
        {
          additionalProperties: false,
          patternProperties: { "^x-": { type: "string" } },
        },
        { "x-trace": "abc" },
      ),
    ).toEqual([]);
  });

  it("resolves references and evaluates composition keywords", () => {
    const root = {
      components: {
        schemas: {
          Cat: {
            properties: { kind: { const: "cat" }, meows: { type: "boolean" } },
            required: ["kind"],
            type: "object",
          },
          Dog: {
            properties: { barks: { type: "boolean" }, kind: { const: "dog" } },
            required: ["kind"],
            type: "object",
          },
          Named: {
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      },
    };
    const pet = {
      discriminator: {
        mapping: { cat: "Cat", dog: "#/components/schemas/Dog" },
        propertyName: "kind",
      },
      oneOf: [
        { $ref: "#/components/schemas/Cat" },
        { $ref: "#/components/schemas/Dog" },
      ],
    };

    expect(
      validate(
        { allOf: [{ $ref: "#/components/schemas/Named" }] },
        { name: 1 },
        root,
      ),
    ).toEqual(["type@/name"]);
    expect(validate(pet, { kind: "dog", barks: "yes" }, root)).toEqual([
      "type@/barks",
    ]);
    expect(validate(pet, { kind: "cat", meows: 1 }, root)).toEqual([
      "type@/meows",
    ]);
    expect(
      validate(
        { ...pet, discriminator: { propertyName: "kind" } },
        { barks: true, kind: "Dog" },
        root,
      ),
    ).toEqual(["const@/kind"]);
    expect(
      validate({ anyOf: [{ type: "string" }, { type: "integer" }] }, true),
    ).toEqual(["anyOf@"]);
    expect(
      validate({ oneOf: [{ type: "number" }, { type: "integer" }] }, 1),
    ).toEqual(["oneOfMultiple@"]);
    expect(validate({ not: { type: "string" } }, "x")).toEqual(["not@"]);
    expect(validate({ $ref: "#/components/schemas/Missing" }, 1, root)).toEqual(
      [],
    );
  });

  it("stops recursive reference loops without hanging", () => {
    const root = {
      components: { schemas: { A: { $ref: "#/components/schemas/A" } } },
    };
    const result = validateExampleValue(
      root,
      { $ref: "#/components/schemas/A" },
      1,
    );

    expect(result.issues).toEqual([]);
  });

  it("applies read-only and write-only rules by example direction", () => {
    const schema = {
      properties: {
        id: { readOnly: true, type: "string" },
        password: { type: "string", writeOnly: true },
      },
      required: ["id", "password"],
      type: "object",
    };

    expect(
      validateExampleValue({}, schema, { id: "1" }, "request").issues.map(
        ({ keyword, severity }) => `${keyword}:${severity}`,
      ),
    ).toEqual(["required:error", "readOnly:warning"]);
    expect(
      validateExampleValue(
        {},
        schema,
        { password: "x" },
        "response",
      ).issues.map(({ keyword, severity }) => `${keyword}:${severity}`),
    ).toEqual(["required:error", "writeOnly:warning"]);
  });

  it("collects OpenAPI 3 examples from operations and components", () => {
    const root = YAML.parse(`
openapi: 3.1.0
info: { title: Pets, version: 1.0.0 }
paths:
  /pets/{id}:
    parameters:
      - $ref: '#/components/parameters/PetId'
    get:
      parameters:
        - name: limit
          in: query
          schema: { type: integer, minimum: 1 }
          examples:
            tooSmall: { value: 0 }
            remote: { externalValue: https://example.com/limit.json }
      responses:
        '200':
          description: OK
          headers:
            X-Rate-Limit:
              schema: { type: integer }
              example: fast
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Pet' }
              examples:
                shared: { $ref: '#/components/examples/PetExample' }
                serialized: { value: '{"id": 1, "name": "Rex"}' }
            application/xml:
              schema: { $ref: '#/components/schemas/Pet' }
              example: <pet/>
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Pet' }
            example: { id: 3, name: Rex }
      responses:
        '201':
          description: Created
components:
  parameters:
    PetId:
      name: id
      in: path
      schema: { type: string, format: uuid }
      example: not-a-uuid
  examples:
    PetExample:
      value: { id: 1 }
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id: { type: integer, readOnly: true, example: 1 }
        name: { type: string, examples: [Rex, 7] }
`);
    const report = createExampleValidationReport(root);
    const summary = report.entries.map((entry) => ({
      codes: entry.issues.map((issue) => issue.keyword),
      kind: entry.kind,
      label: entry.label,
      method: entry.method,
      name: entry.exampleName,
      pointer: entry.pointer,
      status: entry.status,
    }));

    expect(summary).toEqual([
      {
        codes: ["format"],
        kind: "parameter",
        label: "path · id",
        method: "GET",
        name: "",
        pointer: "/components/parameters/PetId/example",
        status: "invalid",
      },
      {
        codes: ["minimum"],
        kind: "parameter",
        label: "query · limit",
        method: "GET",
        name: "tooSmall",
        pointer: "/paths/~1pets~1{id}/get/parameters/0/examples/tooSmall/value",
        status: "invalid",
      },
      {
        codes: [],
        kind: "parameter",
        label: "query · limit",
        method: "GET",
        name: "remote",
        pointer: "/paths/~1pets~1{id}/get/parameters/0/examples/remote",
        status: "skipped",
      },
      {
        codes: ["required"],
        kind: "response",
        label: "200 · application/json",
        method: "GET",
        name: "shared",
        pointer: "/components/examples/PetExample/value",
        status: "invalid",
      },
      {
        codes: ["serialized"],
        kind: "response",
        label: "200 · application/json",
        method: "GET",
        name: "serialized",
        pointer:
          "/paths/~1pets~1{id}/get/responses/200/content/application~1json/examples/serialized/value",
        status: "warning",
      },
      {
        codes: [],
        kind: "response",
        label: "200 · application/xml",
        method: "GET",
        name: "",
        pointer:
          "/paths/~1pets~1{id}/get/responses/200/content/application~1xml/example",
        status: "skipped",
      },
      {
        codes: ["type"],
        kind: "header",
        label: "200 · X-Rate-Limit",
        method: "GET",
        name: "",
        pointer:
          "/paths/~1pets~1{id}/get/responses/200/headers/X-Rate-Limit/example",
        status: "invalid",
      },
      {
        codes: ["readOnly"],
        kind: "request-body",
        label: "application/json",
        method: "POST",
        name: "",
        pointer:
          "/paths/~1pets~1{id}/post/requestBody/content/application~1json/example",
        status: "warning",
      },
      {
        codes: [],
        kind: "schema",
        label: "Pet.id",
        method: "",
        name: "",
        pointer: "/components/schemas/Pet/properties/id/example",
        status: "valid",
      },
      {
        codes: [],
        kind: "schema",
        label: "Pet.name",
        method: "",
        name: "#1",
        pointer: "/components/schemas/Pet/properties/name/examples/0",
        status: "valid",
      },
      {
        codes: ["type"],
        kind: "schema",
        label: "Pet.name",
        method: "",
        name: "#2",
        pointer: "/components/schemas/Pet/properties/name/examples/1",
        status: "invalid",
      },
    ]);
    expect(report.entries[2].skipReason).toBe("external-value");
    expect(report.entries[5].skipReason).toBe("media-type");
    expect(report).toMatchObject({
      invalidCount: 5,
      skippedCount: 2,
      totalCount: 11,
      truncated: false,
      validCount: 2,
      warningCount: 2,
    });
    expect(getExampleConformancePercentage(report)).toBe(44);
  });

  it("collects Swagger 2.0 response examples, x-example values, and definitions", () => {
    const report = createExampleValidationReport({
      definitions: {
        Item: { properties: { price: { example: -1, minimum: 0 } } },
      },
      info: { title: "Legacy", version: "1" },
      paths: {
        "/items": {
          get: {
            parameters: [
              { in: "query", name: "page", type: "integer", "x-example": "2" },
            ],
            responses: {
              "200": {
                examples: { "application/json": [{ price: 3 }] },
                schema: {
                  items: { $ref: "#/definitions/Item" },
                  type: "array",
                },
              },
            },
          },
        },
      },
      swagger: "2.0",
    });

    expect(
      report.entries.map(({ label, status }) => `${label}:${status}`),
    ).toEqual([
      "query · page:invalid",
      "200 · application/json:valid",
      "Item.price:invalid",
    ]);
  });

  it("reports missing and unresolved schemas as skipped", () => {
    const report = createExampleValidationReport({
      openapi: "3.0.3",
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": { example: {} },
                  "text/plain": {
                    example: "x",
                    schema: { $ref: "#/components/schemas/Missing" },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(report.entries.map((entry) => entry.skipReason)).toEqual([
      "missing-schema",
      "unresolved-reference",
    ]);
    expect(getExampleConformancePercentage(report)).toBe(100);
  });

  it("bounds the number of reported issues for one example", () => {
    const report = createExampleValidationReport({
      components: {
        schemas: {
          List: {
            example: Array.from({ length: 30 }, () => "x"),
            items: { type: "integer" },
          },
        },
      },
      openapi: "3.0.0",
      paths: {},
    });

    expect(report.entries[0].issues).toHaveLength(20);
    expect(report.entries[0].hiddenIssueCount).toBe(10);
    expect(report.issueCount).toBe(30);
  });

  it("round-trips JSON pointers with escaped segments", () => {
    const segments = ["paths", "/a~b", "get"];

    expect(toJsonPointer(segments)).toBe("/paths/~1a~0b/get");
    expect(parseJsonPointer(toJsonPointer(segments))).toEqual(segments);
    expect(parseJsonPointer("/bad~2")).toBeNull();
    expect(parseJsonPointer("relative")).toBeNull();
  });

  it("locates example values in YAML and JSON source text", () => {
    const yamlText = [
      "paths:",
      "  /a:",
      "    get:",
      "      responses:",
      "        200:",
      "          content:",
      "            application/json:",
      "              example:",
      "                id: 1",
    ].join("\n");
    const pointer =
      "/paths/~1a/get/responses/200/content/application~1json/example";
    const yamlRange = findJsonPointerSourceRange(yamlText, pointer);

    expect(yamlText.slice(yamlRange!.start, yamlRange!.end)).toBe("id: 1");

    const trailingText = `${yamlText}\n                name: Rex\n\nother: true\n`;
    const trailingRange = findJsonPointerSourceRange(trailingText, pointer);

    expect(trailingText.slice(trailingRange!.start, trailingRange!.end)).toBe(
      "id: 1\n                name: Rex",
    );

    const jsonText = JSON.stringify({ items: [{ example: [1, 2] }] }, null, 2);
    const jsonRange = findJsonPointerSourceRange(jsonText, "/items/0/example");

    expect(
      JSON.parse(jsonText.slice(jsonRange!.start, jsonRange!.end)),
    ).toEqual([1, 2]);
    expect(findJsonPointerSourceRange(yamlText, "/paths/~1missing")).toBeNull();
    expect(findJsonPointerSourceRange("a: [", "/a/0")).toBeNull();
  });
});
