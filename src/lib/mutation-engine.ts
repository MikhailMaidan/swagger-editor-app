import {
  evaluateResponseAssertions,
  type AssertionResponse,
  type AssertionResult,
  type ResponseAssertion,
} from "./response-assertions";
import {
  MTError,
  MT_LIMITS,
  normalizeMTProject,
  mtFreshId,
  type MTFixture,
  type MTProject,
  type MTOperator,
  type MTExpectation,
} from "./mutation-model";
import {
  readMutationJson,
  mtNumberEqualsSmall,
  type MTJsonDiagnostic,
} from "./mutation-json";
import { getByteSize } from "./text-encoding";

export type MTChange =
  | { target: "body"; start: number; end: number; replacement: string }
  | { target: "status"; value: string }
  | { target: "duration"; value: number }
  | { target: "header"; name: string; value: string | null };
export type MTMutation = {
  id: string;
  key: string;
  operator: MTOperator;
  pointer: string;
  variant: string;
  change: MTChange;
};
export type MTOutcome = "killed" | "survived" | "inconclusive" | "waived";
export type MTMutantRun = MTMutation & {
  outcome: MTOutcome;
  results: AssertionResult[];
  killedBy: string[];
  waiver: string | null;
};
export type MTFixtureRun = {
  fixtureId: string;
  baseline: AssertionResult[];
  checkIds: string[];
  blocked: boolean;
  mutants: MTMutantRun[];
  truncated: boolean;
  diagnostic: MTJsonDiagnostic | null;
  staleWaivers: number;
  score: number | null;
  killed: number;
  survived: number;
  inconclusive: number;
  waived: number;
  expectation: MTExpectation | null;
  matched: boolean | null;
};
export type MTProgress = { fixtures: number; completed: number; total: number };
export type MTOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: MTProgress) => void;
  yield?: () => Promise<void>;
};
function checkAbort(options: MTOptions) {
  if (options.signal?.aborted) throw new MTError("cancelled");
}
async function yieldWork(options: MTOptions, progress: MTProgress) {
  checkAbort(options);
  options.onProgress?.({ ...progress });
  await (options.yield?.() ??
    new Promise<void>((resolve) => setTimeout(resolve, 0)));
  checkAbort(options);
}
export function materializeMTMutation(
  response: AssertionResponse,
  mutation: MTMutation,
): AssertionResponse {
  const change = mutation.change;
  if (change.target === "status") return { ...response, status: change.value };
  if (change.target === "duration")
    return { ...response, durationMs: change.value };
  if (change.target === "body")
    return {
      ...response,
      body:
        response.body.slice(0, change.start) +
        change.replacement +
        response.body.slice(change.end),
    };
  return {
    ...response,
    headers: Object.fromEntries([
      ...Object.entries(response.headers).filter(
        ([name]) => name.toLowerCase() !== change.name.toLowerCase(),
      ),
      ...(change.value === null ? [] : [[change.name, change.value]]),
    ]),
  };
}
export function planMTMutations(project: MTProject, fixture: MTFixture) {
  const result: MTMutation[] = [],
    seen = new Set<string>(),
    enabled = new Set(project.operators);
  let truncated = false;
  function add(
    operator: MTOperator,
    pointer: string,
    variant: string,
    change: MTChange,
  ) {
    if (!enabled.has(operator) || truncated) return;
    const signature = JSON.stringify(change);
    if (seen.has(signature)) return;
    seen.add(signature);
    if (result.length >= project.maxMutants) {
      truncated = true;
      return;
    }
    // Bound expansion mutations as well as their source fixtures.
    if (
      change.target === "body" &&
      getByteSize(fixture.response.body) + getByteSize(change.replacement) >
        MT_LIMITS.body * 2
    )
      return;
    result.push({
      id: `mutant-${result.length + 1}`,
      key: JSON.stringify([operator, pointer, variant]),
      operator,
      pointer,
      variant,
      change,
    });
  }
  for (const value of ["400", "500", "200"])
    if (value !== fixture.response.status)
      add("status", "", value, { target: "status", value });
  for (const value of [0, fixture.response.durationMs + 1000])
    if (value !== fixture.response.durationMs)
      add("duration", "", String(value), { target: "duration", value });
  const headers = Object.entries(fixture.response.headers).sort(([a], [b]) =>
    a.toLowerCase() < b.toLowerCase()
      ? -1
      : a.toLowerCase() > b.toLowerCase()
        ? 1
        : 0,
  );
  for (const [name, original] of headers) {
    add("header-remove", name.toLowerCase(), "", {
      target: "header",
      name,
      value: null,
    });
    let value =
      name.toLowerCase() === "content-type" ? "text/plain" : "__mutated__";
    if (value === original.trim()) value = "__mutated__2";
    add("header-change", name.toLowerCase(), "", {
      target: "header",
      name,
      value,
    });
  }
  if (
    project.operators.every((operator) =>
      ["status", "duration", "header-remove", "header-change"].includes(
        operator,
      ),
    )
  )
    return { mutations: result, truncated, diagnostic: null };
  const tree = readMutationJson(fixture.response.body);
  const scoped = tree.nodes.filter(
    (node) =>
      !fixture.scope ||
      node.pointer === fixture.scope ||
      node.pointer.startsWith(`${fixture.scope}/`),
  );
  const diagnostic =
    tree.diagnostic ??
    (fixture.scope && !scoped.length ? "scope-missing" : null);
  const body = fixture.response.body;
  const inScope = (pointer: string) =>
    !fixture.scope ||
    pointer === fixture.scope ||
    pointer.startsWith(`${fixture.scope}/`);
  for (const parent of tree.nodes) {
    if (truncated) break;
    if (parent.kind === "object")
      parent.entries.forEach((entry, index) => {
        if (!inScope(entry.node.pointer)) return;
        const start =
          index === parent.entries.length - 1 && index > 0
            ? parent.entries[index - 1].node.end
            : entry.start;
        const end =
          index < parent.entries.length - 1
            ? parent.entries[index + 1].start
            : entry.node.end;
        add("field-remove", entry.node.pointer, "", {
          target: "body",
          start,
          end,
          replacement: "",
        });
      });
    if (
      parent.kind === "array" &&
      (parent.items.length > 1 ||
        !enabled.has("array-empty") ||
        !inScope(parent.pointer))
    )
      parent.items.forEach((item, index) => {
        if (!inScope(item.pointer)) return;
        const start =
          index === parent.items.length - 1 && index > 0
            ? parent.items[index - 1].end
            : item.start;
        const end =
          index < parent.items.length - 1
            ? parent.items[index + 1].start
            : item.end;
        add("array-drop", item.pointer, String(index), {
          target: "body",
          start,
          end,
          replacement: "",
        });
      });
  }
  for (const node of scoped) {
    if (truncated) break;
    const replace = (operator: MTOperator, replacement: string, variant = "") =>
      add(operator, node.pointer, variant, {
        target: "body",
        start: node.start,
        end: node.end,
        replacement,
      });
    if (node.kind !== "null") replace("null", "null");
    replace(
      "type",
      {
        object: "[]",
        array: "{}",
        number: '""',
        string: "0",
        boolean: "0",
        null: '""',
      }[node.kind],
    );
    if (node.kind === "number")
      for (const value of [0, 1, -1] as const)
        if (!mtNumberEqualsSmall(body.slice(node.start, node.end), value))
          replace("number", String(value), String(value));
    if (node.kind === "boolean")
      replace(
        "boolean",
        body.slice(node.start, node.end) === "true" ? "false" : "true",
      );
    if (node.kind === "string") {
      const value = JSON.parse(body.slice(node.start, node.end)) as string;
      if (value !== "") replace("string-empty", '""');
      replace(
        "string-change",
        JSON.stringify(
          value === "__mutated__" ? "__mutated__2" : "__mutated__",
        ),
      );
    }
    if (node.kind === "object") {
      let key = "__mt_extra__";
      while (node.entries.some((entry) => entry.key === key)) key += "_";
      add("object-extra", node.pointer, "", {
        target: "body",
        start: node.end - 1,
        end: node.end - 1,
        replacement: `${node.entries.length ? "," : ""}${JSON.stringify(key)}:true`,
      });
    }
    if (node.kind === "array" && node.items.length) {
      replace("array-empty", "[]");
      add("array-duplicate", node.pointer, "", {
        target: "body",
        start: node.end - 1,
        end: node.end - 1,
        replacement: `,${body.slice(node.items[0].start, node.items[0].end)}`,
      });
    }
  }
  if (!tree.diagnostic && !fixture.scope)
    add("invalid-json", "", "", {
      target: "body",
      start: body.length,
      end: body.length,
      replacement: "\n{",
    });
  return { mutations: result, truncated, diagnostic };
}
function expectationMatched(run: MTFixtureRun) {
  const e = run.expectation;
  return e
    ? !run.blocked &&
        run.score !== null &&
        run.score >= e.minScore &&
        run.survived <= e.maxSurvived &&
        run.inconclusive <= e.maxInconclusive &&
        (!run.truncated || e.allowTruncated)
    : null;
}
export async function runMTProject(
  input: MTProject,
  fixtureIds?: string[],
  options: MTOptions = {},
): Promise<MTFixtureRun[]> {
  checkAbort(options);
  const project = normalizeMTProject(input),
    ids = fixtureIds ?? project.fixtures.map((f) => f.id);
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !project.fixtures.some((f) => f.id === id))
  )
    throw new MTError("reference");
  const fixtures = project.fixtures.filter((f) => ids.includes(f.id));
  const planned = fixtures.map((fixture) => ({
    fixture,
    plan: planMTMutations(project, fixture),
  }));
  const total = planned.reduce((n, item) => n + item.plan.mutations.length, 0);
  if (total > MT_LIMITS.totalMutants) throw new MTError("limit");
  const progress = { fixtures: fixtures.length, completed: 0, total };
  const runs: MTFixtureRun[] = [];
  await yieldWork(options, progress);
  for (const { fixture, plan } of planned) {
    const checks = fixture.checks.filter((c) => c.enabled);
    if (!checks.length) throw new MTError("no-checks");
    const baseline = evaluateResponseAssertions(
        checks.map((c) => c.rule),
        fixture.response,
      ),
      blocked = baseline.some((r) => r.outcome !== "pass");
    const mutants: MTMutantRun[] = [];
    const waivers = project.waivers.filter((w) => w.fixture === fixture.id);
    if (!blocked)
      for (const mutation of plan.mutations) {
        checkAbort(options);
        const waiver =
          waivers.find((w) => w.key === mutation.key)?.reason ?? null;
        const results = waiver
          ? []
          : evaluateResponseAssertions(
              checks.map((c) => c.rule),
              materializeMTMutation(fixture.response, mutation),
            );
        const killedBy = checks
          .filter((_, i) => results[i]?.outcome === "fail")
          .map((c) => c.id);
        const outcome: MTOutcome = waiver
          ? "waived"
          : killedBy.length
            ? "killed"
            : results.some((r) => r.outcome === "error")
              ? "inconclusive"
              : "survived";
        mutants.push({ ...mutation, results, killedBy, outcome, waiver });
        progress.completed++;
        if (progress.completed % 8 === 0) await yieldWork(options, progress);
      }
    if (blocked) progress.completed += plan.mutations.length;
    const killed = mutants.filter((m) => m.outcome === "killed").length,
      survived = mutants.filter((m) => m.outcome === "survived").length,
      inconclusive = mutants.filter((m) => m.outcome === "inconclusive").length,
      waived = mutants.filter((m) => m.outcome === "waived").length;
    const denominator = killed + survived + inconclusive;
    const run: MTFixtureRun = {
      fixtureId: fixture.id,
      baseline,
      checkIds: checks.map((c) => c.id),
      blocked,
      mutants,
      truncated: plan.truncated,
      diagnostic: plan.diagnostic,
      staleWaivers: waivers.filter(
        (w) => !plan.mutations.some((m) => m.key === w.key),
      ).length,
      score: denominator
        ? Math.round((killed / denominator) * 10000) / 100
        : null,
      killed,
      survived,
      inconclusive,
      waived,
      expectation: fixture.expectation,
      matched: null,
    };
    run.matched = expectationMatched(run);
    runs.push(run);
    await yieldWork(options, progress);
  }
  checkAbort(options);
  return runs;
}
export function mtCheckMatrix(run: MTFixtureRun) {
  return run.checkIds.map((id, index) => ({
    id,
    kills: run.mutants.filter((m) => m.results[index]?.outcome === "fail")
      .length,
    errors: run.mutants.filter((m) => m.results[index]?.outcome === "error")
      .length,
    uniqueKills: run.mutants.filter(
      (m) => m.killedBy.length === 1 && m.killedBy[0] === id,
    ).length,
  }));
}
export function reduceMTChecks(
  fixture: MTFixture,
  run: MTFixtureRun,
): string[] {
  if (run.blocked || run.fixtureId !== fixture.id)
    throw new MTError("reference");
  const chosen = new Set(
    fixture.checks.filter((c) => c.enabled && c.pinned).map((c) => c.id),
  );
  const uncovered = new Set(
    run.mutants
      .filter(
        (m) =>
          m.outcome === "killed" && !m.killedBy.some((id) => chosen.has(id)),
      )
      .map((m) => m.id),
  );
  while (uncovered.size) {
    let best = "",
      count = 0;
    for (const id of run.checkIds) {
      if (chosen.has(id)) continue;
      const n = run.mutants.filter(
        (m) => uncovered.has(m.id) && m.killedBy.includes(id),
      ).length;
      if (n > count) {
        best = id;
        count = n;
      }
    }
    if (!best) break;
    chosen.add(best);
    for (const mutant of run.mutants)
      if (mutant.killedBy.includes(best)) uncovered.delete(mutant.id);
  }
  return run.checkIds.filter((id) => chosen.has(id));
}
export function suggestMTAssertion(
  fixture: MTFixture,
  mutation: MTMutation,
): ResponseAssertion | null {
  const candidates: ResponseAssertion[] = [],
    rule = (
      target: ResponseAssertion["target"],
      path: string,
      operator: ResponseAssertion["operator"],
      expected: string,
    ) => ({
      name: `Detect ${mutation.operator} ${path || "/"}`.slice(0, 120),
      target,
      path,
      operator,
      expected,
    });
  if (mutation.change.target === "status")
    candidates.push(rule("status", "", "equals", fixture.response.status));
  if (mutation.change.target === "duration")
    candidates.push(
      rule(
        "duration",
        "",
        mutation.change.value > fixture.response.durationMs ? "lte" : "gte",
        String(fixture.response.durationMs),
      ),
    );
  if (mutation.change.target === "header") {
    const name = mutation.change.name;
    candidates.push(
      rule("header", name, "equals", fixture.response.headers[name]),
    );
  }
  if (mutation.change.target === "body") {
    const pointer =
      mutation.operator === "array-drop"
        ? mutation.pointer.slice(0, mutation.pointer.lastIndexOf("/"))
        : mutation.pointer;
    if (mutation.operator === "field-remove")
      candidates.push(rule("body", pointer, "exists", ""));
    const node = readMutationJson(fixture.response.body).nodes.find(
      (n) => n.pointer === pointer,
    );
    if (node) {
      candidates.push(
        rule(
          "body",
          pointer,
          "equals",
          fixture.response.body.slice(node.start, node.end),
        ),
      );
      candidates.push(rule("body", pointer, "type", node.kind));
    }
  }
  const mutant = materializeMTMutation(fixture.response, mutation);
  return (
    candidates.find(
      (candidate) =>
        evaluateResponseAssertions([candidate], fixture.response)[0].outcome ===
          "pass" &&
        evaluateResponseAssertions([candidate], mutant)[0].outcome === "fail",
    ) ?? null
  );
}
export function mtRecordedExpectation(run: MTFixtureRun): MTExpectation {
  if (run.blocked || run.score === null) throw new MTError("expectation");
  return {
    minScore: run.score,
    maxSurvived: run.survived,
    maxInconclusive: run.inconclusive,
    allowTruncated: run.truncated,
  };
}
export function mtReport(runs: MTFixtureRun[]) {
  return {
    version: 1,
    kind: "rsswag-response-mutation-report",
    runs: runs.map((run) => ({
      fixtureId: run.fixtureId,
      blocked: run.blocked,
      baseline: run.baseline,
      checkIds: run.checkIds,
      score: run.score,
      killed: run.killed,
      survived: run.survived,
      inconclusive: run.inconclusive,
      waived: run.waived,
      truncated: run.truncated,
      diagnostic: run.diagnostic,
      staleWaivers: run.staleWaivers,
      expectation: run.expectation,
      matched: run.matched,
      matrix: mtCheckMatrix(run),
      mutants: run.mutants.map((m) => ({
        id: m.id,
        key: m.key,
        operator: m.operator,
        pointer: m.pointer,
        variant: m.variant,
        outcome: m.outcome,
        results: m.results,
        killedBy: m.killedBy,
        waiver: m.waiver,
      })),
    })),
  };
}
export function mtSuggestedCheck(fixture: MTFixture, mutation: MTMutation) {
  const rule = suggestMTAssertion(fixture, mutation);
  if (!rule) throw new MTError("suggestion");
  return {
    id: mtFreshId("check", fixture.checks),
    enabled: true,
    pinned: false,
    rule,
  };
}
