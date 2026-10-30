import { getByteSize } from "./text-encoding";
export const MAX_IDEM_BYTES = 2 * 1024 * 1024;
export const IDEM_OUTCOMES = [
  "executed",
  "failed",
  "replayed",
  "joined",
  "conflict",
  "in-flight",
  "capacity",
  "missing",
  "bypass",
  "unreplayable",
  "wait-timeout",
  "wait-capacity",
  "body-limit",
] as const;
export type IdemOutcome = (typeof IDEM_OUTCOMES)[number];
export type IdemPolicy = {
  id: string;
  name: string;
  scope: "client-route" | "client";
  inFlight: "reject" | "wait";
  missingKey: "reject" | "bypass";
  ttlMs: number;
  maxEntries: number;
  waitMs: number;
  maxWaiters: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  cacheErrors: boolean;
};
export type IdemIdentity = {
  client: string;
  route: string;
  method: string;
  key: string;
  contentType: string;
};
export type IdemRequest = IdemIdentity & {
  id: string;
  name: string;
  atMs: number;
  durationMs: number;
  body: string;
  reply: { status: number; body: string; failure: boolean };
  expect: Record<string, IdemOutcome>;
};
export type IdemScenario = {
  id: string;
  name: string;
  requests: IdemRequest[];
  budgets: { maxExecutions: number; maxRefusals: number; maxWaitMs: number };
};
export type IdemProject = {
  kind: "rsswag-idempotency-project";
  version: 1;
  name: string;
  policies: IdemPolicy[];
  scenarios: IdemScenario[];
};
export class IdemError extends Error {
  constructor(
    public code:
      "json" | "project" | "input" | "clock" | "limit" | "crypto" | "cancelled",
  ) {
    super(code);
    this.name = "IdemError";
  }
}
export const idemObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const idemText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const idemInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const id = (v: unknown): v is string =>
  idemText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
const named = (v: unknown): v is string => idemText(v, 120) && !!v.trim();
export const idemWriteMethod = (v: string) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes(v);
export function idemJson(source: string): unknown {
  if (getByteSize(source) > MAX_IDEM_BYTES) throw new IdemError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new IdemError("json");
  }
}
export function normalizeIdemPolicy(v: unknown): IdemPolicy {
  if (
    !idemObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !["client-route", "client"].includes(v.scope as string) ||
    !["reject", "wait"].includes(v.inFlight as string) ||
    !["reject", "bypass"].includes(v.missingKey as string) ||
    !idemInt(v.ttlMs, 1, 86400000) ||
    !idemInt(v.maxEntries, 1, 128) ||
    !idemInt(v.waitMs, 1, 60000) ||
    !idemInt(v.maxWaiters, 1, 32) ||
    !idemInt(v.maxRequestBytes, 1, 8192) ||
    !idemInt(v.maxResponseBytes, 1, 8192) ||
    typeof v.cacheErrors !== "boolean"
  )
    throw new IdemError("project");
  return {
    id: v.id,
    name: v.name,
    scope: v.scope as IdemPolicy["scope"],
    inFlight: v.inFlight as IdemPolicy["inFlight"],
    missingKey: v.missingKey as IdemPolicy["missingKey"],
    ttlMs: v.ttlMs,
    maxEntries: v.maxEntries,
    waitMs: v.waitMs,
    maxWaiters: v.maxWaiters,
    maxRequestBytes: v.maxRequestBytes,
    maxResponseBytes: v.maxResponseBytes,
    cacheErrors: v.cacheErrors,
  };
}
export function normalizeIdemIdentity(v: unknown): IdemIdentity {
  if (
    !idemObject(v) ||
    !named(v.client) ||
    !idemText(v.route, 256) ||
    !v.route.trim() ||
    !idemText(v.method, 32) ||
    !/^[A-Z]+$/.test(v.method) ||
    !idemText(v.key, 128) ||
    (v.key !== "" && !/^[\x21-\x7e]+$/.test(v.key)) ||
    !idemText(v.contentType, 256)
  )
    throw new IdemError("input");
  return {
    client: v.client,
    route: v.route,
    method: v.method,
    key: v.key,
    contentType: v.contentType,
  };
}
export function normalizeIdemRequest(v: unknown): IdemRequest {
  if (
    !idemObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !idemInt(v.atMs, 0, 86400000) ||
    !idemInt(v.durationMs, 0, 60000) ||
    !idemText(v.body, 16384) ||
    !idemObject(v.reply) ||
    !idemInt(v.reply.status, 200, 599) ||
    !idemText(v.reply.body, 16384) ||
    typeof v.reply.failure !== "boolean" ||
    !idemObject(v.expect) ||
    Object.entries(v.expect).some(
      ([key, value]) =>
        !id(key) || !IDEM_OUTCOMES.includes(value as IdemOutcome),
    )
  )
    throw new IdemError("project");
  return {
    ...normalizeIdemIdentity(v),
    id: v.id,
    name: v.name,
    atMs: v.atMs,
    durationMs: v.durationMs,
    body: v.body,
    reply: {
      status: v.reply.status,
      body: v.reply.body,
      failure: v.reply.failure,
    },
    expect: Object.fromEntries(
      Object.entries(v.expect),
    ) as IdemRequest["expect"],
  };
}
export function normalizeIdemProject(v: unknown): IdemProject {
  if (
    !idemObject(v) ||
    v.kind !== "rsswag-idempotency-project" ||
    v.version !== 1 ||
    !named(v.name) ||
    !Array.isArray(v.policies) ||
    !v.policies.length ||
    v.policies.length > 5 ||
    !Array.isArray(v.scenarios) ||
    !v.scenarios.length ||
    v.scenarios.length > 8
  )
    throw new IdemError("project");
  const policies = v.policies.map(normalizeIdemPolicy),
    ids = new Set(policies.map((p) => p.id));
  const scenarios = v.scenarios.map((s): IdemScenario => {
    if (
      !idemObject(s) ||
      !id(s.id) ||
      !named(s.name) ||
      !Array.isArray(s.requests) ||
      s.requests.length > 200 ||
      !idemObject(s.budgets) ||
      !idemInt(s.budgets.maxExecutions, 0, 200) ||
      !idemInt(s.budgets.maxRefusals, 0, 200) ||
      !idemInt(s.budgets.maxWaitMs, 0, 60000)
    )
      throw new IdemError("project");
    const requests = s.requests.map(normalizeIdemRequest);
    if (
      new Set(requests.map((r) => r.id)).size !== requests.length ||
      requests.some((r) => Object.keys(r.expect).some((key) => !ids.has(key)))
    )
      throw new IdemError("project");
    return {
      id: s.id,
      name: s.name,
      requests,
      budgets: {
        maxExecutions: s.budgets.maxExecutions,
        maxRefusals: s.budgets.maxRefusals,
        maxWaitMs: s.budgets.maxWaitMs,
      },
    };
  });
  if (
    ids.size !== policies.length ||
    new Set(scenarios.map((s) => s.id)).size !== scenarios.length
  )
    throw new IdemError("project");
  const p: IdemProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    policies,
    scenarios,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_IDEM_BYTES)
    throw new IdemError("limit");
  return p;
}
export const parseIdemProject = (source: string) =>
  normalizeIdemProject(idemJson(source));
export function serializeIdemProject(p: IdemProject): string {
  const value = normalizeIdemProject(p),
    pretty = JSON.stringify(value, null, 2);
  return getByteSize(pretty) <= MAX_IDEM_BYTES ? pretty : JSON.stringify(value);
}
export const newIdemPolicy = (id = "policy-1"): IdemPolicy => ({
  id,
  name: id,
  scope: "client-route",
  inFlight: "reject",
  missingKey: "reject",
  ttlMs: 1000,
  maxEntries: 32,
  waitMs: 500,
  maxWaiters: 8,
  maxRequestBytes: 4096,
  maxResponseBytes: 4096,
  cacheErrors: false,
});
export const newIdemRequest = (id = "request-1"): IdemRequest => ({
  id,
  name: id,
  client: "client-a",
  route: "/orders",
  method: "POST",
  key: "order-1",
  contentType: "application/json",
  body: '{"item":"book"}',
  atMs: 0,
  durationMs: 100,
  reply: { status: 201, body: '{"id":"order-created"}', failure: false },
  expect: {},
});
export const newIdemScenario = (id = "scenario-1"): IdemScenario => ({
  id,
  name: id,
  requests: [newIdemRequest()],
  budgets: { maxExecutions: 200, maxRefusals: 200, maxWaitMs: 60000 },
});
export const emptyIdemProject = (): IdemProject => ({
  kind: "rsswag-idempotency-project",
  version: 1,
  name: "Duplicate-write project",
  policies: [newIdemPolicy()],
  scenarios: [newIdemScenario()],
});
