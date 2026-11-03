import {
  MAX_QUEUE_TIME,
  QueueError,
  normalizeQueueDefinition,
  normalizeQueueStep,
  queueId,
  type QueueDefinition,
  type QueueSnapshot,
  type QueueJob,
  type QueueStep,
  type QueueDecision,
  type QueueJournal,
} from "./queue-model";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const queueActive = (j: QueueJob) =>
  j.status === "queued" || j.status === "leased";
export function summarizeQueue(s: QueueSnapshot) {
  const counts = {
      ready: 0,
      delayed: 0,
      leased: 0,
      done: 0,
      dead: 0,
      expired: 0,
      cancelled: 0,
    },
    ages: number[] = [];
  for (const j of s.jobs) {
    if (j.status === "queued") {
      if (j.availableMs <= s.nowMs) {
        counts.ready++;
        ages.push(s.nowMs - j.availableMs);
      } else counts.delayed++;
    } else counts[j.status]++;
  }
  return {
    nowMs: s.nowMs,
    retained: s.jobs.length,
    commands: s.commands,
    ...counts,
    oldestReadyAgeMs: ages.length ? Math.max(...ages) : 0,
    journalDropped: s.journalDropped,
    metrics: { ...s.metrics },
  };
}
export function createJobQueue(value: QueueDefinition, instanceId: string) {
  const d = normalizeQueueDefinition(value);
  if (!queueId(instanceId)) throw new QueueError("definition");
  let state: QueueSnapshot = {
    instanceId,
    nowMs: 0,
    sequence: 0,
    deliveries: 0,
    commands: 0,
    jobs: [],
    metrics: {
      enqueued: 0,
      duplicates: 0,
      leased: 0,
      acked: 0,
      retried: 0,
      dead: 0,
      expired: 0,
      cancelled: 0,
      redriven: 0,
      purged: 0,
      rejected: 0,
    },
    journal: [],
    journalDropped: 0,
    journalSequence: 0,
  };
  function time(n: number) {
    if (n > MAX_QUEUE_TIME) throw new QueueError("clock");
    return n;
  }
  function event(
    s: QueueSnapshot,
    type: string,
    job: QueueJob | null,
    reason: string,
    worker: string | null = null,
    receipt: string | null = null,
  ) {
    s.journal.push({
      sequence: ++s.journalSequence,
      command: s.commands,
      atMs: s.nowMs,
      type,
      job: job?.id ?? null,
      worker,
      receipt,
      reason,
    });
    if (s.journal.length > 2000) {
      s.journal.shift();
      s.journalDropped++;
    }
  }
  function failJob(s: QueueSnapshot, j: QueueJob, reason: string) {
    const lease = j.lease!;
    j.lease = null;
    if (j.attempts >= d.maxAttempts) {
      j.status = "dead";
      s.metrics.dead++;
      event(s, "dead", j, reason, lease.worker, lease.receipt);
    } else {
      j.status = "queued";
      j.availableMs = time(
        s.nowMs + Math.min(d.maxBackoffMs, d.backoffMs * 2 ** (j.attempts - 1)),
      );
      s.metrics.retried++;
      event(s, "retry", j, reason, lease.worker, lease.receipt);
    }
  }
  function advance(s: QueueSnapshot, target: number) {
    while (true) {
      let next = Infinity;
      for (const j of s.jobs)
        if (queueActive(j)) {
          next = Math.min(next, j.expiresMs);
          if (j.lease) next = Math.min(next, j.lease.untilMs);
        }
      if (next > target) break;
      s.nowMs = next;
      for (const j of s.jobs)
        if (queueActive(j) && j.expiresMs <= next) {
          const lease = j.lease;
          j.status = "expired";
          j.lease = null;
          s.metrics.expired++;
          event(s, "expired", j, "retention", lease?.worker, lease?.receipt);
        }
      for (const j of s.jobs)
        if (j.lease && j.lease.untilMs <= next) failJob(s, j, "lease-expired");
    }
    s.nowMs = target;
  }
  function execute(s: QueueSnapshot, step: QueueStep): QueueDecision {
    const result = (
      accepted: boolean,
      reason: string,
      jobs: QueueJob[] = [],
    ): QueueDecision => {
      if (!accepted) s.metrics.rejected++;
      event(
        s,
        step.type,
        "job" in step && typeof step.job === "string"
          ? (s.jobs.find((j) => j.id === step.job) ?? null)
          : null,
        reason,
        "worker" in step ? step.worker : null,
        "receipt" in step ? step.receipt : null,
      );
      return { accepted, reason, jobs };
    };
    if (step.type === "advance") {
      advance(s, time(s.nowMs + step.ms));
      return result(true, "advanced");
    }
    if (step.type === "enqueue") {
      const old = s.jobs.find((j) => j.id === step.job.id);
      if (old) {
        const input = {
          id: old.id,
          name: old.name,
          group: old.group,
          priority: old.priority,
          delayMs: old.delayMs,
          payload: old.payload,
        };
        if (JSON.stringify(input) !== JSON.stringify(step.job))
          return result(false, "conflict");
        s.metrics.duplicates++;
        return result(true, "duplicate", [old]);
      }
      if (s.jobs.length >= d.capacity) return result(false, "capacity");
      const job: QueueJob = {
        ...step.job,
        sequence: ++s.sequence,
        createdMs: s.nowMs,
        availableMs: time(s.nowMs + step.job.delayMs),
        expiresMs: time(s.nowMs + d.retentionMs),
        status: "queued",
        attempts: 0,
        deliveries: 0,
        lease: null,
      };
      s.jobs.push(job);
      s.metrics.enqueued++;
      event(s, "queued", job, "enqueued");
      return result(true, "enqueued", [job]);
    }
    if (step.type === "poll") {
      const held = s.jobs.filter((j) => j.lease?.worker === step.worker).length,
        slots = Math.min(step.limit, Math.max(0, d.perWorker - held)),
        jobs: QueueJob[] = [];
      for (let i = 0; i < slots; i++) {
        const ready = s.jobs
          .filter(
            (j) =>
              j.status === "queued" &&
              j.availableMs <= s.nowMs &&
              (!d.serialGroups ||
                !j.group ||
                !s.jobs.some(
                  (other) =>
                    other.group === j.group &&
                    queueActive(other) &&
                    other.sequence < j.sequence,
                )),
          )
          .sort(
            (a, b) =>
              (d.order === "priority" ? b.priority - a.priority : 0) ||
              a.sequence - b.sequence,
          );
        const j = ready[0];
        if (!j) break;
        j.status = "leased";
        j.attempts++;
        j.deliveries++;
        j.lease = {
          worker: step.worker,
          receipt: `${instanceId}:${++s.deliveries}`,
          untilMs: time(Math.min(s.nowMs + d.visibilityMs, j.expiresMs)),
        };
        s.metrics.leased++;
        jobs.push(j);
        event(s, "leased", j, "delivery", step.worker, j.lease.receipt);
      }
      return result(
        true,
        jobs.length ? "leased" : slots ? "empty" : "worker-full",
        jobs,
      );
    }
    if (step.type === "purge") {
      const count = s.jobs.filter((j) => !queueActive(j)).length;
      s.jobs = s.jobs.filter(queueActive);
      s.metrics.purged += count;
      return result(true, "purged");
    }
    const j = s.jobs.find((j) => j.id === step.job);
    if (!j) return result(false, "missing");
    if (step.type === "cancel") {
      if (!queueActive(j)) return result(false, "terminal");
      j.status = "cancelled";
      j.lease = null;
      s.metrics.cancelled++;
      return result(true, "cancelled", [j]);
    }
    if (step.type === "redrive") {
      if (j.status !== "dead") return result(false, "not-dead");
      j.status = "queued";
      j.attempts = 0;
      j.sequence = ++s.sequence;
      j.availableMs = time(s.nowMs + step.delayMs);
      j.expiresMs = time(s.nowMs + d.retentionMs);
      s.metrics.redriven++;
      return result(true, "redriven", [j]);
    }
    if (
      !j.lease ||
      j.lease.worker !== step.worker ||
      j.lease.receipt !== step.receipt ||
      j.lease.untilMs <= s.nowMs
    )
      return result(false, "stale");
    if (step.type === "ack") {
      j.status = "done";
      j.lease = null;
      s.metrics.acked++;
      return result(true, "acked", [j]);
    }
    if (step.type === "nack") {
      failJob(s, j, "nack");
      return result(true, j.status === "dead" ? "dead" : "retry", [j]);
    }
    j.lease.untilMs = time(Math.min(s.nowMs + d.visibilityMs, j.expiresMs));
    return result(true, "extended", [j]);
  }
  return {
    apply(input: unknown) {
      const step = normalizeQueueStep(input);
      if (state.commands >= 400) throw new QueueError("limit");
      const next = clone(state);
      next.commands++;
      const decision = execute(next, step);
      state = next;
      return clone(decision);
    },
    snapshot: () => clone(state),
    summary: () => summarizeQueue(state),
  };
}
export type JobQueue = ReturnType<typeof createJobQueue>;
export type { QueueJournal };
