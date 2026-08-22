import { describe, expect, it } from "vitest";
import type { SavedSchemaRecord } from "./schema-storage";
import { sortSavedSchemaRecords } from "./saved-schema-sort";

const newerSchema: SavedSchemaRecord = {
  createdAt: "2026-08-18T10:00:00.000Z",
  format: "yaml",
  id: "newer",
  schemaText: "openapi: 3.0.0",
  title: "Beta API",
  updatedAt: "2026-08-18T10:00:00.000Z",
  version: "1.0.0",
};
const olderSchema: SavedSchemaRecord = {
  ...newerSchema,
  createdAt: "2026-08-17T10:00:00.000Z",
  id: "older",
  title: "Alpha API",
  updatedAt: "2026-08-17T10:00:00.000Z",
};
const unavailableSchema: SavedSchemaRecord = {
  ...newerSchema,
  id: "unavailable",
  title: "Unavailable API",
  updatedAt: "invalid",
};
const insights = new Map([
  ["newer", { byteSize: 20, endpointCount: 1 }],
  ["older", { byteSize: 40, endpointCount: 3 }],
  ["unavailable", { byteSize: 10, endpointCount: null }],
]);

describe("saved schema sorting", () => {
  it("sorts by title, size, or endpoint count without mutating records", () => {
    const schemas = [newerSchema, unavailableSchema, olderSchema];

    expect(
      sortSavedSchemaRecords(schemas, "title", "en", insights).map(
        ({ id }) => id,
      ),
    ).toEqual(["older", "newer", "unavailable"]);
    expect(
      sortSavedSchemaRecords(schemas, "largest", "en", insights).map(
        ({ id }) => id,
      ),
    ).toEqual(["older", "newer", "unavailable"]);
    expect(
      sortSavedSchemaRecords(schemas, "endpoints", "en", insights).map(
        ({ id }) => id,
      ),
    ).toEqual(["older", "newer", "unavailable"]);
    expect(schemas.map(({ id }) => id)).toEqual([
      "newer",
      "unavailable",
      "older",
    ]);
  });

  it("keeps invalid timestamps last for both date directions", () => {
    const schemas = [olderSchema, unavailableSchema, newerSchema];

    expect(
      sortSavedSchemaRecords(schemas, "newest", "en", insights).map(
        ({ id }) => id,
      ),
    ).toEqual(["newer", "older", "unavailable"]);
    expect(
      sortSavedSchemaRecords(schemas, "oldest", "en", insights).map(
        ({ id }) => id,
      ),
    ).toEqual(["older", "newer", "unavailable"]);
  });
});
