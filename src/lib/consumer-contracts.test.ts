import { describe, expect, it } from "vitest";
import {
  captureConsumerContract,
  checkConsumerCompatibility,
  consumerFieldInventory,
  consumerReportMarkdown,
  ConsumerError,
  emptyConsumerProject,
  listConsumerOperations,
  MAX_CONSUMER_BYTES,
  parseConsumerFields,
  parseConsumerProject,
  parseConsumerRequest,
  readConsumerSource,
  serializeConsumerProject,
  serializeConsumerReport,
  validateConsumerProject,
  type ConsumerField,
  type ConsumerProject,
} from "./consumer-contracts";

const bodySchema = {
  type: "object",
  required: ["id", "profile", "items", "state"],
  properties: {
    id: { type: "integer" },
    state: { type: "string", enum: ["ready", "done"] },
    profile: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, bio: { type: "string" } },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["sku"],
        properties: { sku: { type: "string" } },
      },
    },
  },
};
function document(schema: unknown = bodySchema) {
  return {
    openapi: "3.1.0",
    info: { title: "Catalog", version: "1.0" },
    paths: {
      "/items/{id}": {
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        get: {
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { schema } },
            },
          },
        },
      },
    },
  };
}
const source = (schema: unknown = bodySchema) =>
  readConsumerSource(JSON.stringify(document(schema)));
function project(
  fields: ConsumerField[] = [
    { pointer: "/profile/name", types: ["string"], required: true },
  ],
): ConsumerProject {
  const reference = source(),
    operation = listConsumerOperations(reference)[0];
  return {
    ...emptyConsumerProject(),
    consumers: [
      {
        key: "web",
        name: "Web client",
        enabled: true,
        contracts: [
          captureConsumerContract(
            reference,
            operation,
            "200",
            "application/json",
            fields,
            "get-item",
          ),
        ],
      },
    ],
  };
}
const result = (p = project(), schema: unknown = bodySchema) =>
  checkConsumerCompatibility(p, source(schema)).consumers[0].contracts[0];
const codes = (r: ReturnType<typeof result>) => r.findings.map((f) => f.code);

describe("consumer response compatibility", () => {
  it("bounds schema composition work instead of certifying an incomplete analysis", () => {
    const p = project([{ pointer: "", types: ["object"], required: true }]);
    const schema = {
      allOf: Array.from({ length: 301 }, () => ({ type: "object" })),
    };
    expect(result(p, schema).status).toBe("review");
    expect(codes(result(p, schema))).toContain("limit");
  });
  it("captures only selected client dependencies and reports unrelated provider changes as compatible", () => {
    const p = project(),
      before = serializeConsumerProject(p);
    const candidate = structuredClone(bodySchema);
    candidate.properties.id.type = "string";
    expect(result(p, candidate).status).toBe("compatible");
    expect(serializeConsumerProject(p)).toBe(before);
    expect(p.consumers[0].contracts[0].fields).toHaveLength(1);
  });
  it("inventories nested required/optional fields and wildcard array items", () => {
    const reference = source();
    const inventory = consumerFieldInventory(
      reference,
      listConsumerOperations(reference)[0],
      "200",
      "application/json",
    );
    expect(inventory.find((f) => f.pointer === "/profile/name")).toMatchObject({
      required: true,
      types: ["string"],
    });
    expect(inventory.find((f) => f.pointer === "/profile/bio")).toMatchObject({
      required: false,
    });
    expect(inventory.find((f) => f.pointer === "/items/*/sku")).toMatchObject({
      required: true,
      types: ["string"],
    });
    expect(inventory.find((f) => f.pointer === "/state")?.enum).toEqual([
      "ready",
      "done",
    ]);
  });
  it("detects removed fields and optional parents", () => {
    const missing = {
      type: "object",
      required: ["profile"],
      properties: { profile: { type: "object", properties: {} } },
    };
    expect(result(project(), missing).status).toBe("breaking");
    expect(codes(result(project(), missing))).toContain("field-missing");
    const optional = structuredClone(bodySchema);
    optional.required = ["id", "items", "state"];
    expect(codes(result(project(), optional))).toContain("field-optional");
  });
  it("detects nullable parents and widened field types", () => {
    const candidate = {
      ...bodySchema,
      properties: {
        ...bodySchema.properties,
        profile: { ...bodySchema.properties.profile, type: ["object", "null"] },
      },
    };
    expect(codes(result(project(), candidate))).toContain("nullable-parent");
    const widened = {
      ...bodySchema,
      properties: {
        ...bodySchema.properties,
        profile: {
          ...bodySchema.properties.profile,
          properties: { name: { type: ["string", "null"] } },
        },
      },
    };
    expect(codes(result(project(), widened))).toContain("type-expanded");
  });
  it("allows narrowing types, integer responses for number consumers, and optional fields", () => {
    expect(
      result(project([{ pointer: "/id", required: true, types: ["number"] }]))
        .status,
    ).toBe("compatible");
    const p = project([
      { pointer: "/profile/name", required: false, types: ["string", "null"] },
    ]);
    const optional = { ...bodySchema, required: [] };
    expect(result(p, optional).status).toBe("compatible");
    const integer = project([
      { pointer: "/id", required: true, types: ["integer"] },
    ]);
    const number = {
      ...bodySchema,
      properties: { ...bodySchema.properties, id: { type: "number" } },
    };
    expect(codes(result(integer, number))).toContain("type-expanded");
  });
  it("detects enum expansion and allows a smaller enum or a const", () => {
    const p = project([
      {
        pointer: "/state",
        types: ["string"],
        required: true,
        enum: ["ready", "done"],
      },
    ]);
    const candidate = (state: unknown) => ({
      ...bodySchema,
      properties: { ...bodySchema.properties, state },
    });
    expect(
      result(p, candidate({ type: "string", enum: ["ready"] })).status,
    ).toBe("compatible");
    expect(result(p, candidate({ const: "done" })).status).toBe("compatible");
    expect(
      codes(
        result(
          p,
          candidate({ type: "string", enum: ["ready", "done", "unknown"] }),
        ),
      ),
    ).toContain("enum-expanded");
    expect(codes(result(p, candidate({ type: "string" })))).toContain(
      "enum-expanded",
    );
  });
  it("checks every array item without requiring a nonempty array", () => {
    const p = project([
      { pointer: "/items/*/sku", required: true, types: ["string"] },
    ]);
    expect(result(p).status).toBe("compatible");
    const candidate = {
      ...bodySchema,
      properties: {
        ...bodySchema.properties,
        items: {
          type: "array",
          items: { type: "object", properties: { sku: { type: "integer" } } },
        },
      },
    };
    expect(codes(result(p, candidate))).toEqual(
      expect.arrayContaining(["field-optional", "type-expanded"]),
    );
  });
  it("resolves local refs and allOf property/required/type intersections", () => {
    const doc = document({
      allOf: [
        { $ref: "#/components/schemas/Base" },
        {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      ],
    });
    const extended = {
      ...doc,
      components: {
        schemas: {
          Base: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "number" } },
          },
        },
      },
    };
    const p = project([
      { pointer: "/id", required: true, types: ["number"] },
      { pointer: "/name", required: true, types: ["string"] },
    ]);
    expect(
      checkConsumerCompatibility(
        p,
        readConsumerSource(JSON.stringify(extended)),
      ).consumers[0].status,
    ).toBe("compatible");
  });
  it("intersects enum/type constraints across allOf", () => {
    const p = project([
      { pointer: "", types: ["integer"], required: true, enum: [1, 2] },
    ]);
    expect(
      result(p, {
        allOf: [
          { type: "number", enum: [1, 2, 3] },
          { type: "integer", enum: [1, 2] },
        ],
      }).status,
    ).toBe("compatible");
  });
  it("interprets 3.0 nullable while 3.1 uses type unions", () => {
    const p = project([{ pointer: "", types: ["string"], required: true }]);
    const doc = {
      ...document({ type: "string", nullable: true }),
      openapi: "3.0.3",
    };
    expect(
      checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(doc)))
        .consumers[0].status,
    ).toBe("breaking");
    expect(result(p, { type: "string", nullable: true }).status).toBe(
      "compatible",
    );
  });
  it.each([
    { oneOf: [{ type: "string" }, { type: "integer" }] },
    { anyOf: [{ type: "string" }] },
    { type: "object", if: { required: ["x"] } },
    { type: "object", patternProperties: { x: { type: "string" } } },
    { $dynamicRef: "#node" },
    { $ref: "https://example.com/schema.json" },
    { $ref: "#/components/schemas/Missing" },
    false,
  ])("requires review for unsupported or unresolved schema %j", (schema) => {
    expect(
      result(
        project([{ pointer: "", types: ["string"], required: true }]),
        schema,
      ).status,
    ).toBe("review");
  });
  it("bounds recursive references and inventories without hanging", () => {
    const doc = {
      ...document({ $ref: "#/components/schemas/Node" }),
      components: {
        schemas: {
          Node: {
            type: "object",
            required: ["next"],
            properties: { next: { $ref: "#/components/schemas/Node" } },
          },
        },
      },
    };
    const reference = readConsumerSource(JSON.stringify(doc));
    expect(
      consumerFieldInventory(
        reference,
        listConsumerOperations(reference)[0],
        "200",
        "application/json",
      ).length,
    ).toBeLessThanOrEqual(11);
    const cyclic = {
      ...document({ $ref: "#/components/schemas/Loop" }),
      components: { schemas: { Loop: { $ref: "#/components/schemas/Loop" } } },
    };
    expect(
      checkConsumerCompatibility(
        project(),
        readConsumerSource(JSON.stringify(cyclic)),
      ).consumers[0].status,
    ).toBe("review");
  });
  it("preserves escaped and prototype-looking field names as data", () => {
    const schema = JSON.parse(
      '{"type":"object","required":["a/b","__proto__"],"properties":{"a/b":{"type":"string"},"__proto__":{"type":"integer"}}}',
    );
    const p = project([
      { pointer: "/a~1b", types: ["string"], required: true },
      { pointer: "/__proto__", types: ["number"], required: true },
    ]);
    expect(result(p, schema).status).toBe("compatible");
    const reference = source(schema);
    expect(
      consumerFieldInventory(
        reference,
        listConsumerOperations(reference)[0],
        "200",
        "application/json",
      ).map((f) => f.pointer),
    ).toContain("/a~1b");
  });
  it("does not certify undeclared or write-only response fields", () => {
    const p = project([
      { pointer: "/secret", types: ["string"], required: true },
    ]);
    const writeOnly = {
      type: "object",
      required: ["secret"],
      properties: { secret: { type: "string", writeOnly: true } },
    };
    expect(result(p, writeOnly).status).toBe("review");
    expect(
      result(p, { type: "object", additionalProperties: { type: "string" } })
        .status,
    ).toBe("breaking");
    expect(
      result(p, {
        type: "object",
        required: ["secret"],
        additionalProperties: { type: "string" },
      }).status,
    ).toBe("breaking");
  });
});

describe("operation, response, and request dependencies", () => {
  it("captures representative statuses that are not shadowed by exact/family declarations", () => {
    const makeResponse = (type: string) => ({
      description: "OK",
      content: { "application/json": { schema: { type } } },
    });
    const doc = {
      ...document(),
      paths: {
        "/items/{id}": {
          get: {
            responses: {
              "200": makeResponse("integer"),
              "2XX": makeResponse("string"),
              default: makeResponse("boolean"),
            },
          },
        },
      },
    };
    const reference = readConsumerSource(JSON.stringify(doc)),
      operation = listConsumerOperations(reference)[0];
    expect(operation.responses.map((r) => r.status)).toEqual([
      "200",
      "201",
      "400",
    ]);
    for (const variant of operation.responses) {
      const fields = consumerFieldInventory(
        reference,
        operation,
        variant.status,
        variant.mediaType,
      );
      const contract = captureConsumerContract(
        reference,
        operation,
        variant.status,
        variant.mediaType,
        fields,
        "response",
      );
      const p = {
        ...emptyConsumerProject(),
        consumers: [
          {
            key: "client",
            name: "Client",
            enabled: true,
            contracts: [contract],
          },
        ],
      };
      expect(checkConsumerCompatibility(p, reference).consumers[0].status).toBe(
        "compatible",
      );
    }
  });
  it("accepts request media wildcards using the most specific matching schema", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: 1 }],
      body: { mediaType: "application/json", value: { name: "Valid" } },
    };
    const base = document();
    const doc = {
      ...base,
      paths: {
        "/items/{id}": {
          ...base.paths["/items/{id}"],
          get: {
            ...base.paths["/items/{id}"].get,
            requestBody: {
              content: {
                "application/*": { schema: { type: "object" } },
                "*/*": { schema: { type: "string" } },
              },
            },
          },
        },
      },
    };
    expect(
      checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(doc)))
        .consumers[0].status,
    ).toBe("compatible");
  });
  it("requires review for path-item reference siblings instead of silently discarding them", () => {
    const base = document();
    const doc = {
      ...base,
      paths: {
        "/items/{id}": {
          $ref: "#/components/pathItems/Item",
          get: base.paths["/items/{id}"].get,
        },
      },
      components: { pathItems: { Item: base.paths["/items/{id}"] } },
    };
    expect(
      checkConsumerCompatibility(
        project(),
        readConsumerSource(JSON.stringify(doc)),
      ).consumers[0].status,
    ).toBe("review");
  });
  it("validates request nullability according to the source dialect without bypassing enum constraints", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: null }],
    };
    const check = (schema: unknown, version: string) => {
      const doc = document();
      doc.openapi = version;
      doc.paths["/items/{id}"].parameters[0].schema = schema as never;
      return checkConsumerCompatibility(
        p,
        readConsumerSource(JSON.stringify(doc)),
      ).consumers[0].status;
    };
    expect(check({ type: "integer", nullable: true }, "3.0.3")).toBe(
      "compatible",
    );
    expect(check({ type: "integer", nullable: true, enum: [1] }, "3.0.3")).toBe(
      "breaking",
    );
    expect(check({ type: "integer", nullable: true }, "3.1.0")).toBe(
      "breaking",
    );
    expect(check({ type: ["integer", "null"] }, "3.1.0")).toBe("compatible");
    expect(check({ type: "integer", "x-nullable": true }, "3.1.0")).toBe(
      "breaking",
    );
  });
  it("enforces 3.1 reference siblings while ignoring 3.0 schema reference siblings", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: 1 }],
    };
    const base = document();
    base.paths["/items/{id}"].parameters[0].schema = {
      $ref: "#/components/schemas/Id",
      minimum: 5,
    } as never;
    const doc = {
      ...base,
      components: { schemas: { Id: { type: "integer" } } },
    };
    expect(
      checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(doc)))
        .consumers[0].status,
    ).toBe("breaking");
    expect(
      checkConsumerCompatibility(
        p,
        readConsumerSource(JSON.stringify({ ...doc, openapi: "3.0.3" })),
      ).consumers[0].status,
    ).toBe("compatible");
  });
  it("requires review for request patterns and malformed validation constraints", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: 1 }],
    };
    for (const schema of [
      { type: "string", pattern: "(a+)+$" },
      { type: "wrong" },
      { type: "integer", minimum: "bad" },
      { type: "integer", enum: [] },
    ]) {
      const doc = document();
      doc.paths["/items/{id}"].parameters[0].schema = schema as never;
      expect(
        checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(doc)))
          .consumers[0].status,
      ).toBe("review");
    }
  });
  it("does not treat malformed explicit security as inherited public access", () => {
    const base = document();
    const doc = {
      ...base,
      paths: {
        "/items/{id}": {
          ...base.paths["/items/{id}"],
          get: { ...base.paths["/items/{id}"].get, security: null },
        },
      },
    };
    expect(
      checkConsumerCompatibility(
        project(),
        readConsumerSource(JSON.stringify(doc)),
      ).consumers[0].status,
    ).toBe("review");
  });
  it("detects operation, response, and media removals", () => {
    const p = project();
    for (const [doc, code] of [
      [{ ...document(), paths: {} }, "operation-missing"],
      [
        {
          ...document(),
          paths: {
            "/items/{id}": {
              get: { responses: { "404": { description: "Missing" } } },
            },
          },
        },
        "response-missing",
      ],
      [
        {
          ...document(),
          paths: {
            "/items/{id}": {
              get: {
                responses: {
                  "200": {
                    description: "OK",
                    content: { "text/plain": { schema: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
        "media-missing",
      ],
    ] as const) {
      const checked = checkConsumerCompatibility(
        p,
        readConsumerSource(JSON.stringify(doc)),
      ).consumers[0].contracts[0];
      expect(codes(checked)).toContain(code);
      expect(checked.status).toBe("breaking");
    }
  });
  it("uses exact responses before status families/defaults and wildcard media", () => {
    const p = project([{ pointer: "", types: ["string"], required: true }]);
    const responses = {
      "2XX": {
        description: "Any success",
        content: { "application/*": { schema: { type: "string" } } },
      },
      default: {
        description: "Fallback",
        content: { "*/*": { schema: { type: "string" } } },
      },
    };
    const doc = {
      ...document(),
      paths: { "/items/{id}": { get: { responses } } },
    };
    expect(
      checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(doc)))
        .consumers[0].status,
    ).toBe("compatible");
    const exact = {
      ...doc,
      paths: {
        "/items/{id}": {
          get: {
            responses: {
              ...responses,
              "200": {
                description: "Exact",
                content: {
                  "application/json": { schema: { type: "integer" } },
                },
              },
            },
          },
        },
      },
    };
    expect(
      checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(exact)))
        .consumers[0].status,
    ).toBe("breaking");
  });
  it("honors inherited security, explicit public overrides, and optional auth alternatives", () => {
    const p = project(),
      base = document();
    const secured = { ...base, security: [{ token: [] }] };
    expect(
      checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(secured)))
        .consumers[0].status,
    ).toBe("breaking");
    const publicDoc = {
      ...secured,
      paths: {
        "/items/{id}": {
          ...base.paths["/items/{id}"],
          get: { ...base.paths["/items/{id}"].get, security: [] },
        },
      },
    };
    expect(
      checkConsumerCompatibility(
        p,
        readConsumerSource(JSON.stringify(publicDoc)),
      ).consumers[0].status,
    ).toBe("compatible");
    const optional = { ...secured, security: [{ token: [] }, {}] };
    expect(
      checkConsumerCompatibility(
        p,
        readConsumerSource(JSON.stringify(optional)),
      ).consumers[0].status,
    ).toBe("compatible");
  });
  it("checks request examples against inherited/overridden parameter constraints", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: 1 }],
    };
    expect(result(p).status).toBe("compatible");
    const base = document();
    const doc = {
      ...base,
      paths: {
        "/items/{id}": {
          ...base.paths["/items/{id}"],
          get: {
            ...base.paths["/items/{id}"].get,
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "integer", minimum: 5 },
              },
              {
                name: "version",
                in: "query",
                required: true,
                schema: { type: "string" },
              },
            ],
          },
        },
      },
    };
    const checked = checkConsumerCompatibility(
      p,
      readConsumerSource(JSON.stringify(doc)),
    ).consumers[0].contracts[0];
    expect(codes(checked)).toEqual(
      expect.arrayContaining(["request-invalid", "request-parameter-missing"]),
    );
  });
  it("checks request body presence, media, and nested validation", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: 1 }],
    };
    const base = document();
    const doc = {
      ...base,
      paths: {
        "/items/{id}": {
          ...base.paths["/items/{id}"],
          get: {
            ...base.paths["/items/{id}"].get,
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: { name: { type: "string", minLength: 3 } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const provider = readConsumerSource(JSON.stringify(doc));
    expect(
      codes(checkConsumerCompatibility(p, provider).consumers[0].contracts[0]),
    ).toContain("request-body-missing");
    p.consumers[0].contracts[0].request.body = {
      mediaType: "application/json",
      value: { name: "x" },
    };
    expect(
      codes(checkConsumerCompatibility(p, provider).consumers[0].contracts[0]),
    ).toContain("request-invalid");
    p.consumers[0].contracts[0].request.body.value = { name: "Valid" };
    expect(checkConsumerCompatibility(p, provider).consumers[0].status).toBe(
      "compatible",
    );
    p.consumers[0].contracts[0].request.body.mediaType = "text/plain";
    expect(
      codes(checkConsumerCompatibility(p, provider).consumers[0].contracts[0]),
    ).toContain("request-media-missing");
  });
  it("requires review for unknown request validation vocabularies", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: 1 }],
    };
    const doc = document();
    doc.paths["/items/{id}"].parameters[0].schema = {
      type: "integer",
      oneOf: [{ const: 1 }],
    } as never;
    expect(
      checkConsumerCompatibility(p, readConsumerSource(JSON.stringify(doc)))
        .consumers[0].status,
    ).toBe("review");
  });
  it("resolves response, path-item, and parameter object references", () => {
    const base = document();
    const doc = {
      ...base,
      paths: { "/items/{id}": { $ref: "#/components/pathItems/Item" } },
      components: {
        pathItems: {
          Item: {
            parameters: [{ $ref: "#/components/parameters/Id" }],
            get: {
              responses: { "200": { $ref: "#/components/responses/Item" } },
            },
          },
        },
        parameters: { Id: base.paths["/items/{id}"].parameters[0] },
        responses: { Item: base.paths["/items/{id}"].get.responses["200"] },
      },
    };
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [{ name: "id", location: "path", value: 1 }],
    };
    const provider = readConsumerSource(JSON.stringify(doc));
    expect(listConsumerOperations(provider)).toHaveLength(1);
    expect(checkConsumerCompatibility(p, provider).consumers[0].status).toBe(
      "compatible",
    );
  });
  it("marks disabled dependencies and empty consumers as untracked and aggregates breaking impact", () => {
    const p = project();
    p.consumers.push({
      key: "empty",
      name: "Untracked",
      enabled: true,
      contracts: [],
    });
    p.consumers.push({
      key: "disabled",
      name: "Disabled",
      enabled: false,
      contracts: [
        { ...p.consumers[0].contracts[0], key: "disabled-dependency" },
      ],
    });
    p.consumers[0].contracts.push({
      ...p.consumers[0].contracts[0],
      key: "missing-dependency",
      path: "/missing",
    });
    const report = checkConsumerCompatibility(p, source());
    expect(report.counts).toEqual({
      compatible: 0,
      breaking: 1,
      review: 0,
      untracked: 2,
    });
    expect(report.contractCounts).toEqual({
      compatible: 1,
      breaking: 1,
      review: 0,
      untracked: 1,
    });
  });
  it("limits visible findings while prioritizing breaking findings", () => {
    const fields: ConsumerField[] = Array.from({ length: 25 }, (_, i) => ({
      pointer: `/missing-${i}`,
      required: false,
      types: ["string"],
    }));
    fields.push({ pointer: "/id", required: true, types: ["string"] });
    const checked = result(project(fields));
    expect(checked.findings).toHaveLength(20);
    expect(checked.hiddenFindings).toBe(6);
    expect(checked.findings[0].code).toBe("type-expanded");
    expect(checked.status).toBe("breaking");
  });
});

describe("consumer project portability", () => {
  it("round-trips projects, parses editable expectations, and exports reports without values", () => {
    const p = project();
    p.consumers[0].contracts[0].request = {
      parameters: [
        { name: "id", location: "path", value: 12345 },
        { name: "token", location: "header", value: "secret-example-value" },
      ],
    };
    expect(parseConsumerProject(serializeConsumerProject(p))).toEqual(p);
    expect(
      parseConsumerFields(
        '[{"pointer":"/id","types":["number"],"required":true}]',
      ),
    ).toHaveLength(1);
    expect(parseConsumerRequest('{"parameters":[]}')).toEqual({
      parameters: [],
    });
    const report = checkConsumerCompatibility(p, source());
    expect(serializeConsumerReport(report)).not.toContain(
      "secret-example-value",
    );
    expect(consumerReportMarkdown(report)).not.toContain(
      "secret-example-value",
    );
    expect(consumerReportMarkdown(report)).toContain("Web client");
    expect(consumerReportMarkdown(report)).toContain("parameter-removed");
  });
  it.each([
    (p: ConsumerProject) => ({ ...p, version: 2 }),
    (p: ConsumerProject) => ({
      ...p,
      consumers: [...p.consumers, p.consumers[0]],
    }),
    (p: ConsumerProject) => ({
      ...p,
      consumers: [
        {
          ...p.consumers[0],
          contracts: [p.consumers[0].contracts[0], p.consumers[0].contracts[0]],
        },
      ],
    }),
    (p: ConsumerProject) => ({
      ...p,
      consumers: [
        {
          ...p.consumers[0],
          contracts: [{ ...p.consumers[0].contracts[0], status: "2XX" }],
        },
      ],
    }),
  ])("rejects malformed project settings", (mutate) => {
    expect(() => validateConsumerProject(mutate(project()))).toThrow(
      ConsumerError,
    );
  });
  it.each([
    '[{"pointer":"bad","types":["string"],"required":true}]',
    '[{"pointer":"/bad~2","types":[],"required":false}]',
    '[{"pointer":"/id","types":["wrong"],"required":true}]',
    '[{"pointer":"/id","types":["number"],"required":true,"enum":[{}]}]',
    '[{"pointer":"/id","types":[],"required":true},{"pointer":"/id","types":[],"required":false}]',
  ])("rejects malformed field expectations %s", (text) => {
    expect(() => parseConsumerFields(text)).toThrow(ConsumerError);
  });
  it("rejects malformed/duplicate request examples and bounds aggregate imports", () => {
    expect(() =>
      parseConsumerRequest(
        '{"parameters":[{"name":"id","location":"body","value":1}]}',
      ),
    ).toThrow(ConsumerError);
    expect(() =>
      parseConsumerRequest(
        '{"parameters":[{"name":"X","location":"header","value":1},{"name":"x","location":"header","value":2}]}',
      ),
    ).toThrow(ConsumerError);
    expect(() =>
      parseConsumerProject(" ".repeat(MAX_CONSUMER_BYTES + 1)),
    ).toThrow(new ConsumerError("limit"));
    const p = project();
    p.consumers = Array.from({ length: 21 }, (_, i) => ({
      key: `consumer-${i}`,
      name: "Client",
      enabled: true,
      contracts: [],
    }));
    expect(() => validateConsumerProject(p)).toThrow(
      new ConsumerError("limit"),
    );
    expect(() => parseConsumerProject("{")).toThrow(new ConsumerError("json"));
  });
  it("rejects unsupported source versions/dialects and accepts YAML", () => {
    expect(() =>
      readConsumerSource(JSON.stringify({ ...document(), openapi: "3.2.0" })),
    ).toThrow(new ConsumerError("source"));
    expect(() =>
      readConsumerSource(
        JSON.stringify({
          ...document(),
          jsonSchemaDialect: "https://example.com/custom",
        }),
      ),
    ).toThrow(new ConsumerError("source"));
    expect(
      readConsumerSource(
        "openapi: 3.1.0\ninfo:\n  title: YAML API\n  version: '1'\npaths: {}\n",
      ).title,
    ).toBe("YAML API");
  });
});
