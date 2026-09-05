import { describe, expect, it } from "vitest";
import {
  createSchemaCollectionExport,
  downloadSchemaFile,
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

  it.each(["CON", "prn", "Aux", "NUL", "COM1", "com9", "LPT1", "lpt9"])(
    "avoids reserved device names for the title %s",
    (title) => {
      expect(getSchemaDownloadMetadata(title, "json").fileName).toBe(
        `openapi-${title.toLowerCase()}.json`,
      );
    },
  );

  it("keeps names that only contain a reserved word unchanged", () => {
    expect(getSchemaDownloadMetadata("CON API", "yaml").fileName).toBe(
      "con-api.yaml",
    );
    expect(getSchemaDownloadMetadata("COM10", "json").fileName).toBe(
      "com10.json",
    );
  });

  it("bounds long filenames, trims truncated separators, and preserves the extension", () => {
    expect(getSchemaDownloadMetadata("A".repeat(300), "json").fileName).toBe(
      `${"a".repeat(120)}.json`,
    );
    expect(
      getSchemaDownloadMetadata(`${"B".repeat(119)} / API`, "yaml").fileName,
    ).toBe(`${"b".repeat(119)}.yaml`);
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

  it("returns failure instead of throwing when a browser download cannot start", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new DOMException("Downloads blocked", "SecurityError");
    };

    try {
      expect(downloadSchemaFile("openapi: 3.0.0", "Demo", "yaml")).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
