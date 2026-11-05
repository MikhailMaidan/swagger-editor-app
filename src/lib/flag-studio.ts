import { createFlagEvaluator, type FlagDecision } from "./flag-engine";
import {
  FlagError,
  MAX_FLAG_PROJECT,
  flagId,
  flagName,
  flagList,
  flagObject,
  flagJson,
  normalizeFlagContext,
  normalizeFlagDefinition,
  normalizeFlagPlanner,
  normalizeFlagProject,
  emptyFlagProject,
  newFeatureFlag,
  type FlagCase,
  type FlagContext,
  type FlagDefinition,
  type FlagPlanner,
  type FlagProject,
  type FlagExpectation,
} from "./flag-model";
export type FlagOutcome = Pick<
  FlagDecision,
  "served" | "variantId" | "reason" | "rolloutBucket" | "allocationBucket"
>;
export type FlagRun = {
  caseId: string;
  caseName: string;
  flagId: string;
  flagName: string;
  checked: boolean;
  passed: boolean;
  outcome: FlagOutcome;
};
export const flagOutcome = (d: FlagDecision): FlagOutcome => ({
  served: d.served,
  variantId: d.variantId,
  reason: d.reason,
  rolloutBucket: d.rolloutBucket,
  allocationBucket: d.allocationBucket,
});
const pause = () => new Promise((r) => setTimeout(r, 0));
export async function runFlagCases(
  value: FlagProject,
  caseId?: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
) {
  const p = normalizeFlagProject(value),
    cases = caseId ? p.cases.filter((c) => c.id === caseId) : p.cases;
  if (caseId && !cases.length) throw new FlagError("reference");
  const evaluate = createFlagEvaluator(p.definition),
    runs: FlagRun[] = [];
  for (let i = 0; i < cases.length; i++) {
    if (cancelled()) throw new FlagError("cancelled");
    const c = cases[i],
      decisions = await evaluate(c.context);
    for (const d of decisions) {
      const e = Object.hasOwn(c.expect, d.flagId)
        ? c.expect[d.flagId]
        : undefined;
      runs.push({
        caseId: c.id,
        caseName: c.name,
        flagId: d.flagId,
        flagName: p.definition.flags.find((f) => f.id === d.flagId)!.name,
        checked: !!e,
        passed:
          !!e &&
          e.served === d.served &&
          e.variantId === d.variantId &&
          (e.reason === undefined || e.reason === d.reason),
        outcome: flagOutcome(d),
      });
    }
    if (i % 10 === 0 || i === cases.length - 1) {
      progress?.(i + 1, cases.length);
      await pause();
    }
  }
  if (cancelled()) throw new FlagError("cancelled");
  return runs;
}
export type FlagComparison = {
  caseId: string;
  caseName: string;
  changed: boolean;
  assignmentChanged: boolean;
  valueChanged: boolean;
  before: FlagOutcome;
  after: FlagOutcome;
};
export async function compareFlagDefinitions(
  base: FlagDefinition,
  candidate: FlagDefinition,
  cases: FlagCase[],
  flagId: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
) {
  const a = normalizeFlagDefinition(base),
    b = normalizeFlagDefinition(candidate);
  if (
    !a.flags.some((f) => f.id === flagId) ||
    !b.flags.some((f) => f.id === flagId)
  )
    throw new FlagError("reference");
  const contexts = flagList(cases, 200).map((v) => {
      if (!flagObject(v) || !flagIdValid(v.id) || !flagName(v.name))
        throw new FlagError("context");
      return {
        id: v.id,
        name: v.name,
        context: normalizeFlagContext(v.context),
      };
    }),
    left = createFlagEvaluator(a),
    right = createFlagEvaluator(b),
    rows: FlagComparison[] = [];
  for (let i = 0; i < contexts.length; i++) {
    if (cancelled()) throw new FlagError("cancelled");
    const c = contexts[i],
      [before] = await left(c.context, [flagId]),
      [after] = await right(c.context, [flagId]),
      assignmentChanged =
        before.served !== after.served || before.variantId !== after.variantId,
      valueChanged =
        JSON.stringify(before.value) !== JSON.stringify(after.value);
    rows.push({
      caseId: c.id,
      caseName: c.name,
      changed:
        assignmentChanged || valueChanged || before.reason !== after.reason,
      assignmentChanged,
      valueChanged,
      before: flagOutcome(before),
      after: flagOutcome(after),
    });
    if (i % 10 === 0 || i === contexts.length - 1) {
      progress?.(i + 1, contexts.length);
      await pause();
    }
  }
  if (cancelled()) throw new FlagError("cancelled");
  return rows;
}
const flagIdValid = flagId;
export type FlagStage = {
  rolloutPpm: number;
  served: number;
  entered: number;
  exited: number;
  reassigned: number;
  counts: { variantId: string | null; count: number }[];
  assignments: { served: boolean; variantId: string | null }[];
};
export type FlagPlan = { flagId: string; count: number; stages: FlagStage[] };
export function flagPlannerContexts(value: FlagPlanner): FlagContext[] {
  const p = normalizeFlagPlanner(value);
  return Array.from({ length: p.count }, (_, i) => ({
    key: `${p.prefix}-${i + 1}`,
    attributes: structuredClone(p.attributes),
    nowMs: p.nowMs,
  }));
}
export async function planFlagRollout(
  value: FlagDefinition,
  settings: FlagPlanner,
  flagId: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<FlagPlan> {
  const definition = normalizeFlagDefinition(value),
    planner = normalizeFlagPlanner(settings),
    flag = definition.flags.find((f) => f.id === flagId);
  if (!flag) throw new FlagError("reference");
  const contexts = flagPlannerContexts(planner),
    stages: FlagStage[] = [];
  let previous: FlagStage["assignments"] = [],
    done = 0;
  for (const rolloutPpm of planner.stages) {
    const evaluate = createFlagEvaluator({
        ...definition,
        flags: definition.flags.map((f) =>
          f.id === flagId ? { ...f, rolloutPpm } : f,
        ),
      }),
      assignments: FlagStage["assignments"] = [];
    for (const c of contexts) {
      if (cancelled()) throw new FlagError("cancelled");
      const [d] = await evaluate(c, [flagId]);
      assignments.push({ served: d.served, variantId: d.variantId });
      done++;
      if (done % 25 === 0) {
        progress?.(done, contexts.length * planner.stages.length);
        await pause();
      }
    }
    const counts = [null, ...flag.variants.map((v) => v.id)].map(
      (variantId) => ({
        variantId,
        count: assignments.filter((a) => a.variantId === variantId).length,
      }),
    );
    stages.push({
      rolloutPpm,
      served: assignments.filter((a) => a.served).length,
      entered: assignments.filter((a, i) => a.served && !previous[i]?.served)
        .length,
      exited: assignments.filter((a, i) => !a.served && previous[i]?.served)
        .length,
      reassigned: assignments.filter(
        (a, i) =>
          a.served &&
          previous[i]?.served &&
          a.variantId !== previous[i].variantId,
      ).length,
      counts,
      assignments,
    });
    previous = assignments;
  }
  if (cancelled()) throw new FlagError("cancelled");
  progress?.(done, done);
  return { flagId, count: contexts.length, stages };
}
export function flagRunReport(
  runs: FlagRun[],
  selected: FlagDecision | null = null,
) {
  const trace = selected
    ? (({ value: privateValue, ...rest }) => {
        void privateValue;
        return rest;
      })(selected)
    : null;
  return {
    kind: "rsswag-flag-report",
    version: 1,
    total: runs.length,
    checked: runs.filter((r) => r.checked).length,
    passed: runs.filter((r) => r.passed).length,
    runs,
    selectedTrace: trace,
  };
}
function csvCell(v: unknown) {
  let s = String(v ?? "");
  // Only strings can carry a formula payload; numbers must stay numeric.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function flagRunsCsv(runs: FlagRun[]) {
  return [
    [
      "caseId",
      "flagId",
      "checked",
      "passed",
      "served",
      "variantId",
      "reason",
      "rolloutBucket",
      "allocationBucket",
    ],
    ...runs.map((r) => [
      r.caseId,
      r.flagId,
      r.checked,
      r.passed,
      r.outcome.served,
      r.outcome.variantId,
      r.outcome.reason,
      r.outcome.rolloutBucket,
      r.outcome.allocationBucket,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
export function importFlagNdjson(source: string): FlagCase[] {
  if (new TextEncoder().encode(source).length > MAX_FLAG_PROJECT)
    throw new FlagError("limit");
  const rows = flagList(
    source
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((s) => s.trim()),
    200,
  ).map((line) => {
    const v = flagJson(line as string);
    if (!flagObject(v) || !flagId(v.id) || !flagName(v.name))
      throw new FlagError("context");
    return {
      id: v.id,
      name: v.name,
      context: normalizeFlagContext(v),
      expect: {},
    };
  });
  if (!rows.length || new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new FlagError("context");
  return rows;
}
export function demoFlagProject(): FlagProject {
  const p = emptyFlagProject(),
    foundation = {
      ...newFeatureFlag("foundation"),
      name: "Foundation availability",
      rolloutPpm: 1000000,
      startMs: 1000,
      endMs: 10000,
      exclude: ["blocked"],
    },
    checkout = {
      ...newFeatureFlag("checkout"),
      name: "Checkout gradual rollout",
      rolloutPpm: 500000,
      prerequisites: [{ flagId: "foundation", variantId: "on" }],
      rules: [
        {
          id: "staff",
          name: "Staff preview",
          include: [],
          exclude: [],
          conditions: [
            { pointer: "/staff", operator: "equal" as const, value: true },
          ],
          rolloutPpm: 1000000,
          variantId: "on",
        },
      ],
    },
    theme = {
      ...newFeatureFlag("theme"),
      name: "API response experiment",
      kind: "string" as const,
      offValue: "default",
      rolloutPpm: 1000000,
      startMs: 1000,
      endMs: 10000,
      include: ["pro"],
      exclude: ["blocked"],
      variants: [
        { id: "classic", name: "Classic", weightPpm: 500000, value: "classic" },
        { id: "fresh", name: "Fresh", weightPpm: 500000, value: "fresh" },
      ],
    },
    limits = {
      ...newFeatureFlag("limits"),
      name: "Typed API configuration",
      kind: "json" as const,
      offValue: { rate: 0 },
      rolloutPpm: 1000000,
      prerequisites: [{ flagId: "foundation", variantId: "on" }],
      variants: [
        {
          id: "standard",
          name: "Standard",
          weightPpm: 750000,
          value: { rate: 10 },
        },
        { id: "large", name: "Large", weightPpm: 250000, value: { rate: 100 } },
      ],
    };
  p.name = "Feature targeting, experiments and rollout stability";
  p.definition = {
    salt: "demo-env",
    segments: [
      {
        id: "blocked",
        name: "Blocked subjects",
        conditions: [{ pointer: "/blocked", operator: "equal", value: true }],
      },
      {
        id: "pro",
        name: "Paid plans",
        conditions: [
          { pointer: "/plan", operator: "in", value: ["pro", "enterprise"] },
        ],
      },
    ],
    flags: [foundation, checkout, theme, limits],
  };
  const c = (
    id: string,
    key: string,
    attributes: FlagContext["attributes"],
    nowMs = 2000,
  ): FlagCase => ({
    id,
    name: id,
    context: { key, attributes, nowMs },
    expect: {},
  });
  p.cases = [
    c("staff", "staff-1", { staff: true, plan: "pro", blocked: false }),
    c("blocked", "blocked-1", { staff: true, plan: "pro", blocked: true }),
    c("before", "tenant-1", { plan: "pro" }, 999),
    c("start", "tenant-1", { plan: "pro" }, 1000),
    c("end", "tenant-1", { plan: "pro" }, 10000),
    c("free", "free-1", { plan: "free" }),
    c("missing", "missing-1", {}),
    c("enterprise", "enterprise-2", { plan: "enterprise" }),
  ];
  const served = (
      variantId: string,
      reason: FlagExpectation["reason"] = "allocated",
    ): FlagExpectation => ({ served: true, variantId, reason }),
    off = (reason: FlagExpectation["reason"]): FlagExpectation => ({
      served: false,
      variantId: null,
      reason,
    });
  for (const c of p.cases) {
    const stopped = c.id === "before" || c.id === "end",
      blocked = c.id === "blocked";
    c.expect.foundation = stopped
      ? off("schedule")
      : blocked
        ? off("excluded")
        : served("on");
    c.expect.checkout =
      stopped || blocked
        ? off("prerequisite")
        : c.id === "staff"
          ? served("on", "rule")
          : off("rollout");
    c.expect.theme = stopped
      ? off("schedule")
      : blocked
        ? off("excluded")
        : c.id === "free" || c.id === "missing"
          ? off("audience")
          : served("classic");
    c.expect.limits =
      stopped || blocked ? off("prerequisite") : served("standard");
  }
  p.cases.find((c) => c.id === "enterprise")!.expect.checkout = served("on");
  for (const id of ["staff", "enterprise"])
    p.cases.find((c) => c.id === id)!.expect.theme = served("fresh");
  for (const id of ["missing", "enterprise"])
    p.cases.find((c) => c.id === id)!.expect.limits = served("large");
  p.candidate = structuredClone(p.definition);
  p.candidate.flags.find((f) => f.id === "checkout")!.rolloutPpm = 1000000;
  return normalizeFlagProject(p);
}
