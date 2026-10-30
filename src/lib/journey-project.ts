import { getByteSize } from "./text-encoding";
export const MAX_JOURNEY_BYTES = 2 * 1024 * 1024;
export const JOURNEY_OUTCOMES = ["accepted", "incomplete", "rejected"] as const;
export type JourneyOutcome = (typeof JOURNEY_OUTCOMES)[number] | "invalid";
export type JourneyState = { id: string; name: string; terminal: boolean };
export type JourneyTransition = {
  id: string;
  name: string;
  enabled: boolean;
  from: string;
  to: string;
  action: string;
  statuses: number[];
};
export type JourneyModel = {
  id: string;
  name: string;
  initial: string;
  states: JourneyState[];
  transitions: JourneyTransition[];
};
export type JourneyEvent = { action: string; status: number };
export type JourneyTrace = {
  id: string;
  name: string;
  steps: JourneyEvent[];
  expect: Record<string, Exclude<JourneyOutcome, "invalid">>;
};
export type JourneyProject = {
  kind: "rsswag-journey-project";
  version: 1;
  name: string;
  models: JourneyModel[];
  traces: JourneyTrace[];
};
export class JourneyError extends Error {
  constructor(
    public code:
      | "json"
      | "project"
      | "trace"
      | "limit"
      | "graph"
      | "cancelled"
      | "har"
      | "schema",
  ) {
    super(code);
    this.name = "JourneyError";
  }
}
export const journeyObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const journeyText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
const id = (v: unknown): v is string =>
  journeyText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
const named = (v: unknown): v is string => journeyText(v, 120) && !!v.trim();
export const journeyAction = (v: unknown): v is string =>
  journeyText(v, 256) && !!v.trim();
export const journeyStatus = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 100 && v <= 599;
function list(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    throw new JourneyError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new JourneyError("project");
  return v;
}
export function journeyJson(source: string, max = MAX_JOURNEY_BYTES): unknown {
  if (getByteSize(source) > max) throw new JourneyError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new JourneyError("json");
  }
}
export function normalizeJourneyEvent(v: unknown): JourneyEvent {
  if (!journeyObject(v) || !journeyAction(v.action) || !journeyStatus(v.status))
    throw new JourneyError("trace");
  return { action: v.action, status: v.status };
}
export function normalizeJourneyState(v: unknown): JourneyState {
  if (
    !journeyObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    typeof v.terminal !== "boolean"
  )
    throw new JourneyError("project");
  return { id: v.id, name: v.name, terminal: v.terminal };
}
export function normalizeJourneyTransition(v: unknown): JourneyTransition {
  if (
    !journeyObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    typeof v.enabled !== "boolean" ||
    !id(v.from) ||
    !id(v.to) ||
    !journeyAction(v.action)
  )
    throw new JourneyError("project");
  const statuses = list(v.statuses, 1, 20);
  if (
    !statuses.every(journeyStatus) ||
    new Set(statuses).size !== statuses.length
  )
    throw new JourneyError("project");
  return {
    id: v.id,
    name: v.name,
    enabled: v.enabled,
    from: v.from,
    to: v.to,
    action: v.action,
    statuses: [...statuses] as number[],
  };
}
export function normalizeJourneyModel(v: unknown): JourneyModel {
  if (!journeyObject(v) || !id(v.id) || !named(v.name) || !id(v.initial))
    throw new JourneyError("project");
  const states = list(v.states, 1, 40).map(normalizeJourneyState),
    transitions = list(v.transitions, 0, 120).map(normalizeJourneyTransition);
  if (
    new Set(states.map((s) => s.id)).size !== states.length ||
    new Set(transitions.map((t) => t.id)).size !== transitions.length
  )
    throw new JourneyError("project");
  // Broken references and overlapping event edges remain editable drafts and
  // are diagnosed by the graph analyzer; execution refuses invalid graphs.
  return { id: v.id, name: v.name, initial: v.initial, states, transitions };
}
export function normalizeJourneyTrace(v: unknown): JourneyTrace {
  if (
    !journeyObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !journeyObject(v.expect) ||
    Object.entries(v.expect).some(
      ([key, value]) =>
        !id(key) ||
        !JOURNEY_OUTCOMES.includes(value as Exclude<JourneyOutcome, "invalid">),
    )
  )
    throw new JourneyError("project");
  return {
    id: v.id,
    name: v.name,
    steps: list(v.steps, 0, 200).map(normalizeJourneyEvent),
    expect: Object.fromEntries(
      Object.entries(v.expect),
    ) as JourneyTrace["expect"],
  };
}
export function normalizeJourneyProject(v: unknown): JourneyProject {
  if (
    !journeyObject(v) ||
    v.kind !== "rsswag-journey-project" ||
    v.version !== 1 ||
    !named(v.name)
  )
    throw new JourneyError("project");
  const models = list(v.models, 1, 5).map(normalizeJourneyModel),
    traces = list(v.traces, 0, 30).map(normalizeJourneyTrace),
    ids = new Set(models.map((m) => m.id));
  if (
    ids.size !== models.length ||
    new Set(traces.map((t) => t.id)).size !== traces.length ||
    traces.some((t) => Object.keys(t.expect).some((key) => !ids.has(key)))
  )
    throw new JourneyError("project");
  const p: JourneyProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    models,
    traces,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_JOURNEY_BYTES)
    throw new JourneyError("limit");
  return p;
}
export const parseJourneyProject = (source: string) =>
  normalizeJourneyProject(journeyJson(source));
export function serializeJourneyProject(value: JourneyProject): string {
  const p = normalizeJourneyProject(value),
    source = JSON.stringify(p, null, 2);
  return getByteSize(source) <= MAX_JOURNEY_BYTES ? source : JSON.stringify(p);
}
export const newJourneyState = (id = "state-1"): JourneyState => ({
  id,
  name: id,
  terminal: false,
});
export const newJourneyTransition = (
  id = "transition-1",
  from = "state-1",
  to = "state-2",
): JourneyTransition => ({
  id,
  name: id,
  enabled: true,
  from,
  to,
  action: "POST /orders",
  statuses: [201],
});
export const newJourneyTrace = (id = "trace-1"): JourneyTrace => ({
  id,
  name: id,
  steps: [{ action: "POST /orders", status: 201 }],
  expect: {},
});
export const newJourneyModel = (id = "model-1"): JourneyModel => ({
  id,
  name: id,
  initial: "state-1",
  states: [
    newJourneyState(),
    { id: "state-2", name: "Order created", terminal: true },
  ],
  transitions: [newJourneyTransition()],
});
export const emptyJourneyProject = (): JourneyProject => ({
  kind: "rsswag-journey-project",
  version: 1,
  name: "API journey project",
  models: [newJourneyModel()],
  traces: [newJourneyTrace()],
});
