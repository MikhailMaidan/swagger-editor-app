import { describe, expect, it } from "vitest";
import type { EndpointSummary } from "./openapi";
import {
  createComparableEndpoint,
  createSchemaChangeReport,
} from "./schema-change";

function createEndpoint(
  overrides: Partial<EndpointSummary> = {},
): EndpointSummary {
  return {
    deprecated: false,
    description: "Returns a user.",
    method: "GET",
    operationId: "getUser",
    parameters: [
      {
        description: "User ID",
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

describe("schema change analysis", () => {
  it("reports added and removed operations without text-diff noise", () => {
    const baseline = [createComparableEndpoint(createEndpoint())];
    const report = createSchemaChangeReport(baseline, [
      createEndpoint({
        method: "POST",
        operationId: "createUser",
        path: "/users",
      }),
    ]);

    expect(report).toMatchObject({
      addedCount: 1,
      breakingCount: 1,
      modifiedCount: 0,
      removedCount: 1,
      unchangedCount: 0,
    });
    expect(
      report.changes.map((change) => [change.kind, change.impact]),
    ).toEqual([
      ["removed", "breaking"],
      ["added", "non-breaking"],
    ]);
  });

  it("detects breaking parameter, body, response, ID, and security changes", () => {
    const baselineEndpoint = createEndpoint({
      operationId: "updateUser",
      requestBodies: [
        {
          contentType: "application/json",
          description: "User",
          required: false,
          schema: {
            example: "",
            exampleName: "",
            properties: ["name"],
            type: "object",
          },
        },
      ],
    });
    const currentEndpoint = createEndpoint({
      operationId: "replaceUser",
      parameters: [
        ...baselineEndpoint.parameters,
        {
          description: "Revision",
          example: "1",
          location: "query",
          name: "revision",
          required: true,
        },
      ],
      requestBodies: [{ ...baselineEndpoint.requestBodies[0], required: true }],
      responses: baselineEndpoint.responses.filter(
        (response) => response.status !== "404",
      ),
      secured: true,
      securityRequirements: ["bearerAuth"],
    });
    const report = createSchemaChangeReport(
      [createComparableEndpoint(baselineEndpoint)],
      [currentEndpoint],
    );

    expect(report.breakingCount).toBe(1);
    expect(report.modifiedCount).toBe(1);
    expect(report.changes[0].details.map((detail) => detail.code)).toEqual([
      "operation-id-changed",
      "request-body-became-required",
      "required-parameter-added",
      "response-removed",
      "security-added",
    ]);
  });

  it("ignores header name casing while still detecting requirement changes", () => {
    const parameter = {
      description: "Request ID",
      example: "request-42",
      location: "header" as const,
      name: "X-Request-ID",
      required: false,
    };
    const baseline = [
      createComparableEndpoint(createEndpoint({ parameters: [parameter] })),
    ];
    const current = createEndpoint({
      parameters: [{ ...parameter, name: "x-request-id" }],
    });
    expect(createSchemaChangeReport(baseline, [current])).toMatchObject({
      breakingCount: 0,
      changes: [],
      unchangedCount: 1,
    });
    const required = createSchemaChangeReport(baseline, [
      {
        ...current,
        parameters: [{ ...current.parameters[0], required: true }],
      },
    ]);
    expect(required.breakingCount).toBe(1);
    expect(required.changes[0].details).toEqual([
      {
        code: "parameter-became-required",
        impact: "breaking",
        location: "header",
        name: "X-Request-ID",
      },
    ]);
  });

  it.each(["query", "path", "cookie"] as const)(
    "keeps %s parameter names case-sensitive",
    (location) => {
      const parameter = {
        description: "Identifier",
        example: "42",
        location,
        name: "ID",
        required: true,
      };
      const report = createSchemaChangeReport(
        [createComparableEndpoint(createEndpoint({ parameters: [parameter] }))],
        [createEndpoint({ parameters: [{ ...parameter, name: "id" }] })],
      );
      expect(report.changes[0].details.map(({ code }) => code)).toEqual([
        "parameter-removed",
        "required-parameter-added",
      ]);
    },
  );

  it("classifies additive and documentation changes as non-breaking", () => {
    const baselineEndpoint = createEndpoint({ secured: true });
    const report = createSchemaChangeReport(
      [createComparableEndpoint(baselineEndpoint)],
      [
        createEndpoint({
          description: "Returns one user by ID.",
          parameters: [
            ...baselineEndpoint.parameters,
            {
              description: "Locale",
              example: "en",
              location: "query",
              name: "locale",
              required: false,
            },
          ],
          responses: [
            ...baselineEndpoint.responses,
            {
              contentTypes: [],
              description: "Server error",
              schema: null,
              status: "500",
            },
          ],
          secured: false,
          tags: ["Accounts", "Users"],
        }),
      ],
    );

    expect(report.breakingCount).toBe(0);
    expect(report.changes[0]).toMatchObject({
      impact: "non-breaking",
      kind: "modified",
    });
    expect(report.changes[0].details.map((detail) => detail.code)).toEqual([
      "documentation-changed",
      "optional-parameter-added",
      "response-added",
      "security-removed",
      "tags-changed",
    ]);
  });

  it("ignores server and example changes", () => {
    const baselineEndpoint = createEndpoint();
    const currentEndpoint = createEndpoint({
      parameters: baselineEndpoint.parameters.map((parameter) => ({
        ...parameter,
        example: "different",
      })),
      serverUrl: "https://staging.example.com",
    });
    const report = createSchemaChangeReport(
      [createComparableEndpoint(baselineEndpoint)],
      [currentEndpoint],
    );

    expect(report.changes).toEqual([]);
    expect(report.unchangedCount).toBe(1);
  });
});
