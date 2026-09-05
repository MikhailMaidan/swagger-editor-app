import type { EndpointSummary } from "./openapi";

export type EndpointSort = "method" | "path" | "schema";

export const ENDPOINT_SORT_STORAGE_KEY = "rsswagger-editor-endpoint-sort";

const METHOD_ORDER = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
];

const pathCollator = new Intl.Collator(undefined, { numeric: true });

export function readEndpointSortPreference(): EndpointSort {
  if (typeof window === "undefined") {
    return "schema";
  }

  try {
    const storedSort = window.localStorage.getItem(ENDPOINT_SORT_STORAGE_KEY);

    return storedSort === "method" || storedSort === "path"
      ? storedSort
      : "schema";
  } catch {
    return "schema";
  }
}

export function saveEndpointSortPreference(sort: EndpointSort) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (sort === "schema") {
      window.localStorage.removeItem(ENDPOINT_SORT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ENDPOINT_SORT_STORAGE_KEY, sort);
    }

    return true;
  } catch {
    // Sorting remains available for the current session when storage is blocked.
    return false;
  }
}

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
        pathCollator.compare(firstEndpoint.path, secondEndpoint.path) ||
        compareMethods(firstEndpoint.method, secondEndpoint.method)
      );
    }

    return (
      compareMethods(firstEndpoint.method, secondEndpoint.method) ||
      pathCollator.compare(firstEndpoint.path, secondEndpoint.path)
    );
  });
}
