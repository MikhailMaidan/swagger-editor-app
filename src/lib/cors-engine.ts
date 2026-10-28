import {
  CorsError,
  normalizeCorsProject,
  type CorsBudgets,
  type CorsHeaders,
  type CorsOutcome,
  type CorsPolicy,
  type CorsPreflight,
  type CorsProject,
  type CorsScenario,
} from "./cors-project";
import {
  corsApplyPolicy,
  corsCheck,
  corsForbiddenRequest,
  corsPolicyFindings,
  corsPolicyHeaders,
  corsPreflightCheck,
  corsSafeMethods,
  corsSafelistedHeader,
  corsUnsafeHeaders,
  corsVisibleHeaders,
  type CorsReason,
} from "./cors-protocol";

export type CorsCacheEntry = {
  partition: string;
  origin: string;
  url: string;
  credentials: boolean;
  method: string | null;
  header: string | null;
  expiresAtMs: number;
};
export type CorsResult = {
  id: string;
  name: string;
  url: string;
  origin: string;
  partition: string;
  method: string;
  atMs: number;
  completedMs: number;
  outcome: CorsOutcome;
  preflight: CorsPreflight;
  stage: "request" | "preflight" | "response" | "complete";
  requestSent: boolean;
  ambientCredentials: boolean;
  preflightCredentialsSent: false;
  scriptStatus: number;
  networkStatus: number;
  preflightStatus: number;
  unsafeHeaders: string[];
  requestHeaders: CorsHeaders;
  preflightRequest: CorsHeaders;
  preflightResponse: CorsHeaders;
  responseHeaders: CorsHeaders;
  visibleHeaders: CorsHeaders;
  visibleBody: string;
  notes: CorsReason[];
  cacheEntries: number;
  evicted: number;
  passed: boolean;
};
export type CorsMetrics = {
  requests: number;
  allowed: number;
  blocked: number;
  opaque: number;
  invalid: number;
  preflights: number;
  cacheHits: number;
  actualRequests: number;
  totalWaitMs: number;
  evictions: number;
};
export type CorsSimulation = {
  policyId: string;
  policyName: string;
  scenarioId: string;
  scenarioName: string;
  rows: CorsResult[];
  metrics: CorsMetrics;
  cache: CorsCacheEntry[];
  findings: ReturnType<typeof corsPolicyFindings>;
  budgets: {
    id: keyof CorsBudgets;
    actual: number;
    limit: number;
    passed: boolean;
  }[];
  passed: boolean;
};
export type CorsRun = {
  kind: "rsswag-cors-run";
  version: 1;
  projectName: string;
  simulations: CorsSimulation[];
};
function simulate(
  p: CorsPolicy,
  scenario: CorsScenario,
  project: CorsProject,
): CorsSimulation {
  let clock = 0,
    cache: CorsCacheEntry[] = [];
  const rows: CorsResult[] = [];
  for (const c of scenario.cases) {
    const atMs = Math.max(c.atMs, clock);
    cache = cache.filter((e) => e.expiresAtMs > atMs);
    const cross = c.origin === "null" || c.origin !== new URL(c.url).origin;
    const unsafeHeaders = corsUnsafeHeaders(c.headers);
    const row: CorsResult = {
      id: c.id,
      name: c.name,
      url: c.url,
      origin: c.origin,
      partition: c.partition,
      method: c.method,
      atMs,
      completedMs: atMs,
      outcome: "allowed",
      preflight: "not-needed",
      stage: "request",
      requestSent: false,
      ambientCredentials: false,
      preflightCredentialsSent: false,
      scriptStatus: 0,
      networkStatus: 0,
      preflightStatus: 0,
      unsafeHeaders,
      requestHeaders: { ...c.headers },
      preflightRequest: {},
      preflightResponse: {},
      responseHeaders: {},
      visibleHeaders: {},
      visibleBody: "",
      notes: [],
      cacheEntries: 0,
      evicted: 0,
      passed: false,
    };
    const fail = (outcome: CorsOutcome, reason: CorsReason) => {
      row.outcome = outcome;
      row.notes.push(reason);
    };
    const sameKey = (e: CorsCacheEntry) =>
      e.partition === c.partition && e.origin === c.origin && e.url === c.url;
    const permitted = cache.filter(
      (e) => sameKey(e) && (e.credentials || c.credentials !== "include"),
    );
    if (Object.entries(c.headers).some(([n, v]) => corsForbiddenRequest(n, v)))
      fail("invalid", "forbidden-header");
    else if (c.mode === "no-cors" && !corsSafeMethods.has(c.method))
      fail("invalid", "no-cors-method");
    else if (
      c.mode === "no-cors" &&
      Object.entries(c.headers).some(
        ([n, v]) => n === "range" || !corsSafelistedHeader(n, v),
      )
    )
      fail("invalid", "no-cors-header");
    else if (cross && c.mode === "same-origin")
      fail("blocked", "same-origin-mode");
    else {
      if (cross && c.mode === "cors") {
        row.requestHeaders.origin = c.origin;
        const needs =
          c.forcePreflight ||
          !corsSafeMethods.has(c.method) ||
          unsafeHeaders.length > 0;
        const methodMatch = permitted.some(
          (e) =>
            e.method === c.method ||
            (e.method === "*" && c.credentials !== "include"),
        );
        const headersMatch = unsafeHeaders.every((n) =>
          permitted.some(
            (e) =>
              e.header === n ||
              (e.header === "*" &&
                n !== "authorization" &&
                c.credentials !== "include"),
          ),
        );
        const ready =
          (methodMatch ||
            (!c.forcePreflight && corsSafeMethods.has(c.method))) &&
          headersMatch;
        if (needs && ready) {
          row.preflight = "cached";
          row.notes.push("preflight-cached");
        } else if (needs) {
          row.preflight = "sent";
          row.stage = "preflight";
          row.notes.push("preflight-required");
          row.preflightRequest = {
            origin: c.origin,
            accept: "*/*",
            "access-control-request-method": c.method,
            ...(unsafeHeaders.length
              ? { "access-control-request-headers": unsafeHeaders.join(",") }
              : {}),
          };
          row.completedMs += c.preflight.delayMs;
          row.preflightStatus = c.preflight.status;
          row.preflightResponse = c.preflight.usePolicy
            ? corsApplyPolicy(
                c.preflight.headers,
                corsPolicyHeaders(p, c.origin, true),
              )
            : { ...c.preflight.headers };
          const check = corsPreflightCheck(
            c,
            c.preflight.status,
            row.preflightResponse,
          );
          if (check.issue) fail("blocked", check.issue);
          else {
            const expiresAtMs =
              row.completedMs +
              Math.min(check.maxAge, project.maxAgeCap) * 1000;
            cache = cache.filter((e) => e.expiresAtMs > row.completedMs);
            for (const [kind, values] of [
              ["method", check.methods],
              ["header", check.names],
            ] as const) {
              for (const value of values) {
                if (value === "*" && c.credentials === "include") continue;
                cache = cache.filter(
                  (e) =>
                    !(
                      sameKey(e) &&
                      e.credentials === (c.credentials === "include") &&
                      e[kind] === value
                    ),
                );
                if (expiresAtMs > row.completedMs)
                  cache.push({
                    partition: c.partition,
                    origin: c.origin,
                    url: c.url,
                    credentials: c.credentials === "include",
                    method: kind === "method" ? value : null,
                    header: kind === "header" ? value : null,
                    expiresAtMs,
                  });
                if (cache.length > project.cacheCapacity) {
                  cache.shift();
                  row.evicted++;
                }
              }
            }
            if (row.evicted) row.notes.push("cache-evicted");
          }
        } else row.notes.push("simple-request");
      } else if (!cross) row.notes.push("same-origin");
      if (row.outcome === "allowed") {
        row.stage = "response";
        row.requestSent = true;
        row.completedMs += c.response.delayMs;
        row.ambientCredentials =
          c.credentials === "include" ||
          (c.credentials === "same-origin" && !cross);
        row.networkStatus = c.response.status;
        row.responseHeaders = c.response.usePolicy
          ? corsApplyPolicy(
              c.response.headers,
              corsPolicyHeaders(p, c.origin, false),
            )
          : { ...c.response.headers };
        if (c.response.status === 0) fail("blocked", "response-network");
        else if ([301, 302, 303, 307, 308].includes(c.response.status))
          fail("invalid", "redirect");
        else if (cross && c.mode === "no-cors") {
          row.outcome = "opaque";
          row.stage = "complete";
          row.notes.push("opaque");
        } else {
          const issue = cross
            ? corsCheck(c.origin, c.credentials, row.responseHeaders)
            : null;
          if (issue) fail("blocked", issue);
          else {
            row.scriptStatus = c.response.status;
            row.visibleHeaders = corsVisibleHeaders(
              row.responseHeaders,
              !cross,
              c.credentials,
            );
            row.visibleBody = c.method === "HEAD" ? "" : c.response.body;
            row.stage = "complete";
            row.notes.push("response-allowed");
            if (
              cross &&
              row.responseHeaders["access-control-allow-origin"] !== "*" &&
              !(row.responseHeaders.vary ?? "")
                .split(",")
                .some((v) => ["origin", "*"].includes(v.trim().toLowerCase()))
            )
              row.notes.push("vary-origin");
          }
        }
      }
    }
    // A failed CORS exchange cannot lend its old preflight grants to later requests.
    if (
      row.outcome === "blocked" &&
      (row.requestSent || row.preflight === "sent")
    )
      cache = cache.filter((e) => !sameKey(e));
    cache = cache.filter((e) => e.expiresAtMs > row.completedMs);
    row.cacheEntries = cache.length;
    row.passed =
      (row.outcome !== "invalid" || c.expect.outcome === "invalid") &&
      (c.expect.outcome === undefined || c.expect.outcome === row.outcome) &&
      (c.expect.preflight === undefined ||
        c.expect.preflight === row.preflight) &&
      (c.expect.status === undefined || c.expect.status === row.scriptStatus);
    clock = row.completedMs;
    rows.push(row);
  }
  const metrics: CorsMetrics = {
    requests: rows.length,
    allowed: rows.filter((r) => r.outcome === "allowed").length,
    blocked: rows.filter((r) => r.outcome === "blocked").length,
    opaque: rows.filter((r) => r.outcome === "opaque").length,
    invalid: rows.filter((r) => r.outcome === "invalid").length,
    preflights: rows.filter((r) => r.preflight === "sent").length,
    cacheHits: rows.filter((r) => r.preflight === "cached").length,
    actualRequests: rows.filter((r) => r.requestSent).length,
    totalWaitMs: rows.reduce((sum, r) => sum + r.completedMs - r.atMs, 0),
    evictions: rows.reduce((sum, r) => sum + r.evicted, 0),
  };
  const actual: CorsBudgets = {
    maxBlocked: metrics.blocked,
    maxPreflights: metrics.preflights,
    maxWaitMs: metrics.totalWaitMs,
  };
  const budgets = (Object.keys(actual) as (keyof CorsBudgets)[]).map((id) => ({
    id,
    actual: actual[id],
    limit: scenario.budgets[id],
    passed: actual[id] <= scenario.budgets[id],
  }));
  return {
    policyId: p.id,
    policyName: p.name,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    rows,
    metrics,
    cache,
    findings: corsPolicyFindings(p),
    budgets,
    passed: rows.every((r) => r.passed) && budgets.every((b) => b.passed),
  };
}
export function runCorsProject(
  input: CorsProject,
  selection?: { scenarioId?: string; policyId?: string },
): CorsRun {
  const p = normalizeCorsProject(input);
  const policies = p.policies.filter(
      (v) => !selection?.policyId || v.id === selection.policyId,
    ),
    scenarios = p.scenarios.filter(
      (v) => !selection?.scenarioId || v.id === selection.scenarioId,
    );
  if (!policies.length || !scenarios.length) throw new CorsError("project");
  return {
    kind: "rsswag-cors-run",
    version: 1,
    projectName: p.name,
    simulations: scenarios.flatMap((s) =>
      policies.map((policy) => simulate(policy, s, p)),
    ),
  };
}
export function corsRunReport(run: CorsRun): string {
  return JSON.stringify(
    {
      kind: "rsswag-cors-report",
      version: 1,
      projectName: run.projectName,
      simulations: run.simulations.map((s) => ({
        policyId: s.policyId,
        policyName: s.policyName,
        scenarioId: s.scenarioId,
        scenarioName: s.scenarioName,
        metrics: s.metrics,
        budgets: s.budgets,
        findings: s.findings,
        passed: s.passed,
        rows: s.rows.map((r) => ({
          id: r.id,
          name: r.name,
          method: r.method,
          atMs: r.atMs,
          completedMs: r.completedMs,
          outcome: r.outcome,
          preflight: r.preflight,
          stage: r.stage,
          requestSent: r.requestSent,
          ambientCredentials: r.ambientCredentials,
          preflightCredentialsSent: false,
          scriptStatus: r.scriptStatus,
          networkStatus: r.networkStatus,
          preflightStatus: r.preflightStatus,
          unsafeHeaderCount: r.unsafeHeaders.length,
          visibleHeaderCount: Object.keys(r.visibleHeaders).length,
          notes: r.notes,
          cacheEntries: r.cacheEntries,
          evicted: r.evicted,
          passed: r.passed,
        })),
      })),
    },
    null,
    2,
  );
}
