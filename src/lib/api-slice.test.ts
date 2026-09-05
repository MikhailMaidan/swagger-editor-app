import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { createApiSlice, createApiSliceExport } from "./api-slice";
import { parseOpenApiSchema } from "./openapi";

const response = (name: string) => ({
  "200": {
    description: "OK",
    content: {
      "application/json": { schema: { $ref: `#/components/schemas/${name}` } },
    },
  },
});

function fixture() {
  return {
    openapi: "3.1.0",
    info: { title: "Store API", version: "1.2", license: { name: "MIT" } },
    servers: [{ url: "https://example.test/v1" }],
    security: [{ token: [] }],
    tags: [{ name: "store", description: "Store operations" }],
    "x-team": { name: "Store" },
    paths: {
      "/items/{id}": {
        summary: "An item",
        servers: [{ url: "https://items.test" }],
        parameters: [{ $ref: "#/components/parameters/Id" }],
        get: {
          operationId: "getItem",
          tags: ["store"],
          responses: response("Item"),
        },
        delete: {
          deprecated: true,
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/admin": {
        post: { operationId: "admin", responses: response("Admin") },
      },
      "x-paths": { description: "Extension" },
    },
    webhooks: {
      changed: {
        post: {
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Event" },
              },
            },
          },
          responses: { "204": { description: "Accepted" } },
        },
      },
    },
    components: {
      parameters: {
        Id: {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      },
      schemas: {
        Item: {
          type: "object",
          properties: { owner: { $ref: "#/components/schemas/User" } },
        },
        User: {
          type: "object",
          properties: { item: { $ref: "#/components/schemas/Item" } },
        },
        Admin: { type: "object" },
        Event: { type: "string" },
      },
      securitySchemes: {
        token: { type: "http", scheme: "bearer" },
        unused: { type: "http", scheme: "basic" },
      },
    },
  };
}

function endpoints(schema: unknown) {
  const result = parseOpenApiSchema(JSON.stringify(schema));
  if (!result.ok) throw new Error(result.error);
  return result.value.endpoints;
}

describe("API slice export", () => {
  it("reports circular YAML aliases without crashing the workspace", () => {
    const schema = fixture();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      createApiSlice({ ...schema, "x-cycle": cyclic }, endpoints(schema))
        .issues,
    ).toEqual([{ code: "serialization-error", source: "#", target: "" }]);
  });
  it("exports selected operations with shared metadata and cyclic transitive dependencies without mutation", () => {
    const schema = fixture();
    const original = JSON.stringify(schema);
    const build = createApiSlice(schema, endpoints(schema).slice(0, 1));
    expect(build).toMatchObject({
      operationCount: 1,
      pathCount: 1,
      retainedComponentCount: 4,
      removedComponentCount: 3,
      issues: [],
    });
    expect(build.document).toMatchObject({
      info: schema.info,
      servers: schema.servers,
      tags: schema.tags,
      security: schema.security,
      "x-team": schema["x-team"],
    });
    const paths = build.document.paths as typeof schema.paths;
    expect(paths["/items/{id}"].get).toEqual(schema.paths["/items/{id}"].get);
    expect(paths["/items/{id}"].parameters).toEqual(
      schema.paths["/items/{id}"].parameters,
    );
    expect(paths["/items/{id}"].servers).toEqual(
      schema.paths["/items/{id}"].servers,
    );
    expect(paths["/items/{id}"].delete).toBeUndefined();
    expect(paths["/admin"]).toBeUndefined();
    expect(paths["x-paths"]).toEqual(schema.paths["x-paths"]);
    expect(build.document.webhooks).toBeUndefined();
    expect(JSON.stringify(schema)).toBe(original);
  });

  it("can retain unused components and explicitly include webhooks with their dependencies", () => {
    const schema = fixture();
    const selected = endpoints(schema).slice(0, 1);
    expect(
      createApiSlice(schema, selected, { pruneComponents: false })
        .retainedComponentCount,
    ).toBe(7);
    const build = createApiSlice(schema, selected, { includeWebhooks: true });
    expect(build.document.webhooks).toEqual(schema.webhooks);
    expect(build.retainedComponentCount).toBe(5);
  });

  it("filters deprecated operations, deduplicates selection, and handles an empty view", () => {
    const schema = fixture();
    const all = endpoints(schema);
    expect(
      createApiSlice(schema, [...all, ...all], { includeDeprecated: false })
        .operationCount,
    ).toBe(2);
    expect(createApiSlice(schema, []).operationCount).toBe(0);
    expect(
      createApiSlice({ openapi: "3.1.0", info: schema.info }, []).pathCount,
    ).toBe(0);
    expect(
      createApiSlice({ ...schema, paths: { bad: null } }, all).pathCount,
    ).toBe(0);
  });

  it("reports broken local references and missing security schemes, but ignores discarded components", () => {
    const schema = fixture();
    schema.paths["/items/{id}"].get.responses = response("Missing");
    schema.security = [{ absent: [] }] as unknown as typeof schema.security;
    const build = createApiSlice(schema, endpoints(schema).slice(0, 1));
    expect(
      build.issues
        .filter((issue) => issue.code === "broken-reference")
        .map((issue) => issue.target),
    ).toEqual(
      expect.arrayContaining([
        "#/components/schemas/Missing",
        "#/components/securitySchemes/absent",
      ]),
    );
    expect(build.issues).toHaveLength(2);
  });

  it("preserves external references without fetching and ignores reference-shaped examples", () => {
    const schema = fixture();
    const exampleSchema = {
      ...schema,
      components: {
        ...schema.components,
        schemas: {
          ...schema.components.schemas,
          Item: {
            $ref: "./models.yaml#/Item",
            example: { $ref: "#/not-a-reference" },
          },
        },
      },
    };
    const build = createApiSlice(
      exampleSchema,
      endpoints(exampleSchema).slice(0, 1),
    );
    expect(build.issues).toEqual([
      {
        code: "external-reference",
        source: "#/components/schemas/Item/$ref",
        target: "./models.yaml#/Item",
      },
    ]);
  });

  it.each([
    { discriminator: { propertyName: "kind", mapping: { admin: "Admin" } } },
    { $id: "https://example.test/schema" },
  ])(
    "retains components conservatively for implicit dependencies: %j",
    (extra) => {
      const schema = fixture();
      Object.assign(schema.components.schemas.Item, extra);
      const build = createApiSlice(schema, endpoints(schema).slice(0, 1));
      expect(build.removedComponentCount).toBe(0);
      expect(
        build.issues.some((issue) => issue.code === "preserved-components"),
      ).toBe(true);
      expect(
        createApiSlice(schema, endpoints(schema), { pruneComponents: false })
          .issues,
      ).toEqual([]);
    },
  );

  it("retains components referenced through whole containers", () => {
    const schema = fixture();
    schema.paths["/items/{id}"].get.responses["200"].content[
      "application/json"
    ].schema.$ref = "#/components/schemas";
    expect(
      createApiSlice(schema, endpoints(schema)).removedComponentCount,
    ).toBe(0);
  });

  it("retains escaped component names and referenced subproperties", () => {
    const schema = fixture();
    Object.assign(schema.components.schemas, {
      "A/B~C": { type: "object", properties: { value: { type: "string" } } },
    });
    schema.paths["/items/{id}"].get.responses = response(
      "A~1B~0C/properties/value",
    );
    const build = createApiSlice(schema, endpoints(schema).slice(0, 1));
    expect(build.issues).toEqual([]);
    expect(
      (build.document.components as typeof schema.components).schemas,
    ).toHaveProperty("A/B~C");
  });

  it("keeps Swagger 2 metadata, definitions, shared responses, and security", () => {
    const schema = {
      swagger: "2.0",
      info: { title: "Legacy", version: "1" },
      host: "example.test",
      basePath: "/v2",
      schemes: ["https"],
      security: [{ key: [] }],
      paths: {
        "/pets": {
          get: { responses: { "200": { $ref: "#/responses/Pets" } } },
        },
      },
      responses: {
        Pets: { description: "OK", schema: { $ref: "#/definitions/Pet" } },
      },
      definitions: { Pet: { type: "string" }, Unused: { type: "string" } },
      securityDefinitions: {
        key: { type: "apiKey", in: "header", name: "X-Key" },
      },
    };
    const build = createApiSlice(schema, endpoints(schema));
    expect(build.document).toMatchObject({
      swagger: "2.0",
      host: "example.test",
      basePath: "/v2",
      schemes: ["https"],
      securityDefinitions: schema.securityDefinitions,
      responses: schema.responses,
    });
    expect(build.document.definitions).toEqual({ Pet: { type: "string" } });
    expect(build.issues).toEqual([]);
  });

  it("warns about response links to excluded operations and resolves included targets", () => {
    const schema = fixture();
    Object.assign(schema.paths["/items/{id}"].get.responses["200"], {
      links: { admin: { operationId: "admin" } },
    });
    expect(
      createApiSlice(schema, endpoints(schema).slice(0, 1)).issues,
    ).toEqual([
      expect.objectContaining({ code: "linked-operation", target: "admin" }),
    ]);
    expect(createApiSlice(schema, endpoints(schema)).issues).toEqual([]);
  });

  it("flags referenced path items that could introduce unselected operations", () => {
    const schema = fixture();
    Object.assign(schema.paths["/items/{id}"], { $ref: "./path.yaml" });
    expect(createApiSlice(schema, endpoints(schema)).issues).toContainEqual({
      code: "path-reference",
      source: "/items/{id}",
      target: "./path.yaml",
    });
  });

  it("preserves the slice suffix when long titles are shortened", () => {
    const schema = fixture();
    const title = "A".repeat(300);
    schema.info.title = title;
    const build = createApiSlice(schema, endpoints(schema));
    for (const format of ["json", "yaml"] as const) {
      const exported = createApiSliceExport(build, title, format);
      expect(exported.fileName).toBe(`${"a".repeat(120)}-slice.${format}`);
      expect(YAML.parse(exported.content).info.title).toBe(title);
    }
  });

  it("round-trips JSON and YAML exports with safe filenames and original spec versions", () => {
    const schema = fixture();
    const build = createApiSlice(schema, endpoints(schema).slice(0, 1));
    for (const format of ["json", "yaml"] as const) {
      const exported = createApiSliceExport(build, "Store / API", format);
      expect(exported.fileName).toBe(`store-api-slice.${format}`);
      expect(exported.contentType).toBe(`application/${format}`);
      expect(YAML.parse(exported.content)).toEqual(build.document);
      const parsed = parseOpenApiSchema(exported.content);
      expect(parsed.ok && parsed.value.endpoints.length).toBe(1);
    }
  });
});
