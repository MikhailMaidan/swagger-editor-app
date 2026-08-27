import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary } from "./openapi";
import {
  clearSchemaComparisonBaseline,
  createSchemaComparisonBaseline,
  readSchemaComparisonBaseline,
  saveSchemaComparisonBaseline,
  SCHEMA_COMPARISON_BASELINE_STORAGE_KEY,
} from "./schema-comparison-baseline";

const endpoint: EndpointSummary = {
  deprecated: false,
  description: "Returns users.",
  method: "GET",
  operationId: "listUsers",
  parameters: [],
  path: "/users",
  requestBodies: [],
  responses: [
    {
      contentTypes: ["application/json"],
      description: "Users",
      schema: null,
      status: "200",
    },
  ],
  secured: false,
  securityRequirements: [],
  serverUrl: "https://api.example.com",
  summary: "List users",
  tags: ["Users"],
};

describe("schema comparison baseline", () => {
  it("creates a compact normalized endpoint snapshot", () => {
    const baseline = createSchemaComparisonBaseline(
      [endpoint],
      { title: "Users API", version: "1.0.0" },
      new Date("2026-08-27T08:30:00.000Z"),
    );

    expect(baseline).toMatchObject({
      capturedAt: "2026-08-27T08:30:00.000Z",
      title: "Users API",
      version: "1.0.0",
    });
    expect(baseline.endpoints[0]).not.toHaveProperty("serverUrl");
    expect(baseline.endpoints[0]).not.toHaveProperty("responses");
    expect(baseline.endpoints[0].responseStatuses).toEqual(["200"]);
  });

  it("persists, restores, and clears a versioned baseline", () => {
    const baseline = createSchemaComparisonBaseline(
      [endpoint],
      { title: "Users API", version: "1.0.0" },
      new Date("2026-08-27T08:30:00.000Z"),
    );

    expect(saveSchemaComparisonBaseline(baseline)).toBe(true);
    expect(readSchemaComparisonBaseline()).toEqual(baseline);
    expect(clearSchemaComparisonBaseline()).toBe(true);
    expect(
      window.localStorage.getItem(SCHEMA_COMPARISON_BASELINE_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores malformed, outdated, and partially invalid storage", () => {
    window.localStorage.setItem(
      SCHEMA_COMPARISON_BASELINE_STORAGE_KEY,
      "not-json",
    );
    expect(readSchemaComparisonBaseline()).toBeNull();

    window.localStorage.setItem(
      SCHEMA_COMPARISON_BASELINE_STORAGE_KEY,
      JSON.stringify({ baseline: {}, storageVersion: 0 }),
    );
    expect(readSchemaComparisonBaseline()).toBeNull();

    window.localStorage.setItem(
      SCHEMA_COMPARISON_BASELINE_STORAGE_KEY,
      JSON.stringify({
        baseline: {
          capturedAt: "2026-08-27T08:30:00.000Z",
          endpoints: [null, { method: "", path: "" }, { ...endpoint }],
          title: "Users API",
          version: "1.0.0",
        },
        storageVersion: 1,
      }),
    );

    expect(readSchemaComparisonBaseline()?.endpoints).toHaveLength(1);
  });

  it("returns failure when baseline storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "SecurityError");
      });

    try {
      expect(
        saveSchemaComparisonBaseline(
          createSchemaComparisonBaseline(
            [endpoint],
            { title: "Users API", version: "1.0.0" },
            new Date("2026-08-27T08:30:00.000Z"),
          ),
        ),
      ).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
