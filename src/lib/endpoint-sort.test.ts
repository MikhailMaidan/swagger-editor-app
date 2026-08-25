import { describe, expect, it, vi } from "vitest";
import {
  ENDPOINT_SORT_STORAGE_KEY,
  readEndpointSortPreference,
  saveEndpointSortPreference,
  sortEndpoints,
} from "./endpoint-sort";
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

  it("persists non-default sorting and removes the default", () => {
    expect(readEndpointSortPreference()).toBe("schema");
    expect(saveEndpointSortPreference("path")).toBe(true);
    expect(readEndpointSortPreference()).toBe("path");
    expect(window.localStorage.getItem(ENDPOINT_SORT_STORAGE_KEY)).toBe("path");

    expect(saveEndpointSortPreference("schema")).toBe(true);
    expect(readEndpointSortPreference()).toBe("schema");
    expect(window.localStorage.getItem(ENDPOINT_SORT_STORAGE_KEY)).toBeNull();
  });

  it("ignores malformed values and blocked storage", () => {
    window.localStorage.setItem(ENDPOINT_SORT_STORAGE_KEY, "newest");
    expect(readEndpointSortPreference()).toBe("schema");

    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    try {
      expect(readEndpointSortPreference()).toBe("schema");
      expect(saveEndpointSortPreference("method")).toBe(false);
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });
});
