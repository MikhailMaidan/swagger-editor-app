import type { CurlParameter, EndpointSummary } from "./openapi";
import { isJsonMediaType } from "./request-body";
import { indexResponseJson, type JsonValue } from "./response-data-explorer";
import { createResponseContractReport } from "./response-contract";
import { createSchemaMockResponse } from "./request-mock";
import {
  hasUnresolvedPathParameters,
  resolvePathParameters,
} from "./request-url";
import { getByteSize } from "./text-encoding";

export const MAX_SCENARIO_STEPS = 20;
export const MAX_SCENARIO_BYTES = 2 * 1024 * 1024;
export type ScenarioValue = string | number | boolean | null;
export type ScenarioVariables = Record<string, ScenarioValue>;
export type ScenarioStep = {
  id: string;
  name: string;
  method: string;
  path: string;
  serverUrl: string;
  parameters: CurlParameter[];
  body: string;
  contentType: string;
  expectedStatus: string;
  maxDurationMs: number;
  timeoutMs: number;
  checkContract: boolean;
  mockStatus: string;
  extracts: { name: string; pointer: string }[];
};
export type ApiScenario = {
  name: string;
  variableNames: string[];
  stopOnFailure: boolean;
  steps: ScenarioStep[];
};
export type ScenarioIssue =
  | "invalid-plan"
  | "limit"
  | "invalid-variables"
  | "missing-variable"
  | "missing-endpoint"
  | "invalid-body"
  | "missing-parameter"
  | "invalid-server"
  | "network"
  | "invalid-response"
  | "response-limit"
  | "timeout"
  | "status-mismatch"
  | "duration-exceeded"
  | "contract-failed"
  | "extraction-failed"
  | "cancelled"
  | "stopped";
export class ScenarioError extends Error {
  constructor(public code: ScenarioIssue) {
    super(code);
  }
}
export type ScenarioResponse = {
  body: string;
  headers: Record<string, string>;
  status: string;
  durationMs: number;
};
export type ScenarioRequest = {
  method: string;
  path: string;
  serverUrl: string;
  requestParameters: CurlParameter[];
  requestBody: string;
  contentType: string;
  timeoutMs: number;
};
export type ScenarioStepResult = {
  id: string;
  method: string;
  path: string;
  outcome: "passed" | "failed" | "error" | "cancelled" | "skipped";
  issue?: ScenarioIssue;
  status: string | null;
  durationMs: number | null;
  extracted: string[];
  contract: "passed" | "failed" | "partial" | null;
};
export type ScenarioReport = {
  mode: "mock" | "live";
  outcome: "passed" | "failed" | "cancelled";
  results: ScenarioStepResult[];
};
export type ScenarioTransport = (
  request: ScenarioRequest,
  signal: AbortSignal,
) => Promise<ScenarioResponse>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit;
export const validScenarioVariable = (value: string) =>
  /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value);
const scalar = (value: unknown): value is ScenarioValue =>
  value === null ||
  typeof value === "boolean" ||
  (typeof value === "string" && value.length <= 8192) ||
  (typeof value === "number" &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value)));

export function validScenarioStatus(value: string) {
  return (
    value.length <= 120 &&
    value
      .split(",")
      .every((part) => /^(?:[1-5]\d{2}|[1-5]xx|any)$/i.test(part.trim()))
  );
}
export function parseScenarioVariables(value: string): ScenarioVariables {
  if (getByteSize(value) > 128 * 1024)
    throw new ScenarioError("invalid-variables");
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    throw new ScenarioError("invalid-variables");
  }
  if (
    !record(data) ||
    Object.keys(data).length > 64 ||
    Object.entries(data).some(
      ([key, entry]) => !validScenarioVariable(key) || !scalar(entry),
    )
  )
    throw new ScenarioError("invalid-variables");
  return Object.fromEntries(Object.entries(data)) as ScenarioVariables;
}

export function validateScenario(value: unknown): value is ApiScenario {
  if (
    !record(value) ||
    !text(value.name, 120) ||
    !value.name.trim() ||
    typeof value.stopOnFailure !== "boolean" ||
    !Array.isArray(value.variableNames) ||
    value.variableNames.length > 64 ||
    !value.variableNames.every(
      (name) => typeof name === "string" && validScenarioVariable(name),
    ) ||
    !Array.isArray(value.steps) ||
    value.steps.length > MAX_SCENARIO_STEPS
  )
    return false;
  const ids = new Set<string>();
  return value.steps.every((step: unknown) => {
    if (
      !record(step) ||
      !text(step.id, 160) ||
      !step.id ||
      ids.has(step.id) ||
      !text(step.name, 120) ||
      !text(step.method, 10) ||
      !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(step.method) ||
      !text(step.path, 4096) ||
      !step.path.startsWith("/") ||
      !text(step.serverUrl, 2048) ||
      !text(step.body, 65536) ||
      !text(step.contentType, 256) ||
      !text(step.expectedStatus, 120) ||
      !validScenarioStatus(step.expectedStatus) ||
      !text(step.mockStatus, 16) ||
      typeof step.checkContract !== "boolean" ||
      !Number.isInteger(step.timeoutMs) ||
      Number(step.timeoutMs) < 1000 ||
      Number(step.timeoutMs) > 30000 ||
      !Number.isInteger(step.maxDurationMs) ||
      Number(step.maxDurationMs) < 0 ||
      Number(step.maxDurationMs) > 60000 ||
      !Array.isArray(step.parameters) ||
      step.parameters.length > 64 ||
      !step.parameters.every(
        (parameter: unknown) =>
          record(parameter) &&
          ["path", "query", "header", "cookie"].includes(
            String(parameter.location),
          ) &&
          text(parameter.name, 256) &&
          Boolean(parameter.name) &&
          text(parameter.value, 8192),
      ) ||
      !Array.isArray(step.extracts) ||
      step.extracts.length > 10 ||
      !step.extracts.every(
        (entry: unknown) =>
          record(entry) &&
          typeof entry.name === "string" &&
          validScenarioVariable(entry.name) &&
          text(entry.pointer, 512) &&
          (entry.pointer === "" ||
            (entry.pointer.startsWith("/") &&
              !/~(?![01])/.test(entry.pointer))),
      ) ||
      new Set(step.extracts.map((entry: { name: string }) => entry.name))
        .size !== step.extracts.length
    )
      return false;
    ids.add(step.id);
    return true;
  });
}

export function createScenarioStep(
  endpoint: EndpointSummary,
  id: string,
): ScenarioStep {
  const response = endpoint.responses[0];
  const body = endpoint.requestBodies[0];
  return {
    id,
    name: endpoint.summary.slice(0, 120),
    method: endpoint.method.toUpperCase(),
    path: endpoint.path,
    serverUrl: "",
    parameters: endpoint.parameters.map(({ location, name, example }) => ({
      location,
      name,
      value: example,
    })),
    body: body?.schema.example ?? "",
    contentType: body?.contentType ?? "application/json",
    expectedStatus:
      response?.status.toLowerCase() === "default"
        ? "any"
        : (response?.status ?? "2xx"),
    mockStatus: response?.status ?? "",
    maxDurationMs: 0,
    timeoutMs: 10000,
    checkContract: false,
    extracts: [],
  };
}

export function serializeScenario(plan: ApiScenario) {
  return (
    JSON.stringify(
      { kind: "rsswag-api-scenario", version: 1, scenario: plan },
      null,
      2,
    ) + "\n"
  );
}
export function parseScenario(input: string): ApiScenario {
  if (
    input.length > MAX_SCENARIO_BYTES ||
    getByteSize(input) > MAX_SCENARIO_BYTES
  )
    throw new ScenarioError("limit");
  let data: unknown;
  try {
    data = JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch {
    throw new ScenarioError("invalid-plan");
  }
  if (
    !record(data) ||
    data.kind !== "rsswag-api-scenario" ||
    data.version !== 1 ||
    !validateScenario(data.scenario)
  )
    throw new ScenarioError("invalid-plan");
  // Keep only the public definition fields, never imported result or secret payloads.
  const { name, variableNames, stopOnFailure, steps } = data.scenario;
  return {
    name,
    variableNames: [...new Set(variableNames)],
    stopOnFailure,
    steps: steps.map((step) => ({
      id: step.id,
      name: step.name,
      method: step.method,
      path: step.path,
      serverUrl: step.serverUrl,
      parameters: step.parameters.map(({ location, name, value }) => ({
        location,
        name,
        value,
      })),
      body: step.body,
      contentType: step.contentType,
      expectedStatus: step.expectedStatus,
      maxDurationMs: step.maxDurationMs,
      timeoutMs: step.timeoutMs,
      checkContract: step.checkContract,
      mockStatus: step.mockStatus,
      extracts: step.extracts.map(({ name, pointer }) => ({ name, pointer })),
    })),
  };
}

function variable(
  variables: Map<string, ScenarioValue>,
  name: string,
): ScenarioValue {
  if (!variables.has(name)) throw new ScenarioError("missing-variable");
  return variables.get(name)!;
}
export function expandScenarioText(
  value: string,
  variables: Map<string, ScenarioValue>,
): string {
  let length = value.length;
  return value.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, name: string) => {
      const replacement = String(variable(variables, name));
      length += replacement.length - match.length;
      if (length > 65536) throw new ScenarioError("limit");
      return replacement;
    },
  );
}
function expandBody(
  body: string,
  contentType: string,
  variables: Map<string, ScenarioValue>,
) {
  if (!body.trim()) return "";
  if (!isJsonMediaType(contentType)) return expandScenarioText(body, variables);
  const index = indexResponseJson(body);
  if (!index.ok) throw new ScenarioError("invalid-body");
  let budget = 65536;
  function expand(value: JsonValue): JsonValue {
    if (typeof value === "string") {
      const exact = value.match(/^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/);
      const result = exact
        ? variable(variables, exact[1])
        : expandScenarioText(value, variables);
      budget -= String(result).length;
      if (budget < 0) throw new ScenarioError("limit");
      return result;
    }
    if (Array.isArray(value)) return value.map(expand);
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, expand(child)]),
      );
    return value;
  }
  return JSON.stringify(expand(index.nodes.get("")!.value));
}

function prepareRequest(
  step: ScenarioStep,
  endpoint: EndpointSummary,
  variables: Map<string, ScenarioValue>,
): ScenarioRequest {
  const requestParameters = step.parameters.map((parameter) => ({
    ...parameter,
    value: expandScenarioText(parameter.value, variables),
  }));
  if (
    endpoint.parameters.some(
      (parameter) =>
        parameter.required &&
        !requestParameters.some(
          (entry) =>
            entry.location === parameter.location &&
            (parameter.location === "header"
              ? entry.name.toLowerCase() === parameter.name.toLowerCase()
              : entry.name === parameter.name) &&
            entry.value.trim(),
        ),
    ) ||
    hasUnresolvedPathParameters(
      resolvePathParameters(step.path, requestParameters),
    )
  )
    throw new ScenarioError("missing-parameter");
  const requestBody = expandBody(step.body, step.contentType, variables);
  if (
    endpoint.requestBodies.some((body) => body.required) &&
    !requestBody.trim()
  )
    throw new ScenarioError("invalid-body");
  const request = {
    method: step.method,
    path: step.path,
    serverUrl: expandScenarioText(
      step.serverUrl || endpoint.serverUrl,
      variables,
    ),
    requestParameters: requestParameters.filter((entry) => entry.value !== ""),
    requestBody,
    contentType: step.contentType,
    timeoutMs: step.timeoutMs,
  };
  if (getByteSize(JSON.stringify(request)) > 1024 * 1024)
    throw new ScenarioError("limit");
  return request;
}

export async function executeScenarioLive(
  request: ScenarioRequest,
  signal: AbortSignal,
): Promise<ScenarioResponse> {
  let response: Response;
  try {
    response = await fetch("/api/try-it-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, requireLive: true }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ScenarioError("network");
  }
  if (!response.ok)
    throw new ScenarioError(
      response.status === 400 ? "invalid-server" : "network",
    );
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ScenarioError("invalid-response");
  }
  if (
    !record(value) ||
    !text(value.body, 1024 * 1024) ||
    !text(value.status, 3) ||
    !/^([1-5]\d{2}|0)$/.test(value.status) ||
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    !record(value.headers) ||
    Object.values(value.headers).some((entry) => typeof entry !== "string")
  )
    throw new ScenarioError("invalid-response");
  if (value.status === "0")
    throw new ScenarioError(
      value.errorCode === "timeout" || value.errorCode === "response-limit"
        ? value.errorCode
        : "network",
    );
  if (getByteSize(value.body) > 1024 * 1024)
    throw new ScenarioError("response-limit");
  return {
    body: value.body,
    status: value.status,
    durationMs: value.durationMs,
    headers: value.headers as Record<string, string>,
  };
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new ScenarioError("cancelled"));
    if (signal.aborted) {
      pending.catch(() => {});
      aborted();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}

export async function runApiScenario(
  plan: ApiScenario,
  endpoints: EndpointSummary[],
  initial: ScenarioVariables,
  options: {
    mode: "mock" | "live";
    signal: AbortSignal;
    onProgress?: (results: ScenarioStepResult[]) => void;
    transport?: ScenarioTransport;
  },
): Promise<ScenarioReport> {
  if (!validateScenario(plan) || !plan.steps.length)
    throw new ScenarioError("invalid-plan");
  if (getByteSize(serializeScenario(plan)) > MAX_SCENARIO_BYTES)
    throw new ScenarioError("limit");
  parseScenarioVariables(JSON.stringify(initial));
  const operations = plan.steps.map((step) => {
    const matches = endpoints.filter(
      (endpoint) =>
        endpoint.method.toUpperCase() === step.method &&
        endpoint.path === step.path,
    );
    if (matches.length !== 1) throw new ScenarioError("missing-endpoint");
    return matches[0];
  });
  const variables = new Map(Object.entries(initial));
  const results: ScenarioStepResult[] = [];
  let stopped = false;
  let cancelled = false;
  for (let index = 0; index < plan.steps.length; index++) {
    const step = plan.steps[index];
    const endpoint = operations[index];
    const result: ScenarioStepResult = {
      id: step.id,
      method: step.method,
      path: step.path,
      outcome: "skipped",
      status: null,
      durationMs: null,
      extracted: [],
      contract: null,
    };
    if (options.signal.aborted || stopped) {
      cancelled ||= options.signal.aborted;
      result.issue = options.signal.aborted ? "cancelled" : "stopped";
      results.push(result);
      options.onProgress?.([...results]);
      continue;
    }
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    options.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, step.timeoutMs);
    try {
      const request = prepareRequest(step, endpoint, variables);
      const selected = endpoint.responses.find(
        (response) => response.status === step.mockStatus,
      );
      let response: ScenarioResponse;
      if (options.mode === "mock") {
        if (!selected) throw new ScenarioError("invalid-response");
        response = {
          ...createSchemaMockResponse(selected, "{}"),
          durationMs: 0,
        };
        // Yield so cancellation and progress stay interactive in offline runs.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      } else {
        response = await abortable(
          (options.transport ?? executeScenarioLive)(
            request,
            controller.signal,
          ),
          controller.signal,
        );
      }
      if (controller.signal.aborted)
        throw new ScenarioError(timedOut ? "timeout" : "cancelled");
      result.status = response.status;
      result.durationMs = response.durationMs;
      if (!/^[1-5]\d{2}$/.test(response.status))
        throw new ScenarioError("network");
      const matchesStatus = step.expectedStatus.split(",").some((part) => {
        const expected = part.trim().toLowerCase();
        return (
          expected === "any" ||
          expected === response.status ||
          (expected.endsWith("xx") && expected[0] === response.status[0])
        );
      });
      if (!matchesStatus) throw new ScenarioError("status-mismatch");
      if (step.maxDurationMs && response.durationMs > step.maxDurationMs)
        throw new ScenarioError("duration-exceeded");
      if (step.checkContract) {
        const report = createResponseContractReport(endpoint.responses, {
          ...response,
          method: step.method,
        });
        result.contract = report.failedCount
          ? "failed"
          : report.checks.some((check) => check.result === "skipped")
            ? "partial"
            : "passed";
        if (report.failedCount) throw new ScenarioError("contract-failed");
      }
      const extracted = new Map<string, ScenarioValue>();
      if (step.extracts.length) {
        const parsed = indexResponseJson(response.body);
        if (!parsed.ok) throw new ScenarioError("extraction-failed");
        for (const entry of step.extracts) {
          const node = parsed.nodes.get(entry.pointer);
          if (!node || !scalar(node.value))
            throw new ScenarioError("extraction-failed");
          extracted.set(entry.name, node.value);
        }
        if (new Set([...variables.keys(), ...extracted.keys()]).size > 64)
          throw new ScenarioError("limit");
      }
      for (const [name, value] of extracted) variables.set(name, value);
      result.extracted = [...extracted.keys()];
      result.outcome = "passed";
    } catch (error) {
      const issue = options.signal.aborted
        ? "cancelled"
        : timedOut
          ? "timeout"
          : error instanceof ScenarioError
            ? error.code
            : "network";
      result.issue = issue;
      result.outcome =
        issue === "cancelled"
          ? "cancelled"
          : [
                "status-mismatch",
                "duration-exceeded",
                "contract-failed",
                "extraction-failed",
              ].includes(issue)
            ? "failed"
            : "error";
      for (const entry of step.extracts) variables.delete(entry.name);
      cancelled ||= issue === "cancelled";
      stopped = plan.stopOnFailure || cancelled;
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
    }
    results.push(result);
    options.onProgress?.([...results]);
  }
  return {
    mode: options.mode,
    outcome: cancelled
      ? "cancelled"
      : results.every((result) => result.outcome === "passed")
        ? "passed"
        : "failed",
    results,
  };
}

export function serializeScenarioReport(report: ScenarioReport) {
  return (
    JSON.stringify(
      { kind: "rsswag-api-scenario-report", version: 1, ...report },
      null,
      2,
    ) + "\n"
  );
}
