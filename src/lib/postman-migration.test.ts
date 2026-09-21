import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { DEFAULT_OPENAPI_SCHEMA, parseOpenApiSchema } from "./openapi";
import {
  createPostmanCollection,
  POSTMAN_COLLECTION_SCHEMA,
} from "./postman-collection";
import {
  MAX_MIGRATION_BYTES,
  MAX_MIGRATION_REQUESTS,
  MigrationError,
  buildPostmanMigration,
  parseMigrationCollection,
  parseMigrationEnvironment,
  parseMigrationOverrides,
  serializePostmanMigration,
  type MigrationOptions,
} from "./postman-migration";

const request = (
  url: unknown = "https://api.example.com/users/:id",
  extra: Record<string, unknown> = {},
) => ({ name: "Get user", request: { method: "GET", url, ...extra } });
function collection(
  items: unknown[] = [request()],
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    info: {
      name: "Imported API",
      schema: POSTMAN_COLLECTION_SCHEMA,
      description: { content: "Collection description" },
    },
    item: items,
    ...extra,
  });
}
function build(text = collection(), options: Partial<MigrationOptions> = {}) {
  const source = parseMigrationCollection(text);
  return buildPostmanMigration(source, {
    title: source.name,
    version: "1.0.0",
    selectedIds: source.requests.map((r) => r.id),
    ...options,
  });
}
const response = (value: unknown, code = 200) => ({
  name: "Example",
  code,
  body: JSON.stringify(value),
  header: [{ key: "Content-Type", value: "application/json" }],
});
function raw(value: unknown) {
  return {
    mode: "raw",
    raw: JSON.stringify(value),
    options: { raw: { language: "json" } },
  };
}

describe("Postman migration imports", () => {
  it("reads nested folders, request URL strings, scoped variables, and inherited settings", () => {
    const source = parseMigrationCollection(
      collection(
        [
          {
            name: "Users",
            variable: [{ key: "scope", value: "folder" }],
            item: [{ name: "Read", request: "https://api.example.com/users" }],
          },
        ],
        {
          variable: [{ key: "scope", value: "collection" }],
          event: [{ listen: "test" }],
          auth: { type: "bearer" },
        },
      ),
    );
    expect(source.requests[0]).toMatchObject({
      id: "/item/0/item/0",
      name: "Read",
      method: "GET",
      folders: ["Users"],
      variables: { scope: "folder" },
      auth: { type: "bearer" },
      scripts: true,
    });
    expect(source.description).toBe("Collection description");
  });
  it.each([
    "{",
    "[]",
    "null",
    collection([], {}),
    collection([{}]),
    collection([request()], { info: { name: "Old", schema: "v1" } }),
  ])("rejects invalid collections: %s", (text) => {
    expect(() => parseMigrationCollection(text)).toThrow(MigrationError);
  });
  it("bounds bytes, nesting, metadata, and request count", () => {
    expect(() =>
      parseMigrationCollection(" ".repeat(MAX_MIGRATION_BYTES + 1)),
    ).toThrow("limit");
    let nested: unknown = request();
    for (let i = 0; i < 50; i++) nested = { item: [nested] };
    expect(() => parseMigrationCollection(collection([nested]))).toThrow(
      "limit",
    );
    expect(() =>
      parseMigrationCollection(
        collection([{ ...request(), name: "a".repeat(501) }]),
      ),
    ).toThrow("limit");
    expect(() =>
      parseMigrationCollection(
        collection(
          Array.from({ length: MAX_MIGRATION_REQUESTS + 1 }, () => request()),
        ),
      ),
    ).toThrow("limit");
  });
  it("handles BOM and enabled scalar environment values without evaluating templates", () => {
    expect(
      parseMigrationCollection("\uFEFF" + collection()).requests,
    ).toHaveLength(1);
    expect(
      parseMigrationEnvironment(
        JSON.stringify({
          values: [
            { key: "baseUrl", value: "{{host}}" },
            { key: "count", value: 3 },
            { key: "flag", value: false },
            { key: "disabled", value: "secret", enabled: false },
          ],
        }),
      ),
    ).toEqual({ baseUrl: "{{host}}", count: "3", flag: "false" });
    expect(() =>
      parseMigrationEnvironment('{"values":[{"key":"x","value":{}}]}'),
    ).toThrow("environment");
    expect(() => parseMigrationEnvironment("{}")).toThrow("environment");
  });
  it("requires string override maps and treats prototype-looking keys as data", () => {
    expect(
      parseMigrationOverrides('{"__proto__":"data","constructor":"value"}'),
    ).toEqual(JSON.parse('{"__proto__":"data","constructor":"value"}'));
    for (const input of [
      "null",
      "[]",
      '{"x":3}',
      '{"": "x"}',
      '{"x":9007199254740993}',
    ])
      expect(() => parseMigrationOverrides(input)).toThrow(MigrationError);
  });
});

describe("Postman migration conversion", () => {
  it("produces independently parseable JSON and YAML with operation-level servers", () => {
    const result = build();
    expect(result.canExport).toBe(true);
    const op = result.document.paths["/users/{id}"].get;
    expect(op.servers).toEqual([{ url: "https://api.example.com" }]);
    expect(op.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
    expect(op.responses.default).toBeDefined();
    for (const format of ["json", "yaml"] as const) {
      const text = serializePostmanMigration(result, format);
      expect(parseOpenApiSchema(text).ok).toBe(true);
      expect(
        (format === "json" ? JSON.parse(text) : YAML.parse(text)).paths[
          "/users/{id}"
        ].get.summary,
      ).toBe("Get user");
    }
  });
  it("round-trips collections exported by this app", () => {
    const original = parseOpenApiSchema(DEFAULT_OPENAPI_SCHEMA);
    if (!original.ok) throw new Error("invalid fixture");
    const { endpoints, securitySchemes, title, version, serverUrl } =
      original.value;
    const exported = createPostmanCollection(endpoints, securitySchemes, {
      title,
      version,
      serverUrl,
    });
    const result = build(JSON.stringify(exported.collection));
    expect(result.canExport).toBe(true);
    expect(result.operations).toHaveLength(endpoints.length);
    const parsed = parseOpenApiSchema(
      serializePostmanMigration(result, "yaml"),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.endpoints.map((e) => e.method).sort()).toEqual(
      endpoints.map((e) => e.method).sort(),
    );
  });
  it("resolves nested base variables using overrides over environment and collection values", () => {
    const result = build(
      collection(
        [
          request("{{baseUrl}}/users/{{id}}", {
            header: [{ key: "X-Region", value: "{{region}}" }],
          }),
        ],
        {
          variable: [
            { key: "baseUrl", value: "https://{{host}}/v1" },
            { key: "host", value: "collection.example.com" },
            { key: "region", value: "collection" },
            { key: "id", value: "42" },
          ],
        },
      ),
      {
        environment: { host: "environment.example.com", region: "environment" },
        overrides: { host: "override.example.com", region: "override" },
        includeExamples: true,
      },
    );
    const op = result.document.paths["/v1/users/{id}"].get;
    expect(op.servers[0].url).toBe("https://override.example.com");
    expect(op.parameters.find((p) => p.in === "header")?.example).toBe(
      "override",
    );
  });
  it("uses structured URL fields and omits disabled structured query entries even when raw includes them", () => {
    const result = build(
      collection([
        request({
          protocol: "https",
          host: ["api", "example", "com"],
          port: "8443",
          path: ["users", ":id"],
          variable: [
            { key: "id", description: { content: "User ID" }, value: "42" },
          ],
          query: [
            { key: "tag", value: "a" },
            { key: "tag", value: "b" },
            { key: "hidden", value: "secret", disabled: true },
          ],
        }),
      ]),
      { includeExamples: true },
    );
    const op = result.document.paths["/users/{id}"].get;
    expect(op.servers[0].url).toBe("https://api.example.com:8443");
    expect(op.parameters[0].description).toBe("User ID");
    expect(op.parameters[1]).toMatchObject({
      name: "tag",
      schema: { type: "array", items: { type: "string" } },
      example: ["a", "b"],
      style: "form",
      explode: true,
      required: false,
    });
    const rawResult = build(
      collection([
        request({ raw: "https://example.com/?hidden=secret", query: [] }),
      ]),
    );
    expect(rawResult.document.paths["/"].get.parameters).toEqual([]);
  });
  it("accepts raw query values, strips URL credentials, and ignores fragments", () => {
    const result = build(
      collection([
        request(
          "https://alice:private-password@example.com/search?q=hello+world&q=two#fragment",
        ),
      ]),
    );
    expect(result.document.paths["/search"].get.servers).toEqual([
      { url: "https://example.com" },
    ]);
    expect(result.diagnostics.map((d) => d.code)).toContain("credentials");
    const text = serializePostmanMigration(result, "json");
    expect(text).not.toContain("private-password");
    expect(text).not.toContain("hello world");
  });
  it("supports relative URLs and missing base variables with an explicit fallback", () => {
    for (const url of ["/users/:id", "users/:id", "{{baseUrl}}/users/:id"]) {
      const result = build(collection([request(url)]), {
        fallbackServer: "https://fallback.example.com/v2",
      });
      expect(result.document.paths["/v2/users/{id}"].get.servers[0].url).toBe(
        "https://fallback.example.com",
      );
    }
  });
  it.each([
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com?x=1",
    "https://example.com#x",
    "https://{{host}}",
  ])("rejects unsuitable fallback servers: %s", (fallbackServer) => {
    expect(() => build(collection(), { fallbackServer })).toThrow("metadata");
  });
  it("reports cyclic/dynamic/unresolved variables without running scripts or network calls", () => {
    const network = vi.spyOn(globalThis, "fetch");
    try {
      const result = build(
        collection(
          [
            request("https://example.com/users", {
              body: {
                mode: "raw",
                raw: "{{cycle}} {{$randomUUID}} {{vault:secret}}",
                options: { raw: { language: "json" } },
              },
            }),
          ],
          {
            variable: [{ key: "cycle", value: "{{cycle}}" }],
            event: [
              { script: { exec: ["throw new Error('do not execute')"] } },
            ],
            protocolProfileBehavior: { followRedirects: false },
          },
        ),
      );
      expect(result.diagnostics.map((d) => d.code)).toEqual(
        expect.arrayContaining(["scripts", "settings", "unresolved", "sample"]),
      );
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  it("prevents exponential variable expansion", () => {
    const variables = [{ key: "v0", value: "x".repeat(100_000) }];
    for (let i = 1; i < 8; i++)
      variables.push({ key: `v${i}`, value: `{{v${i - 1}}}{{v${i - 1}}}` });
    expect(() =>
      build(
        collection(
          [
            request("https://example.com", {
              header: [{ key: "X-Test", value: "{{v7}}" }],
            }),
          ],
          { variable: variables },
        ),
      ),
    ).toThrow("limit");
  });
  it("blocks incomplete migrations and allows deselecting unsupported requests", () => {
    const text = collection([
      request(),
      request("https://example.com", { method: "CONNECT" }),
      request("{{missing}}/users"),
    ]);
    const result = build(text);
    expect(result.canExport).toBe(false);
    expect(
      result.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.code),
    ).toEqual(["method", "url"]);
    expect(() => serializePostmanMigration(result, "json")).toThrow("output");
    expect(build(text, { selectedIds: ["/item/0"] }).canExport).toBe(true);
  });
  it("blocks conflicting templates across methods and accepts an explicit common override", () => {
    const text = collection([
      request("https://example.com/users/:id"),
      request("https://example.com/users/:name", { method: "DELETE" }),
    ]);
    expect(build(text).diagnostics.map((d) => d.code)).toContain("conflict");
    const result = build(text, { paths: { "/item/1": "/users/{id}" } });
    expect(result.canExport).toBe(true);
    expect(result.operations).toHaveLength(2);
    for (const path of [
      "relative",
      "/users/{id}/{id}",
      "/users/{bad-name}",
      "/users?x=1",
    ])
      expect(build(text, { paths: { "/item/0": path } }).canExport).toBe(false);
  });
  it("infers bodies and multiple response shapes while preserving optional fields", () => {
    const text = collection([
      {
        ...request("https://example.com/users", {
          method: "POST",
          body: raw({ name: "private-name", age: 5 }),
        }),
        response: [response({ id: 1, name: "private-name" })],
      },
      {
        ...request("https://example.com/users", {
          method: "POST",
          body: raw({ name: "other", enabled: true }),
        }),
        response: [
          response({ id: "two", enabled: true }),
          response({ error: "not found" }, 404),
        ],
      },
    ]);
    const result = build(text, { requireObserved: true });
    expect(result.operations[0].requestCount).toBe(2);
    const op = result.document.paths["/users"].post;
    expect(op.requestBody?.content["application/json"].schema.required).toEqual(
      ["name"],
    );
    const shape = op.responses["200"].content!["application/json"].schema;
    expect(shape.required).toEqual(["id"]);
    expect(shape.properties!.id.type).toEqual(
      expect.arrayContaining(["integer", "string"]),
    );
    expect(Object.keys(op.responses)).toEqual(["200", "404"]);
    expect(serializePostmanMigration(result, "json")).not.toContain(
      "private-name",
    );
    expect(
      build(text).document.paths["/users"].post.requestBody?.content[
        "application/json"
      ].schema.required,
    ).toBeUndefined();
  });
  it("includes raw-body examples only when enabled and retains prototype-named JSON properties safely", () => {
    const text = collection([
      request("https://example.com", {
        body: {
          mode: "raw",
          raw: '{"__proto__":{"secret":"example"},"constructor":true}',
          options: { raw: { language: "json" } },
        },
      }),
    ]);
    const media = build(text, { includeExamples: true }).document.paths["/"].get
      .requestBody!.content["application/json"];
    expect(Object.hasOwn(media.schema.properties!, "__proto__")).toBe(true);
    expect(media.example).toEqual(
      JSON.parse('{"__proto__":{"secret":"example"},"constructor":true}'),
    );
    expect(({} as Record<string, unknown>).secret).toBeUndefined();
  });
  it("handles text, XML, forms, binary files, and GraphQL without loading local files", () => {
    const modes = [
      { mode: "raw", raw: "<user/>", options: { raw: { language: "xml" } } },
      { mode: "raw", raw: "plain text" },
      {
        mode: "urlencoded",
        urlencoded: [
          { key: "tag", value: "a" },
          { key: "tag", value: "b" },
          { key: "skip", disabled: true },
        ],
      },
      {
        mode: "formdata",
        formdata: [{ key: "upload", type: "file", src: "C:/private/key.txt" }],
      },
      { mode: "file", file: { src: "C:/private/key.txt" } },
      {
        mode: "graphql",
        graphql: { query: "query { users { id } }", variables: '{"id":1}' },
      },
    ];
    const result = build(
      collection(
        modes.map((body, i) =>
          request(`https://example.com/body${i}`, { method: "POST", body }),
        ),
      ),
    );
    expect(
      result.document.paths["/body0"].post.requestBody?.content[
        "application/xml"
      ].schema.type,
    ).toBe("string");
    expect(
      result.document.paths["/body1"].post.requestBody?.content["text/plain"],
    ).toBeDefined();
    expect(
      result.document.paths["/body2"].post.requestBody?.content[
        "application/x-www-form-urlencoded"
      ].schema.properties,
    ).toEqual({ tag: { type: "array", items: { type: "string" } } });
    expect(
      result.document.paths["/body3"].post.requestBody?.content[
        "multipart/form-data"
      ].schema.properties!.upload,
    ).toEqual({ type: "string", format: "binary" });
    expect(
      result.document.paths["/body4"].post.requestBody?.content[
        "application/octet-stream"
      ].schema,
    ).toEqual({ type: "string", format: "binary" });
    expect(
      result.document.paths["/body5"].post.requestBody?.content[
        "application/json"
      ].schema.properties!.variables.properties!.id.type,
    ).toBe("integer");
    expect(serializePostmanMigration(result, "json")).not.toContain(
      "private/key.txt",
    );
  });
  it("retains media types for invalid samples and reports unsupported bodies and bad statuses", () => {
    const text = collection([
      {
        ...request("https://example.com", {
          body: {
            mode: "raw",
            raw: "{",
            options: { raw: { language: "json" } },
          },
        }),
        response: [response({}, 999), response({}, 204)],
      },
      request("https://example.com/other", { body: { mode: "unknown" } }),
      request("https://example.com/disabled", {
        body: { mode: "unknown", disabled: true },
      }),
    ]);
    const result = build(text);
    expect(
      result.document.paths["/"].get.requestBody?.content["application/json"]
        .schema,
    ).toEqual({});
    expect(
      result.document.paths["/"].get.responses["204"].content,
    ).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      "sample",
      "response",
      "body",
    ]);
  });
  it("maps inherited auth and explicit noauth without copying credentials", () => {
    const text = collection(
      [
        {
          name: "Private",
          auth: {
            type: "basic",
            basic: [{ key: "password", value: "secret-pass" }],
          },
          item: [
            request("https://example.com/private"),
            request("https://example.com/public", { auth: { type: "noauth" } }),
          ],
        },
        request("https://example.com/bearer"),
      ],
      {
        auth: {
          type: "bearer",
          bearer: [{ key: "token", value: "secret-token" }],
        },
      },
    );
    const result = build(text, { includeExamples: true });
    expect(result.document.paths["/private"].get.security).toEqual([
      { postmanAuth1: [] },
    ]);
    expect(result.document.paths["/public"].get.security).toEqual([]);
    expect(result.document.components?.securitySchemes.postmanAuth2).toEqual({
      type: "http",
      scheme: "bearer",
    });
    expect(serializePostmanMigration(result, "json")).not.toMatch(
      /secret-pass|secret-token/,
    );
  });
  it.each(["query", "header"])(
    "maps %s API keys without copying their example values",
    (location) => {
      const text = collection([
        request("https://example.com?api_key=secret-key", {
          auth: {
            type: "apikey",
            apikey: [
              { key: "key", value: "api_key" },
              { key: "in", value: location },
              { key: "value", value: "secret-key" },
            ],
          },
          header: [
            { key: "api_key", value: "secret-key" },
            { key: "Authorization", value: "secret-auth" },
            { key: "Cookie", value: "secret-cookie" },
          ],
        }),
      ]);
      const result = build(text);
      expect(result.document.components?.securitySchemes.postmanAuth1).toEqual({
        type: "apiKey",
        name: "api_key",
        in: location,
      });
      expect(
        result.document.paths["/"].get.parameters.filter(
          (p) => p.in === location,
        ),
      ).toEqual([]);
      expect(serializePostmanMigration(result, "json")).not.toMatch(
        /secret-key|secret-auth|secret-cookie/,
      );
    },
  );
  it("merges mixed authentication alternatives and explicitly marks unsupported helpers", () => {
    const result = build(
      collection([
        request("https://example.com", { auth: { type: "bearer" } }),
        request("https://example.com", { auth: { type: "noauth" } }),
        request("https://example.com/oauth", { auth: { type: "oauth2" } }),
      ]),
    );
    expect(result.document.paths["/"].get.security).toEqual([
      { postmanAuth1: [] },
      {},
    ]);
    expect(
      result.document.paths["/oauth"].get["x-postman-auth-review-required"],
    ).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["merged", "auth"]);
  });
  it("bounds diagnostics while retaining an error beyond the displayed window", () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      ...request(`https://example.com/path${i}`),
      event: [{ listen: "test" }],
    }));
    const result = build(collection([...items, request("invalid-url")]));
    expect(result.diagnostics).toHaveLength(200);
    expect(result.diagnosticCount).toBe(202);
    expect(result.canExport).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
  it("retains binary file schemas when repeated fields and duplicate operations merge", () => {
    const fileBody = {
      mode: "formdata",
      formdata: [
        { key: "uploads", type: "file", src: "a.txt" },
        { key: "uploads", type: "file", src: "b.txt" },
        { key: "uploads", type: "file", src: "c.txt" },
      ],
    };
    const result = build(
      collection([
        request("https://example.com/upload", { body: fileBody }),
        request("https://example.com/upload", { body: fileBody }),
      ]),
    );
    expect(
      result.document.paths["/upload"].get.requestBody?.content[
        "multipart/form-data"
      ].schema.properties!.uploads.items,
    ).toEqual({ type: "string", format: "binary" });
  });
  it("marks manually supplied authentication headers for review even without an auth helper", () => {
    const result = build(
      collection([
        request("https://example.com", {
          header: "Authorization: private-token\r\nX-Trace: trace-id",
        }),
      ]),
      { includeExamples: true },
    );
    expect(
      result.document.paths["/"].get["x-postman-auth-review-required"],
    ).toBe(true);
    expect(serializePostmanMigration(result, "json")).not.toContain(
      "private-token",
    );
    expect(result.document.paths["/"].get.parameters).toMatchObject([
      { name: "X-Trace", example: "trace-id" },
    ]);
  });
  it("normalizes header name whitespace before excluding credential headers", () => {
    const result = build(
      collection([
        request("https://example.com", {
          header: [
            { key: " Authorization ", value: "private-token" },
            { key: " COOKIE ", value: "private-cookie" },
            { key: "Invalid Header", value: "bad" },
            { key: " X-Trace ", value: "trace" },
          ],
        }),
      ]),
      { includeExamples: true },
    );
    expect(result.document.paths["/"].get.parameters).toMatchObject([
      { name: "X-Trace", example: "trace" },
    ]);
    expect(serializePostmanMigration(result, "json")).not.toMatch(
      /private-token|private-cookie|Invalid Header/,
    );
  });
  it("caps variable scopes and exported payloads", () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({
      key: `v${i}`,
      value: "a",
    }));
    expect(() =>
      parseMigrationEnvironment(JSON.stringify({ values: many })),
    ).toThrow("limit");
    expect(() =>
      parseMigrationCollection(collection([request()], { variable: many })),
    ).toThrow("limit");
    expect(() =>
      parseMigrationOverrides(
        JSON.stringify(Object.fromEntries(many.map((v) => [v.key, v.value]))),
      ),
    ).toThrow("limit");
    const result = build(
      collection([
        request("https://example.com/one", {
          body: { mode: "raw", raw: "x".repeat(1024 * 1024) },
        }),
        request("https://example.com/two", {
          body: { mode: "raw", raw: "x".repeat(1024 * 1024) },
        }),
      ]),
      { includeExamples: true },
    );
    expect(() => serializePostmanMigration(result, "json")).toThrow("output");
  });
  it("retains the first usable response example when earlier samples were invalid", () => {
    const result = build(
      collection([
        {
          ...request("https://example.com"),
          response: [
            {
              code: 200,
              body: "{",
              header: [{ key: "Content-Type", value: "application/json" }],
            },
            response({ id: 42 }),
          ],
        },
      ]),
      { includeExamples: true },
    );
    const media =
      result.document.paths["/"].get.responses["200"].content![
        "application/json"
      ];
    expect(media.schema).toEqual({});
    expect(media.example).toEqual({ id: 42 });
  });
  it("rejects empty and stale selections and invalid metadata", () => {
    for (const selectedIds of [[], ["missing"]])
      expect(() => build(collection(), { selectedIds })).toThrow("selection");
    expect(() => build(collection(), { title: " " })).toThrow("metadata");
    expect(() => build(collection(), { version: "" })).toThrow("metadata");
  });
});
