import { getByteSize } from "./text-encoding";
export const MAX_QUEUE_PROJECT = 2 * 1024 * 1024,
  MAX_QUEUE_TIME = 1_000_000_000_000,
  MAX_QUEUE_SPAN = 90 * 86400000;
export type QueueJson =
  null | boolean | number | string | QueueJson[] | { [key: string]: QueueJson };
export type QueueDefinition = {
  name: string;
  order: "fifo" | "priority";
  serialGroups: boolean;
  capacity: number;
  perWorker: number;
  visibilityMs: number;
  retentionMs: number;
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
};
export type QueueInput = {
  id: string;
  name: string;
  group: string;
  priority: number;
  delayMs: number;
  payload: QueueJson;
};
export type QueueStep =
  | { type: "enqueue"; job: QueueInput }
  | { type: "poll"; worker: string; limit: number }
  | {
      type: "ack" | "nack" | "heartbeat";
      job: string;
      worker: string;
      receipt: string;
    }
  | { type: "advance"; ms: number }
  | { type: "cancel"; job: string }
  | { type: "redrive"; job: string; delayMs: number }
  | { type: "purge" };
export type QueueStatus =
  "queued" | "leased" | "done" | "dead" | "expired" | "cancelled";
export type QueueJob = QueueInput & {
  sequence: number;
  createdMs: number;
  availableMs: number;
  expiresMs: number;
  status: QueueStatus;
  attempts: number;
  deliveries: number;
  lease: null | { worker: string; receipt: string; untilMs: number };
};
export type QueueMetrics = Record<
  | "enqueued"
  | "duplicates"
  | "leased"
  | "acked"
  | "retried"
  | "dead"
  | "expired"
  | "cancelled"
  | "redriven"
  | "purged"
  | "rejected",
  number
>;
export type QueueJournal = {
  sequence: number;
  command: number;
  atMs: number;
  type: string;
  job: string | null;
  worker: string | null;
  receipt: string | null;
  reason: string;
};
export type QueueSnapshot = {
  instanceId: string;
  nowMs: number;
  sequence: number;
  deliveries: number;
  commands: number;
  jobs: QueueJob[];
  metrics: QueueMetrics;
  journal: QueueJournal[];
  journalDropped: number;
  journalSequence: number;
};
export type QueueDecision = {
  accepted: boolean;
  reason: string;
  jobs: QueueJob[];
};
export class QueueError extends Error {
  constructor(
    public code:
      "json" | "definition" | "step" | "limit" | "clock" | "cancelled",
  ) {
    super(code);
    this.name = "QueueError";
  }
}
export const queueObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const queueInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const queueText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const queueId = (v: unknown): v is string =>
  queueText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
export const queueName = (v: unknown): v is string =>
  queueText(v, 120) && !!v.trim();
export function queueList(v: unknown, max: number) {
  if (!Array.isArray(v) || v.length > max) throw new QueueError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new QueueError("step");
  return v as unknown[];
}
export function queueJson(source: string, max = MAX_QUEUE_PROJECT): unknown {
  if (getByteSize(source) > max) throw new QueueError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new QueueError("json");
  }
}
export function normalizeQueueValue(input: unknown): QueueJson {
  let nodes = 0;
  function visit(v: unknown, depth: number): QueueJson {
    if (depth > 12 || ++nodes > 512) throw new QueueError("limit");
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v))
      return Object.is(v, -0) ? 0 : v;
    if (Array.isArray(v))
      return queueList(v, 512).map((x) => visit(x, depth + 1));
    if (queueObject(v)) {
      const proto = Object.getPrototypeOf(v);
      if (proto === null || Object.getPrototypeOf(proto) === null)
        return Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, visit(v[k], depth + 1)]),
        );
    }
    throw new QueueError("step");
  }
  const result = visit(input, 0);
  if (getByteSize(JSON.stringify(result)) > 4096) throw new QueueError("limit");
  return result;
}
export function normalizeQueueDefinition(v: unknown): QueueDefinition {
  if (
    !queueObject(v) ||
    !queueName(v.name) ||
    !["fifo", "priority"].includes(v.order as string) ||
    typeof v.serialGroups !== "boolean" ||
    !queueInt(v.capacity, 1, 100) ||
    !queueInt(v.perWorker, 1, 16) ||
    !queueInt(v.visibilityMs, 1, 86400000) ||
    !queueInt(v.retentionMs, 1, MAX_QUEUE_SPAN) ||
    !queueInt(v.maxAttempts, 1, 10) ||
    !queueInt(v.backoffMs, 0, 86400000) ||
    !queueInt(v.maxBackoffMs, v.backoffMs, 86400000)
  )
    throw new QueueError("definition");
  return {
    name: v.name,
    order: v.order as QueueDefinition["order"],
    serialGroups: v.serialGroups,
    capacity: v.capacity,
    perWorker: v.perWorker,
    visibilityMs: v.visibilityMs,
    retentionMs: v.retentionMs,
    maxAttempts: v.maxAttempts,
    backoffMs: v.backoffMs,
    maxBackoffMs: v.maxBackoffMs,
  };
}
export function normalizeQueueInput(v: unknown): QueueInput {
  if (
    !queueObject(v) ||
    !queueId(v.id) ||
    !queueName(v.name) ||
    !queueText(v.group, 80) ||
    !queueInt(v.priority, -100, 100) ||
    !queueInt(v.delayMs, 0, MAX_QUEUE_SPAN)
  )
    throw new QueueError("step");
  return {
    id: v.id,
    name: v.name,
    group: v.group,
    priority: v.priority,
    delayMs: v.delayMs,
    payload: normalizeQueueValue(v.payload),
  };
}
export function normalizeQueueStep(v: unknown): QueueStep {
  if (!queueObject(v)) throw new QueueError("step");
  if (v.type === "enqueue")
    return { type: v.type, job: normalizeQueueInput(v.job) };
  if (v.type === "poll" && queueId(v.worker) && queueInt(v.limit, 1, 16))
    return { type: v.type, worker: v.worker, limit: v.limit };
  if (
    ["ack", "nack", "heartbeat"].includes(v.type as string) &&
    queueId(v.job) &&
    queueId(v.worker) &&
    queueText(v.receipt, 160) &&
    !!v.receipt
  )
    return {
      type: v.type as "ack" | "nack" | "heartbeat",
      job: v.job,
      worker: v.worker,
      receipt: v.receipt,
    };
  if (v.type === "advance" && queueInt(v.ms, 0, MAX_QUEUE_SPAN))
    return { type: v.type, ms: v.ms };
  if (v.type === "cancel" && queueId(v.job))
    return { type: v.type, job: v.job };
  if (
    v.type === "redrive" &&
    queueId(v.job) &&
    queueInt(v.delayMs, 0, MAX_QUEUE_SPAN)
  )
    return { type: v.type, job: v.job, delayMs: v.delayMs };
  if (v.type === "purge") return { type: v.type };
  throw new QueueError("step");
}
export const newQueueDefinition = (): QueueDefinition => ({
  name: "Background jobs",
  order: "fifo",
  serialGroups: false,
  capacity: 100,
  perWorker: 2,
  visibilityMs: 1000,
  retentionMs: 60000,
  maxAttempts: 3,
  backoffMs: 100,
  maxBackoffMs: 1000,
});
export const newQueueInput = (id = "job-1"): QueueInput => ({
  id,
  name: id,
  group: "",
  priority: 0,
  delayMs: 0,
  payload: { task: "send-email" },
});
