import {
  createSloIndex,
  evaluateSloPoint,
  type SloHolds,
  type SloPoint,
} from "./slo-engine";
import {
  MAX_SLO_TIME,
  SloError,
  normalizeSloEvent,
  normalizeSloObjective,
  sloInt,
  type SloEvent,
  type SloObjective,
} from "./slo-project";
export function createSloMonitor(
  value: SloObjective,
  options: { assumeCompleteFromMs?: number | null } = {},
) {
  const p = normalizeSloObjective(value);
  let coverageStart = options.assumeCompleteFromMs ?? null;
  if (coverageStart !== null && !sloInt(coverageStart, 0, MAX_SLO_TIME))
    throw new SloError("clock");
  const events = new Map<string, SloEvent>();
  let holds: SloHolds = new Map(),
    lastMs: number | null = null,
    lastPoint: SloPoint | null = null,
    evicted = 0,
    evaluations = 0;
  function record(input: unknown): boolean {
    const e = normalizeSloEvent(input),
      old = events.get(e.id);
    if (old) {
      if (JSON.stringify(old) === JSON.stringify(e)) return false;
      throw new SloError("duplicate");
    }
    if (lastMs !== null && e.atMs <= lastMs) throw new SloError("late");
    if (events.size >= 5000) throw new SloError("limit");
    events.set(e.id, e);
    return true;
  }
  function evaluate(atMs: number): SloPoint {
    if (
      !sloInt(atMs, 0, MAX_SLO_TIME) ||
      (lastMs !== null && atMs < lastMs) ||
      (coverageStart !== null && atMs < coverageStart)
    )
      throw new SloError("clock");
    for (const [id, e] of events)
      if (e.atMs <= atMs - p.windowMs) {
        events.delete(id);
        evicted++;
      }
    const result = evaluateSloPoint(
      createSloIndex(p, [...events.values()]),
      atMs,
      coverageStart === null ? null : { fromMs: coverageStart, toMs: atMs },
      holds,
    );
    holds = result.holds;
    lastMs = atMs;
    lastPoint = result.point;
    evaluations++;
    return JSON.parse(JSON.stringify(lastPoint));
  }
  function reset(assumeCompleteFromMs: number | null = null) {
    if (
      assumeCompleteFromMs !== null &&
      !sloInt(assumeCompleteFromMs, 0, MAX_SLO_TIME)
    )
      throw new SloError("clock");
    events.clear();
    holds = new Map();
    lastMs = null;
    lastPoint = null;
    evicted = 0;
    evaluations = 0;
    coverageStart = assumeCompleteFromMs;
  }
  return {
    record,
    evaluate,
    reset,
    snapshot: () => ({
      retained: events.size,
      evicted,
      evaluations,
      lastMs,
      point:
        lastPoint === null
          ? null
          : (JSON.parse(JSON.stringify(lastPoint)) as SloPoint),
    }),
  };
}
