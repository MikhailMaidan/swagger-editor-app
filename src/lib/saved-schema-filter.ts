import type { SavedSchemaRecord } from "./schema-storage";

export type SavedSchemaFormatFilter = "all" | "json" | "yaml";

export function filterSavedSchemas(
  schemas: SavedSchemaRecord[],
  search: string,
  format: SavedSchemaFormatFilter = "all",
) {
  const normalizedSearch = search.trim().toLowerCase();

  return schemas.filter((schema) => {
    const matchesFormat =
      format === "all" || schema.format.trim().toLowerCase() === format;

    if (!matchesFormat) {
      return false;
    }

    return (
      !normalizedSearch ||
      schema.title.toLowerCase().includes(normalizedSearch) ||
      schema.version.toLowerCase().includes(normalizedSearch) ||
      schema.format.toLowerCase().includes(normalizedSearch)
    );
  });
}
