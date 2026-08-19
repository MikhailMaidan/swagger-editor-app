import { describe, expect, it } from "vitest";
import { sortEndpoints } from "./endpoint-sort";
import type { EndpointSummary } from "./openapi";

function createEndpoint(method: string, path: string) {
  return {
    deprecated: false,
    description: "",
    method,
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses: [],
    secured: false,
    securityRequirements: [],
    serverUrl: "",
    summary: `${method} ${path}`,
    tags: [],
  } satisfies EndpointSummary;
}

describe("endpoint sorting", () => {
  const endpoints = [
    createEndpoint("DELETE", "/zeta"),
    createEndpoint("POST", "/alpha"),
    createEndpoint("GET", "/beta"),
    createEndpoint("GET", "/alpha"),
  ];

  it("preserves schema declaration order by default", () => {
    expect(sortEndpoints(endpoints, "schema")).toBe(endpoints);
  });

  it("sorts copies by path or conventional HTTP method order", () => {
    expect(
      sortEndpoints(endpoints, "path").map(
        (endpoint) => `${endpoint.method} ${endpoint.path}`,
      ),
    ).toEqual(["GET /alpha", "POST /alpha", "GET /beta", "DELETE /zeta"]);
    expect(
      sortEndpoints(endpoints, "method").map(
        (endpoint) => `${endpoint.method} ${endpoint.path}`,
      ),
    ).toEqual(["GET /alpha", "GET /beta", "POST /alpha", "DELETE /zeta"]);
    expect(endpoints.map((endpoint) => endpoint.path)).toEqual([
      "/zeta",
      "/alpha",
      "/beta",
      "/alpha",
    ]);
  });
});
