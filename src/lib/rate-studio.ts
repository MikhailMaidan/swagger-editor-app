import {
  MAX_RATE_REQUESTS,
  MAX_RATE_SCENARIOS,
  RateError,
  emptyRateProject,
  newRateRequest,
  newRateRule,
  newRateScenario,
  normalizeRateProject,
  normalizeRateRequest,
  rateJson,
  rateMethod,
  rateObject,
  rateText,
  type RateOutcome,
  type RateProject,
  type RateRequest,
} from "./rate-project";
import { createRateLimiter, type RateDecision } from "./rate-engine";
import { getByteSize } from "./text-encoding";
export type RateRow = {
  index: number;
  request: RateRequest;
  decision: RateDecision;
  expected?: RateOutcome;
  passed: boolean;
};
export type RateClient = {
  index: number;
  client: string;
  requests: number;
  accepted: number;
  requestedCost: number;
  admittedCost: number;
};
export type RateRun = {
  policyId: string;
  policyName: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  total: number;
  accepted: number;
  limited: number;
  capacity: number;
  unmatched: number;
  admittedCost: number;
  requestedCost: number;
  maxRetryMs: number | null;
  rows: RateRow[];
  clients: RateClient[];
  checks: {
    code:
      | "minAccepted"
      | "maxLimited"
      | "maxCapacity"
      | "maxUnmatched"
      | "maxRetryMs";
    value: number | null;
    limit: number | null;
    checked: boolean;
    passed: boolean;
  }[];
};
export function runRateProject(
  value: RateProject,
  scenarioId?: string,
  policyId?: string,
): RateRun[] {
  const p = normalizeRateProject(value);
  if (
    (scenarioId && !p.scenarios.some((s) => s.id === scenarioId)) ||
    (policyId && !p.policies.some((policy) => policy.id === policyId))
  )
    throw new RateError("project");
  const runs: RateRun[] = [];
  for (const s of p.scenarios.filter((s) => !scenarioId || s.id === scenarioId))
    for (const policy of p.policies.filter(
      (policy) => !policyId || policy.id === policyId,
    )) {
      const limiter = createRateLimiter(policy),
        clients = new Map<string, RateClient>(),
        rows: RateRow[] = [];
      const requests = s.requests
        .map((request, index) => ({ request, index }))
        .sort((a, b) => a.request.atMs - b.request.atMs || a.index - b.index);
      for (const { request, index } of requests) {
        const decision = limiter.take(request, p.clockMs + request.atMs),
          expected = Object.hasOwn(request.expect, policy.id)
            ? request.expect[policy.id]
            : undefined;
        rows.push({
          index,
          request,
          decision,
          expected,
          passed: expected === undefined || expected === decision.outcome,
        });
        const client = clients.get(request.client) ?? {
          index: clients.size,
          client: request.client,
          requests: 0,
          accepted: 0,
          requestedCost: 0,
          admittedCost: 0,
        };
        client.requests++;
        client.requestedCost += request.cost;
        if (decision.allowed) {
          client.accepted++;
          client.admittedCost += request.cost;
        }
        clients.set(request.client, client);
      }
      const accepted = rows.filter((r) => r.decision.allowed).length,
        limited = rows.filter((r) => r.decision.outcome === "limited").length,
        capacity = rows.filter((r) => r.decision.outcome === "capacity").length,
        unmatched = rows.filter(
          (r) => r.decision.outcome === "unmatched",
        ).length;
      const denied = rows.filter((r) => !r.decision.allowed),
        maxRetryMs = denied.some((r) => r.decision.retryAfterMs === null)
          ? null
          : Math.max(0, ...denied.map((r) => r.decision.retryAfterMs!));
      const values = {
        minAccepted: accepted,
        maxLimited: limited,
        maxCapacity: capacity,
        maxUnmatched: unmatched,
        maxRetryMs,
      };
      const checks = (Object.keys(values) as (keyof typeof values)[]).map(
        (code) => {
          const actual = values[code],
            limit = s.budgets[code],
            checked = limit !== null;
          return {
            code,
            value: actual,
            limit,
            checked,
            passed:
              !checked ||
              (actual !== null &&
                (code === "minAccepted" ? actual >= limit! : actual <= limit!)),
          };
        },
      );
      runs.push({
        policyId: policy.id,
        policyName: policy.name,
        scenarioId: s.id,
        scenarioName: s.name,
        passed: checks.every((c) => c.passed) && rows.every((r) => r.passed),
        total: rows.length,
        accepted,
        limited,
        capacity,
        unmatched,
        admittedCost: rows.reduce(
          (n, r) => n + (r.decision.allowed ? r.request.cost : 0),
          0,
        ),
        requestedCost: rows.reduce((n, r) => n + r.request.cost, 0),
        maxRetryMs,
        rows,
        clients: [...clients.values()],
        checks,
      });
    }
  return runs;
}
export function rateRunReport(runs: RateRun[], includeRows = false): string {
  const source = JSON.stringify(
    {
      kind: "rsswag-rate-limit-report",
      version: 1,
      total: runs.length,
      passed: runs.filter((r) => r.passed).length,
      simulations: runs.map((r) => ({
        policyId: r.policyId,
        policyName: r.policyName,
        scenarioId: r.scenarioId,
        scenarioName: r.scenarioName,
        passed: r.passed,
        total: r.total,
        accepted: r.accepted,
        limited: r.limited,
        capacity: r.capacity,
        unmatched: r.unmatched,
        admittedCost: r.admittedCost,
        requestedCost: r.requestedCost,
        maxRetryMs: r.maxRetryMs,
        checks: r.checks,
        clients: r.clients.map(
          ({ index, requests, accepted, requestedCost, admittedCost }) => ({
            index,
            requests,
            accepted,
            requestedCost,
            admittedCost,
          }),
        ),
        rows: includeRows
          ? r.rows.map((row) => ({
              index: row.index,
              id: row.request.id,
              name: row.request.name,
              atMs: row.request.atMs,
              cost: row.request.cost,
              expected: row.expected,
              passed: row.passed,
              decision: row.decision,
            }))
          : undefined,
      })),
    },
    null,
    2,
  );
  if (getByteSize(source) > 16 * 1024 * 1024) throw new RateError("limit");
  return source;
}
export async function runRateMatrix(
  value: RateProject,
  scenarioId?: string,
  cancelled?: () => boolean,
  progress?: (done: number, total: number) => void,
): Promise<RateRun[]> {
  const p = normalizeRateProject(value),
    scenarios = p.scenarios.filter((s) => !scenarioId || s.id === scenarioId);
  if (!scenarios.length) throw new RateError("project");
  const result: RateRun[] = [],
    total = scenarios.length * p.policies.length;
  for (const s of scenarios)
    for (const policy of p.policies) {
      if (cancelled?.()) throw new RateError("cancelled");
      result.push(runRateProject(p, s.id, policy.id)[0]);
      progress?.(result.length, total);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  if (cancelled?.()) throw new RateError("cancelled");
  return result;
}
export function generateRateSchedule(
  count: number,
  spacing: number,
  clientCount: number,
  route: string,
  method: string,
  cost: number,
): RateRequest[] {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > MAX_RATE_REQUESTS ||
    !Number.isSafeInteger(spacing) ||
    spacing < 0 ||
    spacing * (count - 1) > 86400000 ||
    !Number.isSafeInteger(clientCount) ||
    clientCount < 1 ||
    clientCount > 100
  )
    throw new RateError("project");
  return Array.from({ length: count }, (_, i) => ({
    ...newRateRequest(`generated-${i + 1}`),
    atMs: spacing * i,
    client: `client-${(i % clientCount) + 1}`,
    route,
    method,
    cost,
  })).map(normalizeRateRequest);
}
export function importRateHar(
  value: RateProject,
  source: string,
  client = "har-client",
): { project: RateProject; imported: number; skipped: number } {
  const p = normalizeRateProject(value),
    root = rateJson(source, 5 * 1024 * 1024);
  if (
    !rateObject(root) ||
    !rateObject(root.log) ||
    !Array.isArray(root.log.entries) ||
    root.log.entries.length > 5000
  )
    throw new RateError("har");
  if (p.scenarios.length >= MAX_RATE_SCENARIOS) throw new RateError("limit");
  const rows: { time: number; route: string; method: string }[] = [];
  let skipped = 0;
  for (const entry of root.log.entries) {
    try {
      if (
        !rateObject(entry) ||
        !rateObject(entry.request) ||
        !rateMethod(entry.request.method) ||
        typeof entry.request.url !== "string" ||
        typeof entry.startedDateTime !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
          entry.startedDateTime,
        )
      )
        throw 0;
      const time = Date.parse(entry.startedDateTime),
        url = new URL(entry.request.url);
      const date = entry.startedDateTime.slice(0, 10),
        calendar = new Date(`${date}T00:00:00Z`);
      if (
        !Number.isFinite(time) ||
        !Number.isFinite(calendar.getTime()) ||
        calendar.toISOString().slice(0, 10) !== date ||
        Number(entry.startedDateTime.slice(11, 13)) > 23 ||
        Number(entry.startedDateTime.slice(14, 16)) > 59 ||
        Number(entry.startedDateTime.slice(17, 19)) > 59 ||
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw 0;
      if (!rateText(url.pathname, 256) || !url.pathname.trim()) throw 0;
      rows.push({ time, route: url.pathname, method: entry.request.method });
    } catch {
      skipped++;
    }
  }
  if (!rows.length) throw new RateError("har");
  const first = Math.min(...rows.map((r) => r.time)),
    filtered = rows.filter((r) => {
      if (r.time - first > 86400000) {
        skipped++;
        return false;
      }
      return true;
    });
  if (filtered.length > MAX_RATE_REQUESTS) throw new RateError("limit");
  let n = 1;
  while (p.scenarios.some((s) => s.id === `har-${n}`)) n++;
  const scenario = newRateScenario(`har-${n}`);
  scenario.name = `HAR traffic ${n}`;
  scenario.requests = filtered.map((r, i) => ({
    ...newRateRequest(`har-request-${i + 1}`),
    client,
    atMs: r.time - first,
    route: r.route,
    method: r.method,
  }));
  return {
    project: normalizeRateProject({
      ...p,
      scenarios: [...p.scenarios, scenario],
    }),
    imported: scenario.requests.length,
    skipped,
  };
}
export function demoRateProject(): RateProject {
  const p = emptyRateProject();
  p.name = "API quota and boundary examples";
  p.policies = ["token", "fixed", "sliding"].map((algorithm) => ({
    id: algorithm,
    name: `${algorithm} per-client policy`,
    rules: [
      {
        ...newRateRule(
          "per-client",
          algorithm as "token" | "fixed" | "sliding",
        ),
        name: "Per-client quota",
      },
    ],
  }));
  const request = (
    id: string,
    atMs: number,
    expect: RateRequest["expect"],
    client = "client-a",
    cost = 1,
  ) => ({ ...newRateRequest(id), atMs, expect, client, cost });
  const same = (outcome: RateOutcome) => ({
    token: outcome,
    fixed: outcome,
    sliding: outcome,
  });
  const burst = newRateScenario("boundary");
  burst.name = "Window boundary burst";
  burst.requests = [
    request("before-1", 900, same("allowed")),
    request("before-2", 900, same("allowed")),
    request("before-3", 900, same("allowed")),
    request("after-1", 1000, {
      token: "limited",
      fixed: "allowed",
      sliding: "limited",
    }),
    request("after-2", 1000, {
      token: "limited",
      fixed: "allowed",
      sliding: "limited",
    }),
    request("other-client", 1000, same("allowed"), "client-b"),
    request("refilled", 1900, same("allowed")),
  ];
  const weighted = newRateScenario("weighted");
  weighted.name = "Weighted costs and impossible demand";
  weighted.requests = [
    request("cost-two", 0, same("allowed"), "client-a", 2),
    request("cannot-fit-yet", 0, same("limited"), "client-a", 2),
    request("different-client", 0, same("allowed"), "client-b", 3),
    request("too-expensive", 100, same("limited"), "client-a", 4),
    request("remaining-unit", 200, same("allowed")),
  ];
  const recovery = newRateScenario("recovery");
  recovery.name = "Idle recovery and exact refill";
  recovery.requests = [
    request("consume-burst", 0, same("allowed"), "client-a", 3),
    request("half-token", 500, same("limited")),
    request("one-token", 1000, same("allowed")),
    request("late-two", 3000, same("allowed"), "client-a", 2),
  ];
  p.policies.push({
    id: "stacked",
    name: "Atomic global and client quotas",
    rules: [
      {
        ...newRateRule("global-quota", "fixed"),
        scope: "global",
        limit: 5,
        name: "Shared global quota",
      },
      { ...newRateRule("client-quota"), name: "Client token quota" },
    ],
  });
  for (const scenario of [burst, weighted, recovery])
    for (const r of scenario.requests) r.expect.stacked = r.expect.token;
  weighted.requests.find((r) => r.id === "remaining-unit")!.expect.stacked =
    "limited";
  const cardinality = newRateScenario("cardinality");
  cardinality.name = "Bounded client state and idle recovery";
  cardinality.budgets.maxCapacity = 1;
  cardinality.requests = Array.from({ length: 33 }, (_, i) =>
    request(
      `client-${i + 1}`,
      0,
      {
        token: i < 32 ? "allowed" : "capacity",
        fixed: i < 32 ? "allowed" : "capacity",
        sliding: i < 32 ? "allowed" : "capacity",
        stacked: i < 5 ? "allowed" : "limited",
      },
      `client-${i + 1}`,
    ),
  );
  cardinality.requests.push(
    request(
      "after-idle",
      1000,
      { ...same("allowed"), stacked: "allowed" },
      "client-33",
    ),
  );
  p.scenarios = [burst, weighted, recovery, cardinality];
  return normalizeRateProject(p);
}
