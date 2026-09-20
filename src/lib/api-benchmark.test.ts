import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  benchmarkBudgets,
  benchmarkMetrics,
  compareBenchmarkReports,
  createBenchmarkCase,
  createBenchmarkPlan,
  exportBenchmarkCsv,
  MAX_BENCHMARK_BYTES,
  parseBenchmarkHeaders,
  parseBenchmarkPlan,
  parseBenchmarkReport,
  runApiBenchmark,
  serializeBenchmarkPlan,
  serializeBenchmarkReport,
  validateBenchmarkPlan,
  type BenchmarkPlan,
  type BenchmarkReport,
} from "./api-benchmark";
import {
  ScenarioError,
  type ScenarioResponse,
  type ScenarioTransport,
} from "./api-scenario";
import type { EndpointSummary } from "./openapi";

function endpoint(path = "/items", method = "GET"): EndpointSummary {
  return {
    method,
    path,
    summary: "Read items",
    description: "",
    operationId: "",
    tags: [],
    deprecated: false,
    secured: false,
    securityRequirements: [],
    serverUrl: "https://schema.example.com",
    parameters: [],
    requestBodies: [],
    responses: [
      {
        status: "200",
        description: "OK",
        contentTypes: ["application/json"],
        schema: {
          type: "object",
          properties: ["id"],
          requiredProperties: ["id"],
          example: '{"id":1,"token":"private-response"}',
          exampleName: "",
          hasExplicitExample: true,
        },
      },
      {
        status: "503",
        description: "Unavailable",
        contentTypes: [],
        schema: null,
      },
    ],
  };
}
const response = (status = "200"): ScenarioResponse => ({
  status,
  durationMs: 17,
  body: '{"token":"private-response"}',
  headers: { "x-secret": "private-header" },
});
function plan(endpoints = [endpoint()]): BenchmarkPlan {
  return {
    ...createBenchmarkPlan(),
    targetUrl: "https://api.example.com/v1",
    requests: 5,
    warmup: 0,
    ratePerSecond: 10,
    cases: endpoints.map((entry, index) =>
      createBenchmarkCase(entry, `case-${index}`),
    ),
  };
}
const options = (transport?: ScenarioTransport) => ({
  mode: "live" as const,
  signal: new AbortController().signal,
  transport: transport ?? vi.fn(async () => response()),
  now: () => Date.now(),
});
async function finish<T>(promise: Promise<T>): Promise<T> {
  const captured = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const result = await captured;
  if ("error" in result) throw result.error;
  return result.value;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("benchmark plan portability and preflight", () => {
  it("round trips plans while stripping runtime fields and retaining literal request inputs", () => {
    const input = {
      ...plan(),
      sessionHeaders: { Authorization: "private-session" },
      results: [response()],
    };
    input.cases[0].parameters = [
      { location: "query", name: "tag", value: "one" },
      { location: "query", name: "tag", value: "two" },
    ];
    const output = serializeBenchmarkPlan(input);
    expect(output).not.toMatch(
      /private-session|private-response|private-header/,
    );
    expect(parseBenchmarkPlan("\uFEFF" + output)).toEqual({
      ...plan(),
      cases: input.cases,
    });
    expect(validateBenchmarkPlan(input)).toBe(true);
  });
  it.each([
    { requests: 0 },
    { requests: 201 },
    { requests: 200, warmup: 1 },
    { concurrency: 6 },
    { concurrency: 1.5 },
    { ratePerSecond: 11 },
    { ratePerSecond: 0 },
    { timeoutMs: 999 },
    { maxRunMs: 120001 },
    { maxErrorPercent: 101 },
    { minThroughput: -1 },
    {
      cases: Array.from({ length: 11 }, (_, index) =>
        createBenchmarkCase(endpoint(), String(index)),
      ),
    },
  ])("rejects invalid limits: %j", (patch) => {
    expect(validateBenchmarkPlan({ ...plan(), ...patch })).toBe(false);
  });
  it("rejects unsafe methods, duplicate headers, malformed imports, and oversized input", () => {
    expect(() =>
      createBenchmarkCase(endpoint("/items", "POST"), "write"),
    ).toThrow("invalid-plan");
    expect(
      validateBenchmarkPlan({
        ...plan(),
        cases: [{ ...plan().cases[0], method: "DELETE" }],
      }),
    ).toBe(false);
    expect(
      validateBenchmarkPlan({
        ...plan(),
        cases: [
          {
            ...plan().cases[0],
            parameters: [
              { location: "header", name: "Accept", value: "a" },
              { location: "header", name: "accept", value: "b" },
            ],
          },
        ],
      }),
    ).toBe(false);
    expect(() => parseBenchmarkPlan("{}")).toThrow("invalid-plan");
    expect(() =>
      parseBenchmarkPlan(" ".repeat(MAX_BENCHMARK_BYTES + 1)),
    ).toThrow("limit");
    expect(() => parseBenchmarkHeaders('{"Host":"example.com"}')).toThrow(
      "headers",
    );
    expect(() => parseBenchmarkHeaders('{"Authorization":123}')).toThrow(
      "headers",
    );
  });
  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "https://user:password@example.com",
    "https://example.com?token=secret",
    "https://example.com/#fragment",
    "file:///api",
  ])(
    "rejects invalid live target %s before sending requests",
    async (targetUrl) => {
      const transport = vi.fn(async () => response());
      await expect(
        runApiBenchmark(
          { ...plan(), targetUrl },
          [endpoint()],
          options(transport),
        ),
      ).rejects.toMatchObject({ code: "target" });
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it("preflights every case and required inputs before launching a workload", async () => {
    const transport = vi.fn(async () => response());
    const source = endpoint("/items/{id}");
    source.parameters = [
      {
        location: "path",
        name: "id",
        example: "",
        required: true,
        description: "",
      },
    ];
    await expect(
      runApiBenchmark(
        plan([endpoint(), source]),
        [endpoint(), source],
        options(transport),
      ),
    ).rejects.toMatchObject({ code: "missing-parameter", caseIndex: 1 });
    await expect(
      runApiBenchmark(plan(), [], options(transport)),
    ).rejects.toMatchObject({ code: "missing-endpoint" });
    await expect(
      runApiBenchmark(plan(), [endpoint(), endpoint()], options(transport)),
    ).rejects.toMatchObject({ code: "missing-endpoint" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("merges session headers case insensitively and snapshots requests", async () => {
    const source = endpoint("/items/{id}");
    source.parameters = [
      {
        location: "path",
        name: "id",
        example: "1",
        required: true,
        description: "",
      },
      {
        location: "header",
        name: "Authorization",
        example: "old",
        required: true,
        description: "",
      },
    ];
    const input = plan([source]);
    input.cases[0].parameters.push(
      { location: "query", name: "tag", value: "one" },
      { location: "query", name: "tag", value: "two" },
    );
    const transport = vi.fn(async () => response());
    const run = runApiBenchmark(input, [source], {
      ...options(transport),
      headers: { authorization: "private-session" },
    });
    input.cases[0].parameters[0].value = "changed";
    input.targetUrl = "https://changed.example.com";
    const report = await finish(run);
    for (const [request] of transport.mock.calls as unknown as [
      Parameters<ScenarioTransport>[0],
      AbortSignal,
    ][]) {
      expect(request.serverUrl).toBe("https://api.example.com/v1");
      expect(request.requestParameters).toEqual([
        { location: "path", name: "id", value: "1" },
        { location: "query", name: "tag", value: "one" },
        { location: "query", name: "tag", value: "two" },
        { location: "header", name: "authorization", value: "private-session" },
      ]);
    }
    expect(serializeBenchmarkReport(report)).not.toMatch(
      /private-session|private-response|private-header|changed.example|requestParameters|targetUrl/,
    );
  });
});

describe("benchmark scheduler", () => {
  it("does not dispatch beyond the run deadline when timer tasks are delayed", async () => {
    let clock = 0;
    const transport = vi.fn(async () => {
      clock += 600;
      return response();
    });
    const result = await finish(
      runApiBenchmark({ ...plan(), maxRunMs: 1000 }, [endpoint()], {
        ...options(transport),
        now: () => clock,
      }),
    );
    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.stopReason).toBe("time-limit");
    expect(result.samples.map((sample) => sample.outcome)).toEqual([
      "success",
      "cancelled",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("enforces concurrency and a global launch rate without catch-up bursts", async () => {
    let active = 0,
      peak = 0;
    const started: number[] = [];
    const transport: ScenarioTransport = async () => {
      started.push(Date.now());
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 350));
      active--;
      return response();
    };
    const report = await finish(
      runApiBenchmark(
        { ...plan(), requests: 7, concurrency: 2 },
        [endpoint()],
        options(transport),
      ),
    );
    expect(peak).toBe(2);
    expect(report.peakConcurrency).toBe(2);
    expect(started).toHaveLength(7);
    expect(
      started.slice(1).every((time, index) => time - started[index] >= 100),
    ).toBe(true);
    expect(report.samples.map((sample) => sample.durationMs)).toEqual(
      Array(7).fill(350),
    );
    expect(
      report.samples.every((sample) => sample.proxyDurationMs === 17),
    ).toBe(true);
    expect(report.measurementMs).toBe(1400);
    expect(benchmarkMetrics(report)).toMatchObject({
      completed: 7,
      meanMs: 350,
      p95Ms: 350,
      throughput: 5,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("separates warm-up from measurements and distributes a weighted workload", async () => {
    const sources = [endpoint("/first"), endpoint("/second")];
    const input = { ...plan(sources), warmup: 2, requests: 6 };
    input.cases[0].weight = 2;
    let calls = 0;
    const report = await finish(
      runApiBenchmark(
        input,
        sources,
        options(async () => {
          calls++;
          await new Promise((resolve) =>
            setTimeout(resolve, calls <= 2 ? 300 : 30),
          );
          return response(calls <= 2 ? "503" : "200");
        }),
      ),
    );
    expect(
      report.samples
        .filter((sample) => sample.phase === "measured")
        .map((sample) => sample.path),
    ).toEqual(["/first", "/second", "/first", "/first", "/second", "/first"]);
    expect(
      report.samples.filter((sample) => sample.phase === "warmup"),
    ).toHaveLength(2);
    expect(benchmarkMetrics(report)).toMatchObject({
      completed: 6,
      failed: 0,
      meanMs: 30,
      p99Ms: 30,
    });
    expect(benchmarkMetrics(report, "case-0").completed).toBe(4);
    expect(benchmarkMetrics(report, "case-1").completed).toBe(2);
    expect(
      benchmarkBudgets(report).every((budget) =>
        ["passed", "disabled"].includes(budget.outcome),
      ),
    ).toBe(true);
  });
  it("keeps completion order independent of launch order", async () => {
    const sources = [endpoint("/slow"), endpoint("/fast")];
    const report = await finish(
      runApiBenchmark(
        { ...plan(sources), requests: 2 },
        sources,
        options(async (request) => {
          await new Promise((resolve) =>
            setTimeout(resolve, request.path === "/slow" ? 400 : 10),
          );
          return response();
        }),
      ),
    );
    expect(report.samples.map((sample) => sample.sequence)).toEqual([1, 2]);
    expect(report.samples.map((sample) => sample.durationMs)).toEqual([
      400, 10,
    ]);
    expect(benchmarkMetrics(report)).toMatchObject({
      p50Ms: 10,
      p95Ms: 400,
      meanMs: 205,
    });
  });
  it("rehearses offline without reading session headers or using live transport", async () => {
    const transport = vi.fn(async () => response());
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const input = { ...plan(), targetUrl: "", requests: 3 };
    input.cases[0].mockStatus = "503";
    input.cases[0].mockLatencyMs = 250;
    const report = await finish(
      runApiBenchmark(input, [endpoint()], {
        ...options(transport),
        mode: "mock",
        headers: { Host: "ignored" },
      }),
    );
    expect(transport).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(benchmarkMetrics(report)).toMatchObject({
      completed: 3,
      failed: 3,
      errorPercent: 100,
      p95Ms: 250,
    });
    expect(
      report.samples.every((sample) => sample.proxyDurationMs === null),
    ).toBe(true);
    expect(
      benchmarkBudgets(report).find((budget) => budget.metric === "errors")
        ?.outcome,
    ).toBe("failed");
    await expect(
      runApiBenchmark(
        { ...input, cases: [{ ...input.cases[0], mockStatus: "404" }] },
        [endpoint()],
        { ...options(), mode: "mock" },
      ),
    ).rejects.toMatchObject({ code: "mock-response" });
  });
  it("bounds hung adapters with per-request deadlines and discards late completions", async () => {
    const input = { ...plan(), requests: 2, timeoutMs: 1000 };
    const report = await finish(
      runApiBenchmark(
        input,
        [endpoint()],
        options(
          async () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(response()), 2000),
            ),
        ),
      ),
    );
    expect(report.samples.map((sample) => sample.error)).toEqual([
      "timeout",
      "timeout",
    ]);
    expect(benchmarkMetrics(report)).toMatchObject({
      completed: 2,
      failed: 2,
      p95Ms: 1000,
    });
    expect(report.samples.every((sample) => sample.status === null)).toBe(true);
  });
  it("aborts active and queued work on cancellation and retains partial results", async () => {
    const controller = new AbortController();
    let calls = 0;
    const run = runApiBenchmark({ ...plan(), requests: 20 }, [endpoint()], {
      ...options(async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return response();
      }),
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(150);
    controller.abort();
    const report = await finish(run);
    expect(calls).toBe(2);
    expect(report.stopReason).toBe("cancelled");
    expect(report.samples.map((sample) => sample.outcome)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    expect(benchmarkMetrics(report)).toMatchObject({
      completed: 0,
      cancelled: 2,
      p95Ms: null,
      throughput: null,
    });
    expect(
      benchmarkBudgets(report).filter(
        (budget) => budget.outcome === "incomplete",
      ),
    ).toHaveLength(2);
    expect(parseBenchmarkReport(serializeBenchmarkReport(report))).toEqual(
      report,
    );
  });
  it("honors a pre-aborted signal without sending requests", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn(async () => response());
    const report = await finish(
      runApiBenchmark(plan(), [endpoint()], {
        ...options(transport),
        signal: controller.signal,
      }),
    );
    expect(transport).not.toHaveBeenCalled();
    expect(report.samples).toEqual([]);
    expect(report.stopReason).toBe("cancelled");
  });
  it("stops at the overall time limit and releases non-cooperating requests", async () => {
    const transport = vi.fn(
      async () => new Promise<ScenarioResponse>(() => {}),
    );
    const report = await finish(
      runApiBenchmark(
        { ...plan(), maxRunMs: 1000 },
        [endpoint()],
        options(transport),
      ),
    );
    expect(report.stopReason).toBe("time-limit");
    expect(report.elapsedMs).toBe(1000);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      report.samples.every((sample) => sample.outcome === "cancelled"),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops after the configured measured error count without launching queued requests", async () => {
    const report = await finish(
      runApiBenchmark(
        { ...plan(), requests: 10, stopAfterErrors: 2 },
        [endpoint()],
        options(async () => response("503")),
      ),
    );
    expect(report.stopReason).toBe("error-limit");
    expect(report.samples).toHaveLength(2);
    expect(benchmarkMetrics(report).failed).toBe(2);
    expect(benchmarkBudgets(report)[1].outcome).toBe("incomplete");
  });
  it.each([
    [new ScenarioError("network"), "network"],
    [new ScenarioError("invalid-server"), "target"],
    [new ScenarioError("response-limit"), "response-limit"],
    [new Error("private error details"), "network"],
  ])(
    "records bounded transport failures without raw errors",
    async (error, expected) => {
      const report = await finish(
        runApiBenchmark(
          { ...plan(), requests: 1 },
          [endpoint()],
          options(async () => {
            throw error;
          }),
        ),
      );
      expect(report.samples[0].error).toBe(expected);
      expect(serializeBenchmarkReport(report)).not.toContain(
        "private error details",
      );
    },
  );
  it("rejects invalid and oversized responses and supports HEAD samples", async () => {
    const invalid = await finish(
      runApiBenchmark(
        { ...plan(), requests: 1 },
        [endpoint()],
        options(async () => ({ ...response(), status: "0" })),
      ),
    );
    expect(invalid.samples[0].error).toBe("invalid-response");
    const oversized = await finish(
      runApiBenchmark(
        { ...plan(), requests: 1 },
        [endpoint()],
        options(async () => ({
          ...response(),
          body: "x".repeat(1024 * 1024 + 1),
        })),
      ),
    );
    expect(oversized.samples[0].error).toBe("response-limit");
    const head = endpoint("/items", "HEAD");
    const report = await finish(
      runApiBenchmark({ ...plan([head]), requests: 1 }, [head], options()),
    );
    expect(report.samples[0].bodyBytes).toBe(0);
  });
  it("uses the existing live proxy with requireLive and never stores history", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify(response()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    const report = await finish(
      runApiBenchmark({ ...plan(), requests: 1 }, [endpoint()], {
        mode: "live",
        signal: new AbortController().signal,
        now: () => Date.now(),
      }),
    );
    expect(report.samples[0].outcome).toBe("success");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/try-it-out");
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({
      requireLive: true,
      method: "GET",
    });
  });
});

describe("benchmark reports and comparisons", () => {
  it("does not round failure rates or throughput before evaluating a budget", async () => {
    const result = await report();
    result.samples = result.samples.slice(0, 3);
    result.settings.requests = 3;
    result.samples[0].status = "503";
    result.samples[0].outcome = "failed";
    result.settings.maxErrorPercent = 33.333;
    result.settings.minThroughput = 2.498;
    result.measurementMs = 1201;
    result.elapsedMs = 1201;
    expect(
      benchmarkBudgets(result).find((budget) => budget.metric === "errors")
        ?.outcome,
    ).toBe("failed");
    expect(
      benchmarkBudgets(result).find((budget) => budget.metric === "throughput")
        ?.outcome,
    ).toBe("failed");
  });
  it("preserves CSV columns for runs stopped before the first dispatch", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await finish(
      runApiBenchmark(plan(), [endpoint()], {
        ...options(),
        signal: controller.signal,
      }),
    );
    expect(exportBenchmarkCsv(result)).toContain('"sequence","phase","caseId"');
    expect(exportBenchmarkCsv(result)).toContain('"durationMs"');
  });
  it("rejects coerced discriminator values and impossible concurrency in reports", async () => {
    const result = await report();
    for (const patch of [
      { mode: ["live"] },
      { stopReason: ["completed"] },
      { peakConcurrency: 0 },
      {
        samples: result.samples.map((sample) => ({
          ...sample,
          phase: ["measured"],
        })),
      },
      {
        samples: result.samples.map((sample) => ({
          ...sample,
          outcome: ["success"],
        })),
      },
    ]) {
      expect(() =>
        parseBenchmarkReport(
          JSON.stringify({
            kind: "rsswag-api-benchmark-report",
            version: 1,
            report: { ...result, ...patch },
          }),
        ),
      ).toThrow("invalid-report");
    }
    const input = plan();
    const malformed = {
      ...input,
      cases: [
        {
          ...input.cases[0],
          parameters: [{ location: ["query"], name: "q", value: "x" }],
        },
      ],
    };
    expect(validateBenchmarkPlan(malformed)).toBe(false);
  });
  async function report(): Promise<BenchmarkReport> {
    return finish(
      runApiBenchmark(
        plan(),
        [endpoint()],
        options(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return response();
        }),
      ),
    );
  }
  it("exports portable reports with recomputed summaries and spreadsheet-safe samples", async () => {
    const result = await report();
    const decorated = {
      ...result,
      targetUrl: "private-target",
      headers: { Authorization: "private-session" },
      samples: result.samples.map((sample) => ({
        ...sample,
        body: "private-body",
      })),
    };
    const json = serializeBenchmarkReport(decorated);
    expect(json).not.toMatch(
      /private-target|private-session|private-body|private-response/,
    );
    expect(parseBenchmarkReport(json)).toEqual(result);
    const parsed = JSON.parse(json);
    parsed.summary.overall.p95Ms = 9999;
    expect(
      benchmarkMetrics(parseBenchmarkReport(JSON.stringify(parsed))).p95Ms,
    ).toBe(50);
    const csv = exportBenchmarkCsv(result);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"durationMs"');
    expect(csv).toContain('"200"');
  });
  it("rejects fabricated report structure, incomplete complete reports, and excess imports", async () => {
    const result = await report();
    const encoded = () => ({
      kind: "rsswag-api-benchmark-report",
      version: 1,
      report: structuredClone(result),
    });
    const invalid = encoded();
    invalid.report.samples[0].caseId = "missing";
    expect(() => parseBenchmarkReport(JSON.stringify(invalid))).toThrow(
      "invalid-report",
    );
    const short = encoded();
    short.report.samples.pop();
    expect(() => parseBenchmarkReport(JSON.stringify(short))).toThrow(
      "invalid-report",
    );
    const wrong = encoded();
    wrong.report.samples[0].outcome = "failed";
    expect(() => parseBenchmarkReport(JSON.stringify(wrong))).toThrow(
      "invalid-report",
    );
    const reordered = encoded();
    reordered.report.samples.reverse();
    expect(() => parseBenchmarkReport(JSON.stringify(reordered))).toThrow(
      "invalid-report",
    );
    expect(() => parseBenchmarkReport("{}")).toThrow("invalid-report");
    expect(() =>
      parseBenchmarkReport(" ".repeat(MAX_BENCHMARK_BYTES + 1)),
    ).toThrow("limit");
  });
  it("compares deltas and flags differing modes and workload configurations", async () => {
    const baseline = await report();
    const candidate = structuredClone(baseline);
    candidate.samples.forEach((sample) => {
      sample.durationMs += 20;
    });
    candidate.elapsedMs += 20;
    candidate.measurementMs += 20;
    expect(compareBenchmarkReports(baseline, candidate)).toMatchObject({
      compatible: true,
      p95DeltaMs: 20,
      meanDeltaMs: 20,
      errorDeltaPoints: 0,
    });
    candidate.mode = "mock";
    expect(compareBenchmarkReports(baseline, candidate).compatible).toBe(false);
    candidate.mode = "live";
    candidate.settings.concurrency++;
    expect(compareBenchmarkReports(baseline, candidate).compatible).toBe(false);
  });
  it("evaluates latency, error, and throughput budgets without treating partial runs as passes", async () => {
    const result = await report();
    result.settings.maxP95Ms = 49;
    result.settings.minThroughput = 100;
    expect(benchmarkBudgets(result).map((budget) => budget.outcome)).toEqual([
      "failed",
      "passed",
      "failed",
    ]);
    result.stopReason = "time-limit";
    expect(
      benchmarkBudgets(result).every(
        (budget) => budget.outcome === "incomplete",
      ),
    ).toBe(true);
    result.settings.maxP95Ms = 0;
    result.settings.minThroughput = 0;
    expect(benchmarkBudgets(result).map((budget) => budget.outcome)).toEqual([
      "disabled",
      "incomplete",
      "disabled",
    ]);
  });
});
