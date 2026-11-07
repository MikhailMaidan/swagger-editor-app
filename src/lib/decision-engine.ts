import {
  DecisionError,
  MAX_DT_WORK,
  MAX_DT_ANALYSIS,
  MAX_DT_CANDIDATES,
  dtJson,
  dtScalar,
  dtPointer,
  dtList,
  dtDependencies,
  normalizeDtProject,
  normalizeDtContext,
  normalizeDtExpectation,
  type DTJson,
  type DTScalar,
  type DTCell,
  type DTInput,
  type DTRef,
  type DTExpr,
  type DTCondition,
  type DTProject,
  type DTStatus,
  type DTExpectation,
} from "./decision-model";
export type DTResolved = { present: false } | { present: true; value: DTJson };
export type DTResult = {
  decisionId: string;
  status: DTStatus;
  output: DTJson;
  matched: string[];
  selected: string[];
  columns: { id: string; cell: DTCell }[];
  rows: { id: string; cells: boolean[]; matched: boolean }[];
  blockedBy: string[];
  error: string | null;
  work: number;
};
export type DTEvaluation = {
  rootId: string;
  result: DTResult;
  decisions: DTResult[];
  work: number;
};
export const dtEqual = (a: DTJson, b: DTJson) =>
  JSON.stringify(a) === JSON.stringify(b);
export function dtRead(value: DTJson, pointer: string): DTResolved {
  if (!dtPointer(pointer)) throw new DecisionError("reference");
  for (const part of pointer ? pointer.slice(1).split("/") : []) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key))
    )
      return { present: false };
    value = (value as Record<string, DTJson>)[key];
  }
  return { present: true, value };
}
export function matchDtCell(cell: DTCell, condition: DTCondition): boolean {
  if (condition.op === "any") return true;
  if (condition.op === "missing") return !cell.present;
  if (condition.op === "present") return cell.present;
  if (!cell.present) return false;
  if (condition.op === "eq" || condition.op === "ne")
    return condition.op === "eq"
      ? dtEqual(cell.value, condition.value)
      : !dtEqual(cell.value, condition.value);
  if (condition.op === "in" || condition.op === "notIn") {
    const included = condition.values.some((v) => dtEqual(cell.value, v));
    return condition.op === "in" ? included : !included;
  }
  if (condition.op === "prefix")
    return (
      typeof cell.value === "string" && cell.value.startsWith(condition.value)
    );
  if (condition.op !== "range" || typeof cell.value !== "number") return false;
  return (
    (condition.min === null ||
      (condition.minInclusive
        ? cell.value >= condition.min
        : cell.value > condition.min)) &&
    (condition.max === null ||
      (condition.maxInclusive
        ? cell.value <= condition.max
        : cell.value < condition.max))
  );
}
class DTLogicError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
class DTBlocked extends Error {
  constructor(public id: string) {
    super("dependency");
  }
}
function evaluateDtPrepared(
  project: DTProject,
  rootId: string,
  context: Record<string, DTScalar>,
  maxWork = MAX_DT_WORK,
): DTEvaluation {
  let work = 0;
  const cache = new Map<string, DTResult>(),
    decisions: DTResult[] = [];
  function run(id: string): DTResult {
    const cached = cache.get(id);
    if (cached) return cached;
    const decision = project.decisions.find((d) => d.id === id);
    if (!decision) throw new DecisionError("reference");
    const result: DTResult = {
      decisionId: id,
      status: "no-match",
      output: null,
      matched: [],
      selected: [],
      columns: [],
      rows: [],
      blockedBy: [],
      error: null,
      work: 0,
    };
    function charge() {
      if (++work > maxWork) throw new DecisionError("work");
      result.work++;
    }
    function ref(source: DTRef): DTResolved {
      charge();
      if (source.kind === "input")
        return Object.hasOwn(context, source.id)
          ? { present: true, value: context[source.id] }
          : { present: false };
      const dependency = run(source.id);
      if (dependency.status !== "matched" && dependency.status !== "default")
        throw new DTBlocked(source.id);
      return dtRead(dependency.output, source.pointer);
    }
    function expr(expression: DTExpr): DTResolved {
      charge();
      if (expression.op === "literal")
        return { present: true, value: expression.value };
      if (expression.op === "ref") return ref(expression.ref);
      if (expression.op === "coalesce") {
        for (const candidate of expression.values) {
          const value = expr(candidate);
          if (value.present && value.value !== null) return value;
        }
        return { present: true, value: null };
      }
      const left = expr(expression.left),
        right = expr(expression.right);
      if (!left.present || !right.present) return { present: false };
      if (left.value === null || right.value === null)
        return { present: true, value: null };
      if (typeof left.value !== "number" || typeof right.value !== "number")
        throw new DTLogicError("arithmetic-type");
      if (expression.op === "divide" && right.value === 0)
        throw new DTLogicError("division-zero");
      const value =
        expression.op === "add"
          ? left.value + right.value
          : expression.op === "subtract"
            ? left.value - right.value
            : expression.op === "multiply"
              ? left.value * right.value
              : left.value / right.value;
      if (
        !Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value))
      )
        throw new DTLogicError("arithmetic-range");
      return { present: true, value };
    }
    function output(expression: DTExpr): DTJson {
      const cell = expr(expression);
      if (!cell.present) throw new DTLogicError("missing-output");
      return cell.value;
    }
    try {
      charge();
      for (const column of decision.columns) {
        const cell = ref(column.source);
        if (cell.present && !dtScalar(cell.value))
          throw new DTLogicError("column-type");
        result.columns.push({ id: column.id, cell: cell as DTCell });
      }
      for (const rule of decision.rules) {
        charge();
        const cells = rule.when.map((condition, i) => {
            charge();
            return matchDtCell(result.columns[i].cell, condition);
          }),
          matched = cells.every(Boolean);
        result.rows.push({ id: rule.id, cells, matched });
        if (matched) result.matched.push(rule.id);
      }
      if (!result.matched.length) {
        if (decision.fallback !== null) {
          result.output = output(decision.fallback);
          result.status = "default";
        }
      } else if (decision.policy === "unique" && result.matched.length > 1)
        result.status = "conflict";
      else {
        result.selected =
          decision.policy === "first" || decision.policy === "unique"
            ? result.matched.slice(0, 1)
            : [...result.matched];
        const values = result.selected.map((ruleId) =>
          output(decision.rules.find((rule) => rule.id === ruleId)!.output),
        );
        if (decision.policy === "all") result.output = values;
        else if (decision.policy === "sum") {
          let total = 0;
          for (const value of values) {
            charge();
            if (typeof value !== "number") throw new DTLogicError("sum-type");
            total += value;
            if (
              !Number.isFinite(total) ||
              (Number.isInteger(total) && !Number.isSafeInteger(total))
            )
              throw new DTLogicError("sum-range");
          }
          result.output = total;
        } else result.output = values[0];
        result.status = "matched";
      }
      try {
        result.output = dtJson(result.output, 65536, 4096);
      } catch {
        throw new DTLogicError("output-limit");
      }
    } catch (error) {
      if (error instanceof DTBlocked) {
        result.status = "blocked";
        result.blockedBy = [error.id];
        result.error = "dependency";
        result.output = null;
      } else if (error instanceof DTLogicError) {
        result.status = "error";
        result.error = error.code;
        result.output = null;
      } else throw error;
    }
    cache.set(id, result);
    decisions.push(result);
    return result;
  }
  const result = run(rootId);
  return { rootId, result, decisions, work };
}
export function createDecisionEvaluator(source: DTProject) {
  const project = normalizeDtProject(source);
  return (rootId: string, rawContext: unknown): DTEvaluation =>
    evaluateDtPrepared(
      project,
      rootId,
      normalizeDtContext(project, rootId, rawContext),
    );
}
export function evaluateDecision(
  source: DTProject,
  rootId: string,
  rawContext: unknown,
): DTEvaluation {
  return createDecisionEvaluator(source)(rootId, rawContext);
}
export type DTOptions = {
  cancelled?: () => boolean;
  progress?: (counts: { checked: number; total: number; work: number }) => void;
};
async function dtYield(
  options: DTOptions,
  counts: { checked: number; total: number; work: number },
) {
  if (options.cancelled?.()) throw new DecisionError("cancelled");
  options.progress?.({ ...counts });
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (options.cancelled?.()) throw new DecisionError("cancelled");
}
function dtGrid(
  fields: DTInput[],
  domains: DTCell[][],
  baseline: Record<string, DTScalar> = {},
) {
  return {
    total: domains.reduce((n, values) => n * values.length, 1),
    at(index: number) {
      const context = { ...baseline };
      for (let i = domains.length - 1; i >= 0; i--) {
        const values = domains[i],
          cell = values[index % values.length];
        index = Math.floor(index / values.length);
        if (cell.present) context[fields[i].id] = cell.value;
        else delete context[fields[i].id];
      }
      return context;
    },
  };
}
export type DTCoverage = {
  decisionId: string;
  checked: number;
  total: number;
  complete: boolean;
  reason: "cases" | "work" | null;
  work: number;
  counts: Record<DTStatus, number>;
  overlaps: number;
  rules: { id: string; matches: number; selected: number }[];
  samples: {
    index: number;
    context: Record<string, DTScalar>;
    status: DTStatus;
    matched: string[];
  }[];
};
export async function analyzeDecisionCatalog(
  source: DTProject,
  rootId: string,
  options: DTOptions = {},
): Promise<DTCoverage> {
  const project = normalizeDtProject(source),
    deps = dtDependencies(project, rootId),
    fields = project.inputs.filter((i) => deps.inputs.includes(i.id)),
    grid = dtGrid(
      fields,
      fields.map((i) => i.catalog),
    ),
    decision = project.decisions.find((d) => d.id === rootId)!;
  const result: DTCoverage = {
    decisionId: rootId,
    checked: 0,
    total: grid.total,
    complete: false,
    reason: null,
    work: 0,
    counts: {
      matched: 0,
      default: 0,
      "no-match": 0,
      conflict: 0,
      blocked: 0,
      error: 0,
    },
    overlaps: 0,
    rules: decision.rules.map((rule) => ({
      id: rule.id,
      matches: 0,
      selected: 0,
    })),
    samples: [],
  };
  await dtYield(options, { checked: 0, total: grid.total, work: 0 });
  for (let index = 0; index < grid.total; index++) {
    if (result.checked >= MAX_DT_CANDIDATES) {
      result.reason = "cases";
      break;
    }
    const context = grid.at(index);
    let evaluation: DTEvaluation;
    try {
      evaluation = evaluateDtPrepared(
        project,
        rootId,
        context,
        Math.min(MAX_DT_WORK, MAX_DT_ANALYSIS - result.work),
      );
    } catch (e) {
      if (e instanceof DecisionError && e.code === "work") {
        result.reason = "work";
        break;
      }
      throw e;
    }
    const root = evaluation.result;
    result.work += evaluation.work;
    result.checked++;
    result.counts[root.status]++;
    if (root.matched.length > 1) result.overlaps++;
    for (const row of result.rules) {
      if (root.matched.includes(row.id)) row.matches++;
      if (root.selected.includes(row.id)) row.selected++;
    }
    if (
      root.status !== "matched" &&
      root.status !== "default" &&
      result.samples.length < 12
    )
      result.samples.push({
        index,
        context,
        status: root.status,
        matched: root.matched,
      });
    if (result.checked % 16 === 0)
      await dtYield(options, {
        checked: result.checked,
        total: grid.total,
        work: result.work,
      });
  }
  result.complete = result.checked === result.total;
  await dtYield(options, {
    checked: result.checked,
    total: result.total,
    work: result.work,
  });
  return result;
}
export type DTTarget = { status: DTStatus; output?: DTJson };
export type DTCounterfactual = {
  decisionId: string;
  enumerated: number;
  evaluated: number;
  total: number;
  complete: boolean;
  optimal: boolean;
  reason: "cases" | "work" | "zero" | null;
  work: number;
  best: {
    cost: number;
    context: Record<string, DTScalar>;
    changes: { id: string; before: DTCell; after: DTCell; cost: number }[];
    evaluation: DTEvaluation;
  } | null;
};
export async function findDecisionCounterfactual(
  source: DTProject,
  rootId: string,
  rawContext: unknown,
  rawTarget: DTTarget,
  mutableIds?: string[],
  options: DTOptions = {},
): Promise<DTCounterfactual> {
  const project = normalizeDtProject(source),
    baseline = normalizeDtContext(project, rootId, rawContext),
    target = normalizeDtExpectation(rawTarget);
  if (!target) throw new DecisionError("project");
  const ids =
    mutableIds === undefined
      ? dtDependencies(project, rootId).inputs
      : dtList(mutableIds, 8).map((id) => {
          if (typeof id !== "string") throw new DecisionError("reference");
          return id;
        });
  if (
    !Array.isArray(ids) ||
    ids.length > 8 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !project.inputs.some((i) => i.id === id))
  )
    throw new DecisionError("reference");
  const fields = project.inputs.filter((i) => ids.includes(i.id)),
    cell = (context: Record<string, DTScalar>, id: string): DTCell =>
      Object.hasOwn(context, id)
        ? { present: true, value: context[id] }
        : { present: false };
  const domains = fields.map((field) => {
      const values = [cell(baseline, field.id), ...field.catalog];
      return values.filter(
        (value, i) =>
          values.findIndex((other) =>
            dtEqual(value as unknown as DTJson, other as unknown as DTJson),
          ) === i,
      );
    }),
    grid = dtGrid(fields, domains, baseline);
  const result: DTCounterfactual = {
    decisionId: rootId,
    enumerated: 0,
    evaluated: 0,
    total: grid.total,
    complete: false,
    optimal: false,
    reason: null,
    work: 0,
    best: null,
  };
  await dtYield(options, { checked: 0, total: grid.total, work: 0 });
  for (let index = 0; index < grid.total; index++) {
    if (result.enumerated >= MAX_DT_CANDIDATES) {
      result.reason = "cases";
      break;
    }
    const context = grid.at(index),
      changes = fields.flatMap((field) => {
        const before = cell(baseline, field.id),
          after = cell(context, field.id);
        return dtEqual(before as unknown as DTJson, after as unknown as DTJson)
          ? []
          : [{ id: field.id, before, after, cost: field.cost }];
      }),
      cost = changes.reduce((n, change) => n + change.cost, 0);
    result.enumerated++;
    if (!result.best || cost < result.best.cost) {
      let evaluation: DTEvaluation;
      try {
        evaluation = evaluateDtPrepared(
          project,
          rootId,
          context,
          Math.min(MAX_DT_WORK, MAX_DT_ANALYSIS - result.work),
        );
      } catch (e) {
        if (e instanceof DecisionError && e.code === "work") {
          result.reason = "work";
          break;
        }
        throw e;
      }
      result.evaluated++;
      result.work += evaluation.work;
      if (
        evaluation.result.status === target.status &&
        (!Object.hasOwn(target, "output") ||
          dtEqual(evaluation.result.output, target.output!))
      )
        result.best = { cost, context, changes, evaluation };
      if (result.best?.cost === 0) {
        result.reason = "zero";
        result.optimal = true;
        break;
      }
    }
    if (result.enumerated % 16 === 0)
      await dtYield(options, {
        checked: result.enumerated,
        total: grid.total,
        work: result.work,
      });
  }
  result.complete =
    result.enumerated === result.total && result.reason !== "work";
  result.optimal ||= result.complete;
  await dtYield(options, {
    checked: result.enumerated,
    total: result.total,
    work: result.work,
  });
  return result;
}
export type DTCheck = {
  kind: "status" | "output" | "matched" | "selected";
  passed: boolean;
};
export type DTCaseRun = {
  caseId: string;
  decisionId: string;
  checked: boolean;
  passed: boolean;
  checks: DTCheck[];
  evaluation: DTEvaluation | null;
  error: string | null;
};
export function checkDecisionExpectation(
  evaluation: DTEvaluation,
  expect: DTExpectation | null,
): DTCheck[] {
  if (!expect) return [];
  const root = evaluation.result,
    checks: DTCheck[] = [
      { kind: "status", passed: root.status === expect.status },
    ];
  if (Object.hasOwn(expect, "output"))
    checks.push({
      kind: "output",
      passed: dtEqual(root.output, expect.output!),
    });
  if (expect.matched)
    checks.push({
      kind: "matched",
      passed: dtEqual(root.matched, expect.matched),
    });
  if (expect.selected)
    checks.push({
      kind: "selected",
      passed: dtEqual(root.selected, expect.selected),
    });
  return checks;
}
export async function runDecisionSuite(
  source: DTProject,
  options: DTOptions = {},
): Promise<DTCaseRun[]> {
  const project = normalizeDtProject(source),
    runs: DTCaseRun[] = [];
  let work = 0;
  await dtYield(options, { checked: 0, total: project.cases.length, work });
  for (const scenario of project.cases) {
    try {
      const evaluation = evaluateDtPrepared(
          project,
          scenario.decisionId,
          scenario.context,
        ),
        checks = checkDecisionExpectation(evaluation, scenario.expect);
      work += evaluation.work;
      runs.push({
        caseId: scenario.id,
        decisionId: scenario.decisionId,
        checked: scenario.expect !== null,
        passed:
          scenario.expect !== null && checks.every((check) => check.passed),
        checks,
        evaluation,
        error: null,
      });
    } catch (e) {
      if (!(e instanceof DecisionError)) throw e;
      runs.push({
        caseId: scenario.id,
        decisionId: scenario.decisionId,
        checked: scenario.expect !== null,
        passed: false,
        checks: [],
        evaluation: null,
        error: e.code,
      });
    }
    await dtYield(options, {
      checked: runs.length,
      total: project.cases.length,
      work,
    });
  }
  return runs;
}
export function recordDecisionExpectation(
  evaluation: DTEvaluation,
  exact = false,
): DTExpectation {
  return {
    status: evaluation.result.status,
    matched: [...evaluation.result.matched],
    selected: [...evaluation.result.selected],
    ...(exact ? { output: dtJson(evaluation.result.output, 65536, 4096) } : {}),
  };
}
export function decisionReport(runs: DTCaseRun[]) {
  return JSON.stringify(
    {
      kind: "rsswag-decision-report",
      version: 1,
      runs: runs.map((run) => ({
        caseId: run.caseId,
        decisionId: run.decisionId,
        checked: run.checked,
        passed: run.passed,
        checks: run.checks.map((check) => ({
          kind: check.kind,
          passed: check.passed,
        })),
        error: run.error,
        work: run.evaluation?.work ?? null,
        decisions:
          run.evaluation?.decisions.map((d) => ({
            decisionId: d.decisionId,
            status: d.status,
            matched: d.matched,
            selected: d.selected,
            blockedBy: d.blockedBy,
            error: d.error,
            work: d.work,
            rows: d.rows.map((row) => ({
              id: row.id,
              matched: row.matched,
              cells: row.cells,
            })),
          })) ?? [],
      })),
    },
    null,
    2,
  );
}
