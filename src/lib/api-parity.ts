import type { CurlParameter, EndpointSummary } from "./openapi";
import {
  executeScenarioLive,
  ScenarioError,
  type ScenarioRequest,
  type ScenarioResponse,
  type ScenarioTransport,
} from "./api-scenario";
import {
  compareResponses,
  isComparisonPointer,
  type ResponseComparison,
  type ResponseDifference,
} from "./response-comparison";
import { createResponseContractReport } from "./response-contract";
import { createSchemaMockResponse } from "./request-mock";
import {
  hasUnresolvedPathParameters,
  resolvePathParameters,
} from "./request-url";
import { isPublicHttpServerUrl } from "./server-url";
import { getByteSize } from "./text-encoding";

export const MAX_PARITY_CASES = 20;
export const MAX_PARITY_BYTES = 2 * 1024 * 1024;
export type ParityCase = {
  id: string;
  name: string;
  method: "GET" | "HEAD";
  path: string;
  parameters: CurlParameter[];
  baselineMockStatus: string;
  candidateMockStatus: string;
};
export type ParityPlan = {
  name: string;
  baselineUrl: string;
  candidateUrl: string;
  timeoutMs: number;
  maxSlowdownMs: number;
  checkContract: boolean;
  compareHeaders: boolean;
  stopOnFailure: boolean;
  ignoredBodyPaths: string[];
  ignoredHeaders: string[];
  cases: ParityCase[];
};
export type ParityIssue =
  | "invalid-plan"
  | "limit"
  | "headers"
  | "target"
  | "missing-endpoint"
  | "missing-parameter"
  | "mock-response"
  | "network"
  | "timeout"
  | "invalid-response"
  | "response-limit"
  | "cancelled"
  | "stopped";
export type ParitySide = "baseline" | "candidate";
export class ParityError extends Error {
  constructor(
    public code: ParityIssue,
    public caseIndex: number | null = null,
    public side: ParitySide | null = null,
  ) {
    super(code);
  }
}
export type ParityOutcome =
  "matched" | "different" | "inconclusive" | "error" | "cancelled" | "skipped";
export type ParityContract = {
  passed: number;
  failed: number;
  skipped: number;
};
export type ParityResponseInfo = {
  status: string;
  durationMs: number;
  bodyBytes: number;
  contract: ParityContract | null;
};
export type ParityResult = {
  id: string;
  method: "GET" | "HEAD";
  path: string;
  outcome: ParityOutcome;
  issue?: ParityIssue;
  side?: ParitySide;
  baseline: ParityResponseInfo | null;
  candidate: ParityResponseInfo | null;
  differences: Pick<ResponseDifference, "area" | "kind" | "path">[];
  bodyMode: ResponseComparison["bodyMode"] | null;
  limited: boolean;
  slowdown: boolean;
  durationDeltaMs: number | null;
};
export type ParityReport = {
  planName: string;
  startedAt: string;
  completedAt: string;
  mode: "mock" | "live";
  outcome: "matched" | "failed" | "cancelled";
  options: Pick<
    ParityPlan,
    | "checkContract"
    | "compareHeaders"
    | "maxSlowdownMs"
    | "ignoredBodyPaths"
    | "ignoredHeaders"
  >;
  results: ParityResult[];
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
const headerName = (value: string) =>
  /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(value) &&
  !/^(host|connection|content-length|transfer-encoding|upgrade)$/i.test(value);
// Fetch Headers accepts byte strings, not arbitrary Unicode. Validate both
// targets before a valid baseline can run ahead of an invalid candidate.
const headerValue = (value: string) =>
  !/[\u0000-\u001f\u007f\u0100-\uffff]/.test(value);
const parameterKey = (parameter: CurlParameter) =>
  `${parameter.location}:${parameter.location === "header" ? parameter.name.toLowerCase() : parameter.name}`;

export function createParityPlan(): ParityPlan {
  return {
    name: "Environment comparison",
    baselineUrl: "",
    candidateUrl: "",
    timeoutMs: 10000,
    maxSlowdownMs: 0,
    checkContract: true,
    compareHeaders: true,
    stopOnFailure: false,
    ignoredBodyPaths: [],
    ignoredHeaders: ["date", "x-request-id", "server-timing"],
    cases: [],
  };
}
export function createParityCase(
  endpoint: EndpointSummary,
  id: string,
): ParityCase {
  const method = endpoint.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD")
    throw new ParityError("invalid-plan");
  const status = endpoint.responses[0]?.status ?? "";
  return {
    id,
    name: endpoint.summary.slice(0, 120),
    method,
    path: endpoint.path,
    parameters: endpoint.parameters.map(({ location, name, example }) => ({
      location,
      name,
      value: example,
    })),
    baselineMockStatus: status,
    candidateMockStatus: status,
  };
}
export function validateParityPlan(value: unknown): value is ParityPlan {
  if (
    !record(value) ||
    !text(value.name, 120) ||
    !value.name.trim() ||
    !text(value.baselineUrl, 2048) ||
    !text(value.candidateUrl, 2048) ||
    !Number.isInteger(value.timeoutMs) ||
    Number(value.timeoutMs) < 1000 ||
    Number(value.timeoutMs) > 30000 ||
    !Number.isInteger(value.maxSlowdownMs) ||
    Number(value.maxSlowdownMs) < 0 ||
    Number(value.maxSlowdownMs) > 60000 ||
    typeof value.checkContract !== "boolean" ||
    typeof value.compareHeaders !== "boolean" ||
    typeof value.stopOnFailure !== "boolean" ||
    !Array.isArray(value.ignoredBodyPaths) ||
    value.ignoredBodyPaths.length > 64 ||
    !value.ignoredBodyPaths.every(
      (path) => text(path, 512) && isComparisonPointer(path),
    ) ||
    !Array.isArray(value.ignoredHeaders) ||
    value.ignoredHeaders.length > 64 ||
    !value.ignoredHeaders.every(
      (name) => text(name, 256) && /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name),
    ) ||
    !Array.isArray(value.cases) ||
    value.cases.length > MAX_PARITY_CASES
  )
    return false;
  const ids = new Set<string>();
  return value.cases.every((entry: unknown) => {
    if (
      !record(entry) ||
      !text(entry.id, 160) ||
      !entry.id ||
      ids.has(entry.id) ||
      !text(entry.name, 120) ||
      (entry.method !== "GET" && entry.method !== "HEAD") ||
      !text(entry.path, 4096) ||
      !entry.path.startsWith("/") ||
      /[?#\\\u0000-\u0020]/.test(entry.path) ||
      !text(entry.baselineMockStatus, 16) ||
      !text(entry.candidateMockStatus, 16) ||
      !Array.isArray(entry.parameters) ||
      entry.parameters.length > 64 ||
      !entry.parameters.every(
        (parameter: unknown) =>
          record(parameter) &&
          ["path", "query", "header", "cookie"].includes(
            String(parameter.location),
          ) &&
          text(parameter.name, 256) &&
          Boolean(parameter.name) &&
          text(parameter.value, 8192) &&
          (parameter.location !== "header" ||
            (headerName(parameter.name) && headerValue(parameter.value))),
      )
    )
      return false;
    const parameters = entry.parameters as CurlParameter[];
    // Repeated query keys are meaningful; other duplicate inputs are ambiguous.
    const unique = parameters
      .filter((parameter) => parameter.location !== "query")
      .map(parameterKey);
    if (new Set(unique).size !== unique.length) return false;
    ids.add(entry.id);
    return true;
  });
}

function definition(plan: ParityPlan): ParityPlan {
  return {
    name: plan.name,
    baselineUrl: plan.baselineUrl,
    candidateUrl: plan.candidateUrl,
    timeoutMs: plan.timeoutMs,
    maxSlowdownMs: plan.maxSlowdownMs,
    checkContract: plan.checkContract,
    compareHeaders: plan.compareHeaders,
    stopOnFailure: plan.stopOnFailure,
    ignoredBodyPaths: [...plan.ignoredBodyPaths],
    ignoredHeaders: [...plan.ignoredHeaders],
    cases: plan.cases.map((entry) => ({
      id: entry.id,
      name: entry.name,
      method: entry.method,
      path: entry.path,
      parameters: entry.parameters.map(({ location, name, value }) => ({
        location,
        name,
        value,
      })),
      baselineMockStatus: entry.baselineMockStatus,
      candidateMockStatus: entry.candidateMockStatus,
    })),
  };
}
export function serializeParityPlan(plan: ParityPlan) {
  if (!validateParityPlan(plan)) throw new ParityError("invalid-plan");
  const value =
    JSON.stringify(
      { kind: "rsswag-api-parity", version: 1, plan: definition(plan) },
      null,
      2,
    ) + "\n";
  if (getByteSize(value) > MAX_PARITY_BYTES) throw new ParityError("limit");
  return value;
}
export function parseParityPlan(input: string): ParityPlan {
  if (getByteSize(input) > MAX_PARITY_BYTES) throw new ParityError("limit");
  let value: unknown;
  try {
    value = JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch {
    throw new ParityError("invalid-plan");
  }
  if (
    !record(value) ||
    value.kind !== "rsswag-api-parity" ||
    value.version !== 1 ||
    !validateParityPlan(value.plan)
  )
    throw new ParityError("invalid-plan");
  return definition(value.plan);
}
export function parseParityHeaders(input: string): Record<string, string> {
  if (getByteSize(input) > 64 * 1024) throw new ParityError("headers");
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new ParityError("headers");
  }
  if (!record(value) || Object.keys(value).length > 64)
    throw new ParityError("headers");
  const names = new Set<string>();
  for (const [name, entry] of Object.entries(value)) {
    if (
      !text(name, 256) ||
      !headerName(name) ||
      !text(entry, 8192) ||
      !headerValue(entry) ||
      names.has(name.toLowerCase())
    )
      throw new ParityError("headers");
    names.add(name.toLowerCase());
  }
  return Object.fromEntries(Object.entries(value)) as Record<string, string>;
}
function validTarget(value: string) {
  if (!isPublicHttpServerUrl(value)) return false;
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    !/[\s\\]/.test(value)
  );
}
function parametersFor(
  entry: ParityCase,
  headers: Record<string, string>,
): CurlParameter[] {
  const overridden = new Set(
    Object.keys(headers).map((name) => name.toLowerCase()),
  );
  return [
    ...entry.parameters.filter(
      (parameter) =>
        parameter.value !== "" &&
        !(
          parameter.location === "header" &&
          overridden.has(parameter.name.toLowerCase())
        ),
    ),
    ...Object.entries(headers)
      .filter(([, value]) => value !== "")
      .map(([name, value]) => ({ location: "header" as const, name, value })),
  ];
}
function prepare(
  entry: ParityCase,
  endpoint: EndpointSummary,
  serverUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
): ScenarioRequest {
  const parameters = parametersFor(entry, headers);
  if (
    hasUnresolvedPathParameters(
      resolvePathParameters(entry.path, parameters),
    ) ||
    endpoint.parameters.some(
      (parameter) =>
        parameter.required &&
        !parameters.some(
          (provided) =>
            provided.location === parameter.location &&
            (parameter.location === "header"
              ? parameter.name.toLowerCase() === provided.name.toLowerCase()
              : parameter.name === provided.name) &&
            provided.value.trim(),
        ),
    )
  )
    throw new ParityError("missing-parameter");
  return {
    method: entry.method,
    path: entry.path,
    serverUrl,
    requestParameters: parameters,
    requestBody: "",
    contentType: "",
    timeoutMs,
  };
}
function validateResponse(value: ScenarioResponse): ScenarioResponse {
  if (
    !record(value) ||
    !text(value.status, 3) ||
    !/^[1-5]\d{2}$/.test(value.status) ||
    typeof value.body !== "string" ||
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    !record(value.headers) ||
    Object.keys(value.headers).length > 256 ||
    Object.values(value.headers).some((entry) => typeof entry !== "string")
  )
    throw new ParityError("invalid-response");
  if (
    getByteSize(value.body) > 1024 * 1024 ||
    getByteSize(JSON.stringify(value.headers)) > 128 * 1024
  )
    throw new ParityError("response-limit");
  return value;
}
async function requestWithDeadline(
  request: ScenarioRequest,
  transport: ScenarioTransport,
  signal: AbortSignal,
) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);
  try {
    if (signal.aborted) throw new ParityError("cancelled");
    return await new Promise<ScenarioResponse>((resolve, reject) => {
      const cancelled = () =>
        reject(new ParityError(timedOut ? "timeout" : "cancelled"));
      controller.signal.addEventListener("abort", cancelled, { once: true });
      // Promise wrapping catches synchronous adapters and consumes late rejections.
      Promise.resolve()
        .then(() => {
          if (controller.signal.aborted)
            throw new ParityError(timedOut ? "timeout" : "cancelled");
          return transport(request, controller.signal);
        })
        .then(resolve, reject)
        .finally(() =>
          controller.signal.removeEventListener("abort", cancelled),
        );
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
function responseInfo(
  response: ScenarioResponse,
  endpoint: EndpointSummary,
  check: boolean,
): ParityResponseInfo {
  const contract = check
    ? createResponseContractReport(endpoint.responses, {
        ...response,
        method: endpoint.method,
      })
    : null;
  return {
    status: response.status,
    durationMs: response.durationMs,
    bodyBytes: getByteSize(response.body),
    contract: contract
      ? {
          passed: contract.passedCount,
          failed: contract.failedCount,
          skipped: contract.checks.filter((entry) => entry.result === "skipped")
            .length,
        }
      : null,
  };
}
function issueFor(error: unknown): ParityIssue {
  if (error instanceof ParityError) return error.code;
  if (error instanceof ScenarioError) {
    if (error.code === "invalid-server") return "target";
    if (
      [
        "network",
        "timeout",
        "invalid-response",
        "response-limit",
        "cancelled",
      ].includes(error.code)
    )
      return error.code as ParityIssue;
  }
  return "network";
}
export async function runApiParity(
  input: ParityPlan,
  endpoints: EndpointSummary[],
  options: {
    mode: "mock" | "live";
    signal: AbortSignal;
    headers?: {
      baseline: Record<string, string>;
      candidate: Record<string, string>;
    };
    transport?: ScenarioTransport;
    onProgress?: (
      results: ParityResult[],
      active: { caseIndex: number; side: ParitySide } | null,
    ) => void;
  },
): Promise<ParityReport> {
  const startedAt = new Date().toISOString();
  const plan = parseParityPlan(serializeParityPlan(input));
  if (
    !plan.cases.length ||
    (options.mode !== "mock" && options.mode !== "live")
  )
    throw new ParityError("invalid-plan");
  const headers = { baseline: {}, candidate: {} } as Record<
    ParitySide,
    Record<string, string>
  >;
  for (const side of ["baseline", "candidate"] as const) {
    try {
      // Mock runs need no session credentials and never inspect them.
      headers[side] =
        options.mode === "live"
          ? parseParityHeaders(JSON.stringify(options.headers?.[side] ?? {}))
          : {};
      if (options.mode === "live" && !validTarget(plan[`${side}Url`]))
        throw new ParityError("target");
    } catch (error) {
      if (error instanceof ParityError) error.side = side;
      throw error;
    }
  }
  // Preflight every case on both targets before the first request is sent.
  const prepared = plan.cases.map((entry, caseIndex) => {
    const matches = endpoints.filter(
      (endpoint) =>
        endpoint.method.toUpperCase() === entry.method &&
        endpoint.path === entry.path,
    );
    if (matches.length !== 1)
      throw new ParityError("missing-endpoint", caseIndex);
    // Keep contract checks stable even if the caller updates the source schema
    // while an asynchronous run is in progress.
    const endpoint: EndpointSummary = JSON.parse(JSON.stringify(matches[0]));
    const requests = {} as Record<ParitySide, ScenarioRequest>;
    for (const side of ["baseline", "candidate"] as const) {
      try {
        if (options.mode === "mock") {
          if (
            !endpoint.responses.some(
              (response) => response.status === entry[`${side}MockStatus`],
            )
          )
            throw new ParityError("mock-response");
          // Offline comparison checks response variants; it need not satisfy authentication.
          requests[side] = {
            method: entry.method,
            path: entry.path,
            serverUrl: "",
            requestParameters: [],
            requestBody: "",
            contentType: "",
            timeoutMs: plan.timeoutMs,
          };
        } else
          requests[side] = prepare(
            entry,
            endpoint,
            plan[`${side}Url`],
            headers[side],
            plan.timeoutMs,
          );
      } catch (error) {
        if (error instanceof ParityError) {
          error.caseIndex = caseIndex;
          error.side = side;
        }
        throw error;
      }
    }
    return { endpoint, requests };
  });
  const results: ParityResult[] = [];
  let stopped = false;
  for (const [index, entry] of plan.cases.entries()) {
    const result: ParityResult = {
      id: entry.id,
      method: entry.method,
      path: entry.path,
      outcome: "skipped",
      baseline: null,
      candidate: null,
      differences: [],
      bodyMode: null,
      limited: false,
      slowdown: false,
      durationDeltaMs: null,
    };
    if (options.signal.aborted || stopped) {
      result.issue = options.signal.aborted ? "cancelled" : "stopped";
      results.push(result);
      options.onProgress?.([...results], null);
      continue;
    }
    let side: ParitySide = "baseline";
    const { endpoint, requests } = prepared[index];
    try {
      const responses = {} as Record<ParitySide, ScenarioResponse>;
      for (side of ["baseline", "candidate"] as const) {
        options.onProgress?.([...results], { caseIndex: index, side });
        if (options.signal.aborted) throw new ParityError("cancelled");
        let response: ScenarioResponse;
        if (options.mode === "mock") {
          const selected = endpoint.responses.find(
            (response) => response.status === entry[`${side}MockStatus`],
          )!;
          const mock = createSchemaMockResponse(selected, "");
          response = {
            ...mock,
            body:
              entry.method === "HEAD" || /^(204|304)$/.test(mock.status)
                ? ""
                : mock.body,
            durationMs: 0,
          };
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        } else
          response = await requestWithDeadline(
            requests[side],
            options.transport ?? executeScenarioLive,
            options.signal,
          );
        if (options.signal.aborted) throw new ParityError("cancelled");
        responses[side] = validateResponse(response);
        result[side] = responseInfo(response, endpoint, plan.checkContract);
      }
      const comparison = compareResponses(
        {
          ...responses.baseline,
          headers: plan.compareHeaders ? responses.baseline.headers : {},
          source: options.mode,
        },
        {
          ...responses.candidate,
          headers: plan.compareHeaders ? responses.candidate.headers : {},
          source: options.mode,
        },
        {
          ignoredBodyPaths: plan.ignoredBodyPaths,
          ignoredHeaders: plan.ignoredHeaders,
        },
      );
      // Retain only locations and kinds; raw response and header values never
      // enter the panel state or portable report.
      result.differences = comparison.differences
        .filter((difference) => difference.path.length <= 2048)
        .map(({ area, kind, path }) => ({ area, kind, path }));
      result.bodyMode = comparison.bodyMode;
      result.limited =
        comparison.limited ||
        result.differences.length !== comparison.differences.length;
      result.durationDeltaMs = comparison.durationDeltaMs;
      result.slowdown =
        plan.maxSlowdownMs > 0 &&
        (comparison.durationDeltaMs ?? 0) > plan.maxSlowdownMs;
      result.outcome =
        comparison.differences.length ||
        result.slowdown ||
        result.baseline?.contract?.failed ||
        result.candidate?.contract?.failed
          ? "different"
          : result.limited
            ? "inconclusive"
            : "matched";
    } catch (error) {
      result.issue = options.signal.aborted ? "cancelled" : issueFor(error);
      result.side = side;
      result.outcome = result.issue === "cancelled" ? "cancelled" : "error";
    }
    stopped = plan.stopOnFailure && result.outcome !== "matched";
    results.push(result);
    options.onProgress?.([...results], null);
  }
  return {
    planName: plan.name,
    startedAt,
    completedAt: new Date().toISOString(),
    mode: options.mode,
    outcome:
      options.signal.aborted ||
      results.some((entry) => entry.outcome === "cancelled")
        ? "cancelled"
        : results.every((entry) => entry.outcome === "matched")
          ? "matched"
          : "failed",
    options: {
      checkContract: plan.checkContract,
      compareHeaders: plan.compareHeaders,
      maxSlowdownMs: plan.maxSlowdownMs,
      ignoredBodyPaths: [...plan.ignoredBodyPaths],
      ignoredHeaders: [...plan.ignoredHeaders],
    },
    results,
  };
}
export function serializeParityReport(report: ParityReport) {
  const info = (value: ParityResponseInfo | null) =>
    value
      ? {
          status: value.status,
          durationMs: value.durationMs,
          bodyBytes: value.bodyBytes,
          contract: value.contract
            ? {
                passed: value.contract.passed,
                failed: value.contract.failed,
                skipped: value.contract.skipped,
              }
            : null,
        }
      : null;
  return (
    JSON.stringify(
      {
        kind: "rsswag-api-parity-report",
        version: 1,
        planName: report.planName,
        startedAt: report.startedAt,
        completedAt: report.completedAt,
        mode: report.mode,
        outcome: report.outcome,
        options: {
          checkContract: report.options.checkContract,
          compareHeaders: report.options.compareHeaders,
          maxSlowdownMs: report.options.maxSlowdownMs,
          ignoredBodyPaths: report.options.ignoredBodyPaths,
          ignoredHeaders: report.options.ignoredHeaders,
        },
        results: report.results.map((entry) => ({
          id: entry.id,
          method: entry.method,
          path: entry.path,
          outcome: entry.outcome,
          issue: entry.issue,
          side: entry.side,
          baseline: info(entry.baseline),
          candidate: info(entry.candidate),
          differences: entry.differences.map(({ area, kind, path }) => ({
            area,
            kind,
            path,
          })),
          bodyMode: entry.bodyMode,
          limited: entry.limited,
          slowdown: entry.slowdown,
          durationDeltaMs: entry.durationDeltaMs,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}
