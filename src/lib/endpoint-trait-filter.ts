import type { EndpointSummary } from "./openapi";

export type EndpointTraitFilter =
  | "all"
  | "deprecated"
  | "secured"
  | "unsecured"
  | "with-request-body"
  | "without-request-body";

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

  if (filter === "with-request-body") {
    return endpoints.filter((endpoint) => endpoint.requestBodies.length > 0);
  }

  if (filter === "without-request-body") {
    return endpoints.filter((endpoint) => endpoint.requestBodies.length === 0);
  }

  return endpoints.filter((endpoint) =>
    filter === "secured" ? endpoint.secured : !endpoint.secured,
  );
}
