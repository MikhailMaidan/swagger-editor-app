import { describe, expect, it } from "vitest";
import { parseOpenApiSchema, type EndpointParameter } from "./openapi";
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

  it.each([
    { location: "query", name: "api_key " },
    { location: "query", name: " api_key" },
    { location: "path", name: "api_key " },
  ] as const)(
    "matches fallback values to the exact $location parameter name $name",
    ({ location, name }) => {
      const parameter: EndpointParameter = {
        description: "",
        example: "",
        location,
        minLength: 8,
        name,
        required: true,
        type: "string",
      };
      const fallback = [{ location, name: "api_key", value: "short" }];
      const key = getRequestParameterKey(parameter);

      expect(
        getMissingRequiredParameterKeys([parameter], {}, fallback),
      ).toEqual([key]);
      expect(
        getRequestParameterValidationIssues([parameter], {}, fallback),
      ).toEqual([]);

      const exactFallback = [{ location, name, value: "short" }];
      expect(
        getMissingRequiredParameterKeys([parameter], {}, exactFallback),
      ).toEqual([]);
      expect(
        getRequestParameterValidationIssues([parameter], {}, exactFallback),
      ).toEqual([expect.objectContaining({ code: "min-length", key })]);
    },
  );

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

  it.each(["0x10", "0X10", "0b10", "0B10", "0o10", "0O10"])(
    "rejects non-decimal numeric parameter value %s while allowing it as text",
    (value) => {
      for (const type of ["number", "integer"]) {
        expect(
          getRequestParameterValidationIssues([{ ...parameters[1], type }], {
            "query:search": value,
          }),
        ).toEqual([{ code: "number", key: "query:search", params: {} }]);
      }
      expect(
        getRequestParameterValidationIssues(
          [{ ...parameters[1], type: "string" }],
          {
            "query:search": value,
          },
        ),
      ).toEqual([]);
    },
  );

  it.each([
    ["integer", "+12"],
    ["integer", "-3"],
    ["integer", "01"],
    ["integer", "1.0"],
    ["integer", "1e2"],
    ["number", ".5"],
    ["number", "1."],
    ["number", "-2.5e-3"],
  ])("preserves decimal %s parameter notation %s", (type, value) => {
    expect(
      getRequestParameterValidationIssues([{ ...parameters[1], type }], {
        "query:search": value,
      }),
    ).toEqual([]);
  });

  it.each([
    [
      "OpenAPI 3.0 boolean flags",
      "3.0.3",
      { minimum: 0, exclusiveMinimum: true, maximum: 100, exclusiveMaximum: true },
    ],
    [
      "OpenAPI 3.1 numeric bounds",
      "3.1.0",
      { exclusiveMinimum: 0, exclusiveMaximum: 100 },
    ],
  ])("enforces exclusive bounds written as %s", (_label, version, bounds) => {
    const result = parseOpenApiSchema(
      JSON.stringify({
        openapi: version,
        info: { title: "Bounds", version: "1.0.0" },
        paths: {
          "/items": {
            get: {
              parameters: [
                {
                  in: "query",
                  name: "limit",
                  schema: { type: "integer", ...bounds },
                },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const [limit] = result.value.endpoints[0].parameters;
    const validate = (value: string) =>
      getRequestParameterValidationIssues([limit], {
        "query:limit": value,
      }).map((issue) => issue.code);

    expect(validate("0")).toEqual(["exclusive-minimum"]);
    expect(validate("-5")).not.toEqual([]);
    expect(validate("100")).toEqual(["exclusive-maximum"]);
    expect(validate("1")).toEqual([]);
    expect(validate("99")).toEqual([]);
  });

  it("keeps the concrete type of OpenAPI 3.1 nullable type arrays", () => {
    const result = parseOpenApiSchema(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Nullable", version: "1.0.0" },
        paths: {
          "/items": {
            get: {
              parameters: [
                {
                  in: "query",
                  name: "limit",
                  schema: { type: ["integer", "null"], minimum: 1 },
                },
                {
                  in: "query",
                  name: "verbose",
                  schema: { type: ["null", "boolean"] },
                },
                {
                  in: "query",
                  name: "token",
                  schema: { type: ["integer", "string"] },
                },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const [limit, verbose, token] = result.value.endpoints[0].parameters;
    expect([limit.type, verbose.type, token.type]).toEqual([
      "integer",
      "boolean",
      "",
    ]);

    const codes = (parameter: EndpointParameter, value: string) =>
      getRequestParameterValidationIssues([parameter], {
        [getRequestParameterKey(parameter)]: value,
      }).map((issue) => issue.code);

    expect(codes(limit, "2.5")).toEqual(["integer"]);
    expect(codes(limit, "0")).toEqual(["minimum"]);
    expect(codes(limit, "3")).toEqual([]);
    expect(codes(verbose, "yes")).toEqual(["boolean"]);
    // A genuine union must not reject values valid for one of its members.
    expect(codes(token, "abc")).toEqual([]);
    expect(codes(token, "42")).toEqual([]);
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

  it.each([
    { pattern: "^\\p{L}+$", valid: "Жé", invalid: "123" },
    { pattern: "^.$", valid: "😀", invalid: "😀😀" },
    { pattern: "^\\u{1F600}$", valid: "😀", invalid: "other" },
    { pattern: "^\\a+$", valid: "aaa", invalid: "bbb" },
  ])(
    "validates Unicode and legacy patterns: $pattern",
    ({ pattern, valid, invalid }) => {
      const parameter: EndpointParameter = {
        ...parameters[1],
        pattern,
        type: "string",
      };

      expect(
        getRequestParameterValidationIssues([parameter], {
          "query:search": valid,
        }),
      ).toEqual([]);
      expect(
        getRequestParameterValidationIssues([parameter], {
          "query:search": invalid,
        }),
      ).toEqual([
        {
          code: "pattern",
          key: "query:search",
          params: { pattern },
        },
      ]);
    },
  );

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
