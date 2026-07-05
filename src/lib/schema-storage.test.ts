import { describe, expect, it } from "vitest";
import {
  readSavedSchema,
  SAVED_SCHEMA_STORAGE_KEY,
  saveSchema,
} from "./schema-storage";

describe("schema storage", () => {
  it("saves and reads schema text from local storage", () => {
    saveSchema("openapi: 3.0.0");

    expect(window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY)).toBe(
      "openapi: 3.0.0",
    );
    expect(readSavedSchema()).toBe("openapi: 3.0.0");
  });
});
