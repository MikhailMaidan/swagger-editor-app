import { getByteSize } from "./text-encoding";

export const MAX_DT_PROJECT = 2 * 1024 * 1024;
export const MAX_DT_WORK = 50000;
export const MAX_DT_ANALYSIS = 2000000;
export const MAX_DT_CANDIDATES = 4096;
export type DTScalar = null | boolean | number | string;
export type DTJson = DTScalar | DTJson[] | { [key: string]: DTJson };
export type DTCell = { present: false } | { present: true; value: DTScalar };
export type DTInput = {
  id: string;
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  nullable: boolean;
  cost: number;
  catalog: DTCell[];
};
export type DTRef =
  | { kind: "input"; id: string }
  | { kind: "decision"; id: string; pointer: string };
export type DTExpr =
  | { op: "literal"; value: DTJson }
  | { op: "ref"; ref: DTRef }
  | {
      op: "add" | "subtract" | "multiply" | "divide";
      left: DTExpr;
      right: DTExpr;
    }
  | { op: "coalesce"; values: DTExpr[] };
export type DTCondition =
  | { op: "any" | "missing" | "present" }
  | { op: "eq" | "ne"; value: DTScalar }
  | { op: "in" | "notIn"; values: DTScalar[] }
  | {
      op: "range";
      min: number | null;
      max: number | null;
      minInclusive: boolean;
      maxInclusive: boolean;
    }
  | { op: "prefix"; value: string };
export type DTRule = {
  id: string;
  name: string;
  when: DTCondition[];
  output: DTExpr;
};
export type DTDecision = {
  id: string;
  name: string;
  policy: "unique" | "first" | "all" | "sum";
  columns: { id: string; name: string; source: DTRef }[];
  rules: DTRule[];
  fallback: DTExpr | null;
};
export type DTStatus =
  "matched" | "default" | "no-match" | "conflict" | "blocked" | "error";
export type DTExpectation = {
  status: DTStatus;
  output?: DTJson;
  matched?: string[];
  selected?: string[];
};
export type DTCase = {
  id: string;
  name: string;
  decisionId: string;
  context: Record<string, DTScalar>;
  expect: DTExpectation | null;
};
export type DTProject = {
  kind: "rsswag-decision-project";
  version: 1;
  name: string;
  inputs: DTInput[];
  decisions: DTDecision[];
  cases: DTCase[];
};
export class DecisionError extends Error {
  constructor(
    public code:
      | "json"
      | "project"
      | "limit"
      | "reference"
      | "context"
      | "work"
      | "cancelled"
      | "expression",
  ) {
    super(code);
    this.name = "DecisionError";
  }
}
export const dtObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const dtText = (v: unknown, max = 120): v is string =>
  typeof v === "string" && !!v.trim() && getByteSize(v) <= max;
export const dtId = (v: unknown): v is string =>
  dtText(v, 64) &&
  /^[A-Za-z_][A-Za-z0-9_-]*$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
export const dtInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const dtScalar = (v: unknown): v is DTScalar =>
  v === null ||
  typeof v === "boolean" ||
  (typeof v === "number" && Number.isFinite(v)) ||
  (typeof v === "string" && getByteSize(v) <= 256);
export function dtList(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new DecisionError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new DecisionError("project");
  return v;
}
export function dtJson(v: unknown, max = 4096, nodeLimit = 1024): DTJson {
  let nodes = 0;
  function visit(x: unknown, depth: number): DTJson {
    if (++nodes > nodeLimit || depth > 16) throw new DecisionError("limit");
    if (x === null || typeof x === "boolean" || typeof x === "string") return x;
    if (typeof x === "number" && Number.isFinite(x))
      return Object.is(x, -0) ? 0 : x;
    if (Array.isArray(x))
      return dtList(x, nodeLimit).map((item) => visit(item, depth + 1));
    if (
      dtObject(x) &&
      (Object.getPrototypeOf(x) === null ||
        Object.getPrototypeOf(Object.getPrototypeOf(x)) === null)
    )
      return Object.fromEntries(
        Object.keys(x)
          .sort()
          .map((k) => [k, visit(x[k], depth + 1)]),
      );
    throw new DecisionError("project");
  }
  const value = visit(v, 0);
  if (getByteSize(JSON.stringify(value)) > max)
    throw new DecisionError("limit");
  return value;
}
export function parseDtJson(text: string, max = MAX_DT_PROJECT): unknown {
  if (getByteSize(text) > max) throw new DecisionError("limit");
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new DecisionError("json");
  }
}
export const dtPointer = (v: unknown): v is string =>
  typeof v === "string" &&
  getByteSize(v) <= 256 &&
  (!v || v.startsWith("/")) &&
  !/~(?![01])/.test(v);
function normalizeDtRef(v: unknown): DTRef {
  if (!dtObject(v) || !dtId(v.id)) throw new DecisionError("reference");
  if (v.kind === "input") return { kind: v.kind, id: v.id };
  if (v.kind === "decision" && dtPointer(v.pointer))
    return { kind: v.kind, id: v.id, pointer: v.pointer };
  throw new DecisionError("reference");
}
export function normalizeDtExpr(
  v: unknown,
  depth = 0,
  budget = { nodes: 0 },
): DTExpr {
  if (++budget.nodes > 128 || depth > 8) throw new DecisionError("limit");
  if (!dtObject(v)) throw new DecisionError("expression");
  const next = (x: unknown) => normalizeDtExpr(x, depth + 1, budget);
  if (v.op === "literal") return { op: v.op, value: dtJson(v.value) };
  if (v.op === "ref") return { op: v.op, ref: normalizeDtRef(v.ref) };
  if (["add", "subtract", "multiply", "divide"].includes(v.op as string))
    return {
      op: v.op as "add" | "subtract" | "multiply" | "divide",
      left: next(v.left),
      right: next(v.right),
    };
  if (v.op === "coalesce") {
    const values = dtList(v.values, 8).map(next);
    if (!values.length) throw new DecisionError("expression");
    return { op: v.op, values };
  }
  throw new DecisionError("expression");
}
export function normalizeDtCondition(v: unknown): DTCondition {
  if (!dtObject(v)) throw new DecisionError("project");
  if (v.op === "any" || v.op === "present" || v.op === "missing")
    return { op: v.op };
  if ((v.op === "eq" || v.op === "ne") && dtScalar(v.value))
    return { op: v.op, value: dtJson(v.value) as DTScalar };
  if (v.op === "in" || v.op === "notIn") {
    const values = dtList(v.values, 16).map((item) => {
      if (!dtScalar(item)) throw new DecisionError("project");
      return dtJson(item) as DTScalar;
    });
    if (
      !values.length ||
      new Set(values.map((item) => JSON.stringify(item))).size !== values.length
    )
      throw new DecisionError("project");
    return { op: v.op, values };
  }
  if (
    v.op === "prefix" &&
    typeof v.value === "string" &&
    getByteSize(v.value) <= 256
  )
    return { op: v.op, value: v.value };
  if (
    v.op === "range" &&
    (v.min === null || (typeof v.min === "number" && Number.isFinite(v.min))) &&
    (v.max === null || (typeof v.max === "number" && Number.isFinite(v.max))) &&
    typeof v.minInclusive === "boolean" &&
    typeof v.maxInclusive === "boolean"
  ) {
    if (
      v.min !== null &&
      v.max !== null &&
      (v.min > v.max ||
        (v.min === v.max && (!v.minInclusive || !v.maxInclusive)))
    )
      throw new DecisionError("project");
    return {
      op: v.op,
      min: v.min,
      max: v.max,
      minInclusive: v.minInclusive,
      maxInclusive: v.maxInclusive,
    };
  }
  throw new DecisionError("project");
}
function dtUnique<T extends { id: string }>(values: T[]): T[] {
  if (new Set(values.map((v) => v.id)).size !== values.length)
    throw new DecisionError("project");
  return values;
}
export function normalizeDtDecision(v: unknown): DTDecision {
  if (
    !dtObject(v) ||
    !dtId(v.id) ||
    !dtText(v.name) ||
    !["unique", "first", "all", "sum"].includes(v.policy as string)
  )
    throw new DecisionError("project");
  const columns = dtUnique(
    dtList(v.columns, 8).map((c) => {
      if (!dtObject(c) || !dtId(c.id) || !dtText(c.name))
        throw new DecisionError("project");
      return { id: c.id, name: c.name, source: normalizeDtRef(c.source) };
    }),
  );
  const rules = dtUnique(
    dtList(v.rules, 24).map((r) => {
      if (!dtObject(r) || !dtId(r.id) || !dtText(r.name))
        throw new DecisionError("project");
      const when = dtList(r.when, 8).map(normalizeDtCondition);
      if (when.length !== columns.length) throw new DecisionError("project");
      return {
        id: r.id,
        name: r.name,
        when,
        output: normalizeDtExpr(r.output),
      };
    }),
  );
  return {
    id: v.id,
    name: v.name,
    policy: v.policy as DTDecision["policy"],
    columns,
    rules,
    fallback: v.fallback === null ? null : normalizeDtExpr(v.fallback),
  };
}
export function dtExpressionRefs(expr: DTExpr): DTRef[] {
  return expr.op === "ref"
    ? [expr.ref]
    : expr.op === "literal"
      ? []
      : expr.op === "coalesce"
        ? expr.values.flatMap(dtExpressionRefs)
        : [...dtExpressionRefs(expr.left), ...dtExpressionRefs(expr.right)];
}
export function dtDecisionRefs(decision: DTDecision): DTRef[] {
  return [
    ...decision.columns.map((c) => c.source),
    ...decision.rules.flatMap((r) => dtExpressionRefs(r.output)),
    ...(decision.fallback ? dtExpressionRefs(decision.fallback) : []),
  ];
}
export function dtDependencies(project: DTProject, rootId: string) {
  const decisions = new Set<string>(),
    inputs = new Set<string>();
  function visit(id: string) {
    if (decisions.has(id)) return;
    const decision = project.decisions.find((d) => d.id === id);
    if (!decision) throw new DecisionError("reference");
    decisions.add(id);
    for (const ref of dtDecisionRefs(decision)) {
      if (ref.kind === "input") inputs.add(ref.id);
      else visit(ref.id);
    }
  }
  visit(rootId);
  return {
    decisions: [...decisions],
    inputs: project.inputs
      .filter((input) => inputs.has(input.id))
      .map((input) => input.id),
  };
}
export function normalizeDtContext(
  project: DTProject,
  rootId: string,
  raw: unknown,
): Record<string, DTScalar> {
  if (
    !dtObject(raw) ||
    Object.keys(raw).some((key) => !project.inputs.some((i) => i.id === key))
  )
    throw new DecisionError("context");
  const required = new Set(dtDependencies(project, rootId).inputs),
    result: [string, DTScalar][] = [];
  for (const field of project.inputs) {
    if (!Object.hasOwn(raw, field.id)) {
      if (field.required && required.has(field.id))
        throw new DecisionError("context");
      continue;
    }
    const value = raw[field.id];
    if (
      !dtScalar(value) ||
      (value === null ? !field.nullable : typeof value !== field.type)
    )
      throw new DecisionError("context");
    result.push([field.id, dtJson(value) as DTScalar]);
  }
  return Object.fromEntries(result);
}
export function normalizeDtExpectation(v: unknown): DTExpectation | null {
  if (v === null) return null;
  if (
    !dtObject(v) ||
    ![
      "matched",
      "default",
      "no-match",
      "conflict",
      "blocked",
      "error",
    ].includes(v.status as string)
  )
    throw new DecisionError("project");
  const ids = (x: unknown) =>
    dtList(x, 24).map((id) => {
      if (!dtId(id)) throw new DecisionError("project");
      return id;
    });
  return {
    status: v.status as DTStatus,
    ...(Object.hasOwn(v, "output")
      ? { output: dtJson(v.output, 65536, 4096) }
      : {}),
    ...(Object.hasOwn(v, "matched") ? { matched: ids(v.matched) } : {}),
    ...(Object.hasOwn(v, "selected") ? { selected: ids(v.selected) } : {}),
  };
}
export function normalizeDtProject(raw: unknown): DTProject {
  if (
    !dtObject(raw) ||
    raw.kind !== "rsswag-decision-project" ||
    raw.version !== 1 ||
    !dtText(raw.name)
  )
    throw new DecisionError("project");
  const inputs: DTInput[] = dtUnique(
    dtList(raw.inputs, 8).map((v) => {
      if (
        !dtObject(v) ||
        !dtId(v.id) ||
        !dtText(v.name) ||
        !["number", "string", "boolean"].includes(v.type as string) ||
        typeof v.required !== "boolean" ||
        typeof v.nullable !== "boolean" ||
        !dtInt(v.cost, 1, 100)
      )
        throw new DecisionError("project");
      const catalog: DTCell[] = dtList(v.catalog, 8).map((cell) => {
        if (!dtObject(cell)) throw new DecisionError("project");
        if (cell.present === false && !v.required) return { present: false };
        if (
          cell.present !== true ||
          !dtScalar(cell.value) ||
          (cell.value === null ? !v.nullable : typeof cell.value !== v.type)
        )
          throw new DecisionError("project");
        return { present: true, value: dtJson(cell.value) as DTScalar };
      });
      if (
        !catalog.length ||
        new Set(catalog.map((c) => JSON.stringify(c))).size !== catalog.length
      )
        throw new DecisionError("project");
      return {
        id: v.id,
        name: v.name,
        type: v.type as DTInput["type"],
        required: v.required,
        nullable: v.nullable,
        cost: v.cost,
        catalog,
      };
    }),
  );
  const decisions = dtUnique(
      dtList(raw.decisions, 12).map(normalizeDtDecision),
    ),
    temporary: DTProject = {
      kind: raw.kind,
      version: 1,
      name: raw.name,
      inputs,
      decisions,
      cases: [],
    },
    seen = new Set<string>();
  function visit(id: string, path = new Set<string>()) {
    if (path.has(id)) throw new DecisionError("reference");
    if (seen.has(id)) return;
    const decision = decisions.find((d) => d.id === id);
    if (!decision) throw new DecisionError("reference");
    for (const ref of dtDecisionRefs(decision)) {
      if (ref.kind === "input") {
        if (!inputs.some((i) => i.id === ref.id))
          throw new DecisionError("reference");
      } else visit(ref.id, new Set([...path, id]));
    }
    seen.add(id);
  }
  decisions.forEach((d) => visit(d.id));
  const cases = dtUnique(
    dtList(raw.cases, 24).map((v) => {
      if (
        !dtObject(v) ||
        !dtId(v.id) ||
        !dtText(v.name) ||
        typeof v.decisionId !== "string" ||
        !decisions.some((d) => d.id === v.decisionId)
      )
        throw new DecisionError("reference");
      return {
        id: v.id,
        name: v.name,
        decisionId: v.decisionId,
        context: normalizeDtContext(temporary, v.decisionId, v.context),
        expect: normalizeDtExpectation(v.expect),
      };
    }),
  );
  const project = { ...temporary, cases };
  if (getByteSize(JSON.stringify(project)) > MAX_DT_PROJECT)
    throw new DecisionError("limit");
  return project;
}
export const parseDtProject = (text: string) =>
  normalizeDtProject(parseDtJson(text));
export function serializeDtProject(source: DTProject) {
  const p = normalizeDtProject(source),
    pretty = JSON.stringify(p, null, 2);
  return getByteSize(pretty) <= MAX_DT_PROJECT ? pretty : JSON.stringify(p);
}
export function emptyDtProject(): DTProject {
  return {
    kind: "rsswag-decision-project",
    version: 1,
    name: "API decision project",
    inputs: [
      {
        id: "amount",
        name: "Amount",
        type: "number",
        required: true,
        nullable: false,
        cost: 1,
        catalog: [
          { present: true, value: 0 },
          { present: true, value: 100 },
        ],
      },
    ],
    decisions: [
      {
        id: "decision",
        name: "Business decision",
        policy: "unique",
        columns: [
          {
            id: "amount",
            name: "Amount",
            source: { kind: "input", id: "amount" },
          },
        ],
        rules: [],
        fallback: null,
      },
    ],
    cases: [],
  };
}
