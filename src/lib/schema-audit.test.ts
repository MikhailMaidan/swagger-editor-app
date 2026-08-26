import { describe, expect, it } from "vitest";
import type { EndpointSummary } from "./openapi";
import { createSchemaAuditReport } from "./schema-audit";

function createEndpoint(
  overrides: Partial<EndpointSummary> = {},
): EndpointSummary {
  return {
    deprecated: false,
    description: "Returns one user.",
    method: "GET",
    operationId: "getUser",
    parameters: [
      {
        description: "User identifier",
        example: "42",
        location: "path",
        name: "id",
        required: true,
      },
    ],
    path: "/users/{id}",
    requestBodies: [],
    responses: [
      {
        contentTypes: ["application/json"],
        description: "User",
        schema: null,
        status: "200",
      },
      {
        contentTypes: [],
        description: "Not found",
        schema: null,
        status: "404",
      },
    ],
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: "Get user",
    tags: ["Users"],
    ...overrides,
  };
}

describe("schema audit", () => {
  it("awards full coverage to a well-documented endpoint", () => {
    const report = createSchemaAuditReport([createEndpoint()]);

    expect(report.score).toBe(100);
    expect(report.passedChecks).toBe(6);
    expect(report.totalChecks).toBe(6);
    expect(report.issues).toEqual([]);
    expect(report.metrics.every((metric) => metric.percentage === 100)).toBe(
      true,
    );
  });

  it("finds documentation, response, and path parameter gaps", () => {
    const report = createSchemaAuditReport([
      createEndpoint({
        description: "",
        operationId: "",
        parameters: [],
        path: "/users/{id}/posts/{postId}",
        responses: [
          {
            contentTypes: [],
            description: "Not found",
            schema: null,
            status: "404",
          },
        ],
        summary: "Untitled endpoint",
        tags: [],
      }),
    ]);

    expect(report.score).toBe(17);
    expect(report.issueCounts).toEqual({ error: 3, info: 2, warning: 1 });
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "missing-path-parameter",
      "missing-path-parameter",
      "missing-success-response",
      "missing-operation-id",
      "missing-documentation",
      "missing-tags",
    ]);
    expect(
      report.issues
        .filter((issue) => issue.code === "missing-path-parameter")
        .map((issue) => issue.parameterName),
    ).toEqual(["id", "postId"]);
  });

  it("marks every endpoint sharing an operation ID as a duplicate", () => {
    const report = createSchemaAuditReport([
      createEndpoint(),
      createEndpoint({ method: "POST", path: "/users" }),
    ]);

    expect(report.score).toBe(83);
    expect(
      report.issues.filter((issue) => issue.code === "duplicate-operation-id"),
    ).toHaveLength(2);
  });

  it("reports an empty paths document without dividing by zero", () => {
    const report = createSchemaAuditReport([]);

    expect(report).toMatchObject({
      endpointCount: 0,
      passedChecks: 0,
      score: 0,
      totalChecks: 0,
    });
    expect(report.issues).toEqual([
      { code: "no-endpoints", severity: "warning" },
    ]);
  });
});
