import { describe, expect, it } from "vitest";
import { createSaga, sagaResolve } from "./saga-engine";
import {
  defaultSagaFixtures,
  emptySagaProject,
  normalizeSagaDefinition,
  normalizeSagaProject,
  newSagaAction,
  newSagaStep,
  type SagaDefinition,
} from "./saga-model";
import { demoSagaProject } from "./saga-studio";
function demo(id = "happy") {
  const p = demoSagaProject(),
    s = p.scenarios.find((s) => s.id === id)!;
  return { p, s, machine: createSaga(p.definition, s.input, s.fixtures) };
}
function single() {
  const p = emptySagaProject();
  return { d: p.definition, f: defaultSagaFixtures(p.definition) };
}
describe("saga transaction scheduler", () => {
  it("runs dependency-ready writes in parallel, binds typed outputs, and commits without compensation", () => {
    const { machine } = demo();
    machine.apply({ type: "start" });
    expect(machine.snapshot().steps[0].forward).toBe("running");
    machine.apply({ type: "next" });
    const s = machine.snapshot();
    expect(s.clock).toBe(100);
    expect(s.steps.slice(1, 3).map((s) => s.forward)).toEqual([
      "running",
      "running",
    ]);
    expect(s.steps[1].input).toEqual({ orderId: "order" });
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "succeeded",
      clock: 300,
      metrics: {
        forwardAttempts: 4,
        compensationAttempts: 0,
        peakConcurrency: 2,
      },
    });
  });
  it("honors concurrency, backoff and same-timestamp completion before starting dependent work", () => {
    const { p, s } = demo("retry");
    p.definition.concurrency = 1;
    const machine = createSaga(p.definition, s.input, s.fixtures);
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "succeeded",
      clock: 430,
      metrics: { retries: 1, peakConcurrency: 1 },
    });
    expect(
      machine
        .snapshot()
        .journal.filter((j) => j.stepId === "stock" && j.kind === "started")
        .map((j) => j.at),
    ).toEqual([100, 230]);
  });
  it("stops new work, drains in-flight successes, then compensates in reverse completion order", () => {
    const { machine, s } = demo("abort");
    for (const c of s.commands) machine.apply(c);
    expect(machine.summary()).toMatchObject({
      status: "rolled-back",
      clock: 350,
    });
    expect(machine.snapshot().steps[3].forward).toBe("cancelled");
    expect(
      machine
        .snapshot()
        .journal.filter(
          (j) => j.phase === "compensation" && j.kind === "started",
        )
        .map((j) => j.stepId),
    ).toEqual(["payment", "stock", "order"]);
  });
  it("does not retry timeouts or compensate uncertain outcomes until they are explicitly reconciled", () => {
    const { machine } = demo("timeout");
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "blocked",
      clock: 1100,
      uncertain: 1,
      metrics: { retries: 0, compensationAttempts: 0 },
    });
    machine.apply({
      type: "reconcile",
      stepId: "payment",
      phase: "forward",
      outcome: "committed",
      output: { id: "resolved" },
    });
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "rolled-back",
      uncertain: 0,
      uncompensated: 0,
    });
    expect(machine.snapshot().steps[2].compensationInput).toEqual({
      id: "resolved",
    });
  });
  it("reconciles confirmed aborted calls without inventing writes or outputs", () => {
    const { machine } = demo("timeout");
    machine.apply({ type: "run" });
    machine.apply({
      type: "reconcile",
      stepId: "payment",
      phase: "forward",
      outcome: "aborted",
      output: { ignored: true },
    });
    machine.apply({ type: "run" });
    expect(machine.snapshot().steps[2]).toMatchObject({
      forward: "failed",
      compensation: "none",
      output: null,
    });
  });
  it("treats a completion exactly at timeout as known, and global deadline exhaustion as uncertain", () => {
    const { d, f } = single();
    d.deadlineMs = 50;
    d.steps[0].forward.timeoutMs = 50;
    f[0].forward[0].durationMs = 50;
    const exact = createSaga(d, {}, f);
    exact.apply({ type: "run" });
    expect(exact.summary().status).toBe("succeeded");
    f[0].forward[0].durationMs = 51;
    d.steps[0].forward.timeoutMs = 100;
    const late = createSaga(d, {}, f);
    late.apply({ type: "run" });
    expect(late.summary()).toMatchObject({
      status: "blocked",
      clock: 50,
      failure: "deadline",
      uncertain: 1,
    });
  });
  it("continues known compensation failures and supports bounded manual retry cycles with the next fixture", () => {
    const { p, s } = demo("recovery"),
      machine = createSaga(p.definition, s.input, s.fixtures);
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "attention",
      uncompensated: 1,
    });
    expect(machine.snapshot().steps[0].compensation).toBe("succeeded");
    machine.apply({ type: "retry-compensation", stepId: "payment" });
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "rolled-back",
      uncompensated: 0,
    });
    expect(machine.snapshot().steps[2]).toMatchObject({
      recoveryCycles: 1,
      compensationCalls: 3,
    });
  });
  it("blocks on uncertain compensation and resumes after a confirmed rollback", () => {
    const { machine } = demo("unknown-undo");
    machine.apply({ type: "run" });
    expect(machine.summary().status).toBe("blocked");
    expect(machine.snapshot().steps[1].compensation).toBe("pending");
    machine.apply({
      type: "reconcile",
      stepId: "payment",
      phase: "compensation",
      outcome: "committed",
      output: null,
    });
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "rolled-back",
      uncertain: 0,
    });
  });
  it("reports irreversible writes as retained and excludes read operations from rollback", () => {
    const { p, s } = demo("rollback");
    p.definition.steps[0].compensate = null;
    p.definition.steps[1].effect = "read";
    p.definition.steps[1].compensate = null;
    const machine = createSaga(p.definition, s.input, s.fixtures);
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "attention",
      uncompensated: 1,
    });
    expect(machine.snapshot().steps[0].compensation).toBe("retained");
    expect(machine.snapshot().steps[1].compensation).toBe("none");
  });
  it("fails missing bindings before invoking an operation and preserves null, escaped pointers and own JSON keys", () => {
    const { machine } = demo("binding");
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({
      status: "rolled-back",
      metrics: { forwardAttempts: 0 },
    });
    expect(sagaResolve({ "a/b": { "~": null } }, "/a~1b/~0")).toEqual({
      found: true,
      value: null,
    });
    expect(sagaResolve([], "/01").found).toBe(false);
    expect(sagaResolve({}, "/constructor").found).toBe(false);
    const { d, f } = single();
    d.steps[0].forward.input = {
      data: { from: "input", pointer: "/__proto__" },
    };
    const own = createSaga(d, JSON.parse('{"__proto__":{"safe":true}}'), f);
    own.apply({ type: "run" });
    expect(own.snapshot().steps[0].input).toEqual({ data: { safe: true } });
  });
  it("rolls back invalid commands atomically and returns defensive snapshots and sources", () => {
    const { machine } = demo();
    const before = machine.snapshot();
    expect(() => machine.apply({ type: "abort" })).toThrow("command");
    expect(machine.snapshot()).toEqual(before);
    machine.apply({ type: "start" });
    expect(() => machine.apply({ type: "advance", to: -1 })).toThrow();
    machine.apply({ type: "advance", to: 20 });
    expect(machine.summary().clock).toBe(20);
    expect(() => machine.apply({ type: "advance", to: 19 })).toThrow();
    const snapshot = machine.snapshot();
    snapshot.steps[0].output = "tampered";
    expect(machine.snapshot().steps[0].output).toBe(null);
    machine.source().fixtures[0].forward[0].durationMs = 1;
    machine.apply({ type: "run" });
    expect(machine.summary().clock).toBe(300);
  });
  it("rejects cycles, duplicate steps, non-ancestor bindings, invalid references and oversized data", () => {
    const { p } = demo();
    const copy = () => structuredClone(p.definition);
    const cycle = copy();
    cycle.steps[0].dependsOn = ["ship"];
    expect(() => normalizeSagaDefinition(cycle)).toThrow("reference");
    const ref = copy();
    ref.steps[1].forward.input = {
      bad: { from: "step", stepId: "payment", pointer: "" },
    };
    expect(() => normalizeSagaDefinition(ref)).toThrow("reference");
    const dup = copy();
    dup.steps.push(dup.steps[0]);
    expect(() => normalizeSagaDefinition(dup)).toThrow();
    const foreign = copy();
    foreign.steps[0].dependsOn = ["missing"];
    expect(() => normalizeSagaDefinition(foreign)).toThrow();
    const huge = demo().p;
    huge.scenarios[0].input = "x".repeat(4097);
    expect(() => normalizeSagaProject(huge)).toThrow("limit");
    expect(() => createSaga(p.definition, {}, [])).toThrow("reference");
  });
  it("handles zero-duration graphs without timers and bounds commands and recovery cycles", () => {
    const d: SagaDefinition = {
      name: "Zero",
      concurrency: 8,
      deadlineMs: 1,
      steps: Array.from({ length: 20 }, (_, i) => ({
        ...newSagaStep(`s${i}`),
        effect: "read" as const,
        compensate: null,
        forward: newSagaAction(),
      })),
    };
    const f = defaultSagaFixtures(d);
    f.forEach((f) => (f.forward[0].durationMs = 0));
    const machine = createSaga(d, {}, f);
    machine.apply({ type: "run" });
    expect(machine.summary()).toMatchObject({ status: "succeeded", clock: 0 });
    const { p, s } = demo("recovery");
    s.fixtures[2].compensate = [
      { outcome: "failure", durationMs: 1, output: null },
    ];
    const recovery = createSaga(p.definition, s.input, s.fixtures);
    recovery.apply({ type: "run" });
    for (let i = 0; i < 3; i++) {
      recovery.apply({ type: "retry-compensation", stepId: "payment" });
      recovery.apply({ type: "run" });
    }
    expect(() =>
      recovery.apply({ type: "retry-compensation", stepId: "payment" }),
    ).toThrow("command");
  });
});
