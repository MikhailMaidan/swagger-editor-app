import {
  createSyncLab,
  mergeSyncStates,
  stepSyncLab,
  summarizeSyncLab,
  type SyncLab,
} from "./sync-engine";
import {
  SyncError,
  normalizeSyncState,
  type SyncDefinition,
  type SyncStep,
} from "./sync-model";
import {
  emptySyncProject,
  normalizeSyncProject,
  type SyncProject,
  type SyncScenario,
} from "./sync-project";
export async function replaySyncSteps(
  d: SyncDefinition,
  steps: SyncStep[],
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<SyncLab> {
  let lab = createSyncLab(d);
  for (let i = 0; i < steps.length; i++) {
    if (cancelled()) throw new SyncError("cancelled");
    lab = stepSyncLab(d, lab, steps[i]);
    if (
      steps[i].type === "round" ||
      (i + 1) % 10 === 0 ||
      i === steps.length - 1
    ) {
      progress?.(i + 1, steps.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (cancelled()) throw new SyncError("cancelled");
  return lab;
}
export type SyncRun = {
  scenarioId: string;
  scenarioName: string;
  checked: boolean;
  passed: boolean;
  converged: boolean;
  viewsEqual: boolean;
  conflicts: number;
  rejected: number;
  queued: number;
  sent: number;
  delivered: number;
  dropped: number;
  steps: number;
  journal: SyncLab["journal"];
  snapshot: SyncLab | null;
};
async function runScenario(
  d: SyncDefinition,
  s: SyncScenario,
  cancelled: () => boolean,
  retain: boolean,
): Promise<SyncRun> {
  const lab = await replaySyncSteps(d, s.steps, cancelled),
    summary = summarizeSyncLab(d, lab),
    e = s.expect;
  return {
    scenarioId: s.id,
    scenarioName: s.name,
    checked: e !== null,
    passed:
      e !== null &&
      summary.converged === e.converged &&
      summary.rejected <= e.maxRejected &&
      summary.conflicts <= e.maxConflicts,
    converged: summary.converged,
    viewsEqual: summary.viewsEqual,
    conflicts: summary.conflicts,
    rejected: summary.rejected,
    queued: summary.queued,
    sent: lab.sent,
    delivered: lab.delivered,
    dropped: lab.dropped,
    steps: lab.steps.length,
    journal: lab.journal.map((j) => ({ ...j })),
    snapshot: retain ? lab : null,
  };
}
export async function runSyncScenarios(
  value: SyncProject,
  id?: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<SyncRun[]> {
  const p = normalizeSyncProject(value),
    cases = id ? p.scenarios.filter((s) => s.id === id) : p.scenarios;
  if (id && !cases.length) throw new SyncError("definition");
  const runs: SyncRun[] = [];
  for (const s of cases) {
    if (cancelled()) throw new SyncError("cancelled");
    runs.push(await runScenario(p.definition, s, cancelled, !!id));
    progress?.(runs.length, cases.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (cancelled()) throw new SyncError("cancelled");
  return runs;
}
export async function checkSyncMergeLaws(
  d: SyncDefinition,
  lab: SyncLab,
  actors: string[],
  cancelled = () => false,
) {
  if (
    actors.length !== 3 ||
    actors.some((a) => !d.actors.some((x) => x.id === a))
  )
    throw new SyncError("definition");
  const [a, b, c] = actors.map((id) => normalizeSyncState(d, lab.states[id]));
  const checks: {
    law: "idempotent" | "commutative" | "associative";
    status: "passed" | "failed" | "bounded";
    reason: string | null;
  }[] = [];
  const specifications = [
    {
      law: "idempotent" as const,
      left: () => mergeSyncStates(d, a, a),
      right: () => a,
    },
    {
      law: "commutative" as const,
      left: () => mergeSyncStates(d, a, b),
      right: () => mergeSyncStates(d, b, a),
    },
    {
      law: "associative" as const,
      left: () => mergeSyncStates(d, mergeSyncStates(d, a, b), c),
      right: () => mergeSyncStates(d, a, mergeSyncStates(d, b, c)),
    },
  ];
  for (const test of specifications) {
    if (cancelled()) throw new SyncError("cancelled");
    try {
      checks.push({
        law: test.law,
        status:
          JSON.stringify(test.left()) === JSON.stringify(test.right())
            ? "passed"
            : "failed",
        reason: null,
      });
    } catch (e) {
      if (
        !(e instanceof SyncError) ||
        !["capacity", "equivocation"].includes(e.code)
      )
        throw e;
      checks.push({ law: test.law, status: "bounded", reason: e.code });
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  if (cancelled()) throw new SyncError("cancelled");
  return checks;
}
export function syncRunReport(runs: SyncRun[], details = false) {
  return {
    kind: "rsswag-sync-report",
    version: 1,
    total: runs.length,
    checked: runs.filter((r) => r.checked).length,
    passed: runs.filter((r) => r.passed).length,
    runs: runs.map((r) => ({
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      checked: r.checked,
      passed: r.passed,
      converged: r.converged,
      viewsEqual: r.viewsEqual,
      conflicts: r.conflicts,
      rejected: r.rejected,
      queued: r.queued,
      sent: r.sent,
      delivered: r.delivered,
      dropped: r.dropped,
      steps: r.steps,
      ...(details ? { journal: r.journal.map((j) => ({ ...j })) } : {}),
    })),
  };
}
export function demoSyncProject(): SyncProject {
  const p = emptySyncProject();
  p.name = "Offline clients and convergent API state";
  const increment = (actor: string, amount: number): SyncStep => ({
      type: "increment",
      actor,
      field: "count",
      amount,
    }),
    assign = (actor: string, value: string): SyncStep => ({
      type: "assign",
      actor,
      field: "status",
      value,
    }),
    round: SyncStep = { type: "round" };
  const concurrent = [
    assign("alpha", "draft"),
    assign("beta", "review"),
    round,
  ];
  const partition = [
    { type: "link", from: "alpha", to: "beta", enabled: false },
    { type: "link", from: "beta", to: "alpha", enabled: false },
    { type: "link", from: "beta", to: "gamma", enabled: false },
    { type: "link", from: "gamma", to: "beta", enabled: false },
    increment("alpha", 2),
    increment("beta", 7),
    round,
  ] as SyncStep[];
  const scenario = (
    id: string,
    name: string,
    steps: SyncStep[],
    converged = true,
    maxConflicts = 0,
    maxRejected = 0,
  ): SyncScenario => ({
    id,
    name,
    steps,
    expect: { converged, maxConflicts, maxRejected },
  });
  p.scenarios = [
    scenario("counter", "Concurrent positive and negative increments", [
      increment("alpha", 3),
      increment("beta", 5),
      increment("gamma", -2),
      round,
    ]),
    scenario("add-wins", "Concurrent set addition survives observed removal", [
      { type: "add", actor: "alpha", field: "labels", value: "red" },
      round,
      { type: "remove", actor: "beta", field: "labels", value: "red" },
      { type: "add", actor: "gamma", field: "labels", value: "red" },
      round,
    ]),
    scenario(
      "conflict",
      "Concurrent register values remain explicit",
      concurrent,
      true,
      3,
    ),
    scenario("resolved", "An observed write resolves register conflicts", [
      ...concurrent,
      assign("gamma", "approved"),
      round,
    ]),
    scenario(
      "delayed",
      "Stale and duplicate snapshots cannot resurrect old values",
      [
        assign("alpha", "old"),
        { type: "send", from: "alpha", to: "beta" },
        assign("alpha", "new"),
        { type: "send", from: "alpha", to: "beta" },
        { type: "duplicate", message: "message-2" },
        { type: "deliver", message: "message-2" },
        { type: "deliver", message: "message-1" },
        { type: "deliver", message: "message-3" },
        round,
      ],
    ),
    scenario(
      "partition",
      "A partition keeps independent replicas divergent",
      partition,
      false,
    ),
    scenario("healed", "Healing links permits convergence", [
      ...partition,
      ...partition
        .slice(0, 4)
        .map((s) => ({ ...s, enabled: true }) as SyncStep),
      round,
    ]),
    scenario(
      "blocked",
      "A blocked delivery stays queued until the link heals",
      [
        assign("alpha", "ready"),
        { type: "send", from: "alpha", to: "beta" },
        { type: "link", from: "alpha", to: "beta", enabled: false },
        { type: "deliver", message: "message-1" },
        { type: "link", from: "alpha", to: "beta", enabled: true },
        { type: "deliver", message: "message-1" },
        round,
      ],
      true,
      0,
      1,
    ),
    scenario(
      "metadata",
      "Equal visible values can have different causal metadata",
      [{ type: "clear", actor: "alpha", field: "status" }],
      false,
    ),
  ];
  return normalizeSyncProject(p);
}
