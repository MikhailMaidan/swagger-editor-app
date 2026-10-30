import { describe, expect, it } from "vitest";
import { createAuthzEvaluator } from "./authz-engine";
import {
  AUTHZ_OPERATORS,
  MAX_AUTHZ_BYTES,
  authzJson,
  authzJsonValue,
  emptyAuthzProject,
  newAuthzCase,
  newAuthzRule,
  normalizeAuthzInput,
  normalizeAuthzPolicy,
  normalizeAuthzProject,
  parseAuthzProject,
  serializeAuthzProject,
  type AuthzCondition,
  type AuthzJson,
  type AuthzOperand,
  type AuthzPolicy,
} from "./authz-project";
import {
  authzActionsFromSchema,
  authzReport,
  demoAuthzProject,
  generateAuthzCases,
  runAuthzMatrix,
} from "./authz-studio";
import { DEFAULT_OPENAPI_SCHEMA } from "./openapi";
export const literal = (value: AuthzJson): AuthzOperand => ({
  source: "literal",
  value,
});
export const conditionPolicy = (condition: AuthzCondition): AuthzPolicy => ({
  id: "p",
  name: "p",
  rules: [{ ...newAuthzRule(), actions: ["*"], conditions: [condition] }],
});
export const operatorCases: [
  AuthzCondition["operator"],
  AuthzJson,
  AuthzJson,
  boolean,
][] = [
  ["equal", { a: 1, b: [2, null] }, { b: [2, null], a: 1 }, true],
  ["equal", [1, 2], [2, 1], false],
  ["equal", 1, "1", false],
  ["notEqual", false, 0, true],
  ["in", { id: 1 }, [{ id: 1 }], true],
  ["in", 1, ["1"], false],
  ["in", 1, "1", false],
  ["contains", ["reader", 1], "reader", true],
  ["contains", "reader", "read", false],
  ["startsWith", "/documents/a", "/documents/", true],
  ["startsWith", 12, "1", false],
  ["greater", 3, 2, true],
  ["greater", "3", 2, false],
  ["greaterOrEqual", 2, 2, true],
  ["less", 1, 2, true],
  ["lessOrEqual", 2, 2, true],
  ["less", 3, 2, false],
];
describe("authorization policy engine and portable projects", () => {
  it.each(operatorCases)(
    "evaluates %s on typed operands %#",
    (operator, a, b, allowed) => {
      const result = createAuthzEvaluator(
        conditionPolicy({ operator, left: literal(a), right: literal(b) }),
      )(newAuthzCase());
      expect(result.effect).toBe(allowed ? "allow" : "deny");
    },
  );
  it("denies by default and evaluates all matching denies independently of order", () => {
    expect(
      createAuthzEvaluator({ id: "p", name: "p", rules: [] })(newAuthzCase())
        .reason,
    ).toBe("default-deny");
    const allow = { ...newAuthzRule("allow"), actions: ["*"], conditions: [] },
      deny = { ...allow, id: "deny", effect: "deny" as const };
    for (const rules of [
      [allow, deny],
      [deny, allow],
    ])
      expect(
        createAuthzEvaluator({ id: "p", name: "p", rules })(newAuthzCase()),
      ).toMatchObject({
        effect: "deny",
        reason: "explicit-deny",
        matchedAllow: ["allow"],
        matchedDeny: ["deny"],
      });
  });
  it("distinguishes null, absent and inherited fields, including negative comparisons", () => {
    for (const operator of AUTHZ_OPERATORS.filter((v) => v !== "absent")) {
      const evaluate = createAuthzEvaluator(
        conditionPolicy({
          operator,
          left: { source: "subject", pointer: "/missing" },
          right: literal(1),
        }),
      );
      expect(evaluate(newAuthzCase()).effect).toBe("deny");
    }
    const exists = (
      pointer: string,
      operator: "exists" | "absent" = "exists",
    ) =>
      createAuthzEvaluator(
        conditionPolicy({ operator, left: { source: "subject", pointer } }),
      );
    expect(exists("/toString")(newAuthzCase()).effect).toBe("deny");
    expect(exists("/missing", "absent")(newAuthzCase()).effect).toBe("allow");
    expect(exists("")({ ...newAuthzCase(), subject: null }).effect).toBe(
      "allow",
    );
    expect(
      exists("/value")({ ...newAuthzCase(), subject: { value: null } }).effect,
    ).toBe("allow");
  });
  it("reads escaped own pointers, canonical array indexes and prototype-named JSON data safely", () => {
    const subject = JSON.parse(
      '{"a/b":{"~key":[null,7]},"__proto__":{"safe":true}}',
    );
    for (const pointer of ["/a~1b/~0key/1", "/__proto__/safe"])
      expect(
        createAuthzEvaluator(
          conditionPolicy({
            operator: "exists",
            left: { source: "subject", pointer },
          }),
        )({ ...newAuthzCase(), subject }).effect,
      ).toBe("allow");
    for (const pointer of [
      "/a~1b/~0key/01",
      "/a~1b/~0key/length",
      "/constructor/prototype",
    ])
      expect(
        createAuthzEvaluator(
          conditionPolicy({
            operator: "exists",
            left: { source: "subject", pointer },
          }),
        )({ ...newAuthzCase(), subject }).effect,
      ).toBe("deny");
    expect(Object.hasOwn({}, "safe")).toBe(false);
  });
  it("supports All/Any without coercion or action patterns, and explains disabled/skipped rules", () => {
    const rule = {
      ...newAuthzRule(),
      conditions: [
        { operator: "equal" as const, left: literal(1), right: literal(2) },
        { operator: "equal" as const, left: literal(1), right: literal(1) },
      ],
    };
    expect(
      createAuthzEvaluator({ id: "p", name: "p", rules: [rule] })(
        newAuthzCase(),
      ).effect,
    ).toBe("deny");
    expect(
      createAuthzEvaluator({
        id: "p",
        name: "p",
        rules: [{ ...rule, mode: "any" }],
      })(newAuthzCase()).effect,
    ).toBe("allow");
    const result = createAuthzEvaluator({
      id: "p",
      name: "p",
      rules: [
        { ...rule, enabled: false },
        { ...rule, id: "other", actions: ["documents:*"] },
      ],
    })(newAuthzCase());
    expect(result.rules.map((r) => r.status)).toEqual(["disabled", "action"]);
    expect(() =>
      normalizeAuthzPolicy({
        id: "p",
        name: "p",
        rules: [{ ...rule, mode: "any", conditions: [] }],
      }),
    ).toThrow();
  });
  it("snapshots a policy and clones attribute inputs without modifying the caller", () => {
    const p = emptyAuthzProject(),
      evaluate = createAuthzEvaluator(p.policies[0]),
      c = p.cases[0],
      before = JSON.stringify(c);
    p.policies[0].rules[0].enabled = false;
    expect(evaluate(c).effect).toBe("allow");
    expect(JSON.stringify(c)).toBe(before);
  });
  it("rejects invalid JSON values, cycles, sparse arrays, excess depth and oversized attributes", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = Object.assign(Array(1), { extra: 1 });
    for (const value of [
      undefined,
      NaN,
      Infinity,
      () => 1,
      new Date(),
      cycle,
      sparse,
    ])
      expect(() => authzJsonValue(value)).toThrow();
    let deep: unknown = null;
    for (let i = 0; i < 26; i++) deep = { deep };
    expect(() => authzJsonValue(deep)).toThrow();
    expect(() =>
      normalizeAuthzInput({
        ...newAuthzCase(),
        context: { value: "x".repeat(65536) },
      }),
    ).toThrow();
    expect(() =>
      normalizeAuthzInput({ ...newAuthzCase(), subject: [] }),
    ).toThrow();
  });
  it("roundtrips projects without supplied runtime/results and protects identifiers and limits", () => {
    const p = demoAuthzProject(),
      raw = { ...p, results: [{ secret: "discard" }], runtime: {} };
    expect(parseAuthzProject(serializeAuthzProject(raw))).toEqual(p);
    expect(() => parseAuthzProject("{")).toThrow();
    expect(() => authzJson(" ".repeat(MAX_AUTHZ_BYTES + 1))).toThrow();
    expect(() =>
      normalizeAuthzProject({ ...p, policies: [...p.policies, p.policies[0]] }),
    ).toThrow();
    expect(() =>
      normalizeAuthzProject({
        ...p,
        cases: [{ ...p.cases[0], expect: { absent: "allow" } }],
      }),
    ).toThrow();
    expect(() =>
      normalizeAuthzPolicy({
        ...p.policies[0],
        rules: [
          {
            ...p.policies[0].rules[0],
            conditions: [
              {
                operator: "exists",
                left: { source: "subject", pointer: "/bad~2" },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      normalizeAuthzProject({
        ...p,
        cases: Array.from({ length: 201 }, (_, i) => newAuthzCase(`c-${i}`)),
      }),
    ).toThrow();
  });
  it("treats prototype-named policy IDs as explicit expectation keys", async () => {
    const p = emptyAuthzProject();
    p.policies[0].id = "__proto__";
    p.cases[0].expect = Object.fromEntries([["__proto__", "deny"]]);
    expect((await runAuthzMatrix(p))[0]).toMatchObject({
      checked: 1,
      failed: 1,
    });
  });
});
describe("access comparisons, generation and reports", () => {
  it("passes all 36 demo expectations and highlights intended grant/denial differences", async () => {
    const runs = await runAuthzMatrix(demoAuthzProject());
    expect(runs.map((r) => r.checked)).toEqual([12, 12, 12]);
    expect(runs.map((r) => r.failed)).toEqual([0, 0, 0]);
    expect(runs[1]).toMatchObject({ newGrants: 0, newDenials: 3 });
    expect(runs[2]).toMatchObject({ newGrants: 1, newDenials: 3 });
    expect(
      runs[2].rows.find((r) => r.caseId === "suspended-owner")?.decision,
    ).toMatchObject({
      effect: "deny",
      reason: "explicit-deny",
      matchedAllow: ["owner-write"],
    });
  });
  it("counts unchecked expectations and reports actual failures rather than silently passing them", async () => {
    const p = emptyAuthzProject();
    p.cases.push({ ...newAuthzCase("wrong"), expect: { "policy-1": "deny" } });
    const result = (await runAuthzMatrix(p))[0];
    expect(result).toMatchObject({ total: 2, checked: 1, failed: 1 });
    expect((await runAuthzMatrix(p, "wrong"))[0].total).toBe(1);
    await expect(runAuthzMatrix(p, "missing")).rejects.toThrow();
    await expect(runAuthzMatrix({ ...p, cases: [] })).rejects.toThrow();
  });
  it("snapshots runs and cancels before partial comparisons can be published", async () => {
    const p = demoAuthzProject();
    let cancel = false;
    await expect(
      runAuthzMatrix(
        p,
        undefined,
        () => cancel,
        () => {
          cancel = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    const run = runAuthzMatrix(p);
    p.policies[0].rules = [];
    expect((await run)[0].allowed).toBe(4);
  });
  it("omits attribute/action values from both report modes while retaining checks", async () => {
    const p = emptyAuthzProject();
    p.cases[0].subject = { tenantId: "private-tenant" };
    p.cases[0].resource = { tenantId: "private-tenant" };
    p.cases[0].action = "private-action";
    p.cases[0].context = { secret: "private-context" };
    const runs = await runAuthzMatrix(p);
    for (const details of [false, true]) {
      const source = authzReport(runs, details);
      for (const secret of [
        "private-tenant",
        "private-action",
        "private-context",
      ])
        expect(source).not.toContain(secret);
      expect(JSON.parse(source).policies[0].rows === undefined).toBe(!details);
    }
  });
  it("generates bounded Cartesian cases without colliding with existing IDs or sharing attributes", () => {
    const subjects = [null, { tenantId: "a" }],
      resources = [{ tenantId: "a" }, { tenantId: "b" }];
    const cases = generateAuthzCases(
      subjects,
      resources,
      ["read", "write"],
      {},
      ["matrix-1"],
    );
    expect(cases).toHaveLength(8);
    expect(cases[0].id).toBe("matrix-2");
    expect(cases.every((c) => Object.keys(c.expect).length === 0)).toBe(true);
    resources[0].tenantId = "changed";
    expect(cases[0].resource.tenantId).toBe("a");
    expect(() =>
      generateAuthzCases(Array(201).fill(null), [{}], ["read"], {}),
    ).toThrow();
    expect(() =>
      generateAuthzCases([null], [{}], ["read", "read"], {}),
    ).toThrow();
    expect(() => generateAuthzCases([null], [{}], ["read"], null)).toThrow();
  });
  it("uses exact OpenAPI operation labels without applying security schemes or modifying the document", () => {
    const actions = authzActionsFromSchema(DEFAULT_OPENAPI_SCHEMA);
    expect(actions).toContain("GET /users/{id}");
    expect(actions).toContain("POST /users/{id}");
    expect(() => authzActionsFromSchema("openapi: [")).toThrow();
  });
});
