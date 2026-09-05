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
  const searchTerms = search.toLowerCase().split(/\s+/).filter(Boolean);

  return schemas.filter((schema) => {
    const matchesFormat =
      format === "all" || schema.format.trim().toLowerCase() === format;

    if (!matchesFormat) {
      return false;
    }

    if (searchTerms.length === 0) return true;

    const searchableText = [schema.title, schema.version, schema.format]
      .join(" ")
      .toLowerCase();

    return searchTerms.every((term) => searchableText.includes(term));
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
