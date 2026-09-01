import { describe, expect, it } from "vitest";
import type { EndpointSummary, SecuritySchemeSummary } from "./openapi";
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
