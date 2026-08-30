import { describe, expect, it } from "vitest";
import type { ResponseSummary } from "./openapi";
import { createSchemaMockResponse } from "./request-mock";

function createResponse(
  overrides: Partial<ResponseSummary> = {},
): ResponseSummary {
  return {
    contentTypes: ["application/json"],
    description: "OK",
    schema: {
      example: '{"id":7}',
      exampleName: "",
      properties: ["id"],
      type: "object",
    },
    status: "200",
    ...overrides,
  };
}

describe("schema mock responses", () => {
  it("uses the documented example, status, and media type", () => {
    expect(createSchemaMockResponse(createResponse(), "fallback")).toEqual({
      body: '{"id":7}',
      headers: { "content-type": "application/json" },
      status: "200",
    });
  });

  it("normalizes status ranges and default responses", () => {
    expect(
      createSchemaMockResponse(createResponse({ status: "2XX" }), "fallback")
        .status,
    ).toBe("200");
    expect(
      createSchemaMockResponse(
        createResponse({ status: "default" }),
        "fallback",
      ).status,
    ).toBe("200");
  });

  it("falls back safely when response details are missing", () => {
    expect(createSchemaMockResponse(undefined, "No example")).toEqual({
      body: "No example",
      headers: {},
      status: "200",
    });
    expect(
      createSchemaMockResponse(
        createResponse({ contentTypes: [], schema: null, status: "204" }),
        "No content",
      ),
    ).toEqual({ body: "No content", headers: {}, status: "204" });
  });
});
