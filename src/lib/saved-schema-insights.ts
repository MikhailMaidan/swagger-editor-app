import { parseOpenApiSchema } from "./openapi";
import { getTextStats, type TextStats } from "./text-stats";

export type SavedSchemaInsights = TextStats & {
  endpointCount: number | null;
};

export function getSavedSchemaInsights(
  schemaText: string,
): SavedSchemaInsights {
  const parseResult = parseOpenApiSchema(schemaText);

  return {
    ...getTextStats(schemaText),
    endpointCount: parseResult.ok ? parseResult.value.endpoints.length : null,
  };
}
