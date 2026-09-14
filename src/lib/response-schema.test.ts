import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  exportInferredSchema,
  inferResponseSchema,
  parseSchemaSample,
  schemaSampleLimit,
  validComponentName,
  MAX_SCHEMA_SAMPLES,
  MAX_SCHEMA_SAMPLE_BYTES,
  MAX_SCHEMA_SAMPLE_NODES,
} from "./response-schema";

function sample(value: unknown) {
  const parsed = parseSchemaSample(JSON.stringify(value));
  if (!parsed.ok) throw new Error(parsed.issue);
  return parsed.sample;
}

describe("response schema inference", () => {
  it("merges objects, tracks optional fields, and distinguishes missing from null", () => {
    const result = inferResponseSchema([
      sample({ id: 1, name: "Ada", meta: { active: true }, deleted: null }),
      sample({ id: 2, meta: { active: false, rank: 1 }, deleted: "no" }),
    ]);
    expect(result.schema).toEqual({
      type: "object",
      properties: {
        deleted: { type: ["null", "string"] },
        id: { type: "integer" },
        meta: {
          type: "object",
          properties: {
            active: { type: "boolean" },
            rank: { type: "integer" },
          },
          required: ["active"],
        },
        name: { type: "string" },
      },
      required: ["deleted", "id", "meta"],
    });
    expect(result.fields).toContainEqual({
      path: "/properties/name",
      types: ["string"],
      present: 1,
      objects: 2,
      required: false,
    });
    expect(result.fields).toContainEqual({
      path: "/properties/meta/properties/rank",
      types: ["integer"],
      present: 1,
      objects: 2,
      required: false,
    });
  });

  it("merges all array items and leaves empty arrays unconstrained", () => {
    expect(inferResponseSchema([sample([])]).schema).toEqual({
      type: "array",
      items: {},
    });
    expect(
      inferResponseSchema([sample([]), sample([1, 1.5, null, "two"])]).schema,
    ).toEqual({
      type: "array",
      items: { type: ["null", "number", "string"] },
    });
    const result = inferResponseSchema([
      sample([{ id: 1 }, { id: 2, tag: "a" }]),
      sample([{ id: 3 }]),
    ]);
    expect(result.schema).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, tag: { type: "string" } },
        required: ["id"],
      },
    });
    expect(
      result.fields.find((field) => field.path === "/items/properties/tag"),
    ).toMatchObject({ present: 1, objects: 3, required: false });
  });

  it("supports mixed root types and nested arrays without losing object constraints", () => {
    expect(
      inferResponseSchema([
        sample(null),
        sample({ id: 1 }),
        sample([[true], []]),
      ]).schema,
    ).toEqual({
      type: ["array", "null", "object"],
      properties: { id: { type: "integer" } },
      required: ["id"],
      items: { type: "array", items: { type: "boolean" } },
    });
    expect(inferResponseSchema([sample(false)]).schema).toEqual({
      type: "boolean",
    });
    expect(inferResponseSchema([sample(0)]).schema).toEqual({
      type: "integer",
    });
    expect(inferResponseSchema([]).schema).toEqual({});
  });

  it("makes requirement and additional-property choices apply at every object level", () => {
    const result = inferResponseSchema([sample({ values: [{}] })], {
      requireObserved: false,
      allowAdditional: false,
    });
    expect(result.schema).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        values: {
          type: "array",
          items: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      },
    });
    expect(result.fields[0].required).toBe(false);
  });

  it("preserves prototype-shaped property names and escaped schema paths", () => {
    const parsed = parseSchemaSample(
      '{"__proto__":{"constructor":null},"a/b~":{"*":true}}',
    );
    if (!parsed.ok) throw new Error(parsed.issue);
    const result = inferResponseSchema([parsed.sample]);
    expect(Object.hasOwn(result.schema.properties!, "__proto__")).toBe(true);
    expect(result.schema.properties!.__proto__).toEqual({
      type: "object",
      properties: { constructor: { type: "null" } },
      required: ["constructor"],
    });
    expect(result.fields.map((field) => field.path)).toContain(
      "/properties/a~1b~0/properties/*",
    );
    const output = exportInferredSchema(result, "__proto__", "openapi-yaml");
    expect(
      Object.hasOwn(parse(output.content).components.schemas, "__proto__"),
    ).toBe(true);
  });

  it("generates deterministic schemas without including example values or mutating samples", () => {
    const samples = [
      sample({ z: "private-example-value", a: 1 }),
      sample({ a: 2.5, b: true }),
    ];
    const original = JSON.stringify(samples);
    const first = inferResponseSchema(samples);
    expect(inferResponseSchema([...samples].reverse())).toEqual(first);
    expect(JSON.stringify(samples)).toBe(original);
    const json = exportInferredSchema(first, "User", "json");
    expect(JSON.parse(json.content)).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "User",
      ...first.schema,
    });
    expect(json.content).not.toContain("private-example-value");
    expect(json.fileName).toBe("rsswag-User.schema.json");
    const yaml = exportInferredSchema(first, "User", "openapi-yaml");
    expect(parse(yaml.content)).toEqual({
      components: { schemas: { User: first.schema } },
    });
    expect(yaml.fileName).toBe("rsswag-User-openapi-component.yaml");
  });

  it("validates component names and keeps filenames safe", () => {
    for (const name of [
      "",
      "../escape",
      "a/b",
      "0Test",
      "a".repeat(81),
      "My Model",
    ]) {
      expect(validComponentName(name)).toBe(false);
      expect(() =>
        exportInferredSchema(inferResponseSchema([]), name, "json"),
      ).toThrow("invalid-name");
    }
    for (const name of ["ResponseModel", "_Model-v2.1", "CON"])
      expect(validComponentName(name)).toBe(true);
    expect(
      exportInferredSchema(inferResponseSchema([]), "CON", "json").fileName,
    ).toBe("rsswag-CON.schema.json");
  });

  it("rejects unsafe or excessive inputs and accepts a leading byte-order mark", () => {
    expect(parseSchemaSample("\uFEFF{}")).toMatchObject({
      ok: true,
      sample: { value: {}, bytes: 5, nodes: 1 },
    });
    expect(parseSchemaSample("oops")).toEqual({
      ok: false,
      issue: "invalid-json",
    });
    for (const body of ["9007199254740992", "1e400"])
      expect(parseSchemaSample(body)).toEqual({
        ok: false,
        issue: "unsafe-number",
      });
    expect(parseSchemaSample('"' + "a".repeat(1024 * 1024) + '"')).toEqual({
      ok: false,
      issue: "size-limit",
    });
    expect(parseSchemaSample("[".repeat(66) + "0" + "]".repeat(66))).toEqual({
      ok: false,
      issue: "structure-limit",
    });
    expect(
      schemaSampleLimit(Array(MAX_SCHEMA_SAMPLES + 1).fill(sample(null))),
    ).toBe("sample-limit");
    expect(
      schemaSampleLimit([{ ...sample(null), bytes: MAX_SCHEMA_SAMPLE_BYTES }]),
    ).toBeNull();
    expect(
      schemaSampleLimit([
        { ...sample(null), bytes: MAX_SCHEMA_SAMPLE_BYTES + 1 },
      ]),
    ).toBe("size-limit");
    const oversized = [{ ...sample(null), nodes: MAX_SCHEMA_SAMPLE_NODES + 1 }];
    expect(schemaSampleLimit(oversized)).toBe("structure-limit");
    expect(() => inferResponseSchema(oversized)).toThrow("structure-limit");
  });
});
