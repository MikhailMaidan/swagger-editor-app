import { describe, expect, it } from "vitest";
import {
  parseOpenApiSchema,
  type EndpointSummary,
  type SecuritySchemeSummary,
} from "./openapi";
import {
  createPostmanCollection,
  type PostmanRequestItem,
} from "./postman-collection";

function endpoint(overrides: Partial<EndpointSummary> = {}): EndpointSummary {
  return {
    deprecated: false,
    description: "Reads one user",
    method: "GET",
    operationId: "getUser",
    parameters: [],
    path: "/users/{id}",
    requestBodies: [],
    responses: [],
    secured: false,
    securityRequirementGroups: [],
    securityRequirements: [],
    serverUrl: "https://api.example.com/v1",
    summary: "Get user",
    tags: ["Users"],
    ...overrides,
  };
}

function scheme(
  name: string,
  overrides: Partial<SecuritySchemeSummary> = {},
): SecuritySchemeSummary {
  return {
    bearerFormat: "",
    description: "",
    location: "",
    name,
    parameterName: "",
    scheme: "bearer",
    type: "http",
    ...overrides,
  };
}

function firstRequest(build: ReturnType<typeof createPostmanCollection>) {
  const firstItem = build.collection.item[0];

  return "request" in firstItem
    ? firstItem
    : (firstItem.item[0] as PostmanRequestItem);
}

describe("createPostmanCollection", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "generates request property %s safely when its type metadata is missing",
    (property) => {
      const build = createPostmanCollection(
        [
          endpoint({
            method: "POST",
            requestBodies: [
              {
                contentType: "application/json",
                description: "",
                required: true,
                schema: {
                  example: "",
                  exampleName: "",
                  properties: ["id", property],
                  propertyTypes: { id: "integer" },
                  type: "object",
                },
              },
            ],
          }),
        ],
        [],
        { serverUrl: "", title: "API", version: "1" },
      );

      expect(JSON.parse(firstRequest(build).request.body!.raw)).toEqual(
        Object.fromEntries([
          ["id", 0],
          [property, null],
        ]),
      );
    },
  );

  it("groups operations by their primary tag and preserves parameters", () => {
    const build = createPostmanCollection(
      [
        endpoint({
          parameters: [
            {
              description: "User identifier",
              example: "42",
              location: "path",
              name: "id",
              required: true,
              type: "integer",
            },
            {
              description: "Result language",
              enumValues: ["en", "ru"],
              example: "",
              location: "query",
              name: "language",
              required: false,
              type: "string",
            },
            {
              description: "Trace request",
              example: "",
              location: "header",
              name: "X-Trace-Id",
              required: true,
              type: "string",
            },
          ],
        }),
        endpoint({
          method: "GET",
          path: "/status",
          summary: "Get status",
          tags: [],
        }),
      ],
      [],
      {
        serverUrl: "https://staging.example.com/v2",
        title: "Catalog API",
        version: "2.0.0",
      },
    );
    const request = firstRequest(build).request;

    expect(build.collection.item).toEqual([
      expect.objectContaining({ name: "Users" }),
      expect.objectContaining({ name: "General" }),
    ]);
    expect(build.summary).toMatchObject({ folderCount: 2, requestCount: 2 });
    expect(request.url).toMatchObject({
      host: ["{{baseUrl}}"],
      path: ["users", ":id"],
      raw: "{{baseUrl}}/users/:id?language=en",
      query: [
        expect.objectContaining({
          disabled: true,
          key: "language",
          value: "en",
        }),
      ],
      variable: [expect.objectContaining({ key: "id", value: "42" })],
    });
    expect(request.header).toEqual([
      expect.objectContaining({
        key: "X-Trace-Id",
        value: "{{header_X_Trace_Id}}",
      }),
    ]);
    expect(build.collection.variable).toEqual([
      expect.objectContaining({
        key: "baseUrl",
        value: "https://staging.example.com/v2",
      }),
      expect.objectContaining({ key: "header_X_Trace_Id", value: "" }),
    ]);
  });

  it.each([
    ["a b&c=d#e+f?g/", "a%20b%26c%3Dd%23e%2Bf%3Fg%2F"],
    ["café 😀", "caf%C3%A9%20%F0%9F%98%80"],
    ["100% ready", "100%25%20ready"],
    ["\uD800", "%EF%BF%BD"],
    ["{{searchTerm}}", "{{searchTerm}}"],
    ["prefix {{searchTerm}} &tail", "prefix%20{{searchTerm}}%20%26tail"],
    ["", "{{query_q}}"],
  ])(
    "encodes query example %j while preserving variables",
    (example, encoded) => {
      const build = createPostmanCollection(
        [
          endpoint({
            path: "/search",
            parameters: [
              {
                description: "Search term",
                example,
                location: "query",
                name: "q",
                required: true,
              },
            ],
          }),
        ],
        [],
        { serverUrl: "", title: "Search API", version: "1" },
      );
      const request = firstRequest(build).request;

      expect(request.url.raw).toBe(`{{baseUrl}}/search?q=${encoded}`);
      expect(request.url.query).toEqual([
        expect.objectContaining({ key: "q", value: example || "{{query_q}}" }),
      ]);
    },
  );

  it.each([
    ["\uD800", "%EF%BF%BD"],
    ["\uDC00", "%EF%BF%BD"],
    ["a\uD800b", "a%EF%BF%BDb"],
    ["\uD800😀\uDC00", "%EF%BF%BD%F0%9F%98%80%EF%BF%BD"],
    ["café 😀", "caf%C3%A9%20%F0%9F%98%80"],
    ["q name&=+", "q%20name%26%3D%2B"],
  ])("safely encodes query parameter name %j", (name, encoded) => {
    const build = createPostmanCollection(
      [
        endpoint({
          path: "/search",
          parameters: [
            {
              description: "",
              example: "yes",
              location: "query",
              name,
              required: true,
            },
          ],
        }),
      ],
      [],
      { serverUrl: "", title: "Search API", version: "1" },
    );
    const request = firstRequest(build).request;

    expect(request.url.raw).toBe(`{{baseUrl}}/search?${encoded}=yes`);
    expect(request.url.query).toEqual([
      expect.objectContaining({ key: name, value: "yes" }),
    ]);
  });

  it.each([false, true])(
    "preserves the root endpoint slash with a server path prefix (query: %s)",
    (includeQuery) => {
      const build = createPostmanCollection(
        [
          endpoint({
            path: "/",
            parameters: includeQuery
              ? [
                  {
                    description: "",
                    example: "yes",
                    location: "query",
                    name: "q",
                    required: true,
                  },
                ]
              : [],
          }),
        ],
        [],
        {
          serverUrl: "https://api.example.com/v1",
          title: "Root API",
          version: "1",
        },
      );
      const request = firstRequest(build).request;
      const baseUrl = build.collection.variable.find(
        ({ key }) => key === "baseUrl",
      )!.value;
      const resolvedUrl = new URL(
        request.url.raw.replace("{{baseUrl}}", baseUrl),
      );

      expect(resolvedUrl.pathname).toBe("/v1/");
      expect(resolvedUrl.searchParams.get("q")).toBe(
        includeQuery ? "yes" : null,
      );
      expect(request.url.raw).toBe(
        `{{baseUrl}}/${includeQuery ? "?q=yes" : ""}`,
      );
      expect(request.url.path).toEqual([]);
    },
  );

  it.each([
    {
      serverUrl: "https://api.example.com/v2/",
      path: "/users",
      expected: "https://api.example.com/v2/users",
    },
    {
      serverUrl: " \thttps://api.example.com/v2/// \r\n",
      path: "/",
      expected: "https://api.example.com/v2/",
    },
    {
      serverUrl: "",
      path: "/users",
      expected: "https://fallback.example.com/v1/users",
    },
    {
      serverUrl: " \t ",
      path: "/users",
      expected: "https://fallback.example.com/v1/users",
    },
    { serverUrl: "/", path: "/users", expected: "/users" },
  ])(
    "normalizes server URL $serverUrl when exporting $path",
    ({ serverUrl, path, expected }) => {
      const build = createPostmanCollection(
        [endpoint({ path, serverUrl: " https://fallback.example.com/v1// " })],
        [],
        { serverUrl, title: "Example API", version: "1" },
      );
      const baseUrl = build.collection.variable.find(
        ({ key }) => key === "baseUrl",
      )!.value;

      expect(
        firstRequest(build).request.url.raw.replace("{{baseUrl}}", baseUrl),
      ).toBe(expected);
    },
  );

  it.each([
    ["user-id", "user_id", "user_id_2"],
    ["имя", "名前"],
  ])("keeps colliding parameter variables distinct: %j", (...names) => {
    const parameters = names.map((name) => ({
      description: "",
      example: "",
      location: "query" as const,
      name,
      required: true,
    }));
    const build = createPostmanCollection(
      [
        endpoint({ path: "/first", parameters }),
        endpoint({ path: "/second", parameters }),
      ],
      [],
      { serverUrl: "", title: "Variables API", version: "1" },
      { groupByTags: false },
    );
    const items = build.collection.item as PostmanRequestItem[];
    const references = items[0].request.url.query!.map(({ value }) => value);

    expect(new Set(references).size).toBe(names.length);
    expect(items[1].request.url.query!.map(({ value }) => value)).toEqual(
      references,
    );
    expect(build.collection.variable).toHaveLength(names.length + 1);
    expect(references).toEqual(
      build.collection.variable
        .filter(({ key }) => key !== "baseUrl")
        .map(({ key }) => `{{${key}}}`),
    );
  });

  it.each([false, true])(
    "separates colliding authentication and parameter variables (auth first: %s)",
    (authFirst) => {
      const schemes = [
        scheme("query_login", { scheme: "basic" }),
        ...["query-token", "query_token"].map((name, index) =>
          scheme(name, {
            type: "apiKey",
            scheme: "",
            location: "header",
            parameterName: `X-Key-${index}`,
          }),
        ),
      ];
      const secured = endpoint({
        path: "/private",
        secured: true,
        securityRequirementGroups: [schemes.map(({ name }) => name)],
        securityRequirements: schemes.map(({ name }) => name),
      });
      const publicEndpoint = endpoint({
        path: "/search",
        parameters: ["tokenValue", "loginUsername"].map((name) => ({
          description: "",
          example: "",
          location: "query" as const,
          name,
          required: true,
        })),
      });
      const build = createPostmanCollection(
        [
          ...(authFirst
            ? [secured, publicEndpoint]
            : [publicEndpoint, secured]),
          { ...secured, path: "/private-again" },
        ],
        schemes,
        { serverUrl: "", title: "Variables API", version: "1" },
        { groupByTags: false },
      );
      const items = build.collection.item as PostmanRequestItem[];
      const privateRequest = items.find(
        ({ request }) => request.url.path[0] === "private",
      )!.request;
      const publicRequest = items.find(
        ({ request }) => request.url.path[0] === "search",
      )!.request;
      const authReferences = [
        ...(privateRequest.auth?.type === "basic"
          ? privateRequest.auth.basic.map(({ value }) => value)
          : []),
        ...privateRequest.header.map(({ value }) => value),
      ];

      expect(authReferences).toHaveLength(4);
      expect(new Set(authReferences).size).toBe(4);
      expect(build.secretVariableKeys.map((key) => `{{${key}}}`)).toEqual(
        authReferences,
      );
      for (const { value } of publicRequest.url.query!) {
        expect(authReferences).not.toContain(value);
      }
      expect(build.collection.variable).toHaveLength(7);
      expect(items[2].request.auth).toEqual(privateRequest.auth);
      expect(items[2].request.header).toEqual(privateRequest.header);
    },
  );

  it("creates generated request bodies and documented response examples", () => {
    const build = createPostmanCollection(
      [
        endpoint({
          method: "POST",
          path: "/users",
          requestBodies: [
            {
              contentType: "application/json",
              description: "User payload",
              required: true,
              schema: {
                example: "",
                exampleName: "",
                properties: ["name", "active"],
                propertyTypes: { active: "boolean", name: "string" },
                requiredProperties: ["name"],
                type: "object",
              },
            },
          ],
          responses: [
            {
              contentTypes: ["application/json"],
              description: "Created",
              headers: [
                {
                  description: "Resource URL",
                  name: "Location",
                  value: "/users/42",
                },
              ],
              schema: {
                example: '{"id":42}',
                exampleName: "",
                hasExplicitExample: true,
                properties: ["id"],
                type: "object",
              },
              status: "201",
            },
          ],
        }),
      ],
      [],
      { serverUrl: "", title: "Users API", version: "1.0.0" },
    );
    const requestItem = firstRequest(build);

    expect(requestItem.request.body).toEqual({
      mode: "raw",
      options: { raw: { language: "json" } },
      raw: '{\n  "name": "string",\n  "active": false\n}',
    });
    expect(requestItem.request.header).toContainEqual(
      expect.objectContaining({
        key: "Content-Type",
        value: "application/json",
      }),
    );
    expect(requestItem.response[0]).toMatchObject({
      body: '{"id":42}',
      code: 201,
      name: "201 Created",
      status: "Created",
    });
    expect(requestItem.response[0].header).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Location", value: "/users/42" }),
        expect.objectContaining({
          key: "content-type",
          value: "application/json",
        }),
      ]),
    );
    expect(build.summary.responseExampleCount).toBe(1);
  });

  it.each([
    { type: "array", expected: [] },
    { type: "boolean", expected: false },
    { type: "integer", expected: 0 },
    { type: "number", expected: 0 },
    { type: "string", expected: "string" },
    { type: "null", expected: null },
    { type: undefined, expected: { unused: "string" } },
  ])(
    "generates request and response examples respecting type $type alongside properties",
    ({ type, expected }) => {
      const schema = { type, properties: { unused: { type: "string" } } };
      const content = { "application/json": { schema } };
      const parsed = parseOpenApiSchema(
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Example API", version: "1" },
          paths: {
            "/value": {
              post: {
                requestBody: { required: true, content },
                responses: { "200": { description: "OK", content } },
              },
            },
          },
        }),
      );
      if (!parsed.ok) throw new Error(parsed.error);

      const build = createPostmanCollection(parsed.value.endpoints, [], {
        serverUrl: "",
        title: "Example API",
        version: "1",
      });
      const item = firstRequest(build);

      expect(JSON.parse(item.request.body!.raw)).toEqual(expected);
      expect(JSON.parse(item.response[0].body)).toEqual(expected);
    },
  );

  it.each([
    [" 404 ", 404],
    ["\t201\n", 201],
    [" 5XX ", 500],
    [" 4xx ", 400],
    [" default ", 200],
  ])("exports documented status %j as HTTP %i", (status, code) => {
    const build = createPostmanCollection(
      [
        endpoint({
          responses: [
            { contentTypes: [], description: "Result", schema: null, status },
          ],
        }),
      ],
      [],
      { serverUrl: "", title: "Example API", version: "1" },
    );

    expect(firstRequest(build).response[0].code).toBe(code);
  });

  it("preserves an explicitly empty request body example from OpenAPI", () => {
    const parsed = parseOpenApiSchema(`openapi: 3.0.3
info: { title: Empty body API, version: '1' }
paths:
  /empty:
    post:
      requestBody:
        required: true
        content:
          text/plain:
            example: ''
            schema: { type: string }
      responses:
        '204': { description: Accepted }
`);
    if (!parsed.ok) throw new Error(parsed.error);

    const build = createPostmanCollection(parsed.value.endpoints, [], {
      serverUrl: "",
      title: "Empty body API",
      version: "1",
    });

    expect(firstRequest(build).request.body).toEqual({
      mode: "raw",
      options: { raw: { language: "text" } },
      raw: "",
    });
  });

  it("adds authentication placeholders without credential values", () => {
    const build = createPostmanCollection(
      [
        endpoint({
          secured: true,
          securityRequirementGroups: [["bearerAuth", "tenantKey"]],
          securityRequirements: ["bearerAuth", "tenantKey"],
        }),
      ],
      [
        scheme("bearerAuth", { description: "JWT access token" }),
        scheme("tenantKey", {
          location: "header",
          parameterName: "X-Tenant-Key",
          scheme: "",
          type: "apiKey",
        }),
      ],
      { serverUrl: "", title: "Secure API", version: "1.0.0" },
    );
    const request = firstRequest(build).request;

    expect(request.auth).toEqual({
      bearer: [
        {
          key: "token",
          type: "string",
          value: "{{bearerAuthToken}}",
        },
      ],
      type: "bearer",
    });
    expect(request.header).toContainEqual({
      key: "X-Tenant-Key",
      type: "text",
      value: "{{tenantKeyValue}}",
    });
    expect(build.secretVariableKeys).toEqual([
      "bearerAuthToken",
      "tenantKeyValue",
    ]);
    expect(build.collection.variable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "bearerAuthToken", value: "" }),
        expect.objectContaining({ key: "tenantKeyValue", value: "" }),
      ]),
    );
  });

  it("can create a flat collection without response examples", () => {
    const build = createPostmanCollection(
      [
        endpoint({
          responses: [
            {
              contentTypes: [],
              description: "OK",
              schema: null,
              status: "200",
            },
          ],
        }),
      ],
      [],
      { serverUrl: "", title: "Flat API", version: "1.0.0" },
      { groupByTags: false, includeResponseExamples: false },
    );

    expect(build.collection.item[0]).toHaveProperty("request");
    expect(firstRequest(build).response).toEqual([]);
    expect(build.summary).toMatchObject({
      folderCount: 0,
      requestCount: 1,
      responseExampleCount: 0,
    });
  });
});
