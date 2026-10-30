import { parseOpenApiSchema } from "./openapi";
import { createAuthzEvaluator, type AuthzDecision } from "./authz-engine";
import {
  AuthzError,
  MAX_AUTHZ_BYTES,
  MAX_AUTHZ_CASES,
  authzAction,
  normalizeAuthzCase,
  normalizeAuthzProject,
  type AuthzCase,
  type AuthzCondition,
  type AuthzPolicy,
  type AuthzProject,
} from "./authz-project";
import { getByteSize } from "./text-encoding";

export type AuthzRow = {
  caseId: string;
  name: string;
  action: string;
  checked: boolean;
  expected?: "allow" | "deny";
  passed: boolean;
  decision: AuthzDecision;
  baseline: "allow" | "deny";
};
export type AuthzRun = {
  policyId: string;
  policyName: string;
  baselineId: string;
  total: number;
  checked: number;
  failed: number;
  allowed: number;
  denied: number;
  newGrants: number;
  newDenials: number;
  rows: AuthzRow[];
};
export async function runAuthzMatrix(
  value: AuthzProject,
  caseId?: string,
  cancelled?: () => boolean,
  progress?: (done: number, total: number) => void,
): Promise<AuthzRun[]> {
  const p = normalizeAuthzProject(value),
    cases = p.cases.filter((c) => !caseId || c.id === caseId);
  if (!cases.length) throw new AuthzError("project");
  const baseline = createAuthzEvaluator(p.policies[0]),
    baselineEffects = new Map<string, "allow" | "deny">(),
    runs: AuthzRun[] = [];
  const total = p.policies.length * cases.length;
  let done = 0;
  for (const policy of p.policies) {
    const evaluate = createAuthzEvaluator(policy),
      rows: AuthzRow[] = [];
    for (const c of cases) {
      if (cancelled?.()) throw new AuthzError("cancelled");
      if (!baselineEffects.has(c.id))
        baselineEffects.set(c.id, baseline(c).effect);
      const decision = evaluate(c),
        expected = Object.hasOwn(c.expect, policy.id)
          ? c.expect[policy.id]
          : undefined;
      rows.push({
        caseId: c.id,
        name: c.name,
        action: c.action,
        checked: expected !== undefined,
        expected,
        passed: expected === undefined || decision.effect === expected,
        decision,
        baseline: baselineEffects.get(c.id)!,
      });
      progress?.(++done, total);
      if (done % 20 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    runs.push({
      policyId: policy.id,
      policyName: policy.name,
      baselineId: p.policies[0].id,
      total: rows.length,
      checked: rows.filter((r) => r.checked).length,
      failed: rows.filter((r) => !r.passed).length,
      allowed: rows.filter((r) => r.decision.effect === "allow").length,
      denied: rows.filter((r) => r.decision.effect === "deny").length,
      newGrants: rows.filter(
        (r) => r.baseline === "deny" && r.decision.effect === "allow",
      ).length,
      newDenials: rows.filter(
        (r) => r.baseline === "allow" && r.decision.effect === "deny",
      ).length,
      rows,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (cancelled?.()) throw new AuthzError("cancelled");
  return runs;
}
export function authzReport(runs: AuthzRun[], details = false): string {
  const source = JSON.stringify(
    {
      kind: "rsswag-authorization-report",
      version: 1,
      policies: runs.map(({ rows, ...summary }) => ({
        ...summary,
        rows: details
          ? rows.map((row) => ({
              caseId: row.caseId,
              name: row.name,
              checked: row.checked,
              expected: row.expected,
              passed: row.passed,
              decision: row.decision,
              baseline: row.baseline,
            }))
          : undefined,
      })),
    },
    null,
    2,
  );
  if (getByteSize(source) > 16 * 1024 * 1024) throw new AuthzError("limit");
  return source;
}
export function generateAuthzCases(
  subjects: unknown,
  resources: unknown,
  actions: unknown,
  context: unknown,
  reserved: string[] = [],
): AuthzCase[] {
  if (
    !Array.isArray(subjects) ||
    !subjects.length ||
    !Array.isArray(resources) ||
    !resources.length ||
    !Array.isArray(actions) ||
    !actions.length ||
    !actions.every(authzAction) ||
    new Set(actions).size !== actions.length ||
    subjects.length * resources.length * actions.length > MAX_AUTHZ_CASES
  )
    throw new AuthzError("limit");
  const cases: AuthzCase[] = [],
    used = new Set(reserved);
  let index = 1;
  for (const [si, subject] of subjects.entries())
    for (const [ri, resource] of resources.entries())
      for (const action of actions) {
        while (used.has(`matrix-${index}`)) index++;
        const id = `matrix-${index++}`;
        used.add(id);
        cases.push(
          normalizeAuthzCase({
            id,
            name: `Subject ${si + 1} / resource ${ri + 1} / action ${actions.indexOf(action) + 1}`,
            action,
            subject,
            resource,
            context,
            expect: {},
          }),
        );
      }
  return cases;
}
export function authzActionsFromSchema(source: string): string[] {
  if (getByteSize(source) > MAX_AUTHZ_BYTES) throw new AuthzError("limit");
  const parsed = parseOpenApiSchema(source);
  if (!parsed.ok) throw new AuthzError("schema");
  const actions = [
    ...new Set(
      parsed.value.endpoints.map((e) => `${e.method.toUpperCase()} ${e.path}`),
    ),
  ];
  if (!actions.length || actions.length > 100 || !actions.every(authzAction))
    throw new AuthzError("limit");
  return actions;
}
export const tenantCondition = (): AuthzCondition => ({
  operator: "equal",
  left: { source: "subject", pointer: "/tenantId" },
  right: { source: "resource", pointer: "/tenantId" },
});
export const roleCondition = (): AuthzCondition => ({
  operator: "contains",
  left: { source: "subject", pointer: "/roles" },
  right: { source: "literal", value: "reader" },
});
export function demoAuthzProject(): AuthzProject {
  const role: AuthzPolicy = {
    id: "roles",
    name: "Role-only baseline",
    rules: [
      {
        id: "reader",
        name: "Readers can read documents",
        enabled: true,
        effect: "allow",
        actions: ["documents:read"],
        mode: "all",
        conditions: [roleCondition()],
      },
    ],
  };
  const tenant: AuthzPolicy = {
    id: "tenant",
    name: "Tenant isolation",
    rules: [
      { ...role.rules[0], conditions: [roleCondition(), tenantCondition()] },
      {
        id: "suspended",
        name: "Suspended identities are denied",
        enabled: true,
        effect: "deny",
        actions: ["*"],
        mode: "all",
        conditions: [
          {
            operator: "equal",
            left: { source: "subject", pointer: "/suspended" },
            right: { source: "literal", value: true },
          },
        ],
      },
    ],
  };
  const owner: AuthzPolicy = {
    id: "owner",
    name: "Tenant and ownership",
    rules: [
      ...tenant.rules,
      {
        id: "owner-write",
        name: "Owners can update within their tenant",
        enabled: true,
        effect: "allow",
        actions: ["documents:update"],
        mode: "all",
        conditions: [
          tenantCondition(),
          {
            operator: "equal",
            left: { source: "subject", pointer: "/id" },
            right: { source: "resource", pointer: "/ownerId" },
          },
          {
            operator: "equal",
            left: { source: "context", pointer: "/mfa" },
            right: { source: "literal", value: true },
          },
        ],
      },
    ],
  };
  const resource = { id: "document-a", tenantId: "tenant-a", ownerId: "alice" },
    alice = { id: "alice", tenantId: "tenant-a", roles: ["reader"] };
  const fixture = (
    id: string,
    subject: AuthzCase["subject"],
    action: string,
    expect: ["allow" | "deny", "allow" | "deny", "allow" | "deny"],
    context = { mfa: true },
  ): AuthzCase => ({
    id,
    name: id,
    action,
    subject,
    resource,
    context,
    expect: { roles: expect[0], tenant: expect[1], owner: expect[2] },
  });
  return normalizeAuthzProject({
    kind: "rsswag-authorization-project",
    version: 1,
    name: "Multi-tenant document access",
    policies: [role, tenant, owner],
    cases: [
      fixture("same-tenant-reader", alice, "documents:read", [
        "allow",
        "allow",
        "allow",
      ]),
      fixture(
        "cross-tenant-reader",
        { ...alice, tenantId: "tenant-b" },
        "documents:read",
        ["allow", "deny", "deny"],
      ),
      fixture(
        "suspended-reader",
        { ...alice, suspended: true },
        "documents:read",
        ["allow", "deny", "deny"],
      ),
      fixture("anonymous", null, "documents:read", ["deny", "deny", "deny"]),
      fixture(
        "missing-tenant",
        { id: "alice", roles: ["reader"] },
        "documents:read",
        ["allow", "deny", "deny"],
      ),
      fixture("owner-update", alice, "documents:update", [
        "deny",
        "deny",
        "allow",
      ]),
      fixture(
        "owner-without-mfa",
        alice,
        "documents:update",
        ["deny", "deny", "deny"],
        { mfa: false },
      ),
      fixture("other-owner", { ...alice, id: "bob" }, "documents:update", [
        "deny",
        "deny",
        "deny",
      ]),
      fixture(
        "cross-tenant-owner",
        { ...alice, tenantId: "tenant-b" },
        "documents:update",
        ["deny", "deny", "deny"],
      ),
      fixture(
        "suspended-owner",
        { ...alice, suspended: true },
        "documents:update",
        ["deny", "deny", "deny"],
      ),
      fixture("unknown-action", alice, "documents:delete", [
        "deny",
        "deny",
        "deny",
      ]),
      fixture(
        "typed-role-mismatch",
        { ...alice, roles: "reader" },
        "documents:read",
        ["deny", "deny", "deny"],
      ),
    ],
  });
}
