import {
  SagaError,
  normalizeSagaCommand,
  normalizeSagaDefinition,
  normalizeSagaFixtures,
  sagaJson,
  sagaInt,
  type SagaDefinition,
  type SagaJson,
  type SagaSnapshot,
  type SagaStepState,
  type SagaAction,
  type SagaCommand,
  type SagaJournal,
} from "./saga-model";

const sagaClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function sagaResolve(
  value: SagaJson,
  pointer: string,
): { found: boolean; value?: SagaJson } {
  if (!pointer) return { found: true, value };
  for (const part of pointer.slice(1).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))
    )
      return { found: false };
    value = (value as Record<string, SagaJson>)[key];
  }
  return { found: true, value };
}
export function summarizeSaga(s: SagaSnapshot, d: SagaDefinition) {
  return {
    status: s.status,
    clock: s.clock,
    failure: s.failure,
    commands: s.commands,
    uncertain: s.steps.filter(
      (s) => s.forward === "unknown" || s.compensation === "unknown",
    ).length,
    uncompensated:
      s.failure === null
        ? 0
        : s.steps.filter(
            (s) =>
              d.steps.find((d) => d.id === s.id)!.effect === "write" &&
              (s.forward === "unknown" ||
                (s.forward === "succeeded" && s.compensation !== "succeeded")),
          ).length,
    metrics: { ...s.metrics },
    steps: s.steps.map((s) => ({
      id: s.id,
      forward: s.forward,
      compensation: s.compensation,
      attempts: s.attempts,
      compensationAttempts: s.compensationAttempts,
      compensationCalls: s.compensationCalls,
      recoveryCycles: s.recoveryCycles,
      reason: s.reason,
    })),
  };
}
export function createSaga(
  definition: SagaDefinition,
  input: unknown,
  fixtures: unknown,
) {
  const d = normalizeSagaDefinition(definition),
    originalInput = sagaJson(input),
    f = normalizeSagaFixtures(fixtures, d),
    commands: SagaCommand[] = [];
  let state: SagaSnapshot = {
    status: "ready",
    clock: 0,
    failure: null,
    commands: 0,
    steps: d.steps.map((s) => ({
      id: s.id,
      forward: "pending",
      compensation: "none",
      attempts: 0,
      compensationAttempts: 0,
      compensationCalls: 0,
      recoveryCycles: 0,
      input: null,
      compensationInput: null,
      output: null,
      completedOrder: 0,
      due: null,
      scheduledOutcome: null,
      scheduledOutput: null,
      reason: null,
    })),
    journal: [],
    metrics: {
      forwardAttempts: 0,
      compensationAttempts: 0,
      retries: 0,
      compensations: 0,
      reconciliations: 0,
      peakConcurrency: 0,
    },
  };
  function journal(
    kind: string,
    step: SagaStepState | null = null,
    phase: SagaJournal["phase"] = "workflow",
    reason: string | null = null,
  ) {
    if (state.journal.length >= 4000) throw new SagaError("limit");
    state.journal.push({
      seq: state.journal.length + 1,
      at: state.clock,
      stepId: step?.id ?? null,
      phase,
      kind,
      attempt: step
        ? phase === "compensation"
          ? step.compensationAttempts
          : step.attempts
        : 0,
      reason,
    });
  }
  function changeStatus(status: SagaSnapshot["status"]) {
    if (state.status !== status) {
      state.status = status;
      journal(status);
    }
  }
  function fail(reason: string) {
    if (state.failure === null) {
      state.failure = reason;
      journal("failure", null, "workflow", reason);
    }
  }
  function fixture(step: SagaStepState, phase: "forward" | "compensation") {
    const attempts = f.find((f) => f.stepId === step.id)![
        phase === "forward" ? "forward" : "compensate"
      ],
      index = phase === "forward" ? step.attempts : step.compensationCalls;
    return attempts[Math.min(index - 1, attempts.length - 1)];
  }
  function resolveInput(action: SagaAction): Record<string, SagaJson> {
    return Object.fromEntries(
      Object.entries(action.input).map(([key, source]) => {
        if (source.from === "literal") return [key, sagaClone(source.value)];
        const step =
          source.from === "step"
            ? state.steps.find((s) => s.id === source.stepId)
            : null;
        if (source.from === "step" && step?.forward !== "succeeded")
          throw new Error("binding");
        const result = sagaResolve(
          step ? step.output : originalInput,
          source.pointer,
        );
        if (!result.found) throw new Error("binding");
        return [key, sagaClone(result.value!)];
      }),
    );
  }
  function launch(step: SagaStepState, phase: "forward" | "compensation") {
    const action =
      phase === "forward"
        ? d.steps.find((d) => d.id === step.id)!.forward
        : d.steps.find((d) => d.id === step.id)!.compensate!;
    const inputKey = phase === "forward" ? "input" : "compensationInput";
    if (step[inputKey] === null) {
      try {
        step[inputKey] = resolveInput(action);
      } catch {
        step[phase] = "failed";
        step.reason = "binding";
        step.due = null;
        journal("failed", step, phase, "binding");
        if (phase === "forward") fail("binding");
        return;
      }
    }
    const countKey = phase === "forward" ? "attempts" : "compensationAttempts";
    step[countKey]++;
    step[phase] = "running";
    step.reason = null;
    if (phase === "compensation") step.compensationCalls++;
    state.metrics[
      phase === "forward" ? "forwardAttempts" : "compensationAttempts"
    ]++;
    if (step[countKey] > 1) state.metrics.retries++;
    const attempt = fixture(step, phase),
      timeout = attempt.durationMs > action.timeoutMs;
    step.due = state.clock + Math.min(attempt.durationMs, action.timeoutMs);
    step.scheduledOutcome = timeout ? "unknown" : attempt.outcome;
    step.scheduledOutput =
      step.scheduledOutcome === "success" ? sagaClone(attempt.output) : null;
    if (phase === "forward")
      state.metrics.peakConcurrency = Math.max(
        state.metrics.peakConcurrency,
        state.steps.filter((s) => s.forward === "running").length,
      );
    journal("started", step, phase);
  }
  function complete(step: SagaStepState, phase: "forward" | "compensation") {
    const outcome = step.scheduledOutcome!,
      output = step.scheduledOutput,
      spec = d.steps.find((d) => d.id === step.id)!,
      action = phase === "forward" ? spec.forward : spec.compensate!,
      count = phase === "forward" ? step.attempts : step.compensationAttempts;
    step.due = null;
    step.scheduledOutcome = null;
    step.scheduledOutput = null;
    if (outcome === "success") {
      step[phase] = "succeeded";
      step.reason = null;
      if (phase === "forward") {
        step.output = output;
        step.completedOrder =
          Math.max(0, ...state.steps.map((s) => s.completedOrder)) + 1;
      } else state.metrics.compensations++;
      journal("succeeded", step, phase);
      return;
    }
    step.reason =
      outcome === "unknown"
        ? fixture(step, phase).durationMs > action.timeoutMs
          ? "timeout"
          : "unknown"
        : "failure";
    if (
      outcome === "failure" &&
      count < action.attempts &&
      (phase === "compensation" || state.failure === null)
    ) {
      step[phase] = "retry-wait";
      step.due = state.clock + action.backoffMs;
      journal("retry-wait", step, phase, step.reason);
      return;
    }
    step[phase] = outcome === "unknown" ? "unknown" : "failed";
    journal(step[phase], step, phase, step.reason);
    if (phase === "forward") fail(step.reason);
  }
  function settle() {
    for (let turn = 0; turn < 4000; turn++) {
      const due = state.steps.filter(
        (s) =>
          (s.forward === "running" || s.compensation === "running") &&
          s.due! <= state.clock,
      );
      if (due.length) {
        // At equal timestamps all started calls finish in definition order before any new calls launch.
        for (const step of due)
          complete(
            step,
            step.compensation === "running" ? "compensation" : "forward",
          );
        continue;
      }
      if (
        state.failure === null &&
        state.clock >= d.deadlineMs &&
        state.steps.some((s) => s.forward !== "succeeded")
      ) {
        fail("deadline");
        for (const s of state.steps.filter((s) => s.forward === "running")) {
          s.forward = "unknown";
          s.reason = "deadline";
          s.due = null;
          s.scheduledOutcome = null;
          s.scheduledOutput = null;
          journal("unknown", s, "forward", "deadline");
        }
      }
      if (state.failure === null) {
        if (state.steps.every((s) => s.forward === "succeeded")) {
          changeStatus("succeeded");
          return;
        }
        let launched = false;
        for (const s of state.steps) {
          if (
            state.steps.filter((s) => s.forward === "running").length >=
              d.concurrency ||
            state.failure !== null
          )
            break;
          const spec = d.steps.find((d) => d.id === s.id)!;
          if (
            (s.forward === "retry-wait" && s.due! <= state.clock) ||
            (s.forward === "pending" &&
              spec.dependsOn.every(
                (id) =>
                  state.steps.find((s) => s.id === id)!.forward === "succeeded",
              ))
          ) {
            launch(s, "forward");
            launched = true;
          }
        }
        if (launched) continue;
        return;
      }
      for (const s of state.steps.filter(
        (s) => s.forward === "pending" || s.forward === "retry-wait",
      )) {
        s.forward = "cancelled";
        s.due = null;
        journal("cancelled", s, "forward");
      }
      if (state.steps.some((s) => s.forward === "running")) {
        changeStatus("draining");
        return;
      }
      if (
        state.steps.some(
          (s) => s.forward === "unknown" || s.compensation === "unknown",
        )
      ) {
        changeStatus("blocked");
        return;
      }
      for (const s of state.steps) {
        const spec = d.steps.find((d) => d.id === s.id)!;
        if (
          s.forward === "succeeded" &&
          spec.effect === "write" &&
          s.compensation === "none"
        )
          s.compensation = spec.compensate ? "pending" : "retained";
      }
      const next = state.steps
        .filter((s) =>
          ["pending", "running", "retry-wait"].includes(s.compensation),
        )
        .sort((a, b) => b.completedOrder - a.completedOrder)[0];
      if (!next) {
        changeStatus(
          state.steps.some(
            (s) => s.compensation === "failed" || s.compensation === "retained",
          )
            ? "attention"
            : "rolled-back",
        );
        return;
      }
      changeStatus("compensating");
      if (
        next.compensation === "pending" ||
        (next.compensation === "retry-wait" && next.due! <= state.clock)
      ) {
        launch(next, "compensation");
        continue;
      }
      return;
    }
    throw new SagaError("limit");
  }
  const active = () =>
    ["running", "draining", "compensating"].includes(state.status);
  function nextTime() {
    const available =
      state.steps.filter((s) => s.forward === "running").length < d.concurrency;
    const times = state.steps
      .filter(
        (s) =>
          s.due !== null &&
          (s.forward === "running" ||
            s.compensation === "running" ||
            s.compensation === "retry-wait" ||
            (s.forward === "retry-wait" && available)),
      )
      .map((s) => Math.max(state.clock, s.due!));
    if (state.failure === null && state.status === "running")
      times.push(d.deadlineMs);
    return times.length ? Math.min(...times) : null;
  }
  function start() {
    if (state.status !== "ready") throw new SagaError("command");
    changeStatus("running");
    settle();
  }
  function move(to: number) {
    if (!sagaInt(to, state.clock, 60000000) || !active())
      throw new SagaError("command");
    for (let turn = 0; turn < 4000; turn++) {
      const next = nextTime();
      if (!active()) return;
      if (next === null || next > to) {
        state.clock = to;
        settle();
        return;
      }
      state.clock = next;
      settle();
      if (state.clock === to) return;
    }
    throw new SagaError("limit");
  }
  function execute(command: SagaCommand) {
    if (command.type === "start") {
      start();
      return;
    }
    if (command.type === "run" || command.type === "next") {
      if (state.status === "ready") start();
      else if (!active()) throw new SagaError("command");
      if (command.type === "next") {
        const next = nextTime();
        if (active() && next !== null) move(next);
        return;
      }
      for (let turn = 0; turn < 4000 && active(); turn++) {
        const next = nextTime();
        if (next === null) throw new SagaError("command");
        move(next);
      }
      if (active()) throw new SagaError("limit");
      return;
    }
    if (command.type === "advance") {
      move(command.to);
      return;
    }
    if (command.type === "abort") {
      if (state.status !== "running") throw new SagaError("command");
      fail("aborted");
      settle();
      return;
    }
    if (!("stepId" in command)) throw new SagaError("command");
    const step = state.steps.find((s) => s.id === command.stepId);
    if (!step) throw new SagaError("reference");
    if (command.type === "reconcile") {
      if (step[command.phase] !== "unknown" || state.status !== "blocked")
        throw new SagaError("command");
      step[command.phase] =
        command.outcome === "committed" ? "succeeded" : "failed";
      step.reason = "reconciled";
      if (command.phase === "forward" && command.outcome === "committed") {
        step.output = sagaClone(command.output);
        step.completedOrder =
          Math.max(0, ...state.steps.map((s) => s.completedOrder)) + 1;
      }
      if (command.phase === "compensation" && command.outcome === "committed")
        state.metrics.compensations++;
      state.metrics.reconciliations++;
      journal(command.outcome, step, command.phase, "reconciled");
      settle();
      return;
    }
    if (command.type === "retry-compensation") {
      if (
        state.status !== "attention" ||
        step.compensation !== "failed" ||
        step.recoveryCycles >= 3
      )
        throw new SagaError("command");
      step.compensation = "pending";
      step.compensationAttempts = 0;
      step.reason = null;
      step.recoveryCycles++;
      journal("recovery", step, "compensation");
      settle();
    }
  }
  return {
    apply(value: unknown) {
      if (commands.length >= 200) throw new SagaError("limit");
      const command = normalizeSagaCommand(value),
        before = state;
      state = sagaClone(state);
      try {
        execute(command);
        state.commands++;
        commands.push(sagaClone(command));
        return summarizeSaga(state, d);
      } catch (error) {
        state = before;
        throw error;
      }
    },
    snapshot: () => sagaClone(state),
    summary: () => summarizeSaga(state, d),
    source: () => sagaClone({ input: originalInput, fixtures: f, commands }),
  };
}
