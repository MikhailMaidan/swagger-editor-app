import { getByteSize } from "./text-encoding";

export const MAX_DQ_PROJECT = 4 * 1024 * 1024;
export const MAX_DQ_IMPORT = 2 * 1024 * 1024;
export const MAX_DQ_RESULT = 4 * 1024 * 1024;
export const MAX_DQ_ROWS = 5000;
export const MAX_DQ_WORK = 250000;
export type DQJson =
  null | boolean | number | string | DQJson[] | { [key: string]: DQJson };
export type DQRecord = { [key: string]: DQJson };
export type DQRef = { kind: "dataset" | "query"; id: string };
export type DQExpr =
  | { op: "get"; pointer: string }
  | { op: "param"; name: string }
  | { op: "literal"; value: DQJson }
  | {
      op: "add" | "subtract" | "multiply" | "divide";
      left: DQExpr;
      right: DQExpr;
    }
  | { op: "lower" | "upper" | "length" | "number" | "string"; value: DQExpr }
  | { op: "coalesce"; values: DQExpr[] };
export type DQCondition =
  | {
      op:
        | "eq"
        | "ne"
        | "lt"
        | "lte"
        | "gt"
        | "gte"
        | "contains"
        | "startsWith"
        | "in";
      left: DQExpr;
      right: DQExpr;
    }
  | { op: "isMissing" | "isNull"; value: DQExpr }
  | { op: "all" | "any"; conditions: DQCondition[] }
  | { op: "not"; condition: DQCondition };
export type DQColumn = { name: string; value: DQExpr };
export type DQMeasure = {
  name: string;
  op: "count" | "sum" | "avg" | "min" | "max" | "countDistinct";
  value: DQExpr | null;
};
export type DQStep =
  | {
      op: "join";
      source: DQRef;
      as: string;
      mode: "inner" | "left" | "semi" | "anti";
      nulls: "never" | "equal";
      keys: { left: string; right: string }[];
    }
  | { op: "filter"; condition: DQCondition }
  | { op: "derive" | "select"; columns: DQColumn[] }
  | { op: "group"; by: DQColumn[]; measures: DQMeasure[] }
  | {
      op: "sort";
      keys: {
        value: DQExpr;
        direction: "asc" | "desc";
        nulls: "first" | "last";
      }[];
    }
  | { op: "distinct"; keys: DQExpr[] }
  | { op: "slice"; offset: number; limit: number }
  | { op: "unnest"; pointer: string; as: string; mode: "inner" | "left" };
export type DQDataset = { id: string; name: string; rows: DQRecord[] };
export type DQQuery = {
  id: string;
  name: string;
  from: DQRef;
  as: string;
  steps: DQStep[];
};
export type DQExpectation = {
  rows: number;
  maxWork: number;
  error:
    | "expression"
    | "join-key"
    | "aggregate"
    | "sort-key"
    | "limit"
    | "query"
    | null;
  exact: DQRecord[] | null;
  checks: { row: number; pointer: string; value?: DQJson; missing?: true }[];
};
export type DQScenario = {
  id: string;
  name: string;
  queryId: string;
  parameters: Record<string, DQJson>;
  overrides: { id: string; rows: DQRecord[] }[];
  expect: DQExpectation | null;
};
export type DQProject = {
  kind: "rsswag-data-query-project";
  version: 1;
  name: string;
  parameters: { name: string; value: DQJson }[];
  datasets: DQDataset[];
  queries: DQQuery[];
  scenarios: DQScenario[];
};
export class DataQueryError extends Error {
  constructor(
    public code:
      | "json"
      | "project"
      | "query"
      | "reference"
      | "limit"
      | "expression"
      | "join-key"
      | "aggregate"
      | "sort-key"
      | "import"
      | "cancelled"
      | "comparison-key",
    public queryId: string | null = null,
    public stage: number | null = null,
  ) {
    super(code);
    this.name = "DataQueryError";
  }
}
export const dqObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const dqInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const dqText = (v: unknown, max = 120): v is string =>
  typeof v === "string" && !!v.trim() && getByteSize(v) <= max;
export const dqId = (v: unknown): v is string =>
  dqText(v, 64) && /^[A-Za-z0-9_-]+$/.test(v);
export const dqField = (v: unknown): v is string =>
  dqId(v) &&
  /^[A-Za-z_]/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
export const dqPointer = (v: unknown): v is string =>
  typeof v === "string" &&
  getByteSize(v) <= 256 &&
  (v === "" || v.startsWith("/")) &&
  !/~(?![01])/.test(v);
export function dqList(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new DataQueryError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new DataQueryError("project");
  return v;
}
export function dqJson(v: unknown, max = 4096): DQJson {
  let nodes = 0;
  function visit(x: unknown, depth: number): DQJson {
    if (++nodes > 2048 || depth > 24) throw new DataQueryError("limit");
    if (x === null || typeof x === "boolean" || typeof x === "string") return x;
    if (typeof x === "number" && Number.isFinite(x))
      return Object.is(x, -0) ? 0 : x;
    if (Array.isArray(x))
      return dqList(x, 2048).map((n) => visit(n, depth + 1));
    if (
      dqObject(x) &&
      (Object.getPrototypeOf(x) === null ||
        Object.getPrototypeOf(Object.getPrototypeOf(x)) === null)
    )
      return Object.fromEntries(
        Object.keys(x)
          .sort()
          .map((k) => [k, visit(x[k], depth + 1)]),
      );
    throw new DataQueryError("project");
  }
  const value = visit(v, 0);
  if (getByteSize(JSON.stringify(value)) > max)
    throw new DataQueryError("limit");
  return value;
}
export function normalizeDqRows(
  v: unknown,
  maxRows = 2000,
  maxBytes = MAX_DQ_IMPORT,
  maxRowBytes = 16384,
): DQRecord[] {
  let bytes = 2;
  return dqList(v, maxRows).map((row) => {
    if (!dqObject(row)) throw new DataQueryError("import");
    const value = dqJson(row, maxRowBytes) as DQRecord;
    bytes += getByteSize(JSON.stringify(value)) + 1;
    if (bytes > maxBytes) throw new DataQueryError("limit");
    return value;
  });
}
export function parseDqJson(text: string, max = MAX_DQ_PROJECT): unknown {
  if (getByteSize(text) > max) throw new DataQueryError("limit");
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new DataQueryError("json");
  }
}
function dqUnique<T extends { name: string }>(values: T[]): T[] {
  if (new Set(values.map((v) => v.name)).size !== values.length)
    throw new DataQueryError("query");
  return values;
}
function normalizeDqRef(v: unknown): DQRef {
  if (
    !dqObject(v) ||
    !["dataset", "query"].includes(v.kind as string) ||
    !dqId(v.id)
  )
    throw new DataQueryError("reference");
  return { kind: v.kind as DQRef["kind"], id: v.id };
}
export function normalizeDqExpr(
  v: unknown,
  depth = 0,
  budget = { nodes: 0 },
): DQExpr {
  if (depth > 8 || ++budget.nodes > 128) throw new DataQueryError("limit");
  if (!dqObject(v)) throw new DataQueryError("query");
  const next = (x: unknown) => normalizeDqExpr(x, depth + 1, budget);
  if (v.op === "get" && dqPointer(v.pointer))
    return { op: v.op, pointer: v.pointer };
  if (v.op === "param" && dqField(v.name)) return { op: v.op, name: v.name };
  if (v.op === "literal") return { op: v.op, value: dqJson(v.value) };
  if (["add", "subtract", "multiply", "divide"].includes(v.op as string))
    return {
      op: v.op as "add" | "subtract" | "multiply" | "divide",
      left: next(v.left),
      right: next(v.right),
    };
  if (["lower", "upper", "length", "number", "string"].includes(v.op as string))
    return {
      op: v.op as "lower" | "upper" | "length" | "number" | "string",
      value: next(v.value),
    };
  if (v.op === "coalesce") {
    const values = dqList(v.values, 8).map(next);
    if (!values.length) throw new DataQueryError("query");
    return { op: v.op, values };
  }
  throw new DataQueryError("query");
}
function normalizeDqCondition(
  v: unknown,
  depth = 0,
  budget = { nodes: 0 },
): DQCondition {
  if (depth > 8 || ++budget.nodes > 128) throw new DataQueryError("limit");
  if (!dqObject(v)) throw new DataQueryError("query");
  if (
    [
      "eq",
      "ne",
      "lt",
      "lte",
      "gt",
      "gte",
      "contains",
      "startsWith",
      "in",
    ].includes(v.op as string)
  )
    return {
      op: v.op as "eq",
      left: normalizeDqExpr(v.left, depth + 1, budget),
      right: normalizeDqExpr(v.right, depth + 1, budget),
    };
  if (v.op === "isMissing" || v.op === "isNull")
    return { op: v.op, value: normalizeDqExpr(v.value, depth + 1, budget) };
  if (v.op === "all" || v.op === "any")
    return {
      op: v.op,
      conditions: dqList(v.conditions, 12).map((c) =>
        normalizeDqCondition(c, depth + 1, budget),
      ),
    };
  if (v.op === "not")
    return {
      op: v.op,
      condition: normalizeDqCondition(v.condition, depth + 1, budget),
    };
  throw new DataQueryError("query");
}
function normalizeDqColumns(v: unknown, max: number): DQColumn[] {
  return dqUnique(
    dqList(v, max).map((c) => {
      if (!dqObject(c) || !dqField(c.name)) throw new DataQueryError("query");
      return { name: c.name, value: normalizeDqExpr(c.value) };
    }),
  );
}
export function normalizeDqStep(v: unknown): DQStep {
  if (!dqObject(v)) throw new DataQueryError("query");
  if (
    v.op === "join" &&
    dqField(v.as) &&
    ["inner", "left", "semi", "anti"].includes(v.mode as string) &&
    ["never", "equal"].includes(v.nulls as string)
  ) {
    const keys = dqList(v.keys, 4).map((k) => {
      if (!dqObject(k) || !dqPointer(k.left) || !dqPointer(k.right))
        throw new DataQueryError("query");
      return { left: k.left, right: k.right };
    });
    if (!keys.length) throw new DataQueryError("query");
    return {
      op: v.op,
      source: normalizeDqRef(v.source),
      as: v.as,
      mode: v.mode as "inner" | "left" | "semi" | "anti",
      nulls: v.nulls as "never" | "equal",
      keys,
    };
  }
  if (v.op === "filter")
    return { op: v.op, condition: normalizeDqCondition(v.condition) };
  if (v.op === "select" || v.op === "derive") {
    const columns = normalizeDqColumns(v.columns, 32);
    if (!columns.length) throw new DataQueryError("query");
    return { op: v.op, columns };
  }
  if (v.op === "group") {
    const by = normalizeDqColumns(v.by, 8),
      measures: DQMeasure[] = dqList(v.measures, 16).map((m) => {
        if (
          !dqObject(m) ||
          !dqField(m.name) ||
          !["count", "sum", "avg", "min", "max", "countDistinct"].includes(
            m.op as string,
          )
        )
          throw new DataQueryError("query");
        return {
          name: m.name,
          op: m.op as DQMeasure["op"],
          value:
            m.op === "count" && m.value === null
              ? null
              : normalizeDqExpr(m.value),
        };
      });
    if (!measures.length) throw new DataQueryError("query");
    dqUnique([...by, ...measures]);
    return { op: v.op, by, measures };
  }
  if (v.op === "sort") {
    const keys = dqList(v.keys, 8).map((k) => {
      if (
        !dqObject(k) ||
        !["asc", "desc"].includes(k.direction as string) ||
        !["first", "last"].includes(k.nulls as string)
      )
        throw new DataQueryError("query");
      return {
        value: normalizeDqExpr(k.value),
        direction: k.direction as "asc" | "desc",
        nulls: k.nulls as "first" | "last",
      };
    });
    if (!keys.length) throw new DataQueryError("query");
    return { op: v.op, keys };
  }
  if (v.op === "distinct")
    return {
      op: v.op,
      keys: dqList(v.keys, 16).map((x) => normalizeDqExpr(x)),
    };
  if (
    v.op === "slice" &&
    dqInt(v.offset, 0, MAX_DQ_ROWS) &&
    dqInt(v.limit, 0, MAX_DQ_ROWS)
  )
    return { op: v.op, offset: v.offset, limit: v.limit };
  if (
    v.op === "unnest" &&
    dqPointer(v.pointer) &&
    dqField(v.as) &&
    ["inner", "left"].includes(v.mode as string)
  )
    return {
      op: v.op,
      pointer: v.pointer,
      as: v.as,
      mode: v.mode as "inner" | "left",
    };
  throw new DataQueryError("query");
}
export function normalizeDqBindings(
  v: unknown,
  parameters: DQProject["parameters"],
): Record<string, DQJson> {
  if (
    !dqObject(v) ||
    Object.keys(v).some((k) => !parameters.some((p) => p.name === k))
  )
    throw new DataQueryError("reference");
  return Object.fromEntries(
    Object.entries(v).map(([k, value]) => [k, dqJson(value)]),
  );
}
export function normalizeDqOverrides(
  v: unknown,
  datasets: DQDataset[],
): DQScenario["overrides"] {
  const values = dqList(v, 8).map((d) => {
    if (
      !dqObject(d) ||
      typeof d.id !== "string" ||
      !datasets.some((s) => s.id === d.id)
    )
      throw new DataQueryError("reference");
    return { id: d.id, rows: normalizeDqRows(d.rows) };
  });
  if (new Set(values.map((d) => d.id)).size !== values.length)
    throw new DataQueryError("reference");
  return values;
}
function normalizeDqExpectation(v: unknown): DQExpectation | null {
  if (v === null) return null;
  if (
    !dqObject(v) ||
    !dqInt(v.rows, 0, MAX_DQ_ROWS) ||
    !dqInt(v.maxWork, 0, MAX_DQ_WORK) ||
    (v.error !== null &&
      ![
        "expression",
        "join-key",
        "aggregate",
        "sort-key",
        "limit",
        "query",
      ].includes(v.error as string))
  )
    throw new DataQueryError("project");
  const checks = dqList(v.checks, 64).map((c) => {
    if (
      !dqObject(c) ||
      !dqInt(c.row, 0, MAX_DQ_ROWS - 1) ||
      !dqPointer(c.pointer)
    )
      throw new DataQueryError("project");
    return c.missing === true
      ? { row: c.row, pointer: c.pointer, missing: true as const }
      : { row: c.row, pointer: c.pointer, value: dqJson(c.value, 65536) };
  });
  return {
    rows: v.rows,
    maxWork: v.maxWork,
    error: v.error as DQExpectation["error"],
    checks,
    exact:
      v.exact === null
        ? null
        : normalizeDqRows(v.exact, MAX_DQ_ROWS, MAX_DQ_RESULT, 65536),
  };
}
export function normalizeDqProject(v: unknown): DQProject {
  if (
    !dqObject(v) ||
    v.kind !== "rsswag-data-query-project" ||
    v.version !== 1 ||
    !dqText(v.name)
  )
    throw new DataQueryError("project");
  const parameters = dqUnique(
    dqList(v.parameters, 8).map((p) => {
      if (!dqObject(p) || !dqField(p.name)) throw new DataQueryError("project");
      return { name: p.name, value: dqJson(p.value) };
    }),
  );
  const datasets = dqList(v.datasets, 8).map((d) => {
    if (!dqObject(d) || !dqId(d.id) || !dqText(d.name))
      throw new DataQueryError("project");
    return { id: d.id, name: d.name, rows: normalizeDqRows(d.rows) };
  });
  const queries: DQQuery[] = dqList(v.queries, 12).map((q) => {
    if (!dqObject(q) || !dqId(q.id) || !dqText(q.name) || !dqField(q.as))
      throw new DataQueryError("query");
    const steps = dqList(q.steps, 12).map(normalizeDqStep);
    const aliases = [
      q.as,
      ...steps.filter((s) => s.op === "join").map((s) => s.as),
    ];
    if (new Set(aliases).size !== aliases.length)
      throw new DataQueryError("query");
    return {
      id: q.id,
      name: q.name,
      from: normalizeDqRef(q.from),
      as: q.as,
      steps,
    };
  });
  if (
    new Set(datasets.map((d) => d.id)).size !== datasets.length ||
    new Set(queries.map((q) => q.id)).size !== queries.length
  )
    throw new DataQueryError("project");
  const seen = new Set<string>();
  function visit(id: string, path = new Set<string>()) {
    if (path.has(id)) throw new DataQueryError("reference");
    if (seen.has(id)) return;
    const q = queries.find((q) => q.id === id);
    if (!q) throw new DataQueryError("reference");
    for (const r of [
      q.from,
      ...q.steps.flatMap((s) => (s.op === "join" ? [s.source] : [])),
    ]) {
      if (r.kind === "query") visit(r.id, new Set([...path, id]));
      else if (!datasets.some((d) => d.id === r.id))
        throw new DataQueryError("reference");
    }
    function parametersIn(x: unknown) {
      if (Array.isArray(x)) {
        x.forEach(parametersIn);
        return;
      }
      if (!dqObject(x)) return;
      if (x.op === "literal") return;
      if (x.op === "param" && !parameters.some((p) => p.name === x.name))
        throw new DataQueryError("reference");
      Object.values(x).forEach(parametersIn);
    }
    parametersIn(q.steps);
    seen.add(id);
  }
  queries.forEach((q) => visit(q.id));
  const scenarios = dqList(v.scenarios, 12).map((s) => {
    if (
      !dqObject(s) ||
      !dqId(s.id) ||
      !dqText(s.name) ||
      typeof s.queryId !== "string" ||
      !queries.some((q) => q.id === s.queryId)
    )
      throw new DataQueryError("reference");
    return {
      id: s.id,
      name: s.name,
      queryId: s.queryId,
      parameters: normalizeDqBindings(s.parameters, parameters),
      overrides: normalizeDqOverrides(s.overrides, datasets),
      expect: normalizeDqExpectation(s.expect),
    };
  });
  if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length)
    throw new DataQueryError("project");
  const result: DQProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    parameters,
    datasets,
    queries,
    scenarios,
  };
  if (getByteSize(JSON.stringify(result)) > MAX_DQ_PROJECT)
    throw new DataQueryError("limit");
  return result;
}
export const parseDqProject = (text: string) =>
  normalizeDqProject(parseDqJson(text));
export function serializeDqProject(value: DQProject) {
  const p = normalizeDqProject(value),
    pretty = JSON.stringify(p, null, 2);
  return getByteSize(pretty) <= MAX_DQ_PROJECT ? pretty : JSON.stringify(p);
}
export function emptyDqProject(): DQProject {
  return {
    kind: "rsswag-data-query-project",
    version: 1,
    name: "API data project",
    parameters: [],
    datasets: [{ id: "records", name: "Records", rows: [] }],
    queries: [
      {
        id: "query-1",
        name: "Records query",
        from: { kind: "dataset", id: "records" },
        as: "row",
        steps: [],
      },
    ],
    scenarios: [],
  };
}
export function dqDependencies(p: DQProject, queryId: string) {
  const queries = new Set<string>(),
    datasets = new Set<string>();
  function visit(id: string) {
    if (queries.has(id)) return;
    const q = p.queries.find((q) => q.id === id);
    if (!q) throw new DataQueryError("reference");
    queries.add(id);
    for (const ref of [
      q.from,
      ...q.steps.flatMap((s) => (s.op === "join" ? [s.source] : [])),
    ]) {
      if (ref.kind === "query") visit(ref.id);
      else datasets.add(ref.id);
    }
  }
  visit(queryId);
  return { queries: [...queries], datasets: [...datasets] };
}
