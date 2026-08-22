import type { SavedSchemaInsights } from "./saved-schema-insights";
import type { SavedSchemaRecord } from "./schema-storage";

export type SavedSchemaSort =
  "endpoints" | "largest" | "newest" | "oldest" | "title";

type SavedSchemaSortInsight = Pick<
  SavedSchemaInsights,
  "byteSize" | "endpointCount"
>;

function getSchemaTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

export function sortSavedSchemaRecords(
  schemas: SavedSchemaRecord[],
  sort: SavedSchemaSort,
  locale: string,
  insightsById: ReadonlyMap<string, SavedSchemaSortInsight>,
) {
  const sortedSchemas = [...schemas];
  const compareTitles = (
    firstSchema: SavedSchemaRecord,
    secondSchema: SavedSchemaRecord,
  ) => firstSchema.title.localeCompare(secondSchema.title, locale);

  sortedSchemas.sort((firstSchema, secondSchema) => {
    if (sort === "title") {
      return compareTitles(firstSchema, secondSchema);
    }

    if (sort === "largest") {
      return (
        (insightsById.get(secondSchema.id)?.byteSize ?? -1) -
          (insightsById.get(firstSchema.id)?.byteSize ?? -1) ||
        compareTitles(firstSchema, secondSchema)
      );
    }

    if (sort === "endpoints") {
      const firstEndpointCount =
        insightsById.get(firstSchema.id)?.endpointCount ?? null;
      const secondEndpointCount =
        insightsById.get(secondSchema.id)?.endpointCount ?? null;

      if (firstEndpointCount === null || secondEndpointCount === null) {
        if (firstEndpointCount === secondEndpointCount) {
          return compareTitles(firstSchema, secondSchema);
        }

        return firstEndpointCount === null ? 1 : -1;
      }

      return (
        secondEndpointCount - firstEndpointCount ||
        compareTitles(firstSchema, secondSchema)
      );
    }

    const firstTimestamp = getSchemaTimestamp(firstSchema.updatedAt);
    const secondTimestamp = getSchemaTimestamp(secondSchema.updatedAt);

    if (firstTimestamp === null || secondTimestamp === null) {
      if (firstTimestamp === secondTimestamp) {
        return compareTitles(firstSchema, secondSchema);
      }

      return firstTimestamp === null ? 1 : -1;
    }

    return (
      (sort === "oldest"
        ? firstTimestamp - secondTimestamp
        : secondTimestamp - firstTimestamp) ||
      compareTitles(firstSchema, secondSchema)
    );
  });

  return sortedSchemas;
}
