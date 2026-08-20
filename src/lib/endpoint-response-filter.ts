import type { EndpointSummary } from "./openapi";

export type EndpointResponseFilter =
  "all" | "client-error" | "missing-error" | "server-error" | "success";

function matchesResponseFamily(status: string, family: 2 | 4 | 5) {
  return new RegExp(`^${family}(?:\\d{2}|xx)$`, "i").test(status.trim());
}

function hasDocumentedErrorResponse(endpoint: EndpointSummary) {
  return endpoint.responses.some((response) => {
    const status = response.status.trim();

    return (
      status.toLowerCase() === "default" ||
      matchesResponseFamily(status, 4) ||
      matchesResponseFamily(status, 5)
    );
  });
}

export function filterEndpointsByResponse(
  endpoints: EndpointSummary[],
  filter: EndpointResponseFilter,
) {
  if (filter === "all") {
    return endpoints;
  }

  if (filter === "missing-error") {
    return endpoints.filter(
      (endpoint) => !hasDocumentedErrorResponse(endpoint),
    );
  }

  const family = filter === "success" ? 2 : filter === "client-error" ? 4 : 5;

  return endpoints.filter((endpoint) =>
    endpoint.responses.some((response) =>
      matchesResponseFamily(response.status, family),
    ),
  );
}
