import { describe, expect, it } from "vitest";
import { createComponentRegistryReport } from "./component-registry";
import {
  createComponentRegistryExport,
  createComponentRegistryMermaid,
} from "./component-registry-export";

const report = createComponentRegistryReport({
  openapi: "3.1.0",
  paths: {
    "/users": {
      get: {
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
    responses: {
      Remote: { $ref: "https://example.com/response.yaml" },
    },
    schemas: {
      Address: { type: "object" },
      Orphan: { type: "string" },
      User: {
        properties: {
          address: { $ref: "#/components/schemas/Address" },
          parent: { $ref: "#/components/schemas/User" },
        },
      },
    },
  },
});

describe("component registry export", () => {
  it("creates a deterministic JSON report", () => {
    const result = createComponentRegistryExport(
      report,
      { title: "People API", version: "2.0.0" },
      new Date("2026-08-03T10:11:12.000Z"),
    );
    const content = JSON.parse(result.content);

    expect(result).toMatchObject({
      contentType: "application/json",
      fileName: "rsswag-people-api-components-2026-08-03.json",
    });
    expect(content).toMatchObject({
      exportedAt: "2026-08-03T10:11:12.000Z",
      schema: { title: "People API", version: "2.0.0" },
      version: 1,
    });
    expect(content.componentRegistry.totalCount).toBe(4);
  });

  it("creates a Mermaid dependency graph with usage and issue styling", () => {
    const mermaid = createComponentRegistryMermaid(report);

    expect(mermaid).toContain('api["API surface"]');
    expect(mermaid).toContain("schema: User");
    expect(mermaid).toContain("component3 --> component1");
    expect(mermaid).toContain("classDef unused");
    expect(mermaid).toContain("classDef cycle");
    expect(mermaid).toContain("classDef problem");
  });

  it("creates a valid empty graph", () => {
    const emptyReport = createComponentRegistryReport({
      openapi: "3.0.0",
      paths: {},
    });

    expect(createComponentRegistryMermaid(emptyReport)).toBe(
      'flowchart LR\n  empty["No reusable components"]\n',
    );
  });
});
