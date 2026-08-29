import { describe, expect, it } from "vitest";
import type { EndpointParameter } from "./openapi";
import {
  getMissingRequiredParameterKeys,
  getRequestParameterValidationIssues,
  getRequestParameterKey,
} from "./request-parameters";

const parameters: EndpointParameter[] = [
  {
    description: "",
    example: "",
    location: "path",
    name: "id",
    required: true,
  },
  {
    description: "",
    example: "",
    location: "query",
    name: "search",
    required: false,
  },
  {
    description: "",
    example: "",
    location: "header",
    name: "X-Trace-Id",
    required: true,
  },
];

describe("request parameter helpers", () => {
  it("creates keys that distinguish parameter locations", () => {
    expect(getRequestParameterKey(parameters[0])).toBe("path:id");
    expect(
      getRequestParameterKey({ ...parameters[0], location: "query" }),
    ).toBe("query:id");
  });

  it("finds required parameters with empty or whitespace-only values", () => {
    expect(
      getMissingRequiredParameterKeys(parameters, {
        "header:X-Trace-Id": "   ",
        "path:id": "42",
        "query:search": "",
      }),
    ).toEqual(["header:X-Trace-Id"]);

    expect(getMissingRequiredParameterKeys(parameters, {})).toEqual([
      "path:id",
      "header:X-Trace-Id",
    ]);
  });

  it("allows a shared environment header to satisfy a required header", () => {
    expect(
      getMissingRequiredParameterKeys(parameters, { "path:id": "42" }, [
        { name: "x-trace-id", value: "environment-trace" },
      ]),
    ).toEqual([]);

    expect(
      getMissingRequiredParameterKeys(parameters, { "path:id": "42" }, [
        { name: "X-Trace-Id", value: "  " },
      ]),
    ).toEqual(["header:X-Trace-Id"]);
  });

  it("allows auth defaults to satisfy required query and cookie parameters", () => {
    const authBackedParameters: EndpointParameter[] = [
      {
        description: "",
        example: "",
        location: "query",
        name: "api_key",
        required: true,
      },
      {
        description: "",
        example: "",
        location: "cookie",
        name: "session_key",
        required: true,
      },
    ];

    expect(
      getMissingRequiredParameterKeys(authBackedParameters, {}, [
        { location: "query", name: "api_key", value: "query-secret" },
        { location: "cookie", name: "session_key", value: "cookie-secret" },
      ]),
    ).toEqual([]);
  });

  it("validates enum, numeric, length, and pattern constraints", () => {
    const constrainedParameters: EndpointParameter[] = [
      {
        description: "",
        enumValues: ["active", "paused"],
        example: "",
        location: "query",
        name: "status",
        required: false,
        type: "string",
      },
      {
        description: "",
        example: "",
        location: "query",
        maximum: 100,
        minimum: 1,
        name: "page",
        required: false,
        type: "integer",
      },
      {
        description: "",
        example: "",
        location: "query",
        maxLength: 5,
        minLength: 3,
        name: "code",
        pattern: "^[A-Z]+$",
        required: false,
        type: "string",
      },
    ];

    expect(
      getRequestParameterValidationIssues(constrainedParameters, {
        "query:code": "ab",
        "query:page": "1.5",
        "query:status": "archived",
      }),
    ).toEqual([
      expect.objectContaining({ code: "enum", key: "query:status" }),
      expect.objectContaining({ code: "integer", key: "query:page" }),
      expect.objectContaining({ code: "min-length", key: "query:code" }),
    ]);

    expect(
      getRequestParameterValidationIssues(constrainedParameters, {
        "query:code": "abc",
        "query:page": "101",
        "query:status": "active",
      }),
    ).toEqual([
      expect.objectContaining({
        code: "maximum",
        key: "query:page",
        params: { maximum: "100" },
      }),
      expect.objectContaining({ code: "pattern", key: "query:code" }),
    ]);
  });

  it("validates boolean values and ignores empty optional parameters", () => {
    const booleanParameter: EndpointParameter = {
      description: "",
      example: "",
      location: "query",
      name: "verbose",
      required: false,
      type: "boolean",
    };

    expect(getRequestParameterValidationIssues([booleanParameter], {})).toEqual(
      [],
    );
    expect(
      getRequestParameterValidationIssues([booleanParameter], {
        "query:verbose": "yes",
      }),
    ).toEqual([
      expect.objectContaining({ code: "boolean", key: "query:verbose" }),
    ]);
  });

  it("validates values supplied by environments or authentication", () => {
    const parameter: EndpointParameter = {
      description: "",
      example: "",
      location: "query",
      minLength: 8,
      name: "api_key",
      required: true,
      type: "string",
    };

    expect(
      getRequestParameterValidationIssues([parameter], {}, [
        {
          location: "query",
          name: "api_key",
          value: "short",
        },
      ]),
    ).toEqual([
      expect.objectContaining({ code: "min-length", key: "query:api_key" }),
    ]);
  });

  it("does not block requests when an imported schema contains an invalid regex", () => {
    const parameter: EndpointParameter = {
      description: "",
      example: "",
      location: "query",
      name: "filter",
      pattern: "[",
      required: false,
      type: "string",
    };

    expect(
      getRequestParameterValidationIssues([parameter], {
        "query:filter": "anything",
      }),
    ).toEqual([]);
  });
});
