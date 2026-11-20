import { encodeUtf8 } from "./text-encoding";
import {
  normalizeRTConfig,
  normalizeRTProject,
  normalizeRTRequest,
  parseRTPattern,
  parseRTUrl,
  RTError,
  type RTBackend,
  type RTConfig,
  type RTPool,
  type RTRoute,
  type RTRequest,
  type RTCase,
  type RTProject,
  type RTExpectation,
  type RTSegment,
} from "./routing-model";

export type RTBackendState = {
  id: string;
  healthy: boolean;
  active: number;
  failures: number;
  ejectedUntil: number;
};
export type RTTrace = {
  route: string;
  matched: boolean;
  reason: "disabled" | "method" | "path" | "filter" | "match";
};
export type RTDecision = {
  requestId: string;
  atMs: number;
  route: string | null;
  pool: string | null;
  backend: string | null;
  token: string | null;
  status: number | null;
  reason:
    | "forwarded"
    | "not-found"
    | "unavailable"
    | "capacity"
    | "sticky-key"
    | "rewrite";
  upstreamUrl: string | null;
  headers: Record<string, string> | null;
  audit: RTTrace[];
};
export type RTRequestRun = RTDecision & {
  status: number;
  completedAtMs: number;
  matched: boolean | null;
};
export type RTJournal = {
  atMs: number;
  kind: "dispatch" | "complete" | "health";
  request: string | null;
  backend: string | null;
  states: RTBackendState[];
};
export type RTCaseRun = {
  caseId: string;
  requests: RTRequestRun[];
  journal: RTJournal[];
  forwarded: number;
  rejected: number;
  upstreamFailures: number;
  backendCounts: Record<string, number>;
  routeCounts: Record<string, number>;
  matched: boolean | null;
};
export type RTOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: {
    completed: number;
    total: number;
    caseId: string;
  }) => void;
  yield?: () => Promise<void>;
};
function checkpoint(options: RTOptions) {
  if (options.signal?.aborted) throw new RTError("cancelled");
}
async function pause(
  options: RTOptions,
  completed: number,
  total: number,
  caseId: string,
) {
  checkpoint(options);
  options.onProgress?.({ completed, total, caseId });
  await (options.yield?.() ??
    new Promise<void>((resolve) => setTimeout(resolve, 0)));
  checkpoint(options);
}
export function matchRTPath(
  pattern: RTSegment[],
  pathname: string,
): Record<string, string> | null {
  const parts = pathname.slice(1).split("/"),
    captures: [string, string][] = [];
  let index = 0;
  for (const segment of pattern) {
    if (segment.kind === "rest") {
      captures.push([segment.name, parts.slice(index).join("/")]);
      index = parts.length;
      break;
    }
    if (index >= parts.length) return null;
    const raw = parts[index++];
    if (segment.kind === "parameter") {
      if (!raw) return null;
      captures.push([segment.name, raw]);
    } else {
      let value: string;
      try {
        value = decodeURIComponent(raw);
      } catch {
        return null;
      }
      if (value !== segment.value) return null;
    }
  }
  return index === parts.length ? Object.fromEntries(captures) : null;
}
function valuesFor(
  request: RTRequest,
  url: URL,
  target: "header" | "query",
  name: string,
) {
  return target === "query"
    ? url.searchParams.getAll(name)
    : Object.hasOwn(request.headers, name)
      ? [request.headers[name]]
      : [];
}
function filterPass(route: RTRoute, request: RTRequest, url: URL) {
  return route.filters.every((filter) => {
    const values = valuesFor(request, url, filter.target, filter.name);
    return filter.op === "exists"
      ? values.length > 0
      : filter.op === "absent"
        ? values.length === 0
        : values.some((value) =>
            filter.op === "equals"
              ? value === filter.value
              : value.includes(filter.value),
          );
  });
}
function hash(value: string) {
  let h = 2166136261;
  for (const byte of encodeUtf8(value)) h = Math.imul(h ^ byte, 16777619) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
function upstreamUrl(
  backend: RTBackend,
  rewrite: RTSegment[] | null,
  captures: Record<string, string>,
  incoming: URL,
) {
  const path =
    rewrite === null
      ? incoming.pathname
      : "/" +
        rewrite
          .map((segment) =>
            segment.kind === "literal"
              ? encodeURIComponent(segment.value)
              : captures[segment.name],
          )
          .join("/");
  const base = new URL(backend.url),
    prefix = base.pathname.replace(/\/+$/, ""),
    result = new URL(`${base.origin}${prefix}${path}${incoming.search}`);
  if (
    result.origin !== base.origin ||
    (prefix && !result.pathname.startsWith(`${prefix}/`))
  )
    throw new RTError("url");
  return result.href;
}
export function routingDiagnostics(input: RTConfig) {
  const config = normalizeRTConfig(input),
    seen = new Map<string, string>();
  const result: { route: string; shadowedBy: string }[] = [];
  for (const route of config.routes) {
    if (!route.enabled) continue;
    const signature = JSON.stringify([
      parseRTPattern(route.path).map((segment) =>
        segment.kind === "literal"
          ? ["literal", segment.value]
          : [segment.kind],
      ),
      [...route.methods].sort(),
      route.filters
        .map((filter) =>
          JSON.stringify([
            filter.target,
            filter.name,
            filter.op,
            filter.op === "exists" || filter.op === "absent"
              ? null
              : filter.value,
          ]),
        )
        .sort(),
    ]);
    const previous = seen.get(signature);
    if (previous) result.push({ route: route.id, shadowedBy: previous });
    else seen.set(signature, route.id);
  }
  return result;
}
export function createRTRouter(input: RTConfig) {
  const config = normalizeRTConfig(input),
    backends = new Map(config.backends.map((backend) => [backend.id, backend])),
    pools = new Map(config.pools.map((pool) => [pool.id, pool]));
  const states = new Map(
    config.backends.map((backend) => [
      backend.id,
      {
        id: backend.id,
        healthy: backend.healthy,
        active: 0,
        failures: 0,
        ejectedUntil: 0,
      },
    ]),
  );
  const patterns = new Map(
      config.routes.map((route) => [route.id, parseRTPattern(route.path)]),
    ),
    rewrites = new Map(
      config.routes.map((route) => [
        route.id,
        route.rewrite === null ? null : parseRTPattern(route.rewrite, true),
      ]),
    ),
    currents = new Map(
      config.pools.map((pool) => [
        pool.id,
        new Map(pool.members.map((id) => [id, 0])),
      ]),
    );
  const reservations = new Map<string, string>();
  let time = 0,
    sequence = 0;
  function advance(now: number) {
    if (
      !Number.isSafeInteger(now) ||
      now < time ||
      now > Number.MAX_SAFE_INTEGER - 600000
    )
      throw new RTError("clock");
    time = now;
    for (const state of states.values())
      if (state.ejectedUntil && now >= state.ejectedUntil) {
        state.ejectedUntil = 0;
        state.failures = 0;
      }
  }
  function weighted(pool: RTPool, eligible: RTBackend[]) {
    const scores = currents.get(pool.id)!;
    for (const member of pool.members)
      if (!eligible.some((backend) => backend.id === member))
        scores.set(member, 0);
    let best = eligible[0],
      total = 0;
    for (const backend of eligible) {
      total += backend.weight;
      scores.set(backend.id, scores.get(backend.id)! + backend.weight);
      if (scores.get(backend.id)! > scores.get(best.id)!) best = backend;
    }
    scores.set(best.id, scores.get(best.id)! - total);
    return best;
  }
  function select(pool: RTPool, eligible: RTBackend[], key: string) {
    if (pool.algorithm === "round-robin") return weighted(pool, eligible);
    if (pool.algorithm === "least-active") {
      let best = eligible[0];
      for (const backend of eligible)
        if (
          states.get(backend.id)!.active * best.weight <
          states.get(best.id)!.active * backend.weight
        )
          best = backend;
      return weighted(
        pool,
        eligible.filter(
          (backend) =>
            states.get(backend.id)!.active * best.weight ===
            states.get(best.id)!.active * backend.weight,
        ),
      );
    }
    let best = eligible[0],
      score = Infinity;
    for (const backend of eligible) {
      const value =
        -Math.log(
          (hash(JSON.stringify([pool.id, key, backend.id])) + 1) /
            (2 ** 32 + 1),
        ) / backend.weight;
      if (value < score) {
        score = value;
        best = backend;
      }
    }
    return best;
  }
  function dispatch(raw: RTRequest, now = time): RTDecision {
    const request = normalizeRTRequest(raw),
      url = parseRTUrl(request.url);
    advance(now);
    const audit: RTTrace[] = [];
    let selected: RTRoute | undefined,
      captures: Record<string, string> = {};
    for (const route of config.routes) {
      const acceptsMethod =
          route.enabled &&
          (route.methods.includes("*") ||
            route.methods.includes(request.method)),
        path = acceptsMethod
          ? matchRTPath(patterns.get(route.id)!, url.pathname)
          : null;
      const reason: RTTrace["reason"] = !route.enabled
        ? "disabled"
        : !acceptsMethod
          ? "method"
          : path === null
            ? "path"
            : !filterPass(route, request, url)
              ? "filter"
              : "match";
      audit.push({ route: route.id, matched: reason === "match", reason });
      if (reason === "match") {
        selected = route;
        captures = path!;
        break;
      }
    }
    const decision: RTDecision = {
      requestId: request.id,
      atMs: now,
      route: selected?.id ?? null,
      pool: selected?.pool ?? null,
      backend: null,
      token: null,
      status: 404,
      reason: "not-found",
      upstreamUrl: null,
      headers: null,
      audit,
    };
    if (!selected) return decision;
    const pool = pools.get(selected.pool)!,
      key = valuesFor(request, url, pool.key.target, pool.key.name)[0] ?? "";
    if (pool.algorithm === "sticky" && !key)
      return { ...decision, status: 400, reason: "sticky-key" };
    const healthy = pool.members
      .map((id) => backends.get(id)!)
      .filter((backend) => {
        const state = states.get(backend.id)!;
        return state.healthy && state.ejectedUntil <= now;
      });
    if (!healthy.length)
      return { ...decision, status: 503, reason: "unavailable" };
    const eligible = healthy.filter(
      (backend) => states.get(backend.id)!.active < backend.capacity,
    );
    if (!eligible.length)
      return { ...decision, status: 503, reason: "capacity" };
    const backend = select(pool, eligible, key);
    let target: string;
    try {
      target = upstreamUrl(backend, rewrites.get(selected.id)!, captures, url);
    } catch {
      return { ...decision, status: 400, reason: "rewrite" };
    }
    if (sequence >= Number.MAX_SAFE_INTEGER) throw new RTError("limit");
    const token = `dispatch-${++sequence}`;
    reservations.set(token, backend.id);
    states.get(backend.id)!.active++;
    return {
      ...decision,
      status: null,
      reason: "forwarded",
      backend: backend.id,
      token,
      upstreamUrl: target,
      headers: { ...request.headers, ...selected.setHeaders },
    };
  }
  function complete(token: string, status: number, now = time) {
    if (!Number.isInteger(status) || status < 100 || status > 599)
      throw new RTError("project");
    advance(now);
    const backend = reservations.get(token);
    if (!backend) return false;
    reservations.delete(token);
    const state = states.get(backend)!;
    state.active--;
    if (status < 500) state.failures = 0;
    else if (config.health.failureThreshold > 0) {
      state.failures++;
      if (state.failures >= config.health.failureThreshold) {
        state.failures = 0;
        state.ejectedUntil = now + config.health.cooldownMs;
      }
    }
    return true;
  }
  function setHealthy(backend: string, healthy: boolean, now = time) {
    const state = states.get(backend);
    if (!state || typeof healthy !== "boolean") throw new RTError("reference");
    advance(now);
    state.healthy = healthy;
    if (healthy) {
      state.failures = 0;
      state.ejectedUntil = 0;
    }
  }
  return {
    dispatch,
    complete,
    setHealthy,
    advance,
    snapshot: () =>
      config.backends.map((backend) => ({ ...states.get(backend.id)! })),
  };
}
type Event = { atMs: number; priority: number; order: number } & (
  | { kind: "request"; index: number }
  | { kind: "health"; index: number }
  | { kind: "complete"; index: number; token: string; status: number }
);
const compareEvent = (a: Event, b: Event) =>
  a.atMs - b.atMs || a.priority - b.priority || a.order - b.order;
async function replay(
  config: RTConfig,
  scenario: RTCase,
  options: RTOptions,
): Promise<RTCaseRun> {
  const router = createRTRouter(config),
    requests: RTRequestRun[] = Array(scenario.requests.length),
    journal: RTJournal[] = [];
  const events: Event[] = [
    ...scenario.requests.map((request, index): Event => ({
      kind: "request",
      index,
      atMs: request.atMs,
      priority: 2,
      order: index,
    })),
    ...scenario.healthEvents.map((event, index): Event => ({
      kind: "health",
      index,
      atMs: event.atMs,
      priority: 1,
      order: index,
    })),
  ].sort(compareEvent);
  function insert(event: Event) {
    let low = 0,
      high = events.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareEvent(events[middle], event) <= 0) low = middle + 1;
      else high = middle;
    }
    events.splice(low, 0, event);
  }
  let completed = 0;
  await pause(options, 0, scenario.requests.length, scenario.id);
  while (events.length) {
    checkpoint(options);
    const event = events.shift()!;
    let requestId: string | null = null,
      backend: string | null = null;
    if (event.kind === "health") {
      const health = scenario.healthEvents[event.index];
      router.setHealthy(health.backend, health.healthy, event.atMs);
      backend = health.backend;
    } else if (event.kind === "request") {
      const input = scenario.requests[event.index],
        decision = router.dispatch(input, event.atMs);
      requests[event.index] = {
        ...decision,
        status: decision.status ?? 0,
        completedAtMs: event.atMs,
        matched: null,
      };
      requestId = input.id;
      backend = decision.backend;
      if (decision.backend && decision.token) {
        const outcome = Object.hasOwn(input.backendOutcomes, decision.backend)
          ? input.backendOutcomes[decision.backend]
          : input.outcome;
        insert({
          kind: "complete",
          index: event.index,
          token: decision.token,
          status: outcome.status,
          atMs: event.atMs + outcome.durationMs,
          priority: 0,
          order: event.index,
        });
      } else completed++;
    } else {
      const request = requests[event.index];
      router.complete(event.token, event.status, event.atMs);
      request.status = event.status;
      request.completedAtMs = event.atMs;
      requestId = request.requestId;
      backend = request.backend;
      completed++;
    }
    journal.push({
      atMs: event.atMs,
      kind: event.kind === "request" ? "dispatch" : event.kind,
      request: requestId,
      backend,
      states: router.snapshot(),
    });
    if (journal.length % 16 === 0)
      await pause(options, completed, scenario.requests.length, scenario.id);
  }
  for (const request of requests) {
    const expected = scenario.expected?.[request.requestId];
    request.matched = expected
      ? request.route === expected.route &&
        request.backend === expected.backend &&
        request.status === expected.status
      : null;
  }
  checkpoint(options);
  options.onProgress?.({
    completed,
    total: scenario.requests.length,
    caseId: scenario.id,
  });
  return {
    caseId: scenario.id,
    requests,
    journal,
    forwarded: requests.filter((r) => r.backend !== null).length,
    rejected: requests.filter((r) => r.backend === null).length,
    upstreamFailures: requests.filter(
      (r) => r.backend !== null && r.status >= 500,
    ).length,
    backendCounts: Object.fromEntries(
      config.backends.map((backend) => [
        backend.id,
        requests.filter((r) => r.backend === backend.id).length,
      ]),
    ),
    routeCounts: Object.fromEntries(
      config.routes.map((route) => [
        route.id,
        requests.filter((r) => r.route === route.id).length,
      ]),
    ),
    matched: scenario.expected
      ? requests.every((request) => request.matched)
      : null,
  };
}
export async function runRTProject(
  input: RTProject,
  caseIds?: string[],
  options: RTOptions = {},
) {
  checkpoint(options);
  const project = normalizeRTProject(input),
    ids = caseIds ?? project.cases.map((scenario) => scenario.id);
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !project.cases.some((scenario) => scenario.id === id))
  )
    throw new RTError("reference");
  const runs: RTCaseRun[] = [];
  for (const scenario of project.cases.filter((scenario) =>
    ids.includes(scenario.id),
  ))
    runs.push(await replay(project, scenario, options));
  checkpoint(options);
  return runs;
}
export function recordRTExpectation(
  run: RTCaseRun,
): Record<string, RTExpectation> {
  return Object.fromEntries(
    run.requests.map((request) => [
      request.requestId,
      {
        route: request.route,
        backend: request.backend,
        status: request.status,
      },
    ]),
  );
}
function sameHeaders(
  a: Record<string, string> | null,
  b: Record<string, string> | null,
) {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((key) => Object.hasOwn(b, key) && a[key] === b[key]))
  );
}
export async function compareRTPolicies(
  input: RTProject,
  candidate: unknown,
  caseId: string,
  options: RTOptions = {},
) {
  const project = normalizeRTProject(input),
    config = normalizeRTConfig(candidate),
    next = normalizeRTProject({
      ...project,
      ...config,
      cases: project.cases.map((scenario) => ({ ...scenario, expected: null })),
    });
  const baseline = (await runRTProject(project, [caseId], options))[0],
    changed = (await runRTProject(next, [caseId], options))[0];
  return {
    baseline,
    candidate: changed,
    changes: baseline.requests.flatMap((before, index) => {
      const after = changed.requests[index],
        rewriteChanged =
          before.upstreamUrl !== after.upstreamUrl ||
          !sameHeaders(before.headers, after.headers);
      return before.route !== after.route ||
        before.backend !== after.backend ||
        before.status !== after.status ||
        rewriteChanged
        ? [
            {
              request: before.requestId,
              baselineRoute: before.route,
              candidateRoute: after.route,
              baselineBackend: before.backend,
              candidateBackend: after.backend,
              baselineStatus: before.status,
              candidateStatus: after.status,
              rewriteChanged,
            },
          ]
        : [];
    }),
  };
}
export function rtReport(runs: RTCaseRun[]) {
  return {
    version: 1,
    kind: "rsswag-routing-report",
    runs: runs.map((run) => ({
      caseId: run.caseId,
      forwarded: run.forwarded,
      rejected: run.rejected,
      upstreamFailures: run.upstreamFailures,
      backendCounts: run.backendCounts,
      routeCounts: run.routeCounts,
      matched: run.matched,
      requests: run.requests.map((request) => ({
        requestId: request.requestId,
        atMs: request.atMs,
        completedAtMs: request.completedAtMs,
        route: request.route,
        pool: request.pool,
        backend: request.backend,
        status: request.status,
        reason: request.reason,
        audit: request.audit,
        matched: request.matched,
      })),
    })),
  };
}
