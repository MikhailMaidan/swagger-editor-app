import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  addRedactionSources,
  emptyRedactionProject,
  MAX_REDACTION_BYTES,
  MAX_REDACTION_SOURCE_BYTES,
  parseRedactionProject,
  parseRedactionRules,
  readRedactionSource,
  redactData,
  RedactionError,
  serializeRedactedBundle,
  serializeRedactionProject,
  serializeRedactionReport,
  serializeRedactionRules,
  validateRedactionProject,
  type RedactionProject,
  type RedactionRule,
} from "./data-redaction";

const api = () => ({
  openapi: "3.1.0",
  info: { title: "Private sample API", version: "1" },
  servers: [
    {
      url: "https://user:private-password@example.com/api?api_key=url-secret#section",
    },
  ],
  paths: {
    "/items": {
      get: {
        responses: {
          default: {
            description: "Fallback",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/example" },
                example: {
                  password: "example-secret",
                  name: "Ada",
                  email: "ada@example.org",
                  id: 42,
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      example: {
        type: "object",
        required: ["password"],
        properties: {
          password: {
            type: "string",
            enum: ["enum-secret"],
            default: "default-secret",
            example: "scalar-secret",
          },
          example: { type: "integer", example: 9 },
        },
      },
    },
    examples: { default: { value: { token: "registry-secret" } } },
  },
  "x-internal": { password: "extension-secret" },
});
const har = () => ({
  log: {
    version: "1.2",
    entries: [
      {
        request: {
          method: "POST",
          url: "https://user:har-password@example.com/items?token=url-token&email=ada%40example.org&user_id=42",
          headers: [
            { name: "Authorization", value: "Bearer header-secret" },
            { name: "Accept", value: "application/json" },
          ],
          queryString: [
            { name: "token", value: "url-token" },
            { name: "email", value: "ada@example.org" },
            { name: "user_id", value: "42" },
          ],
          cookies: [{ name: "custom-auth-cookie", value: "cookie-secret" }],
          postData: {
            mimeType: "application/json",
            text: JSON.stringify({
              password: "body-secret",
              email: "ada@example.org",
              id: 42,
            }),
          },
        },
        response: {
          status: 200,
          headers: [{ name: "Set-Cookie", value: "session=private" }],
          cookies: [],
          content: {
            mimeType: "application/json",
            text: JSON.stringify({ email: "ada@example.org", userId: 42 }),
          },
          redirectURL: "https://u:redirect-secret@example.com/done",
        },
        time: 5,
      },
    ],
  },
});
const projectFor = (value: unknown, kind?: "openapi" | "har" | "json") =>
  addRedactionSources(emptyRedactionProject(), [
    { name: "Input", text: JSON.stringify(value), kind },
  ]);
const output = (p: RedactionProject) => JSON.parse(redactData(p).files[0].text);
const rule = (
  selector: string,
  action: RedactionRule["action"] = "mask",
  extra: Partial<RedactionRule> = {},
): RedactionRule => ({
  key: "rule-1",
  name: "Rule",
  selector,
  enabled: true,
  action,
  ...extra,
});

describe("scoped OpenAPI redaction", () => {
  it("redacts examples and URLs while preserving schemas, names, constraints, and original inputs", () => {
    const p = projectFor(api());
    const before = serializeRedactionProject(p);
    const result = redactData(p),
      doc = JSON.parse(result.files[0].text);
    expect(
      doc.paths["/items"].get.responses.default.content["application/json"]
        .example.password,
    ).toBe("[redacted]");
    expect(
      doc.paths["/items"].get.responses.default.content["application/json"]
        .example.name,
    ).toBe("Ada");
    expect(doc.components.schemas.example.properties.password).toEqual({
      type: "string",
      enum: ["enum-secret"],
      default: "default-secret",
      example: "[redacted]",
    });
    expect(doc.components.schemas.example.properties.example).toEqual({
      type: "integer",
      example: 9,
    });
    expect(doc.components.examples.default.value.token).toBe("[redacted]");
    expect(
      doc.paths["/items"].get.responses.default.content["application/json"]
        .schema.$ref,
    ).toBe("#/components/schemas/example");
    expect(doc.servers[0].url).not.toContain("private-password");
    expect(doc.servers[0].url).not.toContain("url-secret");
    expect(doc.servers[0].url).toContain("#section");
    expect(doc["x-internal"].password).toBe("extension-secret");
    expect(result.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining(["extension", "constraint-values"]),
    );
    expect(result.files[0].canExport).toBe(true);
    expect(serializeRedactionProject(p)).toBe(before);
  });
  it("handles named parameter/header examples and schema examples arrays", () => {
    const doc = api();
    const value = {
      ...doc,
      paths: {
        "/items": {
          get: {
            parameters: [
              {
                name: "api_key",
                in: "header",
                schema: { type: "string", examples: ["schema-secret"] },
                examples: {
                  example: { value: "named-secret" },
                  external: {
                    externalValue: "https://example.com/sample.json",
                  },
                },
              },
            ],
            responses: {
              "200": {
                description: "OK",
                headers: {
                  Authorization: {
                    schema: { type: "string", example: "header-secret" },
                  },
                },
              },
            },
          },
        },
      },
    };
    const p = projectFor(value),
      result = redactData(p),
      cleaned = JSON.parse(result.files[0].text);
    const param = cleaned.paths["/items"].get.parameters[0];
    expect(param.name).toBe("api_key");
    expect(param.schema.examples).toEqual(["[redacted]"]);
    expect(param.examples.example.value).toBe("[redacted]");
    expect(
      cleaned.paths["/items"].get.responses["200"].headers.Authorization.schema
        .example,
    ).toBe("[redacted]");
    expect(result.diagnostics.some((d) => d.code === "external-example")).toBe(
      true,
    );
  });
  it("retains YAML format while transforming document examples", () => {
    const p = addRedactionSources(emptyRedactionProject(), [
      { name: "api.yaml", text: YAML.stringify(api()), kind: "openapi" },
    ]);
    const result = redactData(p);
    expect(result.files[0].format).toBe("yaml");
    expect(
      YAML.parse(result.files[0].text).components.examples.default.value.token,
    ).toBe("[redacted]");
  });
  it("reports templated URLs and leaves metadata untouched by automatic personal rules", () => {
    const value = {
      ...api(),
      servers: [{ url: "https://{tenant}.example.com?token=template-secret" }],
      info: {
        title: "Private sample API",
        version: "1",
        contact: { name: "Original contact", email: "contact@example.org" },
      },
    };
    const p = projectFor(value);
    p.options.personal = true;
    const result = redactData(p),
      doc = JSON.parse(result.files[0].text);
    expect(doc.info.contact.name).toBe("Original contact");
    expect(doc.servers[0].url).toContain("template-secret");
    expect(result.diagnostics.some((d) => d.code === "url-template")).toBe(
      true,
    );
    expect(
      doc.paths["/items"].get.responses.default.content["application/json"]
        .example.email,
    ).toBe("[redacted]");
  });
  it("blocks API export/application when a rule removes required structure", () => {
    const p = projectFor(api());
    p.rules = [rule("/info", "remove")];
    const result = redactData(p);
    expect(result.files[0].canExport).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "invalid-openapi",
    });
    expect(() => serializeRedactedBundle(result)).toThrow(
      new RedactionError("source"),
    );
  });
});
describe("HAR and linked data redaction", () => {
  it("redacts referer values and nested URL query values with bounded recursion", () => {
    const data = har();
    data.log.entries[0].request.headers.push({
      name: "Referer",
      value: "https://u:referer-secret@example.org/from?token=other-secret",
    });
    data.log.entries[0].request.url =
      "https://example.com?redirect=" +
      encodeURIComponent(
        "https://u:nested-secret@example.org/path?token=nested-token",
      );
    const doc = output(projectFor(data));
    expect(JSON.stringify(doc)).not.toContain("referer-secret");
    expect(JSON.stringify(doc)).not.toContain("other-secret");
    const nested = new URL(
      new URL(doc.log.entries[0].request.url).searchParams.get("redirect")!,
    );
    expect(nested.username).toBe("");
    expect(nested.password).toBe("");
    expect(nested.searchParams.get("token")).toBe("[redacted]");
  });
  it("redacts headers, cookies, query values, JSON bodies, URLs, and redirects without changing protocol metadata", () => {
    const p = projectFor(har());
    const cleaned = output(p).log.entries[0];
    expect(cleaned.request.method).toBe("POST");
    expect(cleaned.response.status).toBe(200);
    expect(cleaned.time).toBe(5);
    for (const secret of [
      "har-password",
      "url-token",
      "header-secret",
      "cookie-secret",
      "body-secret",
      "session=private",
      "redirect-secret",
    ])
      expect(JSON.stringify(cleaned)).not.toContain(secret);
    expect(cleaned.request.headers[1].value).toBe("application/json");
    expect(JSON.parse(cleaned.request.postData.text).password).toBe(
      "[redacted]",
    );
    expect(JSON.parse(cleaned.response.content.text).email).toBe(
      "ada@example.org",
    );
  });
  it("pseudonymizes repeated emails and numeric/string IDs consistently across formats and previews", () => {
    const p = addRedactionSources(emptyRedactionProject(), [
      { name: "schema", text: JSON.stringify(api()) },
      { name: "traffic", text: JSON.stringify(har()) },
      {
        name: "fixture",
        text: JSON.stringify({ email: "ada@example.org", userId: 42 }),
      },
    ]);
    p.options.personal = true;
    p.options.action = "pseudonymize";
    const result = redactData(p),
      doc = JSON.parse(result.files[0].text),
      entry = JSON.parse(result.files[1].text).log.entries[0],
      data = JSON.parse(result.files[2].text);
    const example =
      doc.paths["/items"].get.responses.default.content["application/json"]
        .example;
    expect(example.email).toBe(data.email);
    expect(JSON.parse(entry.request.postData.text).email).toBe(data.email);
    expect(new URL(entry.request.url).searchParams.get("email")).toBe(
      data.email,
    );
    expect(example.id).toBe(data.userId);
    expect(entry.request.queryString[2].value).toBe(String(data.userId));
    expect(new URL(entry.request.url).searchParams.get("user_id")).toBe(
      String(data.userId),
    );
    expect(example.email).toMatch(/^person-\d+@example\.invalid$/);
    expect(redactData(p)).toEqual(result);
    expect(result.files.map((f) => f.text).join(" ")).not.toContain(
      "ada@example.org",
    );
  });
  it("uses type-preserving masking for credential containers and distinct stable pseudonyms", () => {
    const p = projectFor({
      credentials: { a: "secret", b: [2, true, null] },
      email: "a@example.org",
      nested: { email: "b@example.org" },
      phone: "123",
      name: "Ada",
      address: "Private Street",
      ip: "1.2.3.4",
    });
    expect(output(p).credentials).toEqual({
      a: "[redacted]",
      b: [0, false, null],
    });
    p.options.personal = true;
    p.options.action = "pseudonymize";
    const doc = output(p);
    expect(doc.email).not.toBe(doc.nested.email);
    expect(doc.phone).toMatch(/^000-000-/);
    expect(doc.ip).toMatch(/^10\./);
    expect(typeof doc.credentials.b[0]).toBe("number");
    expect(typeof doc.credentials.b[1]).toBe("boolean");
  });
  it("retains opaque/base64/large bodies for review, or explicitly omits their text", () => {
    const data = har();
    data.log.entries[0].response.content = {
      mimeType: "application/json",
      text: "eyJ0b2tlbiI6InNlY3JldCJ9",
      encoding: "base64",
    } as never;
    const p = projectFor(data);
    const preview = redactData(p);
    expect(
      JSON.parse(preview.files[0].text).log.entries[0].response.content.text,
    ).toBe("eyJ0b2tlbiI6InNlY3JldCJ9");
    expect(preview.diagnostics.some((d) => d.code === "opaque-body")).toBe(
      true,
    );
    p.options.dropOpaqueBodies = true;
    expect(output(p).log.entries[0].response.content).toEqual({
      mimeType: "application/json",
      encoding: "base64",
    });
  });
  it("preserves unchanged URLs exactly and removes credential-bearing fragments", () => {
    const original = "HTTPS://Example.COM:443/items?a=hello%20world#section";
    const p = projectFor({
      first: original,
      second: "https://u:p@example.com/items#access_token=private",
      third: "https://example.com?q=x&token=private&token=other",
    });
    const doc = output(p);
    expect(doc.first).toBe(original);
    expect(doc.second).toBe("https://example.com/items");
    const url = new URL(doc.third);
    expect(url.searchParams.get("q")).toBe("x");
    expect(url.searchParams.getAll("token")).toEqual([
      "[redacted]",
      "[redacted]",
    ]);
  });
  it("records virtual JSON body pointers and excludes values from audit exports", () => {
    const p = projectFor(har()),
      result = redactData(p),
      report = serializeRedactionReport(p, result);
    expect(
      result.findings.some(
        (f) =>
          f.pointer.endsWith("/postData/text") &&
          f.payloadPointer === "/password",
      ),
    ).toBe(true);
    for (const secret of [
      "header-secret",
      "body-secret",
      "ada@example.org",
      "url-token",
    ])
      expect(report).not.toContain(secret);
    expect(report).not.toContain('"text":');
    expect(report).not.toContain('"replacement":');
  });
});
describe("custom redaction rules", () => {
  it("supports recursive/single wildcards, escaped keys, and first-rule priority", () => {
    const p = projectFor({
      rows: [{ privateNote: "one" }, { privateNote: "two" }],
      "a/b": { "~token": "secret" },
    });
    p.rules = [
      rule("/**/privateNote", "replace", { replacement: "custom" }),
      rule("/rows/*/privateNote", "remove", { key: "rule-2" }),
      rule("/a~1b/~0token", "remove", { key: "rule-3" }),
    ];
    const doc = output(p);
    expect(doc.rows).toEqual([
      { privateNote: "custom" },
      { privateNote: "custom" },
    ]);
    expect(doc["a/b"]).toEqual({});
    p.rules[0].enabled = false;
    expect(output(p).rows).toEqual([{}, {}]);
  });
  it("removes array items using original indices and stops child rules after parent replacement", () => {
    const p = projectFor({
      rows: [0, 1, 2, 3],
      secret: { nested: "original" },
    });
    p.rules = [
      rule("/rows/0", "remove"),
      rule("/rows/2", "remove", { key: "rule-2" }),
      rule("/secret", "replace", {
        key: "rule-3",
        replacement: { nested: "replacement" },
      }),
      rule("/secret/nested", "remove", { key: "rule-4" }),
    ];
    expect(output(p)).toEqual({
      rows: [1, 3],
      secret: { nested: "replacement" },
    });
  });
  it("applies custom rules inside HAR JSON payloads and can omit the whole payload", () => {
    const p = projectFor(har());
    p.rules = [
      rule("/log/entries/*/response/content/text/$json/email", "remove"),
    ];
    expect(
      JSON.parse(output(p).log.entries[0].response.content.text),
    ).not.toHaveProperty("email");
    p.rules[0].selector = "/log/entries/*/response/content/text/$json";
    expect(output(p).log.entries[0].response.content).not.toHaveProperty(
      "text",
    );
  });
  it("treats prototype-looking keys as ordinary values", () => {
    const p = projectFor(
      JSON.parse(
        '{"__proto__":{"token":"private"},"constructor":{"password":"private"}}',
      ),
    );
    const result = output(p);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result.__proto__.token).toBe("[redacted]");
    expect(result.constructor.password).toBe("[redacted]");
    expect(Object.prototype).not.toHaveProperty("token");
  });
  it("allows disabling automatic profiles and rejects removal of the root document", () => {
    const p = projectFor({ password: "retained", name: "retained" });
    p.options.secrets = false;
    expect(output(p)).toEqual({ password: "retained", name: "retained" });
    p.rules = [rule("", "remove")];
    expect(() => redactData(p)).toThrow(new RedactionError("root"));
  });
});
describe("redaction project portability and limits", () => {
  it("round-trips full projects, exports source-free rule sets, and bundles only redacted outputs", () => {
    const p = projectFor({ token: "original-secret" });
    p.rules = [rule("/**/privateNote")];
    expect(parseRedactionProject(serializeRedactionProject(p))).toEqual(p);
    expect(serializeRedactionProject(p)).toContain("original-secret");
    const profile = serializeRedactionRules(p);
    expect(profile).not.toContain("original-secret");
    expect(profile).not.toContain('"sources"');
    expect(parseRedactionRules(profile)).toEqual({
      options: p.options,
      rules: p.rules,
    });
    const bundle = serializeRedactedBundle(redactData(p));
    expect(bundle).not.toContain("original-secret");
    expect(JSON.parse(bundle).files[0].text).toContain("[redacted]");
  });
  it("detects JSON scalars and bounds input bytes, pointers, sources, and rule counts", () => {
    for (const scalar of ["null", "true", "1", '"value"'])
      expect(readRedactionSource(scalar).kind).toBe("json");
    expect(() =>
      readRedactionSource("x".repeat(MAX_REDACTION_SOURCE_BYTES + 1)),
    ).toThrow(new RedactionError("limit"));
    expect(() =>
      parseRedactionProject(" ".repeat(MAX_REDACTION_BYTES + 1)),
    ).toThrow(new RedactionError("limit"));
    const p = projectFor({ password: "secret" });
    expect(() =>
      validateRedactionProject({
        ...p,
        sources: Array.from({ length: 9 }, (_, i) => ({
          ...p.sources[0],
          key: `source-${i}`,
        })),
      }),
    ).toThrow(new RedactionError("limit"));
    expect(() =>
      validateRedactionProject({
        ...p,
        rules: Array.from({ length: 51 }, (_, i) =>
          rule("/x", "mask", { key: `rule-${i}` }),
        ),
      }),
    ).toThrow(new RedactionError("limit"));
    expect(() =>
      redactData(projectFor({ ["x".repeat(4097)]: { token: "value" } })),
    ).toThrow(new RedactionError("limit"));
  });
  it("rejects malformed rules/options/sources without changing previous projects", () => {
    expect(() =>
      readRedactionSource(
        JSON.stringify({
          swagger: "2.0",
          info: { title: "Old API", version: "1" },
          paths: {},
        }),
      ),
    ).toThrow(new RedactionError("source"));
    const p = projectFor({ password: "secret" }),
      before = serializeRedactionProject(p);
    for (const bad of [
      rule("bad"),
      rule("/bad~2"),
      rule("/token", "replace"),
      rule("/token", "mask", { key: "BAD" }),
    ])
      expect(() => validateRedactionProject({ ...p, rules: [bad] })).toThrow(
        new RedactionError("rule"),
      );
    expect(() =>
      validateRedactionProject({
        ...p,
        options: { ...p.options, action: ["mask"] },
      }),
    ).toThrow(new RedactionError("project"));
    expect(() =>
      addRedactionSources(p, [
        { name: "First", text: "{}" },
        { name: "Bad", text: "{" },
      ]),
    ).toThrow(RedactionError);
    expect(serializeRedactionProject(p)).toBe(before);
    expect(() => readRedactionSource('{"log":{}}', "har")).toThrow(
      new RedactionError("source"),
    );
    expect(() =>
      readRedactionSource(
        JSON.stringify({ ...api(), openapi: "3.2.0" }),
        "openapi",
      ),
    ).toThrow(new RedactionError("source"));
  });
  it("bounds finding lists while continuing to redact every target", () => {
    const p = projectFor(
      Array.from({ length: 510 }, (_, i) => ({ password: `secret-${i}` })),
    );
    const result = redactData(p);
    expect(result.changeCount).toBe(510);
    expect(result.findings).toHaveLength(500);
    expect(result.files[0].text).not.toContain("secret-");
  });
});
