import { getByteSize } from "./text-encoding";
export const MAX_RATE_BYTES = 2 * 1024 * 1024;
export const MAX_RATE_POLICIES = 5;
export const MAX_RATE_SCENARIOS = 8;
export const MAX_RATE_REQUESTS = 300;
export const MAX_RATE_RULES = 8;
export const MAX_RATE_HISTORY = 128;
export const RATE_ALGORITHMS = ["token", "fixed", "sliding"] as const;
export const RATE_SCOPES = [
  "global",
  "client",
  "route",
  "client-route",
] as const;
export const RATE_OUTCOMES = [
  "allowed",
  "limited",
  "capacity",
  "unmatched",
] as const;
export type RateAlgorithm = (typeof RATE_ALGORITHMS)[number];
export type RateScope = (typeof RATE_SCOPES)[number];
export type RateOutcome = (typeof RATE_OUTCOMES)[number];
export type RateRule = {
  id: string;
  name: string;
  enabled: boolean;
  algorithm: RateAlgorithm;
  scope: RateScope;
  limit: number;
  windowMs: number;
  refillTokens: number;
  refillMs: number;
  keyCapacity: number;
  matchMethod: string;
  matchRoute: string;
};
export type RatePolicy = { id: string; name: string; rules: RateRule[] };
export type RateRequest = {
  id: string;
  name: string;
  atMs: number;
  client: string;
  route: string;
  method: string;
  cost: number;
  expect: Record<string, RateOutcome>;
};
export type RateBudgets = {
  minAccepted: number;
  maxLimited: number;
  maxCapacity: number;
  maxUnmatched: number;
  maxRetryMs: number | null;
};
export type RateScenario = {
  id: string;
  name: string;
  requests: RateRequest[];
  budgets: RateBudgets;
};
export type RateProject = {
  kind: "rsswag-rate-limit-project";
  version: 1;
  name: string;
  clockMs: number;
  policies: RatePolicy[];
  scenarios: RateScenario[];
};
export type RateErrorCode =
  "json" | "project" | "limit" | "clock" | "request" | "har" | "cancelled";
export class RateError extends Error {
  constructor(public code: RateErrorCode) {
    super(code);
    this.name = "RateError";
  }
}
export const rateObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const rateText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const rateInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const id = (v: unknown): v is string =>
  rateText(v, 80) && /^[a-z0-9_-]+$/i.test(v);
const named = (v: unknown): v is string => rateText(v, 120) && !!v.trim();
export const rateMethod = (v: unknown): v is string =>
  rateText(v, 32) && /^[!#$%&'*+.^_`|~0-9A-Z-]+$/.test(v);
export function rateJson(source: string, max = MAX_RATE_BYTES): unknown {
  if (!rateText(source, max)) throw new RateError("limit");
  try {
    const value: unknown = JSON.parse(source.replace(/^\uFEFF/, ""));
    let nodes = 0;
    function visit(v: unknown, depth: number): unknown {
      if (++nodes > 100000 || depth > 64) throw new RateError("limit");
      if (
        v === null ||
        typeof v === "string" ||
        typeof v === "boolean" ||
        (typeof v === "number" && Number.isFinite(v))
      )
        return v;
      if (Array.isArray(v)) return v.map((child) => visit(child, depth + 1));
      if (rateObject(v))
        return Object.fromEntries(
          Object.entries(v).map(([k, child]) => [k, visit(child, depth + 1)]),
        );
      throw new RateError("json");
    }
    return visit(value, 0);
  } catch (e) {
    throw e instanceof RateError ? e : new RateError("json");
  }
}
export function normalizeRateRule(v: unknown): RateRule {
  if (
    !rateObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    typeof v.enabled !== "boolean" ||
    !RATE_ALGORITHMS.includes(v.algorithm as RateAlgorithm) ||
    !RATE_SCOPES.includes(v.scope as RateScope) ||
    !rateInt(v.limit, 1, 10000) ||
    !rateInt(v.windowMs, 1, 86400000) ||
    !rateInt(v.refillTokens, 1, 10000) ||
    !rateInt(v.refillMs, 1, 86400000) ||
    !rateInt(v.keyCapacity, 1, 128) ||
    !(v.matchMethod === "*" || rateMethod(v.matchMethod)) ||
    !rateText(v.matchRoute, 256)
  )
    throw new RateError("project");
  return {
    id: v.id,
    name: v.name,
    enabled: v.enabled,
    algorithm: v.algorithm as RateAlgorithm,
    scope: v.scope as RateScope,
    limit: v.limit,
    windowMs: v.windowMs,
    refillTokens: v.refillTokens,
    refillMs: v.refillMs,
    keyCapacity: v.keyCapacity,
    matchMethod: v.matchMethod as string,
    matchRoute: v.matchRoute,
  };
}
export function normalizeRatePolicy(v: unknown): RatePolicy {
  if (
    !rateObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !Array.isArray(v.rules) ||
    !v.rules.length ||
    v.rules.length > MAX_RATE_RULES
  )
    throw new RateError("project");
  const rules = v.rules.map(normalizeRateRule);
  if (new Set(rules.map((r) => r.id)).size !== rules.length)
    throw new RateError("project");
  return { id: v.id, name: v.name, rules };
}
export function normalizeRateRequest(v: unknown): RateRequest {
  if (
    !rateObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !rateInt(v.atMs, 0, 86400000) ||
    !named(v.client) ||
    !rateText(v.route, 256) ||
    !v.route.trim() ||
    !rateMethod(v.method) ||
    !rateInt(v.cost, 1, 10000) ||
    !rateObject(v.expect) ||
    Object.entries(v.expect).some(
      ([key, value]) =>
        !id(key) || !RATE_OUTCOMES.includes(value as RateOutcome),
    )
  )
    throw new RateError("request");
  return {
    id: v.id,
    name: v.name,
    atMs: v.atMs,
    client: v.client,
    route: v.route,
    method: v.method,
    cost: v.cost,
    expect: Object.fromEntries(Object.entries(v.expect)) as Record<
      string,
      RateOutcome
    >,
  };
}
export function normalizeRateScenario(v: unknown): RateScenario {
  if (
    !rateObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !Array.isArray(v.requests) ||
    v.requests.length > MAX_RATE_REQUESTS ||
    !rateObject(v.budgets)
  )
    throw new RateError("project");
  const requests = v.requests.map(normalizeRateRequest),
    b = v.budgets;
  if (
    new Set(requests.map((r) => r.id)).size !== requests.length ||
    ![b.minAccepted, b.maxLimited, b.maxCapacity, b.maxUnmatched].every(
      (value) => rateInt(value, 0, MAX_RATE_REQUESTS),
    ) ||
    !(b.maxRetryMs === null || rateInt(b.maxRetryMs, 0, 864000000000))
  )
    throw new RateError("project");
  return {
    id: v.id,
    name: v.name,
    requests,
    budgets: {
      minAccepted: b.minAccepted as number,
      maxLimited: b.maxLimited as number,
      maxCapacity: b.maxCapacity as number,
      maxUnmatched: b.maxUnmatched as number,
      maxRetryMs: b.maxRetryMs as number | null,
    },
  };
}
export function normalizeRateProject(v: unknown): RateProject {
  if (
    !rateObject(v) ||
    v.kind !== "rsswag-rate-limit-project" ||
    v.version !== 1 ||
    !named(v.name) ||
    !rateInt(v.clockMs, 0, 4102444800000) ||
    !Array.isArray(v.policies) ||
    !v.policies.length ||
    v.policies.length > MAX_RATE_POLICIES ||
    !Array.isArray(v.scenarios) ||
    !v.scenarios.length ||
    v.scenarios.length > MAX_RATE_SCENARIOS
  )
    throw new RateError("project");
  const policies = v.policies.map(normalizeRatePolicy),
    scenarios = v.scenarios.map(normalizeRateScenario);
  for (const list of [policies, scenarios])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw new RateError("project");
  const policyIds = new Set(policies.map((p) => p.id));
  if (
    scenarios.some((s) =>
      s.requests.some((r) =>
        Object.keys(r.expect).some((key) => !policyIds.has(key)),
      ),
    )
  )
    throw new RateError("project");
  const p: RateProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    clockMs: v.clockMs,
    policies,
    scenarios,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_RATE_BYTES)
    throw new RateError("limit");
  return p;
}
export const parseRateProject = (source: string) =>
  normalizeRateProject(rateJson(source));
export function serializeRateProject(value: RateProject): string {
  const p = normalizeRateProject(value),
    source = JSON.stringify(p, null, 2);
  return getByteSize(source) <= MAX_RATE_BYTES ? source : JSON.stringify(p);
}
export const newRateRule = (
  id = "rule-1",
  algorithm: RateAlgorithm = "token",
): RateRule => ({
  id,
  name: id,
  enabled: true,
  algorithm,
  scope: "client",
  limit: 3,
  windowMs: 1000,
  refillTokens: 1,
  refillMs: 1000,
  keyCapacity: 32,
  matchMethod: "*",
  matchRoute: "",
});
export const newRateRequest = (id = "request-1"): RateRequest => ({
  id,
  name: id,
  atMs: 0,
  client: "client-a",
  route: "/orders",
  method: "GET",
  cost: 1,
  expect: {},
});
export const newRateScenario = (id = "scenario-1"): RateScenario => ({
  id,
  name: id,
  requests: [newRateRequest()],
  budgets: {
    minAccepted: 1,
    maxLimited: 300,
    maxCapacity: 0,
    maxUnmatched: 0,
    maxRetryMs: null,
  },
});
export const emptyRateProject = (): RateProject => ({
  kind: "rsswag-rate-limit-project",
  version: 1,
  name: "Rate-limit and quota project",
  clockMs: 0,
  policies: [
    { id: "policy-1", name: "Per-client token bucket", rules: [newRateRule()] },
  ],
  scenarios: [newRateScenario()],
});
