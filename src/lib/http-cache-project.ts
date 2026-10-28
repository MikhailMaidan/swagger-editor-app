import {
  CacheError,
  cacheControl,
  cacheHeaders,
  cacheObject,
  cacheText,
  cacheUrl,
  type CacheHeaders,
  type CacheMode,
} from "./http-cache";
import { getByteSize } from "./text-encoding";

export const MAX_CACHE_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_CACHE_BODY_BYTES = 128 * 1024;
export const MAX_CACHE_POLICIES = 5;
export const MAX_CACHE_SCENARIOS = 10;
export const MAX_CACHE_STEPS = 100;
export const CACHE_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;
export type CacheMethod = (typeof CACHE_METHODS)[number];
export type CacheOutcome =
  | "miss"
  | "fresh"
  | "stale"
  | "revalidated"
  | "stale-error"
  | "bypass"
  | "only-if-cached"
  | "error";
export const CACHE_OUTCOMES: CacheOutcome[] = [
  "miss",
  "fresh",
  "stale",
  "revalidated",
  "stale-error",
  "bypass",
  "only-if-cached",
  "error",
];
export type CachePolicy = {
  id: string;
  name: string;
  mode: CacheMode;
  capacity: number;
  maxBodyBytes: number;
  heuristic: boolean;
  staleIfError: boolean;
  responseCacheControl: string | null;
};
export type CacheOrigin =
  | {
      kind: "response";
      status: number;
      headers: CacheHeaders;
      body: string;
      delayMs: number;
    }
  | { kind: "network-error"; delayMs: number };
export type CacheStep = {
  id: string;
  name: string;
  atMs: number;
  method: CacheMethod;
  url: string;
  headers: CacheHeaders;
  origin: CacheOrigin | null;
  expect: { outcome?: CacheOutcome; status?: number };
};
export type CacheBudgets = {
  minHitPercent: number;
  maxOriginRequests: number;
  maxOriginBodyBytes: number;
  maxErrors: number;
};
export type CacheScenario = {
  id: string;
  name: string;
  steps: CacheStep[];
  budgets: CacheBudgets;
};
export type CacheProject = {
  kind: "rsswag-http-cache-project";
  version: 1;
  name: string;
  startTime: string;
  policies: CachePolicy[];
  scenarios: CacheScenario[];
};
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
function identity(v: Record<string, unknown>) {
  if (
    !cacheText(v.id, 80) ||
    !/^[a-zA-Z0-9_-]+$/.test(v.id) ||
    !cacheText(v.name, 120) ||
    !v.name.trim()
  )
    throw new CacheError("project");
  return { id: v.id, name: v.name };
}
export function normalizeCachePolicy(v: unknown): CachePolicy {
  if (
    !cacheObject(v) ||
    (v.mode !== "private" && v.mode !== "shared") ||
    !integer(v.capacity, 1, 100) ||
    !integer(v.maxBodyBytes, 1, MAX_CACHE_BODY_BYTES) ||
    typeof v.heuristic !== "boolean" ||
    typeof v.staleIfError !== "boolean" ||
    !(
      v.responseCacheControl === null ||
      (cacheText(v.responseCacheControl, 2048) &&
        !/[\x00-\x1f\x7f]/.test(v.responseCacheControl))
    )
  )
    throw new CacheError("project");
  if (
    v.responseCacheControl !== null &&
    cacheControl(v.responseCacheControl).invalid
  )
    throw new CacheError("project");
  return {
    ...identity(v),
    mode: v.mode as CacheMode,
    capacity: v.capacity,
    maxBodyBytes: v.maxBodyBytes,
    heuristic: v.heuristic,
    staleIfError: v.staleIfError,
    responseCacheControl: v.responseCacheControl,
  };
}
export function normalizeCacheStep(v: unknown): CacheStep {
  if (
    !cacheObject(v) ||
    !integer(v.atMs, 0, 604800000) ||
    !CACHE_METHODS.includes(v.method as CacheMethod) ||
    !cacheObject(v.expect)
  )
    throw new CacheError("project");
  const expect: CacheStep["expect"] = {};
  if (v.expect.outcome !== undefined) {
    if (!CACHE_OUTCOMES.includes(v.expect.outcome as CacheOutcome))
      throw new CacheError("project");
    expect.outcome = v.expect.outcome as CacheOutcome;
  }
  if (v.expect.status !== undefined) {
    if (
      !integer(v.expect.status, 0, 599) ||
      (v.expect.status > 0 && v.expect.status < 200)
    )
      throw new CacheError("project");
    expect.status = v.expect.status;
  }
  let origin: CacheOrigin | null = null;
  if (v.origin !== null) {
    if (!cacheObject(v.origin) || !integer(v.origin.delayMs, 0, 60000))
      throw new CacheError("project");
    if (v.origin.kind === "network-error")
      origin = { kind: "network-error", delayMs: v.origin.delayMs };
    else if (
      v.origin.kind === "response" &&
      integer(v.origin.status, 200, 599) &&
      cacheText(v.origin.body, MAX_CACHE_BODY_BYTES)
    ) {
      if ([204, 205, 304].includes(v.origin.status) && v.origin.body !== "")
        throw new CacheError("project");
      origin = {
        kind: "response",
        status: v.origin.status,
        headers: cacheHeaders(v.origin.headers),
        body: v.origin.body,
        delayMs: v.origin.delayMs,
      };
    } else throw new CacheError("project");
  }
  return {
    ...identity(v),
    atMs: v.atMs,
    method: v.method as CacheMethod,
    url: cacheUrl(v.url),
    headers: cacheHeaders(v.headers),
    origin,
    expect,
  };
}
export function normalizeCacheScenario(v: unknown): CacheScenario {
  if (
    !cacheObject(v) ||
    !Array.isArray(v.steps) ||
    !v.steps.length ||
    v.steps.length > MAX_CACHE_STEPS ||
    !cacheObject(v.budgets)
  )
    throw new CacheError("project");
  const b = v.budgets;
  if (
    !integer(b.minHitPercent, 0, 100) ||
    !integer(b.maxOriginRequests, 0, MAX_CACHE_STEPS) ||
    !integer(b.maxOriginBodyBytes, 0, MAX_CACHE_STEPS * MAX_CACHE_BODY_BYTES) ||
    !integer(b.maxErrors, 0, MAX_CACHE_STEPS)
  )
    throw new CacheError("project");
  const steps = v.steps.map(normalizeCacheStep);
  if (
    new Set(steps.map((s) => s.id)).size !== steps.length ||
    steps.some((s, i) => i > 0 && s.atMs < steps[i - 1].atMs)
  )
    throw new CacheError("project");
  return {
    ...identity(v),
    steps,
    budgets: {
      minHitPercent: b.minHitPercent,
      maxOriginRequests: b.maxOriginRequests,
      maxOriginBodyBytes: b.maxOriginBodyBytes,
      maxErrors: b.maxErrors,
    },
  };
}
export function normalizeCacheProject(v: unknown): CacheProject {
  if (
    !cacheObject(v) ||
    v.kind !== "rsswag-http-cache-project" ||
    v.version !== 1 ||
    !cacheText(v.startTime, 40) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v.startTime) ||
    !Number.isFinite(Date.parse(v.startTime)) ||
    !Array.isArray(v.policies) ||
    !v.policies.length ||
    v.policies.length > MAX_CACHE_POLICIES ||
    !Array.isArray(v.scenarios) ||
    !v.scenarios.length ||
    v.scenarios.length > MAX_CACHE_SCENARIOS
  )
    throw new CacheError("project");
  const policies = v.policies.map(normalizeCachePolicy),
    scenarios = v.scenarios.map(normalizeCacheScenario);
  if (
    new Set(policies.map((p) => p.id)).size !== policies.length ||
    new Set(scenarios.map((s) => s.id)).size !== scenarios.length
  )
    throw new CacheError("project");
  if (!cacheText(v.name, 120) || !v.name.trim())
    throw new CacheError("project");
  if (
    new Date(v.startTime).toISOString() !==
    (v.startTime.length === 20
      ? v.startTime.slice(0, -1) + ".000Z"
      : v.startTime)
  )
    throw new CacheError("project");
  const normalized: CacheProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    startTime: new Date(v.startTime).toISOString(),
    policies,
    scenarios,
  };
  if (getByteSize(JSON.stringify(normalized)) > MAX_CACHE_PROJECT_BYTES)
    throw new CacheError("limit");
  return normalized;
}
export function parseCacheProject(source: string): CacheProject {
  if (getByteSize(source) > MAX_CACHE_PROJECT_BYTES)
    throw new CacheError("limit");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CacheError("json");
  }
  return normalizeCacheProject(value);
}
export function serializeCacheProject(project: CacheProject): string {
  const normalized = normalizeCacheProject(project);
  const source = JSON.stringify(normalized, null, 2);
  // Every admitted project must remain exportable within its import limit.
  return getByteSize(source) > MAX_CACHE_PROJECT_BYTES
    ? JSON.stringify(normalized)
    : source;
}
export const defaultCachePolicy = (
  id = "private",
  mode: CacheMode = "private",
): CachePolicy => ({
  id,
  name: mode === "private" ? "Private cache" : "Shared cache",
  mode,
  capacity: 20,
  maxBodyBytes: MAX_CACHE_BODY_BYTES,
  heuristic: false,
  staleIfError: true,
  responseCacheControl: null,
});
export const defaultCacheBudgets = (): CacheBudgets => ({
  minHitPercent: 0,
  maxOriginRequests: MAX_CACHE_STEPS,
  maxOriginBodyBytes: MAX_CACHE_STEPS * MAX_CACHE_BODY_BYTES,
  maxErrors: 0,
});
export const defaultCacheStep = (id = "request-1", atMs = 0): CacheStep => ({
  id,
  name: id,
  atMs,
  method: "GET",
  url: "https://cache.example/items",
  headers: {},
  origin: {
    kind: "response",
    status: 200,
    headers: {
      "cache-control": "max-age=60",
      etag: '"items-v1"',
      "content-type": "application/json",
    },
    body: '{"items":[1,2,3]}',
    delayMs: 100,
  },
  expect: {},
});
export const emptyCacheProject = (): CacheProject => ({
  kind: "rsswag-http-cache-project",
  version: 1,
  name: "HTTP cache project",
  startTime: "2026-01-01T00:00:00.000Z",
  policies: [defaultCachePolicy(), defaultCachePolicy("shared", "shared")],
  scenarios: [
    {
      id: "scenario-1",
      name: "Request sequence",
      budgets: defaultCacheBudgets(),
      steps: [defaultCacheStep()],
    },
  ],
});
