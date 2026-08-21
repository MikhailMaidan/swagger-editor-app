import { describe, expect, it } from "vitest";
import {
  createSchemaCollectionExport,
  getSchemaDownloadMetadata,
} from "./schema-download";

describe("schema download helpers", () => {
  it("derives JSON download metadata from the schema title", () => {
    expect(getSchemaDownloadMetadata("My API / v2", "JSON")).toEqual({
      contentType: "application/json",
      fileName: "my-api-v2.json",
    });
  });

  it("falls back to a safe YAML filename for unsupported title characters", () => {
    expect(getSchemaDownloadMetadata("Схема", "yaml")).toEqual({
      contentType: "application/yaml",
      fileName: "openapi-schema.yaml",
    });
  });

  it("creates a dated, versioned export of saved schema records", () => {
    const schema = {
      createdAt: "2026-08-01T08:00:00.000Z",
      format: "yaml",
      id: "schema-1",
      schemaText: "openapi: 3.0.0",
      title: "Catalog API",
      updatedAt: "2026-08-10T09:30:00.000Z",
      version: "1.2.0",
    };
    const result = createSchemaCollectionExport(
      [schema],
      new Date("2026-08-20T12:00:00.000Z"),
    );

    expect(result.contentType).toBe("application/json");
    expect(result.fileName).toBe("openapi-schemas-2026-08-20.json");
    expect(JSON.parse(result.content)).toEqual({
      exportedAt: "2026-08-20T12:00:00.000Z",
      schemas: [schema],
      version: 1,
    });
  });

  it("distinguishes a visible-only export without changing its payload", () => {
    const schema = {
      createdAt: "2026-08-01T08:00:00.000Z",
      format: "json",
      id: "schema-1",
      schemaText: '{"openapi":"3.1.0"}',
      title: "Catalog API",
      updatedAt: "2026-08-10T09:30:00.000Z",
      version: "1.2.0",
    };
    const result = createSchemaCollectionExport(
      [schema],
      new Date("2026-08-20T12:00:00.000Z"),
      "visible",
    );

    expect(result.fileName).toBe("openapi-schemas-visible-2026-08-20.json");
    expect(JSON.parse(result.content).schemas).toEqual([schema]);
  });
});
