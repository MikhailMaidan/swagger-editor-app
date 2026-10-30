import {
  normalizeAuthzInput,
  normalizeAuthzPolicy,
  type AuthzCondition,
  type AuthzInput,
  type AuthzJson,
  type AuthzOperand,
  type AuthzPolicy,
} from "./authz-project";

export type AuthzCheck = {
  index: number;
  operator: AuthzCondition["operator"];
  passed: boolean;
  reason: "matched" | "different" | "missing" | "type";
};
export type AuthzRuleTrace = {
  id: string;
  name: string;
  effect: "allow" | "deny";
  status: "disabled" | "action" | "matched" | "conditions";
  checks: AuthzCheck[];
};
export type AuthzDecision = {
  effect: "allow" | "deny";
  reason: "explicit-deny" | "explicit-allow" | "default-deny";
  matchedAllow: string[];
  matchedDeny: string[];
  rules: AuthzRuleTrace[];
};
type Resolved = { found: boolean; value?: AuthzJson };
function resolve(operand: AuthzOperand, input: AuthzInput): Resolved {
  if (operand.source === "literal")
    return { found: true, value: operand.value };
  let value: AuthzJson = input[operand.source];
  if (operand.pointer === "") return { found: true, value };
  for (const encoded of operand.pointer.slice(1).split("/")) {
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))
    )
      return { found: false };
    value = (value as Record<string, AuthzJson>)[key];
  }
  return { found: true, value };
}
function equal(a: AuthzJson, b: AuthzJson): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equal(
          (a as Record<string, AuthzJson>)[key],
          (b as Record<string, AuthzJson>)[key],
        ),
    )
  );
}
function check(
  condition: AuthzCondition,
  input: AuthzInput,
  index: number,
): AuthzCheck {
  const left = resolve(condition.left, input),
    right = condition.right
      ? resolve(condition.right, input)
      : { found: false };
  const result = (
    passed: boolean,
    reason: AuthzCheck["reason"] = passed ? "matched" : "different",
  ): AuthzCheck => ({ index, operator: condition.operator, passed, reason });
  if (condition.operator === "exists") return result(left.found);
  if (condition.operator === "absent") return result(!left.found);
  if (!left.found || !right.found) return result(false, "missing");
  const a = left.value!,
    b = right.value!;
  switch (condition.operator) {
    case "equal":
      return result(equal(a, b));
    case "notEqual":
      return result(!equal(a, b));
    case "in":
      return Array.isArray(b)
        ? result(b.some((v) => equal(a, v)))
        : result(false, "type");
    case "contains":
      return Array.isArray(a)
        ? result(a.some((v) => equal(v, b)))
        : result(false, "type");
    case "startsWith":
      return typeof a === "string" && typeof b === "string"
        ? result(a.startsWith(b))
        : result(false, "type");
    default:
      if (typeof a !== "number" || typeof b !== "number")
        return result(false, "type");
      return result(
        condition.operator === "greater"
          ? a > b
          : condition.operator === "greaterOrEqual"
            ? a >= b
            : condition.operator === "less"
              ? a < b
              : a <= b,
      );
  }
}
export function createAuthzEvaluator(value: AuthzPolicy) {
  const policy = normalizeAuthzPolicy(value);
  return (value: unknown): AuthzDecision => {
    const input = normalizeAuthzInput(value),
      matchedAllow: string[] = [],
      matchedDeny: string[] = [];
    const rules = policy.rules.map((rule): AuthzRuleTrace => {
      const base = { id: rule.id, name: rule.name, effect: rule.effect };
      if (!rule.enabled) return { ...base, status: "disabled", checks: [] };
      if (!rule.actions.includes("*") && !rule.actions.includes(input.action))
        return { ...base, status: "action", checks: [] };
      const checks = rule.conditions.map((c, index) => check(c, input, index));
      const matches =
        rule.mode === "all"
          ? checks.every((c) => c.passed)
          : checks.some((c) => c.passed);
      if (matches)
        (rule.effect === "allow" ? matchedAllow : matchedDeny).push(rule.id);
      return { ...base, status: matches ? "matched" : "conditions", checks };
    });
    return {
      effect: matchedDeny.length || !matchedAllow.length ? "deny" : "allow",
      reason: matchedDeny.length
        ? "explicit-deny"
        : matchedAllow.length
          ? "explicit-allow"
          : "default-deny",
      matchedAllow,
      matchedDeny,
      rules,
    };
  };
}
