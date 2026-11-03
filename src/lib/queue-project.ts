import {
  MAX_QUEUE_PROJECT,
  QueueError,
  queueObject,
  queueId,
  queueName,
  queueList,
  queueInt,
  queueJson,
  normalizeQueueDefinition,
  normalizeQueueStep,
  newQueueDefinition,
  type QueueDefinition,
  type QueueStep,
} from "./queue-model";
import { getByteSize } from "./text-encoding";
export const queueCountKeys = [
  "ready",
  "delayed",
  "leased",
  "done",
  "dead",
  "expired",
  "cancelled",
] as const;
export type QueueExpectation = {
  counts: Partial<Record<(typeof queueCountKeys)[number], number>>;
  maxRejected: number;
  maxRetries: number;
};
export type QueueScenario = {
  id: string;
  name: string;
  steps: QueueStep[];
  expect: QueueExpectation | null;
};
export type QueueProject = {
  kind: "rsswag-queue-project";
  version: 1;
  name: string;
  definition: QueueDefinition;
  scenarios: QueueScenario[];
};
export function normalizeQueueScenario(v: unknown): QueueScenario {
  if (!queueObject(v) || !queueId(v.id) || !queueName(v.name))
    throw new QueueError("definition");
  let expect: QueueExpectation | null = null;
  if (v.expect !== null) {
    const e = v.expect;
    if (
      !queueObject(e) ||
      !queueObject(e.counts) ||
      !queueInt(e.maxRejected, 0, 400) ||
      !queueInt(e.maxRetries, 0, 4000) ||
      Object.keys(e.counts).some(
        (k) => !queueCountKeys.includes(k as (typeof queueCountKeys)[number]),
      )
    )
      throw new QueueError("definition");
    const counts = Object.fromEntries(
      Object.entries(e.counts).map(([k, n]) => {
        if (!queueInt(n, 0, 100)) throw new QueueError("definition");
        return [k, n];
      }),
    );
    expect = { counts, maxRejected: e.maxRejected, maxRetries: e.maxRetries };
  }
  return {
    id: v.id,
    name: v.name,
    steps: queueList(v.steps, 400).map(normalizeQueueStep),
    expect,
  };
}
export function normalizeQueueProject(v: unknown): QueueProject {
  if (
    !queueObject(v) ||
    v.kind !== "rsswag-queue-project" ||
    v.version !== 1 ||
    !queueName(v.name)
  )
    throw new QueueError("definition");
  const definition = normalizeQueueDefinition(v.definition),
    scenarios = queueList(v.scenarios, 12).map(normalizeQueueScenario);
  if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length)
    throw new QueueError("definition");
  const p: QueueProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    definition,
    scenarios,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_QUEUE_PROJECT)
    throw new QueueError("limit");
  return p;
}
export const parseQueueProject = (source: string) =>
  normalizeQueueProject(queueJson(source));
export function serializeQueueProject(p: QueueProject) {
  const value = normalizeQueueProject(p),
    pretty = JSON.stringify(value, null, 2);
  return getByteSize(pretty) <= MAX_QUEUE_PROJECT
    ? pretty
    : JSON.stringify(value);
}
export const newQueueScenario = (id = "case-1"): QueueScenario => ({
  id,
  name: id,
  steps: [],
  expect: null,
});
export const emptyQueueProject = (): QueueProject => ({
  kind: "rsswag-queue-project",
  version: 1,
  name: "Background-job rehearsal",
  definition: newQueueDefinition(),
  scenarios: [newQueueScenario()],
});
