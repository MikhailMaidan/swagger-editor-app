import type { EndpointSummary } from "./openapi";
import { getByteSize } from "./text-encoding";

export const MAX_PLAN_CASES = 1000;
export const MAX_PLAN_BYTES = 16 * 1024 * 1024;
export const MAX_PLAN_NOTE = 1000;
export const PLAN_STATUSES = [
  "pending",
  "passed",
  "failed",
  "blocked",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type PlanKind =
  | "happy"
  | "omit"
  | "enum-valid"
  | "enum-invalid"
  | "minimum"
  | "below-minimum"
  | "maximum"
  | "above-maximum"
  | "min-length"
  | "shorter"
  | "max-length"
  | "longer"
  | "pattern"
  | "body-property";
export type PlanCase = {
  id: string;
  method: string;
  path: string;
  kind: PlanKind;
  location: string;
  name: string;
  value: string | null;
  expectation: "accept" | "reject" | "review";
};
export type PlanProgress = Record<string, { status: PlanStatus; note: string }>;
export type TestPlan = {
  cases: PlanCase[];
  truncated: boolean;
  skipped: number;
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const ordered = (values: string[] | undefined) => [...(values ?? [])].sort();
const compareIdentity = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function createApiTestPlan(endpoints: EndpointSummary[]): TestPlan {
  const cases: PlanCase[] = [];
  const ids = new Set<string>();
  let truncated = false;
  let skipped = 0;
  const unique = new Map(
    endpoints.map((endpoint) => [
      endpoint.method.toUpperCase() + " " + endpoint.path,
      endpoint,
    ]),
  );
  for (const endpoint of unique.values()) {
    // Only constraints participate in case identity; descriptions, examples and credentials do not.
    const parameters = endpoint.parameters
      .map((p) => ({
        name: p.name,
        location: p.location,
        type: p.type,
        required: p.required,
        enum: ordered(p.enumValues),
        minimum: p.minimum,
        maximum: p.maximum,
        minLength: p.minLength,
        maxLength: p.maxLength,
        pattern: p.pattern,
      }))
      .sort((a, b) =>
        compareIdentity(a.location + " " + a.name, b.location + " " + b.name),
      );
    const bodies = endpoint.requestBodies
      .map((body) => ({
        contentType: body.contentType,
        required: body.required,
        type: body.schema.type,
        properties: ordered(body.schema.requiredProperties),
      }))
      .sort((a, b) => compareIdentity(a.contentType, b.contentType));
    const context = JSON.stringify([
      parameters,
      bodies,
      endpoint.responses.map((r) => r.status).sort(),
    ]);
    if (context.length > 4096 || endpoint.path.length > 1024) {
      skipped++;
      continue;
    }
    const add = (
      kind: PlanKind,
      location = "request",
      name = "",
      value: string | null = null,
      expectation: PlanCase["expectation"] = "review",
    ) => {
      const id = JSON.stringify([
        endpoint.method.toUpperCase(),
        endpoint.path,
        context,
        kind,
        location,
        name,
        value,
      ]);
      if (ids.has(id)) return;
      if (cases.length >= MAX_PLAN_CASES) {
        truncated = true;
        return;
      }
      ids.add(id);
      cases.push({
        id,
        method: endpoint.method.toUpperCase(),
        path: endpoint.path,
        kind,
        location,
        name,
        value,
        expectation,
      });
    };
    add("happy", "request", "", null, "accept");
    for (const p of parameters) {
      if (p.required) add("omit", p.location, p.name, null, "reject");
      if (p.enum.length) {
        add("enum-valid", p.location, p.name, p.enum[0], "accept");
        let invalid = "__outside_enum__";
        while (p.enum.includes(invalid)) invalid += "_";
        add("enum-invalid", p.location, p.name, invalid, "reject");
      }
      for (const [limit, validKind, invalidKind, direction] of [
        [p.minimum, "minimum", "below-minimum", -1],
        [p.maximum, "maximum", "above-maximum", 1],
      ] as const) {
        if (
          (p.type === "integer" || p.type === "number") &&
          typeof limit === "number" &&
          Number.isFinite(limit) &&
          Math.abs(limit) < Number.MAX_SAFE_INTEGER
        ) {
          const boundary =
            p.type === "integer"
              ? direction < 0
                ? Math.ceil(limit)
                : Math.floor(limit)
              : limit;
          add(validKind, p.location, p.name, String(boundary), "accept");
          add(
            invalidKind,
            p.location,
            p.name,
            String(boundary + direction),
            "reject",
          );
        }
      }
      for (const [limit, validKind, invalidKind, direction] of [
        [p.minLength, "min-length", "shorter", -1],
        [p.maxLength, "max-length", "longer", 1],
      ] as const) {
        if (
          p.type === "string" &&
          typeof limit === "number" &&
          Number.isInteger(limit) &&
          limit >= 0 &&
          limit <= 256
        ) {
          add(validKind, p.location, p.name, "a".repeat(limit), "accept");
          if (limit + direction >= 0)
            add(
              invalidKind,
              p.location,
              p.name,
              "a".repeat(limit + direction),
              "reject",
            );
        }
      }
      if (p.pattern) add("pattern", p.location, p.name, p.pattern);
    }
    for (const body of bodies) {
      if (body.required) add("omit", "body", body.contentType, null, "reject");
      for (const property of body.properties)
        add(
          "body-property",
          "body",
          `${body.contentType} · ${property}`,
          null,
          "reject",
        );
    }
    if (truncated) break;
  }
  return { cases, truncated, skipped };
}

export function planSummary(cases: PlanCase[], progress: PlanProgress) {
  const result = {
    total: cases.length,
    pending: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
  };
  for (const test of cases) result[progress[test.id]?.status ?? "pending"]++;
  return result;
}

export function serializeTestPlan(cases: PlanCase[], progress: PlanProgress) {
  return JSON.stringify(
    {
      kind: "rsswag-api-test-plan",
      version: 1,
      summary: planSummary(cases, progress),
      cases: cases.map((test) => ({
        ...test,
        status: progress[test.id]?.status ?? "pending",
        note: progress[test.id]?.note ?? "",
      })),
    },
    null,
    2,
  );
}

export function importPlanProgress(
  text: string,
  cases: PlanCase[],
):
  | { ok: true; progress: PlanProgress; restored: number; ignored: number }
  | { ok: false; issue: "invalid" | "too-large" } {
  if (text.length > MAX_PLAN_BYTES || getByteSize(text) > MAX_PLAN_BYTES)
    return { ok: false, issue: "too-large" };
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, issue: "invalid" };
  }
  if (
    !object(data) ||
    data.kind !== "rsswag-api-test-plan" ||
    data.version !== 1 ||
    !Array.isArray(data.cases) ||
    data.cases.length > MAX_PLAN_CASES
  )
    return { ok: false, issue: "invalid" };
  const known = new Set(cases.map((test) => test.id));
  const seen = new Set<string>();
  const progress: PlanProgress = Object.create(null);
  let ignored = 0;
  for (const entry of data.cases) {
    if (
      !object(entry) ||
      typeof entry.id !== "string" ||
      seen.has(entry.id) ||
      !PLAN_STATUSES.includes(entry.status as PlanStatus) ||
      typeof entry.note !== "string" ||
      entry.note.length > MAX_PLAN_NOTE
    )
      return { ok: false, issue: "invalid" };
    seen.add(entry.id);
    if (known.has(entry.id))
      progress[entry.id] = {
        status: entry.status as PlanStatus,
        note: entry.note,
      };
    else ignored++;
  }
  return {
    ok: true,
    progress,
    restored: Object.keys(progress).length,
    ignored,
  };
}

export function testPlanMarkdown(
  cases: PlanCase[],
  progress: PlanProgress,
  labels: {
    title: string;
    columns: string[];
    kind: (kind: PlanKind) => string;
    status: (status: PlanStatus) => string;
    expectation: (value: PlanCase["expectation"]) => string;
  },
) {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replace(/[\\`*_{}\[\]()#!|]/g, "\\$&")
      .replace(/\r\n|\r|\n/g, "<br>");
  const row = (values: string[]) => `| ${values.map(escape).join(" | ")} |`;
  return `# ${escape(labels.title)}\n\n${row(labels.columns)}\n| ${labels.columns.map(() => "---").join(" | ")} |\n${cases.map((test) => row([`${test.method} ${test.path}`, labels.kind(test.kind), `${test.location} ${test.name}`.trim(), test.value === null ? "—" : JSON.stringify(test.value), labels.expectation(test.expectation), labels.status(progress[test.id]?.status ?? "pending"), progress[test.id]?.note ?? ""])).join("\n")}\n`;
}
