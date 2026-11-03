import { describe, expect, it } from "vitest";
import { createJobQueue } from "./queue-engine";
import {
  MAX_QUEUE_SPAN,
  MAX_QUEUE_TIME,
  newQueueDefinition,
  newQueueInput,
  normalizeQueueValue,
  type QueueDefinition,
} from "./queue-model";
const make = (extra: Partial<QueueDefinition> = {}) =>
  createJobQueue({ ...newQueueDefinition(), ...extra }, "test");
const enqueue = (
  q: ReturnType<typeof make>,
  id = "job-1",
  extra: Partial<ReturnType<typeof newQueueInput>> = {},
) => q.apply({ type: "enqueue", job: { ...newQueueInput(id), ...extra } });
const poll = (q: ReturnType<typeof make>, worker = "worker-a", limit = 1) =>
  q.apply({ type: "poll", worker, limit });
const advance = (q: ReturnType<typeof make>, ms: number) =>
  q.apply({ type: "advance", ms });
const leaseAction = (
  q: ReturnType<typeof make>,
  type: "ack" | "nack" | "heartbeat",
  receipt = "test:1",
  job = "job-1",
  worker = "worker-a",
) => q.apply({ type, job, worker, receipt });
describe("deterministic job queues and worker leases", () => {
  it("bounds the journal honestly while retaining aggregate metrics and monotonic event numbers", () => {
    const q = make({
      maxAttempts: 10,
      visibilityMs: 1,
      backoffMs: 0,
      perWorker: 16,
    });
    for (let i = 0; i < 100; i++) enqueue(q, `job-${i}`);
    for (let cycle = 0; cycle < 10; cycle++) {
      for (let w = 0; w < 7; w++) poll(q, `worker-${w}`, 16);
      advance(q, 1);
    }
    const s = q.snapshot();
    expect(s.journal).toHaveLength(2000);
    expect(s.journalDropped).toBeGreaterThan(0);
    expect(s.journal[0].sequence).toBe(s.journalDropped + 1);
    expect(s.journal.at(-1)!.sequence).toBe(s.journalSequence);
    expect(q.summary()).toMatchObject({
      dead: 100,
      metrics: { leased: 1000, retried: 900, dead: 100 },
    });
  });
  it("orders eligible FIFO and priority jobs with stable ties and no preemption", () => {
    for (const order of ["fifo", "priority"] as const) {
      const q = make({ order, perWorker: 3 });
      enqueue(q, "first", { priority: 0 });
      enqueue(q, "high", { priority: 10 });
      enqueue(q, "tie", { priority: 10 });
      enqueue(q, "delayed", { priority: 100, delayMs: 1 });
      expect(poll(q, "worker-a", 3).jobs.map((j) => j.id)).toEqual(
        order === "fifo" ? ["first", "high", "tie"] : ["high", "tie", "first"],
      );
      advance(q, 1);
      expect(poll(q, "worker-b").jobs[0].id).toBe("delayed");
      expect(q.summary().leased).toBe(4);
    }
  });
  it("enforces independent worker limits, returns empty polls and counts attempts only on delivery", () => {
    const q = make({ perWorker: 1 });
    enqueue(q);
    enqueue(q, "two");
    expect(poll(q).jobs).toHaveLength(1);
    expect(poll(q)).toMatchObject({
      accepted: true,
      reason: "worker-full",
      jobs: [],
    });
    expect(poll(q, "worker-b").jobs).toHaveLength(1);
    expect(poll(q, "worker-c")).toMatchObject({ reason: "empty" });
    expect(q.snapshot().jobs.map((j) => j.attempts)).toEqual([1, 1]);
  });
  it("serializes group heads including delayed/retrying heads while allowing other groups", () => {
    const q = make({ serialGroups: true, order: "priority", perWorker: 4 });
    enqueue(q, "head", { group: "one", delayMs: 10 });
    enqueue(q, "later", { group: "one", priority: 100 });
    enqueue(q, "independent", { group: "two" });
    expect(poll(q, "worker-a", 4).jobs.map((j) => j.id)).toEqual([
      "independent",
    ]);
    advance(q, 10);
    expect(poll(q).jobs[0].id).toBe("head");
    leaseAction(q, "nack", "test:2", "head");
    expect(poll(q)).toMatchObject({ reason: "empty" });
    advance(q, 100);
    expect(poll(q).jobs[0].id).toBe("head");
    leaseAction(q, "ack", "test:3", "head");
    expect(poll(q).jobs[0].id).toBe("later");
  });
  it("settles expirations at their actual deadlines during a large jump, then applies retry delay", () => {
    const q = make();
    enqueue(q);
    poll(q);
    advance(q, 5000);
    const j = q.snapshot().jobs[0];
    expect(j).toMatchObject({
      status: "queued",
      availableMs: 1100,
      attempts: 1,
    });
    expect(q.snapshot().journal.find((e) => e.type === "retry")).toMatchObject({
      atMs: 1000,
      reason: "lease-expired",
    });
    expect(q.summary().oldestReadyAgeMs).toBe(3900);
    expect(leaseAction(q, "ack").reason).toBe("stale");
    expect(poll(q, "worker-b").jobs[0].lease?.receipt).toBe("test:2");
  });
  it("rejects a receipt exactly at its deadline and fences old workers after redelivery", () => {
    const q = make({ backoffMs: 0 });
    enqueue(q);
    poll(q);
    advance(q, 1000);
    expect(leaseAction(q, "ack").accepted).toBe(false);
    poll(q, "worker-b");
    expect(leaseAction(q, "ack", "test:2", "job-1", "worker-a").reason).toBe(
      "stale",
    );
    expect(leaseAction(q, "ack", "test:1", "job-1", "worker-b").reason).toBe(
      "stale",
    );
    expect(leaseAction(q, "ack", "test:2", "job-1", "worker-b").reason).toBe(
      "acked",
    );
  });
  it("extends only live leases and caps them at retention, with retention winning deadline ties", () => {
    const q = make({ retentionMs: 1500 });
    enqueue(q);
    poll(q);
    advance(q, 900);
    leaseAction(q, "heartbeat");
    expect(q.snapshot().jobs[0].lease?.untilMs).toBe(1500);
    advance(q, 600);
    expect(q.snapshot().jobs[0].status).toBe("expired");
    expect(q.summary().metrics.retried).toBe(0);
    expect(leaseAction(q, "heartbeat").reason).toBe("stale");
  });
  it("caps exponential retries, moves exhausted jobs to dead letters and safely redrives a new cycle", () => {
    const q = make({ maxAttempts: 3, backoffMs: 100, maxBackoffMs: 150 });
    enqueue(q);
    poll(q);
    leaseAction(q, "nack");
    expect(q.snapshot().jobs[0].availableMs).toBe(100);
    advance(q, 100);
    poll(q);
    leaseAction(q, "nack", "test:2");
    expect(q.snapshot().jobs[0].availableMs).toBe(250);
    advance(q, 150);
    poll(q);
    expect(leaseAction(q, "nack", "test:3").reason).toBe("dead");
    expect(q.summary()).toMatchObject({
      dead: 1,
      metrics: { dead: 1, retried: 2 },
    });
    q.apply({ type: "redrive", job: "job-1", delayMs: 0 });
    expect(poll(q).jobs[0]).toMatchObject({
      attempts: 1,
      deliveries: 4,
      lease: { receipt: "test:4" },
    });
    expect(leaseAction(q, "ack", "test:1").reason).toBe("stale");
    leaseAction(q, "ack", "test:4");
    expect(q.summary()).toMatchObject({
      done: 1,
      dead: 0,
      metrics: { redriven: 1, dead: 1 },
    });
  });
  it("deduplicates canonical retained input and rejects conflicting ID reuse without overwriting payloads", () => {
    const q = make();
    enqueue(q, "job-1", { payload: { b: 2, a: 1 } });
    expect(enqueue(q, "job-1", { payload: { a: 1, b: 2 } }).reason).toBe(
      "duplicate",
    );
    expect(enqueue(q, "job-1", { payload: { a: 0 } })).toMatchObject({
      accepted: false,
      reason: "conflict",
    });
    expect(q.snapshot().jobs[0].payload).toEqual({ a: 1, b: 2 });
    poll(q);
    leaseAction(q, "ack");
    expect(enqueue(q, "job-1", { payload: { a: 1, b: 2 } }).reason).toBe(
      "duplicate",
    );
  });
  it("counts terminal records against capacity until purge and never purges active jobs or reuses receipts", () => {
    const q = make({ capacity: 1 });
    enqueue(q);
    poll(q);
    leaseAction(q, "ack");
    expect(enqueue(q, "other").reason).toBe("capacity");
    q.apply({ type: "purge" });
    expect(q.summary().metrics.purged).toBe(1);
    enqueue(q);
    expect(poll(q).jobs[0].lease?.receipt).toBe("test:2");
    q.apply({ type: "purge" });
    expect(q.summary().leased).toBe(1);
  });
  it("cancels in-flight jobs and refuses invalid redrive/terminal transitions", () => {
    const q = make();
    enqueue(q);
    poll(q);
    expect(q.apply({ type: "cancel", job: "job-1" }).reason).toBe("cancelled");
    expect(leaseAction(q, "ack").reason).toBe("stale");
    expect(q.apply({ type: "cancel", job: "job-1" }).reason).toBe("terminal");
    expect(q.apply({ type: "redrive", job: "job-1", delayMs: 0 }).reason).toBe(
      "not-dead",
    );
    expect(q.apply({ type: "cancel", job: "missing" }).reason).toBe("missing");
  });
  it("expires never-delivered traffic, releases group heads and retains terminal records for inspection", () => {
    const q = make({ retentionMs: 1000, serialGroups: true });
    enqueue(q, "head", { delayMs: 1000, group: "group" });
    advance(q, 1);
    enqueue(q, "tail", { group: "group" });
    advance(q, 999);
    expect(q.summary().expired).toBe(1);
    expect(poll(q).jobs[0].id).toBe("tail");
  });
  it("defensively snapshots inputs, decisions and state, and leaves invalid/over-limit commands atomic", () => {
    const d = newQueueDefinition(),
      q = createJobQueue(d, "safe"),
      job = newQueueInput();
    job.payload = { nested: { value: 1 } };
    q.apply({ type: "enqueue", job });
    d.maxAttempts = 1;
    (job.payload as { nested: { value: number } }).nested.value = 9;
    expect(q.snapshot().jobs[0].payload).toEqual({ nested: { value: 1 } });
    const s = q.snapshot();
    s.jobs[0].payload = "changed";
    s.metrics.enqueued = 999;
    expect(q.snapshot().jobs[0].payload).not.toBe("changed");
    const before = q.snapshot();
    expect(() => q.apply({ type: "advance", ms: -1 })).toThrow("step");
    expect(q.snapshot()).toEqual(before);
    const response = poll(q);
    response.jobs[0].lease!.receipt = "leaked";
    expect(q.snapshot().jobs[0].lease?.receipt).toBe("safe:1");
    advance(q, 1000);
    expect(q.snapshot().jobs[0].status).toBe("queued");
    for (let i = q.snapshot().commands; i < 400; i++)
      q.apply({ type: "purge" });
    const full = q.snapshot();
    expect(() => q.apply({ type: "purge" })).toThrow("limit");
    expect(q.snapshot()).toEqual(full);
  });
  it("rejects clock overflow before publication", () => {
    const capped = make({ retentionMs: 100, visibilityMs: 1000 });
    for (let i = 0; i < 128; i++) advance(capped, MAX_QUEUE_SPAN);
    advance(capped, MAX_QUEUE_TIME - capped.summary().nowMs - 100);
    enqueue(capped);
    expect(poll(capped).jobs[0].lease?.untilMs).toBe(MAX_QUEUE_TIME);
    expect(leaseAction(capped, "heartbeat").jobs[0].lease?.untilMs).toBe(
      MAX_QUEUE_TIME,
    );
    advance(capped, 100);
    expect(capped.summary()).toMatchObject({
      expired: 1,
      metrics: { retried: 0 },
    });
    const q = make();
    for (let i = 0; i < 128; i++) advance(q, MAX_QUEUE_SPAN);
    advance(q, MAX_QUEUE_TIME - q.summary().nowMs);
    const before = q.snapshot();
    expect(() => enqueue(q)).toThrow("clock");
    expect(q.snapshot()).toEqual(before);
    expect(() => advance(q, 1)).toThrow("clock");
    expect(q.snapshot()).toEqual(before);
  });
  it("rejects malformed/deep/sparse/oversized payloads and prototype objects", () => {
    for (const v of [NaN, Infinity, undefined, new Date(), new Array(2)])
      expect(() => normalizeQueueValue(v)).toThrow();
    expect(() => normalizeQueueValue("x".repeat(4097))).toThrow("limit");
    const v = JSON.parse('{"__proto__":{"safe":true}}');
    expect(JSON.stringify(normalizeQueueValue(v))).toContain("__proto__");
    expect(({} as { safe?: boolean }).safe).toBeUndefined();
  });
});
