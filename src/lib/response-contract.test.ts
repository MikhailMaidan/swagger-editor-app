import { describe, expect, it } from "vitest";
import type { ResponseSummary } from "./openapi";
import {
  createResponseContractReport,
  findDocumentedResponse,
  serializeResponseContractReport,
} from "./response-contract";

function createResponse(
  overrides: Partial<ResponseSummary> = {},
): ResponseSummary {
  return {
    contentTypes: ["application/json"],
    description: "OK",
    schema: {
      example: "",
      exampleName: "",
      properties: ["id", "name"],
      requiredProperties: ["id"],
      type: "object",
    },
    status: "200",
    ...overrides,
  };
}

describe("response contract checks", () => {
  it("passes documented status, media type with charset, and body shape", () => {
    const report = createResponseContractReport([createResponse()], {
      body: '{"id":7,"name":"Ada"}',
      headers: { "Content-Type": "application/json; charset=utf-8" },
      method: "GET",
      status: "200",
    });

    expect(report).toMatchObject({
      checkedCount: 3,
      failedCount: 0,
      passedCount: 3,
      result: "pass",
    });
    expect(report.checks.map((check) => check.code)).toEqual([
      "status-matched",
      "content-type-matched",
      "body-matched",
    ]);
  });

  it("matches status ranges, default responses, and media wildcards", () => {
    const rangeResponse = createResponse({
      contentTypes: ["text/*"],
      schema: {
        example: "",
        exampleName: "",
        properties: [],
        type: "string",
      },
      status: "2XX",
    });
    const defaultResponse = createResponse({ status: "default" });

    expect(findDocumentedResponse([rangeResponse], "201")).toBe(rangeResponse);
    expect(findDocumentedResponse([defaultResponse], "418")).toBe(
      defaultResponse,
    );
    expect(
      createResponseContractReport([rangeResponse], {
        body: "created",
        headers: { "content-type": "text/plain" },
        method: "POST",
        status: "201",
      }).result,
    ).toBe("pass");
  });

  it("reports media type and top-level body type drift", () => {
    const report = createResponseContractReport([createResponse()], {
      body: "[]",
      headers: { "content-type": "text/plain" },
      method: "GET",
      status: "200",
    });

    expect(report).toMatchObject({ failedCount: 2, result: "fail" });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "content-type-mismatch",
          result: "fail",
        }),
        expect.objectContaining({
          code: "body-type-mismatch",
          result: "fail",
        }),
      ]),
    );
  });

  it("reports missing required response properties", () => {
    const report = createResponseContractReport([createResponse()], {
      body: '{"name":"Ada"}',
      headers: { "content-type": "application/json" },
      method: "GET",
      status: "200",
    });

    expect(report.checks[2]).toMatchObject({
      code: "body-missing-required",
      params: { properties: "id" },
      result: "fail",
    });
  });

  it("skips media and body checks when the response status is undocumented", () => {
    const report = createResponseContractReport([createResponse()], {
      body: '{"error":"offline"}',
      headers: {},
      method: "GET",
      status: "0",
    });

    expect(report).toMatchObject({ checkedCount: 1, failedCount: 1 });
    expect(report.checks.map((check) => check.result)).toEqual([
      "fail",
      "skipped",
      "skipped",
    ]);
  });

  it("reports invalid structured bodies and skips bodies forbidden by HTTP", () => {
    const invalidReport = createResponseContractReport([createResponse()], {
      body: "not-json",
      headers: { "content-type": "application/json" },
      method: "GET",
      status: "200",
    });
    const noContentReport = createResponseContractReport(
      [createResponse({ contentTypes: [], status: "204" })],
      { body: "", headers: {}, method: "DELETE", status: "204" },
    );

    expect(invalidReport.checks[2].code).toBe("body-invalid-json");
    expect(noContentReport.checks[2]).toMatchObject({
      code: "body-not-expected",
      result: "skipped",
    });
  });

  it("serializes a deterministic JSON report with endpoint context", () => {
    const report = createResponseContractReport([createResponse()], {
      body: '{"id":7}',
      headers: { "content-type": "application/json" },
      method: "GET",
      status: "200",
    });
    const serialized = serializeResponseContractReport(report, {
      method: " get ",
      path: "/users/{id}",
    });

    expect(JSON.parse(serialized)).toEqual({
      endpoint: { method: "GET", path: "/users/{id}" },
      report,
      version: 1,
    });
    expect(serialized.endsWith("\n")).toBe(true);
  });
});
