import { describe, expect, it } from "vitest";
import {
  MAX_SCHEMA_IMPORT_SIZE_BYTES,
  shouldConfirmSchemaImport,
} from "./schema-import";

describe("schema import validation", () => {
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
