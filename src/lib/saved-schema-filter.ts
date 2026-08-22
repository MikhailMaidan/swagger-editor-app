import type { SavedSchemaRecord } from "./schema-storage";

export type SavedSchemaFormatFilter = "all" | "json" | "yaml";
export type SavedSchemaEndpointFilter =
  "all" | "unavailable" | "with-endpoints" | "without-endpoints";

type SavedSchemaEndpointInsight = {
  endpointCount: number | null;
};

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

export function filterSavedSchemasByEndpointState(
  schemas: SavedSchemaRecord[],
  endpointFilter: SavedSchemaEndpointFilter,
  insightsById: ReadonlyMap<string, SavedSchemaEndpointInsight>,
) {
  if (endpointFilter === "all") {
    return schemas;
  }

  return schemas.filter((schema) => {
    const endpointCount = insightsById.get(schema.id)?.endpointCount ?? null;

    if (endpointFilter === "unavailable") {
      return endpointCount === null;
    }

    if (endpointFilter === "with-endpoints") {
      return endpointCount !== null && endpointCount > 0;
    }

    return endpointCount === 0;
  });
}
