import { describe, expect, it } from "vitest";
import type { EndpointSummary } from "./openapi";
import { filterEndpointsByResponse } from "./endpoint-response-filter";

function createEndpoint(path: string, statuses: string[]) {
  return {
    deprecated: false,
    description: "",
    method: "GET",
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses: statuses.map((status) => ({
      contentTypes: [],
      description: "",
      schema: null,
      status,
    })),
    secured: false,
    securityRequirements: [],
    serverUrl: "",
    summary: path,
    tags: [],
  } satisfies EndpointSummary;
}

describe("endpoint response filtering", () => {
  const endpoints = [
    createEndpoint("/success", ["200"]),
    createEndpoint("/client", ["4XX"]),
    createEndpoint("/server", ["503"]),
    createEndpoint("/fallback", ["default"]),
    createEndpoint("/empty", []),
  ];

  it("preserves the original collection when response filtering is disabled", () => {
    expect(filterEndpointsByResponse(endpoints, "all")).toBe(endpoints);
  });

  it("matches exact and wildcard response status families", () => {
    expect(
      filterEndpointsByResponse(endpoints, "success").map(
        (endpoint) => endpoint.path,
      ),
    ).toEqual(["/success"]);
    expect(
      filterEndpointsByResponse(endpoints, "client-error").map(
        (endpoint) => endpoint.path,
      ),
    ).toEqual(["/client"]);
    expect(
      filterEndpointsByResponse(endpoints, "server-error").map(
        (endpoint) => endpoint.path,
      ),
    ).toEqual(["/server"]);
  });

  it("treats default responses as error coverage", () => {
    expect(
      filterEndpointsByResponse(endpoints, "missing-error").map(
        (endpoint) => endpoint.path,
      ),
    ).toEqual(["/success", "/empty"]);
  });
});
