import { describe, expect, it } from "vitest";
import type { EndpointSummary } from "./openapi";
import { createApiWorkflowReport } from "./openapi-workflows";

function endpoint(
  method: string,
  path: string,
  operationId: string,
): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method,
    operationId,
    parameters: [],
    path,
    requestBodies: [],
    responses: [],
    secured: false,
    securityRequirementGroups: [],
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: operationId || `${method} ${path}`,
    tags: [],
  };
}

describe("createApiWorkflowReport", () => {
  it("resolves operation IDs, local pointers, mappings, and component links", () => {
    const schema = {
      components: {
        links: {
          GetOwner: {
            description: "Follow the owner returned with the order",
            operationId: "getUser",
            parameters: {
              userId: "$response.body#/ownerId",
            },
            requestBody: { source: "$request.path.id" },
          },
        },
      },
      paths: {
        "/orders/{id}": {
          get: {
            operationId: "getOrder",
            responses: {
              "200": {
                links: {
                  owner: { $ref: "#/components/links/GetOwner" },
                  refresh: {
                    operationRef: "#/paths/~1orders~1{id}/get",
                  },
                },
              },
            },
          },
        },
        "/users/{userId}": {
          get: { operationId: "getUser", responses: {} },
        },
      },
    };
    const report = createApiWorkflowReport(schema, [
      endpoint("GET", "/orders/{id}", "getOrder"),
      endpoint("GET", "/users/{userId}", "getUser"),
    ]);

    expect(report).toMatchObject({
      connectedOperationCount: 2,
      cycleCount: 1,
      problemCount: 0,
      resolvedCount: 2,
      totalLinkCount: 2,
    });
    expect(report.links[0]).toMatchObject({
      definitionReference: "#/components/links/GetOwner",
      description: "Follow the owner returned with the order",
      name: "owner",
      parameters: [{ expression: "$response.body#/ownerId", name: "userId" }],
      requestBodyExpression: '{"source":"$request.path.id"}',
      resolution: "resolved",
      target: { operationId: "getUser", path: "/users/{userId}" },
    });
    expect(report.links[1]).toMatchObject({
      inCycle: true,
      resolution: "resolved",
      target: { operationId: "getOrder", path: "/orders/{id}" },
    });
    expect(
      report.nodes.find((node) => node.operationId === "getOrder"),
    ).toMatchObject({ inCycle: true, inboundCount: 1, outboundCount: 2 });
  });

  it("classifies missing, ambiguous, external, and invalid targets", () => {
    const schema = {
      paths: {
        "/source": {
          get: {
            responses: {
              default: {
                links: {
                  ambiguous: { operationId: "duplicate" },
                  external: {
                    operationRef:
                      "https://example.com/other.yaml#/paths/~1items/get",
                  },
                  invalid: { operationRef: "#/components/schemas/User" },
                  missing: { operationId: "doesNotExist" },
                  targetless: { description: "No target declared" },
                },
              },
            },
          },
        },
        "/duplicate-a": { get: { operationId: "duplicate" } },
        "/duplicate-b": { get: { operationId: "duplicate" } },
      },
    };
    const report = createApiWorkflowReport(schema, [
      endpoint("GET", "/source", "source"),
      endpoint("GET", "/duplicate-a", "duplicate"),
      endpoint("GET", "/duplicate-b", "duplicate"),
    ]);

    expect(report).toMatchObject({
      ambiguousCount: 1,
      externalCount: 1,
      problemCount: 5,
      resolvedCount: 0,
      totalLinkCount: 5,
      unresolvedCount: 3,
    });
    expect(report.links.map((link) => link.issueCodes)).toEqual([
      ["ambiguous-operation-id"],
      ["external-operation-ref"],
      ["invalid-operation-ref"],
      ["missing-operation-id"],
      ["missing-target"],
    ]);
  });

  it("uses operationRef when both target fields are present and flags it", () => {
    const schema = {
      paths: {
        "/source": {
          get: {
            responses: {
              "200": {
                links: {
                  next: {
                    operationId: "wrongTarget",
                    operationRef: "#/paths/%2Ftarget/post",
                    server: { url: "https://workflow.example.com" },
                  },
                },
              },
            },
          },
        },
        "/target": { post: { operationId: "rightTarget" } },
      },
    };
    const report = createApiWorkflowReport(schema, [
      endpoint("GET", "/source", "source"),
      endpoint("POST", "/target", "rightTarget"),
    ]);

    expect(report.links[0]).toMatchObject({
      issueCodes: ["multiple-targets"],
      resolution: "resolved",
      serverUrl: "https://workflow.example.com",
      target: { operationId: "rightTarget" },
    });
  });

  it("detects multi-operation cycles without marking incoming links", () => {
    const schema = {
      paths: {
        "/a": {
          get: {
            operationId: "a",
            responses: {
              "200": { links: { toB: { operationId: "b" } } },
            },
          },
        },
        "/b": {
          post: {
            operationId: "b",
            responses: {
              "200": { links: { toA: { operationId: "a" } } },
            },
          },
        },
        "/entry": {
          get: {
            operationId: "entry",
            responses: {
              "200": { links: { start: { operationId: "a" } } },
            },
          },
        },
      },
    };
    const report = createApiWorkflowReport(schema, [
      endpoint("GET", "/a", "a"),
      endpoint("POST", "/b", "b"),
      endpoint("GET", "/entry", "entry"),
    ]);

    expect(report.cycleCount).toBe(1);
    expect(report.cycles[0].operationKeys).toEqual(["GET /a", "POST /b"]);
    expect(report.links.map((link) => link.inCycle)).toEqual([
      true,
      true,
      false,
    ]);
  });
});
