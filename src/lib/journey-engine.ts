import {
  JourneyError,
  normalizeJourneyEvent,
  normalizeJourneyModel,
  type JourneyEvent,
  type JourneyModel,
  type JourneyOutcome,
} from "./journey-project";
export type JourneyDiagnostic = {
  code:
    | "initial"
    | "dangling-from"
    | "dangling-to"
    | "overlap"
    | "unreachable"
    | "dead-end"
    | "no-terminal";
  severity: "error" | "warning";
  stateId?: string;
  transitionIds?: string[];
  status?: number;
  action?: string;
};
export type JourneyAnalysis = {
  valid: boolean;
  diagnostics: JourneyDiagnostic[];
  reachable: string[];
  unreachable: string[];
  reachableTransitions: string[];
};
export const journeyEventKey = (e: JourneyEvent) =>
  JSON.stringify([e.action, e.status]);
export function analyzeJourneyModel(value: JourneyModel): JourneyAnalysis {
  const m = normalizeJourneyModel(value),
    states = new Set(m.states.map((s) => s.id)),
    diagnostics: JourneyDiagnostic[] = [];
  if (!states.has(m.initial))
    diagnostics.push({
      code: "initial",
      severity: "error",
      stateId: m.initial,
    });
  const indexed = new Map<string, JourneyDiagnostic>();
  for (const t of m.transitions.filter((t) => t.enabled)) {
    if (!states.has(t.from))
      diagnostics.push({
        code: "dangling-from",
        severity: "error",
        stateId: t.from,
        transitionIds: [t.id],
      });
    if (!states.has(t.to))
      diagnostics.push({
        code: "dangling-to",
        severity: "error",
        stateId: t.to,
        transitionIds: [t.id],
      });
    for (const status of t.statuses) {
      const key = JSON.stringify([t.from, t.action, status]),
        prior = indexed.get(key);
      if (prior) prior.transitionIds!.push(t.id);
      else
        indexed.set(key, {
          code: "overlap",
          severity: "error",
          stateId: t.from,
          transitionIds: [t.id],
          action: t.action,
          status,
        });
    }
  }
  diagnostics.push(
    ...[...indexed.values()].filter((d) => d.transitionIds!.length > 1),
  );
  const reachable = new Set<string>(states.has(m.initial) ? [m.initial] : []),
    queue = [...reachable];
  for (let i = 0; i < queue.length; i++)
    for (const t of m.transitions)
      if (
        t.enabled &&
        t.from === queue[i] &&
        states.has(t.to) &&
        !reachable.has(t.to)
      ) {
        reachable.add(t.to);
        queue.push(t.to);
      }
  for (const s of m.states) {
    if (!reachable.has(s.id))
      diagnostics.push({
        code: "unreachable",
        severity: "warning",
        stateId: s.id,
      });
    else if (
      !s.terminal &&
      !m.transitions.some(
        (t) => t.enabled && t.from === s.id && states.has(t.to),
      )
    )
      diagnostics.push({
        code: "dead-end",
        severity: "warning",
        stateId: s.id,
      });
  }
  if (!m.states.some((s) => s.terminal))
    diagnostics.push({ code: "no-terminal", severity: "warning" });
  return {
    valid: !diagnostics.some((d) => d.severity === "error"),
    diagnostics,
    reachable: [...reachable],
    unreachable: m.states.filter((s) => !reachable.has(s.id)).map((s) => s.id),
    reachableTransitions: m.transitions
      .filter((t) => t.enabled && reachable.has(t.from) && states.has(t.to))
      .map((t) => t.id),
  };
}
export function compileJourneyModel(value: JourneyModel) {
  const model = normalizeJourneyModel(value),
    analysis = analyzeJourneyModel(model);
  if (!analysis.valid) throw new JourneyError("graph");
  const outgoing = new Map(
    model.states.map((s) => [
      s.id,
      new Map<
        string,
        { event: JourneyEvent; transitionId: string; to: string }
      >(),
    ]),
  );
  for (const t of model.transitions.filter((t) => t.enabled))
    for (const status of t.statuses) {
      const event = { action: t.action, status };
      outgoing
        .get(t.from)!
        .set(journeyEventKey(event), { event, transitionId: t.id, to: t.to });
    }
  return {
    model,
    analysis,
    outgoing,
    terminal: new Set(model.states.filter((s) => s.terminal).map((s) => s.id)),
  };
}
export type JourneyObservation = {
  index: number;
  event: JourneyEvent;
  allowed: boolean;
  from: string;
  to: string;
  transitionId: string | null;
  canFinish: boolean;
  reason: "matched" | "no-transition";
};
export function createJourneyMonitor(value: JourneyModel) {
  const compiled = compileJourneyModel(value);
  let current = compiled.model.initial,
    total = 0,
    rejected = 0;
  const journal: JourneyObservation[] = [];
  return {
    observe(value: unknown): JourneyObservation {
      const event = normalizeJourneyEvent(value),
        from = current,
        edge = compiled.outgoing.get(current)!.get(journeyEventKey(event));
      if (edge) current = edge.to;
      else rejected++;
      const result: JourneyObservation = {
        index: total++,
        event,
        allowed: !!edge,
        from,
        to: current,
        transitionId: edge?.transitionId ?? null,
        canFinish: compiled.terminal.has(current),
        reason: edge ? "matched" : "no-transition",
      };
      journal.push(result);
      if (journal.length > 200) journal.shift();
      return { ...result, event: { ...event } };
    },
    snapshot() {
      return {
        modelId: compiled.model.id,
        state: current,
        canFinish: compiled.terminal.has(current),
        total,
        rejected,
        dropped: Math.max(0, total - journal.length),
        journal: journal.map((r) => ({ ...r, event: { ...r.event } })),
      };
    },
    reset() {
      current = compiled.model.initial;
      total = 0;
      rejected = 0;
      journal.length = 0;
    },
  };
}
export type JourneyWalk = {
  outcome: JourneyOutcome;
  finalState: string;
  failedAt: number | null;
  observations: JourneyObservation[];
  diagnostics: JourneyDiagnostic[];
  visited: string[];
  coveredTransitions: string[];
};
export function walkJourney(
  value: JourneyModel,
  values: unknown[],
): JourneyWalk {
  const m = normalizeJourneyModel(value),
    analysis = analyzeJourneyModel(m);
  if (values.length > 200) throw new JourneyError("limit");
  const steps = values.map(normalizeJourneyEvent);
  if (!analysis.valid)
    return {
      outcome: "invalid",
      finalState: m.initial,
      failedAt: null,
      observations: [],
      diagnostics: analysis.diagnostics,
      visited: [],
      coveredTransitions: [],
    };
  const monitor = createJourneyMonitor(m),
    observations: JourneyObservation[] = [],
    visited = new Set([m.initial]),
    coveredTransitions = new Set<string>();
  let failedAt: number | null = null;
  for (const event of steps) {
    const r = monitor.observe(event);
    observations.push(r);
    if (!r.allowed) {
      failedAt = r.index;
      break;
    }
    visited.add(r.to);
    coveredTransitions.add(r.transitionId!);
  }
  const state = monitor.snapshot();
  return {
    outcome:
      failedAt !== null
        ? "rejected"
        : state.canFinish
          ? "accepted"
          : "incomplete",
    finalState: state.state,
    failedAt,
    observations,
    diagnostics: analysis.diagnostics,
    visited: [...visited],
    coveredTransitions: [...coveredTransitions],
  };
}
