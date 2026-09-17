import YAML from "yaml";
import { describe, expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "./openapi";
import {
  buildTrafficDefinition,
  discoverTrafficRoutes,
  DiscoveryError,
  MAX_DISCOVERY_BYTES,
  mergeTrafficSchemas,
  normalizeDiscoveryPrefix,
  parseTrafficCapture,
  serializeTrafficDefinition,
  type TrafficCapture,
} from "./traffic-discovery";

const origin = "https://api.example.com";
function entry(
  path = "/users/12",
  body: unknown = { id: 12, name: "Ada" },
  status = 200,
  method = "GET",
) {
  return {
    request: { url: origin + path, method },
    response: {
      status,
      content: {
        mimeType: "application/json; charset=utf-8",
        text: JSON.stringify(body),
      },
    },
  };
}
const har = (entries: unknown[]) => JSON.stringify({ log: { entries } });
function generate(capture: TrafficCapture, requireObserved = false) {
  return buildTrafficDefinition(
    discoverTrafficRoutes(capture, origin, "", true),
    {
      origin,
      prefix: "",
      title: "Observed API",
      version: "1.0",
      requireObserved,
    },
  );
}
const pathsOf = (document: Record<string, unknown>) =>
  document.paths as Record<
    string,
    Record<
      string,
      {
        parameters?: {
          name: string;
          in: string;
          required: boolean;
          schema: Record<string, unknown>;
        }[];
        requestBody?: {
          required: boolean;
          content: Record<string, { schema: Record<string, unknown> }>;
        };
        responses: Record<
          string,
          { content?: Record<string, { schema: Record<string, unknown> }> }
        >;
      }
    >
  >;

describe("traffic-to-OpenAPI discovery", () => {
  it("combines captured response shapes without values and generates an editor-compatible JSON/YAML document", () => {
    const capture = parseTrafficCapture(
      har([
        entry(),
        entry("/users/34", { id: 34, enabled: true }),
        entry("/users/12", { error: "no access" }, 403),
      ]),
    );
    const result = generate(capture, true);
    const operation = pathsOf(result.document)["/users/{id}"].get;
    expect(operation.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "integer" } },
    ]);
    expect(
      operation.responses["200"].content?.["application/json"].schema,
    ).toEqual({
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        id: { type: "integer" },
        name: { type: "string" },
      },
      required: ["id"],
    });
    expect(Object.keys(operation.responses)).toEqual(["200", "403"]);
    expect(result.operations).toEqual([
      {
        method: "GET",
        path: "/users/{id}",
        observations: 3,
        statuses: [200, 403],
      },
    ]);
    for (const format of ["json", "yaml"] as const) {
      const text = serializeTrafficDefinition(result, format);
      expect(text).not.toContain("Ada");
      expect(text).not.toContain("no access");
      expect(parseOpenApiSchema(text).ok).toBe(true);
      expect(YAML.parse(text)).toEqual(result.document);
    }
  });

  it("never retains captured body, header, cookie, query or credential values or sends network requests", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const captured = entry("/users/12?token=secret-query#private-fragment", {
      password: "secret-body",
    });
    const text = har([
      {
        ...captured,
        request: {
          ...captured.request,
          url: "https://secret-user:secret-pass@api.example.com/users/12?token=secret-query#private-fragment",
          headers: [{ name: "Authorization", value: "secret-header" }],
          cookies: [{ name: "sid", value: "secret-cookie" }],
        },
      },
    ]);
    const capture = parseTrafficCapture(text);
    const output = JSON.stringify({ capture, result: generate(capture) });
    expect(output).not.toMatch(/secret-|private-fragment/);
    expect(output).toContain("password");
    expect(output).toContain("token");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("uses conservative optional fields by default and infers request JSON for body-capable methods", () => {
    const first = entry("/users", { id: 1 }, 201, "POST");
    const capture = parseTrafficCapture(
      har([
        {
          ...first,
          request: {
            ...first.request,
            postData: {
              mimeType: "application/json",
              text: '{"name":"Ada","preferences":{"email":true}}',
            },
          },
        },
        first,
      ]),
    );
    const operation = pathsOf(generate(capture).document)["/users"].post;
    expect(operation.requestBody?.required).toBe(false);
    expect(operation.requestBody?.content["application/json"].schema).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        preferences: {
          type: "object",
          properties: { email: { type: "boolean" } },
        },
      },
    });
  });

  it("infers repeated query keys as arrays and preserves empty, leading-zero and unsafe numeric strings", () => {
    const capture = parseTrafficCapture(
      har([
        entry(
          "/users?tag=a&tag=b&page=2&enabled=true&empty=&code=007&large=9007199254740993",
        ),
        entry("/users?page=2.5&enabled=false"),
      ]),
    );
    const parameters = pathsOf(generate(capture, true).document)["/users"].get
      .parameters!;
    const query = Object.fromEntries(
      parameters.map((parameter) => [parameter.name, parameter]),
    );
    expect(query.tag.schema).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(query.tag.required).toBe(false);
    expect(query.page.schema).toEqual({ type: "number" });
    expect(query.page.required).toBe(true);
    expect(query.enabled.schema).toEqual({ type: "boolean" });
    for (const key of ["empty", "code", "large"])
      expect(query[key].schema).toEqual({ type: "string" });
  });

  it("uses HAR queryString when the URL lacks a query, but never duplicates URL values", () => {
    const item = entry("/users");
    const withQuery = {
      ...item,
      request: {
        ...item.request,
        queryString: [{ name: "q", value: "search" }],
      },
    };
    const capture = parseTrafficCapture(
      har([
        withQuery,
        {
          ...withQuery,
          request: { ...withQuery.request, url: origin + "/users?q=search" },
        },
      ]),
    );
    expect(capture.observations.map((row) => row.query)).toEqual(
      Array(2).fill([{ name: "q", types: ["string"], repeated: false }]),
    );
  });

  it("decodes base64 UTF-8 JSON bodies and uses response Content-Type when MIME is absent", () => {
    const item = entry();
    const capture = parseTrafficCapture(
      har([
        {
          ...item,
          response: {
            status: 200,
            headers: [
              {
                name: "Content-Type",
                value: "application/problem+json; charset=utf-8",
              },
            ],
            content: {
              text: Buffer.from('{"сообщение":"Привет"}').toString("base64"),
              encoding: "base64",
            },
          },
        },
      ]),
    );
    expect(capture.warnings).toEqual([]);
    expect(capture.observations[0].responseBody).toEqual({
      mediaType: "application/problem+json",
      schema: {
        type: "object",
        properties: { сообщение: { type: "string" } },
        required: ["сообщение"],
      },
    });
  });

  it.each([
    [{ mimeType: "application/json" }, "missing"],
    [{ mimeType: "application/json", text: "{broken" }, "invalid"],
    [{ mimeType: "application/json", text: "9007199254740993" }, "invalid"],
    [
      { mimeType: "application/json", text: "!invalid!", encoding: "base64" },
      "invalid",
    ],
    [
      { mimeType: "application/json", text: "{}", encoding: "gzip" },
      "unsupported",
    ],
    [{ mimeType: "application/xml", text: "<user/>" }, "unsupported"],
    [{ mimeType: "not a type", text: "{}" }, "media"],
  ])(
    "reports unsupported capture content %j without inventing a JSON structure",
    (content, code) => {
      const capture = parseTrafficCapture(
        har([{ request: entry().request, response: { status: 200, content } }]),
      );
      expect(capture.warnings).toContainEqual({
        entry: 1,
        part: "response",
        code,
      });
      expect(capture.observations[0].responseBody?.schema ?? {}).toEqual({});
    },
  );

  it("keeps inferred schemas broad when any observation of that media type has an unavailable body", () => {
    const capture = parseTrafficCapture(
      har([
        entry(),
        {
          request: entry().request,
          response: { status: 200, content: { mimeType: "application/json" } },
        },
      ]),
    );
    expect(
      pathsOf(generate(capture, true).document)["/users/{id}"].get.responses[
        "200"
      ].content?.["application/json"].schema,
    ).toEqual({});
  });

  it("retains multiple response media types and suppresses bodies for HEAD, 204 and 304", () => {
    const capture = parseTrafficCapture(
      har([
        entry(),
        {
          ...entry(),
          response: {
            status: 200,
            content: { mimeType: "text/plain", text: "secret-text" },
          },
        },
        entry("/users/12", null, 204),
        entry("/users/12", null, 304),
        entry("/users/12", { invalid: true }, 200, "HEAD"),
      ]),
    );
    const paths = pathsOf(generate(capture).document);
    expect(
      Object.keys(paths["/users/{id}"].get.responses["200"].content!),
    ).toEqual(["application/json", "text/plain"]);
    expect(paths["/users/{id}"].get.responses["204"].content).toBeUndefined();
    expect(paths["/users/{id}"].get.responses["304"].content).toBeUndefined();
    expect(paths["/users/{id}"].head.responses["200"].content).toBeUndefined();
  });

  it("scopes origins and prefix boundaries without moving unrelated paths under the server", () => {
    const capture = parseTrafficCapture(
      har([
        entry("/api/users/1"),
        entry("/apiculture"),
        {
          ...entry(),
          request: {
            ...entry().request,
            url: "https://other.example.com/api/users/2",
          },
        },
      ]),
    );
    const routes = discoverTrafficRoutes(capture, origin, "/api/", true);
    expect(routes.map((route) => route.path)).toEqual(["/users/{id}"]);
    const result = buildTrafficDefinition(routes, {
      origin,
      prefix: "/api/",
      title: "API",
      version: "1",
      requireObserved: false,
    });
    expect(result.document.servers).toEqual([{ url: origin + "/api" }]);
    expect(result.observations).toBe(1);
  });

  it("supports literal routes, numeric/UUID suggestions, nested parameters and manual merging", () => {
    const capture = parseTrafficCapture(
      har([
        entry("/users/12/orders/8"),
        entry("/users/34/orders/9"),
        entry("/users/27d7beea-260a-430f-9b41-2bcd3382f7ca/orders/1"),
      ]),
    );
    expect(
      discoverTrafficRoutes(capture, origin, "", true).map(
        (route) => route.path,
      ),
    ).toEqual(["/users/{id}/orders/{id2}"]);
    const routes = discoverTrafficRoutes(capture, origin, "", false);
    expect(routes).toHaveLength(3);
    const original = JSON.stringify(routes);
    const result = buildTrafficDefinition(
      routes.map((route) => ({
        ...route,
        path: "/users/{userId}/orders/{orderId}",
      })),
      {
        origin,
        prefix: "",
        title: "API",
        version: "1",
        requireObserved: false,
      },
    );
    expect(result.operations).toHaveLength(1);
    expect(result.observations).toBe(3);
    expect(JSON.stringify(routes)).toBe(original);
  });

  it.each([
    "/users/{id}/{id}",
    "/users/{id-name}",
    "/users/{partial}x",
    "/other/{id}",
    "/users/{id}?q=1",
    "relative",
  ])(
    "rejects a template that cannot represent the observations: %s",
    (path) => {
      const routes = discoverTrafficRoutes(
        parseTrafficCapture(har([entry()])),
        origin,
        "",
        true,
      );
      expect(() =>
        buildTrafficDefinition([{ ...routes[0], path }], {
          origin,
          prefix: "",
          title: "API",
          version: "1",
          requireObserved: false,
        }),
      ).toThrow("template");
    },
  );

  it("rejects equivalent path shapes with inconsistent parameter names, even across HTTP methods", () => {
    const routes = discoverTrafficRoutes(
      parseTrafficCapture(
        har([entry(), entry("/users/12", {}, 200, "DELETE")]),
      ),
      origin,
      "",
      true,
    );
    routes[0].path = "/users/{userId}";
    expect(() =>
      buildTrafficDefinition(routes, {
        origin,
        prefix: "",
        title: "API",
        version: "1",
        requireObserved: false,
      }),
    ).toThrow("conflict");
    routes[0].included = false;
    expect(
      buildTrafficDefinition(routes, {
        origin,
        prefix: "",
        title: "API",
        version: "1",
        requireObserved: false,
      }).operations,
    ).toHaveLength(1);
  });

  it("merges nested arrays, nullable values, object property presence and prototype-named fields", () => {
    const capture = parseTrafficCapture(
      har([
        entry(
          "/users",
          JSON.parse('{"items":[],"__proto__":{"safe":true},"nullable":null}'),
        ),
        entry(
          "/users",
          JSON.parse(
            '{"items":[{"id":1},{"id":2,"extra":true}],"__proto__":{"safe":false},"nullable":"value"}',
          ),
        ),
      ]),
    );
    const schema = pathsOf(generate(capture, true).document)["/users"].get
      .responses["200"].content!["application/json"].schema;
    expect(schema.properties).toEqual({
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { extra: { type: "boolean" }, id: { type: "integer" } },
          required: ["id"],
        },
      },
      ["__proto__"]: {
        type: "object",
        properties: { safe: { type: "boolean" } },
        required: ["safe"],
      },
      nullable: { type: ["null", "string"] },
    });
    expect(({} as Record<string, unknown>).safe).toBeUndefined();
    expect(
      mergeTrafficSchemas([{ type: "integer" }, { type: "number" }], true),
    ).toEqual({ type: "number" });
  });

  it("counts unusable entries and accepts BOM, while rejecting wholly invalid captures", () => {
    const capture = parseTrafficCapture(
      "\uFEFF" +
        har([
          null,
          entry("/x", {}, 0),
          entry("/x", {}, 200, "CONNECT"),
          entry(),
        ]),
    );
    expect(capture.total).toBe(4);
    expect(capture.skipped).toBe(3);
    expect(
      capture.warnings.filter((warning) => warning.code === "skipped"),
    ).toHaveLength(3);
    for (const input of ["{", "{}", '{"log":{"entries":null}}'])
      expect(() => parseTrafficCapture(input)).toThrow("invalid-har");
    expect(() => parseTrafficCapture(har([]))).toThrow("no-requests");
  });

  it("enforces input, entry, route, query and body structure limits", () => {
    expect(() =>
      parseTrafficCapture(" ".repeat(MAX_DISCOVERY_BYTES + 1)),
    ).toThrow("too-large");
    expect(() => parseTrafficCapture(har(Array(1001).fill(null)))).toThrow(
      "too-many",
    );
    const capture = parseTrafficCapture(
      har(Array.from({ length: 501 }, (_, index) => entry(`/route-${index}`))),
    );
    expect(() => discoverTrafficRoutes(capture, origin, "", false)).toThrow(
      "too-many",
    );
    const query = Array.from({ length: 129 }, (_, index) => `q${index}=v`).join(
      "&",
    );
    const limited = parseTrafficCapture(
      har([entry("/users?" + query, Array(20001).fill(1))]),
    );
    expect(limited.observations[0].query).toHaveLength(128);
    expect(limited.warnings.map((warning) => warning.code)).toEqual([
      "limit",
      "limit",
    ]);
  });

  it("validates generation options and does not include excluded routes", () => {
    const capture = parseTrafficCapture(har([entry()]));
    const routes = discoverTrafficRoutes(capture, origin, "", true);
    const options = {
      origin,
      prefix: "",
      title: "API",
      version: "1",
      requireObserved: false,
    };
    for (const prefix of ["api", "/api?", "/api#", "/api\\", "/api x", "/{id}"])
      expect(() => normalizeDiscoveryPrefix(prefix)).toThrow("prefix");
    expect(() =>
      discoverTrafficRoutes(capture, "https://other.test", "", true),
    ).toThrow("origin");
    expect(() =>
      buildTrafficDefinition(routes, { ...options, origin: origin + "/path" }),
    ).toThrow("origin");
    expect(() =>
      buildTrafficDefinition(routes, { ...options, title: " " }),
    ).toThrow("metadata");
    expect(() =>
      buildTrafficDefinition(
        routes.map((route) => ({ ...route, included: false })),
        options,
      ),
    ).toThrow("empty");
    expect(new DiscoveryError("empty").code).toBe("empty");
  });
});
