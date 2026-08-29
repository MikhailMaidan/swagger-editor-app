import { describe, expect, it } from "vitest";
import {
  createRequestBodyContractReport,
  formatJsonBody,
  hasInvalidJsonBody,
  isJsonMediaType,
} from "./request-body";

describe("request body helpers", () => {
  it("recognizes standard and structured JSON media types", () => {
    expect(isJsonMediaType("application/json")).toBe(true);
    expect(isJsonMediaType("Application/Problem+JSON; charset=utf-8")).toBe(
      true,
    );
    expect(isJsonMediaType("application/xml")).toBe(false);
  });

  it("only rejects malformed, non-empty JSON bodies", () => {
    expect(hasInvalidJsonBody("application/json", '{"active":true}')).toBe(
      false,
    );
    expect(hasInvalidJsonBody("application/json", "  ")).toBe(false);
    expect(hasInvalidJsonBody("application/json", '{"active":')).toBe(true);
    expect(hasInvalidJsonBody("application/xml", "<active>")).toBe(false);
  });

  it("formats valid JSON bodies without touching unsupported content", () => {
    expect(formatJsonBody("application/json", '{"active":true}')).toBe(
      '{\n  "active": true\n}',
    );
    expect(formatJsonBody("application/problem+json", '[{"id":1}]')).toBe(
      '[\n  {\n    "id": 1\n  }\n]',
    );
    expect(formatJsonBody("application/json", '{"active":')).toBeNull();
    expect(formatJsonBody("application/xml", "<active />")).toBeNull();
  });

  it("reports matching JSON body types and accepts integers as numbers", () => {
    expect(
      createRequestBodyContractReport("application/json", "42", {
        properties: [],
        type: "number",
      }),
    ).toEqual({
      code: "body-matched",
      params: { type: "number" },
      result: "pass",
    });
  });

  it("reports type mismatches and missing required properties", () => {
    expect(
      createRequestBodyContractReport("application/json", "[]", {
        properties: ["name"],
        requiredProperties: ["name"],
        type: "object",
      }),
    ).toEqual({
      code: "body-type-mismatch",
      params: { actual: "array", expected: "object" },
      result: "fail",
    });

    expect(
      createRequestBodyContractReport(
        "application/problem+json",
        '{"name":"Ada"}',
        {
          properties: ["name", "email", "role"],
          requiredProperties: ["name", "email", "role"],
          type: "object",
        },
      ),
    ).toEqual({
      code: "body-missing-required",
      params: { properties: "email, role" },
      result: "fail",
    });
  });

  it("skips bodies that cannot be checked meaningfully", () => {
    expect(
      createRequestBodyContractReport("application/json", "", {
        properties: [],
        type: "object",
      }),
    ).toBeNull();
    expect(
      createRequestBodyContractReport("application/json", "{", {
        properties: [],
        type: "object",
      }),
    ).toBeNull();
    expect(
      createRequestBodyContractReport("application/xml", "<user />", {
        properties: ["name"],
        type: "object",
      }),
    ).toBeNull();
    expect(
      createRequestBodyContractReport("application/json", "{}", {
        properties: [],
        type: "unknown",
      }),
    ).toBeNull();
  });
});
