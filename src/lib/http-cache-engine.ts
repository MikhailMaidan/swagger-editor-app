import {
  CacheError,
  cacheControl,
  cacheDate,
  cacheEtag,
  cacheFreshness,
  cacheSeconds,
  cacheVary,
  matchingCacheEtag,
  storedCacheHeaders,
  type CacheFreshness,
  type CacheHeaders,
} from "./http-cache";
import {
  normalizeCacheProject,
  type CacheBudgets,
  type CacheOutcome,
  type CachePolicy,
  type CacheProject,
  type CacheScenario,
  type CacheStep,
} from "./http-cache-project";
import { getByteSize } from "./text-encoding";

export type CacheReason =
  | "not-found"
  | "vary-miss"
  | "fresh"
  | "request-revalidate"
  | "response-revalidate"
  | "expired"
  | "max-stale"
  | "stale-if-error"
  | "method"
  | "range-or-conditional"
  | "request-no-store"
  | "response-no-store"
  | "private"
  | "authorization"
  | "status"
  | "vary"
  | "invalid-control"
  | "body-limit"
  | "stored"
  | "not-cacheable"
  | "etag"
  | "last-modified"
  | "not-modified"
  | "invalid-304"
  | "only-if-cached"
  | "missing-origin"
  | "network-error"
  | "evicted"
  | "invalidated"
  | "revalidation-required";
export type CacheEntry = {
  id: number;
  url: string;
  status: number;
  headers: CacheHeaders;
  body: string;
  vary: string[];
  requestValues: (string | null)[];
  requestAt: number;
  responseAt: number;
  used: number;
};
export type CacheStepResult = {
  id: string;
  name: string;
  method: string;
  url: string;
  atMs: number;
  completedMs: number;
  outcome: CacheOutcome;
  status: number;
  headers: CacheHeaders;
  body: string;
  originUsed: boolean;
  originStatus: number;
  originBodyBytes: number;
  cacheBodyBytes: number;
  conditional: CacheHeaders;
  notes: CacheReason[];
  freshness: CacheFreshness | null;
  stored: boolean;
  entries: number;
  evicted: number;
  invalidated: number;
  passed: boolean;
};
export type CacheMetrics = {
  requests: number;
  hits: number;
  hitPercent: number;
  originRequests: number;
  revalidations: number;
  originBodyBytes: number;
  cacheBodyBytes: number;
  totalWaitMs: number;
  errors: number;
  evictions: number;
  invalidations: number;
};
export type CacheSimulation = {
  policyId: string;
  policyName: string;
  scenarioId: string;
  scenarioName: string;
  mode: CachePolicy["mode"];
  overrideApplied: boolean;
  rows: CacheStepResult[];
  entries: (CacheEntry & { freshness: CacheFreshness })[];
  metrics: CacheMetrics;
  budgets: {
    id: keyof CacheBudgets;
    actual: number;
    limit: number;
    passed: boolean;
  }[];
  passed: boolean;
};
export type CacheRun = {
  kind: "rsswag-http-cache-run";
  version: 1;
  projectName: string;
  startTime: string;
  simulations: CacheSimulation[];
};
const heuristicStatuses = new Set([
  200, 203, 204, 300, 301, 308, 404, 405, 410, 414, 501,
]);
// Statuses understood by this model. Partial and extension statuses pass through.
const understoodStatuses = new Set([
  ...heuristicStatuses,
  201,
  202,
  205,
  302,
  303,
  307,
  400,
  401,
  402,
  403,
  406,
  407,
  408,
  409,
  411,
  412,
  413,
  415,
  416,
  417,
  421,
  422,
  426,
  500,
  502,
  503,
  504,
  505,
]);
const safe = new Set(["GET", "HEAD", "OPTIONS"]);
const own = (v: object, field: string) => Object.hasOwn(v, field);
const requestValues = (vary: string[], headers: CacheHeaders) =>
  vary.map((key) => (own(headers, key) ? headers[key] : null));
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function sharedAllowed(headers: CacheHeaders): boolean {
  const cc = cacheControl(headers["cache-control"]);
  return (
    !cc.invalid &&
    ["public", "s-maxage", "must-revalidate"].some((key) => cc.values.has(key))
  );
}
function storageReason(
  step: CacheStep,
  headers: CacheHeaders,
  status: number,
  body: string,
  policy: CachePolicy,
): CacheReason | null {
  const cc = cacheControl(headers["cache-control"]);
  if (
    step.method !== "GET" ||
    own(step.headers, "range") ||
    own(step.headers, "if-range")
  )
    return "method";
  if (cc.values.has("no-store")) return "response-no-store";
  if (cc.invalid) return "invalid-control";
  if (policy.mode === "shared" && cc.values.has("private")) return "private";
  if (
    policy.mode === "shared" &&
    own(step.headers, "authorization") &&
    !sharedAllowed(headers)
  )
    return "authorization";
  if (!understoodStatuses.has(status)) return "status";
  if (cacheVary(headers) === null) return "vary";
  if (getByteSize(body) > policy.maxBodyBytes) return "body-limit";
  if (
    !heuristicStatuses.has(status) &&
    !cc.values.has("public") &&
    !(policy.mode === "private" && cc.values.has("private")) &&
    !cc.values.has("max-age") &&
    !(policy.mode === "shared" && cc.values.has("s-maxage")) &&
    !own(headers, "expires")
  )
    return "not-cacheable";
  return null;
}
function staleForbidden(headers: CacheHeaders, policy: CachePolicy): boolean {
  const cc = cacheControl(headers["cache-control"]);
  return (
    cc.invalid ||
    cc.values.has("no-cache") ||
    cc.values.has("must-revalidate") ||
    (policy.mode === "shared" &&
      (cc.values.has("proxy-revalidate") || cc.values.has("s-maxage")))
  );
}
function simulate(
  policy: CachePolicy,
  scenario: CacheScenario,
  startTime: number,
): CacheSimulation {
  let entries: CacheEntry[] = [],
    sequence = 0,
    clock = 0;
  const rows: CacheStepResult[] = [];
  for (const step of scenario.steps) {
    const atMs = Math.max(clock, step.atMs),
      now = startTime + atMs;
    const requestCc = cacheControl(step.headers["cache-control"]);
    const requestRevalidate =
      requestCc.invalid ||
      requestCc.values.has("no-cache") ||
      (!own(step.headers, "cache-control") &&
        /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(step.headers.pragma ?? ""));
    const notes: CacheReason[] = [];
    let outcome: CacheOutcome = "miss",
      status = 0,
      headers: CacheHeaders = {},
      body = "";
    const conditional: CacheHeaders = {};
    let originUsed = false,
      originStatus = 0,
      originBodyBytes = 0,
      cacheBodyBytes = 0,
      stored = false,
      evicted = 0,
      invalidated = 0;
    let completedMs = atMs;
    let freshness: CacheFreshness | null = null;
    const bypass =
      step.method !== "GET"
        ? "method"
        : [
              "range",
              "if-range",
              "if-none-match",
              "if-modified-since",
              "if-match",
              "if-unmodified-since",
            ].some((key) => own(step.headers, key))
          ? "range-or-conditional"
          : requestCc.values.has("no-store")
            ? "request-no-store"
            : null;
    const candidates = bypass
      ? []
      : entries.filter((entry) => entry.url === step.url);
    const entry = candidates
      .filter(
        (e) =>
          same(e.requestValues, requestValues(e.vary, step.headers)) &&
          !(
            policy.mode === "shared" &&
            own(step.headers, "authorization") &&
            !sharedAllowed(e.headers)
          ),
      )
      .sort(
        (a, b) =>
          (cacheDate(b.headers.date) ?? b.responseAt) -
            (cacheDate(a.headers.date) ?? a.responseAt) || b.id - a.id,
      )[0];
    const takeEntry = (value: CacheEntry, kind: CacheOutcome, at: number) => {
      freshness = cacheFreshness(
        value.headers,
        value.requestAt,
        value.responseAt,
        startTime + at,
        policy.mode,
        policy.heuristic,
      );
      status = value.status;
      headers = {
        ...value.headers,
        age: String(Math.floor(freshness.ageMs / 1000)),
      };
      body = value.body;
      cacheBodyBytes = getByteSize(body);
      value.used = ++sequence;
      outcome = kind;
    };
    const remove = (test: (e: CacheEntry) => boolean) => {
      const count = entries.length;
      entries = entries.filter((e) => !test(e));
      return count - entries.length;
    };
    const store = (
      responseHeaders: CacheHeaders,
      responseStatus: number,
      responseBody: string,
      requestAt: number,
      responseAt: number,
    ) => {
      const reason = storageReason(
        step,
        responseHeaders,
        responseStatus,
        responseBody,
        policy,
      );
      if (reason) {
        notes.push(reason);
        // A completed replacement must not leave its old representation reusable.
        if (entry) remove((e) => e.id === entry.id);
        return;
      }
      const vary = cacheVary(responseHeaders)!;
      const values = requestValues(vary, step.headers);
      remove(
        (e) =>
          e.url === step.url &&
          (!same(e.vary, vary) || same(e.requestValues, values)),
      );
      if (entries.length >= policy.capacity) {
        const leastUsed = entries.reduce((a, b) => (a.used < b.used ? a : b));
        remove((e) => e.id === leastUsed.id);
        evicted++;
        notes.push("evicted");
      }
      entries.push({
        id: ++sequence,
        url: step.url,
        status: responseStatus,
        headers: storedCacheHeaders(responseHeaders),
        body: responseBody,
        vary,
        requestValues: values,
        requestAt,
        responseAt,
        used: sequence,
      });
      notes.push("stored");
      stored = true;
    };
    if (bypass) {
      notes.push(bypass);
      outcome = "bypass";
    } else if (!entry)
      notes.push(candidates.length ? "vary-miss" : "not-found");
    else {
      freshness = cacheFreshness(
        entry.headers,
        entry.requestAt,
        entry.responseAt,
        now,
        policy.mode,
        policy.heuristic,
      );
      const responseCc = cacheControl(entry.headers["cache-control"]);
      const maxAge = cacheSeconds(requestCc, "max-age"),
        minFresh = cacheSeconds(requestCc, "min-fresh") ?? 0;
      const requestFresh =
        (maxAge === undefined || freshness.ageMs <= maxAge * 1000) &&
        freshness.ageMs + minFresh * 1000 < freshness.lifetimeMs;
      const forced =
        requestRevalidate ||
        responseCc.values.has("no-cache") ||
        responseCc.invalid ||
        (requestCc.values.has("max-age") && maxAge === undefined) ||
        (requestCc.values.has("min-fresh") &&
          cacheSeconds(requestCc, "min-fresh") === undefined);
      if (freshness.fresh && requestFresh && !forced) {
        notes.push("fresh");
        takeEntry(entry, "fresh", atMs);
      } else if (
        !freshness.fresh &&
        !forced &&
        !staleForbidden(entry.headers, policy) &&
        requestCc.values.has("max-stale") &&
        (maxAge === undefined || freshness.ageMs <= maxAge * 1000) &&
        minFresh === 0 &&
        (requestCc.values.get("max-stale") === null ||
          (cacheSeconds(requestCc, "max-stale") !== undefined &&
            freshness.staleMs <= cacheSeconds(requestCc, "max-stale")! * 1000))
      ) {
        notes.push("max-stale");
        takeEntry(entry, "stale", atMs);
      } else {
        notes.push(
          requestRevalidate
            ? "request-revalidate"
            : responseCc.values.has("no-cache")
              ? "response-revalidate"
              : !freshness.fresh
                ? "expired"
                : "request-revalidate",
        );
        if (staleForbidden(entry.headers, policy))
          notes.push("revalidation-required");
        const etag = cacheEtag(entry.headers.etag);
        const modified = cacheDate(entry.headers["last-modified"]);
        if (etag) {
          conditional["if-none-match"] = etag;
          notes.push("etag");
        }
        if (modified !== undefined) {
          conditional["if-modified-since"] = entry.headers["last-modified"];
          notes.push("last-modified");
        }
      }
    }
    if (!["fresh", "stale"].includes(outcome)) {
      if (requestCc.values.has("only-if-cached")) {
        outcome = "only-if-cached";
        status = 504;
        notes.push("only-if-cached");
      } else if (!step.origin) {
        outcome = "error";
        notes.push("missing-origin");
      } else {
        originUsed = true;
        completedMs += step.origin.delayMs;
        const responseAt = startTime + completedMs;
        originStatus = step.origin.kind === "response" ? step.origin.status : 0;
        originBodyBytes =
          step.origin.kind === "response" && step.method !== "HEAD"
            ? getByteSize(step.origin.body)
            : 0;
        const error =
          step.origin.kind === "network-error" ||
          [500, 502, 503, 504].includes(originStatus);
        const responseCc = entry
          ? cacheControl(entry.headers["cache-control"])
          : null;
        const responseSie = responseCc
          ? cacheSeconds(responseCc, "stale-if-error")
          : undefined;
        const requestSie = cacheSeconds(requestCc, "stale-if-error");
        const sie =
          requestSie === undefined
            ? responseSie
            : responseSie === undefined
              ? requestSie
              : Math.min(requestSie, responseSie);
        const latest = entry
          ? cacheFreshness(
              entry.headers,
              entry.requestAt,
              entry.responseAt,
              responseAt,
              policy.mode,
              policy.heuristic,
            )
          : null;
        if (
          entry &&
          error &&
          policy.staleIfError &&
          sie !== undefined &&
          latest &&
          !latest.fresh &&
          latest.staleMs <= sie * 1000 &&
          !staleForbidden(entry.headers, policy) &&
          !requestRevalidate
        ) {
          notes.push("stale-if-error");
          takeEntry(entry, "stale-error", completedMs);
        } else if (step.origin.kind === "network-error") {
          outcome = "error";
          notes.push("network-error");
        } else {
          status = step.origin.status;
          headers = { ...step.origin.headers };
          body = step.method === "HEAD" ? "" : step.origin.body;
          if (policy.responseCacheControl !== null)
            headers["cache-control"] = policy.responseCacheControl;
          if (status === 304 && !bypass) {
            const valid =
              entry &&
              Object.keys(conditional).length > 0 &&
              (!own(headers, "etag") ||
                (!!conditional["if-none-match"] &&
                  matchingCacheEtag(
                    headers.etag,
                    conditional["if-none-match"],
                  ))) &&
              (!own(headers, "last-modified") ||
                (cacheDate(headers["last-modified"]) !== undefined &&
                  (!!conditional["if-none-match"] ||
                    cacheDate(headers["last-modified"]) ===
                      cacheDate(conditional["if-modified-since"]))));
            if (!valid) {
              status = 0;
              body = "";
              headers = {};
              outcome = "error";
              notes.push("invalid-304");
            } else {
              const updates = storedCacheHeaders(headers);
              delete updates["content-length"];
              delete updates["content-range"];
              // Body fixtures contain decoded text, so retain its representation metadata.
              delete updates["content-encoding"];
              const merged = { ...entry.headers, ...updates };
              if (!own(updates, "date")) delete merged.date;
              if (!own(updates, "age")) delete merged.age;
              const refreshed = {
                ...entry,
                headers: merged,
                requestAt: now,
                responseAt,
              };
              notes.push("not-modified");
              takeEntry(refreshed, "revalidated", completedMs);
              store(merged, entry.status, entry.body, now, responseAt);
            }
          } else {
            if (!bypass) store(headers, status, body, now, responseAt);
            if (!safe.has(step.method) && status >= 200 && status < 400) {
              const targets = new Set([step.url]);
              for (const field of ["location", "content-location"]) {
                try {
                  const url = new URL(headers[field], step.url);
                  if (
                    headers[field] &&
                    url.origin === new URL(step.url).origin &&
                    !url.username &&
                    !url.password
                  ) {
                    url.hash = "";
                    targets.add(url.href);
                  }
                } catch {
                  /* Ignore malformed optional invalidation hints. */
                }
              }
              invalidated = remove((e) => targets.has(e.url));
              if (invalidated) notes.push("invalidated");
            }
          }
        }
      }
    }
    clock = completedMs;
    const passed =
      (outcome !== "error" || step.expect.outcome === "error") &&
      (step.expect.outcome === undefined || step.expect.outcome === outcome) &&
      (step.expect.status === undefined || step.expect.status === status);
    rows.push({
      id: step.id,
      name: step.name,
      method: step.method,
      url: step.url,
      atMs,
      completedMs,
      outcome,
      status,
      headers,
      body,
      originUsed,
      originStatus,
      originBodyBytes,
      cacheBodyBytes,
      conditional,
      notes,
      freshness,
      stored,
      entries: entries.length,
      evicted,
      invalidated,
      passed,
    });
  }
  const hits = rows.filter((r) =>
    ["fresh", "stale", "stale-error"].includes(r.outcome),
  ).length;
  const metrics: CacheMetrics = {
    requests: rows.length,
    hits,
    hitPercent: Math.round((hits / rows.length) * 10000) / 100,
    originRequests: rows.filter((r) => r.originUsed).length,
    revalidations: rows.filter((r) => r.outcome === "revalidated").length,
    originBodyBytes: rows.reduce((n, r) => n + r.originBodyBytes, 0),
    cacheBodyBytes: rows.reduce((n, r) => n + r.cacheBodyBytes, 0),
    totalWaitMs: rows.reduce((n, r) => n + r.completedMs - r.atMs, 0),
    errors: rows.filter((r) => r.outcome === "error" || r.status >= 500).length,
    evictions: rows.reduce((n, r) => n + r.evicted, 0),
    invalidations: rows.reduce((n, r) => n + r.invalidated, 0),
  };
  const actuals: CacheBudgets = {
    minHitPercent: metrics.hitPercent,
    maxOriginRequests: metrics.originRequests,
    maxOriginBodyBytes: metrics.originBodyBytes,
    maxErrors: metrics.errors,
  };
  const budgets = (Object.keys(scenario.budgets) as (keyof CacheBudgets)[]).map(
    (id) => ({
      id,
      actual: actuals[id],
      limit: scenario.budgets[id],
      passed:
        id === "minHitPercent"
          ? actuals[id] >= scenario.budgets[id]
          : actuals[id] <= scenario.budgets[id],
    }),
  );
  return {
    policyId: policy.id,
    policyName: policy.name,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    mode: policy.mode,
    overrideApplied: policy.responseCacheControl !== null,
    rows,
    metrics,
    budgets,
    entries: entries.map((e) => ({
      ...e,
      freshness: cacheFreshness(
        e.headers,
        e.requestAt,
        e.responseAt,
        startTime + clock,
        policy.mode,
        policy.heuristic,
      ),
    })),
    passed: rows.every((r) => r.passed) && budgets.every((b) => b.passed),
  };
}
export function runCacheProject(
  value: CacheProject,
  selection?: { policyId?: string; scenarioId?: string },
): CacheRun {
  const project = normalizeCacheProject(value);
  const policies = project.policies.filter(
    (p) => !selection?.policyId || p.id === selection.policyId,
  );
  const scenarios = project.scenarios.filter(
    (s) => !selection?.scenarioId || s.id === selection.scenarioId,
  );
  if (!policies.length || !scenarios.length) throw new CacheError("project");
  return {
    kind: "rsswag-http-cache-run",
    version: 1,
    projectName: project.name,
    startTime: project.startTime,
    simulations: scenarios.flatMap((s) =>
      policies.map((p) => simulate(p, s, Date.parse(project.startTime))),
    ),
  };
}
export function cacheRunReport(run: CacheRun): string {
  // Construct explicitly: no URLs, headers, validators, bodies, or override text.
  return JSON.stringify(
    {
      kind: "rsswag-http-cache-report",
      version: 1,
      projectName: run.projectName,
      startTime: run.startTime,
      simulations: run.simulations.map((s) => ({
        policyId: s.policyId,
        policyName: s.policyName,
        scenarioId: s.scenarioId,
        scenarioName: s.scenarioName,
        mode: s.mode,
        overrideApplied: s.overrideApplied,
        passed: s.passed,
        metrics: s.metrics,
        budgets: s.budgets,
        rows: s.rows.map((r) => ({
          id: r.id,
          name: r.name,
          method: r.method,
          atMs: r.atMs,
          completedMs: r.completedMs,
          outcome: r.outcome,
          status: r.status,
          originUsed: r.originUsed,
          originStatus: r.originStatus,
          originBodyBytes: r.originBodyBytes,
          cacheBodyBytes: r.cacheBodyBytes,
          notes: r.notes,
          freshness: r.freshness,
          stored: r.stored,
          entries: r.entries,
          evicted: r.evicted,
          invalidated: r.invalidated,
          passed: r.passed,
        })),
      })),
    },
    null,
    2,
  );
}
