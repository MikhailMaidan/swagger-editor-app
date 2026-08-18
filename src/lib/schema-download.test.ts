import { describe, expect, it } from "vitest";
import { getSchemaDownloadMetadata } from "./schema-download";

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
});
