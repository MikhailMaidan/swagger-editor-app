import type { EndpointSummary } from "./openapi";

export type EndpointSort = "method" | "path" | "schema";

const METHOD_ORDER = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
];

function compareMethods(firstMethod: string, secondMethod: string) {
  const firstIndex = METHOD_ORDER.indexOf(firstMethod);
  const secondIndex = METHOD_ORDER.indexOf(secondMethod);
  const firstRank = firstIndex === -1 ? METHOD_ORDER.length : firstIndex;
  const secondRank = secondIndex === -1 ? METHOD_ORDER.length : secondIndex;

  return firstRank - secondRank || firstMethod.localeCompare(secondMethod);
}

export function sortEndpoints(
  endpoints: EndpointSummary[],
  sort: EndpointSort,
) {
  if (sort === "schema") {
    return endpoints;
  }

  return [...endpoints].sort((firstEndpoint, secondEndpoint) => {
    if (sort === "path") {
      return (
        firstEndpoint.path.localeCompare(secondEndpoint.path) ||
        compareMethods(firstEndpoint.method, secondEndpoint.method)
      );
    }

    return (
      compareMethods(firstEndpoint.method, secondEndpoint.method) ||
      firstEndpoint.path.localeCompare(secondEndpoint.path)
    );
  });
}
