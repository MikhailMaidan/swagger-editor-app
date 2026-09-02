import { describe, expect, it } from "vitest";
import { createComponentRegistryReport } from "./component-registry";

describe("createComponentRegistryReport", () => {
  it("finds transitive component usage from the API surface", () => {
    const report = createComponentRegistryReport({
      openapi: "3.1.0",
      paths: {
        "/users": {
          get: {
            parameters: [{ $ref: "#/components/parameters/Limit" }],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/User" },
                  },
                },
                description: "OK",
              },
            },
          },
        },
      },
      components: {
        parameters: {
          Limit: { in: "query", name: "limit", schema: { type: "integer" } },
        },
        schemas: {
          Address: { type: "object" },
          Orphan: { type: "string" },
          User: {
            description: "A user record",
            properties: {
              address: { $ref: "#/components/schemas/Address" },
            },
            type: "object",
          },
        },
      },
    });

    expect(report).toMatchObject({
      brokenReferenceCount: 0,
      totalCount: 4,
      unusedCount: 1,
      usedCount: 3,
    });
    expect(
      report.components.find((component) => component.name === "Address"),
    ).toMatchObject({
      dependentKeys: ["#/components/schemas/User"],
      directReferenceCount: 1,
      reachable: true,
      rootReferenceCount: 0,
    });
    expect(
      report.components.find((component) => component.name === "User"),
    ).toMatchObject({
      dependencyKeys: ["#/components/schemas/Address"],
      description: "A user record",
      reachable: true,
      rootReferenceCount: 1,
    });
    expect(
      report.components.find((component) => component.name === "Orphan"),
    ).toMatchObject({ reachable: false });
  });

  it("keeps components referenced only by other unused components unreachable", () => {
    const report = createComponentRegistryReport({
      openapi: "3.0.0",
      paths: {},
      components: {
        schemas: {
          First: { $ref: "#/components/schemas/Second" },
          Second: { type: "string" },
        },
      },
    });

    expect(report.usedCount).toBe(0);
    expect(report.unusedCount).toBe(2);
    expect(
      report.components.find((component) => component.name === "Second"),
    ).toMatchObject({ directReferenceCount: 1, reachable: false });
  });

  it("reports local, anchor, external, and broken references accurately", () => {
    const report = createComponentRegistryReport({
      openapi: "3.1.0",
      paths: {
        "/items": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": { schema: { $ref: "#item" } },
                },
              },
              "404": { $ref: "#/components/responses/Missing" },
            },
          },
        },
      },
      components: {
        responses: {
          Remote: { $ref: "https://example.com/responses.yaml#/Found" },
        },
        schemas: {
          "Item/Result": { $anchor: "item", type: "object" },
        },
      },
    });

    expect(report).toMatchObject({
      brokenReferenceCount: 1,
      externalReferenceCount: 1,
      usedCount: 1,
    });
    expect(report.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference: "#item",
          status: "resolved",
          targetComponentKey: "#/components/schemas/Item~1Result",
        }),
        expect.objectContaining({
          reference: "#/components/responses/Missing",
          status: "broken",
        }),
        expect.objectContaining({
          reference: "https://example.com/responses.yaml#/Found",
          sourceComponentKey: "#/components/responses/Remote",
          status: "external",
        }),
      ]),
    );
  });

  it("detects reachable and unreachable circular component groups", () => {
    const report = createComponentRegistryReport({
      openapi: "3.0.0",
      paths: {
        "/tree": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Tree" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Left: { $ref: "#/components/schemas/Right" },
          Right: { $ref: "#/components/schemas/Left" },
          Tree: {
            properties: { child: { $ref: "#/components/schemas/Tree" } },
          },
        },
      },
    });

    expect(report).toMatchObject({
      circularComponentCount: 3,
      cycleCount: 2,
      usedCount: 1,
    });
    expect(
      report.components.find((component) => component.name === "Tree"),
    ).toMatchObject({ inCycle: true, reachable: true });
    expect(report.cycles.map((cycle) => cycle.componentKeys)).toEqual([
      ["#/components/schemas/Left", "#/components/schemas/Right"],
      ["#/components/schemas/Tree"],
    ]);
  });

  it("counts implicit OpenAPI and Swagger security requirements", () => {
    const openApiReport = createComponentRegistryReport({
      openapi: "3.2.0",
      security: [{ bearerAuth: [] }],
      paths: {},
      components: {
        mediaTypes: {
          Problem: { schema: { type: "object" } },
        },
        securitySchemes: {
          bearerAuth: { scheme: "bearer", type: "http" },
          unusedKey: { in: "header", name: "X-Key", type: "apiKey" },
        },
      },
    });
    const swaggerReport = createComponentRegistryReport({
      swagger: "2.0",
      paths: {},
      security: [{ apiKey: [] }, { missingKey: [] }],
      definitions: { User: { type: "object" } },
      securityDefinitions: {
        apiKey: { in: "header", name: "X-Key", type: "apiKey" },
      },
    });

    expect(openApiReport.categoryCounts.mediaType).toBe(1);
    expect(
      openApiReport.components.find(
        (component) => component.name === "bearerAuth",
      ),
    ).toMatchObject({ reachable: true, rootReferenceCount: 1 });
    expect(openApiReport.unusedCount).toBe(2);
    expect(swaggerReport).toMatchObject({
      brokenReferenceCount: 1,
      totalCount: 2,
      usedCount: 1,
    });
    expect(swaggerReport.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: "security", status: "resolved" }),
        expect.objectContaining({
          reference: "#/securityDefinitions/missingKey",
          status: "broken",
        }),
      ]),
    );
  });

  it("ignores reference-shaped data in examples and extensions", () => {
    const report = createComponentRegistryReport({
      openapi: "3.1.0",
      paths: {},
      components: {
        examples: {
          Payload: { value: { $ref: "#/components/schemas/Missing" } },
        },
        schemas: {
          Existing: {
            examples: [{ $ref: "#/components/schemas/Missing" }],
            "x-metadata": { $ref: "#/components/schemas/Missing" },
          },
        },
      },
    });

    expect(report.brokenReferenceCount).toBe(0);
    expect(report.references).toEqual([]);
  });
});
