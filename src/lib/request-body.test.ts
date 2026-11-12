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

  it.each(["text/json", "Text/JSON; charset=utf-8"])(
    "formats and validates JSON bodies with media type %s",
    (contentType) => {
      expect(isJsonMediaType(contentType)).toBe(true);
      expect(formatJsonBody(contentType, '{"id":7}')).toBe('{\n  "id": 7\n}');
      expect(hasInvalidJsonBody(contentType, '{"id":')).toBe(true);
      expect(
        createRequestBodyContractReport(contentType, "{}", {
          properties: ["id"],
          requiredProperties: ["id"],
          type: "object",
        }),
      ).toEqual({
        code: "body-missing-required",
        params: { properties: "id" },
        result: "fail",
      });
    },
  );

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

  it.each([
    "9007199254740993",
    "-9007199254740993",
    "1.234567890123456789",
    "1e400",
    "1e-400",
    "-0",
    "1.00",
  ])(
    "preserves the numeric literal %s when formatting a request",
    (literal) => {
      expect(formatJsonBody("application/json", `{"value":${literal}}`)).toBe(
        `{\n  "value": ${literal}\n}`,
      );
      expect(formatJsonBody("application/problem+json", ` ${literal} `)).toBe(
        literal,
      );
    },
  );

  it("keeps property order, repeated properties, and escaped string contents", () => {
    const body = String.raw`{"10":"first","2":"second","value":1,"value":2,"text":"[{}],: \"quoted\" \\ \u0041\n"}`;
    expect(formatJsonBody("application/json", body)).toBe(String.raw`{
  "10": "first",
  "2": "second",
  "value": 1,
  "value": 2,
  "text": "[{}],: \"quoted\" \\ \u0041\n"
}`);
  });

  it("formats nested and empty containers with consistent indentation", () => {
    const body =
      '{ "items": [ {}, [], [true, false, null], { "name": "Ada" } ] }';
    const formatted = formatJsonBody("application/json", body);
    expect(formatted).toBe(JSON.stringify(JSON.parse(body), null, 2));
    expect(formatJsonBody("application/json", formatted!)).toBe(formatted);
    expect(formatJsonBody("application/json", " { } ")).toBe("{}");
    expect(formatJsonBody("application/json", " [ ] ")).toBe("[]");
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

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "requires %s to be an own JSON property",
    (property) => {
      const schema = {
        properties: [property],
        requiredProperties: [property],
        type: "object",
      };
      expect(
        createRequestBodyContractReport("application/json", "{}", schema),
      ).toEqual({
        code: "body-missing-required",
        params: { properties: property },
        result: "fail",
      });
      expect(
        createRequestBodyContractReport(
          "application/json",
          JSON.stringify({ [property]: null }),
          schema,
        ),
      ).toMatchObject({ code: "body-matched", result: "pass" });
    },
  );

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
