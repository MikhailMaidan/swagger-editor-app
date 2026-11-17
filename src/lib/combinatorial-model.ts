import { getByteSize } from "./text-encoding";

export type CTScalar = string | number | boolean | null;
export type CTChoice = { id: string; label: string } & (
  { kind: "value"; value: CTScalar } | { kind: "omit" }
);
export type CTVariable = {
  id: string;
  name: string;
  location: "custom" | "path" | "query" | "header" | "cookie";
  choices: CTChoice[];
};
export type CTCondition =
  | { op: "is"; variable: string; choice: string }
  | { op: "not"; arg: CTCondition }
  | { op: "all" | "any"; args: CTCondition[] }
  | { op: "implies"; if: CTCondition; then: CTCondition };
export type CTConstraint = { id: string; name: string; condition: CTCondition };
export type CTRow = {
  id: string;
  name: string;
  choices: Record<string, string>;
  pinned: boolean;
};
export type CTProject = {
  version: 1;
  name: string;
  strength: 1 | 2 | 3;
  seed: number;
  variables: CTVariable[];
  constraints: CTConstraint[];
  rows: CTRow[];
};
export const CT_LIMITS = {
  bytes: 512 * 1024,
  variables: 12,
  choices: 8,
  constraints: 32,
  rows: 256,
  states: 200_000,
  candidates: 20_000,
  tuples: 20_000,
  incidences: 1_000_000,
} as const;
export type CTErrorCode =
  | "project"
  | "limit"
  | "reference"
  | "duplicate"
  | "condition"
  | "rows"
  | "unsatisfiable"
  | "invalid-row"
  | "cancelled"
  | "schema";
export class CTError extends Error {
  constructor(public readonly code: CTErrorCode) {
    super(code);
    this.name = "CTError";
  }
}
export function ctRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new CTError("project");
  return v as Record<string, unknown>;
}
function list(v: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(v) || v.length < min) throw new CTError("project");
  if (v.length > max) throw new CTError("limit");
  return v;
}
function text(v: unknown, max = 160) {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new CTError("project");
  return v.trim();
}
function id(v: unknown) {
  if (typeof v !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(v))
    throw new CTError("project");
  return v;
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new CTError("duplicate");
  return items;
}
export function parseCTJson(source: string): unknown {
  if (source.length > CT_LIMITS.bytes || getByteSize(source) > CT_LIMITS.bytes)
    throw new CTError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new CTError("project");
  }
}
function normalizeChoice(raw: unknown): CTChoice {
  const v = ctRecord(raw),
    base = { id: id(v.id), label: text(v.label) };
  if (v.kind === "omit") return { ...base, kind: "omit" };
  if (v.kind !== "value") throw new CTError("project");
  const value = v.value;
  if (
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "boolean" &&
    typeof value !== "number"
  )
    throw new CTError("project");
  if (
    (typeof value === "number" && !Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 2048)
  )
    throw new CTError("limit");
  return { ...base, kind: "value", value };
}
export function normalizeCTVariable(raw: unknown): CTVariable {
  const v = ctRecord(raw);
  if (
    !["custom", "path", "query", "header", "cookie"].includes(
      String(v.location),
    )
  )
    throw new CTError("project");
  const choices = unique(
    list(v.choices, CT_LIMITS.choices, 1).map(normalizeChoice),
  );
  const values = choices.map((c) =>
    c.kind === "omit" ? "omitted" : JSON.stringify(c.value),
  );
  if (new Set(values).size !== values.length) throw new CTError("duplicate");
  if (v.location === "path" && choices.some((c) => c.kind === "omit"))
    throw new CTError("project");
  return {
    id: id(v.id),
    name: text(v.name),
    location: v.location as CTVariable["location"],
    choices,
  };
}
function normalizeCondition(
  raw: unknown,
  variables: CTVariable[],
  budget: { n: number },
  depth = 0,
): CTCondition {
  if (++budget.n > 256 || depth > 12) throw new CTError("limit");
  const v = ctRecord(raw),
    next = (arg: unknown) =>
      normalizeCondition(arg, variables, budget, depth + 1);
  if (v.op === "is") {
    const variable = id(v.variable),
      choice = id(v.choice);
    if (
      !variables
        .find((item) => item.id === variable)
        ?.choices.some((item) => item.id === choice)
    )
      throw new CTError("reference");
    return { op: "is", variable, choice };
  }
  if (v.op === "not") return { op: "not", arg: next(v.arg) };
  if (v.op === "all" || v.op === "any")
    return { op: v.op, args: list(v.args, 16, 1).map(next) };
  if (v.op === "implies")
    return { op: "implies", if: next(v.if), then: next(v.then) };
  throw new CTError("condition");
}
export function normalizeCTRows(
  raw: unknown,
  variables: CTVariable[],
): CTRow[] {
  return unique(
    list(raw, CT_LIMITS.rows).map((item) => {
      const row = ctRecord(item),
        choices = ctRecord(row.choices);
      if (
        Object.keys(choices).length !== variables.length ||
        variables.some(
          (v) =>
            !Object.hasOwn(choices, v.id) ||
            !v.choices.some((c) => c.id === choices[v.id]),
        )
      )
        throw new CTError("rows");
      if (typeof row.pinned !== "boolean") throw new CTError("rows");
      return {
        id: id(row.id),
        name: text(row.name),
        choices: Object.fromEntries(
          variables.map((v) => [v.id, choices[v.id] as string]),
        ),
        pinned: row.pinned,
      };
    }),
  );
}
export function normalizeCTProject(raw: unknown): CTProject {
  const v = ctRecord(raw);
  if (
    v.version !== 1 ||
    !Number.isInteger(v.seed) ||
    Number(v.seed) < 0 ||
    Number(v.seed) > 0xffffffff
  )
    throw new CTError("project");
  const variables = unique(
    list(v.variables, CT_LIMITS.variables, 1).map(normalizeCTVariable),
  );
  if (
    ![1, 2, 3].includes(Number(v.strength)) ||
    typeof v.strength !== "number" ||
    v.strength > variables.length
  )
    throw new CTError("project");
  const constraints = unique(
    list(v.constraints, CT_LIMITS.constraints).map((raw) => {
      const constraint = ctRecord(raw);
      return {
        id: id(constraint.id),
        name: text(constraint.name),
        condition: normalizeCondition(constraint.condition, variables, {
          n: 0,
        }),
      };
    }),
  );
  const project: CTProject = {
    version: 1,
    name: text(v.name),
    seed: Number(v.seed),
    strength: v.strength as CTProject["strength"],
    variables,
    constraints,
    rows: normalizeCTRows(v.rows, variables),
  };
  if (getByteSize(JSON.stringify(project, null, 2)) > CT_LIMITS.bytes)
    throw new CTError("limit");
  return project;
}
export function parseCTProject(source: string) {
  return normalizeCTProject(parseCTJson(source));
}
export function serializeCTProject(project: CTProject) {
  return JSON.stringify(normalizeCTProject(project), null, 2);
}
export function ctFreshId(prefix: string, items: { id: string }[]) {
  let n = 1;
  while (items.some((item) => item.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
export function emptyCTProject(): CTProject {
  return {
    version: 1,
    name: "Combinatorial tests",
    strength: 2,
    seed: 42,
    constraints: [],
    rows: [],
    variables: ["a", "b", "c"].map((id) => ({
      id,
      name: id.toUpperCase(),
      location: "custom",
      choices: [false, true].map((value) => ({
        id: String(value),
        label: String(value),
        kind: "value",
        value,
      })),
    })),
  };
}
