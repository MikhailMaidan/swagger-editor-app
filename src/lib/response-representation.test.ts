import { describe, expect, it } from "vitest";
import type { ResponseSummary, SchemaDetails } from "./openapi";
import { selectResponseRepresentation } from "./response-representation";

function createSchema(type: string, example: string): SchemaDetails {
  return {
    example,
    exampleName: "",
    hasExplicitExample: true,
    properties: [],
    type,
  };
}

function createResponse(): ResponseSummary {
  const jsonSchema = createSchema("object", '{"id":7}');
  const xmlSchema = createSchema("string", '<user id="7" />');

  return {
    contentTypes: ["application/json", "application/xml"],
    description: "User",
    schema: jsonSchema,
    schemasByContentType: {
      "application/json": jsonSchema,
      "application/xml": xmlSchema,
    },
    status: "200",
  };
}

describe("response representations", () => {
  it("selects the schema and media type for the preferred representation", () => {
    const selected = selectResponseRepresentation(
      createResponse(),
      "application/xml",
    );

    expect(selected.contentType).toBe("application/xml");
    expect(selected.response).toMatchObject({
      contentTypes: ["application/xml"],
      schema: { example: '<user id="7" />', type: "string" },
    });
  });

  it("falls back to the first media type without mutating the source", () => {
    const response = createResponse();
    const selected = selectResponseRepresentation(response, "text/plain");

    expect(selected.contentType).toBe("application/json");
    expect(selected.response?.contentTypes).toEqual(["application/json"]);
    expect(response.contentTypes).toEqual([
      "application/json",
      "application/xml",
    ]);
  });

  it("handles missing responses", () => {
    expect(selectResponseRepresentation(undefined, "application/json")).toEqual(
      { contentType: "", response: undefined },
    );
  });
});
