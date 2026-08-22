import { describe, expect, it } from "vitest";
import { getSavedSchemaInsights } from "./saved-schema-insights";

describe("saved schema insights", () => {
  it("combines text statistics with parsed endpoint counts", () => {
    const schemaText = JSON.stringify({
      info: { title: "Insights API", version: "1.0.0" },
      openapi: "3.0.0",
      paths: {
        "/health": { get: { responses: {} } },
        "/users": {
          get: { responses: {} },
          post: { responses: {} },
        },
      },
    });

    expect(getSavedSchemaInsights(schemaText)).toEqual({
      byteSize: schemaText.length,
      characterCount: schemaText.length,
      endpointCount: 3,
      lineCount: 1,
    });
  });

  it("keeps text statistics when a saved schema can no longer be parsed", () => {
    expect(getSavedSchemaInsights("not: a valid schema\n")).toEqual({
      byteSize: 20,
      characterCount: 20,
      endpointCount: null,
      lineCount: 2,
    });
  });
});
