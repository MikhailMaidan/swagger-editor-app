import { describe, expect, it } from "vitest";
import type { SecurityPostureReport } from "./security-posture";
import {
  createSecurityPostureExport,
  createSecurityPostureMarkdown,
} from "./security-posture-export";

const report: SecurityPostureReport = {
  coveragePercentage: 50,
  findingCounts: { error: 1, info: 0, warning: 1 },
  findings: [
    {
      code: "optional-authentication",
      method: "GET",
      path: "/users",
      severity: "warning",
    },
    {
      code: "undefined-scheme",
      method: "POST",
      path: "/users",
      schemeName: "missing`auth",
      severity: "error",
    },
  ],
  operations: [
    {
      access: "optional",
      issueCodes: ["optional-authentication"],
      method: "GET",
      path: "/users",
      requirementGroups: [[], ["bearerAuth"]],
      requirements: ["bearerAuth"],
      summary: "List users",
      undefinedSchemes: [],
    },
  ],
  optionalCount: 1,
  publicCount: 0,
  schemes: [
    {
      bearerFormat: "JWT",
      description: "",
      issueCodes: [],
      location: "",
      name: "bearerAuth",
      operationCount: 1,
      parameterName: "",
      scheme: "bearer",
      type: "http",
    },
  ],
  securedCount: 1,
  totalCount: 2,
  undefinedSchemeNames: ["missing`auth"],
  usedSchemeCount: 1,
};

describe("security posture exports", () => {
  it("creates a deterministic JSON report", () => {
    const result = createSecurityPostureExport(
      report,
      { title: "Catalog API", version: "2.0.0" },
      new Date("2026-08-31T10:30:00.000Z"),
    );

    expect(result).toMatchObject({
      contentType: "application/json",
      fileName: "rsswag-catalog-api-security-2026-08-31.json",
    });
    expect(JSON.parse(result.content)).toMatchObject({
      exportedAt: "2026-08-31T10:30:00.000Z",
      schema: { title: "Catalog API", version: "2.0.0" },
      securityPosture: { coveragePercentage: 50 },
      version: 1,
    });
  });

  it("creates a localized shareable summary and sanitizes inline code", () => {
    const markdown = createSecurityPostureMarkdown(
      report,
      { title: "Catalog\nAPI", version: "2.0.0" },
      "en",
    );

    expect(markdown).toContain("# Security posture: Catalog API");
    expect(markdown).toContain("Strict authentication coverage: 1/2 (50%)");
    expect(markdown).toContain("`bearerAuth`: http, 1 operations");
    expect(markdown).toContain("`POST /users`");
    expect(markdown).toContain("missing'auth");
    expect(markdown).not.toContain("missing`auth");
  });

  it("uses a stable date for invalid export timestamps", () => {
    const result = createSecurityPostureExport(
      report,
      { title: "", version: "" },
      new Date(Number.NaN),
    );

    expect(result.fileName).toBe(
      "rsswag-openapi-schema-security-1970-01-01.json",
    );
    expect(JSON.parse(result.content).exportedAt).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
});
