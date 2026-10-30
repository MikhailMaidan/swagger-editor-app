import { getByteSize } from "./text-encoding";

export const MAX_AUTHZ_BYTES = 2 * 1024 * 1024;
export const MAX_AUTHZ_CASES = 200;
export const MAX_AUTHZ_POLICIES = 5;
export const MAX_AUTHZ_RULES = 40;
export const AUTHZ_SOURCES = ["subject", "resource", "context"] as const;
export const AUTHZ_OPERATORS = [
  "exists",
  "absent",
  "equal",
  "notEqual",
  "in",
  "contains",
  "startsWith",
  "greater",
  "greaterOrEqual",
  "less",
  "lessOrEqual",
] as const;
export type AuthzJson =
  null | boolean | number | string | AuthzJson[] | { [key: string]: AuthzJson };
export type AuthzSource = (typeof AUTHZ_SOURCES)[number];
export type AuthzOperand =
  | { source: AuthzSource; pointer: string }
  | { source: "literal"; value: AuthzJson };
export type AuthzCondition = {
  operator: (typeof AUTHZ_OPERATORS)[number];
  left: AuthzOperand;
  right?: AuthzOperand;
};
export type AuthzRule = {
  id: string;
  name: string;
  enabled: boolean;
  effect: "allow" | "deny";
  actions: string[];
  mode: "all" | "any";
  conditions: AuthzCondition[];
};
export type AuthzPolicy = { id: string; name: string; rules: AuthzRule[] };
export type AuthzInput = {
  action: string;
  subject: Record<string, AuthzJson> | null;
  resource: Record<string, AuthzJson>;
  context: Record<string, AuthzJson>;
};
export type AuthzCase = AuthzInput & {
  id: string;
  name: string;
  expect: Record<string, "allow" | "deny">;
};
export type AuthzProject = {
  kind: "rsswag-authorization-project";
  version: 1;
  name: string;
  policies: AuthzPolicy[];
  cases: AuthzCase[];
};
export class AuthzError extends Error {
  constructor(
    public code:
      | "json"
      | "project"
      | "input"
      | "limit"
      | "pointer"
      | "cancelled"
      | "schema",
  ) {
    super(code);
    this.name = "AuthzError";
  }
}
export const authzObject = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);
export const authzText = (v: unknown, max = 120): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
const name = (v: unknown): v is string => authzText(v) && !!v.trim();
const id = (v: unknown): v is string =>
  authzText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
export const authzAction = (v: unknown): v is string =>
  authzText(v, 256) && !!v.trim();
export function authzPointer(v: unknown): v is string {
  return (
    authzText(v, 256) &&
    (v === "" || v.startsWith("/")) &&
    !/~(?![01])/u.test(v) &&
    v.split("/").length <= 33
  );
}
// Clone JSON into own properties. No executable expressions, inherited fields,
// regular expressions or prototype traversal are part of the policy language.
export function authzJsonValue(value: unknown, maxBytes = 65536): AuthzJson {
  let nodes = 0;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): AuthzJson {
    if (++nodes > 10000 || depth > 24) throw new AuthzError("limit");
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || active.has(v!)) throw new AuthzError("json");
    active.add(v!);
    let result: AuthzJson;
    if (Array.isArray(v)) {
      if (v.length > 10000 || Object.keys(v).length !== v.length)
        throw new AuthzError("json");
      for (let i = 0; i < v.length; i++)
        if (!Object.hasOwn(v, String(i))) throw new AuthzError("json");
      result = v.map((child) => visit(child, depth + 1));
    } else if (authzObject(v))
      result = Object.fromEntries(
        Object.entries(v).map(([k, child]) => [k, visit(child, depth + 1)]),
      );
    else throw new AuthzError("json");
    active.delete(v!);
    return result;
  }
  const result = visit(value, 0);
  if (getByteSize(JSON.stringify(result)) > maxBytes)
    throw new AuthzError("limit");
  return result;
}
export function authzJson(source: string, maxBytes = MAX_AUTHZ_BYTES): unknown {
  if (getByteSize(source) > maxBytes) throw new AuthzError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new AuthzError("json");
  }
}
export function normalizeAuthzOperand(v: unknown): AuthzOperand {
  if (!authzObject(v)) throw new AuthzError("project");
  if (v.source === "literal" && Object.hasOwn(v, "value"))
    return { source: "literal", value: authzJsonValue(v.value, 4096) };
  if (AUTHZ_SOURCES.includes(v.source as AuthzSource)) {
    if (!authzPointer(v.pointer)) throw new AuthzError("pointer");
    return { source: v.source as AuthzSource, pointer: v.pointer };
  }
  throw new AuthzError("project");
}
export function normalizeAuthzCondition(v: unknown): AuthzCondition {
  if (
    !authzObject(v) ||
    !AUTHZ_OPERATORS.includes(v.operator as AuthzCondition["operator"])
  )
    throw new AuthzError("project");
  const operator = v.operator as AuthzCondition["operator"],
    left = normalizeAuthzOperand(v.left);
  return operator === "exists" || operator === "absent"
    ? { operator, left }
    : { operator, left, right: normalizeAuthzOperand(v.right) };
}
export function normalizeAuthzRule(v: unknown): AuthzRule {
  if (
    !authzObject(v) ||
    !id(v.id) ||
    !name(v.name) ||
    typeof v.enabled !== "boolean" ||
    !["allow", "deny"].includes(v.effect as string) ||
    !["all", "any"].includes(v.mode as string) ||
    !Array.isArray(v.actions) ||
    !v.actions.length ||
    v.actions.length > 100 ||
    !v.actions.every(authzAction) ||
    new Set(v.actions).size !== v.actions.length ||
    !Array.isArray(v.conditions) ||
    v.conditions.length > 16 ||
    (v.mode === "any" && !v.conditions.length)
  )
    throw new AuthzError("project");
  return {
    id: v.id,
    name: v.name,
    enabled: v.enabled,
    effect: v.effect as AuthzRule["effect"],
    actions: [...v.actions],
    mode: v.mode as AuthzRule["mode"],
    conditions: v.conditions.map(normalizeAuthzCondition),
  };
}
export function normalizeAuthzPolicy(v: unknown): AuthzPolicy {
  if (
    !authzObject(v) ||
    !id(v.id) ||
    !name(v.name) ||
    !Array.isArray(v.rules) ||
    v.rules.length > MAX_AUTHZ_RULES
  )
    throw new AuthzError("project");
  const rules = v.rules.map(normalizeAuthzRule);
  if (new Set(rules.map((r) => r.id)).size !== rules.length)
    throw new AuthzError("project");
  return { id: v.id, name: v.name, rules };
}
export function normalizeAuthzInput(v: unknown): AuthzInput {
  if (!authzObject(v) || !authzAction(v.action)) throw new AuthzError("input");
  const data = authzJsonValue({
    subject: v.subject,
    resource: v.resource,
    context: v.context,
  }) as Record<string, AuthzJson>;
  if (
    !(data.subject === null || authzObject(data.subject)) ||
    !authzObject(data.resource) ||
    !authzObject(data.context)
  )
    throw new AuthzError("input");
  return {
    action: v.action,
    subject: data.subject as AuthzInput["subject"],
    resource: data.resource as AuthzInput["resource"],
    context: data.context as AuthzInput["context"],
  };
}
export function normalizeAuthzCase(v: unknown): AuthzCase {
  if (
    !authzObject(v) ||
    !id(v.id) ||
    !name(v.name) ||
    !authzObject(v.expect) ||
    Object.entries(v.expect).some(
      ([k, value]) => !id(k) || !["allow", "deny"].includes(value as string),
    )
  )
    throw new AuthzError("project");
  return {
    ...normalizeAuthzInput(v),
    id: v.id,
    name: v.name,
    expect: Object.fromEntries(Object.entries(v.expect)) as AuthzCase["expect"],
  };
}
export function normalizeAuthzProject(v: unknown): AuthzProject {
  if (
    !authzObject(v) ||
    v.kind !== "rsswag-authorization-project" ||
    v.version !== 1 ||
    !name(v.name) ||
    !Array.isArray(v.policies) ||
    !v.policies.length ||
    v.policies.length > MAX_AUTHZ_POLICIES ||
    !Array.isArray(v.cases) ||
    v.cases.length > MAX_AUTHZ_CASES
  )
    throw new AuthzError("project");
  const policies = v.policies.map(normalizeAuthzPolicy),
    cases = v.cases.map(normalizeAuthzCase),
    ids = new Set(policies.map((p) => p.id));
  if (
    ids.size !== policies.length ||
    new Set(cases.map((c) => c.id)).size !== cases.length ||
    cases.some((c) => Object.keys(c.expect).some((key) => !ids.has(key)))
  )
    throw new AuthzError("project");
  const p: AuthzProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    policies,
    cases,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_AUTHZ_BYTES)
    throw new AuthzError("limit");
  return p;
}
export const parseAuthzProject = (source: string) =>
  normalizeAuthzProject(authzJson(source));
export function serializeAuthzProject(value: AuthzProject): string {
  const p = normalizeAuthzProject(value),
    source = JSON.stringify(p, null, 2);
  return getByteSize(source) <= MAX_AUTHZ_BYTES ? source : JSON.stringify(p);
}
export const newAuthzRule = (id = "rule-1"): AuthzRule => ({
  id,
  name: id,
  enabled: true,
  effect: "allow",
  actions: ["documents:read"],
  mode: "all",
  conditions: [
    {
      operator: "equal",
      left: { source: "subject", pointer: "/tenantId" },
      right: { source: "resource", pointer: "/tenantId" },
    },
  ],
});
export const newAuthzCase = (id = "case-1"): AuthzCase => ({
  id,
  name: id,
  action: "documents:read",
  subject: { id: "alice", tenantId: "team-a", roles: ["reader"] },
  resource: { id: "document-1", tenantId: "team-a", ownerId: "alice" },
  context: {},
  expect: {},
});
export const emptyAuthzProject = (): AuthzProject => ({
  kind: "rsswag-authorization-project",
  version: 1,
  name: "Authorization project",
  policies: [
    { id: "policy-1", name: "Tenant-scoped reading", rules: [newAuthzRule()] },
  ],
  cases: [newAuthzCase()],
});
