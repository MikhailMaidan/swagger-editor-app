import {
  createSloIndex,
  evaluateSloPoint,
  type SloHolds,
  type SloPoint,
} from "./slo-engine";
import {
  MAX_SLO_PROJECT,
  MAX_SLO_TIME,
  MAX_SLO_WINDOW,
  SloError,
  emptySloProject,
  newSloObjective,
  newSloScenario,
  normalizeSloEvent,
  normalizeSloProject,
  sloInt,
  sloJson,
  sloMethod,
  sloObject,
  type SloEvent,
  type SloProject,
  type SloScenario,
  type SloTarget,
} from "./slo-project";
export type SloIncident = {
  ruleId: string;
  ruleName: string;
  fromMs: number;
  toMs: number | null;
  firingPoints: number;
};
export type SloRun = {
  objectiveId: string;
  objectiveName: string;
  scenarioId: string;
  scenarioName: string;
  checked: boolean;
  passed: boolean;
  target: SloTarget;
  firingPoints: number;
  incidents: SloIncident[];
  info: {
    input: number;
    eligible: number;
    excluded: number;
    unmatched: number;
  };
  points: SloPoint[];
};
export function sloTimelineTimes(t: SloScenario["timeline"]): number[] {
  if (
    !sloInt(t.fromMs, 0, MAX_SLO_TIME) ||
    !sloInt(t.toMs, t.fromMs, MAX_SLO_TIME) ||
    !sloInt(t.stepMs, 1, MAX_SLO_WINDOW) ||
    t.toMs - t.fromMs > MAX_SLO_WINDOW ||
    Math.ceil((t.toMs - t.fromMs) / t.stepMs) + 1 > 240
  )
    throw new SloError("limit");
  const times: number[] = [];
  for (let at = t.fromMs; at < t.toMs; at += t.stepMs) times.push(at);
  times.push(t.toMs);
  return times;
}
export function sloIncidents(points: SloPoint[]): SloIncident[] {
  const out: SloIncident[] = [],
    active = new Map<string, SloIncident>();
  for (const point of points)
    for (const rule of point.rules) {
      const current = active.get(rule.id);
      if (rule.status === "firing") {
        if (current) current.firingPoints++;
        else {
          const incident = {
            ruleId: rule.id,
            ruleName: rule.name,
            fromMs: point.atMs,
            toMs: null,
            firingPoints: 1,
          };
          out.push(incident);
          active.set(rule.id, incident);
        }
      } else if (current) {
        current.toMs = point.atMs;
        active.delete(rule.id);
      }
    }
  return out;
}
export async function runSloMatrix(
  value: SloProject,
  scenarioId?: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<SloRun[]> {
  const p = normalizeSloProject(value),
    scenarios = scenarioId
      ? p.scenarios.filter((s) => s.id === scenarioId)
      : p.scenarios;
  if (scenarioId && !scenarios.length) throw new SloError("project");
  const runs: SloRun[] = [],
    total = scenarios.reduce(
      (n, s) => n + sloTimelineTimes(s.timeline).length * p.objectives.length,
      0,
    );
  let done = 0;
  for (const s of scenarios)
    for (const objective of p.objectives) {
      const index = createSloIndex(objective, s.events),
        times = sloTimelineTimes(s.timeline),
        points: SloPoint[] = [];
      let holds: SloHolds = new Map();
      for (let i = 0; i < times.length; i++) {
        if (cancelled()) throw new SloError("cancelled");
        const result = evaluateSloPoint(index, times[i], s.coverage, holds);
        holds = result.holds;
        points.push(result.point);
        done++;
        if ((i + 1) % 20 === 0 || i === times.length - 1)
          await new Promise((r) => setTimeout(r, 0));
      }
      const target = points.at(-1)!.window.target,
        firingPoints = points.reduce((n, p) => n + p.firing, 0),
        incidents = sloIncidents(points),
        expected = Object.hasOwn(s.expect, objective.id)
          ? s.expect[objective.id]
          : undefined;
      runs.push({
        objectiveId: objective.id,
        objectiveName: objective.name,
        scenarioId: s.id,
        scenarioName: s.name,
        checked: !!expected,
        passed:
          !!expected &&
          target === expected.target &&
          firingPoints <= expected.maxFiringPoints &&
          incidents.length <= expected.maxIncidents,
        target,
        firingPoints,
        incidents,
        info: { ...index.info },
        points,
      });
      progress?.(done, total);
    }
  if (cancelled()) throw new SloError("cancelled");
  return runs;
}
export function sloRunReport(runs: SloRun[], details = false) {
  return {
    kind: "rsswag-slo-report",
    version: 1,
    total: runs.length,
    checked: runs.filter((r) => r.checked).length,
    passed: runs.filter((r) => r.passed).length,
    runs: runs.map((r) => ({
      objectiveId: r.objectiveId,
      objectiveName: r.objectiveName,
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      checked: r.checked,
      passed: r.passed,
      target: r.target,
      firingPoints: r.firingPoints,
      incidents: r.incidents.map((i) => ({ ...i })),
      info: { ...r.info },
      final: r.points.at(-1),
      ...(details ? { points: r.points } : {}),
    })),
  };
}
function csvCell(value: unknown): string {
  let s = String(value ?? "");
  // Only strings can carry a formula payload. Guarding numbers too would turn
  // a negative value (e.g. remainingBad once the budget is overspent) into the
  // text "'-25", breaking sums and charts in the exported spreadsheet.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function sloTimelineCsv(run: SloRun): string {
  return [
    "objectiveId,scenarioId,atMs,target,coverage,total,good,bad,sliPercent,remainingBad,remainingPercent,burnRate,infiniteBurn,firingRules",
    ...run.points.map((p) =>
      [
        run.objectiveId,
        run.scenarioId,
        p.atMs,
        p.window.target,
        p.window.coverage,
        p.window.total,
        p.window.good,
        p.window.bad,
        p.window.sliPercent,
        p.window.remainingBad,
        p.window.remainingPercent,
        p.window.burnRate,
        p.window.infiniteBurn,
        p.firing,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}
function importedScenario(events: SloEvent[], id: string): SloScenario {
  if (!events.length) throw new SloError("event");
  const fromMs = Math.min(...events.map((e) => e.atMs)),
    toMs = Math.max(...events.map((e) => e.atMs));
  if (toMs - fromMs > MAX_SLO_WINDOW) throw new SloError("limit");
  return {
    ...newSloScenario(id),
    name: id,
    events,
    coverage: null,
    timeline: {
      fromMs,
      toMs,
      stepMs: Math.max(1, Math.ceil((toMs - fromMs) / 119)),
    },
  };
}
function validHarDate(value: string): boolean {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!m) return false;
  const [, year, month, day, hour, minute, second, zone] = m,
    date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day) &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second) < 60 &&
    (zone === "Z" ||
      (Number(zone.slice(1, 3)) < 24 && Number(zone.slice(4)) < 60)) &&
    Number.isFinite(Date.parse(value))
  );
}
export function importSloHar(
  source: string,
  id = "scenario-har",
): { scenario: SloScenario; skipped: number } {
  const data = sloJson(source, 5 * 1024 * 1024);
  if (
    !sloObject(data) ||
    !sloObject(data.log) ||
    !Array.isArray(data.log.entries)
  )
    throw new SloError("har");
  if (data.log.entries.length > 5000) throw new SloError("limit");
  const events: SloEvent[] = [];
  let skipped = 0;
  for (const entry of data.log.entries) {
    try {
      if (
        !sloObject(entry) ||
        !sloObject(entry.request) ||
        !sloObject(entry.response) ||
        typeof entry.startedDateTime !== "string" ||
        !validHarDate(entry.startedDateTime) ||
        typeof entry.request.url !== "string" ||
        typeof entry.request.method !== "string" ||
        typeof entry.time !== "number" ||
        !Number.isFinite(entry.time) ||
        entry.time < 0 ||
        entry.time > 86400000
      )
        throw new SloError("har");
      const url = new URL(entry.request.url);
      if (!["http:", "https:"].includes(url.protocol))
        throw new SloError("har");
      const atMs = Math.round(Date.parse(entry.startedDateTime) + entry.time);
      const e = normalizeSloEvent({
        id: `har-${events.length + 1}`,
        name: `HAR completion ${events.length + 1}`,
        atMs,
        service: "har-service",
        route: url.pathname,
        method: entry.request.method.toUpperCase(),
        status: entry.response.status,
        latencyMs: entry.time,
        weight: 1,
        excluded: false,
      });
      events.push(e);
    } catch {
      skipped++;
    }
  }
  if (!events.length) throw new SloError("har");
  return { scenario: importedScenario(events, id), skipped };
}
export function importSloNdjson(
  source: string,
  id = "scenario-ndjson",
): SloScenario {
  if (new TextEncoder().encode(source).length > MAX_SLO_PROJECT)
    throw new SloError("limit");
  const lines = source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length > 5000) throw new SloError("limit");
  const events = lines.map((l) => normalizeSloEvent(sloJson(l)));
  if (new Set(events.map((e) => e.id)).size !== events.length)
    throw new SloError("duplicate");
  return importedScenario(events, id);
}
export type SloGenerator = {
  count: number;
  startMs: number;
  spacingMs: number;
  badFrom: number;
  badCount: number;
  goodLatencyMs: number;
  badLatencyMs: number;
  badStatus: number;
  service: string;
  route: string;
  method: string;
  weight: number;
};
export function generateSloTraffic(
  v: SloGenerator,
  id = "scenario-generated",
): SloScenario {
  if (!sloObject(v)) throw new SloError("event");
  if (
    !sloInt(v.count, 1, 5000) ||
    !sloInt(v.startMs, 0, MAX_SLO_TIME) ||
    !sloInt(v.spacingMs, 0, MAX_SLO_WINDOW) ||
    !sloInt(v.badFrom, 0, v.count) ||
    !sloInt(v.badCount, 0, v.count - v.badFrom) ||
    !sloInt(v.goodLatencyMs, 0, 86400000) ||
    !sloInt(v.badLatencyMs, 0, 86400000) ||
    !sloInt(v.badStatus, 100, 599) ||
    !sloMethod(v.method) ||
    !sloInt(v.weight, 1, 1000000)
  )
    throw new SloError("event");
  const toMs = v.startMs + (v.count - 1) * v.spacingMs;
  if (toMs > MAX_SLO_TIME || toMs - v.startMs > MAX_SLO_WINDOW)
    throw new SloError("limit");
  const events = Array.from({ length: v.count }, (_, i) => {
    const bad = i >= v.badFrom && i < v.badFrom + v.badCount;
    return normalizeSloEvent({
      id: `generated-${i + 1}`,
      name: `Generated completion ${i + 1}`,
      atMs: v.startMs + i * v.spacingMs,
      service: v.service,
      route: v.route,
      method: v.method,
      status: bad ? v.badStatus : 200,
      latencyMs: bad ? v.badLatencyMs : v.goodLatencyMs,
      weight: v.weight,
      excluded: false,
    });
  });
  return {
    ...importedScenario(events, id),
    coverage: { fromMs: v.startMs, toMs },
  };
}
export function demoSloProject(): SloProject {
  const p = emptySloProject();
  p.name = "Availability, latency and telemetry confidence";
  const base = Date.UTC(2026, 10, 2),
    availability = {
      ...newSloObjective("availability"),
      name: "Availability 99%",
      scope: { service: "store", route: "", method: "*" },
    },
    latency = {
      ...newSloObjective("latency"),
      name: "Success within 100 ms",
      mode: "combined" as const,
      targetPpm: 950000,
      thresholdMs: 100,
      scope: { service: "store", route: "", method: "*" },
    },
    capture = {
      ...structuredClone(availability),
      id: "capture-only",
      name: "Observed capture only",
      requireCoverage: false,
    };
  p.objectives = [availability, latency, capture];
  const events = (bad: (at: number) => boolean, excluded = false) =>
    Array.from({ length: 181 }, (_, i): SloEvent => {
      const atMs = base - 60000 + i * 1000,
        fail = bad(atMs);
      return {
        id: `event-${i + 1}`,
        name: `Completion ${i + 1}`,
        atMs,
        service: "store",
        route: "/orders",
        method: "GET",
        status: fail ? 503 : 200,
        latencyMs: fail ? 900 : 40,
        weight: 1,
        excluded: fail && excluded,
      };
    });
  const scenario = (
    id: string,
    name: string,
    data: SloEvent[],
    target: SloTarget,
    alerts: boolean,
    coverage: SloScenario["coverage"] = {
      fromMs: base - 120000,
      toMs: base + 120000,
    },
  ): SloScenario => ({
    id,
    name,
    events: data,
    coverage,
    timeline: { fromMs: base, toMs: base + 120000, stepMs: 2000 },
    expect: Object.fromEntries(
      p.objectives.map((o) => [
        o.id,
        {
          target,
          maxFiringPoints: alerts ? 960 : 0,
          maxIncidents: alerts ? 1 : 0,
        },
      ]),
    ),
  });
  const spike = (at: number) => at >= base + 20000 && at <= base + 50000,
    ongoing = (at: number) => at >= base + 80000;
  p.scenarios = [
    scenario(
      "healthy",
      "Healthy request stream",
      events(() => false),
      "met",
      false,
    ),
    scenario(
      "recovery",
      "Outage followed by recovery",
      events(spike),
      "met",
      true,
    ),
    scenario(
      "ongoing",
      "Ongoing bad responses",
      events(ongoing),
      "missed",
      true,
    ),
    scenario(
      "maintenance",
      "Explicitly excluded maintenance",
      events(spike, true),
      "met",
      false,
    ),
    scenario(
      "unknown",
      "Capture coverage is unknown",
      events(ongoing),
      "unknown",
      false,
      null,
    ),
    scenario(
      "sparse",
      "No eligible traffic in the final window",
      [...events(() => false).filter((_, i) => i === 60 || i === 120)],
      "no-data",
      false,
    ),
  ];
  p.scenarios[4].expect["capture-only"] = {
    target: "missed",
    maxFiringPoints: 960,
    maxIncidents: 1,
  };
  return normalizeSloProject(p);
}
