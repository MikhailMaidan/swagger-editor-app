import { describe, expect, it } from "vitest";
import {
  createApiWorkflowExport,
  createApiWorkflowMermaid,
} from "./openapi-workflow-export";
import type { ApiWorkflowReport } from "./openapi-workflows";

const report: ApiWorkflowReport = {
  ambiguousCount: 0,
  connectedOperationCount: 2,
  cycleCount: 1,
  cycles: [{ operationKeys: ["GET /orders/{id}"] }],
  externalCount: 1,
  links: [
    {
      description: "Read the order's owner",
      definitionReference: "",
      inCycle: false,
      issueCodes: [],
      key: "owner-link",
      name: "owner | details",
      operationId: "getUser",
      operationRef: "",
      parameters: [],
      requestBodyExpression: "",
      resolution: "resolved",
      serverUrl: "",
      source: {
        key: "GET /orders/{id}",
        method: "GET",
        operationId: "getOrder",
        path: "/orders/{id}",
        summary: "Get order",
      },
      status: "200",
      target: {
        key: "GET /users/{id}",
        method: "GET",
        operationId: "getUser",
        path: "/users/{id}",
        summary: "Get user",
      },
      targetLabel: "GET /users/{id}",
    },
    {
      description: "",
      definitionReference: "",
      inCycle: false,
      issueCodes: ["external-operation-ref"],
      key: "external-link",
      name: "external",
      operationId: "",
      operationRef: "https://example.com/api.yaml#/paths/~1audit/get",
      parameters: [],
      requestBodyExpression: "",
      resolution: "external",
      serverUrl: "",
      source: {
        key: "GET /orders/{id}",
        method: "GET",
        operationId: "getOrder",
        path: "/orders/{id}",
        summary: "Get order",
      },
      status: "default",
      target: null,
      targetLabel: "https://example.com/api.yaml#/paths/~1audit/get",
    },
  ],
  nodes: [
    {
      inCycle: true,
      inboundCount: 0,
      key: "GET /orders/{id}",
      method: "GET",
      operationId: "getOrder",
      outboundCount: 2,
      path: "/orders/{id}",
      summary: "Get order",
    },
    {
      inCycle: false,
      inboundCount: 1,
      key: "GET /users/{id}",
      method: "GET",
      operationId: "getUser",
      outboundCount: 0,
      path: "/users/{id}",
      summary: "Get user",
    },
  ],
  problemCount: 1,
  resolvedCount: 1,
  totalLinkCount: 2,
  unresolvedCount: 0,
};

describe("OpenAPI workflow exports", () => {
  it("creates a readable Mermaid graph with cycle and problem styling", () => {
    const mermaid = createApiWorkflowMermaid(report);

    expect(mermaid).toContain('operation1["GET /orders/{id}"]');
    expect(mermaid).toContain(
      'operation1 -->|"200 owner / details"| operation2',
    );
    expect(mermaid).toContain(
      'target2["External: https://example.com/api.yaml#/paths/~1audit/get"]',
    );
    expect(mermaid).toContain("class operation1 cycle");
    expect(mermaid).toContain("class target2 problem");
  });

  it("creates a dated, versioned JSON report with a safe file name", () => {
    const workflowExport = createApiWorkflowExport(
      report,
      { title: "Orders & Users API", version: "2.0.0" },
      new Date("2026-09-01T10:30:00.000Z"),
    );

    expect(workflowExport.fileName).toBe(
      "rsswag-orders-users-api-workflow-2026-09-01.json",
    );
    expect(JSON.parse(workflowExport.content)).toMatchObject({
      exportedAt: "2026-09-01T10:30:00.000Z",
      schema: { title: "Orders & Users API", version: "2.0.0" },
      version: 1,
      workflow: { totalLinkCount: 2 },
    });
  });

  it("uses a stable epoch for invalid export dates", () => {
    const workflowExport = createApiWorkflowExport(
      report,
      { title: "", version: "" },
      new Date("invalid"),
    );

    expect(workflowExport.fileName).toBe(
      "rsswag-openapi-schema-workflow-1970-01-01.json",
    );
  });
});
