import { getByteSize } from "./text-encoding";
import {
  DataQueryError,
  MAX_DQ_ROWS,
  MAX_DQ_RESULT,
  MAX_DQ_WORK,
  normalizeDqProject,
  normalizeDqBindings,
  normalizeDqOverrides,
  normalizeDqRows,
  dqPointer,
  type DQJson,
  type DQRecord,
  type DQProject,
  type DQExpr,
  type DQCondition,
  type DQRef,
  type DQColumn,
  type DQExpectation,
  type DQScenario,
} from "./data-query-model";

type DQCell = { found: boolean; value?: DQJson };
export type DQOrigin = { datasetId: string; row: number };
export type DQLineage = { sources: DQOrigin[]; truncated: boolean };
type DQInternalRow = { data: DQRecord; lineage: DQLineage };
export type DQPlan = {
  queryId: string;
  step: number;
  op: string;
  input: number;
  output: number;
  work: number;
  lookups?: number;
  matches?: number;
};
export type DQResult = {
  queryId: string;
  rows: DQRecord[];
  lineage: DQLineage[];
  plan: DQPlan[];
  work: number;
};
export type DQOptions = {
  cancelled?: () => boolean;
  progress?: (point: DQPlan) => void;
};
export function dqResolve(value: DQJson, pointer: string): DQCell {
  if (!pointer) return { found: true, value };
  for (const encoded of pointer.slice(1).split("/")) {
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))
    )
      return { found: false };
    value = (value as DQRecord)[key];
  }
  return { found: true, value };
}
export function dqCanonical(value: DQJson, tick = () => {}) {
  return JSON.stringify(value, (_key, item) => {
    tick();
    return item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item;
  });
}
function dqMergeLineage(values: DQLineage[]): DQLineage {
  const sources = new Map<string, DQOrigin>();
  let truncated = false;
  for (const value of values) {
    truncated ||= value.truncated;
    for (const source of value.sources) {
      const key = `${source.datasetId}:${source.row}`;
      if (sources.has(key)) continue;
      if (sources.size < 32) sources.set(key, source);
      else truncated = true;
    }
  }
  return { sources: [...sources.values()], truncated };
}
function dqScalar(cell: DQCell, code: "join-key" | "aggregate") {
  if (!cell.found) return ["missing"];
  const value = cell.value!;
  if (value !== null && typeof value === "object")
    throw new DataQueryError(code);
  return value === null ? ["null"] : [typeof value, value];
}
export function summarizeDqResult(result: DQResult) {
  return {
    queryId: result.queryId,
    rows: result.rows.length,
    work: result.work,
    steps: result.plan.length,
    queries: [...new Set(result.plan.map((p) => p.queryId))],
    truncatedLineages: result.lineage.filter((l) => l.truncated).length,
  };
}

export async function runDataQuery(
  value: DQProject,
  queryId: string,
  bindings: Record<string, DQJson> = {},
  replacements: DQScenario["overrides"] = [],
  options: DQOptions = {},
): Promise<DQResult> {
  const original = normalizeDqProject(value),
    overrides = normalizeDqOverrides(replacements, original.datasets),
    p = normalizeDqProject({
      ...original,
      datasets: original.datasets.map((d) => ({
        ...d,
        rows: overrides.find((o) => o.id === d.id)?.rows ?? d.rows,
      })),
    }),
    params = Object.fromEntries([
      ...p.parameters.map((p) => [p.name, p.value]),
      ...Object.entries(normalizeDqBindings(bindings, p.parameters)),
    ]),
    cache = new Map<string, DQInternalRow[]>(),
    plan: DQPlan[] = [];
  let work = 0,
    turns = 0;
  const cancelled = options.cancelled ?? (() => false);
  function spend(n = 1) {
    if (cancelled()) throw new DataQueryError("cancelled");
    work += n;
    if (work > MAX_DQ_WORK) throw new DataQueryError("limit");
  }
  async function cooperate(force = false) {
    if (cancelled()) throw new DataQueryError("cancelled");
    if (force || ++turns % 128 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled()) throw new DataQueryError("cancelled");
    }
  }
  function canonical(v: DQJson) {
    return dqCanonical(v, () => spend());
  }
  function numeric(v: number, code: "expression" | "aggregate") {
    if (
      !Number.isFinite(v) ||
      (Number.isInteger(v) && !Number.isSafeInteger(v))
    )
      throw new DataQueryError(code);
    return v;
  }
  function expression(e: DQExpr, data: DQRecord): DQCell {
    spend();
    if (e.op === "get") return dqResolve(data, e.pointer);
    if (e.op === "literal") return { found: true, value: e.value };
    if (e.op === "param") return { found: true, value: params[e.name] };
    if (e.op === "coalesce") {
      for (const v of e.values) {
        const result = expression(v, data);
        if (result.found && result.value !== null) return result;
      }
      return { found: true, value: null };
    }
    if ("left" in e) {
      const left = expression(e.left, data),
        right = expression(e.right, data);
      if (!left.found || !right.found) return { found: false };
      if (left.value === null || right.value === null)
        return { found: true, value: null };
      if (
        typeof left.value !== "number" ||
        typeof right.value !== "number" ||
        (e.op === "divide" && right.value === 0)
      )
        throw new DataQueryError("expression");
      const value =
        e.op === "add"
          ? left.value + right.value
          : e.op === "subtract"
            ? left.value - right.value
            : e.op === "multiply"
              ? left.value * right.value
              : left.value / right.value;
      return { found: true, value: numeric(value, "expression") };
    }
    const cell = expression(e.value, data);
    if (!cell.found || cell.value === null) return cell;
    const item = cell.value!;
    if (e.op === "string" && typeof item !== "object")
      return { found: true, value: String(item) };
    if (
      e.op === "number" &&
      (typeof item === "number" ||
        (typeof item === "string" &&
          /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(item.trim())))
    )
      return { found: true, value: numeric(Number(item), "expression") };
    if (e.op === "length" && (typeof item === "string" || Array.isArray(item)))
      return {
        found: true,
        value: typeof item === "string" ? Array.from(item).length : item.length,
      };
    if ((e.op === "lower" || e.op === "upper") && typeof item === "string")
      return {
        found: true,
        value: e.op === "lower" ? item.toLowerCase() : item.toUpperCase(),
      };
    throw new DataQueryError("expression");
  }
  function condition(c: DQCondition, data: DQRecord): boolean {
    spend();
    if (c.op === "all" || c.op === "any")
      return c.op === "all"
        ? c.conditions.every((c) => condition(c, data))
        : c.conditions.some((c) => condition(c, data));
    if (c.op === "not") return !condition(c.condition, data);
    if (c.op === "isMissing" || c.op === "isNull") {
      const r = expression(c.value, data);
      return c.op === "isMissing" ? !r.found : r.found && r.value === null;
    }
    if (!("left" in c)) throw new DataQueryError("query");
    const left = expression(c.left, data),
      right = expression(c.right, data);
    if (!left.found || !right.found) return false;
    const a = left.value!,
      b = right.value!;
    if (c.op === "eq" || c.op === "ne") {
      const same = canonical(a) === canonical(b);
      return c.op === "eq" ? same : !same;
    }
    if (c.op === "in") {
      if (!Array.isArray(b)) throw new DataQueryError("expression");
      const key = canonical(a);
      return b.some((v) => canonical(v) === key);
    }
    if (c.op === "contains" || c.op === "startsWith") {
      if (typeof a !== "string" || typeof b !== "string") return false;
      return c.op === "contains" ? a.includes(b) : a.startsWith(b);
    }
    if (
      (typeof a !== "string" && typeof a !== "number") ||
      typeof a !== typeof b
    )
      return false;
    return c.op === "lt"
      ? a < b
      : c.op === "lte"
        ? a <= b
        : c.op === "gt"
          ? a > b
          : a >= b;
  }
  function columns(values: DQColumn[], data: DQRecord): DQRecord {
    return Object.fromEntries(
      values.flatMap((c) => {
        const cell = expression(c.value, data);
        return cell.found ? [[c.name, cell.value!]] : [];
      }),
    );
  }
  function output() {
    const rows: DQInternalRow[] = [];
    let bytes = 2;
    return {
      rows,
      emit(data: DQRecord, lineage: DQLineage) {
        spend();
        const size = getByteSize(JSON.stringify(data));
        bytes += size + 1;
        if (rows.length >= MAX_DQ_ROWS || size > 65536 || bytes > MAX_DQ_RESULT)
          throw new DataQueryError("limit");
        rows.push({ data, lineage });
      },
    };
  }
  async function source(ref: DQRef): Promise<DQInternalRow[]> {
    if (ref.kind === "query") return execute(ref.id);
    const d = p.datasets.find((d) => d.id === ref.id);
    if (!d) throw new DataQueryError("reference");
    return d.rows.map((data, row) => ({
      data,
      lineage: { sources: [{ datasetId: d.id, row }], truncated: false },
    }));
  }
  async function execute(id: string): Promise<DQInternalRow[]> {
    if (cache.has(id)) return cache.get(id)!;
    const query = p.queries.find((q) => q.id === id);
    if (!query) throw new DataQueryError("reference");
    let stage = 0;
    try {
      const initial = await source(query.from),
        base = output();
      let beforeWork = work;
      for (const row of initial) {
        base.emit(Object.fromEntries([[query.as, row.data]]), row.lineage);
        await cooperate();
      }
      let rows = base.rows;
      const publish = (point: DQPlan) => {
        plan.push(point);
        options.progress?.({ ...point });
      };
      publish({
        queryId: id,
        step: 0,
        op: "source",
        input: initial.length,
        output: rows.length,
        work: work - beforeWork,
      });
      for (const step of query.steps) {
        stage++;
        const result = output(),
          count = rows.length;
        beforeWork = work;
        let lookups: number | undefined, matches: number | undefined;
        if (step.op === "join") {
          const right = await source(step.source),
            index = new Map<string, DQInternalRow[]>();
          beforeWork = work;
          lookups = 0;
          matches = 0;
          const joinKeys = step.keys,
            joinNulls = step.nulls;
          function keyFor(data: DQRecord, side: "left" | "right") {
            const keys: unknown[] = [];
            for (const key of joinKeys) {
              spend();
              const cell = dqResolve(data, key[side]);
              if (!cell.found || (cell.value === null && joinNulls === "never"))
                return null;
              keys.push(dqScalar(cell, "join-key"));
            }
            return JSON.stringify(keys);
          }
          for (const row of right) {
            const key = keyFor(row.data, "right");
            if (key !== null) {
              const bucket = index.get(key) ?? [];
              bucket.push(row);
              index.set(key, bucket);
            }
            await cooperate();
          }
          for (const row of rows) {
            const key = keyFor(row.data, "left"),
              found = key === null ? [] : (index.get(key) ?? []);
            lookups++;
            matches += found.length;
            if (
              (step.mode === "inner" || step.mode === "left") &&
              Object.hasOwn(row.data, step.as)
            )
              throw new DataQueryError("query");
            if (step.mode === "semi" || step.mode === "anti") {
              if ((step.mode === "semi") === found.length > 0) {
                const lineage =
                  step.mode === "semi"
                    ? dqMergeLineage([
                        row.lineage,
                        ...found.slice(0, 32).map((r) => r.lineage),
                      ])
                    : row.lineage;
                result.emit(
                  row.data,
                  found.length > 32 ? { ...lineage, truncated: true } : lineage,
                );
              }
            } else if (found.length) {
              for (const other of found) {
                result.emit(
                  { ...row.data, [step.as]: other.data },
                  dqMergeLineage([row.lineage, other.lineage]),
                );
                await cooperate();
              }
            } else if (step.mode === "left")
              result.emit({ ...row.data, [step.as]: null }, row.lineage);
            await cooperate();
          }
        } else if (step.op === "group") {
          type Acc = {
            count: number;
            sum: number;
            min: string | number | null;
            max: string | number | null;
            unique: Set<string>;
          };
          type Bucket = {
            data: DQRecord;
            accumulators: Acc[];
            lineage: DQLineage;
          };
          const groups = new Map<string, Bucket>();
          const bucket = (data: DQRecord): Bucket => ({
            data,
            accumulators: step.measures.map(() => ({
              count: 0,
              sum: 0,
              min: null,
              max: null,
              unique: new Set(),
            })),
            lineage: { sources: [], truncated: false },
          });
          if (!step.by.length) groups.set("[]", bucket({}));
          for (const row of rows) {
            const cells = step.by.map((c) => expression(c.value, row.data)),
              key = JSON.stringify(cells.map((c) => dqScalar(c, "aggregate")));
            let group = groups.get(key);
            if (!group) {
              if (groups.size >= MAX_DQ_ROWS) throw new DataQueryError("limit");
              group = bucket(
                Object.fromEntries(
                  step.by.flatMap((c, i) =>
                    cells[i].found ? [[c.name, cells[i].value!]] : [],
                  ),
                ),
              );
              groups.set(key, group);
            }
            group.lineage = dqMergeLineage([group.lineage, row.lineage]);
            step.measures.forEach((m, i) => {
              spend();
              const acc = group!.accumulators[i],
                cell =
                  m.value === null
                    ? { found: true, value: true }
                    : expression(m.value, row.data);
              if (!cell.found || cell.value === null) return;
              const item = cell.value!;
              acc.count++;
              if (m.op === "count") return;
              if (m.op === "countDistinct") {
                acc.unique.add(JSON.stringify(dqScalar(cell, "aggregate")));
                return;
              }
              if (m.op === "sum" || m.op === "avg") {
                if (typeof item !== "number")
                  throw new DataQueryError("aggregate");
                acc.sum = numeric(acc.sum + item, "aggregate");
                return;
              }
              if (
                (typeof item !== "number" && typeof item !== "string") ||
                (acc.min !== null && typeof item !== typeof acc.min)
              )
                throw new DataQueryError("aggregate");
              if (acc.min === null || item < acc.min) acc.min = item;
              if (acc.max === null || item > acc.max) acc.max = item;
            });
            await cooperate();
          }
          for (const group of groups.values()) {
            const data = { ...group.data };
            step.measures.forEach((m, i) => {
              const a = group.accumulators[i];
              data[m.name] =
                m.op === "count"
                  ? a.count
                  : m.op === "countDistinct"
                    ? a.unique.size
                    : m.op === "sum"
                      ? a.sum
                      : m.op === "avg"
                        ? a.count
                          ? numeric(a.sum / a.count, "aggregate")
                          : null
                        : m.op === "min"
                          ? a.min
                          : a.max;
            });
            result.emit(data, group.lineage);
            await cooperate();
          }
        } else if (step.op === "sort") {
          const keyed: { row: DQInternalRow; keys: DQCell[]; index: number }[] =
            [];
          for (const [index, row] of rows.entries()) {
            const keys = step.keys.map((k) => expression(k.value, row.data));
            if (
              keys.some(
                (k) =>
                  k.found && k.value !== null && typeof k.value === "object",
              )
            )
              throw new DataQueryError("sort-key");
            keyed.push({ row, keys, index });
            await cooperate();
          }
          const compare = (
            a: (typeof keyed)[number],
            b: (typeof keyed)[number],
          ) => {
            spend();
            for (let i = 0; i < step.keys.length; i++) {
              const av = a.keys[i],
                bv = b.keys[i],
                an = !av.found || av.value === null,
                bn = !bv.found || bv.value === null,
                policy = step.keys[i];
              if (an || bn) {
                if (an !== bn)
                  return (an ? -1 : 1) * (policy.nulls === "first" ? 1 : -1);
                continue;
              }
              const rank = (v: DQJson) =>
                typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2;
              const cmp =
                rank(av.value!) - rank(bv.value!) ||
                (av.value! < bv.value! ? -1 : av.value! > bv.value! ? 1 : 0);
              if (cmp) return cmp * (policy.direction === "asc" ? 1 : -1);
            }
            return a.index - b.index;
          };
          // Use the same stable algorithm in every JS runtime so recorded work
          // budgets remain portable. Yield during merging for cancellation.
          let sorted = keyed;
          for (let width = 1; width < sorted.length; width *= 2) {
            const next: typeof keyed = [];
            for (let start = 0; start < sorted.length; start += width * 2) {
              const mid = Math.min(start + width, sorted.length),
                end = Math.min(start + width * 2, sorted.length);
              let left = start,
                right = mid;
              while (left < mid || right < end) {
                next.push(
                  right >= end ||
                    (left < mid && compare(sorted[left], sorted[right]) <= 0)
                    ? sorted[left++]
                    : sorted[right++],
                );
                await cooperate();
              }
            }
            sorted = next;
          }
          for (const { row } of sorted) result.emit(row.data, row.lineage);
        } else if (step.op === "distinct") {
          const seen = new Map<string, number>();
          for (const row of rows) {
            const key = step.keys.length
              ? canonical(
                  step.keys.map((e) => {
                    const c = expression(e, row.data);
                    return c.found ? ["value", c.value!] : ["missing"];
                  }),
                )
              : canonical(row.data);
            const previous = seen.get(key);
            if (previous === undefined) {
              seen.set(key, result.rows.length);
              result.emit(row.data, row.lineage);
            } else
              result.rows[previous] = {
                ...result.rows[previous],
                lineage: dqMergeLineage([
                  result.rows[previous].lineage,
                  row.lineage,
                ]),
              };
            await cooperate();
          }
        } else {
          const input =
            step.op === "slice"
              ? rows.slice(step.offset, step.offset + step.limit)
              : rows;
          for (const row of input) {
            spend();
            if (step.op === "filter") {
              if (condition(step.condition, row.data))
                result.emit(row.data, row.lineage);
            } else if (step.op === "select")
              result.emit(columns(step.columns, row.data), row.lineage);
            else if (step.op === "derive") {
              if (step.columns.some((c) => Object.hasOwn(row.data, c.name)))
                throw new DataQueryError("query");
              result.emit(
                { ...row.data, ...columns(step.columns, row.data) },
                row.lineage,
              );
            } else if (step.op === "unnest") {
              if (Object.hasOwn(row.data, step.as))
                throw new DataQueryError("query");
              const cell = dqResolve(row.data, step.pointer);
              if (
                cell.found &&
                cell.value !== null &&
                !Array.isArray(cell.value)
              )
                throw new DataQueryError("expression");
              const values = Array.isArray(cell.value) ? cell.value : [];
              if (!values.length && step.mode === "left")
                result.emit({ ...row.data, [step.as]: null }, row.lineage);
              else
                for (const item of values) {
                  result.emit({ ...row.data, [step.as]: item }, row.lineage);
                  await cooperate();
                }
            } else result.emit(row.data, row.lineage);
            await cooperate();
          }
        }
        rows = result.rows;
        publish({
          queryId: id,
          step: stage,
          op: step.op,
          input: count,
          output: rows.length,
          work: work - beforeWork,
          ...(lookups === undefined ? {} : { lookups, matches }),
        });
        await cooperate(true);
      }
      cache.set(id, rows);
      return rows;
    } catch (error) {
      if (error instanceof DataQueryError && error.queryId === null)
        throw new DataQueryError(error.code, id, stage);
      throw error;
    }
  }
  await cooperate(true);
  const result = await execute(queryId);
  if (cancelled()) throw new DataQueryError("cancelled");
  return {
    queryId,
    rows: normalizeDqRows(
      result.map((r) => r.data),
      MAX_DQ_ROWS,
      MAX_DQ_RESULT,
      65536,
    ),
    lineage: JSON.parse(JSON.stringify(result.map((r) => r.lineage))),
    plan,
    work,
  };
}

export type DQCheck = {
  kind: "error" | "rows" | "work" | "exact" | "value";
  index: number;
  passed: boolean;
};
export type DQRun = {
  scenarioId: string;
  scenarioName: string;
  checked: boolean;
  passed: boolean;
  summary: ReturnType<typeof summarizeDqResult> | null;
  checks: DQCheck[];
  error: { code: string; queryId: string | null; stage: number | null } | null;
  result: DQResult | null;
};
export function checkDqResult(
  result: DQResult,
  expect: DQExpectation | null,
): DQCheck[] {
  if (!expect) return [];
  const checks: DQCheck[] = [
    { kind: "error", index: 0, passed: expect.error === null },
    { kind: "rows", index: 0, passed: result.rows.length === expect.rows },
    { kind: "work", index: 0, passed: result.work <= expect.maxWork },
  ];
  if (expect.exact !== null)
    checks.push({
      kind: "exact",
      index: 0,
      passed: dqCanonical(result.rows) === dqCanonical(expect.exact),
    });
  expect.checks.forEach((c, index) => {
    const row = result.rows[c.row],
      cell = row ? dqResolve(row, c.pointer) : { found: false };
    checks.push({
      kind: "value",
      index,
      passed:
        !!row &&
        (c.missing
          ? !cell.found
          : cell.found && dqCanonical(cell.value!) === dqCanonical(c.value!)),
    });
  });
  return checks;
}
export async function runDqScenarios(
  value: DQProject,
  id?: string,
  options: DQOptions & {
    suiteProgress?: (done: number, total: number) => void;
  } = {},
): Promise<DQRun[]> {
  const p = normalizeDqProject(value),
    cases = id ? p.scenarios.filter((s) => s.id === id) : p.scenarios;
  if (id && !cases.length) throw new DataQueryError("reference");
  const runs: DQRun[] = [];
  for (const s of cases) {
    if (options.cancelled?.()) throw new DataQueryError("cancelled");
    try {
      const result = await runDataQuery(
          p,
          s.queryId,
          s.parameters,
          s.overrides,
          options,
        ),
        checks = checkDqResult(result, s.expect);
      runs.push({
        scenarioId: s.id,
        scenarioName: s.name,
        checked: s.expect !== null,
        passed: s.expect !== null && checks.every((c) => c.passed),
        summary: summarizeDqResult(result),
        result,
        checks,
        error: null,
      });
    } catch (e) {
      if (e instanceof DataQueryError && e.code === "cancelled") throw e;
      const code = e instanceof DataQueryError ? e.code : "query",
        passed =
          s.expect !== null &&
          s.expect.error !== null &&
          s.expect.error === code;
      runs.push({
        scenarioId: s.id,
        scenarioName: s.name,
        checked: s.expect !== null,
        passed,
        summary: null,
        result: null,
        checks: s.expect === null ? [] : [{ kind: "error", index: 0, passed }],
        error: {
          code,
          queryId: e instanceof DataQueryError ? e.queryId : null,
          stage: e instanceof DataQueryError ? e.stage : null,
        },
      });
    }
    options.suiteProgress?.(runs.length, cases.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (options.cancelled?.()) throw new DataQueryError("cancelled");
  return runs;
}
export function dqReport(runs: DQRun[]) {
  return JSON.stringify(
    {
      kind: "rsswag-data-query-report",
      version: 1,
      runs: runs.map((r) => ({
        scenarioId: r.scenarioId,
        checked: r.checked,
        passed: r.passed,
        summary: r.summary,
        checks: r.checks,
        error: r.error,
        plan: r.result?.plan ?? [],
      })),
    },
    null,
    2,
  );
}
export function recordDqExpectation(
  result: DQResult,
  exact = false,
): DQExpectation {
  return {
    rows: result.rows.length,
    maxWork: result.work,
    error: null,
    exact: exact ? JSON.parse(JSON.stringify(result.rows)) : null,
    checks: [],
  };
}
export type DQDifference = {
  key: string | number;
  kind: "added" | "removed" | "changed";
  before: DQRecord | null;
  after: DQRecord | null;
};
export function compareDqRows(
  baseline: DQRecord[],
  candidate: DQRecord[],
  pointer: string,
) {
  if (!dqPointer(pointer) || pointer === "")
    throw new DataQueryError("comparison-key");
  function index(rows: DQRecord[]) {
    const result = new Map<string, { key: string | number; data: DQRecord }>();
    for (const data of rows) {
      const cell = dqResolve(data, pointer),
        key = cell.value;
      if (!cell.found || (typeof key !== "string" && typeof key !== "number"))
        throw new DataQueryError("comparison-key");
      const id = JSON.stringify([typeof key, key]);
      if (result.has(id)) throw new DataQueryError("comparison-key");
      result.set(id, { key, data });
    }
    return result;
  }
  const before = index(
      normalizeDqRows(baseline, MAX_DQ_ROWS, MAX_DQ_RESULT, 65536),
    ),
    after = index(
      normalizeDqRows(candidate, MAX_DQ_ROWS, MAX_DQ_RESULT, 65536),
    ),
    differences: DQDifference[] = [];
  let unchanged = 0;
  for (const [id, row] of before) {
    const other = after.get(id);
    if (!other)
      differences.push({
        key: row.key,
        kind: "removed",
        before: row.data,
        after: null,
      });
    else if (dqCanonical(row.data) !== dqCanonical(other.data))
      differences.push({
        key: row.key,
        kind: "changed",
        before: row.data,
        after: other.data,
      });
    else unchanged++;
  }
  for (const [id, row] of after)
    if (!before.has(id))
      differences.push({
        key: row.key,
        kind: "added",
        before: null,
        after: row.data,
      });
  return {
    summary: {
      added: differences.filter((d) => d.kind === "added").length,
      removed: differences.filter((d) => d.kind === "removed").length,
      changed: differences.filter((d) => d.kind === "changed").length,
      unchanged,
    },
    differences: JSON.parse(JSON.stringify(differences)) as DQDifference[],
  };
}
