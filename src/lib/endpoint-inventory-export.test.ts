import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary } from "./openapi";
import {
  createEndpointInventoryExport,
  downloadEndpointInventoryFile,
} from "./endpoint-inventory-export";

function createEndpoint(
  overrides: Partial<EndpointSummary> = {},
): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method: "GET",
    operationId: "getUser",
    parameters: [],
    path: "/users/{id}",
    requestBodies: [],
    responses: [],
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: "Get user",
    tags: ["users"],
    ...overrides,
  };
}

describe("endpoint inventory export", () => {
  it("creates a dated UTF-8 CSV inventory with endpoint contract metadata", () => {
    const result = createEndpointInventoryExport(
      [
        createEndpoint({
          deprecated: true,
          parameters: [
            {
              description: "",
              example: "42",
              location: "path",
              name: "id",
              required: true,
            },
          ],
          requestBodies: [
            {
              contentType: "application/json",
              description: "",
              required: true,
              schema: {
                example: "{}",
                exampleName: "",
                properties: [],
                type: "object",
              },
            },
          ],
          responses: [
            {
              contentTypes: ["application/json"],
              description: "OK",
              schema: null,
              status: "200",
            },
            {
              contentTypes: [],
              description: "Missing",
              schema: null,
              status: "404",
            },
          ],
          secured: true,
          securityRequirements: ["BearerAuth"],
          tags: ["users", "public"],
        }),
      ],
      { title: "Catalog API / v2", version: "2.1.0" },
      new Date("2026-08-30T10:00:00.000Z"),
    );

    expect(result.fileName).toBe(
      "rsswag-catalog-api-v2-endpoints-2026-08-30.csv",
    );
    expect(result.contentType).toBe("text/csv;charset=utf-8");
    expect(
      result.content.startsWith('\uFEFF"Schema title","Schema version"'),
    ).toBe(true);
    expect(result.content).toContain(
      '"Catalog API / v2","2.1.0","GET","/users/{id}","Get user","getUser","users; public","true","BearerAuth","true","1","application/json","200 (application/json); 404"',
    );
    expect(result.content.endsWith("\r\n")).toBe(true);
  });

  it("escapes quotes, normalizes line breaks, and prevents spreadsheet formulas", () => {
    const result = createEndpointInventoryExport(
      [
        createEndpoint({
          operationId: '@command("value")',
          path: "/users,active",
          summary: '=IMPORTDATA("https://example.com")\nnext',
        }),
      ],
      { title: "+Unsafe API", version: "1.0.0" },
      new Date("invalid"),
    );

    expect(result.fileName).toBe("rsswag-unsafe-api-endpoints-1970-01-01.csv");
    expect(result.content).toContain('"\'+Unsafe API"');
    expect(result.content).toContain('"/users,active"');
    expect(result.content).toContain(
      '"\'=IMPORTDATA(""https://example.com"") next"',
    );
    expect(result.content).toContain('"\'@command(""value"")"');
  });

  it("exports an empty inventory with headers only", () => {
    const result = createEndpointInventoryExport(
      [],
      { title: "Empty", version: "1.0.0" },
      new Date("2026-08-30T10:00:00.000Z"),
    );

    expect(result.content.split("\r\n").filter(Boolean)).toHaveLength(1);
  });

  it("downloads the generated CSV and cleans up its object URL", () => {
    const createObjectURL = vi.fn(() => "blob:endpoint-inventory");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement("a");

    anchor.click = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) =>
        tagName === "a" ? anchor : originalCreateElement(tagName),
      );

    try {
      expect(
        downloadEndpointInventoryFile([createEndpoint()], {
          title: "Catalog API",
          version: "1.0.0",
        }),
      ).toBe(true);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchor.download).toMatch(
        /^rsswag-catalog-api-endpoints-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      expect(anchor.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:endpoint-inventory");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElement.mockRestore();
    }
  });

  it("returns failure when downloads are blocked", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new DOMException("Downloads blocked", "SecurityError");
    };

    try {
      expect(
        downloadEndpointInventoryFile([createEndpoint()], {
          title: "Catalog API",
          version: "1.0.0",
        }),
      ).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
