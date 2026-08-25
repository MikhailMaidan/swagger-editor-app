import { describe, expect, it } from "vitest";
import {
  getSchemaImportDetails,
  MAX_SCHEMA_IMPORT_SIZE_BYTES,
  shouldConfirmSchemaImport,
} from "./schema-import";

describe("schema import validation", () => {
  it("normalizes imported file details for user feedback", () => {
    expect(
      getSchemaImportDetails({ name: " schema.yaml ", size: 42.9 }),
    ).toEqual({
      byteSize: 42,
      fileName: "schema.yaml",
    });
    expect(getSchemaImportDetails({ name: "  ", size: Number.NaN })).toEqual({
      byteSize: 0,
      fileName: "schema",
    });
  });

  it("does not require confirmation up to the size threshold", () => {
    expect(shouldConfirmSchemaImport(0)).toBe(false);
    expect(shouldConfirmSchemaImport(MAX_SCHEMA_IMPORT_SIZE_BYTES)).toBe(false);
    expect(shouldConfirmSchemaImport(Number.NaN)).toBe(false);
  });

  it("requires confirmation above the size threshold", () => {
    expect(shouldConfirmSchemaImport(MAX_SCHEMA_IMPORT_SIZE_BYTES + 1)).toBe(
      true,
    );
  });
});
