import { describe, expect, it, vi } from "vitest";
import {
  clearSchemaDraft,
  readSchemaDraft,
  saveSchemaDraft,
  SCHEMA_DRAFT_STORAGE_KEY,
} from "./schema-draft";

describe("schema draft storage", () => {
  it("saves and restores an editor draft", () => {
    expect(saveSchemaDraft("openapi: 3.0.0")).toBe(true);

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

  it("reports when browser storage rejects a draft", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage full", "QuotaExceededError");
      });

    try {
      expect(saveSchemaDraft("openapi: 3.0.0")).toBe(false);
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
