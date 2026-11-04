import {
  SagaError,
  normalizeSagaProject,
  normalizeSagaDefinition,
  normalizeSagaFixtures,
  defaultSagaFixtures,
  newSagaAction,
  type SagaDefinition,
  type SagaProject,
  type SagaScenario,
  type SagaCommand,
  type SagaSnapshot,
  type SagaExpectation,
  type SagaFixture,
} from "./saga-model";
import { createSaga, sagaResolve, summarizeSaga } from "./saga-engine";

export type SagaPoint = {
  command: number;
  summary: ReturnType<typeof summarizeSaga>;
};
export type SagaRun = {
  scenarioId: string;
  scenarioName: string;
  checked: boolean;
  passed: boolean;
  summary: ReturnType<typeof summarizeSaga>;
  snapshot: SagaSnapshot;
  timeline: SagaPoint[];
  error: string | null;
  checks: {
    kind:
      | "status"
      | "time"
      | "retries"
      | "uncertain"
      | "uncompensated"
      | "step"
      | "output";
    index: number;
    passed: boolean;
  }[];
};
export function sagaExpectation(
  s: SagaSnapshot,
  d: SagaDefinition,
): SagaExpectation {
  const summary = summarizeSaga(s, d);
  return {
    status: s.status,
    maxTimeMs: s.clock,
    maxRetries: s.metrics.retries,
    maxUncertain: summary.uncertain,
    maxUncompensated: summary.uncompensated,
    steps: s.steps.map((s) => ({
      stepId: s.id,
      forward: s.forward,
      compensation: s.compensation,
    })),
    outputs: [],
  };
}
export async function replaySaga(
  d: SagaDefinition,
  scenario: SagaScenario,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
  tolerateCommandErrors = false,
) {
  const p = normalizeSagaProject({
      kind: "rsswag-saga-project",
      version: 1,
      name: "Replay",
      definition: d,
      scenarios: [scenario],
    }),
    s = p.scenarios[0],
    machine = createSaga(p.definition, s.input, s.fixtures),
    timeline: SagaPoint[] = [];
  let error: string | null = null;
  for (let index = 0; index < s.commands.length; index++) {
    if (cancelled()) throw new SagaError("cancelled");
    try {
      const summary = machine.apply(s.commands[index]);
      timeline.push({ command: index + 1, summary });
    } catch (e) {
      if (!tolerateCommandErrors) throw e;
      error = e instanceof SagaError ? e.code : "command";
      break;
    }
    progress?.(index + 1, s.commands.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (cancelled()) throw new SagaError("cancelled");
  return { machine, snapshot: machine.snapshot(), timeline, error };
}
export function checkSaga(
  snapshot: SagaSnapshot,
  definition: SagaDefinition,
  expect: SagaExpectation | null,
): SagaRun["checks"] {
  if (!expect) return [];
  const s = summarizeSaga(snapshot, definition),
    checks: SagaRun["checks"] = [
      { kind: "status", index: 0, passed: s.status === expect.status },
      { kind: "time", index: 0, passed: s.clock <= expect.maxTimeMs },
      {
        kind: "retries",
        index: 0,
        passed: s.metrics.retries <= expect.maxRetries,
      },
      {
        kind: "uncertain",
        index: 0,
        passed: s.uncertain <= expect.maxUncertain,
      },
      {
        kind: "uncompensated",
        index: 0,
        passed: s.uncompensated <= expect.maxUncompensated,
      },
    ];
  expect.steps.forEach((e, index) => {
    const step = snapshot.steps.find((s) => s.id === e.stepId);
    checks.push({
      kind: "step",
      index,
      passed:
        step?.forward === e.forward && step?.compensation === e.compensation,
    });
  });
  expect.outputs.forEach((e, index) => {
    const step = snapshot.steps.find((s) => s.id === e.stepId),
      found =
        step?.forward === "succeeded"
          ? sagaResolve(step.output, e.pointer)
          : { found: false };
    checks.push({
      kind: "output",
      index,
      passed: e.missing
        ? !found.found
        : found.found &&
          JSON.stringify(found.value) === JSON.stringify(e.value),
    });
  });
  return checks;
}
export async function runSagaScenarios(
  value: SagaProject,
  id?: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<SagaRun[]> {
  const p = normalizeSagaProject(value),
    cases = id ? p.scenarios.filter((s) => s.id === id) : p.scenarios;
  if (id && !cases.length) throw new SagaError("reference");
  const runs: SagaRun[] = [];
  for (const scenario of cases) {
    const replay = await replaySaga(
        p.definition,
        scenario,
        cancelled,
        undefined,
        true,
      ),
      checks = checkSaga(replay.snapshot, p.definition, scenario.expect);
    runs.push({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      checked: scenario.expect !== null,
      passed:
        replay.error === null &&
        scenario.expect !== null &&
        checks.every((c) => c.passed),
      error: replay.error,
      checks,
      summary: replay.machine.summary(),
      snapshot: replay.snapshot,
      timeline: replay.timeline,
    });
    progress?.(runs.length, cases.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (cancelled()) throw new SagaError("cancelled");
  return runs;
}
export function sagaReport(runs: SagaRun[], details = false) {
  return JSON.stringify(
    {
      kind: "rsswag-saga-report",
      version: 1,
      runs: runs.map((r) => ({
        scenarioId: r.scenarioId,
        checked: r.checked,
        passed: r.passed,
        error: r.error,
        summary: r.summary,
        checks: r.checks,
        ...(details
          ? { timeline: r.timeline, journal: r.snapshot.journal }
          : {}),
      })),
    },
    null,
    2,
  );
}
export function sagaCsv(runs: SagaRun[]) {
  const cell = (v: string | number | boolean) =>
    `"${String(v)
      .replace(/^[\t\r\n ]*[=+@-]/, "'$&")
      .replace(/"/g, '""')}"`;
  return [
    [
      "scenario",
      "checked",
      "passed",
      "status",
      "timeMs",
      "retries",
      "uncertain",
      "uncompensated",
    ],
    ...runs.map((r) => [
      r.scenarioId,
      r.checked,
      r.passed,
      r.summary.status,
      r.summary.clock,
      r.summary.metrics.retries,
      r.summary.uncertain,
      r.summary.uncompensated,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
export function alignSagaScenario(
  s: SagaScenario,
  definition: SagaDefinition,
): SagaScenario {
  const d = normalizeSagaDefinition(definition),
    defaults = defaultSagaFixtures(d);
  const fixtures = defaults.map((f) => {
    const old = s.fixtures.find((o) => o.stepId === f.stepId);
    return old
      ? {
          ...old,
          compensate: d.steps.find((d) => d.id === f.stepId)!.compensate
            ? old.compensate.length
              ? old.compensate
              : f.compensate
            : [],
        }
      : f;
  });
  return {
    ...s,
    fixtures: normalizeSagaFixtures(fixtures, d),
    commands: s.commands.filter(
      (c) => !("stepId" in c) || d.steps.some((s) => s.id === c.stepId),
    ),
    expect: null,
  };
}
export function demoSagaProject(): SagaProject {
  const operation = (name: string, input = {}) => ({
    ...newSagaAction(name),
    input,
  });
  const definition: SagaDefinition = {
    name: "Order transaction",
    concurrency: 2,
    deadlineMs: 5000,
    steps: [
      {
        id: "order",
        name: "Create order",
        dependsOn: [],
        effect: "write",
        forward: operation("POST /orders", {
          customer: { from: "input", pointer: "/customer" },
        }),
        compensate: operation("DELETE /orders/{id}", {
          id: { from: "step", stepId: "order", pointer: "/id" },
        }),
      },
      {
        id: "stock",
        name: "Reserve stock",
        dependsOn: ["order"],
        effect: "write",
        forward: operation("POST /reservations", {
          orderId: { from: "step", stepId: "order", pointer: "/id" },
        }),
        compensate: operation("DELETE /reservations/{id}", {
          id: { from: "step", stepId: "stock", pointer: "/id" },
        }),
      },
      {
        id: "payment",
        name: "Authorize payment",
        dependsOn: ["order"],
        effect: "write",
        forward: operation("POST /payments", {
          orderId: { from: "step", stepId: "order", pointer: "/id" },
        }),
        compensate: operation("POST /payments/{id}/refund", {
          id: { from: "step", stepId: "payment", pointer: "/id" },
        }),
      },
      {
        id: "ship",
        name: "Arrange shipping",
        dependsOn: ["stock", "payment"],
        effect: "write",
        forward: operation("POST /shipments"),
        compensate: operation("DELETE /shipments/{id}"),
      },
    ],
  };
  function scenario(id: string, name: string): SagaScenario {
    return {
      id,
      name,
      input: { customer: "demo-customer" },
      fixtures: defaultSagaFixtures(definition),
      commands: [{ type: "run" }],
      expect: null,
    };
  }
  const happy = scenario("happy", "Successful parallel checkout"),
    retry = scenario("retry", "Transient failure with a successful retry"),
    rollback = scenario(
      "rollback",
      "Shipping fails and completed writes compensate",
    ),
    timeout = scenario("timeout", "Uncertain payment blocks rollback"),
    recover = scenario(
      "recover",
      "Reconcile a committed payment and compensate",
    ),
    recovery = scenario("recovery", "Retry a failed compensation"),
    abort = scenario("abort", "Cancel while parallel writes are in flight"),
    unknownUndo = scenario(
      "unknown-undo",
      "Reconcile an uncertain compensation",
    ),
    binding = scenario("binding", "Missing input stops the transaction");
  retry.fixtures[1].forward.unshift({
    outcome: "failure",
    durationMs: 30,
    output: null,
  });
  rollback.fixtures[3].forward = [
    { outcome: "failure", durationMs: 20, output: null },
  ];
  for (const s of [timeout, recover])
    s.fixtures[2].forward = [
      { outcome: "success", durationMs: 1500, output: { id: "late-payment" } },
    ];
  recover.commands.push(
    {
      type: "reconcile",
      stepId: "payment",
      phase: "forward",
      outcome: "committed",
      output: { id: "confirmed-payment" },
    },
    { type: "run" },
  );
  recovery.fixtures[3].forward = rollback.fixtures[3].forward;
  recovery.fixtures[2].compensate = [
    { outcome: "failure", durationMs: 10, output: null },
    { outcome: "failure", durationMs: 10, output: null },
    { outcome: "success", durationMs: 10, output: null },
  ];
  recovery.commands.push(
    { type: "retry-compensation", stepId: "payment" },
    { type: "run" },
  );
  abort.commands = [
    { type: "start" },
    { type: "next" },
    { type: "abort" },
    { type: "run" },
  ];
  unknownUndo.fixtures[3].forward = rollback.fixtures[3].forward;
  unknownUndo.fixtures[2].compensate = [
    { outcome: "unknown", durationMs: 10, output: null },
  ];
  unknownUndo.commands.push(
    {
      type: "reconcile",
      stepId: "payment",
      phase: "compensation",
      outcome: "committed",
      output: null,
    },
    { type: "run" },
  );
  binding.input = {};
  const scenarios = [
    happy,
    retry,
    rollback,
    timeout,
    recover,
    recovery,
    abort,
    unknownUndo,
    binding,
  ];
  // Expectations are fixed business outcomes, independent of the replay implementation.
  const statuses = [
    "succeeded",
    "succeeded",
    "rolled-back",
    "blocked",
    "rolled-back",
    "rolled-back",
    "rolled-back",
    "rolled-back",
    "rolled-back",
  ] as const;
  scenarios.forEach((s, i) => {
    s.expect = {
      status: statuses[i],
      maxTimeMs: 3000,
      maxRetries: i === 0 || i === 3 || i === 4 || i === 6 || i === 8 ? 0 : 3,
      maxUncertain: i === 3 ? 1 : 0,
      maxUncompensated: i === 3 ? 3 : 0,
      steps: [],
      outputs: [],
    };
  });
  happy.expect!.outputs = [
    { stepId: "order", pointer: "/id", value: "order" },
    { stepId: "ship", pointer: "/id", value: "ship" },
  ];
  recover.expect!.outputs = [
    { stepId: "payment", pointer: "/id", value: "confirmed-payment" },
  ];
  rollback.expect!.steps = [
    { stepId: "ship", forward: "failed", compensation: "none" },
    { stepId: "order", forward: "succeeded", compensation: "succeeded" },
  ];
  timeout.expect!.steps = [
    { stepId: "payment", forward: "unknown", compensation: "none" },
  ];
  recovery.expect!.steps = [
    { stepId: "payment", forward: "succeeded", compensation: "succeeded" },
  ];
  return normalizeSagaProject({
    kind: "rsswag-saga-project",
    version: 1,
    name: "Checkout compensation rehearsals",
    definition,
    scenarios,
  });
}
export function recordSagaScenario(
  id: string,
  name: string,
  source: {
    input: SagaScenario["input"];
    fixtures: SagaFixture[];
    commands: SagaCommand[];
  },
  snapshot: SagaSnapshot,
  d: SagaDefinition,
): SagaScenario {
  return { id, name, ...source, expect: sagaExpectation(snapshot, d) };
}
