import { describe, expect, it } from "vitest";
import type {
  EndpointSummary,
  ResponseSummary,
  SchemaDetails,
} from "./openapi";
import { createMockContractSuite } from "./mock-contract-suite";

function createSchema(
  type: string,
  example = "",
  properties: string[] = [],
): SchemaDetails {
  return {
    example,
    exampleName: "",
    hasExplicitExample: Boolean(example),
    properties,
    propertyTypes: Object.fromEntries(
      properties.map((property) => [property, "string"]),
    ),
    type,
  };
}

function createResponse(
  status: string,
  contentTypes: string[],
  schema: SchemaDetails | null,
): ResponseSummary {
  return {
    contentTypes,
    description: "Response",
    schema,
    schemasByContentType: schema
      ? Object.fromEntries(
          contentTypes.map((contentType) => [contentType, schema]),
        )
      : {},
    status,
  };
}

function createEndpoint(
  method: string,
  path: string,
  responses: ResponseSummary[],
): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method,
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses,
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: `${method} ${path}`,
    tags: [],
  };
}

describe("mock contract suites", () => {
  it("runs every documented status and media type without network input", () => {
    const jsonSchema = createSchema("object", '{"id":7}', ["id"]);
    const xmlSchema = createSchema("string", '<user id="7" />');
    const multiFormatResponse: ResponseSummary = {
      contentTypes: ["application/json", "application/xml"],
      description: "User",
      schema: jsonSchema,
      schemasByContentType: {
        "application/json": jsonSchema,
        "application/xml": xmlSchema,
      },
      status: "2XX",
    };
    const report = createMockContractSuite([
      createEndpoint("GET", "/users/7", [multiFormatResponse]),
      createEndpoint("POST", "/jobs", [
        createResponse(
          "202",
          ["application/json"],
          createSchema("object", "", ["state"]),
        ),
      ]),
    ]);

    expect(report).toMatchObject({
      endpointCount: 2,
      failedCount: 0,
      partialCount: 0,
      passedCount: 3,
      totalCount: 3,
    });
    expect(report.cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actualStatus: "200",
          bodySource: "documented",
          contentType: "application/xml",
          documentedStatus: "2XX",
          result: "pass",
        }),
        expect.objectContaining({
          actualStatus: "202",
          bodySource: "generated",
          path: "/jobs",
          result: "pass",
        }),
      ]),
    );
  });

  it("marks incomplete contracts as partial and missing responses as failed", () => {
    const report = createMockContractSuite([
      createEndpoint("DELETE", "/jobs/7", [createResponse("204", [], null)]),
      createEndpoint("GET", "/missing", []),
    ]);

    expect(report).toMatchObject({
      endpointCount: 2,
      failedCount: 1,
      partialCount: 1,
      passedCount: 0,
      totalCount: 2,
    });
    expect(report.cases[0]).toMatchObject({
      bodySource: "none",
      result: "partial",
      skippedCount: 2,
    });
    expect(report.cases[1]).toMatchObject({
      documentedStatus: "",
      path: "/missing",
      result: "fail",
    });
  });

  it("returns an empty report for an empty endpoint scope", () => {
    expect(createMockContractSuite([])).toEqual({
      cases: [],
      endpointCount: 0,
      failedCount: 0,
      partialCount: 0,
      passedCount: 0,
      totalCount: 0,
    });
  });
});
