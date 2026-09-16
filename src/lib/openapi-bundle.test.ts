import YAML from "yaml";
import { describe, expect, it, vi } from "vitest";
import {
  bundleOpenApiProject,
  mergeBundleFiles,
  normalizeBundlePath,
  parseBundleProject,
  serializeBundleProject,
  serializeOpenApiBundle,
  MAX_BUNDLE_FILE_BYTES,
  type BundleProject,
} from "./openapi-bundle";
import { parseOpenApiSchema } from "./openapi";

const api = (extra = {}) => ({
  openapi: "3.1.0",
  info: { title: "Modular API", version: "1" },
  paths: {},
  ...extra,
});
const file = (path: string, value: unknown) => ({
  path,
  text: JSON.stringify(value),
});
const project = (
  root: unknown,
  others: ReturnType<typeof file>[] = [],
): BundleProject => ({
  root: "api/openapi.yaml",
  files: [file("api/openapi.yaml", root), ...others],
});
function at(root: unknown, ref: unknown): unknown {
  const pointer = decodeURIComponent(String(ref).slice(1));
  return pointer
    .slice(1)
    .split("/")
    .reduce(
      (value: unknown, part) =>
        (value as Record<string, unknown>)[
          part.replace(/~1/g, "/").replace(/~0/g, "~")
        ],
      root,
    );
}

describe("multi-file OpenAPI bundling", () => {
  it("does not export a project that JSON escaping makes too large to import", () => {
    const text = '"'.repeat(MAX_BUNDLE_FILE_BYTES);
    const files = Array.from({ length: 4 }, (_, i) => ({
      path: `${i}.yaml`,
      text,
    }));
    expect(() => serializeBundleProject({ root: "0.yaml", files })).toThrow(
      "limit",
    );
  });
  it("rejects unknown schema dialects and relocated relative resources", () => {
    const result = bundleOpenApiProject(
      project(
        api({
          jsonSchemaDialect: "https://example.com/custom",
          paths: { "/items": { $ref: "path.json" } },
        }),
        [
          file("api/path.json", {
            servers: [{ url: "../api" }],
            get: { responses: { "200": { description: "OK" } } },
          }),
        ],
      ),
    );
    expect(result.document).toBeNull();
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "dialect",
      "relative-resource",
    ]);
  });
  it("bundles nested relative references, deduplicates targets, and preserves root identities and source files", () => {
    const input = project(
      api({
        components: {
          schemas: {
            User: { $ref: "./models/User.yaml", description: "Keep sibling" },
            Alias: { $ref: "#/components/schemas/User" },
          },
        },
      }),
      [
        {
          path: "api/models/User.yaml",
          text: "type: object\nproperties:\n  address:\n    $ref: ../common.yaml#/Address\n  backup:\n    $ref: ../common.yaml#/Address\n",
        },
        file("api/common.yaml", { Address: { type: "string" } }),
        file("api/unused.json", { anything: true }),
      ],
    );
    const original = JSON.stringify(input);
    const result = bundleOpenApiProject(input);
    expect(result.issues).toEqual([]);
    expect(result.embeddedCount).toBe(2);
    const output = result.document!;
    const schemas = (
      output.components as {
        schemas: Record<string, { $ref: string; description?: string }>;
      }
    ).schemas;
    expect(schemas.Alias.$ref).toBe("#/components/schemas/User");
    expect(schemas.User.description).toBe("Keep sibling");
    const user = at(output, schemas.User.$ref) as {
      properties: { address: { $ref: string }; backup: { $ref: string } };
    };
    expect(user.properties.address.$ref).toBe(user.properties.backup.$ref);
    expect(at(output, user.properties.address.$ref)).toEqual({
      type: "string",
    });
    expect(
      result.files.filter((file) => !file.used).map((file) => file.path),
    ).toEqual(["api/unused.json"]);
    expect(JSON.stringify(input)).toBe(original);
    expect(bundleOpenApiProject(input)).toEqual(result);
    expect(JSON.parse(serializeOpenApiBundle(result, "json"))).toEqual(
      YAML.parse(serializeOpenApiBundle(result, "yaml")),
    );
  });

  it("preserves circular and cross-file references without recursive expansion", () => {
    const result = bundleOpenApiProject(
      project(
        api({ components: { schemas: { Node: { $ref: "node.json" } } } }),
        [
          file("api/node.json", {
            type: "object",
            properties: {
              child: { $ref: "node.json" },
              root: { $ref: "openapi.yaml#/components/schemas/Node" },
            },
          }),
        ],
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.embeddedCount).toBe(1);
    const node = at(result.document, "#/x-rsswag-bundled/ref1") as {
      properties: { child: { $ref: string }; root: { $ref: string } };
    };
    expect(node.properties.child.$ref).toBe("#/x-rsswag-bundled/ref1");
    expect(node.properties.root.$ref).toBe("#/components/schemas/Node");
    expect(serializeOpenApiBundle(result, "json").length).toBeLessThan(1200);
  });

  it("leaves literal payload references alone while processing similarly named schema properties and named examples", () => {
    const literal = { $ref: "not-a-file.json", $id: "literal-data" };
    const result = bundleOpenApiProject(
      project(
        api({
          "x-meta": literal,
          paths: {
            "x-data": literal,
            "/users": {
              get: {
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        example: literal,
                        examples: { "x-sample": { $ref: "example.json" } },
                        schema: {
                          type: "object",
                          properties: {
                            example: { $ref: "type.json" },
                            default: { type: "string" },
                            "x-user": { $ref: "type.json" },
                          },
                          example: literal,
                          default: literal,
                          enum: [literal],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        [
          file("api/type.json", { type: "integer" }),
          file("api/example.json", { value: literal }),
        ],
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.references).toHaveLength(3);
    expect(result.document!["x-meta"]).toEqual(literal);
    expect(at(result.document, "#/x-rsswag-bundled/ref1")).toEqual({
      value: literal,
    });
    expect(serializeOpenApiBundle(result, "json")).toContain("not-a-file.json");
  });

  it("supports percent-encoded filenames and JSON Pointer keys with slashes, tildes, and prototype names", () => {
    const schemas = JSON.parse(
      '{"__proto__":{"type":"string"},"a/b~":{"type":"number"}}',
    );
    const result = bundleOpenApiProject(
      project(
        api({
          components: {
            schemas: {
              A: { $ref: "types%20one.json#/__proto__" },
              B: { $ref: "types%20one.json#/a~1b~0" },
            },
          },
        }),
        [file("api/types one.json", schemas)],
      ),
    );
    expect(result.issues).toEqual([]);
    expect(at(result.document, "#/x-rsswag-bundled/ref1")).toEqual({
      type: "string",
    });
    expect(at(result.document, "#/x-rsswag-bundled/ref2")).toEqual({
      type: "number",
    });
    expect({}).not.toHaveProperty("polluted");
  });

  it("bundles referenced path items and alias chains into endpoints usable by the existing editor", () => {
    const result = bundleOpenApiProject(
      project(
        api({
          paths: { "/users": { $ref: "path.json", summary: "Root summary" } },
        }),
        [
          file("api/path.json", { $ref: "actual.json" }),
          file("api/actual.json", {
            get: {
              summary: "List users",
              responses: { "200": { $ref: "response.json" } },
            },
          }),
          file("api/response.json", { $ref: "responses.json#/ok" }),
          file("api/responses.json", {
            ok: {
              description: "Worked",
              content: {
                "application/json": {
                  schema: { type: "array", items: { type: "string" } },
                },
              },
            },
          }),
        ],
      ),
    );
    expect(result.issues).toEqual([]);
    const parsed = parseOpenApiSchema(serializeOpenApiBundle(result, "json"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.endpoints).toHaveLength(1);
    expect(parsed.value.endpoints[0]).toMatchObject({
      path: "/users",
      method: "GET",
      summary: "List users",
      responses: [{ status: "200", description: "Worked" }],
    });
  });

  it("supports Swagger 2 response schemas and array-index pointers", () => {
    const result = bundleOpenApiProject(
      project(
        {
          swagger: "2.0",
          info: { title: "Legacy", version: "1" },
          paths: {
            "/user": {
              get: {
                responses: {
                  "200": {
                    description: "OK",
                    schema: { $ref: "types.json#/0" },
                    examples: { "application/json": { $ref: "literal" } },
                  },
                },
              },
            },
          },
        },
        [
          file("api/types.json", [
            { type: "object", properties: { name: { type: "string" } } },
          ]),
        ],
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.references).toHaveLength(1);
    expect(result.document?.swagger).toBe("2.0");
    expect(parseOpenApiSchema(serializeOpenApiBundle(result, "yaml")).ok).toBe(
      true,
    );
  });

  it("preserves a pre-existing bundle namespace and supports boolean schemas", () => {
    const result = bundleOpenApiProject(
      project(
        api({
          "x-rsswag-bundled": { keep: 1 },
          components: { schemas: { Never: { $ref: "false.json" } } },
        }),
        [file("api/false.json", false)],
      ),
    );
    expect(result.namespace).toBe("x-rsswag-bundled-2");
    expect(result.document?.["x-rsswag-bundled"]).toEqual({ keep: 1 });
    expect(at(result.document, "#/x-rsswag-bundled-2/ref1")).toBe(false);
  });

  it("rewrites operation links and explicit discriminator mappings", () => {
    const result = bundleOpenApiProject(
      project(
        api({
          paths: {
            "/users": {
              get: {
                responses: {
                  "200": {
                    description: "OK",
                    links: { Next: { operationRef: "ops.json#/get" } },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              Pet: {
                oneOf: [{ $ref: "dog.json" }],
                discriminator: {
                  propertyName: "type",
                  mapping: { dog: "dog.json" },
                },
              },
            },
          },
        }),
        [
          file("api/ops.json", {
            get: { responses: { "204": { description: "Empty" } } },
          }),
          file("api/dog.json", { type: "object" }),
        ],
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.references).toHaveLength(3);
    expect(result.embeddedCount).toBe(2);
  });

  it.each([
    ["missing.json", "missing-file"],
    ["types.json#/missing", "missing-pointer"],
    ["types.json#/constructor", "missing-pointer"],
    ["types.json#anchor", "reference"],
    ["types.json#/bad~2key", "reference"],
    ["types.json?query=1", "reference"],
    ["https://example.com/types.json", "remote"],
    ["//example.com/types.json", "remote"],
    ["../../outside.json", "path"],
    ["%2e%2e/%2e%2e/outside.json", "path"],
    ["types%zz.json", "reference"],
    ["/absolute.json", "path"],
  ])("diagnoses unsupported or unresolved reference %s", (reference, code) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      const result = bundleOpenApiProject(
        project(api({ components: { schemas: { A: { $ref: reference } } } }), [
          file("api/types.json", { type: "object" }),
        ]),
      );
      expect(result.document).toBeNull();
      expect(result.issues[0]).toMatchObject({
        code,
        file: "api/openapi.yaml",
        pointer: "/components/schemas/A/$ref",
        reference,
      });
      expect(() => serializeOpenApiBundle(result, "json")).toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it.each(["$id", "$anchor", "$dynamicRef", "$recursiveRef"])(
    "blocks unsupported resource semantics in %s",
    (key) => {
      const result = bundleOpenApiProject(
        project(
          api({ components: { schemas: { A: { $ref: "types.json" } } } }),
          [file("api/types.json", { [key]: "#node", type: "object" })],
        ),
      );
      expect(result.document).toBeNull();
      expect(result.issues.some((issue) => issue.code === "dialect")).toBe(
        true,
      );
    },
  );

  it("detects ancestor resource boundaries and implicit discriminator semantics", () => {
    const result = bundleOpenApiProject(
      project(
        api({
          components: {
            schemas: {
              A: { $ref: "types.json#/$defs/A" },
              B: { discriminator: { propertyName: "kind" } },
            },
          },
        }),
        [
          file("api/types.json", {
            $id: "https://example.com/base",
            $defs: { A: { type: "string" } },
          }),
        ],
      ),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "dialect",
      "discriminator",
    ]);
    expect(result.document).toBeNull();
  });

  it.each([
    "value: [",
    "a: 1\na: 2",
    "a: &loop\n  self: *loop",
    "value: .inf",
    "value: 9007199254740992",
    "value: !custom test",
  ])("rejects invalid or non-JSON-safe YAML %s", (text) => {
    const result = bundleOpenApiProject({
      root: "root.yaml",
      files: [{ path: "root.yaml", text }],
    });
    expect(result.document).toBeNull();
    expect(result.issues.some((issue) => issue.code === "parse")).toBe(true);
  });

  it("round-trips project contents without parsing drafts, strips unknown fields, and rejects duplicate or oversized imports atomically", () => {
    const input = {
      root: "draft.yaml",
      files: [{ path: "draft.yaml", text: "unfinished: [" }],
    };
    expect(
      parseBundleProject("\uFEFF" + serializeBundleProject(input)),
    ).toEqual(input);
    expect(
      parseBundleProject(
        JSON.stringify({
          kind: "rsswag-multi-file-project",
          version: 1,
          ...input,
          secrets: "drop",
          files: [{ ...input.files[0], metadata: "drop" }],
        }),
      ),
    ).toEqual(input);
    expect(() =>
      mergeBundleFiles(input.files, [
        { path: "./draft.yaml", text: "replace" },
      ]),
    ).toThrow("duplicate");
    expect(input.files[0].text).toBe("unfinished: [");
    expect(
      mergeBundleFiles(
        input.files,
        [{ path: "./draft.yaml", text: "replace" }],
        true,
      )[0].text,
    ).toBe("replace");
    expect(() =>
      mergeBundleFiles(
        [],
        [{ path: "big.yaml", text: "я".repeat(MAX_BUNDLE_FILE_BYTES) }],
      ),
    ).toThrow("limit");
    expect(() => parseBundleProject('{"kind":"something-else"}')).toThrow(
      "project",
    );
    expect(() =>
      parseBundleProject(
        JSON.stringify({
          kind: "rsswag-multi-file-project",
          version: 1,
          root: "missing",
          files: [],
        }),
      ),
    ).toThrow("root");
    expect(normalizeBundlePath("api/./models/../root.yaml")).toBe(
      "api/root.yaml",
    );
  });
});
