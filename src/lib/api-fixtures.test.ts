import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import {
  captureFixtureDocument,
  collectFixtureSources,
  exportFixtureData,
  fixtureFields,
  generateFixtures,
  MAX_FIXTURE_BYTES,
  parseFixtureRecipe,
  serializeFixtureRecipe,
  validateFixtureRecipe,
  type FixtureDataset,
  type FixtureRecipe,
  type FixtureRule,
} from "./api-fixtures";

const api = {
  openapi: "3.1.0",
  info: { title: "Fixtures", version: "1" },
  paths: {},
};
const user = {
  type: "object",
  required: ["id", "email"],
  properties: {
    id: { type: "integer", minimum: 1 },
    email: { type: "string", format: "email" },
    active: { type: "boolean" },
  },
};
const doc = (schemas: Record<string, unknown> = { User: user }) =>
  captureFixtureDocument(JSON.stringify({ ...api, components: { schemas } }));
const dataset = (
  id = "users",
  model = "User",
  rules: FixtureRule[] = [],
): FixtureDataset => ({
  id,
  name: id,
  source: `/components/schemas/${model}`,
  count: 10,
  direction: "none",
  rules,
});
const recipe = (datasets = [dataset()]): FixtureRecipe => ({
  seed: "repeatable",
  includeOptional: true,
  datasets,
});
const sequence: FixtureRule = {
  field: "id",
  kind: "sequence",
  start: 100,
  step: 2,
  asString: false,
  prefix: "",
};

describe("fixture source discovery", () => {
  it("captures JSON and YAML without changing the source", () => {
    const root = { ...api, components: { schemas: { "A/B~C": user } } };
    const text = YAML.stringify(root);
    const source = captureFixtureDocument(text);
    expect(source.text).toBe(text);
    expect(source.sources).toEqual([
      {
        pointer: "/components/schemas/A~1B~0C",
        label: "A/B~C",
        direction: "none",
      },
    ]);
    expect(source.root).toEqual(root);
    expect(fixtureFields(source.root, source.sources[0].pointer)).toEqual([
      "id",
      "email",
      "active",
    ]);
  });
  it("finds inline operations, local response containers, and Swagger body definitions", () => {
    const root = {
      ...api,
      components: {
        responses: {
          Shared: {
            content: {
              "application/problem+json": { schema: user },
              "text/plain": { schema: { type: "string" } },
            },
          },
        },
      },
      paths: {
        "/users": {
          post: {
            requestBody: { content: { "application/json": { schema: user } } },
            responses: { "200": { $ref: "#/components/responses/Shared" } },
          },
          get: {
            parameters: [{ in: "body", schema: user }],
            responses: { "200": { schema: user } },
          },
        },
      },
    };
    const { sources } = collectFixtureSources(root);
    expect(sources).toHaveLength(4);
    expect(sources.map((source) => source.direction).sort()).toEqual([
      "request",
      "request",
      "response",
      "response",
    ]);
    const legacy = captureFixtureDocument(
      JSON.stringify({
        swagger: "2.0",
        info: api.info,
        paths: {},
        definitions: { User: user },
      }),
    );
    expect(legacy.sources[0].pointer).toBe("/definitions/User");
  });
  it("caps catalogs and rejects invalid or oversized sources", () => {
    expect(
      collectFixtureSources({
        components: {
          schemas: Object.fromEntries(
            Array.from({ length: 501 }, (_, index) => [`Model${index}`, user]),
          ),
        },
      }),
    ).toMatchObject({ truncated: true, sources: expect.any(Array) });
    expect(() => captureFixtureDocument("openapi: [")).toThrow("source");
    expect(() =>
      captureFixtureDocument(" ".repeat(MAX_FIXTURE_BYTES + 1)),
    ).toThrow("limit");
  });
});

describe("seeded fixture generation", () => {
  it("repeats identical data without sampling examples, defaults, or mutating input", async () => {
    const source = doc({
      User: {
        ...user,
        properties: {
          ...user.properties,
          note: {
            type: "string",
            example: "private-example",
            default: "private-default",
          },
        },
      },
    });
    const before = JSON.stringify(source);
    const plan = recipe();
    const beforePlan = JSON.stringify(plan);
    const first = await generateFixtures(source, plan);
    expect(await generateFixtures(source, plan)).toEqual(first);
    expect(
      await generateFixtures(source, { ...plan, seed: "different" }),
    ).not.toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /private-example|private-default/,
    );
    expect(first.datasets[0]).toMatchObject({ invalidRows: 0, reviewRows: 0 });
    expect(
      new Set(first.datasets[0].rows.map((row) => JSON.stringify(row))).size,
    ).toBe(10);
    expect(JSON.stringify(source)).toBe(before);
    expect(JSON.stringify(plan)).toBe(beforePlan);
  });
  it("keeps datasets stable when unrelated datasets are added or reordered", async () => {
    const source = doc();
    const plan = recipe();
    const expected = (await generateFixtures(source, plan)).datasets[0];
    const result = await generateFixtures(
      source,
      recipe([dataset("other"), dataset()]),
    );
    expect(result.datasets[1]).toEqual(expected);
  });
  it("generates parents first and cycles references through their rows", async () => {
    const source = doc({
      User: user,
      Order: {
        type: "object",
        required: ["id", "userId"],
        properties: { id: { type: "string" }, userId: { type: "integer" } },
      },
    });
    const parent = { ...dataset("users", "User", [sequence]), count: 2 };
    const child = {
      ...dataset("orders", "Order", [
        { ...sequence, asString: true, prefix: "ORD-" },
        {
          field: "userId",
          kind: "reference" as const,
          datasetId: "users",
          sourceField: "id",
        },
      ]),
      count: 5,
    };
    const result = await generateFixtures(source, recipe([child, parent]));
    expect(result.datasets.map((entry) => entry.id)).toEqual([
      "orders",
      "users",
    ]);
    expect(result.datasets[0].rows).toEqual(
      [100, 102, 100, 102, 100].map((userId, index) => ({
        id: `ORD-${100 + index * 2}`,
        userId,
      })),
    );
    expect(result.datasets[0].invalidRows).toBe(0);
  });
  it("supports required fields, optional omission, readOnly/writeOnly, references, and allOf", async () => {
    const source = doc({
      User: {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          {
            type: "object",
            required: ["password"],
            properties: {
              password: { type: "string", writeOnly: true },
              optional: { type: "boolean" },
            },
          },
        ],
      },
      Base: {
        type: "object",
        required: ["id", "email"],
        properties: {
          id: { type: "integer", readOnly: true },
          email: { type: "string", format: "email" },
        },
      },
    });
    expect(fixtureFields(source.root, "/components/schemas/User")).toEqual([
      "id",
      "email",
      "password",
      "optional",
    ]);
    const request = await generateFixtures(source, {
      ...recipe([{ ...dataset(), direction: "request" }]),
      includeOptional: false,
    });
    expect(request.datasets[0].rows[0]).toEqual({
      email: expect.any(String),
      password: expect.any(String),
    });
    const response = await generateFixtures(source, {
      ...recipe([{ ...dataset(), direction: "response" }]),
      includeOptional: false,
    });
    expect(response.datasets[0].rows[0]).toEqual({
      id: expect.any(Number),
      email: expect.any(String),
    });
    expect(
      request.datasets[0].invalidRows + response.datasets[0].invalidRows,
    ).toBe(0);
  });
  it.each(["oneOf", "anyOf"])(
    "generates discriminated %s alternatives",
    async (kind) => {
      const source = doc({
        User: {
          [kind]: [
            {
              type: "object",
              required: ["kind", "x"],
              properties: { kind: { const: "a" }, x: { type: "integer" } },
            },
            {
              type: "object",
              required: ["kind", "y"],
              properties: { kind: { const: "b" }, y: { type: "string" } },
            },
          ],
        },
      });
      const result = await generateFixtures(source, recipe());
      expect(result.datasets[0].invalidRows).toBe(0);
      expect(result.datasets[0].rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "a" }),
          expect.objectContaining({ kind: "b" }),
        ]),
      );
    },
  );
  it.each([
    { type: "integer", minimum: 10, maximum: 20, multipleOf: 3 },
    { type: "integer", minimum: -10, maximum: 10, multipleOf: 1.5 },
    { type: "number", exclusiveMinimum: 1000 },
    { type: "number", exclusiveMaximum: -1000 },
    {
      type: "integer",
      minimum: 2,
      maximum: 2,
      exclusiveMinimum: 1,
      exclusiveMaximum: 3,
    },
    { type: "number", minimum: 1, maximum: 2, multipleOf: 0.25 },
    {
      type: "integer",
      minimum: 1,
      maximum: 3,
      exclusiveMinimum: true,
      exclusiveMaximum: true,
    },
    { type: "string", minLength: 30, maxLength: 30 },
    {
      type: "array",
      minItems: 3,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "integer", minimum: 1, maximum: 100 },
    },
    {
      type: "array",
      minItems: 2,
      maxItems: 2,
      prefixItems: [{ const: "start" }, { const: 5 }],
      items: false,
    },
    { properties: {} },
    { type: ["string", "null"] },
    { type: "null" },
    { enum: ["a", "b", "c"] },
  ])("honors supported constraints: %j", async (schema) => {
    const result = await generateFixtures(doc({ User: schema }), recipe());
    expect(result.issues).toEqual([]);
    expect(result.datasets[0].rows).toHaveLength(10);
  });
  it.each(["uuid", "email", "uri", "date", "date-time", "ipv4", "ipv6"])(
    "generates deterministic %s strings",
    async (format) => {
      const result = await generateFixtures(
        doc({ User: { type: "string", format } }),
        recipe(),
      );
      expect(result.issues).toEqual([]);
      expect(
        result.datasets[0].rows.every((row) => typeof row === "string"),
      ).toBe(true);
    },
  );
  it("retains own prototype-named fields without changing prototypes", async () => {
    const source = doc({
      User: JSON.parse(
        '{"type":"object","properties":{"__proto__":{"type":"string"},"constructor":{"type":"string"}}}',
      ),
    });
    const result = await generateFixtures(
      source,
      recipe([
        dataset("__proto__", "User", [
          { field: "__proto__", kind: "constant", value: "safe" },
        ]),
      ]),
    );
    expect(Object.hasOwn(Object(result.datasets[0].rows[0]), "__proto__")).toBe(
      true,
    );
    expect(Object.getPrototypeOf(result.datasets[0].rows[0])).toBe(
      Object.prototype,
    );
    expect(JSON.parse(exportFixtureData(result, null, "json"))).toHaveProperty(
      "__proto__",
    );
    expect(Object.prototype).not.toHaveProperty("safe");
  });
  it("validates overrides and reports impossible schemas without claiming valid data", async () => {
    const result = await generateFixtures(
      doc({
        User: {
          type: "object",
          properties: {
            id: { type: "integer", minimum: 1000 },
            impossible: false,
            values: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              uniqueItems: true,
              items: { const: 1 },
            },
          },
        },
      }),
      recipe([
        dataset("users", "User", [
          { field: "id", kind: "constant", value: "wrong" },
        ]),
      ]),
    );
    expect(result.datasets[0]).toMatchObject({
      invalidRows: 10,
      reviewRows: 10,
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/id",
          keyword: "type",
          severity: "error",
        }),
        expect.objectContaining({ keyword: "uniqueItems" }),
      ]),
    );
  });
  it("reports unsupported, pattern, external, and recursive schemas with bounded diagnostics", async () => {
    const source = doc({
      User: {
        type: "object",
        properties: {
          pattern: { type: "string", pattern: "^only-this$" },
          unknown: { type: "string", contentEncoding: "base64" },
          external: { $ref: "https://example.com/schema" },
          recursive: { $ref: "#/components/schemas/User" },
        },
      },
    });
    const result = await generateFixtures(
      source,
      recipe([{ ...dataset(), count: 100 }]),
    );
    expect(result.issues.length).toBe(200);
    expect(result.truncated).toBe(true);
    expect(result.issueCount).toBeGreaterThan(200);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "recursive" }),
        expect.objectContaining({ code: "reference" }),
        expect.objectContaining({ code: "pattern" }),
        expect.objectContaining({ code: "unsupported" }),
      ]),
    );
    expect(result.datasets[0].reviewRows).toBe(100);
  });
  it("rejects missing fields, sources, parents, and cyclic dataset references", async () => {
    const source = doc();
    await expect(
      generateFixtures(source, recipe([dataset("users", "Missing")])),
    ).rejects.toMatchObject({ code: "missing-source" });
    await expect(
      generateFixtures(
        source,
        recipe([dataset("users", "User", [{ ...sequence, field: "missing" }])]),
      ),
    ).rejects.toMatchObject({ code: "field" });
    const ref: FixtureRule = {
      field: "id",
      kind: "reference",
      datasetId: "missing",
      sourceField: "id",
    };
    await expect(
      generateFixtures(source, recipe([dataset("users", "User", [ref])])),
    ).rejects.toMatchObject({ code: "reference" });
    await expect(
      generateFixtures(
        source,
        recipe([dataset("users", "User", [{ ...ref, datasetId: "users" }])]),
      ),
    ).rejects.toMatchObject({ code: "cycle" });
    await expect(
      generateFixtures(
        source,
        recipe([
          dataset("users", "User", [{ ...ref, datasetId: "other" }]),
          dataset("other", "User", [{ ...ref, datasetId: "users" }]),
        ]),
      ),
    ).rejects.toMatchObject({ code: "cycle" });
  });
  it.each([null, { nested: true }, [1, 2]])(
    "rejects nonscalar parent values: %j",
    async (value) => {
      await expect(
        generateFixtures(
          doc(),
          recipe([
            dataset("users", "User", [
              { field: "id", kind: "constant", value },
            ]),
            dataset("other", "User", [
              {
                field: "id",
                kind: "reference",
                datasetId: "users",
                sourceField: "id",
              },
            ]),
          ]),
        ),
      ).rejects.toMatchObject({ code: "reference" });
    },
  );
  it("cancels before and during generation without returning partial results", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      generateFixtures(doc(), recipe(), { signal: abort.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
    const during = new AbortController();
    const progress = vi.fn((done: number) => {
      if (done === 10) during.abort();
    });
    await expect(
      generateFixtures(doc(), recipe([{ ...dataset(), count: 500 }]), {
        signal: during.signal,
        onProgress: progress,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(progress).toHaveBeenCalledTimes(10);
  });
  it.each([
    { type: "array", minItems: 51 },
    { type: "string", minLength: 4097 },
    {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [`p${i}`, { type: "boolean" }]),
      ),
    },
  ])("bounds generation work: %j", async (schema) => {
    await expect(
      generateFixtures(doc({ User: schema }), recipe()),
    ).rejects.toMatchObject({ code: "limit" });
  });
});

describe("fixture recipes and exports", () => {
  it("bounds repeated reference expansion without breaking field discovery", async () => {
    const schemas: Record<string, unknown> = { Base: user };
    let previous = "Base";
    for (let index = 0; index < 8; index++) {
      const name = index === 7 ? "User" : `Level${index}`;
      schemas[name] = {
        allOf: Array.from({ length: 8 }, () => ({
          $ref: `#/components/schemas/${previous}`,
        })),
      };
      previous = name;
    }
    const source = doc(schemas);
    expect(() =>
      fixtureFields(source.root, "/components/schemas/User"),
    ).not.toThrow();
    await expect(generateFixtures(source, recipe())).rejects.toMatchObject({
      code: "limit",
    });
  });
  it("enforces generated byte limits and supports scalar CSV datasets", async () => {
    const source = doc({
      User: {
        type: "array",
        minItems: 50,
        maxItems: 50,
        items: { type: "string", minLength: 4096 },
      },
    });
    await expect(
      generateFixtures(source, recipe([{ ...dataset(), count: 50 }])),
    ).rejects.toMatchObject({ code: "limit" });
    const result = await generateFixtures(
      doc({ User: { const: "scalar" } }),
      recipe(),
    );
    expect(exportFixtureData(result, "users", "csv")).toContain('"Value"');
    expect(exportFixtureData(result, "users", "csv")).toContain('"scalar"');
  });
  it("round trips versioned recipes and excludes source, results, and unknown fields", () => {
    const original = {
      ...recipe(),
      sourceDocument: "secret",
      results: ["private"],
    };
    const serialized = serializeFixtureRecipe(original);
    expect(parseFixtureRecipe("\uFEFF" + serialized)).toEqual(recipe());
    expect(serialized).not.toMatch(/secret|private|sourceDocument|results/);
    const imported = JSON.parse(serialized);
    imported.recipe.datasets[0].extra = "secret";
    expect(parseFixtureRecipe(JSON.stringify(imported))).toEqual(recipe());
  });
  it.each([
    { seed: "" },
    { seed: "a".repeat(129) },
    { includeOptional: "yes" },
    { datasets: [dataset(), dataset()] },
    { datasets: [{ ...dataset(), name: "../escape" }] },
    { datasets: [{ ...dataset(), count: 501 }] },
    { datasets: [{ ...dataset(), count: -1 }] },
    { datasets: [{ ...dataset(), count: 1.5 }] },
    { datasets: [dataset("users", "User", [sequence, sequence])] },
    {
      datasets: Array.from({ length: 5 }, (_, index) => ({
        ...dataset(`d${index}`),
        count: 500,
      })),
    },
  ])("rejects invalid recipes: %j", (patch) => {
    expect(validateFixtureRecipe({ ...recipe(), ...patch })).toBe(false);
  });
  it("rejects malformed, wrong-version, excessive, and unsafe-number imports", () => {
    expect(() => parseFixtureRecipe("{}")).toThrow("recipe");
    expect(() =>
      parseFixtureRecipe(
        serializeFixtureRecipe(recipe()).replace(
          '"version": 1',
          '"version": 2',
        ),
      ),
    ).toThrow("recipe");
    expect(() => parseFixtureRecipe(" ".repeat(MAX_FIXTURE_BYTES + 1))).toThrow(
      "limit",
    );
    expect(
      validateFixtureRecipe(
        recipe([
          dataset("users", "User", [
            {
              field: "id",
              kind: "constant",
              value: Number.MAX_SAFE_INTEGER + 1,
            },
          ]),
        ]),
      ),
    ).toBe(false);
  });
  it("exports all JSON, one array, NDJSON, and spreadsheet-safe CSV", async () => {
    const result = await generateFixtures(
      doc(),
      recipe([
        {
          ...dataset("users", "User", [
            sequence,
            { field: "email", kind: "constant", value: '=HYPERLINK("x")' },
          ]),
          count: 2,
        },
      ]),
    );
    expect(JSON.parse(exportFixtureData(result, null, "json"))).toEqual({
      users: result.datasets[0].rows,
    });
    expect(JSON.parse(exportFixtureData(result, "users", "json"))).toEqual(
      result.datasets[0].rows,
    );
    expect(
      exportFixtureData(result, "users", "ndjson")
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row)),
    ).toEqual(result.datasets[0].rows);
    const csv = exportFixtureData(result, "users", "csv");
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"id","email","active"');
    expect(() => exportFixtureData(result, null, "csv")).toThrow("csv");
    expect(() => exportFixtureData(result, "missing", "json")).toThrow(
      "missing-source",
    );
  });
});
