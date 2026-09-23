import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { parseOpenApiSchema } from "./openapi";
import {
  addComposerServices,
  composeApis,
  ComposerError,
  MAX_COMPOSER_SOURCE_BYTES,
  parseComposerProject,
  readComposerSource,
  serializeComposedApi,
  serializeComposerInventory,
  serializeComposerProject,
  type ComposerProject,
} from "./api-composer";

const response = {
  description: "OK",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Item" } },
  },
};
const operation = (extra: Record<string, unknown> = {}) => ({
  operationId: "getItem",
  tags: ["Items"],
  responses: { "200": response },
  ...extra,
});
const schema = (extra: Record<string, unknown> = {}) => ({
  openapi: "3.1.0",
  info: { title: "Catalog", version: "1.0" },
  servers: [{ url: "https://catalog.example.com/v1" }],
  paths: {
    "/items/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: operation(),
    },
  },
  components: {
    schemas: {
      Item: { type: "object", properties: { id: { type: "string" } } },
    },
  },
  ...extra,
});
function project(...sources: unknown[]): ComposerProject {
  return addComposerServices(
    {
      title: "Gateway",
      version: "2.0",
      gatewayUrl: "https://gateway.example.com/api",
      services: [],
    },
    sources.map((source) => ({
      name: "service.json",
      text: JSON.stringify(source),
    })),
  );
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("composition projects", () => {
  it("imports JSON/YAML and round-trips disabled services, source text, and custom settings", () => {
    const next = addComposerServices(project(schema()), [
      { name: "other.yaml", text: YAML.stringify(schema()) },
    ]);
    next.services[1] = {
      ...next.services[1],
      namespace: "billing",
      prefix: "/billing/v2",
      enabled: false,
    };
    expect(parseComposerProject(serializeComposerProject(next))).toEqual(next);
    expect(readComposerSource(YAML.stringify(schema())).info).toEqual(
      schema().info,
    );
  });
  it.each([
    "{",
    "null",
    "[]",
    '{"openapi":"3.1.0"}',
    JSON.stringify(schema({ openapi: "3.2.0" })),
    JSON.stringify({ swagger: "2.0", info: { title: "Old" }, paths: {} }),
  ])("rejects unsupported or malformed sources: %s", (text) => {
    expect(() => readComposerSource(text)).toThrow(ComposerError);
  });
  it("bounds source size, nesting, service count, and combined inputs without changing the project", () => {
    expect(() =>
      readComposerSource(" ".repeat(MAX_COMPOSER_SOURCE_BYTES + 1)),
    ).toThrow("limit");
    const current = project(schema());
    const before = JSON.stringify(current);
    expect(() =>
      addComposerServices(
        current,
        Array.from({ length: 8 }, () => ({
          name: "a",
          text: JSON.stringify(schema()),
        })),
      ),
    ).toThrow("limit");
    expect(JSON.stringify(current)).toBe(before);
    const huge = schema({ "x-data": "a".repeat(900_000) });
    expect(() => project(huge, huge)).toThrow("limit");
    expect(() =>
      readComposerSource(
        "openapi: 3.1.0\ninfo: &a { title: Loop, data: *a }\npaths: {}\n",
      ),
    ).toThrow(ComposerError);
  });
  it("rejects malformed project values and duplicate identities", () => {
    for (const value of [
      null,
      {},
      { format: "unknown", formatVersion: 1 },
      {
        format: "rsswag-gateway-composition",
        formatVersion: 2,
        project: project(schema()),
      },
    ])
      expect(() => parseComposerProject(JSON.stringify(value))).toThrow(
        "project",
      );
    const next = project(schema(), schema());
    next.services[1].key = next.services[0].key;
    expect(() => serializeComposerProject(next)).toThrow("project");
    const bad = plain(project(schema()));
    bad.services[0].enabled = "false";
    expect(() =>
      parseComposerProject(
        JSON.stringify({
          format: "rsswag-gateway-composition",
          formatVersion: 1,
          project: bad,
        }),
      ),
    ).toThrow("project");
  });
});

describe("API gateway composition", () => {
  it("combines independent APIs with isolated components, tags, IDs, and gateway routing", () => {
    const next = project(
      schema(),
      schema({ info: { title: "Billing", version: "2" } }),
    );
    const before = JSON.stringify(next);
    const result = composeApis(next);
    expect(result.canExport).toBe(true);
    expect(result.routes).toHaveLength(2);
    expect(result.componentCount).toBe(2);
    const doc = plain(result.document);
    expect(Object.keys(doc.components.schemas)).toEqual([
      "service-1__Item",
      "service-2__Item",
    ]);
    expect(doc.paths["/service-1/items/{id}"].get).toMatchObject({
      operationId: "service-1__id_getItem",
      tags: ["service-1: Items"],
      security: [],
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/service-1__Item" },
            },
          },
        },
      },
    });
    expect(result.routes[0]).toMatchObject({
      gatewayPath: "/service-1/items/{id}",
      sourcePath: "/items/{id}",
      upstreamServers: ["https://catalog.example.com/v1"],
    });
    expect(doc["x-gateway-services"]["service-2"].info.title).toBe("Billing");
    expect(JSON.stringify(next)).toBe(before);
    for (const format of ["json", "yaml"] as const) {
      const parsed = parseOpenApiSchema(serializeComposedApi(result, format));
      expect(parsed.ok).toBe(true);
      if (parsed.ok)
        expect(
          parsed.value.endpoints.every(
            (e) => e.serverUrl === "https://gateway.example.com/api",
          ),
        ).toBe(true);
    }
  });
  it("preserves inherited security, AND/OR requirements, scopes, and explicit public operations", () => {
    const source = schema({
      security: [{ token: [], apiKey: [] }, {}],
      components: {
        securitySchemes: {
          token: { type: "http", scheme: "bearer" },
          apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        },
      },
      paths: {
        "/secured": {
          get: operation({ responses: { "200": { description: "OK" } } }),
        },
        "/public": {
          get: operation({
            operationId: "public",
            security: [],
            responses: { "200": { description: "OK" } },
          }),
        },
      },
    });
    const doc = plain(composeApis(project(source)).document);
    expect(doc.paths["/service-1/secured"].get.security).toEqual([
      { "service-1__token": [], "service-1__apiKey": [] },
      {},
    ]);
    expect(doc.paths["/service-1/public"].get.security).toEqual([]);
    expect(doc.components.securitySchemes["service-1__apiKey"].name).toBe(
      "X-API-Key",
    );
  });
  it.each([[{ absent: [] }], null, [{ token: "scope" }]])(
    "blocks invalid security instead of making endpoints public: %j",
    (security) => {
      const result = composeApis(project(schema({ security })));
      expect(result.canExport).toBe(false);
      expect(result.issues.some((i) => i.code === "security")).toBe(true);
    },
  );
  it("rewrites links by operation ID and escaped/URI-encoded local pointers", () => {
    const source = schema({
      paths: {
        "/items/{id}": {
          get: operation({
            responses: {
              "200": {
                ...response,
                links: {
                  self: { operationId: "getItem" },
                  encoded: { operationRef: "#/paths/~1items~1%7Bid%7D/get" },
                },
              },
            },
          }),
        },
      },
    });
    const result = composeApis(project(source));
    expect(result.canExport).toBe(true);
    const links = plain(result.document).paths["/service-1/items/{id}"].get
      .responses["200"].links;
    expect(links.self.operationId).toBe("service-1__id_getItem");
    expect(links.encoded.operationRef).toBe(
      "#/paths/~1service-1~1items~1{id}/get",
    );
  });
  it("preserves payloads and vendor extension data containing structural-looking keys", () => {
    const payload = {
      $ref: "#/not-a-reference",
      operationId: "literal",
      security: [{ unchanged: [] }],
      tags: ["literal"],
      $id: "not-a-schema-id",
    };
    const source = schema({
      "x-settings": payload,
      paths: {
        "/items": {
          get: operation({
            "x-config": payload,
            responses: {
              "x-note": payload,
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    example: payload,
                    examples: { literal: { value: payload } },
                    schema: {
                      type: "object",
                      default: payload,
                      examples: [payload],
                      properties: {
                        operationId: { type: "string" },
                        $ref: { type: "string" },
                        security: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
      },
    });
    const result = composeApis(project(source));
    expect(result.canExport).toBe(true);
    const op = plain(result.document).paths["/service-1/items"].get;
    expect(op["x-config"]).toEqual(payload);
    expect(op.responses["x-note"]).toEqual(payload);
    expect(op.responses["200"].content["application/json"].example).toEqual(
      payload,
    );
    expect(
      op.responses["200"].content["application/json"].schema.default,
    ).toEqual(payload);
    expect(result.issues.every((i) => i.code === "extensions")).toBe(true);
  });
  it("retains recursive schema references and prototype-looking property names without pollution", () => {
    const source = schema({
      components: {
        schemas: {
          Item: JSON.parse(
            '{"type":"object","properties":{"__proto__":{"$ref":"#/components/schemas/Item"},"a/b~c":{"type":"string"},"value":{"$ref":"#/components/schemas/Item/properties/a~1b~0c"}}}',
          ),
        },
      },
    });
    const result = composeApis(project(source));
    expect(result.canExport).toBe(true);
    const props = plain(result.document).components.schemas["service-1__Item"]
      .properties;
    expect(Object.hasOwn(props, "__proto__")).toBe(true);
    expect(props.value.$ref).toBe(
      "#/components/schemas/service-1__Item/properties/a~1b~0c",
    );
    expect(({} as Record<string, unknown>).$ref).toBeUndefined();
  });
  it("keeps callback and webhook contracts with their own servers and security", () => {
    const eventOperation = {
      operationId: "receiveEvent",
      responses: { "204": { description: "Received" } },
    };
    const source = schema({
      security: [{ token: [] }],
      components: {
        securitySchemes: { token: { type: "http", scheme: "bearer" } },
      },
      paths: {
        "/start": {
          servers: [{ url: "https://path.example.com" }],
          post: {
            operationId: "start",
            servers: [{ url: "https://operation.example.com" }],
            responses: { "202": { description: "Queued" } },
            callbacks: {
              completed: {
                "{$request.body#/callbackUrl}": { post: eventOperation },
              },
            },
          },
        },
      },
      webhooks: {
        changed: {
          servers: [{ url: "https://receiver.example.com" }],
          post: { ...eventOperation, operationId: "webhookEvent" },
        },
      },
    });
    const result = composeApis(project(source));
    expect(result.canExport).toBe(true);
    const doc = plain(result.document),
      path = doc.paths["/service-1/start"];
    expect(path.servers).toBeUndefined();
    expect(path.post.servers).toBeUndefined();
    expect(result.routes[0].upstreamServers).toEqual([
      "https://operation.example.com",
    ]);
    const callback =
      path.post.callbacks.completed["{$request.body#/callbackUrl}"].post;
    expect(callback.operationId).toBe("service-1__id_receiveEvent");
    expect(callback.servers).toEqual(source.servers);
    expect(callback.security).toEqual([{ "service-1__token": [] }]);
    expect(doc.webhooks["service-1__changed"].servers).toEqual([
      { url: "https://receiver.example.com" },
    ]);
  });
  it("blocks duplicate and equivalent gateway paths, even when methods differ", () => {
    const next = project(
      schema(),
      schema({ paths: { "/items/{other}": { post: operation() } } }),
    );
    next.services.forEach((s) => (s.prefix = ""));
    const result = composeApis(next);
    expect(result.canExport).toBe(false);
    expect(result.issues.some((i) => i.code === "collision")).toBe(true);
    expect(result.routes).toHaveLength(1);
    expect(() => serializeComposedApi(result, "yaml")).toThrow("output");
    next.services[1].prefix = "/billing";
    expect(composeApis(next).canExport).toBe(true);
  });
  it("blocks duplicate namespaces and IDs and generates unique IDs when absent", () => {
    const next = project(schema(), schema());
    next.services[1].namespace = "service-1";
    expect(composeApis(next).issues.some((i) => i.code === "namespace")).toBe(
      true,
    );
    const duplicate = composeApis(
      project(
        schema({
          paths: { "/a": { get: operation() }, "/b": { get: operation() } },
        }),
      ),
    );
    expect(duplicate.issues.some((i) => i.code === "operationId")).toBe(true);
    const generated = composeApis(
      project(
        schema({
          paths: {
            "/a": { get: { responses: { "200": response } } },
            "/b": { post: { responses: { "200": response } } },
          },
        }),
      ),
    );
    expect(new Set(generated.routes.map((r) => r.operationId)).size).toBe(2);
    expect(generated.canExport).toBe(true);
  });
  it("rejects mixed version families and dialects while honoring excluded services", () => {
    const next = project(schema(), schema({ openapi: "3.0.3" }));
    expect(composeApis(next).issues.some((i) => i.code === "version")).toBe(
      true,
    );
    next.services[1].enabled = false;
    expect(composeApis(next).canExport).toBe(true);
    expect(
      composeApis(
        project(schema({ openapi: "3.0.3" }), schema({ openapi: "3.0.3" })),
      ).canExport,
    ).toBe(true);
    expect(
      composeApis(
        project(
          schema(),
          schema({ jsonSchemaDialect: "https://example.com/custom" }),
        ),
      ).canExport,
    ).toBe(false);
  });
  it.each([
    "",
    "ftp://example.com",
    "https://user:password@example.com",
    "https://example.com?token=secret",
    "https://example.com#fragment",
    "https://{{host}}",
  ])("rejects invalid gateway URLs: %s", (gatewayUrl) => {
    expect(() => composeApis({ ...project(schema()), gatewayUrl })).toThrow(
      "settings",
    );
  });
  it.each([
    "relative",
    "/../users",
    "/users/{id}",
    "/users?x=1",
    "/users#fragment",
  ])("rejects nonstatic route prefixes: %s", (prefix) => {
    const next = project(schema());
    next.services[0].prefix = prefix;
    expect(composeApis(next).issues.some((i) => i.code === "settings")).toBe(
      true,
    );
  });
  it("blocks external, missing, and removed-metadata references without fetching anything", () => {
    const network = vi.spyOn(globalThis, "fetch");
    try {
      for (const ref of [
        "https://example.com/schema.json",
        "other.yaml#/Item",
        "#/components/schemas/Missing",
        "#/info/title",
        "#/paths/~1items~1{id}/servers/0",
      ]) {
        const result = composeApis(
          project(
            schema({
              components: { schemas: { Item: { $ref: ref } } },
              paths: {
                "/items/{id}": {
                  servers: [{ url: "https://upstream.example.com" }],
                  get: operation(),
                },
              },
            }),
          ),
        );
        expect(result.canExport).toBe(false);
      }
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  it("reports path-item references, scoped schemas, and unresolved links", () => {
    const source = schema({
      paths: { "/items": { $ref: "#/components/pathItems/Shared" } },
      components: {
        pathItems: {
          Shared: {
            get: operation({
              responses: {
                "200": {
                  description: "OK",
                  links: { missing: { operationId: "missing" } },
                },
              },
            }),
          },
        },
        schemas: { Item: { $id: "https://example.com/Item", type: "object" } },
      },
    });
    const result = composeApis(project(source));
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["pathRef", "schemaScope", "link"]),
    );
    expect(result.canExport).toBe(false);
  });
  it("rewrites explicit discriminator mappings and rejects implicit ones", () => {
    const source = schema({
      components: {
        schemas: {
          Item: {
            oneOf: [{ $ref: "#/components/schemas/Dog" }],
            discriminator: { propertyName: "kind", mapping: { dog: "Dog" } },
          },
          Dog: { type: "object" },
        },
      },
    });
    const result = composeApis(project(source));
    expect(result.canExport).toBe(true);
    expect(
      plain(result.document).components.schemas["service-1__Item"].discriminator
        .mapping.dog,
    ).toBe("#/components/schemas/service-1__Dog");
    const implicit = schema({
      components: {
        schemas: { Item: { discriminator: { propertyName: "kind" } } },
      },
    });
    expect(
      composeApis(project(implicit)).issues.some(
        (i) => i.code === "discriminator",
      ),
    ).toBe(true);
  });
  it("exports routing provenance and marks partial inventories clearly", () => {
    const next = project(schema(), schema());
    next.services[1].prefix = next.services[0].prefix;
    const result = composeApis(next),
      inventory = JSON.parse(serializeComposerInventory(result));
    expect(inventory.complete).toBe(false);
    expect(inventory.routes).toHaveLength(1);
    expect(inventory.diagnostics[0].code).toBe("collision");
  });
  it("caps diagnostics, prioritizes errors, and requires an included service", () => {
    const paths = Object.fromEntries(
      Array.from({ length: 210 }, (_, i) => [
        `/items${i}`,
        {
          get: operation({
            operationId: `item${i}`,
            responses: { "200": { $ref: "#/components/responses/missing" } },
          }),
        },
      ]),
    );
    const result = composeApis(project(schema({ paths })));
    expect(result.issues.length).toBeLessThanOrEqual(200);
    expect(result.issueCount).toBeGreaterThan(200);
    expect(result.canExport).toBe(false);
    const next = project(schema());
    next.services[0].enabled = false;
    expect(() => composeApis(next)).toThrow("empty");
  });
  it("removes response-link server overrides when the link targets a gateway route", () => {
    const source = schema({
      paths: {
        "/items": {
          get: operation({
            responses: {
              "200": {
                description: "OK",
                links: {
                  next: {
                    operationId: "getItem",
                    server: { url: "https://upstream.example.com" },
                  },
                },
              },
            },
          }),
        },
      },
    });
    const result = composeApis(project(source));
    expect(result.canExport).toBe(true);
    expect(
      plain(result.document).paths["/service-1/items"].get.responses["200"]
        .links.next,
    ).toEqual({ operationId: "service-1__id_getItem" });
  });
  it("accepts the explicit default dialect and blocks unsupported custom schema dialects", () => {
    const standard = "https://spec.openapis.org/oas/3.1/dialect/base";
    expect(
      composeApis(project(schema(), schema({ jsonSchemaDialect: standard })))
        .canExport,
    ).toBe(true);
    expect(
      composeApis(
        project(schema({ jsonSchemaDialect: "https://example.com/custom" })),
      ).issues.some((i) => i.code === "schemaScope"),
    ).toBe(true);
    expect(
      composeApis(
        project(
          schema({
            components: {
              schemas: {
                Item: { $schema: "https://example.com/custom", type: "string" },
              },
            },
          }),
        ),
      ).canExport,
    ).toBe(false);
  });
  it("blocks incomplete discriminator mappings for union members and inherited subtypes", () => {
    const source = schema({
      components: {
        schemas: {
          Item: {
            oneOf: [
              { $ref: "#/components/schemas/Dog" },
              { $ref: "#/components/schemas/Cat" },
            ],
            discriminator: { propertyName: "kind", mapping: { dog: "Dog" } },
          },
          Dog: { type: "object" },
          Cat: { allOf: [{ $ref: "#/components/schemas/Item" }] },
        },
      },
    });
    expect(
      composeApis(project(source)).issues.some(
        (i) => i.code === "discriminator",
      ),
    ).toBe(true);
  });
  it("bounds expansion of inherited defaults and total operation declarations", () => {
    const paths = Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => [
        `/items${i}`,
        { get: operation({ operationId: `item${i}` }) },
      ]),
    );
    expect(() =>
      composeApis(
        project(
          schema({ paths, security: Array.from({ length: 1000 }, () => ({})) }),
        ),
      ),
    ).toThrow("limit");
    const manyPaths = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [
        `/items${i}`,
        { get: operation({ operationId: `item${i}` }) },
      ]),
    );
    expect(() => composeApis(project(schema({ paths: manyPaths })))).toThrow(
      "limit",
    );
  });
  it("requires mappings for transitive discriminator subtypes without looping on inheritance cycles", () => {
    const source = schema({
      components: {
        schemas: {
          Item: {
            discriminator: {
              propertyName: "kind",
              mapping: { child: "Child" },
            },
          },
          Grandchild: { allOf: [{ $ref: "#/components/schemas/Child" }] },
          Child: {
            allOf: [
              { $ref: "#/components/schemas/Item" },
              { $ref: "#/components/schemas/Grandchild" },
            ],
          },
        },
      },
    });
    expect(
      composeApis(project(source)).issues.some(
        (i) => i.code === "discriminator",
      ),
    ).toBe(true);
    const complete = plain(source);
    complete.components.schemas.Item.discriminator.mapping.grandchild =
      "Grandchild";
    expect(composeApis(project(complete)).canExport).toBe(true);
  });
});
