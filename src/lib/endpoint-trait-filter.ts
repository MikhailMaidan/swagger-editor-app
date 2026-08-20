import type { EndpointSummary } from "./openapi";

export type EndpointTraitFilter =
  "all" | "deprecated" | "secured" | "unsecured";

export function filterEndpointsByTrait(
  endpoints: EndpointSummary[],
  filter: EndpointTraitFilter,
) {
  if (filter === "all") {
    return endpoints;
  }

  if (filter === "deprecated") {
    return endpoints.filter((endpoint) => endpoint.deprecated);
  }

  return endpoints.filter((endpoint) =>
    filter === "secured" ? endpoint.secured : !endpoint.secured,
  );
}
