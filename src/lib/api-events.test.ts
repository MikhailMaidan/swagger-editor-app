import { describe, expect, it } from "vitest";
import type { EndpointSummary } from "./openapi";
import { createApiEventReport } from "./api-events";

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
    summary: operationId,
    tags: [],
  };
}

describe("createApiEventReport", () => {
  it("extracts reusable callbacks with generated payload examples", () => {
    const schema = {
      components: {
        callbacks: {
          SubscriptionEvents: {
            "{$request.body#/callbackUrl}": {
              post: {
                operationId: "receiveSubscriptionEvent",
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Event" },
                    },
                  },
                },
                responses: {
                  "204": { description: "Accepted" },
                },
                security: [{ callbackKey: [] }],
                summary: "Receive subscription event",
                tags: ["Subscriptions"],
              },
            },
          },
        },
        schemas: {
          Event: {
            properties: {
              eventId: { format: "uuid", type: "string" },
              state: { enum: ["ready", "done"], type: "string" },
            },
            type: "object",
          },
        },
      },
      paths: {
        "/subscriptions": {
          post: {
            callbacks: {
              onEvent: { $ref: "#/components/callbacks/SubscriptionEvents" },
            },
            operationId: "createSubscription",
          },
        },
      },
    };
    const report = createApiEventReport(schema, [
      endpoint("POST", "/subscriptions", "createSubscription"),
    ]);

    expect(report).toMatchObject({
      callbackOperationCount: 1,
      channelCount: 1,
      documentedOperationCount: 1,
      issueOperationCount: 0,
      payloadOperationCount: 1,
      totalOperationCount: 1,
      webhookOperationCount: 0,
    });
    expect(report.operations[0]).toMatchObject({
      expression: "{$request.body#/callbackUrl}",
      kind: "callback",
      method: "POST",
      name: "onEvent",
      operationId: "receiveSubscriptionEvent",
      responses: [{ description: "Accepted", status: "204" }],
      securityRequirements: ["callbackKey"],
      source: {
        method: "POST",
        operationId: "createSubscription",
        path: "/subscriptions",
      },
      tags: ["Subscriptions"],
    });
    expect(report.operations[0].payloads[0]).toMatchObject({
      contentType: "application/json",
      required: true,
      schemaName: "Event",
      schemaType: "object",
    });
    expect(JSON.parse(report.operations[0].payloads[0].example)).toEqual({
      eventId: "00000000-0000-4000-8000-000000000000",
      state: "ready",
    });
  });

  it("extracts independent webhooks through reusable path items", () => {
    const schema = {
      components: {
        pathItems: {
          OrderEvent: {
            post: {
              description: "Sent when an order changes",
              operationId: "orderChanged",
              requestBody: {
                content: {
                  "application/json": {
                    example: { id: 42, status: "shipped" },
                    schema: { type: "object" },
                  },
                },
              },
              responses: {
                "200": {
                  content: { "application/json": {} },
                  description: "Processed",
                },
              },
            },
          },
        },
      },
      paths: {},
      webhooks: {
        orderChanged: { $ref: "#/components/pathItems/OrderEvent" },
      },
    };
    const report = createApiEventReport(schema, []);

    expect(report).toMatchObject({
      callbackOperationCount: 0,
      channelCount: 1,
      documentedOperationCount: 1,
      totalOperationCount: 1,
      webhookOperationCount: 1,
    });
    expect(report.operations[0]).toMatchObject({
      expression: "",
      kind: "webhook",
      method: "POST",
      name: "orderChanged",
      operationId: "orderChanged",
      source: null,
    });
    expect(JSON.parse(report.operations[0].payloads[0].example)).toEqual({
      id: 42,
      status: "shipped",
    });
  });

  it("reports documentation gaps and broken nested references", () => {
    const schema = {
      paths: {},
      webhooks: {
        incomplete: {
          post: {
            requestBody: { $ref: "#/components/requestBodies/Missing" },
            responses: {},
          },
        },
      },
    };
    const report = createApiEventReport(schema, []);

    expect(report).toMatchObject({
      brokenReferenceCount: 1,
      documentedOperationCount: 0,
      issueOperationCount: 1,
      totalOperationCount: 1,
    });
    expect(report.operations[0]).toMatchObject({
      issueCodes: [
        "missing-operation-id",
        "missing-documentation",
        "missing-responses",
        "unresolved-reference",
      ],
      referenceIssues: ["#/components/requestBodies/Missing"],
    });
  });

  it("preserves external, missing, cyclic, and empty channel findings", () => {
    const schema = {
      components: {
        callbacks: {
          CycleA: { $ref: "#/components/callbacks/CycleB" },
          CycleB: { $ref: "#/components/callbacks/CycleA" },
        },
      },
      paths: {
        "/subscriptions": {
          post: {
            callbacks: {
              cycle: { $ref: "#/components/callbacks/CycleA" },
              external: { $ref: "https://example.com/callbacks.yaml#/event" },
              missing: { $ref: "#/components/callbacks/Unknown" },
            },
          },
        },
      },
      webhooks: {
        empty: { description: "No operations" },
      },
    };
    const report = createApiEventReport(schema, [
      endpoint("POST", "/subscriptions", "subscribe"),
    ]);

    expect(report.operations).toEqual([]);
    expect(report.channelCount).toBe(4);
    expect(report.findings.map((finding) => finding.code)).toEqual([
      "unresolved-reference",
      "external-reference",
      "unresolved-reference",
      "empty-channel",
    ]);
    expect(report.brokenReferenceCount).toBe(3);
  });

  it("extracts every method and callback expression as a distinct contract", () => {
    const schema = {
      paths: {
        "/register": {
          post: {
            callbacks: {
              updates: {
                "{$request.query.primary}": {
                  patch: {
                    description: "Patch event",
                    operationId: "patchEvent",
                    responses: { "200": { description: "OK" } },
                  },
                  post: {
                    description: "Post event",
                    operationId: "postEvent",
                    responses: { "202": { description: "Accepted" } },
                  },
                },
                "{$request.query.secondary}": {
                  delete: {
                    description: "Delete event",
                    operationId: "deleteEvent",
                    responses: { "204": { description: "Deleted" } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const report = createApiEventReport(schema, [
      endpoint("POST", "/register", "register"),
    ]);

    expect(report.channelCount).toBe(2);
    expect(report.totalOperationCount).toBe(3);
    expect(report.operations.map((operation) => operation.method)).toEqual([
      "PATCH",
      "POST",
      "DELETE",
    ]);
  });
});
