import { describe, expect, it } from "vitest";
import { createExampleValidationReport } from "./example-validation";
import {
  createExampleValidationExport,
  createExampleValidationMarkdown,
} from "./example-validation-export";

const report = createExampleValidationReport({
  components: {
    schemas: {
      Order: {
        properties: {
          status: { enum: ["open", "closed"], example: "pending" },
        },
      },
    },
  },
  openapi: "3.0.3",
  paths: {
    "/orders": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              example: { id: "o-1", total: "12" },
              schema: {
                properties: {
                  id: { readOnly: true, type: "string" },
                  total: { type: "number" },
                },
                required: ["total"],
                type: "object",
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
  },
});
const schema = { title: "Shop `API`", version: "1.2.0" };

describe("example validation export", () => {
  it("summarizes findings with endpoints, locations, and localized messages", () => {
    expect(createExampleValidationMarkdown(report, schema)).toBe(
      [
        "# Example validation: Shop 'API'",
        "",
        "Version: 1.2.0",
        "Checked 2 examples: 0 matching, 0 with warnings, 2 mismatched, 0 not checked (0% conform).",
        "",
        "## Findings",
        "- **Mismatch** `POST /orders` Request body `application/json` (example) — `/paths/~1orders/post/requestBody/content/application~1json/example`",
        '  - `/id`: Read-only property "id" should not appear in a request example.',
        "  - `/total`: Expected number, but found string.",
        "- **Mismatch** Schema `Order.status` (example) — `/components/schemas/Order/properties/status/example`",
        '  - `/`: Value must be one of: "open", "closed".',
        "",
      ].join("\n"),
    );
    expect(createExampleValidationMarkdown(report, schema, "ru")).toContain(
      "## Находки",
    );
  });

  it("reports when no findings remain", () => {
    const cleanReport = createExampleValidationReport({
      components: { schemas: { Id: { example: 1, type: "integer" } } },
      openapi: "3.0.0",
      paths: {},
    });

    expect(createExampleValidationMarkdown(cleanReport, schema)).toContain(
      "No mismatched examples or warnings were found.",
    );
  });

  it("creates a dated JSON export with the complete report", () => {
    const exported = createExampleValidationExport(
      report,
      schema,
      new Date("2026-03-04T05:06:07.000Z"),
    );

    expect(exported.fileName).toBe("rsswag-shop-api-examples-2026-03-04.json");
    expect(exported.contentType).toBe("application/json");
    expect(JSON.parse(exported.content)).toEqual({
      conformancePercentage: 0,
      exampleValidation: report,
      exportedAt: "2026-03-04T05:06:07.000Z",
      schema,
      version: 1,
    });
    expect(
      createExampleValidationExport(report, schema, new Date("invalid"))
        .fileName,
    ).toBe("rsswag-shop-api-examples-1970-01-01.json");
  });
});
