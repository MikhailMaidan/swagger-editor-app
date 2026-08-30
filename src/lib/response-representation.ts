import type { ResponseSummary } from "./openapi";

export type SelectedResponseRepresentation = {
  contentType: string;
  response: ResponseSummary | undefined;
};

export function selectResponseRepresentation(
  response: ResponseSummary | undefined,
  preferredContentType: string,
): SelectedResponseRepresentation {
  if (!response) {
    return { contentType: "", response: undefined };
  }

  const contentType = response.contentTypes.includes(preferredContentType)
    ? preferredContentType
    : (response.contentTypes[0] ?? "");
  const schema = contentType
    ? (response.schemasByContentType?.[contentType] ?? response.schema)
    : response.schema;

  return {
    contentType,
    response: {
      ...response,
      contentTypes: contentType ? [contentType] : [],
      schema,
    },
  };
}
