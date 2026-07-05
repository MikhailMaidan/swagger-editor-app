import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAPI_SCHEMA,
  detectSchemaFormat,
  extractEndpoints,
  formatOpenApiSchema,
  parseOpenApiSchema,
  validateOpenApiSchema,
} from "./openapi";

describe("openapi helpers", () => {
  it("detects schema format from text", () => {
    expect(detectSchemaFormat('{"openapi":"3.0.0"}')).toBe("json");
    expect(detectSchemaFormat("openapi: 3.0.0")).toBe("yaml");
  });

  it("parses the default YAML schema and extracts endpoints", () => {
    const result = parseOpenApiSchema(DEFAULT_OPENAPI_SCHEMA);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.title).toBe("RSSwag Demo API");
    expect(result.value.format).toBe("yaml");
    expect(result.value.endpoints).toHaveLength(2);
    expect(result.value.endpoints[0]).toMatchObject({
      method: "GET",
      path: "/users/{id}",
      responseStatuses: ["200", "404"],
    });
    expect(result.value.endpoints[0].parameters).toEqual(
      expect.arrayContaining([
        { location: "path", name: "id" },
        { location: "query", name: "search" },
        { location: "header", name: "X-Trace-Id" },
        { location: "cookie", name: "sessionId" },
      ]),
    );
  });

  it("parses JSON schemas and supports format conversion", () => {
    const jsonSchema = {
      info: {
        title: "Pets API",
        version: "1.0.0",
      },
      openapi: "3.0.0",
      paths: {
        "/pets": {
          get: {
            responses: {
              "200": {
                description: "OK",
              },
            },
            summary: "List pets",
          },
        },
      },
    };
    const result = parseOpenApiSchema(JSON.stringify(jsonSchema));

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.format).toBe("json");
    expect(formatOpenApiSchema(result.value.schema, "yaml")).toContain(
      "title: Pets API",
    );
    expect(formatOpenApiSchema(result.value.schema, "json")).toContain(
      '"title": "Pets API"',
    );
  });

  it("returns validation errors for invalid schemas", () => {
    expect(validateOpenApiSchema([])).toBe("Schema must be an object.");
    expect(validateOpenApiSchema({ info: {}, paths: {} })).toBe(
      "Schema must include an openapi or swagger version.",
    );
    expect(
      validateOpenApiSchema({ info: {}, openapi: "3.0.0", paths: {} }),
    ).toBe("Schema info.title is required.");
    expect(
      validateOpenApiSchema({
        info: { title: "No paths" },
        openapi: "3.0.0",
      }),
    ).toBe("Schema paths object is required.");
    expect(parseOpenApiSchema("openapi: [")).toMatchObject({
      format: "yaml",
      ok: false,
    });
  });

  it("ignores malformed path items while extracting endpoints", () => {
    expect(
      extractEndpoints({
        paths: {
          "/broken": null,
        },
      }),
    ).toEqual([]);
  });
});
