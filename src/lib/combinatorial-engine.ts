import {
  CTError,
  CT_LIMITS,
  normalizeCTProject,
  normalizeCTRows,
  ctFreshId,
  type CTCondition,
  type CTProject,
  type CTRow,
} from "./combinatorial-model";

export type CTTuple = {
  id: string;
  terms: { variable: string; choice: string }[];
  feasible: boolean;
};
export type CTProgress = {
  phase: "enumerate" | "generate";
  states: number;
  candidates: number;
  tuples: number;
};
export type CTOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: CTProgress) => void;
  yield?: () => Promise<void>;
};
export type CTSpace = {
  project: CTProject;
  tuples: CTTuple[];
  candidates: number[][];
  coverage: number[][];
  inverted: number[][];
  candidateIndex: Map<string, number>;
  states: number;
};
export type CTAudit = {
  feasibleRows: number;
  feasibleTuples: number;
  infeasibleTuples: number;
  covered: string[];
  missing: string[];
  percentage: number;
  complete: boolean;
  rows: {
    id: string;
    valid: boolean;
    failedConstraints: string[];
    duplicateOf: string | null;
  }[];
};
export function evaluateCTCondition(
  condition: CTCondition,
  choices: Record<string, string>,
): boolean | undefined {
  if (condition.op === "is")
    return Object.hasOwn(choices, condition.variable)
      ? choices[condition.variable] === condition.choice
      : undefined;
  if (condition.op === "not") {
    const value = evaluateCTCondition(condition.arg, choices);
    return value === undefined ? undefined : !value;
  }
  if (condition.op === "implies") {
    const left = evaluateCTCondition(condition.if, choices),
      right = evaluateCTCondition(condition.then, choices);
    return left === false || right === true
      ? true
      : left === true && right === false
        ? false
        : undefined;
  }
  const values = condition.args.map((arg) => evaluateCTCondition(arg, choices));
  if (condition.op === "all")
    return values.includes(false)
      ? false
      : values.includes(undefined)
        ? undefined
        : true;
  return values.includes(true)
    ? true
    : values.includes(undefined)
      ? undefined
      : false;
}
function checkpoint(options: CTOptions) {
  if (options.signal?.aborted) throw new CTError("cancelled");
}
async function pause(options: CTOptions, progress: CTProgress) {
  checkpoint(options);
  options.onProgress?.({ ...progress });
  await (options.yield?.() ??
    new Promise<void>((resolve) => setTimeout(resolve, 0)));
  checkpoint(options);
}
function combinations(length: number, strength: number): number[][] {
  const result: number[][] = [];
  function walk(start: number, selected: number[]) {
    if (selected.length === strength) {
      result.push(selected);
      return;
    }
    for (let i = start; i <= length - strength + selected.length; i++)
      walk(i + 1, [...selected, i]);
  }
  walk(0, []);
  return result;
}
const tupleKey = (subset: number[], vector: number[]) =>
  subset.map((i) => `${i}:${vector[i]}`).join("|");
const rowKey = (vector: number[]) => vector.join(",");
function rowVector(project: CTProject, row: CTRow) {
  return project.variables.map((v) =>
    v.choices.findIndex((c) => c.id === row.choices[v.id]),
  );
}

export async function buildCTSpace(
  input: CTProject,
  options: CTOptions = {},
): Promise<CTSpace> {
  checkpoint(options);
  const project = normalizeCTProject(input),
    subsets = combinations(project.variables.length, project.strength);
  const tuples: CTTuple[] = [],
    tupleIndices = new Map<string, number>();
  const progress: CTProgress = {
    phase: "enumerate",
    states: 0,
    candidates: 0,
    tuples: 0,
  };
  // Count the interaction universe before allocating it or traversing assignments.
  const tupleCount = subsets.reduce(
    (sum, subset) =>
      sum + subset.reduce((n, i) => n * project.variables[i].choices.length, 1),
    0,
  );
  if (tupleCount > CT_LIMITS.tuples) throw new CTError("limit");
  for (const subset of subsets) {
    const vector = Array<number>(project.variables.length).fill(0);
    function enumerateTerms(depth: number) {
      if (depth === subset.length) {
        const terms = subset.map((i) => ({
          variable: project.variables[i].id,
          choice: project.variables[i].choices[vector[i]].id,
        }));
        tupleIndices.set(tupleKey(subset, vector), tuples.length);
        tuples.push({
          id: terms.map((t) => `${t.variable}=${t.choice}`).join("|"),
          terms,
          feasible: false,
        });
        return;
      }
      const i = subset[depth];
      for (let c = 0; c < project.variables[i].choices.length; c++) {
        vector[i] = c;
        enumerateTerms(depth + 1);
      }
    }
    enumerateTerms(0);
  }
  progress.tuples = tuples.length;
  await pause(options, progress);
  const candidates: number[][] = [],
    coverage: number[][] = [],
    inverted = tuples.map(() => [] as number[]),
    candidateIndex = new Map<string, number>();
  const vector: number[] = [],
    selected: Record<string, string> = Object.create(null);
  let incidences = 0;
  async function visit(depth: number): Promise<void> {
    checkpoint(options);
    if (++progress.states > CT_LIMITS.states) throw new CTError("limit");
    if (progress.states % 512 === 0) await pause(options, progress);
    if (
      project.constraints.some(
        (c) => evaluateCTCondition(c.condition, selected) === false,
      )
    )
      return;
    if (depth === project.variables.length) {
      if (
        candidates.length >= CT_LIMITS.candidates ||
        incidences + subsets.length > CT_LIMITS.incidences
      )
        throw new CTError("limit");
      const index = candidates.length,
        covered = subsets.map((subset) =>
          tupleIndices.get(tupleKey(subset, vector))!,
        );
      candidates.push([...vector]);
      candidateIndex.set(rowKey(vector), index);
      coverage.push(covered);
      for (const tuple of covered) {
        tuples[tuple].feasible = true;
        inverted[tuple].push(index);
      }
      incidences += covered.length;
      progress.candidates = candidates.length;
      return;
    }
    const variable = project.variables[depth];
    for (let i = 0; i < variable.choices.length; i++) {
      vector[depth] = i;
      selected[variable.id] = variable.choices[i].id;
      await visit(depth + 1);
    }
    delete selected[variable.id];
  }
  await visit(0);
  checkpoint(options);
  options.onProgress?.({ ...progress });
  return {
    project,
    tuples,
    candidates,
    coverage,
    inverted,
    candidateIndex,
    states: progress.states,
  };
}

export function auditCTRows(space: CTSpace, input: CTRow[]): CTAudit {
  const rows = normalizeCTRows(input, space.project.variables),
    covered = new Set<number>(),
    seen = new Map<string, string>();
  const rowResults = rows.map((row) => {
    const failedConstraints = space.project.constraints
      .filter((c) => evaluateCTCondition(c.condition, row.choices) !== true)
      .map((c) => c.id);
    const vector = rowVector(space.project, row),
      key = rowKey(vector),
      candidate = space.candidateIndex.get(key);
    const valid = failedConstraints.length === 0 && candidate !== undefined;
    const duplicateOf = seen.get(key) ?? null;
    seen.set(key, seen.get(key) ?? row.id);
    if (valid)
      for (const tuple of space.coverage[candidate!]) covered.add(tuple);
    return { id: row.id, valid, failedConstraints, duplicateOf };
  });
  const feasible = space.tuples.filter((tuple) => tuple.feasible),
    missing = space.tuples
      .filter((tuple, i) => tuple.feasible && !covered.has(i))
      .map((tuple) => tuple.id);
  return {
    feasibleRows: space.candidates.length,
    feasibleTuples: feasible.length,
    infeasibleTuples: space.tuples.length - feasible.length,
    covered: [...covered].map((i) => space.tuples[i].id),
    missing,
    percentage: feasible.length
      ? Math.round((covered.size / feasible.length) * 10000) / 100
      : 0,
    complete:
      space.candidates.length > 0 &&
      missing.length === 0 &&
      rowResults.every((r) => r.valid),
    rows: rowResults,
  };
}

export async function generateCTSuite(
  space: CTSpace,
  input: CTRow[],
  mode: "replace" | "extend",
  options: CTOptions = {},
): Promise<CTRow[]> {
  checkpoint(options);
  if (!space.candidates.length) throw new CTError("unsatisfiable");
  const rows = normalizeCTRows(input, space.project.variables).filter(
    (row) => mode === "extend" || row.pinned,
  );
  if (auditCTRows(space, rows).rows.some((row) => !row.valid))
    throw new CTError("invalid-row");
  const scores = space.coverage.map((tuples) => tuples.length),
    covered = new Uint8Array(space.tuples.length);
  let seed = space.project.seed >>> 0,
    work = 0,
    remaining = space.tuples.filter((t) => t.feasible).length;
  const priorities = space.candidates.map(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  });
  const progress: CTProgress = {
    phase: "generate",
    states: space.states,
    candidates: space.candidates.length,
    tuples: remaining,
  };
  async function mark(candidate: number) {
    for (const tuple of space.coverage[candidate]) {
      if (covered[tuple]) continue;
      covered[tuple] = 1;
      remaining--;
      for (const neighbor of space.inverted[tuple]) {
        scores[neighbor]--;
        if (++work % 4096 === 0) {
          progress.tuples = remaining;
          await pause(options, progress);
        }
      }
    }
  }
  for (const row of rows)
    await mark(
      space.candidateIndex.get(rowKey(rowVector(space.project, row)))!,
    );
  const retained = rows.length;
  await pause(options, { ...progress, tuples: remaining });
  while (remaining > 0) {
    if (rows.length >= CT_LIMITS.rows) throw new CTError("limit");
    let best = -1;
    for (let i = 0; i < scores.length; i++) {
      if (
        scores[i] > 0 &&
        (best < 0 ||
          scores[i] > scores[best] ||
          (scores[i] === scores[best] && priorities[i] < priorities[best]))
      )
        best = i;
      if (++work % 4096 === 0)
        await pause(options, { ...progress, tuples: remaining });
    }
    if (best < 0) throw new CTError("unsatisfiable");
    const vector = space.candidates[best],
      id = ctFreshId("case", rows);
    rows.push({
      id,
      name: id,
      pinned: false,
      choices: Object.fromEntries(
        space.project.variables.map((v, i) => [v.id, v.choices[vector[i]].id]),
      ),
    });
    await mark(best);
  }
  // Remove redundant generated rows; retained rows and pinned tests always survive.
  const counts = new Uint16Array(space.tuples.length);
  for (const row of rows)
    for (const tuple of space.coverage[
      space.candidateIndex.get(rowKey(rowVector(space.project, row)))!
    ])
      counts[tuple]++;
  for (let i = rows.length - 1; i >= retained; i--) {
    const tuples =
      space.coverage[
        space.candidateIndex.get(rowKey(rowVector(space.project, rows[i])))!
      ];
    if (tuples.every((tuple) => counts[tuple] > 1)) {
      for (const tuple of tuples) counts[tuple]--;
      rows.splice(i, 1);
    }
    if (++work % 64 === 0) await pause(options, { ...progress, tuples: 0 });
  }
  checkpoint(options);
  options.onProgress?.({ ...progress, tuples: 0 });
  return rows;
}

export function ctCoverageReport(space: CTSpace, rows: CTRow[]) {
  const audit = auditCTRows(space, rows);
  return {
    version: 1,
    kind: "rsswag-combinatorial-report",
    strength: space.project.strength,
    seed: space.project.seed,
    variables: space.project.variables.map((v) => ({
      id: v.id,
      choices: v.choices.map((c) => c.id),
    })),
    constraints: space.project.constraints.map((c) => c.id),
    states: space.states,
    ...audit,
  };
}
