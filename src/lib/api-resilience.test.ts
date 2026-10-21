import { describe, expect, it } from "vitest";
import {
  defaultResiliencePolicy,
  defaultResilienceScenario,
  demoResilienceProject,
  emptyResilienceProject,
  MAX_RESILIENCE_BYTES,
  normalizeResiliencePolicy,
  normalizeResilienceScenario,
  parseResilienceProject,
  resilienceArrivals,
  resilienceAttemptsCsv,
  resilienceFromHar,
  resilienceRetryDelay,
  runResilienceExperiment,
  serializeResilienceProject,
  serializeResilienceRun,
  simulateResilience,
  type ResilienceFault,
  type ResiliencePolicy,
  type ResilienceScenario,
} from "./api-resilience";

const fault = (
  status = 200,
  latencyMs = 10,
  retryAfterMs: number | null = null,
): ResilienceFault => ({ kind: "http", status, latencyMs, retryAfterMs });
const scenario = (
  patch: Partial<ResilienceScenario> = {},
): ResilienceScenario => ({
  ...defaultResilienceScenario(),
  arrivals: resilienceArrivals(1, 0),
  defaultFault: fault(),
  ...patch,
});
const policy = (patch: Partial<ResiliencePolicy> = {}): ResiliencePolicy => ({
  ...defaultResiliencePolicy(),
  jitter: "none",
  ...patch,
});
const run = (
  s: Partial<ResilienceScenario> = {},
  p: Partial<ResiliencePolicy> = {},
) => simulateResilience(scenario(s), policy(p));
const throws = (work: () => unknown, code: string) =>
  expect(work).toThrowError(expect.objectContaining({ code }));

describe("resilience virtual clock and retry scheduling", () => {
  it("enforces concurrency and FIFO admission while accounting for queue time", () => {
    const r = run(
      { arrivals: resilienceArrivals(3, 0), defaultFault: fault(200, 40) },
      { concurrency: 2, queueLimit: 2 },
    );
    expect(r.attempts.map((a) => a.startedAtMs)).toEqual([0, 0, 40]);
    expect(r.requests.map((r) => r.completedAtMs)).toEqual([40, 40, 80]);
    expect(r.requests.map((r) => r.queueWaitMs)).toEqual([0, 0, 40]);
    expect(r.metrics).toMatchObject({
      succeeded: 3,
      attempts: 3,
      peakConcurrency: 2,
      peakQueue: 1,
      p50Ms: 40,
      p95Ms: 80,
      elapsedMs: 80,
    });
  });
  it("retries through a timed outage with capped exponential backoff and releases capacity during waits", () => {
    const r = run(
      { windows: [{ startMs: 0, endMs: 300, fault: fault(503) }] },
      { baseDelayMs: 100, maxDelayMs: 200 },
    );
    expect(r.attempts.map((a) => [a.startedAtMs, a.outcome])).toEqual([
      [0, "http-error"],
      [110, "http-error"],
      [320, "success"],
    ]);
    expect(r.requests[0]).toMatchObject({
      completedAtMs: 330,
      backoffMs: 300,
      attempts: 3,
      outcome: "success",
    });
    expect(r.metrics).toMatchObject({
      amplification: 3,
      retries: 2,
      peakConcurrency: 1,
    });
    const paired = run(
      {
        arrivals: resilienceArrivals(2, 5),
        windows: [{ startMs: 0, endMs: 11, fault: fault(503) }],
      },
      { concurrency: 1, baseDelayMs: 100 },
    );
    expect(paired.attempts.slice(0, 3).map((a) => a.startedAtMs)).toEqual([
      0, 10, 110,
    ]);
  });
  it("treats fault windows as start-inclusive and end-exclusive and samples faults at dispatch", () => {
    const r = run(
      {
        arrivals: [
          { id: "a", name: "A", method: "GET", atMs: 9 },
          { id: "b", name: "B", method: "GET", atMs: 10 },
        ],
        windows: [{ startMs: 0, endMs: 10, fault: fault(503, 50) }],
      },
      { maxAttempts: 1 },
    );
    expect(r.attempts.map((a) => [a.status, a.completedAtMs])).toEqual([
      [503, 59],
      [200, 20],
    ]);
  });
  it("honors server retry delays as a minimum without capping them at max backoff", () => {
    const s = {
      windows: [{ startMs: 0, endMs: 100, fault: fault(429, 10, 500) }],
    };
    const p = { baseDelayMs: 30, maxDelayMs: 30, backoff: "fixed" as const };
    expect(run(s, p).attempts.map((a) => a.startedAtMs)).toEqual([0, 510]);
    expect(
      run(s, { ...p, respectRetryAfter: false }).attempts.map(
        (a) => a.startedAtMs,
      ),
    ).toEqual([0, 40, 80, 120]);
  });
  it("does not launch retries beyond the overall deadline, including a long server delay", () => {
    const r = run({ defaultFault: fault(429, 10, 10000) }, { deadlineMs: 200 });
    expect(r.attempts).toHaveLength(1);
    expect(r.requests[0]).toMatchObject({
      outcome: "deadline",
      completedAtMs: 200,
      backoffMs: 190,
    });
    expect(r.metrics.elapsedMs).toBe(200);
  });
  it("requires responses strictly before attempt timeout and overall deadline", () => {
    expect(
      run(
        { defaultFault: fault(200, 100) },
        { attemptTimeoutMs: 100, maxAttempts: 1 },
      ).requests[0].outcome,
    ).toBe("timeout");
    const r = run(
      { defaultFault: fault(200, 100) },
      { attemptTimeoutMs: 100, deadlineMs: 100 },
    );
    expect(r.requests[0]).toMatchObject({
      outcome: "deadline",
      completedAtMs: 100,
      attempts: 1,
    });
    expect(r.attempts[0]).toMatchObject({ outcome: "deadline", status: null });
    expect(r.metrics).toMatchObject({ deadlineExceeded: 1, timeouts: 0 });
  });
  it("includes queue waits in deadlines and removes expired requests from the admission queue", () => {
    const r = run(
      { arrivals: resilienceArrivals(4, 0), defaultFault: fault(200, 80) },
      { concurrency: 1, queueLimit: 2, deadlineMs: 100 },
    );
    expect(r.requests.map((r) => r.outcome)).toEqual([
      "success",
      "deadline",
      "deadline",
      "queue-full",
    ]);
    expect(r.requests[1].queueWaitMs).toBe(80);
    expect(r.requests[2].queueWaitMs).toBe(100);
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts[1].completedAtMs).toBe(100);
  });
  it("rejects excess arrivals with no queue capacity and admits later arrivals after completion", () => {
    const r = run(
      { arrivals: resilienceArrivals(3, 10), defaultFault: fault(200, 20) },
      { concurrency: 1, queueLimit: 0 },
    );
    expect(r.requests.map((r) => r.outcome)).toEqual([
      "success",
      "queue-full",
      "success",
    ]);
    expect(r.metrics).toMatchObject({
      queueRejected: 1,
      attempts: 2,
      peakQueue: 0,
    });
  });
  it("does not retry POST by default and retries it only when explicitly included", () => {
    const s = {
      arrivals: resilienceArrivals(1, 0, "POST"),
      defaultFault: fault(503),
    };
    expect(run(s).attempts).toHaveLength(1);
    expect(run(s, { retryMethods: ["POST"] }).attempts).toHaveLength(4);
    expect(run({ defaultFault: fault(400) }).attempts).toHaveLength(1);
    expect(
      run({ defaultFault: fault(400) }, { retryStatuses: [400] }).attempts,
    ).toHaveLength(4);
  });
  it("distinguishes network errors, timeouts and HTTP failures with separate retry switches", () => {
    const s = { defaultFault: { ...fault(), kind: "network" as const } };
    expect(run(s).metrics).toMatchObject({ attempts: 4, failed: 1 });
    expect(run(s, { retryNetwork: false }).attempts).toHaveLength(1);
    const r = run(
      { defaultFault: fault(200, 1000) },
      { attemptTimeoutMs: 100, retryTimeout: false },
    );
    expect(r.requests[0].outcome).toBe("timeout");
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0].status).toBeNull();
  });
  it("produces repeatable full jitter addressed by request and attempt, with bounded delays", () => {
    const p = policy({ jitter: "full", baseDelayMs: 100, maxDelayMs: 250 });
    const samples = Array.from({ length: 200 }, (_, i) =>
      resilienceRetryDelay(p, 73, i, 3, null),
    );
    expect(new Set(samples).size).toBeGreaterThan(80);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThanOrEqual(250);
    expect(samples).toEqual(
      Array.from({ length: 200 }, (_, i) =>
        resilienceRetryDelay(p, 73, i, 3, null),
      ),
    );
    expect(resilienceRetryDelay(p, 73, 4, 3, 1000)).toBe(1000);
    const s = scenario({ defaultFault: fault(503) });
    expect(simulateResilience(s, p)).toEqual(simulateResilience(s, p));
    expect(
      resilienceRetryDelay(
        policy({ backoff: "fixed", baseDelayMs: 100 }),
        1,
        0,
        7,
        null,
      ),
    ).toBe(100);
  });
});

describe("circuit breaker state and concurrent attempts", () => {
  const arrivals = [0, 20, 40, 150, 151, 170].map((atMs, i) => ({
    id: `r${i}`,
    name: `Request ${i}`,
    method: "GET" as const,
    atMs,
  }));
  const outage = {
    arrivals,
    windows: [{ startMs: 0, endMs: 100, fault: fault(503) }],
  };
  const breaker = {
    breakerEnabled: true,
    failureThreshold: 2,
    openMs: 100,
    maxAttempts: 1,
  };
  it("opens on consecutive failures, admits one recovery probe and closes after success", () => {
    const r = run(outage, breaker);
    expect(
      r.events
        .filter((e) => e.type === "breaker")
        .map((e) => [e.atMs, e.state]),
    ).toEqual([
      [30, "open"],
      [150, "half-open"],
      [160, "closed"],
    ]);
    expect(r.requests.map((r) => r.outcome)).toEqual([
      "http-error",
      "http-error",
      "circuit-open",
      "success",
      "circuit-open",
      "success",
    ]);
    expect(r.attempts.find((a) => a.startedAtMs === 150)?.probe).toBe(true);
    expect(r.metrics).toMatchObject({
      openings: 1,
      shortCircuited: 2,
      attempts: 4,
    });
  });
  it("requires the configured number of successful half-open probes", () => {
    const r = run(outage, { ...breaker, halfOpenSuccesses: 2 });
    expect(
      r.events
        .filter((e) => e.type === "breaker")
        .map((e) => [e.atMs, e.state]),
    ).toEqual([
      [30, "open"],
      [150, "half-open"],
      [180, "closed"],
    ]);
    expect(r.attempts.filter((a) => a.probe)).toHaveLength(2);
  });
  it("reopens after a failed probe and rejects concurrent probe contenders", () => {
    const r = run({ arrivals, defaultFault: fault(503) }, breaker);
    expect(
      r.events
        .filter((e) => e.type === "breaker")
        .map((e) => [e.atMs, e.state]),
    ).toEqual([
      [30, "open"],
      [150, "half-open"],
      [160, "open"],
    ]);
    expect(r.requests.at(-1)?.outcome).toBe("circuit-open");
  });
  it("ignores late successes from attempts started before the circuit opened", () => {
    const r = run(
      {
        arrivals: [0, 1, 2, 110, 111].map((atMs, i) => ({
          id: `r${i}`,
          name: `R${i}`,
          method: "GET",
          atMs,
        })),
        defaultFault: fault(200, 100),
        windows: [{ startMs: 0, endMs: 1, fault: fault(503, 10) }],
      },
      { ...breaker, failureThreshold: 1 },
    );
    expect(
      r.events
        .filter((e) => e.type === "breaker")
        .map((e) => [e.atMs, e.state]),
    ).toEqual([
      [10, "open"],
      [110, "half-open"],
      [210, "closed"],
    ]);
    expect(r.requests[4].outcome).toBe("circuit-open");
  });
  it("counts timeouts and throttling as failures while ordinary client errors reset the streak", () => {
    expect(
      run(
        { arrivals: resilienceArrivals(3, 200), defaultFault: fault(429) },
        breaker,
      ).metrics.openings,
    ).toBe(2);
    const r = run(
      {
        arrivals: resilienceArrivals(3, 20),
        defaultFault: fault(503),
        windows: [{ startMs: 20, endMs: 21, fault: fault(400) }],
      },
      breaker,
    );
    expect(r.metrics.openings).toBe(0);
    expect(
      run(
        {
          arrivals: resilienceArrivals(2, 200),
          defaultFault: fault(200, 1000),
        },
        { ...breaker, failureThreshold: 1, attemptTimeoutMs: 100 },
      ).metrics.openings,
    ).toBe(2);
  });
  it("rejects queued work when failures open the circuit and does not retry short circuits", () => {
    const r = run(
      { arrivals: resilienceArrivals(5, 0), defaultFault: fault(503) },
      { ...breaker, failureThreshold: 1, concurrency: 1 },
    );
    expect(r.attempts).toHaveLength(1);
    expect(r.requests.slice(1).every((r) => r.outcome === "circuit-open")).toBe(
      true,
    );
    expect(r.requests[1].queueWaitMs).toBe(10);
  });
});

describe("experiment budgets, regression matrix and interchange", () => {
  it("evaluates inclusive budgets on unrounded metrics and includes failed requests in latency percentiles", () => {
    const r = run({
      arrivals: resilienceArrivals(3, 20),
      budgets: {
        minSuccessPercent: 100,
        maxP95Ms: 10,
        maxAmplification: 1,
        maxRejected: 0,
      },
    });
    expect(r.passed).toBe(true);
    expect(r.budgets.every((b) => b.passed)).toBe(true);
    const failed = run(
      { arrivals: resilienceArrivals(3, 20), defaultFault: fault(503) },
      { maxAttempts: 1 },
    );
    expect(failed.budgets.find((b) => b.id === "success")?.passed).toBe(false);
    const precise = run({
      arrivals: resilienceArrivals(3, 20),
      windows: [{ startMs: 0, endMs: 1, fault: fault(503) }],
      budgets: {
        minSuccessPercent: 0,
        maxP95Ms: 0,
        maxAmplification: 1.333,
        maxRejected: 200,
      },
    });
    expect(precise.metrics.amplification).toBe(1.333);
    expect(precise.budgets.find((b) => b.id === "amplification")?.passed).toBe(
      false,
    );
    expect(precise.budgets.some((b) => b.id === "p95")).toBe(false);
  });
  it("runs all saved scenario-policy pairs deterministically, without mutating their definitions", async () => {
    const p = demoResilienceProject(),
      before = JSON.stringify(p);
    const result = await runResilienceExperiment(p);
    expect(result).toMatchObject({ complete: true, completed: 9, total: 9 });
    for (const simulation of result.simulations) {
      expect(simulation).toEqual(
        simulateResilience(
          p.scenarios.find((s) => s.id === simulation.scenarioId)!,
          p.policies.find((v) => v.id === simulation.policyId)!,
        ),
      );
      expect(simulation.requests).toHaveLength(
        p.scenarios.find((s) => s.id === simulation.scenarioId)!.arrivals
          .length,
      );
    }
    expect(JSON.stringify(p)).toBe(before);
    expect(JSON.parse(serializeResilienceRun(result)).complete).toBe(true);
    expect((await runResilienceExperiment(p, "recovery")).completed).toBe(3);
  });
  it("cancels between policies, retaining only completed simulations and honest completion counts", async () => {
    const abort = new AbortController();
    const r = await runResilienceExperiment(
      demoResilienceProject(),
      undefined,
      abort.signal,
      (done) => {
        if (done === 1) abort.abort();
      },
    );
    expect(r).toMatchObject({ complete: false, total: 9, completed: 1 });
    expect(r.simulations).toHaveLength(1);
    expect(
      await runResilienceExperiment(
        demoResilienceProject(),
        undefined,
        abort.signal,
      ),
    ).toMatchObject({ complete: false, completed: 0 });
  });
  it("cancels during a large simulation without publishing partial metrics as a completed run", async () => {
    const p = emptyResilienceProject();
    p.scenarios[0].arrivals = resilienceArrivals(200, 0);
    const abort = new AbortController(),
      pending = runResilienceExperiment(p, undefined, abort.signal);
    abort.abort();
    expect(await pending).toMatchObject({
      complete: false,
      completed: 0,
      simulations: [],
    });
  });
  it("bounds maximum-size runs and keeps every attempt below both configured time limits", () => {
    const r = run(
      { arrivals: resilienceArrivals(200, 0), defaultFault: fault(503, 0) },
      {
        maxAttempts: 8,
        baseDelayMs: 0,
        maxDelayMs: 0,
        concurrency: 20,
        queueLimit: 200,
      },
    );
    expect(r.attempts).toHaveLength(1600);
    expect(r.requests).toHaveLength(200);
    expect(r.events.length).toBeLessThan(14000);
    expect(r.metrics.elapsedMs).toBe(0);
  });
  it("round-trips project definitions, ignores imported results/unknown metadata and supports prototype-like IDs", () => {
    const p = demoResilienceProject();
    p.scenarios[0].arrivals[0].id = "__proto__";
    const text = JSON.stringify({
      ...p,
      results: [{ passed: true }],
      privateUrl: "https://private.example",
    });
    const parsed = parseResilienceProject(text);
    expect(parsed).toEqual(p);
    expect(serializeResilienceProject(parsed)).not.toContain("private.example");
    expect(serializeResilienceProject(parsed)).not.toContain('"results"');
  });
  it("exports spreadsheet-safe attempt CSV with milliseconds and no request payloads", () => {
    const r = run({
      arrivals: [
        { id: " =SUM(A1)", name: "Private label", method: "GET", atMs: 0 },
      ],
    });
    const csv = resilienceAttemptsCsv(r);
    expect(csv).toContain('"\' =SUM(A1)"');
    expect(csv).toContain("startedAtMs,completedAtMs");
    expect(csv).not.toContain("Private label");
  });
  it("imports only HAR relative arrival times and methods, excluding credentials, URLs and response values", () => {
    const s = resilienceFromHar(
      JSON.stringify({
        log: {
          entries: [
            {
              startedDateTime: "2026-01-01T00:00:00.200Z",
              request: {
                method: "POST",
                url: "https://private.example?token=secret",
                headers: [{ name: "Authorization", value: "secret" }],
              },
              response: { status: 500, content: { text: "private-body" } },
            },
            {
              startedDateTime: "2026-01-01T00:00:00.000Z",
              request: { method: "GET" },
            },
          ],
        },
      }),
    );
    expect(s.arrivals.map((r) => [r.atMs, r.method])).toEqual([
      [200, "POST"],
      [0, "GET"],
    ]);
    expect(s.windows).toEqual([]);
    expect(s.defaultFault.status).toBe(200);
    expect(JSON.stringify(s)).not.toMatch(/private|secret|Authorization/);
  });
});

describe("resilience input limits and validation", () => {
  it.each([
    { maxAttempts: 0 },
    { maxAttempts: 9 },
    { concurrency: 0 },
    { concurrency: 21 },
    { queueLimit: -1 },
    { deadlineMs: NaN },
    { attemptTimeoutMs: 0 },
    { baseDelayMs: 1000, maxDelayMs: 100 },
    { halfOpenSuccesses: 0 },
    { retryStatuses: [200] },
    { retryStatuses: [503, 503] },
    { retryMethods: ["TRACE"] },
    { retryMethods: ["GET", "GET"] },
    { retryNetwork: "yes" },
    { jitter: "random-code" },
    { backoff: "eval" },
  ])("rejects invalid policy %j", (patch) => {
    throws(
      () => normalizeResiliencePolicy({ ...policy(), ...patch }),
      "policy",
    );
  });
  it("rejects overlapping/invalid fault windows, duplicate arrivals and invalid budgets", () => {
    throws(
      () =>
        normalizeResilienceScenario(
          scenario({
            windows: [
              { startMs: 0, endMs: 10, fault: fault() },
              { startMs: 9, endMs: 11, fault: fault() },
            ],
          }),
        ),
      "window",
    );
    throws(
      () =>
        normalizeResilienceScenario(
          scenario({ windows: [{ startMs: 10, endMs: 10, fault: fault() }] }),
        ),
      "window",
    );
    const a = resilienceArrivals(2, 10);
    a[1].id = a[0].id;
    throws(
      () => normalizeResilienceScenario(scenario({ arrivals: a })),
      "arrival",
    );
    throws(
      () =>
        normalizeResilienceScenario(
          scenario({
            budgets: {
              minSuccessPercent: 101,
              maxP95Ms: 0,
              maxAmplification: 1,
              maxRejected: 0,
            },
          }),
        ),
      "scenario",
    );
    throws(
      () => normalizeResilienceScenario(scenario({ arrivals: [] })),
      "scenario",
    );
    throws(() => resilienceArrivals(201), "arrival");
    throws(() => resilienceArrivals(200, 1000), "arrival");
  });
  it("rejects enum lookalikes and HAR timestamps without explicit time zones", () => {
    throws(
      () => normalizeResiliencePolicy({ ...policy(), jitter: ["full"] }),
      "policy",
    );
    throws(
      () => normalizeResiliencePolicy({ ...policy(), backoff: ["fixed"] }),
      "policy",
    );
    throws(
      () =>
        normalizeResilienceScenario({
          ...scenario(),
          defaultFault: { ...fault(), kind: ["http"] },
        }),
      "scenario",
    );
    throws(
      () =>
        resilienceFromHar(
          JSON.stringify({
            log: {
              entries: [
                {
                  startedDateTime: "2026-01-01T00:00:00",
                  request: { method: "GET" },
                },
              ],
            },
          }),
        ),
      "har",
    );
  });
  it("rejects malformed, oversized, duplicate and incompatible projects and invalid HAR captures", async () => {
    throws(() => parseResilienceProject("{"), "project");
    throws(
      () => parseResilienceProject(" ".repeat(MAX_RESILIENCE_BYTES + 1)),
      "limit",
    );
    throws(
      () =>
        parseResilienceProject(
          JSON.stringify({ ...emptyResilienceProject(), version: 2 }),
        ),
      "project",
    );
    const p = emptyResilienceProject();
    p.policies.push(p.policies[0]);
    throws(() => parseResilienceProject(JSON.stringify(p)), "project");
    for (const input of [
      {},
      { log: { entries: [] } },
      {
        log: {
          entries: [{ startedDateTime: "invalid", request: { method: "GET" } }],
        },
      },
      {
        log: {
          entries: [
            { startedDateTime: "2026-01-01", request: { method: "TRACE" } },
          ],
        },
      },
    ])
      throws(() => resilienceFromHar(JSON.stringify(input)), "har");
    await expect(
      runResilienceExperiment(emptyResilienceProject(), "missing"),
    ).rejects.toMatchObject({ code: "scenario" });
  });
});
