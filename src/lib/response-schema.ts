import { stringify } from "yaml";
import { indexResponseJson, type JsonValue } from "./response-data-explorer";
import { getByteSize } from "./text-encoding";

export const MAX_SCHEMA_SAMPLES = 10;
export const MAX_SCHEMA_SAMPLE_BYTES = 2 * 1024 * 1024;
export const MAX_SCHEMA_SAMPLE_NODES = 20000;

export type SchemaSample = { value: JsonValue; bytes: number; nodes: number };
export type SchemaSampleIssue =
  | "invalid-json"
  | "size-limit"
  | "structure-limit"
  | "unsafe-number"
  | "sample-limit";
export type InferredSchema = {
  type?: string | string[];
  properties?: Record<string, InferredSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: InferredSchema;
};
export type InferredField = {
  path: string;
  types: string[];
  present: number;
  objects: number;
  required: boolean;
};
export type SchemaInferenceOptions = {
  requireObserved: boolean;
  allowAdditional: boolean;
};
export type SchemaInference = {
  schema: InferredSchema;
  fields: InferredField[];
  sampleCount: number;
};

export function parseSchemaSample(
  body: string,
):
  { ok: true; sample: SchemaSample } | { ok: false; issue: SchemaSampleIssue } {
  const index = indexResponseJson(body);
  if (!index.ok) return index;
  return {
    ok: true,
    sample: {
      value: index.nodes.get("")!.value,
      bytes: getByteSize(body),
      nodes: index.nodes.size,
    },
  };
}

export function schemaSampleLimit(
  samples: SchemaSample[],
): SchemaSampleIssue | null {
  if (samples.length > MAX_SCHEMA_SAMPLES) return "sample-limit";
  if (
    samples.reduce((sum, sample) => sum + sample.bytes, 0) >
    MAX_SCHEMA_SAMPLE_BYTES
  )
    return "size-limit";
  if (
    samples.reduce((sum, sample) => sum + sample.nodes, 0) >
    MAX_SCHEMA_SAMPLE_NODES
  )
    return "structure-limit";
  return null;
}

function valueType(value: JsonValue) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

export function inferResponseSchema(
  samples: SchemaSample[],
  options: SchemaInferenceOptions = {
    requireObserved: true,
    allowAdditional: true,
  },
): SchemaInference {
  const issue = schemaSampleLimit(samples);
  if (issue) throw new Error(issue);
  const fields: InferredField[] = [];

  function infer(values: JsonValue[], path: string): InferredSchema {
    if (!values.length) return {};
    const types = new Set(values.map(valueType));
    if (types.has("number")) types.delete("integer");
    const orderedTypes = [...types].sort();
    const schema: InferredSchema = {
      type: orderedTypes.length === 1 ? orderedTypes[0] : orderedTypes,
    };
    const objects = values.filter(
      (value): value is Record<string, JsonValue> =>
        value !== null && typeof value === "object" && !Array.isArray(value),
    );
    if (objects.length) {
      const properties = new Map<string, JsonValue[]>();
      for (const object of objects) {
        for (const [key, value] of Object.entries(object)) {
          const observations = properties.get(key);
          if (observations) observations.push(value);
          else properties.set(key, [value]);
        }
      }
      const entries: [string, InferredSchema][] = [];
      const required: string[] = [];
      for (const key of [...properties.keys()].sort()) {
        const observations = properties.get(key)!;
        const childPath = `${path}/properties/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
        const field: InferredField = {
          path: childPath,
          types: [],
          present: observations.length,
          objects: objects.length,
          required:
            options.requireObserved && observations.length === objects.length,
        };
        fields.push(field);
        const child = infer(observations, childPath);
        field.types = Array.isArray(child.type)
          ? child.type
          : child.type
            ? [child.type]
            : [];
        entries.push([key, child]);
        if (field.required) required.push(key);
      }
      schema.properties = Object.fromEntries(entries);
      if (required.length) schema.required = required;
      if (!options.allowAdditional) schema.additionalProperties = false;
    }
    if (types.has("array")) {
      const items: JsonValue[] = [];
      for (const value of values) {
        if (Array.isArray(value)) for (const item of value) items.push(item);
      }
      schema.items = infer(items, `${path}/items`);
    }
    return schema;
  }

  return {
    schema: infer(
      samples.map((sample) => sample.value),
      "",
    ),
    fields,
    sampleCount: samples.length,
  };
}

export type SchemaInferenceFormat = "json" | "openapi-yaml";

export function validComponentName(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(name);
}

export function exportInferredSchema(
  inference: SchemaInference,
  name: string,
  format: SchemaInferenceFormat,
) {
  if (!validComponentName(name)) throw new Error("invalid-name");
  if (format === "openapi-yaml") {
    return {
      content: stringify({
        components: { schemas: { [name]: inference.schema } },
      }),
      contentType: "application/yaml",
      fileName: `rsswag-${name}-openapi-component.yaml`,
    };
  }
  return {
    content:
      JSON.stringify(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          title: name,
          ...inference.schema,
        },
        null,
        2,
      ) + "\n",
    contentType: "application/schema+json",
    fileName: `rsswag-${name}.schema.json`,
  };
}
