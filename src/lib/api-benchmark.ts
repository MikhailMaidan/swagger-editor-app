import type { CurlParameter, EndpointSummary } from "./openapi";
import {
  createParityCase,
  createParityPlan,
  parseParityHeaders,
  validateParityPlan,
} from "./api-parity";
import {
  executeScenarioLive,
  ScenarioError,
  validScenarioStatus,
  type ScenarioRequest,
  type ScenarioResponse,
  type ScenarioTransport,
} from "./api-scenario";
import { createSchemaMockResponse } from "./request-mock";
import {
  hasUnresolvedPathParameters,
  resolvePathParameters,
} from "./request-url";
import { isPublicHttpServerUrl } from "./server-url";
import { getByteSize } from "./text-encoding";
import {
  createExplorerTable,
  exportExplorerCsv,
} from "./response-data-explorer";

export const MAX_BENCHMARK_BYTES = 2 * 1024 * 1024;
export const MAX_BENCHMARK_CASES = 10;
export const MAX_BENCHMARK_REQUESTS = 200;
export type BenchmarkCase = {
  id: string;
  name: string;
  method: "GET" | "HEAD";
  path: string;
  parameters: CurlParameter[];
  weight: number;
  expectedStatus: string;
  mockStatus: string;
  mockLatencyMs: number;
};
export type BenchmarkSettings = {
  requests: number;
  warmup: number;
  concurrency: number;
  ratePerSecond: number;
  timeoutMs: number;
  maxRunMs: number;
  stopAfterErrors: number;
  maxP95Ms: number;
  maxErrorPercent: number;
  minThroughput: number;
};
export type BenchmarkPlan = BenchmarkSettings & {
  name: string;
  targetUrl: string;
  cases: BenchmarkCase[];
};
export type BenchmarkCaseInfo = Omit<BenchmarkCase, "parameters">;
export type BenchmarkErrorCode =
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
  | "invalid-report";
export class BenchmarkError extends Error {
  constructor(
    public code: BenchmarkErrorCode,
    public caseIndex: number | null = null,
  ) {
    super(code);
  }
}
export type BenchmarkSample = {
  sequence: number;
  phase: "warmup" | "measured";
  caseId: string;
  method: "GET" | "HEAD";
  path: string;
  offsetMs: number;
  durationMs: number;
  proxyDurationMs: number | null;
  status: string | null;
  bodyBytes: number | null;
  outcome: "success" | "failed" | "error" | "cancelled";
  error:
    | "network"
    | "timeout"
    | "invalid-response"
    | "response-limit"
    | "target"
    | "cancelled"
    | null;
};
export type BenchmarkReport = {
  planName: string;
  mode: "mock" | "live";
  startedAt: string;
  completedAt: string;
  stopReason: "completed" | "cancelled" | "time-limit" | "error-limit";
  elapsedMs: number;
  measurementMs: number;
  peakConcurrency: number;
  settings: BenchmarkSettings;
  cases: BenchmarkCaseInfo[];
  samples: BenchmarkSample[];
};
export type BenchmarkMetrics = {
  started: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  errorPercent: number | null;
  throughput: number | null;
  minMs: number | null;
  meanMs: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
};
export type BenchmarkProgress = {
  phase: "warmup" | "measured";
  active: number;
  started: number;
  total: number;
  samples: BenchmarkSample[];
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const integer = (value: unknown, min: number, max: number) =>
  finite(value, min, max) && Number.isInteger(value);
const rounded = (value: number) => Math.round(value * 1000) / 1000;
const settingsKeys = [
  "requests",
  "warmup",
  "concurrency",
  "ratePerSecond",
  "timeoutMs",
  "maxRunMs",
  "stopAfterErrors",
  "maxP95Ms",
  "maxErrorPercent",
  "minThroughput",
] as const;
function settingsOnly(value: BenchmarkSettings): BenchmarkSettings {
  return Object.fromEntries(
    settingsKeys.map((key) => [key, value[key]]),
  ) as BenchmarkSettings;
}
function validSettings(
  value: unknown,
): value is BenchmarkSettings & Record<string, unknown> {
  return (
    record(value) &&
    integer(value.requests, 1, 200) &&
    integer(value.warmup, 0, 20) &&
    Number(value.requests) + Number(value.warmup) <= MAX_BENCHMARK_REQUESTS &&
    integer(value.concurrency, 1, 5) &&
    integer(value.ratePerSecond, 1, 10) &&
    integer(value.timeoutMs, 1000, 30000) &&
    integer(value.maxRunMs, 1000, 120000) &&
    integer(value.stopAfterErrors, 0, 200) &&
    finite(value.maxP95Ms, 0, 60000) &&
    finite(value.maxErrorPercent, 0, 100) &&
    finite(value.minThroughput, 0, 1000)
  );
}
export function createBenchmarkPlan(): BenchmarkPlan {
  return {
    name: "API benchmark",
    targetUrl: "",
    requests: 20,
    warmup: 2,
    concurrency: 2,
    ratePerSecond: 5,
    timeoutMs: 10000,
    maxRunMs: 60000,
    stopAfterErrors: 0,
    maxP95Ms: 1000,
    maxErrorPercent: 0,
    minThroughput: 0,
    cases: [],
  };
}
export function createBenchmarkCase(
  endpoint: EndpointSummary,
  id: string,
): BenchmarkCase {
  try {
    const entry = createParityCase(endpoint, id);
    return {
      id: entry.id,
      name: entry.name,
      method: entry.method,
      path: entry.path,
      parameters: entry.parameters,
      weight: 1,
      expectedStatus: "2xx",
      mockStatus: entry.baselineMockStatus,
      mockLatencyMs: 50,
    };
  } catch {
    throw new BenchmarkError("invalid-plan");
  }
}
export function validateBenchmarkPlan(value: unknown): value is BenchmarkPlan {
  if (
    !record(value) ||
    !validSettings(value) ||
    !text(value.name, 120) ||
    !value.name.trim() ||
    !text(value.targetUrl, 2048) ||
    !Array.isArray(value.cases) ||
    value.cases.length > MAX_BENCHMARK_CASES
  )
    return false;
  if (
    !value.cases.every(
      (entry) =>
        record(entry) &&
        integer(entry.weight, 1, 10) &&
        text(entry.expectedStatus, 120) &&
        validScenarioStatus(entry.expectedStatus) &&
        text(entry.mockStatus, 16) &&
        integer(entry.mockLatencyMs, 0, 5000) &&
        Array.isArray(entry.parameters) &&
        entry.parameters.every(
          (parameter) =>
            record(parameter) && typeof parameter.location === "string",
        ),
    )
  )
    return false;
  // Share the existing request-input validation, including repeated query keys,
  // case-insensitive header duplicates, and forbidden transport headers.
  return validateParityPlan({
    ...createParityPlan(),
    name: value.name,
    timeoutMs: value.timeoutMs,
    cases: value.cases.map((entry) => ({
      ...entry,
      baselineMockStatus: entry.mockStatus,
      candidateMockStatus: entry.mockStatus,
    })),
  });
}
function caseInfo(entry: BenchmarkCaseInfo): BenchmarkCaseInfo {
  return {
    id: entry.id,
    name: entry.name,
    method: entry.method,
    path: entry.path,
    weight: entry.weight,
    expectedStatus: entry.expectedStatus,
    mockStatus: entry.mockStatus,
    mockLatencyMs: entry.mockLatencyMs,
  };
}
function definition(plan: BenchmarkPlan): BenchmarkPlan {
  return {
    ...settingsOnly(plan),
    name: plan.name,
    targetUrl: plan.targetUrl,
    cases: plan.cases.map((entry) => ({
      ...caseInfo(entry),
      parameters: entry.parameters.map(({ name, location, value }) => ({
        name,
        location,
        value,
      })),
    })),
  };
}
function jsonExport(value: unknown) {
  const output = JSON.stringify(value, null, 2) + "\n";
  if (getByteSize(output) > MAX_BENCHMARK_BYTES)
    throw new BenchmarkError("limit");
  return output;
}
function parseInput(
  input: string,
  code: "invalid-plan" | "invalid-report",
): unknown {
  if (getByteSize(input) > MAX_BENCHMARK_BYTES)
    throw new BenchmarkError("limit");
  try {
    return JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch {
    throw new BenchmarkError(code);
  }
}
export function serializeBenchmarkPlan(plan: BenchmarkPlan) {
  if (!validateBenchmarkPlan(plan)) throw new BenchmarkError("invalid-plan");
  return jsonExport({
    kind: "rsswag-api-benchmark",
    version: 1,
    plan: definition(plan),
  });
}
export function parseBenchmarkPlan(input: string): BenchmarkPlan {
  const value = parseInput(input, "invalid-plan");
  if (
    !record(value) ||
    value.kind !== "rsswag-api-benchmark" ||
    value.version !== 1 ||
    !validateBenchmarkPlan(value.plan)
  )
    throw new BenchmarkError("invalid-plan");
  return definition(value.plan);
}
export function parseBenchmarkHeaders(input: string) {
  try {
    return parseParityHeaders(input);
  } catch {
    throw new BenchmarkError("headers");
  }
}
export function matchesBenchmarkStatus(expected: string, status: string) {
  return expected.split(",").some((value) => {
    const rule = value.trim().toLowerCase();
    return (
      rule === "any" ||
      rule === status ||
      (rule.endsWith("xx") && rule[0] === status[0])
    );
  });
}
function validTarget(value: string) {
  if (!isPublicHttpServerUrl(value) || /[\s\\]/.test(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
}
function prepareRequest(
  entry: BenchmarkCase,
  endpoint: EndpointSummary,
  plan: BenchmarkPlan,
  headers: Record<string, string>,
): ScenarioRequest {
  const overridden = new Set(
    Object.keys(headers).map((name) => name.toLowerCase()),
  );
  const parameters: CurlParameter[] = [
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
    throw new BenchmarkError("missing-parameter");
  const request = {
    method: entry.method,
    path: entry.path,
    serverUrl: plan.targetUrl,
    requestParameters: parameters,
    requestBody: "",
    contentType: "",
    timeoutMs: plan.timeoutMs,
  };
  if (getByteSize(JSON.stringify(request)) > 1024 * 1024)
    throw new BenchmarkError("limit");
  return request;
}
function validateResponse(response: ScenarioResponse) {
  if (
    !record(response) ||
    !text(response.status, 3) ||
    !/^[1-5]\d{2}$/.test(response.status) ||
    typeof response.body !== "string" ||
    !finite(response.durationMs, 0, 1e9) ||
    !record(response.headers) ||
    Object.values(response.headers).some((value) => typeof value !== "string")
  )
    throw new BenchmarkError("invalid-response");
  if (
    getByteSize(response.body) > 1024 * 1024 ||
    Object.keys(response.headers).length > 256 ||
    getByteSize(JSON.stringify(response.headers)) > 128 * 1024
  )
    throw new BenchmarkError("response-limit");
  return response;
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new BenchmarkError("cancelled"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new BenchmarkError("cancelled"));
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      Math.max(0, ms),
    );
    signal.addEventListener("abort", abort, { once: true });
  });
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
  let rejectAbort: () => void = () => {};
  try {
    if (signal.aborted) throw new BenchmarkError("cancelled");
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted)
          throw new BenchmarkError(timedOut ? "timeout" : "cancelled");
        return transport(request, controller.signal);
      }),
      new Promise<never>((_, reject) => {
        rejectAbort = () =>
          reject(new BenchmarkError(timedOut ? "timeout" : "cancelled"));
        controller.signal.addEventListener("abort", rejectAbort, {
          once: true,
        });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
function sampleError(error: unknown): NonNullable<BenchmarkSample["error"]> {
  if (error instanceof ScenarioError && error.code === "invalid-server")
    return "target";
  if (
    (error instanceof BenchmarkError || error instanceof ScenarioError) &&
    [
      "network",
      "timeout",
      "invalid-response",
      "response-limit",
      "target",
      "cancelled",
    ].includes(error.code)
  )
    return error.code as NonNullable<BenchmarkSample["error"]>;
  return "network";
}
export async function runApiBenchmark(
  input: BenchmarkPlan,
  endpoints: EndpointSummary[],
  options: {
    mode: "mock" | "live";
    signal: AbortSignal;
    headers?: Record<string, string>;
    transport?: ScenarioTransport;
    onProgress?: (progress: BenchmarkProgress) => void;
    now?: () => number;
  },
): Promise<BenchmarkReport> {
  const plan = parseBenchmarkPlan(serializeBenchmarkPlan(input));
  if (!plan.cases.length || !["mock", "live"].includes(options.mode))
    throw new BenchmarkError("invalid-plan");
  if (options.mode === "live" && !validTarget(plan.targetUrl))
    throw new BenchmarkError("target");
  const headers =
    options.mode === "live"
      ? parseBenchmarkHeaders(JSON.stringify(options.headers ?? {}))
      : {};
  // Resolve and validate the entire workload before dispatching anything.
  const prepared = plan.cases.map((entry, index) => {
    try {
      const matches = endpoints.filter(
        (endpoint) =>
          endpoint.method.toUpperCase() === entry.method &&
          endpoint.path === entry.path,
      );
      if (matches.length !== 1) throw new BenchmarkError("missing-endpoint");
      const endpoint = matches[0];
      if (options.mode === "live")
        return {
          request: prepareRequest(entry, endpoint, plan, headers),
          mock: null,
        };
      const response = endpoint.responses.find(
        (response) => response.status === entry.mockStatus,
      );
      if (!response) throw new BenchmarkError("mock-response");
      const mock = createSchemaMockResponse(response, "");
      return {
        request: {
          method: entry.method,
          path: entry.path,
          serverUrl: "",
          requestParameters: [],
          requestBody: "",
          contentType: "",
          timeoutMs: plan.timeoutMs,
        },
        mock: {
          ...mock,
          body:
            entry.method === "HEAD" || /^(204|304)$/.test(mock.status)
              ? ""
              : mock.body,
          durationMs: entry.mockLatencyMs,
        },
      };
    } catch (error) {
      if (error instanceof BenchmarkError) error.caseIndex = index;
      throw error;
    }
  });
  const now = options.now ?? (() => performance.now());
  const startedAt = new Date().toISOString(),
    started = now();
  const controller = new AbortController();
  let stopReason: BenchmarkReport["stopReason"] = "completed";
  const stop = (reason: BenchmarkReport["stopReason"]) => {
    if (!controller.signal.aborted) {
      stopReason = reason;
      controller.abort();
    }
  };
  const cancel = () => stop("cancelled");
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) cancel();
  const deadline = setTimeout(() => stop("time-limit"), plan.maxRunMs);
  const samples: BenchmarkSample[] = [];
  const active = new Set<Promise<void>>();
  let phase: BenchmarkSample["phase"] = "warmup",
    sequence = 0,
    errors = 0,
    peakConcurrency = 0,
    nextAllowed = started;
  let measurementStart: number | null = null,
    measurementEnd: number | null = null;
  // Weighted round robin spreads cases across each cycle instead of exhausting
  // one case first. Each phase starts at the same point in this schedule.
  const schedule: number[] = [];
  for (let round = 0; round < 10; round++)
    plan.cases.forEach((entry, index) => {
      if (entry.weight > round) schedule.push(index);
    });
  const progress = () =>
    options.onProgress?.({
      phase,
      active: active.size,
      started: sequence,
      total: plan.requests + plan.warmup,
      samples: samples
        .map((sample) => ({ ...sample }))
        .sort((a, b) => a.sequence - b.sequence),
    });
  async function runOne(
    index: number,
    id: number,
    samplePhase: BenchmarkSample["phase"],
    at: number,
  ) {
    const entry = plan.cases[index],
      item = prepared[index];
    const sample: BenchmarkSample = {
      sequence: id,
      phase: samplePhase,
      caseId: entry.id,
      method: entry.method,
      path: entry.path,
      offsetMs: rounded(Math.max(0, at - started)),
      durationMs: 0,
      proxyDurationMs: null,
      status: null,
      bodyBytes: null,
      outcome: "error",
      error: null,
    };
    try {
      const transport: ScenarioTransport =
        options.mode === "mock"
          ? async (_, signal) => {
              await delay(entry.mockLatencyMs, signal);
              return item.mock!;
            }
          : (options.transport ?? executeScenarioLive);
      const response = validateResponse(
        await requestWithDeadline(item.request, transport, controller.signal),
      );
      if (now() - started >= plan.maxRunMs) stop("time-limit");
      if (controller.signal.aborted) throw new BenchmarkError("cancelled");
      sample.status = response.status;
      sample.proxyDurationMs =
        options.mode === "live" ? response.durationMs : null;
      sample.bodyBytes =
        entry.method === "HEAD" ? 0 : getByteSize(response.body);
      sample.outcome = matchesBenchmarkStatus(
        entry.expectedStatus,
        response.status,
      )
        ? "success"
        : "failed";
    } catch (error) {
      sample.error = controller.signal.aborted
        ? "cancelled"
        : sampleError(error);
      sample.outcome = sample.error === "cancelled" ? "cancelled" : "error";
    }
    sample.durationMs = rounded(Math.max(0, now() - at));
    samples.push(sample);
    if (
      samplePhase === "measured" &&
      (sample.outcome === "failed" || sample.outcome === "error")
    ) {
      errors++;
      if (plan.stopAfterErrors && errors >= plan.stopAfterErrors)
        stop("error-limit");
    }
  }
  async function runPhase(nextPhase: BenchmarkSample["phase"], count: number) {
    phase = nextPhase;
    progress();
    for (let index = 0; index < count && !controller.signal.aborted; index++) {
      while (active.size >= plan.concurrency && !controller.signal.aborted)
        await Promise.race(active);
      if (controller.signal.aborted) break;
      while (now() < nextAllowed && !controller.signal.aborted) {
        try {
          await delay(nextAllowed - now(), controller.signal);
        } catch {
          break;
        }
      }
      if (controller.signal.aborted) break;
      const at = now();
      // Check the clock as well as the timer: a busy tab may delay timer tasks.
      if (at - started >= plan.maxRunMs) {
        stop("time-limit");
        break;
      }
      nextAllowed = at + 1000 / plan.ratePerSecond;
      if (phase === "measured" && measurementStart === null)
        measurementStart = at;
      const pending = runOne(
        schedule[index % schedule.length],
        ++sequence,
        phase,
        at,
      ).finally(() => {
        active.delete(pending);
        progress();
      });
      active.add(pending);
      peakConcurrency = Math.max(peakConcurrency, active.size);
      progress();
    }
    await Promise.all(active);
    if (nextPhase === "measured" && measurementStart !== null)
      measurementEnd = now();
  }
  try {
    await runPhase("warmup", plan.warmup);
    if (!controller.signal.aborted) await runPhase("measured", plan.requests);
  } finally {
    clearTimeout(deadline);
    options.signal.removeEventListener("abort", cancel);
  }
  return {
    planName: plan.name,
    mode: options.mode,
    startedAt,
    completedAt: new Date().toISOString(),
    stopReason,
    elapsedMs: rounded(Math.max(0, now() - started)),
    measurementMs:
      measurementStart === null || measurementEnd === null
        ? 0
        : rounded(Math.max(0, measurementEnd - measurementStart)),
    peakConcurrency,
    settings: settingsOnly(plan),
    cases: plan.cases.map(caseInfo),
    samples: samples.sort((a, b) => a.sequence - b.sequence),
  };
}

export function benchmarkMetrics(
  report: BenchmarkReport,
  caseId?: string,
): BenchmarkMetrics {
  const samples = report.samples.filter(
    (sample) =>
      sample.phase === "measured" &&
      (caseId === undefined || sample.caseId === caseId),
  );
  const completed = samples.filter((sample) => sample.outcome !== "cancelled");
  const durations = completed
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  const failed = completed.filter(
    (sample) => sample.outcome !== "success",
  ).length;
  const percentile = (percent: number) =>
    durations.length
      ? durations[Math.ceil((durations.length * percent) / 100) - 1]
      : null;
  return {
    started: samples.length,
    completed: completed.length,
    succeeded: completed.length - failed,
    failed,
    cancelled: samples.length - completed.length,
    errorPercent: completed.length ? (failed / completed.length) * 100 : null,
    throughput:
      completed.length && report.measurementMs > 0
        ? completed.length / (report.measurementMs / 1000)
        : null,
    minMs: durations[0] ?? null,
    meanMs: durations.length
      ? rounded(
          durations.reduce((sum, value) => sum + value, 0) / durations.length,
        )
      : null,
    p50Ms: percentile(50),
    p90Ms: percentile(90),
    p95Ms: percentile(95),
    p99Ms: percentile(99),
    maxMs: durations.at(-1) ?? null,
  };
}
export type BenchmarkBudget = {
  metric: "p95" | "errors" | "throughput";
  limit: number;
  actual: number | null;
  outcome: "passed" | "failed" | "disabled" | "incomplete";
};
export function benchmarkBudgets(report: BenchmarkReport): BenchmarkBudget[] {
  const metrics = benchmarkMetrics(report);
  const complete =
    report.stopReason === "completed" &&
    metrics.completed === report.settings.requests;
  return (
    [
      { metric: "p95", limit: report.settings.maxP95Ms, actual: metrics.p95Ms },
      {
        metric: "errors",
        limit: report.settings.maxErrorPercent,
        actual: metrics.errorPercent,
      },
      {
        metric: "throughput",
        limit: report.settings.minThroughput,
        actual: metrics.throughput,
      },
    ] as const
  ).map((budget) => ({
    ...budget,
    outcome:
      budget.metric !== "errors" && budget.limit === 0
        ? "disabled"
        : !complete || budget.actual === null
          ? "incomplete"
          : (
                budget.metric === "throughput"
                  ? budget.actual >= budget.limit
                  : budget.actual <= budget.limit
              )
            ? "passed"
            : "failed",
  }));
}
export function compareBenchmarkReports(
  baseline: BenchmarkReport,
  candidate: BenchmarkReport,
) {
  const oldMetrics = benchmarkMetrics(baseline),
    newMetrics = benchmarkMetrics(candidate);
  const setup = (report: BenchmarkReport) =>
    JSON.stringify({
      mode: report.mode,
      settings: Object.fromEntries(
        settingsKeys
          .filter(
            (key) =>
              !["maxP95Ms", "maxErrorPercent", "minThroughput"].includes(key),
          )
          .map((key) => [key, report.settings[key]]),
      ),
      cases: report.cases.map(
        ({
          method,
          path,
          weight,
          expectedStatus,
          mockStatus,
          mockLatencyMs,
        }) => ({
          method,
          path,
          weight,
          expectedStatus,
          ...(report.mode === "mock" ? { mockStatus, mockLatencyMs } : {}),
        }),
      ),
    });
  const delta = (oldValue: number | null, newValue: number | null) =>
    oldValue === null || newValue === null
      ? null
      : rounded(newValue - oldValue);
  return {
    compatible:
      setup(baseline) === setup(candidate) &&
      baseline.stopReason === "completed" &&
      candidate.stopReason === "completed",
    p95DeltaMs: delta(oldMetrics.p95Ms, newMetrics.p95Ms),
    meanDeltaMs: delta(oldMetrics.meanMs, newMetrics.meanMs),
    errorDeltaPoints: delta(oldMetrics.errorPercent, newMetrics.errorPercent),
    throughputDelta: delta(oldMetrics.throughput, newMetrics.throughput),
  };
}
function reportOnly(report: BenchmarkReport): BenchmarkReport {
  return {
    planName: report.planName,
    mode: report.mode,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    stopReason: report.stopReason,
    elapsedMs: report.elapsedMs,
    measurementMs: report.measurementMs,
    peakConcurrency: report.peakConcurrency,
    settings: settingsOnly(report.settings),
    cases: report.cases.map(caseInfo),
    samples: report.samples.map(
      ({
        sequence,
        phase,
        caseId,
        method,
        path,
        offsetMs,
        durationMs,
        proxyDurationMs,
        status,
        bodyBytes,
        outcome,
        error,
      }) => ({
        sequence,
        phase,
        caseId,
        method,
        path,
        offsetMs,
        durationMs,
        proxyDurationMs,
        status,
        bodyBytes,
        outcome,
        error,
      }),
    ),
  };
}
function validReport(value: unknown): value is BenchmarkReport {
  if (
    !record(value) ||
    !text(value.planName, 120) ||
    !value.planName.trim() ||
    (value.mode !== "mock" && value.mode !== "live") ||
    !text(value.startedAt, 40) ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !text(value.completedAt, 40) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    typeof value.stopReason !== "string" ||
    !["completed", "cancelled", "time-limit", "error-limit"].includes(
      value.stopReason,
    ) ||
    !finite(value.elapsedMs, 0, 1e9) ||
    !finite(value.measurementMs, 0, value.elapsedMs) ||
    !integer(value.peakConcurrency, 0, 5) ||
    !validSettings(value.settings) ||
    !Array.isArray(value.cases) ||
    !value.cases.length ||
    !Array.isArray(value.samples) ||
    value.samples.length > MAX_BENCHMARK_REQUESTS
  )
    return false;
  const plan = {
    ...value.settings,
    name: value.planName,
    targetUrl: "",
    cases: value.cases.map((entry) =>
      record(entry) ? { ...entry, parameters: [] } : entry,
    ),
  };
  if (
    !validateBenchmarkPlan(plan) ||
    Number(value.peakConcurrency) > value.settings.concurrency ||
    Number(value.peakConcurrency) > value.samples.length ||
    (value.samples.length > 0 && value.peakConcurrency === 0)
  )
    return false;
  let measured = 0,
    warmup = 0,
    previousOffset = 0;
  for (const [index, sample] of value.samples.entries()) {
    if (
      !record(sample) ||
      sample.sequence !== index + 1 ||
      (sample.phase !== "warmup" && sample.phase !== "measured") ||
      !text(sample.caseId, 160) ||
      !finite(sample.offsetMs, previousOffset, value.elapsedMs) ||
      !finite(sample.durationMs, 0, value.elapsedMs + 1) ||
      sample.offsetMs + sample.durationMs > value.elapsedMs + 1 ||
      typeof sample.outcome !== "string" ||
      !["success", "failed", "error", "cancelled"].includes(sample.outcome)
    )
      return false;
    const entry = plan.cases.find((entry) => entry.id === sample.caseId);
    if (!entry || sample.method !== entry.method || sample.path !== entry.path)
      return false;
    previousOffset = sample.offsetMs;
    if (sample.phase === "warmup") {
      if (measured) return false;
      warmup++;
    } else measured++;
    if (sample.outcome === "success" || sample.outcome === "failed") {
      if (
        !text(sample.status, 3) ||
        !/^[1-5]\d{2}$/.test(sample.status) ||
        sample.error !== null ||
        !integer(sample.bodyBytes, 0, 1024 * 1024) ||
        (value.mode === "mock"
          ? sample.proxyDurationMs !== null
          : !finite(sample.proxyDurationMs, 0, 1e9)) ||
        (sample.outcome === "success") !==
          matchesBenchmarkStatus(entry.expectedStatus, sample.status)
      )
        return false;
    } else if (
      sample.status !== null ||
      sample.bodyBytes !== null ||
      sample.proxyDurationMs !== null ||
      typeof sample.error !== "string" ||
      ![
        "network",
        "timeout",
        "invalid-response",
        "response-limit",
        "target",
        "cancelled",
      ].includes(sample.error) ||
      (sample.outcome === "cancelled") !== (sample.error === "cancelled")
    )
      return false;
  }
  return (
    warmup <= value.settings.warmup &&
    measured <= value.settings.requests &&
    (value.stopReason !== "completed" ||
      (warmup === value.settings.warmup &&
        measured === value.settings.requests &&
        value.samples.every((sample) => sample.outcome !== "cancelled")))
  );
}
export function serializeBenchmarkReport(report: BenchmarkReport) {
  if (!validReport(report)) throw new BenchmarkError("invalid-report");
  return jsonExport({
    kind: "rsswag-api-benchmark-report",
    version: 1,
    report: reportOnly(report),
    summary: {
      overall: benchmarkMetrics(report),
      budgets: benchmarkBudgets(report),
      cases: report.cases.map((entry) => ({
        id: entry.id,
        ...benchmarkMetrics(report, entry.id),
      })),
    },
  });
}
export function parseBenchmarkReport(input: string): BenchmarkReport {
  const value = parseInput(input, "invalid-report");
  if (
    !record(value) ||
    value.kind !== "rsswag-api-benchmark-report" ||
    value.version !== 1 ||
    !validReport(value.report)
  )
    throw new BenchmarkError("invalid-report");
  return reportOnly(value.report);
}
export function exportBenchmarkCsv(report: BenchmarkReport) {
  if (!validReport(report)) throw new BenchmarkError("invalid-report");
  const table = createExplorerTable(reportOnly(report).samples);
  if (!table.ok) throw new BenchmarkError("limit");
  if (!table.rows.length)
    table.columns = [
      "sequence",
      "phase",
      "caseId",
      "method",
      "path",
      "offsetMs",
      "durationMs",
      "proxyDurationMs",
      "status",
      "bodyBytes",
      "outcome",
      "error",
    ];
  return exportExplorerCsv(table, table.columns, "");
}
