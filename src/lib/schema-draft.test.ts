import { describe, expect, it } from "vitest";
import {
  clearSchemaDraft,
  readSchemaDraft,
  saveSchemaDraft,
  SCHEMA_DRAFT_STORAGE_KEY,
} from "./schema-draft";

describe("schema draft storage", () => {
  it("saves and restores an editor draft", () => {
    saveSchemaDraft("openapi: 3.0.0");

    expect(readSchemaDraft()).toBe("openapi: 3.0.0");
    expect(window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY)).toBe(
      "openapi: 3.0.0",
    );
  });

  it("clears an editor draft", () => {
    saveSchemaDraft("openapi: 3.0.0");

    clearSchemaDraft();

    expect(readSchemaDraft()).toBeNull();
  });
});
