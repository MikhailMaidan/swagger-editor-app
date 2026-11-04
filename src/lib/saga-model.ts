import { getByteSize } from "./text-encoding";

export const MAX_SAGA_PROJECT = 2 * 1024 * 1024;
export type SagaJson =
  null | boolean | number | string | SagaJson[] | { [key: string]: SagaJson };
export type SagaSource =
  | { from: "input"; pointer: string }
  | { from: "step"; stepId: string; pointer: string }
  | { from: "literal"; value: SagaJson };
export type SagaAction = {
  operation: string;
  input: Record<string, SagaSource>;
  timeoutMs: number;
  attempts: number;
  backoffMs: number;
};
export type SagaStep = {
  id: string;
  name: string;
  dependsOn: string[];
  effect: "read" | "write";
  forward: SagaAction;
  compensate: SagaAction | null;
};
export type SagaDefinition = {
  name: string;
  concurrency: number;
  deadlineMs: number;
  steps: SagaStep[];
};
export type SagaAttempt = {
  outcome: "success" | "failure" | "unknown";
  durationMs: number;
  output: SagaJson;
};
export type SagaFixture = {
  stepId: string;
  forward: SagaAttempt[];
  compensate: SagaAttempt[];
};
export type SagaCommand =
  | { type: "start" | "next" | "run" | "abort" }
  | { type: "advance"; to: number }
  | {
      type: "reconcile";
      stepId: string;
      phase: "forward" | "compensation";
      outcome: "committed" | "aborted";
      output: SagaJson;
    }
  | { type: "retry-compensation"; stepId: string };
export type SagaStatus =
  | "ready"
  | "running"
  | "draining"
  | "compensating"
  | "blocked"
  | "succeeded"
  | "rolled-back"
  | "attention";
export type SagaForwardStatus =
  | "pending"
  | "running"
  | "retry-wait"
  | "succeeded"
  | "failed"
  | "unknown"
  | "cancelled";
export type SagaCompensationStatus =
  | "none"
  | "pending"
  | "running"
  | "retry-wait"
  | "succeeded"
  | "failed"
  | "unknown"
  | "retained";
export type SagaStepState = {
  id: string;
  forward: SagaForwardStatus;
  compensation: SagaCompensationStatus;
  attempts: number;
  compensationAttempts: number;
  compensationCalls: number;
  recoveryCycles: number;
  input: Record<string, SagaJson> | null;
  compensationInput: Record<string, SagaJson> | null;
  output: SagaJson;
  completedOrder: number;
  due: number | null;
  scheduledOutcome: SagaAttempt["outcome"] | null;
  scheduledOutput: SagaJson;
  reason: string | null;
};
export type SagaJournal = {
  seq: number;
  at: number;
  stepId: string | null;
  phase: "workflow" | "forward" | "compensation";
  kind: string;
  attempt: number;
  reason: string | null;
};
export type SagaSnapshot = {
  status: SagaStatus;
  clock: number;
  failure: string | null;
  commands: number;
  steps: SagaStepState[];
  journal: SagaJournal[];
  metrics: {
    forwardAttempts: number;
    compensationAttempts: number;
    retries: number;
    compensations: number;
    reconciliations: number;
    peakConcurrency: number;
  };
};
export type SagaExpectation = {
  status: SagaStatus;
  maxTimeMs: number;
  maxRetries: number;
  maxUncertain: number;
  maxUncompensated: number;
  steps: {
    stepId: string;
    forward: SagaForwardStatus;
    compensation: SagaCompensationStatus;
  }[];
  outputs: {
    stepId: string;
    pointer: string;
    value?: SagaJson;
    missing?: true;
  }[];
};
export type SagaScenario = {
  id: string;
  name: string;
  input: SagaJson;
  fixtures: SagaFixture[];
  commands: SagaCommand[];
  expect: SagaExpectation | null;
};
export type SagaProject = {
  kind: "rsswag-saga-project";
  version: 1;
  name: string;
  definition: SagaDefinition;
  scenarios: SagaScenario[];
};
export class SagaError extends Error {
  constructor(
    public code:
      "json" | "definition" | "reference" | "command" | "limit" | "cancelled",
  ) {
    super(code);
    this.name = "SagaError";
  }
}
export const sagaObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const sagaInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const sagaText = (v: unknown, max = 120): v is string =>
  typeof v === "string" && !!v.trim() && getByteSize(v) <= max;
export const sagaId = (v: unknown): v is string =>
  sagaText(v, 64) && /^[A-Za-z0-9_-]+$/.test(v);
export const sagaPointer = (v: unknown): v is string =>
  typeof v === "string" &&
  getByteSize(v) <= 256 &&
  (v === "" || v.startsWith("/")) &&
  !/~(?![01])/.test(v);
function list(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new SagaError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new SagaError("definition");
  return v;
}
export function sagaJson(v: unknown, max = 4096): SagaJson {
  let nodes = 0;
  function visit(x: unknown, depth: number): SagaJson {
    if (++nodes > 512 || depth > 12) throw new SagaError("limit");
    if (x === null || typeof x === "boolean" || typeof x === "string") return x;
    if (typeof x === "number" && Number.isFinite(x))
      return Object.is(x, -0) ? 0 : x;
    if (Array.isArray(x)) return list(x, 512).map((n) => visit(n, depth + 1));
    if (
      sagaObject(x) &&
      (Object.getPrototypeOf(x) === null ||
        Object.getPrototypeOf(Object.getPrototypeOf(x)) === null)
    )
      return Object.fromEntries(
        Object.keys(x)
          .sort()
          .map((key) => [key, visit(x[key], depth + 1)]),
      );
    throw new SagaError("definition");
  }
  const result = visit(v, 0);
  if (getByteSize(JSON.stringify(result)) > max) throw new SagaError("limit");
  return result;
}
export function parseSagaJson(text: string, max = MAX_SAGA_PROJECT): unknown {
  if (getByteSize(text) > max) throw new SagaError("limit");
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new SagaError("json");
  }
}
function source(v: unknown): SagaSource {
  if (!sagaObject(v)) throw new SagaError("definition");
  if (v.from === "literal") return { from: v.from, value: sagaJson(v.value) };
  if (sagaPointer(v.pointer)) {
    if (v.from === "input") return { from: v.from, pointer: v.pointer };
    if (v.from === "step" && sagaId(v.stepId))
      return { from: v.from, stepId: v.stepId, pointer: v.pointer };
  }
  throw new SagaError("definition");
}
export function normalizeSagaAction(v: unknown): SagaAction {
  if (
    !sagaObject(v) ||
    !sagaText(v.operation) ||
    !sagaObject(v.input) ||
    !sagaInt(v.timeoutMs, 1, 60000) ||
    !sagaInt(v.attempts, 1, 5) ||
    !sagaInt(v.backoffMs, 0, 60000)
  )
    throw new SagaError("definition");
  const fields = Object.entries(v.input);
  if (
    fields.length > 16 ||
    fields.some(
      ([k]) =>
        !sagaId(k) || ["__proto__", "constructor", "prototype"].includes(k),
    )
  )
    throw new SagaError("definition");
  return {
    operation: v.operation,
    input: Object.fromEntries(fields.map(([k, v]) => [k, source(v)])),
    timeoutMs: v.timeoutMs,
    attempts: v.attempts,
    backoffMs: v.backoffMs,
  };
}
export function normalizeSagaDefinition(v: unknown): SagaDefinition {
  if (
    !sagaObject(v) ||
    !sagaText(v.name) ||
    !sagaInt(v.concurrency, 1, 8) ||
    !sagaInt(v.deadlineMs, 1, 600000)
  )
    throw new SagaError("definition");
  const steps: SagaStep[] = list(v.steps, 20).map((s) => {
    if (
      !sagaObject(s) ||
      !sagaId(s.id) ||
      !sagaText(s.name) ||
      !["read", "write"].includes(s.effect as string)
    )
      throw new SagaError("definition");
    const dependsOn = list(s.dependsOn, 19).map((id) => {
      if (!sagaId(id)) throw new SagaError("definition");
      return id;
    });
    if (
      new Set(dependsOn).size !== dependsOn.length ||
      (s.effect === "read" && s.compensate !== null)
    )
      throw new SagaError("definition");
    return {
      id: s.id,
      name: s.name,
      dependsOn,
      effect: s.effect as SagaStep["effect"],
      forward: normalizeSagaAction(s.forward),
      compensate:
        s.compensate === null ? null : normalizeSagaAction(s.compensate),
    };
  });
  if (!steps.length || new Set(steps.map((s) => s.id)).size !== steps.length)
    throw new SagaError("definition");
  const byId = new Map(steps.map((s) => [s.id, s])),
    ancestors = new Map<string, Set<string>>();
  function walk(id: string, path = new Set<string>()): Set<string> {
    if (ancestors.has(id)) return ancestors.get(id)!;
    if (path.has(id)) throw new SagaError("reference");
    const step = byId.get(id);
    if (!step) throw new SagaError("reference");
    const result = new Set<string>();
    for (const dep of step.dependsOn) {
      result.add(dep);
      for (const a of walk(dep, new Set([...path, id]))) result.add(a);
    }
    ancestors.set(id, result);
    return result;
  }
  for (const s of steps) {
    const before = walk(s.id);
    for (const [action, own] of [
      [s.forward, false],
      [s.compensate, true],
    ] as const)
      for (const ref of Object.values(action?.input ?? {}))
        if (
          ref.from === "step" &&
          !(before.has(ref.stepId) || (own && ref.stepId === s.id))
        )
          throw new SagaError("reference");
  }
  const result = {
    name: v.name,
    concurrency: v.concurrency,
    deadlineMs: v.deadlineMs,
    steps,
  };
  if (getByteSize(JSON.stringify(result)) > 128 * 1024)
    throw new SagaError("limit");
  return result;
}
export function normalizeSagaCommand(v: unknown): SagaCommand {
  if (!sagaObject(v)) throw new SagaError("command");
  if (["start", "next", "run", "abort"].includes(v.type as string))
    return { type: v.type as "start" | "next" | "run" | "abort" };
  if (v.type === "advance" && sagaInt(v.to, 0, 60000000))
    return { type: v.type, to: v.to };
  if (v.type === "retry-compensation" && sagaId(v.stepId))
    return { type: v.type, stepId: v.stepId };
  if (
    v.type === "reconcile" &&
    sagaId(v.stepId) &&
    ["forward", "compensation"].includes(v.phase as string) &&
    ["committed", "aborted"].includes(v.outcome as string)
  )
    return {
      type: v.type,
      stepId: v.stepId,
      phase: v.phase as "forward" | "compensation",
      outcome: v.outcome as "committed" | "aborted",
      output:
        v.outcome === "committed" && v.phase === "forward"
          ? sagaJson(v.output)
          : null,
    };
  throw new SagaError("command");
}
export function normalizeSagaFixtures(
  v: unknown,
  d: SagaDefinition,
): SagaFixture[] {
  const fixtures = list(v, 20).map((f) => {
    if (
      !sagaObject(f) ||
      !sagaId(f.stepId) ||
      !d.steps.some((s) => s.id === f.stepId)
    )
      throw new SagaError("reference");
    function attempts(v: unknown): SagaAttempt[] {
      return list(v, 5).map((a) => {
        if (
          !sagaObject(a) ||
          !["success", "failure", "unknown"].includes(a.outcome as string) ||
          !sagaInt(a.durationMs, 0, 60000)
        )
          throw new SagaError("definition");
        return {
          outcome: a.outcome as SagaAttempt["outcome"],
          durationMs: a.durationMs,
          output: a.outcome === "success" ? sagaJson(a.output) : null,
        };
      });
    }
    return {
      stepId: f.stepId,
      forward: attempts(f.forward),
      compensate: attempts(f.compensate),
    };
  });
  if (
    new Set(fixtures.map((f) => f.stepId)).size !== fixtures.length ||
    d.steps.some(
      (s) =>
        !fixtures.find((f) => f.stepId === s.id)?.forward.length ||
        (s.compensate &&
          !fixtures.find((f) => f.stepId === s.id)?.compensate.length),
    )
  )
    throw new SagaError("reference");
  return fixtures;
}
export const sagaStatuses: SagaStatus[] = [
  "ready",
  "running",
  "draining",
  "compensating",
  "blocked",
  "succeeded",
  "rolled-back",
  "attention",
];
export const sagaForwardStatuses: SagaForwardStatus[] = [
  "pending",
  "running",
  "retry-wait",
  "succeeded",
  "failed",
  "unknown",
  "cancelled",
];
export const sagaCompensationStatuses: SagaCompensationStatus[] = [
  "none",
  "pending",
  "running",
  "retry-wait",
  "succeeded",
  "failed",
  "unknown",
  "retained",
];
function expectation(v: unknown, d: SagaDefinition): SagaExpectation | null {
  if (v === null) return null;
  if (
    !sagaObject(v) ||
    !sagaStatuses.includes(v.status as SagaStatus) ||
    !sagaInt(v.maxTimeMs, 0, 60000000) ||
    !sagaInt(v.maxRetries, 0, 1000) ||
    !sagaInt(v.maxUncertain, 0, 40) ||
    !sagaInt(v.maxUncompensated, 0, 20)
  )
    throw new SagaError("definition");
  const known = (v: unknown): v is string =>
    typeof v === "string" && d.steps.some((s) => s.id === v);
  const steps = list(v.steps, 20).map((s) => {
    if (
      !sagaObject(s) ||
      !known(s.stepId) ||
      !sagaForwardStatuses.includes(s.forward as SagaForwardStatus) ||
      !sagaCompensationStatuses.includes(
        s.compensation as SagaCompensationStatus,
      )
    )
      throw new SagaError("reference");
    return {
      stepId: s.stepId,
      forward: s.forward as SagaForwardStatus,
      compensation: s.compensation as SagaCompensationStatus,
    };
  });
  const outputs = list(v.outputs, 40).map((o) => {
    if (!sagaObject(o) || !known(o.stepId) || !sagaPointer(o.pointer))
      throw new SagaError("reference");
    return o.missing === true
      ? { stepId: o.stepId, pointer: o.pointer, missing: true as const }
      : { stepId: o.stepId, pointer: o.pointer, value: sagaJson(o.value) };
  });
  return {
    status: v.status as SagaStatus,
    maxTimeMs: v.maxTimeMs,
    maxRetries: v.maxRetries,
    maxUncertain: v.maxUncertain,
    maxUncompensated: v.maxUncompensated,
    steps,
    outputs,
  };
}
export function normalizeSagaProject(v: unknown): SagaProject {
  if (
    !sagaObject(v) ||
    v.kind !== "rsswag-saga-project" ||
    v.version !== 1 ||
    !sagaText(v.name)
  )
    throw new SagaError("definition");
  const definition = normalizeSagaDefinition(v.definition);
  const scenarios = list(v.scenarios, 12).map((s) => {
    if (!sagaObject(s) || !sagaId(s.id) || !sagaText(s.name))
      throw new SagaError("definition");
    return {
      id: s.id,
      name: s.name,
      input: sagaJson(s.input),
      fixtures: normalizeSagaFixtures(s.fixtures, definition),
      commands: list(s.commands, 200).map(normalizeSagaCommand),
      expect: expectation(s.expect, definition),
    };
  });
  if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length)
    throw new SagaError("definition");
  const result: SagaProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    definition,
    scenarios,
  };
  if (getByteSize(JSON.stringify(result)) > MAX_SAGA_PROJECT)
    throw new SagaError("limit");
  return result;
}
export const parseSagaProject = (s: string) =>
  normalizeSagaProject(parseSagaJson(s));
export function serializeSagaProject(p: SagaProject) {
  const value = normalizeSagaProject(p),
    pretty = JSON.stringify(value, null, 2);
  return getByteSize(pretty) <= MAX_SAGA_PROJECT
    ? pretty
    : JSON.stringify(value);
}
export function newSagaAction(operation = "POST /resource"): SagaAction {
  return { operation, input: {}, timeoutMs: 1000, attempts: 2, backoffMs: 50 };
}
export function newSagaStep(id = "step-1"): SagaStep {
  return {
    id,
    name: id,
    dependsOn: [],
    effect: "write",
    forward: newSagaAction(),
    compensate: newSagaAction("DELETE /resource"),
  };
}
export function defaultSagaFixtures(d: SagaDefinition): SagaFixture[] {
  return d.steps.map((s) => ({
    stepId: s.id,
    forward: [{ outcome: "success", durationMs: 100, output: { id: s.id } }],
    compensate: s.compensate
      ? [{ outcome: "success", durationMs: 50, output: null }]
      : [],
  }));
}
export function newSagaScenario(
  d: SagaDefinition,
  id = "case-1",
): SagaScenario {
  return {
    id,
    name: id,
    input: {},
    fixtures: defaultSagaFixtures(d),
    commands: [{ type: "run" }],
    expect: null,
  };
}
export function emptySagaProject(): SagaProject {
  const definition: SagaDefinition = {
    name: "Transaction",
    concurrency: 2,
    deadlineMs: 10000,
    steps: [newSagaStep()],
  };
  return {
    kind: "rsswag-saga-project",
    version: 1,
    name: "Saga project",
    definition,
    scenarios: [newSagaScenario(definition)],
  };
}
