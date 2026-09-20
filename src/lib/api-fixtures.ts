import {
  readTransformSource,
  TransformError,
  type JsonValue,
} from "./api-transform";
import {
  parseJsonPointer,
  toJsonPointer,
  validateExampleValue,
} from "./example-validation";
import {
  createExplorerTable,
  exportExplorerCsv,
} from "./response-data-explorer";
import { getByteSize } from "./text-encoding";
import { isJsonMediaType } from "./request-body";

export const MAX_FIXTURE_BYTES = 2 * 1024 * 1024;
export const MAX_FIXTURE_DATASETS = 10;
export const MAX_FIXTURE_ROWS = 2000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
export type FixtureRule =
  | { field: string; kind: "constant"; value: JsonValue }
  | {
      field: string;
      kind: "sequence";
      start: number;
      step: number;
      asString: boolean;
      prefix: string;
    }
  | {
      field: string;
      kind: "reference";
      datasetId: string;
      sourceField: string;
    };
export type FixtureDataset = {
  id: string;
  name: string;
  source: string;
  count: number;
  direction: "none" | "request" | "response";
  rules: FixtureRule[];
};
export type FixtureRecipe = {
  seed: string;
  includeOptional: boolean;
  datasets: FixtureDataset[];
};
export type FixtureSource = {
  pointer: string;
  label: string;
  direction: FixtureDataset["direction"];
};
export type FixtureDocument = {
  text: string;
  title: string;
  root: Record<string, unknown>;
  sources: FixtureSource[];
  truncated: boolean;
};
export type FixtureIssue = {
  datasetId: string;
  row: number;
  path: string;
  code:
    | "unsupported"
    | "reference"
    | "recursive"
    | "depth"
    | "pattern"
    | "constraint"
    | "validation"
    | "validation-limit";
  keyword?: string;
  severity: "error" | "warning";
};
export type FixtureOutput = {
  id: string;
  name: string;
  source: string;
  rows: JsonValue[];
  invalidRows: number;
  reviewRows: number;
};
export type FixtureResult = {
  seed: string;
  datasets: FixtureOutput[];
  issues: FixtureIssue[];
  issueCount: number;
  truncated: boolean;
};
export type FixtureErrorCode =
  | "recipe"
  | "source"
  | "limit"
  | "missing-source"
  | "cycle"
  | "reference"
  | "field"
  | "cancelled"
  | "csv";
export class FixtureError extends Error {
  constructor(
    public code: FixtureErrorCode,
    public datasetId = "",
  ) {
    super(code);
  }
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
const field = (value: unknown): value is string =>
  text(value, 256) && value.length > 0;
const safeName = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(value);
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e9;
const child = (pointer: string, key: string) => pointer + toJsonPointer([key]);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function readPointer(root: unknown, pointer: string): unknown {
  const parts = parseJsonPointer(pointer);
  if (!parts || pointer.length > 4096 || parts.length > 64) return undefined;
  let value = root;
  for (const key of parts) {
    if (!object(value) && !Array.isArray(value)) return undefined;
    if (!Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function localPointer(reference: string) {
  if (!reference.startsWith("#")) return null;
  try {
    const pointer = decodeURIComponent(reference.slice(1));
    return parseJsonPointer(pointer) ? pointer : null;
  } catch {
    return null;
  }
}
function container(
  root: Record<string, unknown>,
  value: unknown,
  pointer: string,
) {
  const seen = new Set<string>();
  while (object(value) && typeof value.$ref === "string") {
    const target = localPointer(value.$ref);
    if (target === null || seen.has(target) || seen.size >= 16) return null;
    seen.add(target);
    pointer = target;
    value = readPointer(root, target);
  }
  return object(value) ? { value, pointer } : null;
}
export function collectFixtureSources(root: Record<string, unknown>) {
  const sources: FixtureSource[] = [];
  const seen = new Set<string>();
  let truncated = false;
  let visits = 0;
  const add = (
    pointer: string,
    label: string,
    direction: FixtureDataset["direction"],
  ) => {
    const value = readPointer(root, pointer);
    if ((!object(value) && typeof value !== "boolean") || seen.has(pointer))
      return;
    if (sources.length >= 500) {
      truncated = true;
      return;
    }
    seen.add(pointer);
    sources.push({ pointer, label: label.slice(0, 512), direction });
  };
  for (const prefix of ["/components/schemas", "/definitions"]) {
    const schemas = readPointer(root, prefix);
    if (object(schemas))
      for (const name of Object.keys(schemas))
        add(child(prefix, name), name, "none");
  }
  function content(
    value: unknown,
    pointer: string,
    label: string,
    direction: "request" | "response",
  ) {
    if (++visits > 10000) {
      truncated = true;
      return;
    }
    const resolved = container(root, value, pointer);
    if (!resolved) return;
    if (object(resolved.value.content))
      for (const media of Object.keys(resolved.value.content)) {
        if (isJsonMediaType(media))
          add(
            child(child(resolved.pointer, "content"), media) + "/schema",
            `${label} · ${media}`,
            direction,
          );
      }
    if (Object.hasOwn(resolved.value, "schema"))
      add(resolved.pointer + "/schema", label, direction);
  }
  for (const [kind, direction] of [
    ["requestBodies", "request"],
    ["responses", "response"],
  ] as const) {
    const entries = readPointer(root, `/components/${kind}`);
    if (object(entries))
      for (const [name, value] of Object.entries(entries))
        content(
          value,
          child(`/components/${kind}`, name),
          `${kind} · ${name}`,
          direction,
        );
  }
  if (object(root.paths))
    for (const [path, item] of Object.entries(root.paths)) {
      if (++visits > 10000) {
        truncated = true;
        break;
      }
      const pathItem = container(root, item, child("/paths", path));
      if (!pathItem) continue;
      for (const method of [
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "head",
        "options",
        "trace",
      ]) {
        const operation = pathItem.value[method];
        if (!object(operation)) continue;
        const pointer = child(pathItem.pointer, method);
        const label = `${method.toUpperCase()} ${path}`;
        content(
          operation.requestBody,
          pointer + "/requestBody",
          `${label} · request`,
          "request",
        );
        if (Array.isArray(operation.parameters))
          operation.parameters.forEach((parameter, index) => {
            const resolved = container(
              root,
              parameter,
              `${pointer}/parameters/${index}`,
            );
            if (resolved?.value.in === "body")
              add(
                resolved.pointer + "/schema",
                `${label} · request`,
                "request",
              );
          });
        if (object(operation.responses))
          for (const [status, response] of Object.entries(operation.responses))
            content(
              response,
              child(pointer + "/responses", status),
              `${label} · ${status}`,
              "response",
            );
      }
    }
  return { sources, truncated };
}
export function captureFixtureDocument(input: string): FixtureDocument {
  try {
    const source = readTransformSource(input);
    const root = source.document as Record<string, unknown>;
    return {
      text: input,
      root,
      title: source.title,
      ...collectFixtureSources(root),
    };
  } catch (error) {
    throw new FixtureError(
      error instanceof TransformError && error.code === "limit"
        ? "limit"
        : "source",
    );
  }
}

function validValue(
  value: unknown,
  depth = 0,
  budget = { nodes: 0 },
): value is JsonValue {
  if (++budget.nodes > 10000 || depth > 16) return false;
  if (value === null || typeof value === "boolean" || text(value, 4096))
    return true;
  if (typeof value === "number")
    return (
      Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value))
    );
  if (Array.isArray(value))
    return (
      value.length <= 500 &&
      value.every((entry) => validValue(entry, depth + 1, budget))
    );
  return (
    object(value) &&
    Object.keys(value).length <= 100 &&
    Object.entries(value).every(
      ([key, entry]) =>
        key.length <= 256 && validValue(entry, depth + 1, budget),
    )
  );
}
export function validateFixtureRecipe(value: unknown): value is FixtureRecipe {
  if (
    !object(value) ||
    !text(value.seed, 128) ||
    !value.seed ||
    typeof value.includeOptional !== "boolean" ||
    !Array.isArray(value.datasets) ||
    value.datasets.length > MAX_FIXTURE_DATASETS
  )
    return false;
  const ids = new Set<string>(),
    names = new Set<string>();
  let total = 0;
  return value.datasets.every((entry: unknown) => {
    if (
      !object(entry) ||
      !safeName(entry.id) ||
      ids.has(entry.id) ||
      !safeName(entry.name) ||
      names.has(entry.name) ||
      !text(entry.source, 4096) ||
      !entry.source.startsWith("/") ||
      !parseJsonPointer(entry.source) ||
      !Number.isInteger(entry.count) ||
      Number(entry.count) < 1 ||
      Number(entry.count) > 500 ||
      !["none", "request", "response"].includes(String(entry.direction)) ||
      !Array.isArray(entry.rules) ||
      entry.rules.length > 64
    )
      return false;
    total += Number(entry.count);
    if (total > MAX_FIXTURE_ROWS) return false;
    ids.add(entry.id);
    names.add(entry.name);
    const fields = new Set<string>();
    return entry.rules.every((rule: unknown) => {
      if (!object(rule) || !field(rule.field) || fields.has(rule.field))
        return false;
      fields.add(rule.field);
      if (rule.kind === "constant")
        return Object.hasOwn(rule, "value") && validValue(rule.value);
      if (rule.kind === "sequence")
        return (
          number(rule.start) &&
          number(rule.step) &&
          typeof rule.asString === "boolean" &&
          text(rule.prefix, 80)
        );
      return (
        rule.kind === "reference" &&
        safeName(rule.datasetId) &&
        field(rule.sourceField)
      );
    });
  });
}
function recipeOnly(recipe: FixtureRecipe): FixtureRecipe {
  return {
    seed: recipe.seed,
    includeOptional: recipe.includeOptional,
    datasets: recipe.datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      source: dataset.source,
      count: dataset.count,
      direction: dataset.direction,
      rules: dataset.rules.map((rule): FixtureRule =>
        rule.kind === "constant"
          ? { field: rule.field, kind: rule.kind, value: clone(rule.value) }
          : rule.kind === "sequence"
            ? {
                field: rule.field,
                kind: rule.kind,
                start: rule.start,
                step: rule.step,
                asString: rule.asString,
                prefix: rule.prefix,
              }
            : {
                field: rule.field,
                kind: rule.kind,
                datasetId: rule.datasetId,
                sourceField: rule.sourceField,
              },
      ),
    })),
  };
}
export function serializeFixtureRecipe(recipe: FixtureRecipe) {
  if (!validateFixtureRecipe(recipe)) throw new FixtureError("recipe");
  const text =
    JSON.stringify(
      { kind: "rsswag-api-fixtures", version: 1, recipe: recipeOnly(recipe) },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_FIXTURE_BYTES) throw new FixtureError("limit");
  return text;
}
export function parseFixtureRecipe(text: string): FixtureRecipe {
  if (getByteSize(text) > MAX_FIXTURE_BYTES) throw new FixtureError("limit");
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new FixtureError("recipe");
  }
  if (
    !object(value) ||
    value.kind !== "rsswag-api-fixtures" ||
    value.version !== 1 ||
    !validateFixtureRecipe(value.recipe)
  )
    throw new FixtureError("recipe");
  return recipeOnly(value.recipe);
}
function randomFor(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++)
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function mergedSchema(
  root: Record<string, unknown>,
  input: unknown,
  seen = new Set<unknown>(),
  depth = 0,
  budget = { nodes: 0, limit: 20000 },
): Record<string, unknown> {
  if (++budget.nodes > budget.limit) throw new FixtureError("limit");
  if (!object(input) || seen.has(input) || depth > 16) return {};
  const next = new Set(seen).add(input);
  let result: Record<string, unknown> = {};
  const merge = (part: Record<string, unknown>) => {
    const properties =
      object(result.properties) || object(part.properties)
        ? {
            properties: {
              ...(object(result.properties) ? result.properties : {}),
              ...(object(part.properties) ? part.properties : {}),
            },
          }
        : {};
    result = {
      ...result,
      ...part,
      ...properties,
      required: [
        ...new Set([
          ...(Array.isArray(result.required) ? result.required : []),
          ...(Array.isArray(part.required) ? part.required : []),
        ]),
      ],
    };
  };
  if (typeof input.$ref === "string") {
    const pointer = localPointer(input.$ref);
    if (pointer !== null)
      merge(
        mergedSchema(root, readPointer(root, pointer), next, depth + 1, budget),
      );
  }
  if (Array.isArray(input.allOf))
    input.allOf.forEach((part) =>
      merge(mergedSchema(root, part, next, depth + 1, budget)),
    );
  merge(input);
  return result;
}
export function fixtureFields(
  root: Record<string, unknown>,
  pointer: string,
): string[] {
  const fields = new Set<string>();
  const seen = new Set<unknown>();
  const budget = { nodes: 0, limit: 20000 };
  function visit(input: unknown, depth: number) {
    if (!object(input) || seen.has(input) || depth > 16) return;
    seen.add(input);
    const schema = mergedSchema(root, input, new Set(), 0, budget);
    if (object(schema.properties))
      Object.keys(schema.properties).forEach((name) => fields.add(name));
    for (const key of ["oneOf", "anyOf"])
      if (Array.isArray(schema[key]))
        schema[key].forEach((part) => visit(part, depth + 1));
  }
  // Field discovery runs while rendering the editor. Complex schemas should
  // leave the UI usable; generation reports a processing-limit error itself.
  try {
    visit(readPointer(root, pointer), 0);
  } catch (error) {
    if (!(error instanceof FixtureError) || error.code !== "limit") throw error;
  }
  return [...fields].slice(0, 200);
}
function orderedDatasets(recipe: FixtureRecipe) {
  const byId = new Map(recipe.datasets.map((entry) => [entry.id, entry]));
  const result: FixtureDataset[] = [];
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(entry: FixtureDataset) {
    if (done.has(entry.id)) return;
    if (visiting.has(entry.id)) throw new FixtureError("cycle", entry.id);
    visiting.add(entry.id);
    for (const rule of entry.rules)
      if (rule.kind === "reference") {
        const parent = byId.get(rule.datasetId);
        if (!parent) throw new FixtureError("reference", entry.id);
        visit(parent);
      }
    visiting.delete(entry.id);
    done.add(entry.id);
    result.push(entry);
  }
  recipe.datasets.forEach(visit);
  return result;
}

const unsupported = [
  "not",
  "if",
  "then",
  "else",
  "contains",
  "patternProperties",
  "unevaluatedProperties",
  "dependentRequired",
  "dependentSchemas",
  "$dynamicRef",
  "$recursiveRef",
  "$id",
  "$anchor",
  "$dynamicAnchor",
  "propertyNames",
  "minContains",
  "maxContains",
  "unevaluatedItems",
  "contentEncoding",
  "contentMediaType",
];
export async function generateFixtures(
  document: FixtureDocument,
  input: FixtureRecipe,
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<FixtureResult> {
  const recipe = parseFixtureRecipe(serializeFixtureRecipe(input));
  if (!recipe.datasets.length) throw new FixtureError("recipe");
  const ordered = orderedDatasets(recipe);
  const known = new Set(document.sources.map((source) => source.pointer));
  for (const dataset of ordered) {
    if (!known.has(dataset.source))
      throw new FixtureError("missing-source", dataset.id);
    const fields = fixtureFields(document.root, dataset.source);
    if (dataset.rules.some((rule) => !fields.includes(rule.field)))
      throw new FixtureError("field", dataset.id);
  }
  const result: FixtureResult = {
    seed: recipe.seed,
    datasets: [],
    issues: [],
    issueCount: 0,
    truncated: false,
  };
  const outputs = new Map<string, FixtureOutput>();
  const mergeBudget = { nodes: 0, limit: 500000 };
  const total = recipe.datasets.reduce((sum, entry) => sum + entry.count, 0);
  let completed = 0,
    nodes = 0,
    bytes = 0,
    validationSteps = 0;
  const abort = () => {
    if (options.signal?.aborted) throw new FixtureError("cancelled");
  };
  for (const dataset of ordered) {
    abort();
    const output: FixtureOutput = {
      id: dataset.id,
      name: dataset.name,
      source: dataset.source,
      rows: [],
      invalidRows: 0,
      reviewRows: 0,
    };
    const schema = readPointer(document.root, dataset.source);
    const random = randomFor(`${recipe.seed}\u0000${dataset.id}`);
    const pools = new Map<string, JsonValue[]>();
    for (const rule of dataset.rules)
      if (rule.kind === "reference") {
        const parent = outputs.get(rule.datasetId)!;
        const values = parent.rows.map((row) =>
          object(row) && Object.hasOwn(row, rule.sourceField)
            ? row[rule.sourceField]
            : undefined,
        );
        if (
          values.some(
            (value) =>
              value === null ||
              !["string", "number", "boolean"].includes(typeof value),
          )
        )
          throw new FixtureError("reference", dataset.id);
        pools.set(rule.field, values as JsonValue[]);
      }
    for (let row = 0; row < dataset.count; row++) {
      abort();
      let invalid = false,
        review = false;
      const warned = new Set<string>();
      const issue = (
        code: FixtureIssue["code"],
        path: string,
        keyword?: string,
        severity: "warning" | "error" = "warning",
      ) => {
        const key = `${code}:${path}:${keyword ?? ""}`;
        if (warned.has(key)) return;
        warned.add(key);
        if (severity === "error") invalid = true;
        else review = true;
        result.issueCount++;
        if (result.issues.length < 200)
          result.issues.push({
            datasetId: dataset.id,
            row,
            path: path.slice(0, 2048),
            code,
            keyword,
            severity,
          });
        else result.truncated = true;
      };
      function generate(
        input: unknown,
        path: string,
        depth = 0,
        references = new Set<string>(),
      ): JsonValue {
        if (++nodes > 200000) throw new FixtureError("limit", dataset.id);
        if (depth > 12) {
          issue("depth", path);
          return null;
        }
        if (input === false) {
          issue("constraint", path);
          return null;
        }
        if (!object(input)) return null;
        let nextReferences = references;
        if (typeof input.$ref === "string") {
          const pointer = localPointer(input.$ref);
          if (
            pointer === null ||
            readPointer(document.root, pointer) === undefined
          ) {
            issue("reference", path);
            return null;
          }
          if (references.has(pointer)) {
            issue("recursive", path);
            return null;
          }
          nextReferences = new Set(references).add(pointer);
          // Resolve the referenced shape without sampling examples or defaults.
          const target = readPointer(document.root, pointer);
          const siblings = Object.fromEntries(
            Object.entries(input).filter(([key]) => key !== "$ref"),
          );
          return generate(
            object(target) ? { ...target, ...siblings } : target,
            path,
            depth + 1,
            nextReferences,
          );
        }
        const shape = mergedSchema(
          document.root,
          input,
          new Set(),
          0,
          mergeBudget,
        );
        for (const keyword of unsupported)
          if (Object.hasOwn(shape, keyword))
            issue("unsupported", path, keyword);
        if (typeof shape.pattern === "string") issue("pattern", path);
        if (Object.hasOwn(shape, "const") && validValue(shape.const))
          return clone(shape.const);
        if (Array.isArray(shape.enum) && shape.enum.length) {
          const value = shape.enum[Math.floor(random() * shape.enum.length)];
          if (!validValue(value)) throw new FixtureError("limit", dataset.id);
          return clone(value);
        }
        for (const kind of ["oneOf", "anyOf"] as const)
          if (Array.isArray(shape[kind]) && shape[kind].length) {
            const branch =
              shape[kind][Math.floor(random() * shape[kind].length)];
            const base = Object.fromEntries(
              Object.entries(shape).filter(
                ([key]) =>
                  key !== "oneOf" && key !== "anyOf" && key !== "allOf",
              ),
            );
            return generate(
              { allOf: [base, branch] },
              path,
              depth + 1,
              nextReferences,
            );
          }
        const types = Array.isArray(shape.type) ? shape.type : [shape.type];
        const type =
          types.find((type) => typeof type === "string" && type !== "null") ??
          (types.includes("null")
            ? "null"
            : object(shape.properties)
              ? "object"
              : shape.items !== undefined || shape.prefixItems !== undefined
                ? "array"
                : "null");
        if (type === "null") return null;
        if (type === "boolean") return random() >= 0.5;
        if (type === "object") {
          const properties = object(shape.properties) ? shape.properties : {};
          const required = Array.isArray(shape.required)
            ? shape.required.filter(
                (name): name is string => typeof name === "string",
              )
            : [];
          const names = [...new Set([...required, ...Object.keys(properties)])];
          if (
            names.length > 100 ||
            (typeof shape.minProperties === "number" &&
              shape.minProperties > 100)
          )
            throw new FixtureError("limit", dataset.id);
          const values: [string, JsonValue][] = [];
          for (const name of names) {
            const raw = Object.hasOwn(properties, name)
              ? properties[name]
              : shape.additionalProperties;
            const property = mergedSchema(
              document.root,
              raw,
              new Set(),
              0,
              mergeBudget,
            );
            if (
              (dataset.direction === "request" && property.readOnly === true) ||
              (dataset.direction === "response" && property.writeOnly === true)
            )
              continue;
            if (
              !required.includes(name) &&
              ((!recipe.includeOptional &&
                values.length >= Number(shape.minProperties ?? 0)) ||
                (typeof shape.maxProperties === "number" &&
                  values.length >= shape.maxProperties))
            )
              continue;
            values.push([
              name,
              generate(raw, child(path, name), depth + 1, nextReferences),
            ]);
          }
          return Object.fromEntries(values);
        }
        if (type === "array") {
          const prefix = Array.isArray(shape.prefixItems)
            ? shape.prefixItems
            : Array.isArray(shape.items)
              ? shape.items
              : [];
          const min =
            typeof shape.minItems === "number"
              ? Math.max(0, Math.ceil(shape.minItems))
              : 1;
          const max =
            typeof shape.maxItems === "number"
              ? Math.max(0, Math.floor(shape.maxItems))
              : Math.max(min, 3);
          if (min > 50) throw new FixtureError("limit", dataset.id);
          let count = Math.min(
            50,
            max,
            min +
              Math.floor(random() * Math.max(1, Math.min(max - min + 1, 3))),
          );
          if (shape.items === false) count = Math.min(count, prefix.length);
          const values: JsonValue[] = [];
          const unique = new Set<string>();
          for (let index = 0; index < count; index++) {
            let value: JsonValue = null;
            for (let attempt = 0; attempt < 32; attempt++) {
              value = generate(
                prefix[index] ??
                  (Array.isArray(shape.items) ? {} : shape.items),
                child(path, String(index)),
                depth + 1,
                nextReferences,
              );
              if (
                shape.uniqueItems !== true ||
                !unique.has(JSON.stringify(value))
              )
                break;
            }
            unique.add(JSON.stringify(value));
            values.push(value);
          }
          return values;
        }
        if (type === "integer" || type === "number") {
          let multiple =
            typeof shape.multipleOf === "number" && shape.multipleOf > 0
              ? shape.multipleOf
              : type === "integer"
                ? 1
                : 0.01;
          if (
            !Number.isFinite(multiple) ||
            multiple < 0.000001 ||
            multiple > 1e9
          ) {
            issue("constraint", path);
            return 0;
          }
          if (type === "integer" && !Number.isInteger(multiple)) {
            let a = Math.round(multiple * 1e6),
              b = 1e6;
            const numerator = a;
            while (b) {
              const remainder = a % b;
              a = b;
              b = remainder;
            }
            multiple = numerator / a;
          }
          const lower = Math.max(
            typeof shape.minimum === "number" ? shape.minimum : -Infinity,
            typeof shape.exclusiveMinimum === "number"
              ? shape.exclusiveMinimum
              : -Infinity,
          );
          const upper = Math.min(
            typeof shape.maximum === "number" ? shape.maximum : Infinity,
            typeof shape.exclusiveMaximum === "number"
              ? shape.exclusiveMaximum
              : Infinity,
          );
          const min = Number.isFinite(lower)
            ? lower
            : Number.isFinite(upper)
              ? Math.min(0, upper - 100)
              : 0;
          const max = Number.isFinite(upper) ? upper : Math.max(100, min + 100);
          let low = Math.ceil(min / multiple),
            high = Math.floor(max / multiple);
          const exclusiveMin =
            typeof shape.exclusiveMinimum === "number"
              ? shape.exclusiveMinimum
              : shape.exclusiveMinimum === true
                ? min
                : -Infinity;
          const exclusiveMax =
            typeof shape.exclusiveMaximum === "number"
              ? shape.exclusiveMaximum
              : shape.exclusiveMaximum === true
                ? max
                : Infinity;
          if (low * multiple <= exclusiveMin) low++;
          if (high * multiple >= exclusiveMax) high--;
          if (
            !Number.isSafeInteger(low) ||
            !Number.isSafeInteger(high) ||
            low > high ||
            high - low > 1e12
          ) {
            issue("constraint", path);
            return 0;
          }
          const value = Number(
            (
              (low + Math.floor(random() * (high - low + 1))) *
              multiple
            ).toFixed(6),
          );
          if (
            !Number.isFinite(value) ||
            (Number.isInteger(value) && !Number.isSafeInteger(value))
          ) {
            issue("constraint", path);
            return 0;
          }
          return value;
        }
        if (type === "string") {
          const token = Math.floor(random() * 0xffffffff)
            .toString(16)
            .padStart(8, "0");
          let value = `value_${row + 1}_${token}`;
          switch (shape.format) {
            case "uuid":
              value = `${token}-${token.slice(0, 4)}-4${token.slice(1, 4)}-a${token.slice(1, 4)}-${token}${token.slice(0, 4)}`;
              break;
            case "email":
              value = `user${row + 1}_${token}@example.test`;
              break;
            case "uri":
              value = `https://example.test/items/${token}`;
              break;
            case "date":
            case "date-time": {
              const date = new Date(
                Date.UTC(2020, 0, 1) + Math.floor(random() * 3650) * 86400000,
              ).toISOString();
              value = shape.format === "date" ? date.slice(0, 10) : date;
              break;
            }
            case "ipv4":
              value = `192.0.2.${1 + Math.floor(random() * 254)}`;
              break;
            case "ipv6":
              value = `2001:db8::${token.slice(0, 4)}`;
              break;
            case undefined:
              break;
            default:
              issue("unsupported", path, "format");
          }
          const min =
            typeof shape.minLength === "number"
              ? Math.max(0, Math.ceil(shape.minLength))
              : 0;
          const max =
            typeof shape.maxLength === "number"
              ? Math.max(0, Math.floor(shape.maxLength))
              : 4096;
          if (min > 4096) throw new FixtureError("limit", dataset.id);
          return value.padEnd(min, "x").slice(0, Math.min(max, 4096));
        }
        issue("unsupported", path, "type");
        return null;
      }
      const value = generate(schema, "");
      if (dataset.rules.length && !object(value))
        throw new FixtureError("field", dataset.id);
      for (const rule of dataset.rules) {
        let replacement: JsonValue;
        if (rule.kind === "constant") replacement = clone(rule.value);
        else if (rule.kind === "sequence") {
          const number = Number((rule.start + rule.step * row).toFixed(6));
          replacement = rule.asString ? `${rule.prefix}${number}` : number;
        } else {
          const pool = pools.get(rule.field)!;
          replacement = pool[row % pool.length];
        }
        Object.defineProperty(value, rule.field, {
          value: replacement,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      // Validate the original schema, so compositions and overrides cannot hide
      // violations introduced by the generator's deliberately limited subset.
      const checked = validateExampleValue(
        document.root,
        schema,
        value,
        dataset.direction,
      );
      validationSteps += checked.steps;
      if (validationSteps > 1000000)
        throw new FixtureError("limit", dataset.id);
      for (const entry of checked.issues)
        issue("validation", entry.instancePath, entry.keyword, entry.severity);
      if (checked.limited) issue("validation-limit", "");
      bytes += getByteSize(JSON.stringify(value));
      if (bytes > MAX_OUTPUT_BYTES) throw new FixtureError("limit", dataset.id);
      if (invalid) output.invalidRows++;
      if (review) output.reviewRows++;
      output.rows.push(value);
      completed++;
      options.onProgress?.(completed, total);
      if (completed % 10 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        abort();
      }
    }
    outputs.set(dataset.id, output);
  }
  abort();
  result.datasets = recipe.datasets.map((entry) => outputs.get(entry.id)!);
  return result;
}
export function exportFixtureData(
  result: FixtureResult,
  datasetId: string | null,
  format: "json" | "ndjson" | "csv",
) {
  const dataset =
    datasetId === null
      ? null
      : result.datasets.find((entry) => entry.id === datasetId);
  if (datasetId !== null && !dataset) throw new FixtureError("missing-source");
  let text: string;
  if (format === "json")
    text =
      JSON.stringify(
        dataset
          ? dataset.rows
          : Object.fromEntries(
              result.datasets.map((entry) => [entry.name, entry.rows]),
            ),
        null,
        2,
      ) + "\n";
  else if (!dataset) throw new FixtureError("csv");
  else if (format === "ndjson")
    text = dataset.rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  else {
    const table = createExplorerTable(dataset.rows);
    if (!table.ok) throw new FixtureError("csv");
    text = exportExplorerCsv(table, table.columns, "");
  }
  if (getByteSize(text) > MAX_OUTPUT_BYTES) throw new FixtureError("limit");
  return text;
}
