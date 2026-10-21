import { parseTransformValue } from "./api-transform";
import { getByteSize } from "./text-encoding";

export const MAX_RESILIENCE_BYTES = 1024 * 1024;
export const MAX_RESILIENCE_REQUESTS = 200;
export const MAX_RESILIENCE_SCENARIOS = 12;
export const MAX_RESILIENCE_POLICIES = 6;
export const RESILIENCE_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type ResilienceMethod = (typeof RESILIENCE_METHODS)[number];
export type ResilienceFault = {
  kind: "http" | "network";
  status: number;
  latencyMs: number;
  retryAfterMs: number | null;
};
export type ResilienceArrival = {
  id: string;
  name: string;
  method: ResilienceMethod;
  atMs: number;
};
export type ResilienceWindow = {
  startMs: number;
  endMs: number;
  fault: ResilienceFault;
};
export type ResilienceBudgets = {
  minSuccessPercent: number;
  maxP95Ms: number;
  maxAmplification: number;
  maxRejected: number;
};
export type ResilienceScenario = {
  id: string;
  name: string;
  seed: number;
  arrivals: ResilienceArrival[];
  windows: ResilienceWindow[];
  defaultFault: ResilienceFault;
  budgets: ResilienceBudgets;
};
export type ResiliencePolicy = {
  id: string;
  name: string;
  maxAttempts: number;
  attemptTimeoutMs: number;
  deadlineMs: number;
  retryMethods: ResilienceMethod[];
  retryStatuses: number[];
  retryNetwork: boolean;
  retryTimeout: boolean;
  respectRetryAfter: boolean;
  backoff: "fixed" | "exponential";
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: "none" | "full";
  concurrency: number;
  queueLimit: number;
  breakerEnabled: boolean;
  failureThreshold: number;
  openMs: number;
  halfOpenSuccesses: number;
};
export type ResilienceProject = {
  kind: "rsswag-resilience-project";
  version: 1;
  name: string;
  scenarios: ResilienceScenario[];
  policies: ResiliencePolicy[];
};
export type ResilienceErrorCode =
  | "json"
  | "limit"
  | "project"
  | "scenario"
  | "policy"
  | "window"
  | "arrival"
  | "har"
  | "cancelled";
export class ResilienceError extends Error {
  constructor(public code: ResilienceErrorCode) {
    super(code);
  }
}
export const resilienceError = (error: unknown) =>
  error instanceof ResilienceError ? error : new ResilienceError("project");
export type ResilienceOutcome =
  | "success"
  | "http-error"
  | "network"
  | "timeout"
  | "deadline"
  | "circuit-open"
  | "queue-full";
export type ResilienceAttempt = {
  sequence: number;
  requestId: string;
  number: number;
  startedAtMs: number;
  completedAtMs: number;
  outcome: ResilienceOutcome;
  status: number | null;
  probe: boolean;
  queueWaitMs: number;
};
export type ResilienceRequestResult = {
  id: string;
  name: string;
  method: ResilienceMethod;
  arrivedAtMs: number;
  completedAtMs: number;
  outcome: ResilienceOutcome;
  attempts: number;
  queueWaitMs: number;
  backoffMs: number;
};
export type ResilienceEvent = {
  atMs: number;
  type:
    | "arrival"
    | "queued"
    | "attempt"
    | "response"
    | "retry"
    | "finished"
    | "breaker";
  requestId?: string;
  attempt?: number;
  outcome?: ResilienceOutcome;
  delayMs?: number;
  state?: "closed" | "open" | "half-open";
};
export type ResilienceMetrics = {
  total: number;
  succeeded: number;
  failed: number;
  attempts: number;
  retries: number;
  shortCircuited: number;
  queueRejected: number;
  deadlineExceeded: number;
  timeouts: number;
  amplification: number;
  successPercent: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  peakConcurrency: number;
  peakQueue: number;
  elapsedMs: number;
  openings: number;
};
export type ResilienceBudgetResult = {
  id: "success" | "p95" | "amplification" | "rejected";
  actual: number;
  limit: number;
  passed: boolean;
};
export type ResilienceSimulation = {
  kind: "rsswag-resilience-simulation";
  version: 1;
  scenarioId: string;
  scenarioName: string;
  policyId: string;
  policyName: string;
  seed: number;
  requests: ResilienceRequestResult[];
  attempts: ResilienceAttempt[];
  events: ResilienceEvent[];
  metrics: ResilienceMetrics;
  budgets: ResilienceBudgetResult[];
  passed: boolean;
};
export type ResilienceRun = {
  kind: "rsswag-resilience-run";
  version: 1;
  complete: boolean;
  total: number;
  completed: number;
  simulations: ResilienceSimulation[];
};
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const named = (v: unknown, max = 120): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number): v is number =>
  finite(v, min, max) && Number.isInteger(v);
const method = (v: unknown): v is ResilienceMethod =>
  typeof v === "string" &&
  (RESILIENCE_METHODS as readonly string[]).includes(v);
const rounded = (n: number) => Math.round(n * 1000) / 1000;
function parseJson(
  source: string,
  code: ResilienceErrorCode = "json",
  max = MAX_RESILIENCE_BYTES,
): unknown {
  if (getByteSize(source) > max) throw new ResilienceError("limit");
  try {
    return parseTransformValue(source);
  } catch {
    throw new ResilienceError(code);
  }
}
function boundedJson(value: unknown) {
  const source = JSON.stringify(value, null, 2) + "\n";
  if (getByteSize(source) > MAX_RESILIENCE_BYTES)
    throw new ResilienceError("limit");
  return source;
}
export function normalizeResilienceFault(v: unknown): ResilienceFault {
  if (
    !record(v) ||
    (v.kind !== "http" && v.kind !== "network") ||
    !integer(v.latencyMs, 0, 120000) ||
    !integer(v.status, 200, 599) ||
    (v.retryAfterMs !== null && !integer(v.retryAfterMs, 0, 120000))
  )
    throw new ResilienceError("scenario");
  return {
    kind: v.kind as ResilienceFault["kind"],
    status: v.kind === "network" ? 200 : v.status,
    latencyMs: v.latencyMs,
    retryAfterMs:
      v.kind === "network" ? null : (v.retryAfterMs as number | null),
  };
}
export function normalizeResiliencePolicy(v: unknown): ResiliencePolicy {
  if (
    !record(v) ||
    !named(v.id, 80) ||
    !named(v.name) ||
    !integer(v.maxAttempts, 1, 8) ||
    !integer(v.attemptTimeoutMs, 1, 60000) ||
    !integer(v.deadlineMs, 1, 120000) ||
    !integer(v.baseDelayMs, 0, 30000) ||
    !integer(v.maxDelayMs, Number(v.baseDelayMs), 60000) ||
    !integer(v.concurrency, 1, 20) ||
    !integer(v.queueLimit, 0, 200) ||
    !integer(v.failureThreshold, 1, 100) ||
    !integer(v.openMs, 1, 60000) ||
    !integer(v.halfOpenSuccesses, 1, 20) ||
    (v.backoff !== "fixed" && v.backoff !== "exponential") ||
    (v.jitter !== "none" && v.jitter !== "full") ||
    [
      "retryNetwork",
      "retryTimeout",
      "respectRetryAfter",
      "breakerEnabled",
    ].some((k) => typeof v[k] !== "boolean") ||
    !Array.isArray(v.retryMethods) ||
    v.retryMethods.some((m) => !method(m)) ||
    new Set(v.retryMethods).size !== v.retryMethods.length ||
    !Array.isArray(v.retryStatuses) ||
    v.retryStatuses.length > 30 ||
    v.retryStatuses.some((s) => !integer(s, 400, 599)) ||
    new Set(v.retryStatuses).size !== v.retryStatuses.length
  )
    throw new ResilienceError("policy");
  return {
    id: v.id,
    name: v.name,
    maxAttempts: v.maxAttempts,
    attemptTimeoutMs: v.attemptTimeoutMs,
    deadlineMs: v.deadlineMs,
    retryMethods: [...v.retryMethods] as ResilienceMethod[],
    retryStatuses: [...v.retryStatuses] as number[],
    retryNetwork: v.retryNetwork as boolean,
    retryTimeout: v.retryTimeout as boolean,
    respectRetryAfter: v.respectRetryAfter as boolean,
    backoff: v.backoff as ResiliencePolicy["backoff"],
    baseDelayMs: v.baseDelayMs,
    maxDelayMs: v.maxDelayMs,
    jitter: v.jitter as ResiliencePolicy["jitter"],
    concurrency: v.concurrency,
    queueLimit: v.queueLimit,
    breakerEnabled: v.breakerEnabled as boolean,
    failureThreshold: v.failureThreshold,
    openMs: v.openMs,
    halfOpenSuccesses: v.halfOpenSuccesses,
  };
}
export function normalizeResilienceScenario(v: unknown): ResilienceScenario {
  if (
    !record(v) ||
    !named(v.id, 80) ||
    !named(v.name) ||
    !integer(v.seed, 0, 4294967295) ||
    !Array.isArray(v.arrivals) ||
    !v.arrivals.length ||
    v.arrivals.length > MAX_RESILIENCE_REQUESTS ||
    !Array.isArray(v.windows) ||
    v.windows.length > 50 ||
    !record(v.budgets)
  )
    throw new ResilienceError("scenario");
  const arrivals = v.arrivals.map((r): ResilienceArrival => {
    if (
      !record(r) ||
      !named(r.id, 80) ||
      !named(r.name) ||
      !method(r.method) ||
      !integer(r.atMs, 0, 120000)
    )
      throw new ResilienceError("arrival");
    return { id: r.id, name: r.name, method: r.method, atMs: r.atMs };
  });
  if (new Set(arrivals.map((r) => r.id)).size !== arrivals.length)
    throw new ResilienceError("arrival");
  const windows = v.windows
    .map((w): ResilienceWindow => {
      if (
        !record(w) ||
        !integer(w.startMs, 0, 239999) ||
        !integer(w.endMs, Number(w.startMs) + 1, 240000)
      )
        throw new ResilienceError("window");
      return {
        startMs: w.startMs,
        endMs: w.endMs,
        fault: normalizeResilienceFault(w.fault),
      };
    })
    .sort((a, b) => a.startMs - b.startMs);
  if (windows.some((w, i) => i > 0 && w.startMs < windows[i - 1].endMs))
    throw new ResilienceError("window");
  const b = v.budgets;
  if (
    !finite(b.minSuccessPercent, 0, 100) ||
    !integer(b.maxP95Ms, 0, 120000) ||
    !finite(b.maxAmplification, 1, 8) ||
    !integer(b.maxRejected, 0, 200)
  )
    throw new ResilienceError("scenario");
  return {
    id: v.id,
    name: v.name,
    seed: v.seed,
    arrivals,
    windows,
    defaultFault: normalizeResilienceFault(v.defaultFault),
    budgets: {
      minSuccessPercent: b.minSuccessPercent,
      maxP95Ms: b.maxP95Ms,
      maxAmplification: b.maxAmplification,
      maxRejected: b.maxRejected,
    },
  };
}
export function parseResilienceProject(source: string): ResilienceProject {
  const v = parseJson(source, "project");
  if (
    !record(v) ||
    v.kind !== "rsswag-resilience-project" ||
    v.version !== 1 ||
    !named(v.name, 200) ||
    !Array.isArray(v.scenarios) ||
    !v.scenarios.length ||
    v.scenarios.length > MAX_RESILIENCE_SCENARIOS ||
    !Array.isArray(v.policies) ||
    !v.policies.length ||
    v.policies.length > MAX_RESILIENCE_POLICIES
  )
    throw new ResilienceError("project");
  const scenarios = v.scenarios.map(normalizeResilienceScenario),
    policies = v.policies.map(normalizeResiliencePolicy);
  if (
    new Set(scenarios.map((s) => s.id)).size !== scenarios.length ||
    new Set(policies.map((p) => p.id)).size !== policies.length
  )
    throw new ResilienceError("project");
  return {
    kind: "rsswag-resilience-project",
    version: 1,
    name: v.name,
    scenarios,
    policies,
  };
}
export const serializeResilienceProject = (project: ResilienceProject) =>
  boundedJson(parseResilienceProject(JSON.stringify(project)));
export function resilienceArrivals(
  count = 12,
  spacingMs = 200,
  requestMethod: ResilienceMethod = "GET",
): ResilienceArrival[] {
  if (
    !integer(count, 1, MAX_RESILIENCE_REQUESTS) ||
    !integer(spacingMs, 0, 120000) ||
    (count - 1) * spacingMs > 120000 ||
    !method(requestMethod)
  )
    throw new ResilienceError("arrival");
  return Array.from({ length: count }, (_, i) => ({
    id: `request-${i + 1}`,
    name: `Request ${i + 1}`,
    method: requestMethod,
    atMs: i * spacingMs,
  }));
}
export function defaultResiliencePolicy(
  id = "retry",
  name = "Bounded retries",
): ResiliencePolicy {
  return {
    id,
    name,
    maxAttempts: 4,
    attemptTimeoutMs: 500,
    deadlineMs: 4000,
    retryMethods: ["GET", "HEAD", "OPTIONS"],
    retryStatuses: [429, 500, 502, 503, 504],
    retryNetwork: true,
    retryTimeout: true,
    respectRetryAfter: true,
    backoff: "exponential",
    baseDelayMs: 150,
    maxDelayMs: 1000,
    jitter: "full",
    concurrency: 4,
    queueLimit: 40,
    breakerEnabled: false,
    failureThreshold: 3,
    openMs: 500,
    halfOpenSuccesses: 1,
  };
}
export function defaultResilienceScenario(
  id = "healthy",
  name = "Healthy upstream",
): ResilienceScenario {
  return {
    id,
    name,
    seed: 73,
    arrivals: resilienceArrivals(),
    windows: [],
    defaultFault: {
      kind: "http",
      status: 200,
      latencyMs: 40,
      retryAfterMs: null,
    },
    budgets: {
      minSuccessPercent: 80,
      maxP95Ms: 2500,
      maxAmplification: 3,
      maxRejected: 5,
    },
  };
}
export function emptyResilienceProject(): ResilienceProject {
  return {
    kind: "rsswag-resilience-project",
    version: 1,
    name: "API resilience experiment",
    scenarios: [defaultResilienceScenario()],
    policies: [
      { ...defaultResiliencePolicy("baseline", "No retries"), maxAttempts: 1 },
      defaultResiliencePolicy(),
    ],
  };
}
export function demoResilienceProject(): ResilienceProject {
  const healthy = defaultResilienceScenario(
    "recovery",
    "Temporary outage and recovery",
  );
  return {
    ...emptyResilienceProject(),
    name: "API resilience comparison demo",
    scenarios: [
      {
        ...healthy,
        windows: [
          {
            startMs: 0,
            endMs: 700,
            fault: {
              kind: "http",
              status: 503,
              latencyMs: 40,
              retryAfterMs: null,
            },
          },
        ],
      },
      {
        ...defaultResilienceScenario(
          "throttling",
          "Rate limiting with retry delay",
        ),
        arrivals: resilienceArrivals(20, 50),
        windows: [
          {
            startMs: 0,
            endMs: 600,
            fault: {
              kind: "http",
              status: 429,
              latencyMs: 20,
              retryAfterMs: 400,
            },
          },
        ],
      },
      {
        ...defaultResilienceScenario(
          "slow",
          "Slow upstream and a request burst",
        ),
        arrivals: resilienceArrivals(12, 80),
        windows: [
          {
            startMs: 0,
            endMs: 1000,
            fault: {
              kind: "http",
              status: 200,
              latencyMs: 1500,
              retryAfterMs: null,
            },
          },
        ],
      },
    ],
    policies: [
      { ...defaultResiliencePolicy("baseline", "No retries"), maxAttempts: 1 },
      defaultResiliencePolicy(),
      {
        ...defaultResiliencePolicy("protected", "Retries with circuit breaker"),
        breakerEnabled: true,
      },
    ],
  };
}

// Randomness is addressed by logical request and attempt, so policies do not
// consume one another's random streams when concurrency changes event ordering.
export function resilienceRetryDelay(
  policy: ResiliencePolicy,
  seed: number,
  requestIndex: number,
  attempt: number,
  retryAfterMs: number | null,
): number {
  const cap = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs *
      (policy.backoff === "exponential" ? 2 ** (attempt - 1) : 1),
  );
  let x =
    (seed ^
      Math.imul(requestIndex + 1, 0x9e3779b1) ^
      Math.imul(attempt, 0x85ebca6b)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  const delay =
    policy.jitter === "full" ? Math.floor((x / 4294967296) * (cap + 1)) : cap;
  return Math.max(delay, policy.respectRetryAfter ? (retryAfterMs ?? 0) : 0);
}

type Runtime = {
  arrival: ResilienceArrival;
  index: number;
  state: "new" | "queued" | "running" | "backoff" | "done";
  attempts: number;
  queuedAt: number;
  queueWaitMs: number;
  backoffMs: number;
  backoffAt: number;
  activeAttempt?: number;
  result?: ResilienceRequestResult;
};
type Scheduled = {
  at: number;
  order: number;
  kind: "deadline" | "complete" | "ready";
  request: number;
  attempt?: number;
  fault?: ResilienceFault;
  epoch?: number;
};
function* simulationSteps(
  scenario: ResilienceScenario,
  policy: ResiliencePolicy,
): Generator<void, ResilienceSimulation> {
  const s = normalizeResilienceScenario(scenario),
    p = normalizeResiliencePolicy(policy);
  const requests: Runtime[] = s.arrivals.map((arrival, index) => ({
    arrival,
    index,
    state: "new",
    attempts: 0,
    queuedAt: 0,
    queueWaitMs: 0,
    backoffMs: 0,
    backoffAt: 0,
  }));
  const attempts: ResilienceAttempt[] = [],
    events: ResilienceEvent[] = [],
    scheduled: Scheduled[] = [],
    queue: number[] = [];
  let now = 0,
    order = 0,
    active = 0,
    peakConcurrency = 0,
    peakQueue = 0,
    processed = 0;
  let state: "closed" | "open" | "half-open" = "closed",
    epoch = 0,
    openUntil = 0,
    failures = 0,
    probeBusy = false,
    probeSuccesses = 0,
    openings = 0;
  const priority = { deadline: 0, complete: 1, ready: 2 };
  const schedule = (entry: Omit<Scheduled, "order">) =>
    scheduled.push({ ...entry, order: order++ });
  const event = (entry: Omit<ResilienceEvent, "atMs">) =>
    events.push({ atMs: now, ...entry });
  function transition(next: typeof state) {
    state = next;
    event({ type: "breaker", state });
    if (next === "open") {
      openings++;
      epoch++;
      openUntil = now + p.openMs;
      probeBusy = false;
      probeSuccesses = 0;
    }
    if (next === "closed") {
      epoch++;
      failures = 0;
      probeSuccesses = 0;
      probeBusy = false;
    }
  }
  function breakerAllows(): boolean {
    if (!p.breakerEnabled) return true;
    if (state === "open" && now >= openUntil) transition("half-open");
    return state === "closed" || (state === "half-open" && !probeBusy);
  }
  function breakerResult(
    failed: boolean,
    attempt: ResilienceAttempt,
    startedEpoch: number,
  ) {
    if (!p.breakerEnabled || startedEpoch !== epoch) return;
    if (attempt.probe) {
      probeBusy = false;
      if (failed) transition("open");
      else if (++probeSuccesses >= p.halfOpenSuccesses) transition("closed");
    } else if (state === "closed") {
      failures = failed ? failures + 1 : 0;
      if (failures >= p.failureThreshold) transition("open");
    }
  }
  function finish(r: Runtime, outcome: ResilienceOutcome) {
    if (r.state === "queued") r.queueWaitMs += now - r.queuedAt;
    if (r.state === "backoff") r.backoffMs += now - r.backoffAt;
    r.state = "done";
    r.result = {
      id: r.arrival.id,
      name: r.arrival.name,
      method: r.arrival.method,
      arrivedAtMs: r.arrival.atMs,
      completedAtMs: now,
      outcome,
      attempts: r.attempts,
      queueWaitMs: r.queueWaitMs,
      backoffMs: r.backoffMs,
    };
    event({ type: "finished", requestId: r.arrival.id, outcome });
  }
  function dispatch(r: Runtime) {
    // A completion can free a slot at the exact deadline of another queued
    // request, before that request's own deadline event has been processed.
    if (now >= r.arrival.atMs + p.deadlineMs) {
      finish(r, "deadline");
      return;
    }
    if (!breakerAllows()) {
      finish(r, "circuit-open");
      return;
    }
    const wait = r.state === "queued" ? now - r.queuedAt : 0;
    r.queueWaitMs += wait;
    const fault =
      s.windows.find((w) => w.startMs <= now && now < w.endMs)?.fault ??
      s.defaultFault;
    const deadline = r.arrival.atMs + p.deadlineMs;
    const duration = Math.min(
      fault.latencyMs,
      p.attemptTimeoutMs,
      deadline - now,
    );
    const outcome: ResilienceOutcome =
      duration === deadline - now
        ? "deadline"
        : fault.latencyMs >= p.attemptTimeoutMs
          ? "timeout"
          : fault.kind === "network"
            ? "network"
            : fault.status < 400
              ? "success"
              : "http-error";
    const attempt: ResilienceAttempt = {
      sequence: attempts.length + 1,
      requestId: r.arrival.id,
      number: ++r.attempts,
      startedAtMs: now,
      completedAtMs: now + duration,
      outcome,
      status:
        outcome === "success" || outcome === "http-error" ? fault.status : null,
      probe: p.breakerEnabled && state === "half-open",
      queueWaitMs: wait,
    };
    r.state = "running";
    r.activeAttempt = attempts.length;
    attempts.push(attempt);
    active++;
    peakConcurrency = Math.max(peakConcurrency, active);
    if (attempt.probe) probeBusy = true;
    event({ type: "attempt", requestId: r.arrival.id, attempt: r.attempts });
    schedule({
      at: now + duration,
      kind: "complete",
      request: r.index,
      attempt: r.activeAttempt,
      fault,
      epoch,
    });
  }
  function drain() {
    while (active < p.concurrency && queue.length) {
      const r = requests[queue.shift()!];
      if (r.state === "queued") dispatch(r);
    }
  }
  requests.forEach((r) => {
    schedule({ at: r.arrival.atMs, kind: "ready", request: r.index });
    schedule({
      at: r.arrival.atMs + p.deadlineMs,
      kind: "deadline",
      request: r.index,
    });
  });
  while (scheduled.length) {
    if (++processed > 12000 || events.length > 14000)
      throw new ResilienceError("limit");
    if (processed % 64 === 0) yield;
    scheduled.sort(
      (a, b) =>
        a.at - b.at || priority[a.kind] - priority[b.kind] || a.order - b.order,
    );
    const entry = scheduled.shift()!,
      r = requests[entry.request];
    now = entry.at;
    if (r.state === "done") continue;
    if (entry.kind === "deadline") {
      if (r.state === "running" && r.activeAttempt !== undefined) {
        const a = attempts[r.activeAttempt];
        a.completedAtMs = now;
        a.outcome = "deadline";
        a.status = null;
        active--;
        const completion = scheduled.find(
          (e) => e.kind === "complete" && e.attempt === r.activeAttempt,
        );
        breakerResult(true, a, completion?.epoch ?? -1);
        event({
          type: "response",
          requestId: r.arrival.id,
          attempt: a.number,
          outcome: "deadline",
        });
      }
      finish(r, "deadline");
      drain();
      continue;
    }
    if (entry.kind === "complete") {
      if (r.state !== "running" || r.activeAttempt !== entry.attempt) continue;
      const a = attempts[entry.attempt!];
      active--;
      event({
        type: "response",
        requestId: r.arrival.id,
        attempt: a.number,
        outcome: a.outcome,
      });
      const failed =
        a.outcome === "network" ||
        a.outcome === "timeout" ||
        a.outcome === "deadline" ||
        (a.status !== null && (a.status === 429 || a.status >= 500));
      breakerResult(failed, a, entry.epoch!);
      const retryable =
        a.outcome === "network"
          ? p.retryNetwork
          : a.outcome === "timeout"
            ? p.retryTimeout
            : a.outcome === "http-error" && p.retryStatuses.includes(a.status!);
      if (
        a.outcome !== "success" &&
        a.outcome !== "deadline" &&
        retryable &&
        r.attempts < p.maxAttempts &&
        p.retryMethods.includes(r.arrival.method)
      ) {
        const delay = resilienceRetryDelay(
          p,
          s.seed,
          r.index,
          r.attempts,
          a.outcome === "http-error" ? entry.fault!.retryAfterMs : null,
        );
        r.state = "backoff";
        r.backoffAt = now;
        event({
          type: "retry",
          requestId: r.arrival.id,
          attempt: r.attempts + 1,
          delayMs: delay,
        });
        schedule({ at: now + delay, kind: "ready", request: r.index });
      } else finish(r, a.outcome);
      drain();
      continue;
    }
    if (r.state !== "new" && r.state !== "backoff") continue;
    if (r.state === "new") event({ type: "arrival", requestId: r.arrival.id });
    else r.backoffMs += now - r.backoffAt;
    r.state = "new";
    if (!breakerAllows()) finish(r, "circuit-open");
    else if (active < p.concurrency && !queue.length) dispatch(r);
    else {
      // Expired queue entries do not consume admission capacity.
      const live = queue.filter((index) => requests[index].state === "queued");
      queue.splice(0, queue.length, ...live);
      if (queue.length >= p.queueLimit) finish(r, "queue-full");
      else {
        r.state = "queued";
        r.queuedAt = now;
        queue.push(r.index);
        peakQueue = Math.max(peakQueue, queue.length);
        event({ type: "queued", requestId: r.arrival.id });
      }
    }
  }
  const results = requests.map((r) => r.result!);
  const durations = results
    .map((r) => r.completedAtMs - r.arrivedAtMs)
    .sort((a, b) => a - b);
  const percentile = (q: number) =>
    durations[Math.max(0, Math.ceil(durations.length * q) - 1)];
  const succeeded = results.filter((r) => r.outcome === "success").length;
  const metrics: ResilienceMetrics = {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    attempts: attempts.length,
    retries: attempts.filter((a) => a.number > 1).length,
    shortCircuited: results.filter((r) => r.outcome === "circuit-open").length,
    queueRejected: results.filter((r) => r.outcome === "queue-full").length,
    deadlineExceeded: results.filter((r) => r.outcome === "deadline").length,
    timeouts: attempts.filter((a) => a.outcome === "timeout").length,
    amplification: rounded(attempts.length / results.length),
    successPercent: rounded((succeeded / results.length) * 100),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: durations.at(-1)!,
    peakConcurrency,
    peakQueue,
    elapsedMs: Math.max(...results.map((r) => r.completedAtMs)),
    openings,
  };
  const budgets: ResilienceBudgetResult[] = [
    {
      id: "success",
      actual: metrics.successPercent,
      limit: s.budgets.minSuccessPercent,
      passed: (succeeded / results.length) * 100 >= s.budgets.minSuccessPercent,
    },
    ...(s.budgets.maxP95Ms
      ? [
          {
            id: "p95" as const,
            actual: metrics.p95Ms,
            limit: s.budgets.maxP95Ms,
            passed: metrics.p95Ms <= s.budgets.maxP95Ms,
          },
        ]
      : []),
    {
      id: "amplification",
      actual: metrics.amplification,
      limit: s.budgets.maxAmplification,
      passed: attempts.length / results.length <= s.budgets.maxAmplification,
    },
    {
      id: "rejected",
      actual: metrics.shortCircuited + metrics.queueRejected,
      limit: s.budgets.maxRejected,
      passed:
        metrics.shortCircuited + metrics.queueRejected <= s.budgets.maxRejected,
    },
  ];
  return {
    kind: "rsswag-resilience-simulation",
    version: 1,
    scenarioId: s.id,
    scenarioName: s.name,
    policyId: p.id,
    policyName: p.name,
    seed: s.seed,
    requests: results,
    attempts,
    events,
    metrics,
    budgets,
    passed: budgets.every((b) => b.passed),
  };
}
export function simulateResilience(
  scenario: ResilienceScenario,
  policy: ResiliencePolicy,
): ResilienceSimulation {
  const iterator = simulationSteps(scenario, policy);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}
export async function runResilienceExperiment(
  project: ResilienceProject,
  scenarioId?: string,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<ResilienceRun> {
  const p = parseResilienceProject(JSON.stringify(project)),
    simulations: ResilienceSimulation[] = [];
  const scenarios =
    scenarioId === undefined
      ? p.scenarios
      : p.scenarios.filter((s) => s.id === scenarioId);
  if (!scenarios.length) throw new ResilienceError("scenario");
  const total = scenarios.length * p.policies.length;
  for (const scenario of scenarios)
    for (const policy of p.policies) {
      if (signal?.aborted)
        return {
          kind: "rsswag-resilience-run",
          version: 1,
          total,
          completed: simulations.length,
          complete: false,
          simulations,
        };
      const iterator = simulationSteps(scenario, policy);
      let step = iterator.next();
      while (!step.done && !signal?.aborted) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        step = iterator.next();
      }
      if (signal?.aborted)
        return {
          kind: "rsswag-resilience-run",
          version: 1,
          total,
          completed: simulations.length,
          complete: false,
          simulations,
        };
      simulations.push(step.value as ResilienceSimulation);
      onProgress?.(simulations.length, total);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  return {
    kind: "rsswag-resilience-run",
    version: 1,
    total,
    completed: simulations.length,
    complete: true,
    simulations,
  };
}

export function serializeResilienceRun(run: ResilienceRun) {
  // Reports may be larger than projects but are bounded by the experiment limits.
  const output = JSON.stringify(run, null, 2) + "\n";
  if (getByteSize(output) > 32 * 1024 * 1024)
    throw new ResilienceError("limit");
  return output;
}
function csvCell(value: string | number | null) {
  let text = String(value ?? "");
  if (/^\s*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function resilienceAttemptsCsv(
  simulation: ResilienceSimulation,
): string {
  const headers = [
    "sequence",
    "requestId",
    "number",
    "startedAtMs",
    "completedAtMs",
    "outcome",
    "status",
    "probe",
    "queueWaitMs",
  ] as const;
  return (
    [
      headers.join(","),
      ...simulation.attempts.map((a) =>
        headers
          .map((k) =>
            csvCell(
              typeof a[k] === "boolean"
                ? String(a[k])
                : (a[k] as string | number | null),
            ),
          )
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
export function resilienceFromHar(source: string): ResilienceScenario {
  const value = parseJson(source, "har", 2 * MAX_RESILIENCE_BYTES);
  if (
    !record(value) ||
    !record(value.log) ||
    !Array.isArray(value.log.entries) ||
    !value.log.entries.length ||
    value.log.entries.length > MAX_RESILIENCE_REQUESTS
  )
    throw new ResilienceError("har");
  const entries = value.log.entries.map((entry) => {
    if (
      !record(entry) ||
      typeof entry.startedDateTime !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        entry.startedDateTime,
      ) ||
      !record(entry.request) ||
      !method(entry.request.method)
    )
      throw new ResilienceError("har");
    const time = Date.parse(entry.startedDateTime);
    if (!Number.isFinite(time)) throw new ResilienceError("har");
    return { time, method: entry.request.method };
  });
  const origin = Math.min(...entries.map((e) => e.time));
  return normalizeResilienceScenario({
    ...defaultResilienceScenario(crypto.randomUUID(), "Recorded HAR arrivals"),
    arrivals: entries.map((e, i) => ({
      id: `har-${i + 1}`,
      name: `Recorded request ${i + 1}`,
      method: e.method,
      atMs: e.time - origin,
    })),
  });
}
