import { executePayloadMapping } from "./payload-mapping-runtime";
import {
  parseTransformPointer,
  parseTransformValue,
  readTransformSource,
  type JsonValue,
} from "./api-transform";
import {
  validateExampleValue,
  type ExampleValidationIssue,
} from "./example-validation";
import { getByteSize } from "./text-encoding";

export const MAX_MAPPING_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_MAPPING_PAYLOAD_BYTES = 256 * 1024;
export const MAX_MAPPING_CASES = 30;
export const MAPPING_OPERATORS = [
  "copy",
  "constant",
  "string",
  "number",
  "integer",
  "boolean",
  "trim",
  "lower",
  "upper",
  "length",
  "join",
  "split",
] as const;
export type MappingOperator = (typeof MAPPING_OPERATORS)[number];
export type MappingRule = {
  id: string;
  enabled: boolean;
  source: string;
  target: string;
  operator: MappingOperator;
  missing: "error" | "omit" | "default";
  value: string;
  argument: string;
};
export type MappingStage = {
  id: string;
  name: string;
  enabled: boolean;
  base: "object" | "array" | "input";
  rules: MappingRule[];
};
export type MappingRecipe = {
  kind: "rsswag-payload-mapping";
  version: 1;
  name: string;
  stages: MappingStage[];
};
export type MappingExecution = {
  output: JsonValue;
  stages: {
    id: string;
    rules: { id: string; mapped: number; omitted: number; defaults: number }[];
    byteLength: number;
    output?: JsonValue;
  }[];
  steps: number;
};
export type MappingErrorCode =
  | "limit"
  | "input"
  | "pointer"
  | "recipe"
  | "literal"
  | "collision"
  | "missing"
  | "array"
  | "target"
  | "conversion"
  | "project"
  | "source"
  | "binding"
  | "case";
export class MappingError extends Error {
  constructor(
    public code: MappingErrorCode,
    public stage = "",
    public rule = "",
    public path = "",
  ) {
    super(code);
  }
}
export type MappingBinding = {
  id: string;
  label: string;
  schema: unknown;
  direction: "none" | "request" | "response";
};
export type MappingContract = {
  source: string;
  root: Record<string, unknown>;
  validationRoot: Record<string, unknown>;
  bindings: MappingBinding[];
  title: string;
};
export type MappingValidation = {
  status: "none" | "valid" | "warning" | "invalid" | "partial";
  issues: ExampleValidationIssue[];
  limited: boolean;
};
export type MappingRun = {
  execution: MappingExecution;
  inputValidation: MappingValidation;
  outputValidation: MappingValidation;
};
export type MappingCase = {
  id: string;
  name: string;
  input: string;
  expected: string;
  compareExpected: boolean;
};
export type MappingProject = {
  kind: "rsswag-payload-mapping-project";
  version: 1;
  recipe: MappingRecipe;
  input: string;
  contract: string;
  inputBinding: string;
  outputBinding: string;
  cases: MappingCase[];
};
export type MappingCaseResult = {
  id: string;
  name: string;
  status: "passed" | "failed" | "partial";
  expected: "none" | "match" | "mismatch";
  error?: { code: MappingErrorCode; stage: string; rule: string; path: string };
  run?: MappingRun;
};
const record = (v: unknown): v is Record<string, JsonValue> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const escape = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const own = (v: object, key: string) =>
  Object.prototype.hasOwnProperty.call(v, key);
export function mappingError(error: unknown): MappingError {
  if (error instanceof MappingError) return error;
  if (error instanceof Error && "code" in error) {
    const v = error as Error & {
      code: MappingErrorCode;
      stage?: string;
      rule?: string;
      path?: string;
    };
    if (
      [
        "limit",
        "input",
        "pointer",
        "recipe",
        "literal",
        "collision",
        "missing",
        "array",
        "target",
        "conversion",
        "project",
        "source",
        "binding",
        "case",
      ].includes(v.code)
    )
      return new MappingError(v.code, v.stage, v.rule, v.path);
  }
  return new MappingError("input");
}
export function validateMappingRecipe(value: unknown): MappingRecipe {
  try {
    executePayloadMapping(value as MappingRecipe, null, true);
  } catch (error) {
    throw mappingError(error);
  }
  const v = value as MappingRecipe;
  return {
    kind: "rsswag-payload-mapping",
    version: 1,
    name: v.name,
    stages: v.stages.map((s) => ({
      id: s.id,
      name: s.name,
      base: s.base,
      enabled: s.enabled,
      rules: s.rules.map((r) => ({
        id: r.id,
        source: r.source,
        target: r.target,
        operator: r.operator,
        missing: r.missing,
        enabled: r.enabled,
        value: r.value,
        argument: r.argument,
      })),
    })),
  };
}
export function parseMappingInput(text: string): JsonValue {
  if (getByteSize(text) > MAX_MAPPING_PAYLOAD_BYTES)
    throw new MappingError("limit");
  try {
    const input = parseTransformValue(text);
    executePayloadMapping(
      {
        kind: "rsswag-payload-mapping",
        version: 1,
        name: "Check",
        stages: [
          {
            id: "check",
            name: "Check",
            base: "input",
            enabled: false,
            rules: [],
          },
        ],
      },
      input,
    );
    return input;
  } catch (error) {
    throw mappingError(error);
  }
}
export function runMappingRecipe(
  recipe: MappingRecipe,
  input: JsonValue,
): MappingExecution {
  try {
    return executePayloadMapping(recipe, input);
  } catch (error) {
    throw mappingError(error);
  }
}
export function parseMappingRecipe(text: string): MappingRecipe {
  if (getByteSize(text) > MAX_MAPPING_PROJECT_BYTES)
    throw new MappingError("limit");
  try {
    return validateMappingRecipe(parseTransformValue(text));
  } catch (error) {
    throw mappingError(error);
  }
}
function readPointer(root: unknown, pointer: string): unknown {
  let v = root;
  for (const part of parseTransformPointer(pointer)) {
    if (!v || typeof v !== "object" || !own(v, part)) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}
function resolve(root: Record<string, unknown>, value: unknown): unknown {
  const seen = new Set<string>();
  for (let i = 0; i < 32; i++) {
    if (!record(value) || typeof value.$ref !== "string") return value;
    if (!value.$ref.startsWith("#/") || seen.has(value.$ref)) return undefined;
    seen.add(value.$ref);
    try {
      value = readPointer(root, decodeURIComponent(value.$ref.slice(1)));
    } catch {
      return undefined;
    }
  }
  return undefined;
}
// Validate only a conservative, linear subset of regular expressions. Complex
// patterns remain in the saved contract and receive a partial-check status.
const supportedFormats = new Set([
  "date",
  "date-time",
  "email",
  "ipv4",
  "ipv6",
  "uri",
  "uuid",
  "int32",
  "int64",
  "float",
  "double",
]);
function safePattern(pattern: unknown): boolean {
  if (
    typeof pattern !== "string" ||
    pattern.length > 256 ||
    !pattern.startsWith("^") ||
    !pattern.endsWith("$")
  )
    return false;
  let repeats = 0;
  for (let i = 1; i < pattern.length - 1; i++) {
    const c = pattern[i];
    if (c === "[") {
      let closed = false;
      while (++i < pattern.length - 1) {
        if (pattern[i] === "\\") {
          i++;
          continue;
        }
        if (pattern[i] === "]") {
          closed = true;
          break;
        }
      }
      if (!closed) return false;
    } else if (["(", ")", "|", "\\", "^", "$", "}"].includes(c)) return false;
    else if (["*", "+", "?", "{"].includes(c)) {
      if (++repeats > 1) return false;
      if (c === "{") {
        const quantifier = pattern
          .slice(i)
          .match(/^\{\d{1,4}(?:,\d{0,4})?\}/)?.[0];
        if (!quantifier) return false;
        i += quantifier.length - 1;
      }
    }
  }
  try {
    new RegExp(pattern, "u");
    return true;
  } catch {
    return false;
  }
}
function validationSnapshot(value: unknown, schemaContext = false): unknown {
  if (Array.isArray(value))
    return value.map((child) => validationSnapshot(child, schemaContext));
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (schemaContext) {
        if (
          key === "format" &&
          typeof child === "string" &&
          !supportedFormats.has(child)
        )
          return [];
        if (
          key === "pattern" &&
          typeof child === "string" &&
          !safePattern(child)
        )
          return [];
        if (key === "patternProperties" && record(child))
          return [
            [
              key,
              Object.fromEntries(
                Object.entries(child)
                  .filter(([pattern]) => safePattern(pattern))
                  .map(([pattern, schema]) => [
                    pattern,
                    validationSnapshot(schema, true),
                  ]),
              ),
            ],
          ];
        if (
          ["properties", "$defs", "definitions", "dependentSchemas"].includes(
            key,
          ) &&
          record(child)
        )
          return [
            [
              key,
              Object.fromEntries(
                Object.entries(child).map(([name, schema]) => [
                  name,
                  validationSnapshot(schema, true),
                ]),
              ),
            ],
          ];
        if (
          [
            "items",
            "additionalProperties",
            "contains",
            "not",
            "if",
            "then",
            "else",
            "propertyNames",
            "allOf",
            "anyOf",
            "oneOf",
            "prefixItems",
          ].includes(key)
        )
          return [[key, validationSnapshot(child, true)]];
        return [[key, child]];
      }
      if (["schemas", "definitions"].includes(key) && record(child))
        return [
          [
            key,
            Object.fromEntries(
              Object.entries(child).map(([name, schema]) => [
                name,
                validationSnapshot(schema, true),
              ]),
            ),
          ],
        ];
      return [[key, validationSnapshot(child, key === "schema")]];
    }),
  );
}
export function readMappingContract(source: string): MappingContract {
  if (getByteSize(source) > 1024 * 1024) throw new MappingError("limit");
  let parsed: ReturnType<typeof readTransformSource>;
  try {
    parsed = readTransformSource(source);
  } catch {
    throw new MappingError("source");
  }
  const root = parsed.document as Record<string, unknown>,
    bindings: MappingBinding[] = [];
  function add(
    id: string,
    label: string,
    schema: unknown,
    direction: MappingBinding["direction"],
  ) {
    if (schema === undefined || schema === null) return;
    if (bindings.length >= 1000) throw new MappingError("limit");
    bindings.push({ id, label, schema, direction });
  }
  function content(
    value: unknown,
    id: string,
    label: string,
    direction: MappingBinding["direction"],
  ) {
    const container = resolve(root, value);
    if (!record(container)) return;
    if (record(container.content))
      for (const [media, v] of Object.entries(container.content)) {
        if (
          /^(?:application\/(?:[\w.+-]+\+)?json)(?:;|$)/i.test(media) &&
          record(v)
        )
          add(
            `${id}/content/${escape(media)}/schema`,
            `${label} · ${media}`,
            v.schema,
            direction,
          );
      }
    if (container.schema !== undefined)
      add(`${id}/schema`, label, container.schema, direction);
  }
  const components = record(root.components) ? root.components : {};
  const schemas = record(components.schemas)
    ? components.schemas
    : record(root.definitions)
      ? root.definitions
      : {};
  const modelPrefix = record(components.schemas)
    ? "/components/schemas"
    : "/definitions";
  for (const [name, schema] of Object.entries(schemas))
    add(`${modelPrefix}/${escape(name)}`, name, schema, "none");
  const paths = record(root.paths) ? root.paths : {};
  for (const [path, raw] of Object.entries(paths)) {
    const item = resolve(root, raw);
    if (!record(item)) continue;
    for (const method of [
      "get",
      "put",
      "post",
      "delete",
      "options",
      "head",
      "patch",
      "trace",
    ]) {
      const op = item[method];
      if (!record(op)) continue;
      const id = `/paths/${escape(path)}/${method}`,
        label = `${method.toUpperCase()} ${path}`;
      content(
        op.requestBody,
        `${id}/requestBody`,
        `${label} request`,
        "request",
      );
      if (Array.isArray(op.parameters))
        op.parameters.forEach((p, index) => {
          const parameter = resolve(root, p);
          if (record(parameter) && parameter.in === "body")
            add(
              `${id}/parameters/${index}/schema`,
              `${label} request`,
              parameter.schema,
              "request",
            );
        });
      if (record(op.responses))
        for (const [status, response] of Object.entries(op.responses))
          content(
            response,
            `${id}/responses/${escape(status)}`,
            `${label} response ${status}`,
            "response",
          );
    }
  }
  return {
    source,
    root,
    validationRoot: validationSnapshot(root) as Record<string, unknown>,
    bindings,
    title: parsed.title,
  };
}
function hasUnresolvedSchema(
  contract: MappingContract,
  schema: unknown,
): boolean {
  let steps = 0;
  const refs = new Set<string>();
  function walk(v: unknown, depth: number): boolean {
    if (++steps > 10000 || depth > 32) return true;
    if (!record(v)) return typeof v !== "boolean";
    if (typeof v.format === "string" && !supportedFormats.has(v.format))
      return true;
    if (
      (v.pattern !== undefined && !safePattern(v.pattern)) ||
      (record(v.patternProperties) &&
        Object.keys(v.patternProperties).some(
          (pattern) => !safePattern(pattern),
        ))
    )
      return true;
    if (
      [
        "$id",
        "$anchor",
        "$dynamicAnchor",
        "unevaluatedProperties",
        "unevaluatedItems",
        "dependentSchemas",
        "dependentRequired",
        "dependencies",
        "contains",
        "minContains",
        "maxContains",
        "if",
        "then",
        "else",
        "propertyNames",
        "contentSchema",
        "prefixItems",
      ].some((key) => own(v, key))
    )
      return true;
    for (const name of ["$ref", "$dynamicRef"])
      if (typeof v[name] === "string") {
        const ref = v[name];
        if (!ref.startsWith("#/") || name === "$dynamicRef") return true;
        if (!refs.has(ref)) {
          refs.add(ref);
          let next: unknown;
          try {
            next = readPointer(contract.root, decodeURIComponent(ref.slice(1)));
          } catch {
            return true;
          }
          if (next === undefined || next === false || walk(next, depth + 1))
            return true;
        }
      }
    for (const key of [
      "properties",
      "patternProperties",
      "$defs",
      "definitions",
      "dependentSchemas",
    ])
      if (
        record(v[key]) &&
        Object.values(v[key]).some((child) => walk(child, depth + 1))
      )
        return true;
    for (const key of [
      "items",
      "additionalProperties",
      "contains",
      "not",
      "if",
      "then",
      "else",
      "propertyNames",
    ])
      if (v[key] !== undefined && walk(v[key], depth + 1)) return true;
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"])
      if (
        Array.isArray(v[key]) &&
        v[key].some((child) => walk(child, depth + 1))
      )
        return true;
    return false;
  }
  return walk(schema, 0);
}
export function validateMappingBinding(
  contract: MappingContract | null,
  id: string,
  value: JsonValue,
): MappingValidation {
  if (!id) return { status: "none", issues: [], limited: false };
  const binding = contract?.bindings.find((b) => b.id === id);
  if (!contract || !binding) throw new MappingError("binding");
  const check = validateExampleValue(
    contract.validationRoot,
    validationSnapshot(binding.schema, true),
    value,
    binding.direction,
  );
  if (
    resolve(contract.root, binding.schema) === false &&
    !check.issues.some((i) => i.severity === "error")
  )
    check.issues.push(
      ...validateExampleValue(
        contract.validationRoot,
        false,
        value,
        binding.direction,
      ).issues,
    );
  const partial =
    check.limited || hasUnresolvedSchema(contract, binding.schema);
  return {
    status: check.issues.some((i) => i.severity === "error")
      ? "invalid"
      : partial
        ? "partial"
        : check.issues.length
          ? "warning"
          : "valid",
    issues: check.issues,
    limited: partial,
  };
}
export function runMappingProject(project: MappingProject): MappingRun {
  const input = parseMappingInput(project.input),
    contract = project.contract ? readMappingContract(project.contract) : null;
  const inputValidation = validateMappingBinding(
    contract,
    project.inputBinding,
    input,
  );
  const execution = runMappingRecipe(project.recipe, input);
  return {
    execution,
    inputValidation,
    outputValidation: validateMappingBinding(
      contract,
      project.outputBinding,
      execution.output,
    ),
  };
}
function equals(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equals(v, b[i]));
  if (record(a) && record(b))
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((k) => own(b, k) && equals(a[k], b[k]))
    );
  return false;
}
export function runMappingCases(project: MappingProject): MappingCaseResult[] {
  if (project.cases.length > MAX_MAPPING_CASES) throw new MappingError("limit");
  if (
    project.cases.reduce(
      (sum, c) =>
        sum +
        getByteSize(c.input) +
        getByteSize(c.compareExpected ? c.expected : ""),
      0,
    ) > MAX_MAPPING_PROJECT_BYTES
  )
    throw new MappingError("limit");
  return project.cases.map((c) => {
    try {
      const run = runMappingProject({ ...project, input: c.input }),
        expected = c.compareExpected
          ? equals(parseMappingInput(c.expected), run.execution.output)
            ? "match"
            : "mismatch"
          : "none";
      run.execution.stages = run.execution.stages.map(
        ({ output: _output, ...trace }) => {
          void _output;
          return trace;
        },
      );
      const statuses = [
        run.inputValidation.status,
        run.outputValidation.status,
      ];
      return {
        id: c.id,
        name: c.name,
        expected,
        run,
        status:
          expected === "mismatch" || statuses.includes("invalid")
            ? "failed"
            : statuses.includes("partial") || statuses.includes("warning")
              ? "partial"
              : "passed",
      };
    } catch (error) {
      const e = mappingError(error);
      return {
        id: c.id,
        name: c.name,
        expected: "none",
        status: "failed",
        error: { code: e.code, stage: e.stage, rule: e.rule, path: e.path },
      };
    }
  });
}
export function mappingRunReport(run: MappingRun) {
  const validation = (v: MappingValidation) => ({
    status: v.status,
    limited: v.limited,
    issues: v.issues.map((i) => ({
      instancePath: i.instancePath,
      keyword: i.keyword,
      severity: i.severity,
    })),
  });
  return {
    kind: "rsswag-payload-mapping-report",
    version: 1,
    stages: run.execution.stages.map((s) => ({
      id: s.id,
      rules: s.rules,
      byteLength: s.byteLength,
    })),
    steps: run.execution.steps,
    inputValidation: validation(run.inputValidation),
    outputValidation: validation(run.outputValidation),
  };
}
export function mappingCasesReport(results: MappingCaseResult[]) {
  return {
    kind: "rsswag-payload-mapping-cases-report",
    version: 1,
    cases: results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      expected: r.expected,
      error: r.error,
      report: r.run ? mappingRunReport(r.run) : undefined,
    })),
  };
}
export function createMappingModule(recipe: MappingRecipe): string {
  const clean = validateMappingRecipe(recipe);
  return `// Generated by RSSwag. JSON input/output only; no network or OpenAPI validation.\n// runPayloadMapping(recipe, input) returns { output, stages, steps }.\nexport const recipe = ${JSON.stringify(clean, null, 2)};\n\nexport const runPayloadMapping = ${executePayloadMapping.toString()};\n\nexport function mapPayload(input) { return runPayloadMapping(recipe, input).output; }\n`;
}
export function newMappingRule(): MappingRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    source: "",
    target: "/value",
    operator: "copy",
    missing: "error",
    value: "null",
    argument: ",",
  };
}
export function newMappingStage(): MappingStage {
  return {
    id: crypto.randomUUID(),
    name: "Mapping stage",
    enabled: true,
    base: "object",
    rules: [],
  };
}
export function emptyMappingProject(): MappingProject {
  return {
    kind: "rsswag-payload-mapping-project",
    version: 1,
    recipe: {
      kind: "rsswag-payload-mapping",
      version: 1,
      name: "Payload mapping",
      stages: [newMappingStage()],
    },
    input: "{}",
    contract: "",
    inputBinding: "",
    outputBinding: "",
    cases: [],
  };
}
export function parseMappingProject(text: string): MappingProject {
  if (getByteSize(text) > MAX_MAPPING_PROJECT_BYTES)
    throw new MappingError("limit");
  let v: JsonValue;
  try {
    v = parseTransformValue(text);
  } catch {
    throw new MappingError("project");
  }
  if (
    !record(v) ||
    v.kind !== "rsswag-payload-mapping-project" ||
    v.version !== 1 ||
    typeof v.input !== "string" ||
    typeof v.contract !== "string" ||
    typeof v.inputBinding !== "string" ||
    typeof v.outputBinding !== "string" ||
    !Array.isArray(v.cases) ||
    v.cases.length > MAX_MAPPING_CASES
  )
    throw new MappingError("project");
  const recipe = validateMappingRecipe(v.recipe);
  parseMappingInput(v.input);
  const contract = v.contract ? readMappingContract(v.contract) : null;
  for (const id of [v.inputBinding, v.outputBinding])
    if (id && !contract?.bindings.some((b) => b.id === id))
      throw new MappingError("binding");
  const ids = new Set<string>();
  const cases = v.cases.map((c) => {
    if (
      !record(c) ||
      typeof c.id !== "string" ||
      !c.id ||
      c.id.length > 100 ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 200 ||
      typeof c.input !== "string" ||
      typeof c.expected !== "string" ||
      typeof c.compareExpected !== "boolean"
    )
      throw new MappingError("project");
    ids.add(c.id);
    parseMappingInput(c.input);
    if (c.compareExpected) parseMappingInput(c.expected);
    return {
      id: c.id,
      name: c.name,
      input: c.input,
      expected: c.expected,
      compareExpected: c.compareExpected,
    };
  });
  return {
    kind: "rsswag-payload-mapping-project",
    version: 1,
    recipe,
    input: v.input,
    contract: v.contract,
    inputBinding: v.inputBinding,
    outputBinding: v.outputBinding,
    cases,
  };
}
export function serializeMappingProject(project: MappingProject): string {
  const text = JSON.stringify(project, null, 2);
  parseMappingProject(text);
  return text;
}
export function mappingPointerInventory(
  input: string,
): { pointer: string; type: string }[] {
  const value = parseMappingInput(input),
    rows: { pointer: string; type: string }[] = [];
  function walk(v: JsonValue, path: string) {
    if (rows.length >= 300) return;
    rows.push({
      pointer: path,
      type: v === null ? "null" : Array.isArray(v) ? "array" : typeof v,
    });
    if (Array.isArray(v))
      v.slice(0, 3).forEach((child, i) => walk(child, `${path}/${i}`));
    else if (record(v))
      Object.entries(v).forEach(([key, child]) =>
        walk(child, `${path}/${escape(key)}`),
      );
  }
  walk(value, "");
  return rows;
}
export function demoMappingProject(): MappingProject {
  const rule = (
    id: string,
    source: string,
    target: string,
    operator: MappingOperator = "copy",
    extra: Partial<MappingRule> = {},
  ): MappingRule => ({
    id,
    source,
    target,
    operator,
    enabled: true,
    missing: "error",
    value: "null",
    argument: ",",
    ...extra,
  });
  const project = emptyMappingProject();
  project.recipe = {
    kind: "rsswag-payload-mapping",
    version: 1,
    name: "Customer adapter",
    stages: [
      {
        id: "normalize",
        name: "Normalize customers",
        enabled: true,
        base: "object",
        rules: [
          rule("id", "/users/*/id", "/customers/*/id", "integer"),
          rule("name", "/users/*/display_name", "/customers/*/name", "trim"),
          rule("enabled", "/users/*/active", "/customers/*/enabled", "boolean"),
          rule("country", "/users/*/country", "/customers/*/country", "copy", {
            missing: "default",
            value: '"unknown"',
          }),
          rule("count", "/users", "/count", "length"),
        ],
      },
      {
        id: "envelope",
        name: "Build destination envelope",
        enabled: true,
        base: "object",
        rules: [
          rule("payload", "", "/payload"),
          rule("version", "", "/version", "constant", { value: '"v2"' }),
        ],
      },
    ],
  };
  project.input = JSON.stringify(
    {
      users: [
        { id: "7", display_name: " Ada ", active: "true", country: "UK" },
        { id: "8", display_name: " Lin ", active: "false" },
      ],
    },
    null,
    2,
  );
  const output = runMappingProject(project).execution.output;
  project.cases = [
    {
      id: "demo",
      name: "Two customers",
      input: project.input,
      compareExpected: true,
      expected: JSON.stringify(output, null, 2),
    },
  ];
  return project;
}
