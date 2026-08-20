import { describe, expect, it } from "vitest";
import { filterEndpointsByTrait } from "./endpoint-trait-filter";
import type { EndpointSummary } from "./openapi";

function createEndpoint({
  deprecated = false,
  path,
  secured = false,
}: {
  deprecated?: boolean;
  path: string;
  secured?: boolean;
}) {
  return {
    deprecated,
    description: "",
    method: "GET",
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses: [],
    secured,
    securityRequirements: secured ? ["bearerAuth"] : [],
    serverUrl: "",
    summary: path,
    tags: [],
  } satisfies EndpointSummary;
}

describe("endpoint trait filtering", () => {
  const endpoints = [
    createEndpoint({ path: "/public" }),
    createEndpoint({ path: "/private", secured: true }),
    createEndpoint({ deprecated: true, path: "/legacy" }),
  ];

  it("preserves the original endpoint collection for the all filter", () => {
    expect(filterEndpointsByTrait(endpoints, "all")).toBe(endpoints);
  });

  it("filters endpoints by security and deprecation traits", () => {
    expect(
      filterEndpointsByTrait(endpoints, "secured").map(
        (endpoint) => endpoint.path,
      ),
    ).toEqual(["/private"]);
    expect(
      filterEndpointsByTrait(endpoints, "unsecured").map(
        (endpoint) => endpoint.path,
      ),
    ).toEqual(["/public", "/legacy"]);
    expect(
      filterEndpointsByTrait(endpoints, "deprecated").map(
        (endpoint) => endpoint.path,
      ),
    ).toEqual(["/legacy"]);
  });
});
