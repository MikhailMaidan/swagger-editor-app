import {
  compileJourneyModel,
  walkJourney,
  type JourneyWalk,
} from "./journey-engine";
import {
  JourneyError,
  MAX_JOURNEY_BYTES,
  journeyAction,
  journeyJson,
  journeyObject,
  journeyStatus,
  normalizeJourneyModel,
  normalizeJourneyProject,
  normalizeJourneyTrace,
  type JourneyEvent,
  type JourneyModel,
  type JourneyOutcome,
  type JourneyProject,
  type JourneyTrace,
} from "./journey-project";
import { parseOpenApiSchema } from "./openapi";
import { getByteSize } from "./text-encoding";
export type JourneyRun = JourneyWalk & {
  modelId: string;
  modelName: string;
  traceId: string;
  traceName: string;
  checked: boolean;
  expected?: Exclude<JourneyOutcome, "invalid">;
  passed: boolean;
  totalSteps: number;
};
export async function runJourneyMatrix(
  value: JourneyProject,
  traceId?: string,
  cancelled?: () => boolean,
  progress?: (done: number, total: number) => void,
): Promise<JourneyRun[]> {
  const p = normalizeJourneyProject(value),
    traces = p.traces.filter((t) => !traceId || t.id === traceId),
    runs: JourneyRun[] = [];
  if (!traces.length) throw new JourneyError("trace");
  for (const t of traces)
    for (const m of p.models) {
      if (cancelled?.()) throw new JourneyError("cancelled");
      const walk = walkJourney(m, t.steps),
        expected = Object.hasOwn(t.expect, m.id) ? t.expect[m.id] : undefined;
      runs.push({
        ...walk,
        modelId: m.id,
        modelName: m.name,
        traceId: t.id,
        traceName: t.name,
        checked: expected !== undefined,
        expected,
        passed:
          walk.outcome !== "invalid" &&
          (expected === undefined || expected === walk.outcome),
        totalSteps: t.steps.length,
      });
      progress?.(runs.length, traces.length * p.models.length);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  if (cancelled?.()) throw new JourneyError("cancelled");
  return runs;
}
export type JourneyInclusion = {
  status: "included" | "counterexample" | "bounded" | "invalid";
  checkedPairs: number;
  reason: "missing-transition" | "completion-lost" | null;
  steps: JourneyEvent[] | null;
  sourceState?: string;
  targetState?: string;
};
type Compiled = ReturnType<typeof compileJourneyModel>;
async function inclusion(
  a: Compiled,
  b: Compiled,
  maxPairs: number,
  cancelled?: () => boolean,
): Promise<JourneyInclusion> {
  const nodes: {
      a: string;
      b: string;
      parent: number;
      event?: JourneyEvent;
    }[] = [{ a: a.model.initial, b: b.model.initial, parent: -1 }],
    seen = new Set([JSON.stringify([a.model.initial, b.model.initial])]);
  let cursor = 0,
    checkedPairs = 0;
  function path(index: number): JourneyEvent[] {
    const steps: JourneyEvent[] = [];
    for (let i = index; nodes[i].parent !== -1; i = nodes[i].parent)
      steps.push({ ...nodes[i].event! });
    return steps.reverse();
  }
  while (cursor < nodes.length) {
    // Complete a breadth-first layer before returning an edge counterexample;
    // another node in this layer may have a shorter completion counterexample.
    const end = nodes.length;
    let witness: { index: number; event: JourneyEvent } | null = null;
    for (; cursor < end; cursor++) {
      if (cancelled?.()) throw new JourneyError("cancelled");
      if (checkedPairs >= maxPairs)
        return { status: "bounded", checkedPairs, reason: null, steps: null };
      const node = nodes[cursor];
      checkedPairs++;
      if (a.terminal.has(node.a) && !b.terminal.has(node.b))
        return {
          status: "counterexample",
          checkedPairs,
          reason: "completion-lost",
          steps: path(cursor),
          sourceState: node.a,
          targetState: node.b,
        };
      for (const [key, edge] of a.outgoing.get(node.a)!) {
        const other = b.outgoing.get(node.b)!.get(key);
        if (!other) {
          witness ??= { index: cursor, event: edge.event };
          continue;
        }
        const pair = JSON.stringify([edge.to, other.to]);
        if (!seen.has(pair)) {
          seen.add(pair);
          nodes.push({
            a: edge.to,
            b: other.to,
            parent: cursor,
            event: edge.event,
          });
        }
      }
      if (checkedPairs % 25 === 0)
        await new Promise<void>((r) => setTimeout(r, 0));
    }
    if (witness) {
      const n = nodes[witness.index];
      return {
        status: "counterexample",
        checkedPairs,
        reason: "missing-transition",
        steps: [...path(witness.index), { ...witness.event }],
        sourceState: n.a,
        targetState: n.b,
      };
    }
  }
  return { status: "included", checkedPairs, reason: null, steps: null };
}
export type JourneyComparison = {
  baselineId: string;
  candidateId: string;
  classification:
    | "equivalent"
    | "expanded"
    | "restricted"
    | "changed"
    | "inconclusive"
    | "invalid";
  forward: JourneyInclusion;
  reverse: JourneyInclusion;
};
export async function compareJourneyModels(
  baseline: JourneyModel,
  candidate: JourneyModel,
  maxPairs = 2000,
  cancelled?: () => boolean,
): Promise<JourneyComparison> {
  if (!Number.isInteger(maxPairs) || maxPairs < 1 || maxPairs > 2000)
    throw new JourneyError("limit");
  const a = normalizeJourneyModel(baseline),
    b = normalizeJourneyModel(candidate);
  let ca: Compiled, cb: Compiled;
  try {
    ca = compileJourneyModel(a);
    cb = compileJourneyModel(b);
  } catch (e) {
    if (!(e instanceof JourneyError) || e.code !== "graph") throw e;
    const invalid: JourneyInclusion = {
      status: "invalid",
      checkedPairs: 0,
      reason: null,
      steps: null,
    };
    return {
      baselineId: a.id,
      candidateId: b.id,
      classification: "invalid",
      forward: invalid,
      reverse: { ...invalid },
    };
  }
  if (cancelled?.()) throw new JourneyError("cancelled");
  const forward = await inclusion(ca, cb, maxPairs, cancelled);
  await new Promise<void>((r) => setTimeout(r, 0));
  const reverse = await inclusion(cb, ca, maxPairs, cancelled);
  if (cancelled?.()) throw new JourneyError("cancelled");
  const classification =
    forward.status === "bounded" || reverse.status === "bounded"
      ? "inconclusive"
      : forward.status === "included"
        ? reverse.status === "included"
          ? "equivalent"
          : "expanded"
        : reverse.status === "included"
          ? "restricted"
          : "changed";
  return {
    baselineId: a.id,
    candidateId: b.id,
    classification,
    forward,
    reverse,
  };
}
export type JourneySuite = {
  kind: "rsswag-journey-suite";
  version: 1;
  modelId: string;
  modelName: string;
  mode: "states" | "transitions" | "events";
  complete: boolean;
  covered: number;
  objectives: number;
  reachableStates: number;
  reachableTransitions: number;
  cases: JourneyTrace[];
};
export async function generateJourneySuite(
  value: JourneyModel,
  mode: JourneySuite["mode"] = "transitions",
  maxCases = 120,
  cancelled?: () => boolean,
): Promise<JourneySuite> {
  if (
    !["states", "transitions", "events"].includes(mode) ||
    !Number.isInteger(maxCases) ||
    maxCases < 1 ||
    maxCases > 500
  )
    throw new JourneyError("limit");
  const c = compileJourneyModel(value),
    paths = new Map<string, JourneyEvent[]>([[c.model.initial, []]]),
    queue = [c.model.initial];
  for (let i = 0; i < queue.length; i++)
    for (const edge of c.outgoing.get(queue[i])!.values())
      if (!paths.has(edge.to)) {
        paths.set(edge.to, [...paths.get(queue[i])!, edge.event]);
        queue.push(edge.to);
      }
  const goals: { key: string; steps: JourneyEvent[] }[] =
    mode === "states"
      ? [...paths].map(([key, steps]) => ({ key, steps }))
      : c.model.transitions
          .filter((t) => t.enabled && paths.has(t.from))
          .flatMap((t) =>
            (mode === "events" ? t.statuses : [t.statuses[0]]).map(
              (status) => ({
                key: mode === "events" ? JSON.stringify([t.id, status]) : t.id,
                steps: [...paths.get(t.from)!, { action: t.action, status }],
              }),
            ),
          );
  const covered = new Set<string>(),
    cases: JourneyTrace[] = [];
  for (const goal of goals) {
    if (cancelled?.()) throw new JourneyError("cancelled");
    if (covered.has(goal.key)) continue;
    if (cases.length >= maxCases) break;
    const walk = walkJourney(c.model, goal.steps),
      id = `generated-${cases.length + 1}`;
    cases.push({
      id,
      name: id,
      steps: goal.steps.map((s) => ({ ...s })),
      expect: Object.fromEntries([
        [c.model.id, walk.outcome],
      ]) as JourneyTrace["expect"],
    });
    if (mode === "states") walk.visited.forEach((v) => covered.add(v));
    else if (mode === "transitions")
      walk.coveredTransitions.forEach((v) => covered.add(v));
    else
      walk.observations.forEach((v) =>
        covered.add(JSON.stringify([v.transitionId, v.event.status])),
      );
    if (cases.length % 10 === 0)
      await new Promise<void>((r) => setTimeout(r, 0));
  }
  if (cancelled?.()) throw new JourneyError("cancelled");
  return {
    kind: "rsswag-journey-suite",
    version: 1,
    modelId: c.model.id,
    modelName: c.model.name,
    mode,
    complete: goals.every((g) => covered.has(g.key)),
    covered: goals.filter((g) => covered.has(g.key)).length,
    objectives: goals.length,
    reachableStates: paths.size,
    reachableTransitions: c.analysis.reachableTransitions.length,
    cases,
  };
}
export function traceFromJourneyWitness(
  p: JourneyProject,
  result: JourneyComparison,
  direction: "forward" | "reverse",
  id: string,
): JourneyTrace {
  const witness = result[direction];
  if (witness.status !== "counterexample" || witness.steps === null)
    throw new JourneyError("trace");
  const modelIds = [result.baselineId, result.candidateId],
    expect = Object.fromEntries(
      modelIds.map((modelId) => {
        const m = p.models.find((m) => m.id === modelId);
        if (!m) throw new JourneyError("project");
        return [modelId, walkJourney(m, witness.steps!).outcome];
      }),
    );
  return normalizeJourneyTrace({ id, name: id, steps: witness.steps, expect });
}
export function journeyActionsFromSchema(source: string): string[] {
  if (getByteSize(source) > MAX_JOURNEY_BYTES) throw new JourneyError("limit");
  const parsed = parseOpenApiSchema(source);
  if (!parsed.ok) throw new JourneyError("schema");
  const actions = [
    ...new Set(
      parsed.value.endpoints.map((e) => `${e.method.toUpperCase()} ${e.path}`),
    ),
  ];
  if (actions.length > 500 || !actions.every(journeyAction))
    throw new JourneyError("limit");
  if (!actions.length) throw new JourneyError("schema");
  return actions;
}
function matchesAction(action: string, method: string, path: string): boolean {
  const split = action.indexOf(" ");
  if (action.slice(0, split) !== method || split < 1) return false;
  const template = action.slice(split + 1).split("/"),
    segments = path.split("/");
  return (
    template.length === segments.length &&
    template.every((part, i) =>
      /^\{[^{}\/]+\}$/.test(part) ? !!segments[i] : part === segments[i],
    )
  );
}
export function importJourneyHar(
  source: string,
  model: JourneyModel,
  id: string,
): { trace: JourneyTrace; skipped: number } {
  const raw = journeyJson(source, 5 * 1024 * 1024);
  if (
    !journeyObject(raw) ||
    !journeyObject(raw.log) ||
    !Array.isArray(raw.log.entries) ||
    raw.log.entries.length > 5000
  )
    throw new JourneyError("har");
  const actions = [
      ...new Set(
        normalizeJourneyModel(model)
          .transitions.filter((t) => t.enabled)
          .map((t) => t.action),
      ),
    ],
    steps: JourneyEvent[] = [];
  let skipped = 0;
  for (const entry of raw.log.entries) {
    if (
      !journeyObject(entry) ||
      !journeyObject(entry.request) ||
      !journeyObject(entry.response) ||
      typeof entry.request.method !== "string" ||
      typeof entry.request.url !== "string" ||
      !journeyStatus(entry.response.status)
    ) {
      skipped++;
      continue;
    }
    let url: URL;
    try {
      url = new URL(entry.request.url);
    } catch {
      skipped++;
      continue;
    }
    const method = entry.request.method.toUpperCase();
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !/^[A-Z]+$/.test(method)
    ) {
      skipped++;
      continue;
    }
    const rawAction = `${method} ${url.pathname}`,
      exact = actions.filter((a) => a === rawAction),
      matches = exact.length
        ? exact
        : actions.filter((a) => matchesAction(a, method, url.pathname));
    if (matches.length > 1) throw new JourneyError("har");
    const action = matches[0] ?? rawAction;
    if (!journeyAction(action) || steps.length >= 200)
      throw new JourneyError("limit");
    steps.push({ action, status: entry.response.status });
  }
  if (!steps.length) throw new JourneyError("har");
  return {
    trace: normalizeJourneyTrace({ id, name: id, steps, expect: {} }),
    skipped,
  };
}
export function journeyReport(
  runs: JourneyRun[],
  details = false,
  comparison?: JourneyComparison,
): string {
  const projectInclusion = (v: JourneyInclusion) => ({
    ...v,
    steps:
      v.steps?.map((step, index) => ({ index, status: step.status })) ?? null,
  });
  const source = JSON.stringify(
    {
      kind: "rsswag-journey-report",
      version: 1,
      total: runs.length,
      passed: runs.filter((r) => r.passed).length,
      comparison: comparison
        ? {
            ...comparison,
            forward: projectInclusion(comparison.forward),
            reverse: projectInclusion(comparison.reverse),
          }
        : undefined,
      runs: runs.map((r) => ({
        modelId: r.modelId,
        modelName: r.modelName,
        traceId: r.traceId,
        traceName: r.traceName,
        outcome: r.outcome,
        expected: r.expected,
        checked: r.checked,
        passed: r.passed,
        finalState: r.finalState,
        failedAt: r.failedAt,
        totalSteps: r.totalSteps,
        visited: r.visited,
        coveredTransitions: r.coveredTransitions,
        errors: r.diagnostics.filter((d) => d.severity === "error").length,
        warnings: r.diagnostics.filter((d) => d.severity === "warning").length,
        observations: details
          ? r.observations.map(({ event, ...o }) => ({
              ...o,
              status: event.status,
            }))
          : undefined,
      })),
    },
    null,
    2,
  );
  if (getByteSize(source) > 16 * 1024 * 1024) throw new JourneyError("limit");
  return source;
}
export function serializeJourneySuite(suite: JourneySuite): string {
  const source = JSON.stringify(suite, null, 2);
  if (getByteSize(source) > 16 * 1024 * 1024) throw new JourneyError("limit");
  return source;
}
export function demoJourneyProject(): JourneyProject {
  const transition = (
    id: string,
    from: string,
    to: string,
    action: string,
    statuses: number[],
  ) => ({ id, name: id, enabled: true, from, to, action, statuses });
  const create: JourneyEvent = { action: "POST /orders", status: 201 },
    pay: JourneyEvent = { action: "POST /orders/{id}/payments", status: 200 },
    ship: JourneyEvent = { action: "POST /orders/{id}/ship", status: 202 },
    cancel: JourneyEvent = { action: "POST /orders/{id}/cancel", status: 200 };
  const baseline: JourneyModel = {
    id: "baseline",
    name: "Order lifecycle baseline",
    initial: "empty",
    states: [
      { id: "empty", name: "No order", terminal: false },
      { id: "created", name: "Created", terminal: false },
      { id: "paid", name: "Paid", terminal: false },
      { id: "shipped", name: "Shipped", terminal: true },
      { id: "cancelled", name: "Cancelled", terminal: true },
      { id: "review", name: "Unused manual review", terminal: false },
    ],
    transitions: [
      transition("create", "empty", "created", create.action, [201]),
      transition("create-refused", "empty", "empty", create.action, [400, 409]),
      transition("pay", "created", "paid", pay.action, [200, 201]),
      transition(
        "cancel-created",
        "created",
        "cancelled",
        cancel.action,
        [200, 204],
      ),
      transition("ship", "paid", "shipped", ship.action, [202]),
      transition("cancel-paid-refused", "paid", "paid", cancel.action, [409]),
      ...["created", "paid", "shipped", "cancelled"].map((state) =>
        transition(`read-${state}`, state, state, "GET /orders/{id}", [200]),
      ),
    ],
  };
  const expanded: JourneyModel = {
    ...baseline,
    id: "expanded",
    name: "Allow cancellation after payment",
    transitions: [
      ...baseline.transitions,
      transition("cancel-paid", "paid", "cancelled", cancel.action, [200]),
    ],
  };
  const changed: JourneyModel = {
    ...baseline,
    id: "changed",
    name: "Paid can finish / status 201 removed",
    states: baseline.states.map((s) =>
      s.id === "paid" ? { ...s, terminal: true } : s,
    ),
    transitions: baseline.transitions.map((t) =>
      t.id === "pay" ? { ...t, statuses: [200] } : t,
    ),
  };
  const trace = (
    id: string,
    steps: JourneyEvent[],
    outcomes: [
      Exclude<JourneyOutcome, "invalid">,
      Exclude<JourneyOutcome, "invalid">,
      Exclude<JourneyOutcome, "invalid">,
    ],
  ): JourneyTrace => ({
    id,
    name: id,
    steps,
    expect: {
      baseline: outcomes[0],
      expanded: outcomes[1],
      changed: outcomes[2],
    },
  });
  return normalizeJourneyProject({
    kind: "rsswag-journey-project",
    version: 1,
    name: "Order journey contracts",
    models: [baseline, expanded, changed],
    traces: [
      trace(
        "fulfilled",
        [create, pay, ship],
        ["accepted", "accepted", "accepted"],
      ),
      trace(
        "paid-prefix",
        [create, pay],
        ["incomplete", "incomplete", "accepted"],
      ),
      trace(
        "cancel-created",
        [create, { ...cancel, status: 204 }],
        ["accepted", "accepted", "accepted"],
      ),
      trace(
        "cancel-paid",
        [create, pay, cancel],
        ["rejected", "accepted", "rejected"],
      ),
      trace(
        "payment-201",
        [create, { ...pay, status: 201 }, ship],
        ["accepted", "accepted", "rejected"],
      ),
      trace("pay-before-create", [pay], ["rejected", "rejected", "rejected"]),
      trace(
        "create-refused",
        [{ ...create, status: 400 }],
        ["incomplete", "incomplete", "incomplete"],
      ),
      trace(
        "unexpected-status",
        [{ ...create, status: 202 }],
        ["rejected", "rejected", "rejected"],
      ),
      trace(
        "created-prefix",
        [create],
        ["incomplete", "incomplete", "incomplete"],
      ),
      trace(
        "read-before-create",
        [{ action: "GET /orders/{id}", status: 200 }],
        ["rejected", "rejected", "rejected"],
      ),
    ],
  });
}
