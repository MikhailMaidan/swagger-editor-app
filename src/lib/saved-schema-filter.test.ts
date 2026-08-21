import { describe, expect, it } from "vitest";
import type { SavedSchemaRecord } from "./schema-storage";
import { filterSavedSchemas } from "./saved-schema-filter";

const schemas: SavedSchemaRecord[] = [
  {
    createdAt: "2026-07-01T08:00:00.000Z",
    format: "yaml",
    id: "petstore",
    schemaText: "openapi: 3.0.0",
    title: "Pet Store",
    updatedAt: "2026-07-01T08:00:00.000Z",
    version: "1.0.0",
  },
  {
    createdAt: "2026-07-02T08:00:00.000Z",
    format: "JSON",
    id: "billing",
    schemaText: '{"openapi":"3.1.0"}',
    title: "Billing API",
    updatedAt: "2026-07-02T08:00:00.000Z",
    version: "2.4.0",
  },
];

describe("saved schema filters", () => {
  it("searches titles, versions, and formats without changing the input", () => {
    expect(filterSavedSchemas(schemas, " store ").map(({ id }) => id)).toEqual([
      "petstore",
    ]);
    expect(filterSavedSchemas(schemas, "2.4").map(({ id }) => id)).toEqual([
      "billing",
    ]);
    expect(filterSavedSchemas(schemas, "json").map(({ id }) => id)).toEqual([
      "billing",
    ]);
    expect(schemas).toHaveLength(2);
  });

  it("combines search with a case-insensitive format filter", () => {
    expect(
      filterSavedSchemas(schemas, "api", "json").map(({ id }) => id),
    ).toEqual(["billing"]);
    expect(filterSavedSchemas(schemas, "billing", "yaml")).toEqual([]);
    expect(filterSavedSchemas(schemas, "", "all")).toEqual(schemas);
  });
});
