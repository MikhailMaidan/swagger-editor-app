import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary } from "./openapi";
import { createSchemaChangeReport } from "./schema-change";
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

  it("does not report tag changes after restoring a mixed-case tag baseline", () => {
    const taggedEndpoint = { ...endpoint, tags: ["apple", "Banana"] };
    const baseline = createSchemaComparisonBaseline([taggedEndpoint], {
      title: "Users API",
      version: "1.0.0",
    });
    expect(saveSchemaComparisonBaseline(baseline)).toBe(true);
    const restored = readSchemaComparisonBaseline();
    expect(restored).not.toBeNull();
    expect(
      createSchemaChangeReport(restored!.endpoints, [taggedEndpoint]),
    ).toMatchObject({ changes: [], unchangedCount: 1 });
  });

  it.each(["description", "summary"] as const)(
    "preserves a long %s when restoring and comparing a baseline",
    (field) => {
      const documentation = `${"Documentation ".repeat(400)}Original ending.`;
      const documentedEndpoint = { ...endpoint, [field]: documentation };
      const baseline = createSchemaComparisonBaseline([documentedEndpoint], {
        title: "Users API",
        version: "1.0.0",
      });

      expect(saveSchemaComparisonBaseline(baseline)).toBe(true);
      const restored = readSchemaComparisonBaseline();
      expect(restored?.endpoints[0][field]).toHaveLength(documentation.length);
      expect(restored).toEqual(baseline);
      expect(
        createSchemaChangeReport(restored!.endpoints, [documentedEndpoint]),
      ).toMatchObject({ changes: [], unchangedCount: 1 });
      expect(
        createSchemaChangeReport(restored!.endpoints, [
          { ...documentedEndpoint, [field]: `${documentation} Updated.` },
        ]),
      ).toMatchObject({
        modifiedCount: 1,
        changes: [{ details: [{ code: "documentation-changed" }] }],
      });
    },
  );

  it("preserves distinct query parameter names across a baseline reload", () => {
    const parameters = ["id", "id ", " id"].map((name) => ({
      description: "Identifier",
      example: "42",
      location: "query" as const,
      name,
      required: true,
    }));
    const namedEndpoint = { ...endpoint, parameters };
    const baseline = createSchemaComparisonBaseline([namedEndpoint], {
      title: "Users API",
      version: "1.0.0",
    });

    expect(saveSchemaComparisonBaseline(baseline)).toBe(true);
    const restored = readSchemaComparisonBaseline();
    expect(restored?.endpoints[0].parameters.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["id", "id ", " id"]),
    );
    expect(restored).toEqual(baseline);
    expect(
      createSchemaChangeReport(restored!.endpoints, [namedEndpoint]),
    ).toMatchObject({
      changes: [],
      unchangedCount: 1,
    });
    expect(
      createSchemaChangeReport(restored!.endpoints, [
        {
          ...namedEndpoint,
          parameters: parameters.filter(({ name }) => name !== "id "),
        },
      ]),
    ).toMatchObject({
      breakingCount: 1,
      changes: [{ details: [{ code: "parameter-removed", name: "id " }] }],
    });
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
          endpoints: [
            null,
            { method: "", path: "" },
            { ...endpoint, description: 123, summary: { text: "Invalid" } },
          ],
          title: "Users API",
          version: "1.0.0",
        },
        storageVersion: 1,
      }),
    );

    expect(readSchemaComparisonBaseline()?.endpoints).toHaveLength(1);
    expect(readSchemaComparisonBaseline()?.endpoints[0]).toMatchObject({
      description: "",
      summary: "",
    });
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
