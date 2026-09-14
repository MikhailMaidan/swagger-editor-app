import { getByteSize } from "@/lib/text-encoding";
import { getSelectedCharacterCount } from "@/lib/text-stats";

export const MAX_RESPONSE_ASSERTIONS = 50;
// Accommodates 50 rules at their field limits, even after JSON escaping.
export const MAX_ASSERTION_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_ASSERTION_BODY_BYTES = 1024 * 1024;

export const ASSERTION_OPERATORS = {
  status: ["equals", "gte", "lte"],
  header: ["exists", "absent", "equals", "contains"],
  body: [
    "exists",
    "absent",
    "equals",
    "contains",
    "type",
    "length",
    "gte",
    "lte",
  ],
  duration: ["lte", "gte"],
} as const;

export type AssertionTarget = keyof typeof ASSERTION_OPERATORS;
export type AssertionOperator =
  (typeof ASSERTION_OPERATORS)[AssertionTarget][number];
export type ResponseAssertion = {
  name: string;
  target: AssertionTarget;
  path: string;
  operator: AssertionOperator;
  expected: string;
};
export type AssertionResponse = {
  body: string;
  headers: Record<string, string>;
  status: string;
  durationMs: number;
  source: "live" | "mock";
};
export type AssertionIssue =
  | "invalid-rule"
  | "invalid-path"
  | "invalid-expected"
  | "unreadable-body"
  | "body-limit"
  | "unsafe-number"
  | "missing"
  | "wrong-type"
  | "unavailable";
export type AssertionResult = {
  outcome: "pass" | "fail" | "error";
  issue?: AssertionIssue;
};

const jsonTypes = ["object", "array", "string", "number", "boolean", "null"];
const numericPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const own = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  const number = Number(trimmed);
  return numericPattern.test(trimmed) &&
    Number.isFinite(number) &&
    (!Number.isInteger(number) || Number.isSafeInteger(number))
    ? number
    : null;
}

function parseBody(
  body: string,
): { ok: true; value: unknown } | { ok: false; issue: AssertionIssue } {
  if (
    body.length > MAX_ASSERTION_BODY_BYTES ||
    getByteSize(body) > MAX_ASSERTION_BODY_BYTES
  ) {
    return { ok: false, issue: "body-limit" };
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, issue: "unreadable-body" };
  }
  const pending = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++visited > 20_000 || entry.depth > 64) {
      return { ok: false, issue: "body-limit" };
    }
    if (
      typeof entry.value === "number" &&
      (!Number.isFinite(entry.value) ||
        (Number.isInteger(entry.value) && !Number.isSafeInteger(entry.value)))
    ) {
      return { ok: false, issue: "unsafe-number" };
    }
    if (entry.value !== null && typeof entry.value === "object") {
      const values = Object.values(entry.value);
      if (visited + pending.length + values.length > 20_000) {
        return { ok: false, issue: "body-limit" };
      }
      for (const child of values)
        pending.push({ value: child, depth: entry.depth + 1 });
    }
  }
  return { ok: true, value };
}

export function validateResponseAssertion(
  rule: ResponseAssertion,
): AssertionIssue | null {
  if (
    !rule ||
    typeof rule !== "object" ||
    typeof rule.name !== "string" ||
    rule.name.length > 120 ||
    typeof rule.path !== "string" ||
    rule.path.length > 512 ||
    typeof rule.expected !== "string" ||
    rule.expected.length > 4096 ||
    !own(ASSERTION_OPERATORS, rule.target) ||
    !(ASSERTION_OPERATORS[rule.target] as readonly string[]).includes(
      rule.operator,
    )
  ) {
    return "invalid-rule";
  }
  if (
    rule.target === "body" &&
    rule.path !== "" &&
    (!rule.path.startsWith("/") || /~(?![01])/u.test(rule.path))
  )
    return "invalid-path";
  if (
    rule.target === "header" &&
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(rule.path)
  )
    return "invalid-path";
  if (rule.operator === "exists" || rule.operator === "absent") return null;
  if (rule.operator === "type")
    return jsonTypes.includes(rule.expected) ? null : "invalid-expected";
  if (
    rule.operator === "gte" ||
    rule.operator === "lte" ||
    rule.operator === "length" ||
    rule.target === "status"
  ) {
    const number = parseNumber(rule.expected);
    if (
      number === null ||
      ((rule.target === "duration" || rule.operator === "length") &&
        number < 0) ||
      (rule.operator === "length" && !Number.isInteger(number)) ||
      (rule.target === "status" &&
        (!Number.isInteger(number) || number < 100 || number > 599))
    ) {
      return "invalid-expected";
    }
  }
  if (
    rule.target === "body" &&
    rule.operator === "equals" &&
    !parseBody(rule.expected).ok
  ) {
    return "invalid-expected";
  }
  return null;
}

function resolvePointer(
  value: unknown,
  pointer: string,
): { exists: boolean; value?: unknown } {
  if (pointer === "") return { exists: true, value };
  for (const part of pointer.slice(1).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) ||
      !own(value, key)
    ) {
      return { exists: false };
    }
    value = (value as Record<string, unknown>)[key];
  }
  return { exists: true, value };
}

function valueType(value: unknown) {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
}

function jsonEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    valueType(left) !== valueType(right) ||
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        own(right, key) &&
        jsonEquals(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
    )
  );
}

export function evaluateResponseAssertions(
  rules: ResponseAssertion[],
  response: AssertionResponse,
): AssertionResult[] {
  // Never silently run a truncated suite and report it as successful.
  if (rules.length > MAX_RESPONSE_ASSERTIONS) {
    return rules.map(() => ({ outcome: "error", issue: "invalid-rule" }));
  }
  let parsedBody: ReturnType<typeof parseBody> | undefined;
  const headers = new Map<string, string>();
  for (const [name, value] of Object.entries(response.headers)) {
    const key = name.trim().toLowerCase();
    headers.set(
      key,
      headers.has(key) ? `${headers.get(key)}, ${value.trim()}` : value.trim(),
    );
  }
  return rules.map((rule): AssertionResult => {
    const invalid = validateResponseAssertion(rule);
    if (invalid) return { outcome: "error", issue: invalid };
    let selected: { exists: boolean; value?: unknown };
    if (rule.target === "body") {
      parsedBody ??= parseBody(response.body);
      if (!parsedBody.ok) return { outcome: "error", issue: parsedBody.issue };
      selected = resolvePointer(parsedBody.value, rule.path);
    } else if (rule.target === "header") {
      const key = rule.path.toLowerCase();
      selected = { exists: headers.has(key), value: headers.get(key) };
    } else {
      const value =
        rule.target === "status"
          ? parseNumber(response.status)
          : response.durationMs;
      if (
        value === null ||
        !Number.isFinite(value) ||
        value < 0 ||
        (rule.target === "status" &&
          (!Number.isInteger(value) || value < 100 || value > 599))
      ) {
        return { outcome: "error", issue: "unavailable" };
      }
      selected = { exists: true, value };
    }
    let passed: boolean;
    const actual = selected.value;
    if (rule.operator === "exists" || rule.operator === "absent") {
      passed = rule.operator === "exists" ? selected.exists : !selected.exists;
    } else {
      if (!selected.exists) return { outcome: "fail", issue: "missing" };
      switch (rule.operator) {
        case "equals":
          passed =
            rule.target === "body"
              ? jsonEquals(actual, JSON.parse(rule.expected))
              : actual ===
                (rule.target === "status"
                  ? Number(rule.expected)
                  : rule.expected);
          break;
        case "contains":
          if (typeof actual !== "string")
            return { outcome: "fail", issue: "wrong-type" };
          passed = actual.includes(rule.expected);
          break;
        case "type":
          passed = valueType(actual) === rule.expected;
          break;
        case "length":
          if (typeof actual !== "string" && !Array.isArray(actual))
            return { outcome: "fail", issue: "wrong-type" };
          passed =
            (typeof actual === "string"
              ? getSelectedCharacterCount(actual, 0, actual.length)
              : actual.length) === Number(rule.expected);
          break;
        default:
          if (typeof actual !== "number")
            return { outcome: "fail", issue: "wrong-type" };
          passed =
            rule.operator === "gte"
              ? actual >= Number(rule.expected)
              : actual <= Number(rule.expected);
      }
    }
    return { outcome: passed ? "pass" : "fail" };
  });
}

export function serializeResponseAssertions(
  rules: ResponseAssertion[],
): string {
  return JSON.stringify(
    {
      kind: "rsswag-response-assertions",
      version: 1,
      checks: rules.map(({ name, target, path, operator, expected }) => ({
        name,
        target,
        path,
        operator,
        expected,
      })),
    },
    null,
    2,
  );
}

export function parseResponseAssertions(
  text: string,
):
  | { ok: true; rules: ResponseAssertion[] }
  | { ok: false; issue: "invalid-set" | "too-large" | "too-many" } {
  if (
    text.length > MAX_ASSERTION_IMPORT_BYTES ||
    getByteSize(text) > MAX_ASSERTION_IMPORT_BYTES
  ) {
    return { ok: false, issue: "too-large" };
  }
  try {
    const data = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (
      !data ||
      data.kind !== "rsswag-response-assertions" ||
      data.version !== 1 ||
      !Array.isArray(data.checks)
    ) {
      return { ok: false, issue: "invalid-set" };
    }
    if (data.checks.length > MAX_RESPONSE_ASSERTIONS)
      return { ok: false, issue: "too-many" };
    if (
      data.checks.some((rule: ResponseAssertion) =>
        validateResponseAssertion(rule),
      )
    ) {
      return { ok: false, issue: "invalid-set" };
    }
    // Strip unrecognized fields and canonicalize through the public format.
    return {
      ok: true,
      rules: JSON.parse(serializeResponseAssertions(data.checks)).checks,
    };
  } catch {
    return { ok: false, issue: "invalid-set" };
  }
}

export function serializeAssertionReport(
  rules: ResponseAssertion[],
  response: AssertionResponse,
  endpoint: { method: string; path: string },
): string {
  const results = evaluateResponseAssertions(rules, response);
  return JSON.stringify(
    {
      kind: "rsswag-response-assertion-report",
      version: 1,
      endpoint: { method: endpoint.method, path: endpoint.path },
      source: response.source,
      summary: {
        total: results.length,
        pass: results.filter((result) => result.outcome === "pass").length,
        fail: results.filter((result) => result.outcome === "fail").length,
        error: results.filter((result) => result.outcome === "error").length,
      },
      // Reports deliberately exclude both observed values and expected literals.
      results: results.map((result, index) => ({
        check: index + 1,
        ...result,
      })),
    },
    null,
    2,
  );
}
