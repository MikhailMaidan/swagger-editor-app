import { createJobQueue, summarizeQueue } from "./queue-engine";
import {
  normalizeQueueProject,
  emptyQueueProject,
  type QueueProject,
  type QueueScenario,
} from "./queue-project";
import {
  QueueError,
  newQueueInput,
  type QueueSnapshot,
  type QueueStep,
  queueJson,
  queueList,
  queueObject,
  queueInt,
  normalizeQueueInput,
  MAX_QUEUE_PROJECT,
  MAX_QUEUE_SPAN,
} from "./queue-model";
export type QueuePoint = {
  command: number;
  atMs: number;
  accepted: boolean;
  reason: string;
  summary: ReturnType<typeof summarizeQueue>;
};
export function importQueueNdjson(
  source: string,
  id = "case-imported",
): QueueScenario {
  if (new TextEncoder().encode(source).length > MAX_QUEUE_PROJECT)
    throw new QueueError("limit");
  const lines = source
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((s) => s.trim()),
    jobs = queueList(lines, 100).map((line) =>
      normalizeQueueInput(queueJson(line as string)),
    );
  if (!jobs.length || new Set(jobs.map((j) => j.id)).size !== jobs.length)
    throw new QueueError("step");
  return {
    id,
    name: id,
    steps: jobs.map((job) => ({ type: "enqueue", job })),
    expect: null,
  };
}
export function generateQueueScenario(
  value: unknown,
  id = "case-generated",
): QueueScenario {
  if (
    !queueObject(value) ||
    !queueInt(value.count, 1, 100) ||
    !queueInt(value.spacingMs, 0, MAX_QUEUE_SPAN) ||
    !queueInt(value.groupCount, 0, 10)
  )
    throw new QueueError("step");
  if ((value.count - 1) * value.spacingMs > MAX_QUEUE_SPAN)
    throw new QueueError("limit");
  const steps: QueueStep[] = [];
  for (let i = 0; i < value.count; i++) {
    if (i && value.spacingMs)
      steps.push({ type: "advance", ms: value.spacingMs });
    steps.push({
      type: "enqueue",
      job: {
        ...newQueueInput(`generated-${i + 1}`),
        priority: i % 7,
        group: value.groupCount ? `group-${i % value.groupCount}` : "",
        payload: { task: "synthetic", index: i },
      },
    });
  }
  return { id, name: id, steps, expect: null };
}
export type QueueRun = {
  scenarioId: string;
  scenarioName: string;
  checked: boolean;
  passed: boolean;
  summary: ReturnType<typeof summarizeQueue>;
  snapshot: QueueSnapshot;
  timeline: QueuePoint[];
};
export async function runQueueScenarios(
  value: QueueProject,
  id?: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<QueueRun[]> {
  const p = normalizeQueueProject(value),
    cases = id ? p.scenarios.filter((s) => s.id === id) : p.scenarios;
  if (id && !cases.length) throw new QueueError("definition");
  const runs: QueueRun[] = [];
  for (const s of cases) {
    const queue = createJobQueue(p.definition, "replay"),
      timeline: QueuePoint[] = [];
    for (let i = 0; i < s.steps.length; i++) {
      if (cancelled()) throw new QueueError("cancelled");
      const r = queue.apply(s.steps[i]),
        summary = queue.summary();
      timeline.push({
        command: i + 1,
        atMs: summary.nowMs,
        accepted: r.accepted,
        reason: r.reason,
        summary,
      });
      if ((i + 1) % 10 === 0 || i === s.steps.length - 1)
        await new Promise((r) => setTimeout(r, 0));
    }
    const summary = queue.summary(),
      e = s.expect;
    runs.push({
      scenarioId: s.id,
      scenarioName: s.name,
      checked: e !== null,
      passed:
        e !== null &&
        Object.entries(e.counts).every(
          ([k, n]) => summary[k as keyof typeof e.counts] === n,
        ) &&
        summary.metrics.rejected <= e.maxRejected &&
        summary.metrics.retried <= e.maxRetries,
      summary,
      snapshot: queue.snapshot(),
      timeline,
    });
    progress?.(runs.length, cases.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (cancelled()) throw new QueueError("cancelled");
  return runs;
}
export function queueRunReport(runs: QueueRun[], details = false) {
  return {
    kind: "rsswag-queue-report",
    version: 1,
    total: runs.length,
    checked: runs.filter((r) => r.checked).length,
    passed: runs.filter((r) => r.passed).length,
    runs: runs.map((r) => ({
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      checked: r.checked,
      passed: r.passed,
      summary: r.summary,
      ...(details
        ? {
            timeline: r.timeline,
            journal: r.snapshot.journal.map(
              ({ atMs, command, type, reason }) => ({
                atMs,
                command,
                type,
                reason,
              }),
            ),
            journalDropped: r.snapshot.journalDropped,
          }
        : {}),
    })),
  };
}
const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  // Only strings can carry a formula payload; numbers must stay numeric.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
export function queueTimelineCsv(r: QueueRun) {
  return [
    [
      "scenarioId",
      "command",
      "timeMs",
      "accepted",
      "reason",
      "ready",
      "delayed",
      "leased",
      "done",
      "dead",
      "expired",
      "cancelled",
      "rejected",
      "retried",
    ],
    ...r.timeline.map((p) => [
      r.scenarioId,
      p.command,
      p.atMs,
      p.accepted,
      p.reason,
      p.summary.ready,
      p.summary.delayed,
      p.summary.leased,
      p.summary.done,
      p.summary.dead,
      p.summary.expired,
      p.summary.cancelled,
      p.summary.metrics.rejected,
      p.summary.metrics.retried,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
export function recordQueueScenario(
  id: string,
  name: string,
  steps: QueueStep[],
  instanceId: string,
  snapshot: QueueSnapshot,
): QueueScenario {
  const summary = summarizeQueue(snapshot);
  return {
    id,
    name,
    steps: steps.map((s) =>
      "receipt" in s
        ? {
            ...s,
            receipt: s.receipt.startsWith(instanceId + ":")
              ? "replay:" + s.receipt.slice(instanceId.length + 1)
              : "foreign:" + s.receipt.slice(0, 152),
          }
        : structuredClone(s),
    ),
    expect: {
      counts: {
        ready: summary.ready,
        delayed: summary.delayed,
        leased: summary.leased,
        done: summary.done,
        dead: summary.dead,
        expired: summary.expired,
        cancelled: summary.cancelled,
      },
      maxRejected: summary.metrics.rejected,
      maxRetries: summary.metrics.retried,
    },
  };
}
export function demoQueueProject(): QueueProject {
  const p = emptyQueueProject();
  p.name = "Queue delivery, retry and recovery demonstrations";
  p.definition.order = "priority";
  p.definition.serialGroups = true;
  const enqueue = (
      id: string,
      extra: Partial<ReturnType<typeof newQueueInput>> = {},
    ): QueueStep => ({
      type: "enqueue",
      job: { ...newQueueInput(id), ...extra },
    }),
    poll = (worker = "worker-a", limit = 1): QueueStep => ({
      type: "poll",
      worker,
      limit,
    }),
    act = (
      type: "ack" | "nack" | "heartbeat",
      job: string,
      n: number,
      worker = "worker-a",
    ): QueueStep => ({ type, job, worker, receipt: `replay:${n}` }),
    advance = (ms: number): QueueStep => ({ type: "advance", ms });
  const poison = [
    enqueue("poison"),
    poll(),
    act("nack", "poison", 1),
    advance(100),
    poll(),
    act("nack", "poison", 2),
    advance(200),
    poll(),
    act("nack", "poison", 3),
  ];
  const example = (
    id: string,
    name: string,
    steps: QueueStep[],
    counts: NonNullable<QueueScenario["expect"]>["counts"],
    rejected = 0,
    retries = 0,
  ): QueueScenario => ({
    id,
    name,
    steps,
    expect: { counts, maxRejected: rejected, maxRetries: retries },
  });
  p.scenarios = [
    example(
      "success",
      "Two successful jobs",
      [
        enqueue("one"),
        enqueue("two"),
        poll("worker-a", 2),
        act("ack", "one", 1),
        act("ack", "two", 2),
      ],
      { done: 2, leased: 0, ready: 0 },
    ),
    example(
      "recovery",
      "Worker crash and stale acknowledgement",
      [
        enqueue("recover"),
        poll(),
        advance(1000),
        poll("worker-b"),
        advance(100),
        poll("worker-b"),
        act("ack", "recover", 1),
        act("ack", "recover", 2, "worker-b"),
      ],
      { done: 1, dead: 0 },
      1,
      1,
    ),
    example(
      "poison",
      "Poison job reaches dead-letter storage",
      poison,
      { dead: 1, ready: 0 },
      0,
      2,
    ),
    example(
      "redrive",
      "Repair and redrive a dead-letter job",
      [
        ...poison,
        { type: "redrive", job: "poison", delayMs: 0 },
        poll(),
        act("ack", "poison", 4),
      ],
      { done: 1, dead: 0 },
      0,
      2,
    ),
    example(
      "priority",
      "Higher priority among eligible jobs",
      [
        enqueue("low", { priority: 0 }),
        enqueue("high", { priority: 9 }),
        poll(),
        act("ack", "high", 1),
      ],
      { done: 1, ready: 1 },
    ),
    example(
      "delayed",
      "Delayed job and independent worker slots",
      [
        enqueue("low"),
        enqueue("later", { priority: 10, delayMs: 100 }),
        poll(),
        advance(100),
        poll(),
        act("ack", "later", 2),
        act("ack", "low", 1),
      ],
      { done: 2, delayed: 0 },
    ),
    example(
      "heartbeat",
      "Heartbeat preserves a live receipt",
      [
        enqueue("long"),
        poll(),
        advance(900),
        act("heartbeat", "long", 1),
        advance(100),
        act("ack", "long", 1),
      ],
      { done: 1 },
      0,
      0,
    ),
    example(
      "groups",
      "Serial groups with independent parallel jobs",
      [
        enqueue("a1", { group: "account-a" }),
        enqueue("a2", { group: "account-a" }),
        enqueue("b1", { group: "account-b" }),
        poll("worker-a", 2),
        act("ack", "a1", 1),
        poll(),
        act("ack", "a2", 3),
        act("ack", "b1", 2),
      ],
      { done: 3, ready: 0 },
    ),
    example(
      "retention",
      "Delayed traffic expires without delivery",
      [enqueue("obsolete", { delayMs: 60000 }), advance(60000), poll()],
      { expired: 1, ready: 0 },
    ),
    example(
      "cancel",
      "Cancel in-flight work and refuse late completion",
      [
        enqueue("cancelled"),
        poll(),
        { type: "cancel", job: "cancelled" },
        act("ack", "cancelled", 1),
      ],
      { cancelled: 1, done: 0 },
      1,
    ),
  ];
  return normalizeQueueProject(p);
}
