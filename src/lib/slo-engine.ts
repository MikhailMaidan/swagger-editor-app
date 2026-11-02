import {
  MAX_SLO_TIME,
  normalizeSloCoverage,
  normalizeSloEvent,
  normalizeSloObjective,
  sloInt,
  sloList,
  SloError,
  type SloCoverage,
  type SloEvent,
  type SloObjective,
  type SloTarget,
} from "./slo-project";
export type SloWindow = {
  fromMs: number;
  toMs: number;
  events: number;
  total: number;
  good: number;
  bad: number;
  coverage: "complete" | "partial" | "unknown";
  target: SloTarget;
  sliPercent: number | null;
  allowedBad: number;
  remainingBad: number;
  remainingPercent: number | null;
  burnRate: number | null;
  infiniteBurn: boolean;
};
export type SloRuleStatus =
  "inactive" | "pending" | "firing" | "no-data" | "unknown" | "insufficient";
export type SloRuleDecision = {
  id: string;
  name: string;
  status: SloRuleStatus;
  sinceMs: number | null;
  long: SloWindow;
  short: SloWindow;
};
export type SloPoint = {
  atMs: number;
  window: SloWindow;
  rules: SloRuleDecision[];
  firing: number;
};
export type SloHolds = Map<string, number>;
function rawClassify(
  p: SloObjective,
  e: SloEvent,
): "scope" | "excluded" | "good" | "bad" {
  if (
    (p.scope.service && e.service !== p.scope.service) ||
    (p.scope.route && e.route !== p.scope.route) ||
    (p.scope.method !== "*" && e.method !== p.scope.method)
  )
    return "scope";
  if (e.excluded) return "excluded";
  const status = p.goodStatuses.some(
      (r) => e.status >= r.from && e.status <= r.to,
    ),
    latency = e.latencyMs <= p.thresholdMs;
  return (
    p.mode === "availability"
      ? status
      : p.mode === "latency"
        ? latency
        : status && latency
  )
    ? "good"
    : "bad";
}
export function classifySloEvent(policy: SloObjective, event: SloEvent) {
  const p = normalizeSloObjective(policy),
    e = normalizeSloEvent(event);
  return rawClassify(p, e);
}
export function createSloIndex(value: SloObjective, input: unknown[]) {
  const objective = normalizeSloObjective(value),
    events = sloList(input, 0, 5000).map(normalizeSloEvent);
  if (new Set(events.map((e) => e.id)).size !== events.length)
    throw new SloError("duplicate");
  const eligible: { atMs: number; weight: number; bad: number }[] = [];
  let excluded = 0,
    unmatched = 0;
  for (const e of events) {
    const result = rawClassify(objective, e);
    if (result === "scope") unmatched++;
    else if (result === "excluded") excluded++;
    else
      eligible.push({
        atMs: e.atMs,
        weight: e.weight,
        bad: result === "bad" ? e.weight : 0,
      });
  }
  eligible.sort((a, b) => a.atMs - b.atMs);
  const units = [0],
    bad = [0];
  for (const e of eligible) {
    units.push(units.at(-1)! + e.weight);
    bad.push(bad.at(-1)! + e.bad);
  }
  function upper(time: number) {
    let lo = 0,
      hi = eligible.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (eligible[mid].atMs <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  function window(
    atMs: number,
    width: number,
    declared: SloCoverage,
  ): SloWindow {
    if (!sloInt(atMs, 0, MAX_SLO_TIME) || !sloInt(width, 1, objective.windowMs))
      throw new SloError("clock");
    const coverage = normalizeSloCoverage(declared),
      fromMs = atMs - width,
      a = upper(fromMs),
      b = upper(atMs),
      total = units[b] - units[a],
      badUnits = bad[b] - bad[a],
      good = total - badUnits,
      errorPpm = 1000000 - objective.targetPpm;
    const completeness =
        coverage === null
          ? "unknown"
          : fromMs >= coverage.fromMs && atMs <= coverage.toMs
            ? "complete"
            : "partial",
      allocated = total * errorPpm,
      remaining = allocated - badUnits * 1000000;
    const target: SloTarget =
      total === 0
        ? "no-data"
        : objective.requireCoverage && completeness !== "complete"
          ? "unknown"
          : remaining >= 0
            ? "met"
            : "missed";
    return {
      fromMs,
      toMs: atMs,
      events: b - a,
      total,
      good,
      bad: badUnits,
      coverage: completeness,
      target,
      sliPercent: total ? (good / total) * 100 : null,
      allowedBad: allocated / 1000000,
      remainingBad: remaining / 1000000,
      remainingPercent: allocated ? (remaining / allocated) * 100 : null,
      burnRate: !total
        ? null
        : allocated
          ? (badUnits * 1000000) / allocated
          : badUnits
            ? null
            : 0,
      infiniteBurn: !errorPpm && badUnits > 0,
    };
  }
  return {
    objective,
    info: {
      input: events.length,
      eligible: eligible.length,
      excluded,
      unmatched,
    },
    window,
  };
}
export function sloBurnAtLeast(
  window: SloWindow,
  targetPpm: number,
  thresholdMilli: number,
): boolean {
  if (!window.total) return false;
  const errorPpm = 1000000 - targetPpm;
  if (errorPpm === 0) return window.bad > 0;
  return (
    BigInt(window.bad) * BigInt(1000000) * BigInt(1000) >=
    BigInt(window.total) * BigInt(errorPpm) * BigInt(thresholdMilli)
  );
}
export function evaluateSloPoint(
  index: ReturnType<typeof createSloIndex>,
  atMs: number,
  coverage: SloCoverage,
  previous: SloHolds = new Map(),
): { point: SloPoint; holds: SloHolds } {
  const p = index.objective,
    holds: SloHolds = new Map(),
    rules = p.rules.map((r): SloRuleDecision => {
      const long = index.window(atMs, r.longMs, coverage),
        short = index.window(atMs, r.shortMs, coverage);
      let status: SloRuleStatus,
        sinceMs: number | null = null;
      if (!long.total || !short.total) status = "no-data";
      else if (
        p.requireCoverage &&
        (long.coverage !== "complete" || short.coverage !== "complete")
      )
        status = "unknown";
      else if (long.total < r.minLongUnits || short.total < r.minShortUnits)
        status = "insufficient";
      else if (
        !sloBurnAtLeast(long, p.targetPpm, r.burnMilli) ||
        !sloBurnAtLeast(short, p.targetPpm, r.burnMilli)
      )
        status = "inactive";
      else {
        sinceMs = previous.get(r.id) ?? atMs;
        if (sinceMs > atMs) throw new SloError("clock");
        holds.set(r.id, sinceMs);
        status = atMs - sinceMs >= r.forMs ? "firing" : "pending";
      }
      return { id: r.id, name: r.name, status, sinceMs, long, short };
    });
  return {
    point: {
      atMs,
      window: index.window(atMs, p.windowMs, coverage),
      rules,
      firing: rules.filter((r) => r.status === "firing").length,
    },
    holds,
  };
}
