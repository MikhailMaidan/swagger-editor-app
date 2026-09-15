import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE_GUIDE_CONFIG,
  STYLE_RULES,
  type StyleGuideConfig,
} from "./api-style-guide-config";
import {
  convertNameToConvention,
  createStyleGuideReport,
  matchesNamingConvention,
  splitNameWords,
} from "./api-style-guide";
import { findJsonPointerSourceRange } from "./example-validation";

function findings(
  root: Record<string, unknown>,
  config: Partial<StyleGuideConfig> = {},
) {
  return createStyleGuideReport(root, {
    ...DEFAULT_STYLE_GUIDE_CONFIG,
    ...config,
  }).violations.map(({ method, params, path, pointer, ruleId }) => ({
    method,
    params,
    path,
    pointer,
    ruleId,
  }));
}

function ruleIds(
  root: Record<string, unknown>,
  config: Partial<StyleGuideConfig> = {},
) {
  return findings(root, config).map((finding) => finding.ruleId);
}

const documentBasics = {
  info: {
    contact: { email: "api@example.com" },
    description: "Orders API",
    license: { name: "MIT" },
    title: "Orders",
    version: "1.0.0",
  },
  openapi: "3.1.0",
};

describe("naming conventions", () => {
  it("splits and converts names across conventions", () => {
    expect(splitNameWords("HTTPServerURL_v2-final")).toEqual([
      "HTTP",
      "Server",
      "URL",
      "v2",
      "final",
    ]);
    expect(convertNameToConvention("user_ID", "camelCase")).toBe("userId");
    expect(convertNameToConvention("order-items", "PascalCase")).toBe(
      "OrderItems",
    );
    expect(convertNameToConvention("createdAt", "snake_case")).toBe(
      "created_at",
    );
    expect(convertNameToConvention("PetStore", "kebab-case")).toBe("pet-store");
    expect(convertNameToConvention("___", "camelCase")).toBe("___");
  });

  it("matches each supported convention", () => {
    expect(matchesNamingConvention("userId", "camelCase")).toBe(true);
    expect(matchesNamingConvention("user_id", "camelCase")).toBe(false);
    expect(matchesNamingConvention("user_id", "snake_case")).toBe(true);
    expect(matchesNamingConvention("user-id", "kebab-case")).toBe(true);
    expect(matchesNamingConvention("UserId", "PascalCase")).toBe(true);
    expect(matchesNamingConvention("id", "kebab-case")).toBe(true);
  });
});

describe("API style guide", () => {
  it("checks path casing, trailing slashes, verbs, extensions, and ambiguity", () => {
    const report = findings({
      ...documentBasics,
      paths: {
        "/": { get: { responses: {} } },
        "/api/v1/orderItems/{orderId}": { get: { responses: {} } },
        "/api/v1/order-items/{itemId}": { get: { responses: {} } },
        "/api/v1/order-items/{id}/": { get: { responses: {} } },
        "/createOrder": { post: { responses: {} } },
        "/reports/latest.json": { get: { responses: {} } },
        "/.well-known/openid": { get: { responses: {} } },
      },
    });

    expect(report).toEqual([
      {
        method: "GET",
        params: {
          convention: "kebab-case",
          segments: "orderItems",
          suggestion: "/api/v1/order-items/{orderId}",
        },
        path: "/api/v1/orderItems/{orderId}",
        pointer: "/paths/~1api~1v1~1orderItems~1{orderId}",
        ruleId: "path-casing",
      },
      {
        method: "GET",
        params: { suggestion: "/api/v1/order-items/{id}" },
        path: "/api/v1/order-items/{id}/",
        pointer: "/paths/~1api~1v1~1order-items~1{id}~1",
        ruleId: "path-trailing-slash",
      },
      {
        method: "GET",
        params: { conflict: "/api/v1/order-items/{itemId}" },
        path: "/api/v1/order-items/{id}/",
        pointer: "/paths/~1api~1v1~1order-items~1{id}~1",
        ruleId: "path-ambiguous",
      },
      {
        method: "POST",
        params: {
          convention: "kebab-case",
          segments: "createOrder",
          suggestion: "/create-order",
        },
        path: "/createOrder",
        pointer: "/paths/~1createOrder",
        ruleId: "path-casing",
      },
      {
        method: "POST",
        params: { segment: "createOrder" },
        path: "/createOrder",
        pointer: "/paths/~1createOrder",
        ruleId: "path-verbs",
      },
      {
        method: "GET",
        params: { extension: ".json" },
        path: "/reports/latest.json",
        pointer: "/paths/~1reports~1latest.json",
        ruleId: "path-file-extension",
      },
    ]);
  });

  it("checks operation ids, summaries, safe-method bodies, and creation statuses", () => {
    expect(
      findings({
        ...documentBasics,
        paths: {
          "/orders": {
            get: {
              operationId: "list_orders",
              requestBody: { content: {} },
              responses: { "200": { description: "OK" } },
              summary: "List orders.",
            },
            post: {
              operationId: "createOrder",
              requestBody: { content: {} },
              responses: { "200": { description: "OK" } },
              summary: "Create an order",
            },
          },
          "/orders/{id}": {
            post: {
              requestBody: { content: {} },
              responses: { "200": { description: "OK" } },
            },
          },
          "/sessions": {
            post: {
              requestBody: { content: {} },
              responses: { "201": { description: "Created" } },
            },
          },
        },
      }),
    ).toEqual([
      {
        method: "GET",
        params: {
          convention: "camelCase",
          name: "list_orders",
          suggestion: "listOrders",
        },
        path: "/orders",
        pointer: "/paths/~1orders/get/operationId",
        ruleId: "operation-id-casing",
      },
      {
        method: "GET",
        params: { length: "12", limit: "80" },
        path: "/orders",
        pointer: "/paths/~1orders/get/summary",
        ruleId: "summary-style",
      },
      {
        method: "GET",
        params: { method: "GET" },
        path: "/orders",
        pointer: "/paths/~1orders/get/requestBody",
        ruleId: "request-body-on-safe-method",
      },
      {
        method: "POST",
        params: {},
        path: "/orders",
        pointer: "/paths/~1orders/post/responses/200",
        ruleId: "post-create-status",
      },
    ]);
  });

  it("checks parameter naming, reserved headers, descriptions, and pagination consistency", () => {
    const described = (parameter: Record<string, unknown>) => ({
      description: "documented",
      ...parameter,
    });
    const report = findings(
      {
        ...documentBasics,
        components: {
          parameters: {
            Limit: described({ in: "query", name: "limit" }),
          },
        },
        paths: {
          "/orders": {
            get: {
              parameters: [
                described({ in: "query", name: "page" }),
                { $ref: "#/components/parameters/Limit" },
                described({ in: "query", name: "filter[order_status]" }),
                described({ in: "header", name: "Accept" }),
                { in: "query", name: "sort" },
              ],
              responses: {},
            },
          },
          "/customers": {
            get: {
              parameters: [
                described({ in: "query", name: "page" }),
                { $ref: "#/components/parameters/Limit" },
              ],
              responses: {},
            },
          },
          "/events": {
            get: {
              parameters: [
                described({ in: "query", name: "cursor" }),
                described({ in: "query", name: "page_size" }),
              ],
              responses: {},
            },
          },
        },
      },
      { disabledRules: [] },
    );

    expect(report).toEqual([
      {
        method: "GET",
        params: {
          convention: "camelCase",
          location: "query",
          name: "filter[order_status]",
          suggestion: "filter[orderStatus]",
        },
        path: "/orders",
        pointer: "/paths/~1orders/get/parameters/2/name",
        ruleId: "parameter-casing",
      },
      {
        method: "GET",
        params: { name: "Accept" },
        path: "/orders",
        pointer: "/paths/~1orders/get/parameters/3/name",
        ruleId: "reserved-header-parameter",
      },
      {
        method: "GET",
        params: { location: "query", name: "sort" },
        path: "/orders",
        pointer: "/paths/~1orders/get/parameters/4/name",
        ruleId: "parameter-description",
      },
      {
        method: "GET",
        params: {
          convention: "camelCase",
          location: "query",
          name: "page_size",
          suggestion: "pageSize",
        },
        path: "/events",
        pointer: "/paths/~1events/get/parameters/1/name",
        ruleId: "parameter-casing",
      },
      {
        method: "GET",
        params: { dominant: "page", style: "cursor" },
        path: "/events",
        pointer: "/paths/~1events/get/parameters/0/name",
        ruleId: "pagination-style",
      },
      {
        method: "GET",
        params: { dominant: "limit", name: "page_size" },
        path: "/events",
        pointer: "/paths/~1events/get/parameters/1/name",
        ruleId: "page-size-name",
      },
    ]);
  });

  it("checks schema names, property casing and types, and enum casing once per definition", () => {
    expect(
      findings(
        {
          ...documentBasics,
          components: {
            schemas: {
              order_summary: {
                properties: {
                  _links: { type: "object" },
                  created_at: { type: "string" },
                  items: {
                    items: {
                      properties: {
                        unitPrice: {},
                        Status: { enum: ["OPEN", "closed"] },
                      },
                    },
                    type: "array",
                  },
                },
                type: "object",
              },
            },
          },
          paths: {
            "/orders": {
              get: {
                responses: {
                  "200": {
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/order_summary",
                        },
                      },
                    },
                    description: "OK",
                  },
                },
              },
            },
          },
        },
        { disabledRules: ["property-type"] },
      ),
    ).toEqual([
      {
        method: "",
        params: { name: "order_summary", suggestion: "OrderSummary" },
        path: "",
        pointer: "/components/schemas/order_summary",
        ruleId: "schema-name-casing",
      },
      {
        method: "",
        params: {
          convention: "camelCase",
          name: "created_at",
          suggestion: "createdAt",
        },
        path: "",
        pointer: "/components/schemas/order_summary/properties/created_at",
        ruleId: "property-casing",
      },
      {
        method: "",
        params: {
          convention: "camelCase",
          name: "Status",
          suggestion: "status",
        },
        path: "",
        pointer:
          "/components/schemas/order_summary/properties/items/items/properties/Status",
        ruleId: "property-casing",
      },
      {
        method: "",
        params: { values: "OPEN, closed" },
        path: "",
        pointer:
          "/components/schemas/order_summary/properties/items/items/properties/Status/enum",
        ruleId: "enum-value-casing",
      },
    ]);
  });

  it("checks inline schemas with their owning endpoint and missing property types", () => {
    expect(
      findings({
        ...documentBasics,
        paths: {
          "/orders": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { properties: { note: {} }, type: "object" },
                  },
                },
              },
              responses: { "201": { description: "Created" } },
            },
          },
        },
      }),
    ).toEqual([
      {
        method: "POST",
        params: { name: "note" },
        path: "/orders",
        pointer:
          "/paths/~1orders/post/requestBody/content/application~1json/schema/properties/note",
        ruleId: "property-type",
      },
    ]);
  });

  it("flags error responses that diverge from the dominant error schema", () => {
    const errorResponse = (schema: Record<string, unknown>) => ({
      content: { "application/problem+json": { schema } },
      description: "Error",
    });

    expect(
      findings({
        ...documentBasics,
        components: {
          responses: {
            NotFound: errorResponse({ $ref: "#/components/schemas/Problem" }),
          },
          schemas: { Problem: { type: "object" } },
        },
        paths: {
          "/a": {
            get: {
              responses: {
                "404": { $ref: "#/components/responses/NotFound" },
                "500": errorResponse({ $ref: "#/components/schemas/Problem" }),
              },
            },
          },
          "/b": {
            get: {
              responses: {
                "400": errorResponse({
                  properties: { message: { type: "string" } },
                  type: "object",
                }),
                default: { description: "Unexpected" },
              },
            },
          },
        },
      }),
    ).toEqual([
      {
        method: "GET",
        params: { dominant: "Problem", schema: "inline", status: "400" },
        path: "/b",
        pointer: "/paths/~1b/get/responses/400",
        ruleId: "error-schema-consistency",
      },
    ]);
  });

  it("checks servers, document metadata, and tags", () => {
    expect(
      findings({
        info: { description: " ", title: "Orders", version: "1" },
        openapi: "3.0.3",
        paths: {
          "/orders": {
            get: { responses: {}, tags: ["orders", "billing", "orders"] },
          },
        },
        servers: [
          { url: "http://api.example.com" },
          { url: "http://localhost:8080" },
          { url: "https://{region}.example.com" },
        ],
        tags: [{ description: "Orders", name: "orders" }, { name: "admin" }],
      }),
    ).toEqual([
      {
        method: "",
        params: { url: "http://api.example.com" },
        path: "",
        pointer: "/servers/0/url",
        ruleId: "server-https",
      },
      {
        method: "",
        params: { field: "description" },
        path: "",
        pointer: "/info",
        ruleId: "info-metadata",
      },
      {
        method: "",
        params: { field: "contact" },
        path: "",
        pointer: "/info",
        ruleId: "info-metadata",
      },
      {
        method: "",
        params: { field: "license" },
        path: "",
        pointer: "/info",
        ruleId: "info-metadata",
      },
      {
        method: "",
        params: { tag: "admin" },
        path: "",
        pointer: "/tags/1/name",
        ruleId: "tag-description",
      },
      {
        method: "GET",
        params: { tag: "billing" },
        path: "/orders",
        pointer: "/paths/~1orders/get/tags/1",
        ruleId: "tag-declared",
      },
    ]);
  });

  it("supports Swagger 2.0 documents", () => {
    expect(
      ruleIds({
        definitions: { pet: { properties: { pet_name: { type: "string" } } } },
        host: "petstore.example.com",
        info: documentBasics.info,
        paths: {
          "/pets": {
            get: {
              parameters: [
                { description: "d", in: "body", name: "body", schema: {} },
              ],
              responses: {},
            },
          },
        },
        schemes: ["http", "https"],
        swagger: "2.0",
      }),
    ).toEqual([
      "request-body-on-safe-method",
      "schema-name-casing",
      "property-casing",
      "server-https",
    ]);
  });

  it("honors conventions and disabled rules when scoring", () => {
    const root = {
      ...documentBasics,
      paths: {
        "/order_items": {
          get: {
            parameters: [{ description: "d", in: "query", name: "page_size" }],
            responses: {},
          },
        },
      },
    };
    const defaultReport = createStyleGuideReport(
      root,
      DEFAULT_STYLE_GUIDE_CONFIG,
    );
    const snakeReport = createStyleGuideReport(root, {
      ...DEFAULT_STYLE_GUIDE_CONFIG,
      parameterCase: "snake_case",
      pathCase: "snake_case",
    });
    const disabledReport = createStyleGuideReport(root, {
      ...DEFAULT_STYLE_GUIDE_CONFIG,
      disabledRules: ["path-casing", "parameter-casing"],
    });

    expect(defaultReport.violations.map((v) => v.ruleId)).toEqual([
      "path-casing",
      "parameter-casing",
    ]);
    expect(defaultReport.counts).toEqual({ error: 0, info: 0, warning: 2 });
    expect(defaultReport.score).toBeLessThan(100);
    expect(defaultReport.passingRuleCount).toBe(STYLE_RULES.length - 2);
    expect(snakeReport.violations).toEqual([]);
    expect(snakeReport.score).toBe(100);
    expect(disabledReport.violations).toEqual([]);
    expect(disabledReport.enabledRuleCount).toBe(STYLE_RULES.length - 2);
    expect(
      disabledReport.rules.find((rule) => rule.id === "path-casing"),
    ).toMatchObject({ checkedCount: 0, enabled: false, violationCount: 0 });
  });

  it("points at locations that can be highlighted in YAML source", () => {
    const source = `openapi: 3.0.3
info:
  title: Orders
  version: 1.0.0
paths:
  /orders/:
    get:
      responses: {}
`;
    const [violation] = createStyleGuideReport(YAML.parse(source), {
      ...DEFAULT_STYLE_GUIDE_CONFIG,
      disabledRules: ["info-metadata"],
    }).violations;
    const range = findJsonPointerSourceRange(source, violation.pointer, {
      target: violation.highlight,
    });

    expect(violation.ruleId).toBe("path-trailing-slash");
    expect(source.slice(range!.start, range!.end)).toBe("/orders/");
    expect(
      findJsonPointerSourceRange(source, "/paths/~1orders~1/get", {
        target: "key",
      }),
    ).toEqual({
      end: source.indexOf("get:") + 3,
      start: source.indexOf("get:"),
    });
  });
});
