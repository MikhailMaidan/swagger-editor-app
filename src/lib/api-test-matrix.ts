import {
  createScenarioStep,
  executeScenarioLive,
  expandScenarioText,
  parseScenario,
  parseScenarioVariables,
  runApiScenario,
  ScenarioError,
  serializeScenario,
  prepareScenarioRequest,
  validScenarioStatus,
  validScenarioVariable,
  validateScenario,
  type ApiScenario,
  type ScenarioStep,
  type ScenarioStepResult,
  type ScenarioTransport,
  type ScenarioValue,
  type ScenarioVariables,
} from "./api-scenario";
import {
  escapeTransformPointer,
  parseTransformPointer,
  parseTransformValue,
  type JsonValue,
} from "./api-transform";
import {
  evaluateResponseAssertions,
  validateResponseAssertion,
  type AssertionResult,
  type ResponseAssertion,
} from "./response-assertions";
import type { EndpointSummary } from "./openapi";
import { getByteSize } from "./text-encoding";

export const MAX_MATRIX_BYTES = 2 * 1024 * 1024;
export const MAX_MATRIX_CASES = 100;
export const MAX_MATRIX_REQUESTS = 500;
export type MatrixCase = {
  key: string;
  name: string;
  enabled: boolean;
  values: ScenarioVariables;
};
export type MatrixAssertion = ResponseAssertion & { valueVariable: string };
export type MatrixBinding = {
  stepId: string;
  statusVariable: string;
  mockStatusVariable: string;
  durationVariable: string;
  assertions: MatrixAssertion[];
};
export type MatrixProject = {
  kind: "rsswag-api-test-matrix";
  version: 1;
  name: string;
  scenario: ApiScenario;
  cases: MatrixCase[];
  bindings: MatrixBinding[];
  concurrency: number;
  maxRunMs: number;
  stopOnCaseFailure: boolean;
  allowInvalidInputs: boolean;
};
export type MatrixCaseOutcome =
  "passed" | "failed" | "error" | "cancelled" | "skipped";
export type MatrixStepResult = ScenarioStepResult & {
  assertions: {
    name: string;
    target: string;
    path: string;
    outcome: AssertionResult["outcome"];
    issue?: AssertionResult["issue"];
  }[];
};
export type MatrixCaseResult = {
  key: string;
  name: string;
  outcome: MatrixCaseOutcome;
  reason?: "cancelled" | "stopped";
  steps: MatrixStepResult[];
  durationMs: number;
};
export type MatrixReport = {
  kind: "rsswag-api-test-matrix-report";
  version: 1;
  name: string;
  mode: "mock" | "live";
  outcome: "passed" | "failed" | "cancelled";
  stopReason?: "cancelled" | "budget" | "failure";
  counts: Record<MatrixCaseOutcome, number>;
  results: MatrixCaseResult[];
};
export type MatrixErrorCode =
  | "project"
  | "dataset"
  | "csv"
  | "limit"
  | "variables"
  | "binding"
  | "endpoint"
  | "writes"
  | "headers"
  | "source";
export class MatrixError extends Error {
  caseKey?: string;
  constructor(public code: MatrixErrorCode) {
    super(code);
  }
}
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
const key = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v);
function readJson(value: string): JsonValue {
  if (getByteSize(value) > MAX_MATRIX_BYTES) throw new MatrixError("limit");
  try {
    return parseTransformValue(value);
  } catch {
    throw new MatrixError("dataset");
  }
}
export function emptyMatrixProject(): MatrixProject {
  return {
    kind: "rsswag-api-test-matrix",
    version: 1,
    name: "Data-driven API tests",
    scenario: {
      name: "Matrix workflow",
      variableNames: [],
      steps: [],
      stopOnFailure: true,
    },
    cases: [],
    bindings: [],
    concurrency: 1,
    maxRunMs: 120000,
    stopOnCaseFailure: false,
    allowInvalidInputs: false,
  };
}
function checkedValues(value: unknown): ScenarioVariables {
  if (
    !obj(value) ||
    Object.keys(value).length > 32 ||
    getByteSize(JSON.stringify(value)) > 65536
  )
    throw new MatrixError("dataset");
  try {
    return parseScenarioVariables(JSON.stringify(value));
  } catch {
    throw new MatrixError("dataset");
  }
}
export function parseMatrixValues(value: string) {
  return checkedValues(readJson(value));
}
export function readMatrixDataset(
  input: string,
  format: "json" | "csv",
  inferCsvScalars = false,
): MatrixCase[] {
  if (getByteSize(input) > MAX_MATRIX_BYTES) throw new MatrixError("limit");
  let rows: unknown[];
  if (format === "json") {
    const value = readJson(input);
    if (!Array.isArray(value)) throw new MatrixError("dataset");
    rows = value;
  } else {
    const table = csvTable(input.replace(/^\uFEFF/, ""));
    const headers = table.shift()?.map((v) => v.trim()) ?? [];
    if (
      !headers.length ||
      headers.length > 32 ||
      headers.some((v) => !validScenarioVariable(v)) ||
      new Set(headers).size !== headers.length
    )
      throw new MatrixError("csv");
    rows = table.map((row) => {
      if (row.length !== headers.length) throw new MatrixError("csv");
      return Object.fromEntries(
        headers.map((name, i) => [
          name,
          inferCsvScalars ? inferredCell(row[i]) : row[i],
        ]),
      );
    });
  }
  if (!rows.length) throw new MatrixError("dataset");
  if (rows.length > MAX_MATRIX_CASES) throw new MatrixError("limit");
  return rows.map((value, i) => ({
    key: `case-${i + 1}`,
    name: `Case ${i + 1}`,
    enabled: true,
    values: checkedValues(value),
  }));
}
function inferredCell(value: string): ScenarioValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
    const n = Number(value);
    if (Number.isFinite(n) && (!Number.isInteger(n) || Number.isSafeInteger(n)))
      return n;
  }
  return value;
}
function csvTable(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const addCell = () => {
    if (cell.length > 8192 || row.length >= 32) throw new MatrixError("limit");
    row.push(cell);
    cell = "";
    closed = false;
  };
  const addRow = () => {
    addCell();
    rows.push(row);
    row = [];
    if (rows.length > MAX_MATRIX_CASES + 1) throw new MatrixError("limit");
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new MatrixError("csv");
      quoted = true;
    } else if (c === ",") addCell();
    else if (c === "\r" || c === "\n") {
      addRow();
      if (c === "\r" && input[i + 1] === "\n") i++;
    } else {
      if (closed) throw new MatrixError("csv");
      cell += c;
    }
    if (cell.length > 8192) throw new MatrixError("limit");
  }
  if (quoted) throw new MatrixError("csv");
  if (cell || closed || row.length) addRow();
  return rows;
}
function probeExpected(rule: MatrixAssertion) {
  return rule.operator === "type"
    ? "string"
    : rule.target === "body" && rule.operator === "equals"
      ? "null"
      : rule.target === "status"
        ? "200"
        : ["gte", "lte", "length"].includes(rule.operator)
          ? "0"
          : "sample";
}
function validateBinding(value: unknown, steps: ScenarioStep[]): MatrixBinding {
  if (
    !obj(value) ||
    !text(value.stepId, 160) ||
    !steps.some((s) => s.id === value.stepId) ||
    !Array.isArray(value.assertions) ||
    value.assertions.length > 25
  )
    throw new MatrixError("binding");
  for (const name of [
    "statusVariable",
    "mockStatusVariable",
    "durationVariable",
  ])
    if (
      !text(value[name], 64) ||
      (value[name] !== "" && !validScenarioVariable(value[name] as string))
    )
      throw new MatrixError("binding");
  const assertions: MatrixAssertion[] = value.assertions.map((raw) => {
    if (
      !obj(raw) ||
      !text(raw.expected, 4096) ||
      !text(raw.valueVariable, 64) ||
      (raw.valueVariable !== "" && !validScenarioVariable(raw.valueVariable))
    )
      throw new MatrixError("binding");
    const rule = raw as unknown as MatrixAssertion;
    const path =
      typeof rule.path === "string"
        ? rule.path.replace(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g, "sample")
        : rule.path;
    if (
      validateResponseAssertion({
        ...rule,
        path,
        expected: rule.valueVariable ? probeExpected(rule) : rule.expected,
      })
    )
      throw new MatrixError("binding");
    return {
      name: rule.name,
      target: rule.target,
      path: rule.path,
      operator: rule.operator,
      expected: rule.expected,
      valueVariable: rule.valueVariable,
    };
  });
  return {
    stepId: value.stepId,
    statusVariable: value.statusVariable as string,
    mockStatusVariable: value.mockStatusVariable as string,
    durationVariable: value.durationVariable as string,
    assertions,
  };
}
export function validateMatrixProject(input: unknown): MatrixProject {
  const value = readJson(JSON.stringify(input));
  if (
    !obj(value) ||
    value.kind !== "rsswag-api-test-matrix" ||
    value.version !== 1 ||
    !text(value.name, 120) ||
    !value.name.trim() ||
    !validateScenario(value.scenario) ||
    !Array.isArray(value.cases) ||
    !Array.isArray(value.bindings) ||
    !Number.isInteger(value.concurrency) ||
    Number(value.concurrency) < 1 ||
    Number(value.concurrency) > 4 ||
    typeof value.stopOnCaseFailure !== "boolean" ||
    typeof value.allowInvalidInputs !== "boolean" ||
    !Number.isInteger(value.maxRunMs) ||
    Number(value.maxRunMs) < 1000 ||
    Number(value.maxRunMs) > 300000
  )
    throw new MatrixError("project");
  if (value.cases.length > MAX_MATRIX_CASES || value.bindings.length > 20)
    throw new MatrixError("limit");
  const ids = new Set<string>();
  const cases: MatrixCase[] = value.cases.map((raw) => {
    if (
      !obj(raw) ||
      !key(raw.key) ||
      ids.has(raw.key) ||
      !text(raw.name, 120) ||
      !raw.name.trim() ||
      typeof raw.enabled !== "boolean"
    )
      throw new MatrixError("dataset");
    ids.add(raw.key);
    return {
      key: raw.key,
      name: raw.name,
      enabled: raw.enabled,
      values: checkedValues(raw.values),
    };
  });
  const scenario = parseScenario(serializeScenario(value.scenario));
  const bindingIds = new Set<string>();
  const bindings = value.bindings.map((raw) => {
    const binding = validateBinding(raw, scenario.steps);
    if (bindingIds.has(binding.stepId)) throw new MatrixError("binding");
    bindingIds.add(binding.stepId);
    return binding;
  });
  return {
    kind: "rsswag-api-test-matrix",
    version: 1,
    name: value.name,
    scenario,
    cases,
    bindings,
    concurrency: Number(value.concurrency),
    maxRunMs: Number(value.maxRunMs),
    stopOnCaseFailure: value.stopOnCaseFailure,
    allowInvalidInputs: value.allowInvalidInputs,
  };
}
export function parseMatrixProject(input: string) {
  return validateMatrixProject(readJson(input));
}
export function serializeMatrixProject(input: MatrixProject) {
  const text = JSON.stringify(validateMatrixProject(input), null, 2) + "\n";
  if (getByteSize(text) > MAX_MATRIX_BYTES) throw new MatrixError("limit");
  return text;
}
export function matrixBinding(stepId: string): MatrixBinding {
  return {
    stepId,
    statusVariable: "",
    mockStatusVariable: "",
    durationVariable: "",
    assertions: [],
  };
}
export function addMatrixEndpoint(
  project: MatrixProject,
  endpoint: EndpointSummary,
) {
  let n = 1;
  while (project.scenario.steps.some((s) => s.id === `step-${n}`)) n++;
  const step = createScenarioStep(endpoint, `step-${n}`),
    defaults: ScenarioVariables = Object.create(null);
  step.parameters = step.parameters.map((p) => {
    if (!validScenarioVariable(p.name)) return p;
    const parameter = endpoint.parameters.find(
      (v) => v.location === p.location && v.name === p.name,
    );
    defaults[p.name] =
      parameter?.type === "number" ||
      parameter?.type === "integer" ||
      parameter?.type === "boolean"
        ? inferredCell(p.value)
        : p.value;
    return { ...p, value: `{{${p.name}}}` };
  });
  const original = project.cases.length
    ? project.cases
    : [{ key: "case-1", name: "Case 1", enabled: true, values: {} }];
  const cases = original.map((row) => ({
    ...row,
    values: { ...defaults, ...row.values },
  }));
  const variableNames = [
    ...new Set([...project.scenario.variableNames, ...Object.keys(defaults)]),
  ];
  return validateMatrixProject({
    ...project,
    scenario: {
      ...project.scenario,
      variableNames,
      steps: [...project.scenario.steps, step],
    },
    cases,
  });
}
export function parseMatrixHeaders(input: string): Record<string, string> {
  if (getByteSize(input) > 65536) throw new MatrixError("headers");
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new MatrixError("headers");
  }
  if (
    !obj(value) ||
    getByteSize(input) > 65536 ||
    Object.keys(value).length > 32
  )
    throw new MatrixError("headers");
  const names = new Set<string>();
  for (const [name, data] of Object.entries(value)) {
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) ||
      typeof data !== "string" ||
      data.length > 8192 ||
      /[\r\n\u0000]/.test(data) ||
      names.has(name.toLowerCase())
    )
      throw new MatrixError("headers");
    names.add(name.toLowerCase());
  }
  return value as Record<string, string>;
}

const namesIn = (text: string) =>
  [...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map(
    (m) => m[1],
  );
function bodyNames(step: ScenarioStep): string[] {
  if (!step.body.trim()) return [];
  if (!/(?:\/json|\+json)(?:;|$)/i.test(step.contentType))
    return namesIn(step.body);
  const value = readJson(step.body),
    names: string[] = [];
  function walk(v: JsonValue) {
    if (typeof v === "string") names.push(...namesIn(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === "object")
      Object.values(v).forEach(walk);
  }
  walk(value);
  return names;
}
function variable(values: ReadonlyMap<string, ScenarioValue>, name: string) {
  if (!values.has(name)) throw new MatrixError("variables");
  return values.get(name)!;
}
function renderAssertion(
  rule: MatrixAssertion,
  values: ReadonlyMap<string, ScenarioValue>,
): ResponseAssertion {
  const path =
    rule.target === "body"
      ? parseTransformPointer(rule.path)
          .map((part) =>
            escapeTransformPointer(expandScenarioText(part, new Map(values))),
          )
          .reduce((path, part) => `${path}/${part}`, "")
      : expandScenarioText(rule.path, new Map(values));
  const value = rule.valueVariable
    ? variable(values, rule.valueVariable)
    : null;
  return {
    name: rule.name,
    target: rule.target,
    path,
    operator: rule.operator,
    expected: rule.valueVariable
      ? rule.target === "body" && rule.operator === "equals"
        ? JSON.stringify(value)
        : String(value)
      : rule.expected,
  };
}
function compiledCase(
  project: MatrixProject,
  row: MatrixCase,
  endpoints: EndpointSummary[],
  serverOverride: string,
  headerNames: string[],
): ApiScenario {
  const values = new Map(Object.entries(row.values));
  const steps = project.scenario.steps.map((step) => {
    const binding = project.bindings.find((b) => b.stepId === step.id);
    const status = binding?.statusVariable
      ? String(variable(values, binding.statusVariable))
      : step.expectedStatus;
    const mockStatus = binding?.mockStatusVariable
      ? String(variable(values, binding.mockStatusVariable))
      : step.mockStatus;
    let duration = step.maxDurationMs;
    if (binding?.durationVariable) {
      const raw = variable(values, binding.durationVariable);
      if (
        typeof raw !== "number" &&
        (typeof raw !== "string" || !/^\d+$/.test(raw))
      )
        throw new MatrixError("binding");
      duration = Number(raw);
    }
    if (
      !validScenarioStatus(status) ||
      !Number.isInteger(duration) ||
      duration < 0 ||
      duration > 60000
    )
      throw new MatrixError("binding");
    const names = new Set(headerNames.map((name) => name.toLowerCase()));
    const parameters = [
      ...step.parameters.filter(
        (p) => p.location !== "header" || !names.has(p.name.toLowerCase()),
      ),
      ...headerNames.map((name) => ({
        location: "header" as const,
        name,
        value: "session-header",
      })),
    ];
    return {
      ...step,
      parameters,
      expectedStatus: status,
      mockStatus,
      maxDurationMs: duration,
      serverUrl: serverOverride || step.serverUrl,
    };
  });
  const available = new Set(Object.keys(row.values)),
    concrete = new Set(available),
    probe = new Map(values);
  for (const step of steps) {
    const endpoint = endpoints.find(
      (e) => e.method.toUpperCase() === step.method && e.path === step.path,
    )!;
    const binding = project.bindings.find((b) => b.stepId === step.id);
    const required = [
      ...namesIn(step.serverUrl),
      ...step.parameters.flatMap((p) => namesIn(p.value)),
      ...bodyNames(step),
      ...(binding?.assertions.flatMap((a) => [
        ...namesIn(a.path),
        ...(a.valueVariable ? [a.valueVariable] : []),
      ]) ?? []),
    ];
    if (required.some((name) => !available.has(name)))
      throw new MatrixError("variables");
    try {
      prepareScenarioRequest(step, endpoint, probe, project.allowInvalidInputs);
    } catch {
      throw new MatrixError("variables");
    }
    for (const assertion of binding?.assertions ?? []) {
      // Check concrete initial bindings now; extracted values are validated after their response arrives.
      const uses = [
        ...namesIn(assertion.path),
        ...(assertion.valueVariable ? [assertion.valueVariable] : []),
      ];
      if (
        uses.every((name) => concrete.has(name)) &&
        validateResponseAssertion(renderAssertion(assertion, values))
      )
        throw new MatrixError("binding");
    }
    for (const extract of step.extracts) {
      available.add(extract.name);
      concrete.delete(extract.name);
      probe.set(extract.name, "sample");
    }
  }
  const scenario = { ...project.scenario, steps };
  if (!validateScenario(scenario)) throw new MatrixError("binding");
  return scenario;
}
export function previewMatrixRun(
  projectInput: MatrixProject,
  endpoints: EndpointSummary[],
  options: {
    caseKeys?: string[];
    serverOverride?: string;
    mode?: "mock" | "live";
    sharedHeaders?: Record<string, string>;
  } = {},
) {
  const project = validateMatrixProject(projectInput);
  const rows = project.cases.filter(
    (c) => c.enabled && (!options.caseKeys || options.caseKeys.includes(c.key)),
  );
  if (!rows.length || !project.scenario.steps.length)
    throw new MatrixError("project");
  if (
    options.caseKeys &&
    (new Set(options.caseKeys).size !== options.caseKeys.length ||
      options.caseKeys.some((key) => !rows.some((row) => row.key === key)))
  )
    throw new MatrixError("dataset");
  if (rows.length * project.scenario.steps.length > MAX_MATRIX_REQUESTS)
    throw new MatrixError("limit");
  if (
    project.scenario.steps.some(
      (s) =>
        endpoints.filter(
          (e) => e.method.toUpperCase() === s.method && e.path === s.path,
        ).length !== 1,
    )
  )
    throw new MatrixError("endpoint");
  const headerNames = Object.keys(
    parseMatrixHeaders(JSON.stringify(options.sharedHeaders ?? {})),
  );
  const override = options.serverOverride ?? "";
  if (override.length > 2048) throw new MatrixError("source");
  if (override || (options.mode === "live" && headerNames.length)) {
    try {
      const url = new URL(override);
      if (
        !/^https?:$/.test(url.protocol) ||
        /\{\{|[\r\n]/.test(override) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      throw new MatrixError(headerNames.length ? "headers" : "source");
    }
  }
  const prepared = rows.map((row) => {
    try {
      return {
        row,
        scenario: compiledCase(
          project,
          row,
          endpoints,
          options.serverOverride ?? "",
          headerNames,
        ),
      };
    } catch (error) {
      if (error instanceof MatrixError) error.caseKey = row.key;
      throw error;
    }
  });
  if (options.mode !== "live") {
    for (const p of prepared) {
      if (
        p.scenario.steps.some(
          (step) =>
            !endpoints
              .find(
                (e) =>
                  e.method.toUpperCase() === step.method &&
                  e.path === step.path,
              )!
              .responses.some((r) => r.status === step.mockStatus),
        )
      ) {
        const error = new MatrixError("binding");
        error.caseKey = p.row.key;
        throw error;
      }
    }
  }
  return { project, prepared };
}
export type MatrixProgress = {
  total: number;
  completed: number;
  active: number;
  results: MatrixCaseResult[];
};
export async function runTestMatrix(
  projectInput: MatrixProject,
  endpoints: EndpointSummary[],
  options: {
    mode: "mock" | "live";
    signal: AbortSignal;
    caseKeys?: string[];
    serverOverride?: string;
    sharedHeaders?: Record<string, string>;
    allowWrites?: boolean;
    transport?: ScenarioTransport;
    onProgress?: (progress: MatrixProgress) => void;
  },
): Promise<MatrixReport> {
  if (options.mode !== "mock" && options.mode !== "live")
    throw new MatrixError("project");
  const { project, prepared } = previewMatrixRun(
    projectInput,
    endpoints,
    options,
  );
  if (
    options.mode === "live" &&
    options.allowWrites !== true &&
    project.scenario.steps.some(
      (s) => !["GET", "HEAD", "OPTIONS"].includes(s.method),
    )
  )
    throw new MatrixError("writes");
  const headers = parseMatrixHeaders(
    JSON.stringify(options.sharedHeaders ?? {}),
  );
  const controller = new AbortController();
  let stopReason: MatrixReport["stopReason"],
    stopped = false,
    next = 0,
    active = 0;
  const completed = new Map<string, MatrixCaseResult>();
  const ordered = () =>
    prepared.flatMap((p) =>
      completed.has(p.row.key) ? [completed.get(p.row.key)!] : [],
    );
  const progress = () => {
    try {
      options.onProgress?.({
        total: prepared.length,
        completed: completed.size,
        active,
        results: ordered(),
      });
    } catch {
      /* Observers do not change execution. */
    }
  };
  const cancel = () => {
    stopReason = "cancelled";
    controller.abort();
  };
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(() => {
    stopReason = "budget";
    controller.abort();
  }, project.maxRunMs);
  async function worker() {
    while (next < prepared.length && !controller.signal.aborted && !stopped) {
      const { row, scenario } = prepared[next++];
      active++;
      progress();
      const checks = new Map<string, MatrixStepResult["assertions"]>();
      try {
        const report = await runApiScenario(scenario, endpoints, row.values, {
          mode: options.mode,
          signal: controller.signal,
          allowInvalidInputs: project.allowInvalidInputs,
          transport: async (request, signal) => {
            const names = new Set(
              Object.keys(headers).map((name) => name.toLowerCase()),
            );
            const parameters = [
              ...request.requestParameters.filter(
                (p) =>
                  p.location !== "header" || !names.has(p.name.toLowerCase()),
              ),
              ...Object.entries(headers).map(([name, value]) => ({
                location: "header" as const,
                name,
                value,
              })),
            ];
            return (options.transport ?? executeScenarioLive)(
              { ...request, requestParameters: parameters },
              signal,
            );
          },
          onResponse: (step, response, variables) => {
            const rules =
              project.bindings.find((b) => b.stepId === step.id)?.assertions ??
              [];
            let rendered: ResponseAssertion[];
            try {
              rendered = rules.map((rule) => renderAssertion(rule, variables));
            } catch {
              checks.set(
                step.id,
                rules.map((rule) => ({
                  name: rule.name,
                  target: rule.target,
                  path: rule.path,
                  outcome: "error",
                  issue: "missing",
                })),
              );
              throw new ScenarioError("assertion-failed");
            }
            const results = evaluateResponseAssertions(rendered, {
              ...response,
              source: options.mode,
            });
            checks.set(
              step.id,
              results.map((result, i) => ({
                name: rules[i].name,
                target: rules[i].target,
                path: rules[i].path,
                ...result,
              })),
            );
            if (results.some((r) => r.outcome !== "pass"))
              throw new ScenarioError("assertion-failed");
          },
        });
        const steps: MatrixStepResult[] = report.results.map((step) => {
          const assertions = checks.get(step.id) ?? [];
          return {
            ...step,
            outcome:
              step.issue === "assertion-failed" &&
              assertions.some((a) => a.outcome === "error")
                ? "error"
                : step.outcome,
            assertions,
          };
        });
        const outcome: MatrixCaseOutcome =
          report.outcome === "cancelled"
            ? "cancelled"
            : steps.some((s) => s.outcome === "error")
              ? "error"
              : report.outcome === "passed"
                ? "passed"
                : "failed";
        completed.set(row.key, {
          key: row.key,
          name: row.name,
          outcome,
          steps,
          durationMs: steps.reduce(
            (n, s) =>
              n +
              (typeof s.durationMs === "number" &&
              Number.isFinite(s.durationMs) &&
              s.durationMs >= 0
                ? s.durationMs
                : 0),
            0,
          ),
        });
        if (project.stopOnCaseFailure && outcome !== "passed") {
          stopped = true;
          stopReason ??= "failure";
        }
      } catch {
        completed.set(row.key, {
          key: row.key,
          name: row.name,
          outcome: controller.signal.aborted ? "cancelled" : "error",
          steps: [],
          durationMs: 0,
        });
        if (project.stopOnCaseFailure) {
          stopped = true;
          stopReason ??= "failure";
        }
      } finally {
        active--;
        progress();
      }
    }
  }
  try {
    progress();
    await Promise.all(
      Array.from(
        { length: Math.min(project.concurrency, prepared.length) },
        worker,
      ),
    );
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", cancel);
  }
  for (const { row } of prepared)
    if (!completed.has(row.key))
      completed.set(row.key, {
        key: row.key,
        name: row.name,
        outcome: "skipped",
        reason: controller.signal.aborted ? "cancelled" : "stopped",
        steps: [],
        durationMs: 0,
      });
  const results = ordered(),
    counts: MatrixReport["counts"] = {
      passed: 0,
      failed: 0,
      error: 0,
      cancelled: 0,
      skipped: 0,
    };
  for (const row of results) counts[row.outcome]++;
  progress();
  return {
    kind: "rsswag-api-test-matrix-report",
    version: 1,
    name: project.name,
    mode: options.mode,
    outcome: controller.signal.aborted
      ? "cancelled"
      : results.every((r) => r.outcome === "passed")
        ? "passed"
        : "failed",
    ...(stopReason ? { stopReason } : {}),
    counts,
    results,
  };
}
export function serializeMatrixReport(report: MatrixReport) {
  const text = JSON.stringify(report, null, 2) + "\n";
  if (getByteSize(text) > MAX_MATRIX_BYTES) throw new MatrixError("limit");
  return text;
}
export function matrixJUnitReport(report: MatrixReport) {
  const xml = (value: string) =>
    value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
      .replace(
        /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
        "",
      )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const tests = report.results.flatMap<{
    row: MatrixCaseResult;
    step: MatrixStepResult | null;
  }>((row) =>
    row.steps.length
      ? row.steps.map((step) => ({ row, step }))
      : [{ row, step: null }],
  );
  const outcome = (entry: (typeof tests)[number]) =>
    entry.step?.outcome ?? entry.row.outcome;
  const failed = tests.filter((e) => outcome(e) === "failed").length,
    errors = tests.filter((e) => outcome(e) === "error").length,
    skipped = tests.filter((e) =>
      ["skipped", "cancelled"].includes(outcome(e)),
    ).length;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${xml(report.name)}" tests="${tests.length}" failures="${failed}" errors="${errors}" skipped="${skipped}">`,
  ];
  for (const entry of tests) {
    const { row, step } = entry,
      seconds = Math.max(0, step?.durationMs ?? 0) / 1000;
    lines.push(
      `  <testcase classname="${xml(row.name)}" name="${xml(step ? `${step.method} ${step.path} (${step.id})` : row.key)}" time="${seconds.toFixed(3)}">`,
    );
    const status = outcome(entry),
      issue = step?.issue ?? row.reason ?? status;
    if (status === "failed" || status === "error")
      lines.push(
        `    <${status === "error" ? "error" : "failure"} message="${xml(issue)}"/>`,
      );
    if (status === "skipped" || status === "cancelled")
      lines.push(`    <skipped message="${xml(issue)}"/>`);
    lines.push("  </testcase>");
  }
  lines.push("</testsuite>", "");
  const text = lines.join("\n");
  if (getByteSize(text) > MAX_MATRIX_BYTES) throw new MatrixError("limit");
  return text;
}
