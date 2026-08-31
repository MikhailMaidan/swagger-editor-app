import { describe, expect, it } from "vitest";
import type { EndpointSummary, SecuritySchemeSummary } from "./openapi";
import { createSecurityPostureReport } from "./security-posture";

function createEndpoint(
  path: string,
  requirementGroups?: string[][],
): EndpointSummary {
  const securityRequirements = Array.from(
    new Set(requirementGroups?.flat() ?? []),
  );

  return {
    deprecated: false,
    description: "",
    method: "GET",
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses: [],
    secured: securityRequirements.length > 0,
    securityRequirementGroups: requirementGroups,
    securityRequirements,
    serverUrl: "https://api.example.com",
    summary: `Read ${path}`,
    tags: [],
  };
}

function createScheme(
  name: string,
  overrides: Partial<SecuritySchemeSummary> = {},
): SecuritySchemeSummary {
  return {
    bearerFormat: "",
    description: "",
    location: "",
    name,
    parameterName: "",
    scheme: "bearer",
    type: "http",
    ...overrides,
  };
}

describe("createSecurityPostureReport", () => {
  it("classifies strict, optional, and public operations while preserving alternatives", () => {
    const report = createSecurityPostureReport(
      [
        createEndpoint("/strict", [["bearerAuth", "tenantKey"]]),
        createEndpoint("/alternative", [["bearerAuth"], ["tenantKey"]]),
        createEndpoint("/optional", [[], ["bearerAuth"]]),
        createEndpoint("/public", []),
      ],
      [
        createScheme("bearerAuth"),
        createScheme("tenantKey", {
          location: "header",
          parameterName: "X-Tenant-Key",
          scheme: "",
          type: "apiKey",
        }),
      ],
    );

    expect(report).toMatchObject({
      coveragePercentage: 50,
      optionalCount: 1,
      publicCount: 1,
      securedCount: 2,
      totalCount: 4,
      usedSchemeCount: 2,
    });
    expect(report.operations[0]).toMatchObject({
      access: "secured",
      requirementGroups: [["bearerAuth", "tenantKey"]],
    });
    expect(report.operations[1].requirementGroups).toEqual([
      ["bearerAuth"],
      ["tenantKey"],
    ]);
    expect(report.operations[2]).toMatchObject({
      access: "optional",
      issueCodes: ["optional-authentication"],
    });
    expect(report.operations[3].access).toBe("public");
    expect(report.schemes).toEqual([
      expect.objectContaining({ name: "bearerAuth", operationCount: 3 }),
      expect.objectContaining({ name: "tenantKey", operationCount: 2 }),
    ]);
  });

  it("flags undefined requirements and incomplete, unsupported, and unused schemes", () => {
    const report = createSecurityPostureReport(
      [createEndpoint("/private", [["missingAuth"]])],
      [
        createScheme("emptyKey", { scheme: "", type: "apiKey" }),
        createScheme("emptyHttp", { scheme: "" }),
        createScheme("customAuth", { scheme: "", type: "unsupported" }),
      ],
    );

    expect(report.operations[0]).toMatchObject({
      issueCodes: ["undefined-scheme"],
      undefinedSchemes: ["missingAuth"],
    });
    expect(report.undefinedSchemeNames).toEqual(["missingAuth"]);
    expect(report.schemes[0].issueCodes).toEqual([
      "incomplete-api-key",
      "unused-scheme",
    ]);
    expect(report.schemes[1].issueCodes).toEqual([
      "incomplete-http",
      "unused-scheme",
    ]);
    expect(report.schemes[2].issueCodes).toEqual([
      "unsupported-scheme",
      "unused-scheme",
    ]);
    expect(report.findingCounts).toEqual({ error: 3, info: 3, warning: 1 });
  });

  it("supports endpoint summaries that predate requirement groups", () => {
    const endpoint = createEndpoint("/legacy");

    endpoint.secured = true;
    endpoint.securityRequirementGroups = undefined;
    endpoint.securityRequirements = ["basicAuth"];

    const report = createSecurityPostureReport(
      [endpoint],
      [createScheme("basicAuth", { scheme: "basic" })],
    );

    expect(report.operations[0]).toMatchObject({
      access: "secured",
      requirementGroups: [["basicAuth"]],
    });
    expect(report.coveragePercentage).toBe(100);
  });

  it("returns a complete empty report", () => {
    expect(createSecurityPostureReport([], [])).toEqual({
      coveragePercentage: 100,
      findingCounts: { error: 0, info: 0, warning: 0 },
      findings: [],
      operations: [],
      optionalCount: 0,
      publicCount: 0,
      schemes: [],
      securedCount: 0,
      totalCount: 0,
      undefinedSchemeNames: [],
      usedSchemeCount: 0,
    });
  });
});
