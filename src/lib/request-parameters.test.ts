import { describe, expect, it } from "vitest";
import type { EndpointParameter } from "./openapi";
import {
  getMissingRequiredParameterKeys,
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
});
