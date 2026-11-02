import { getByteSize } from "./text-encoding";
export const MAX_SLO_PROJECT = 2 * 1024 * 1024,
  MAX_SLO_WINDOW = 90 * 86400000,
  MAX_SLO_TIME = 4102531200000;
export type SloCoverage = { fromMs: number; toMs: number } | null;
export type SloEvent = {
  id: string;
  name: string;
  atMs: number;
  service: string;
  route: string;
  method: string;
  status: number;
  latencyMs: number;
  weight: number;
  excluded: boolean;
};
export type SloRule = {
  id: string;
  name: string;
  longMs: number;
  shortMs: number;
  burnMilli: number;
  minLongUnits: number;
  minShortUnits: number;
  forMs: number;
};
export type SloObjective = {
  id: string;
  name: string;
  mode: "availability" | "latency" | "combined";
  targetPpm: number;
  windowMs: number;
  thresholdMs: number;
  requireCoverage: boolean;
  scope: { service: string; route: string; method: string };
  goodStatuses: { from: number; to: number }[];
  rules: SloRule[];
};
export type SloTarget = "met" | "missed" | "no-data" | "unknown";
export type SloExpectation = {
  target: SloTarget;
  maxFiringPoints: number;
  maxIncidents: number;
};
export type SloScenario = {
  id: string;
  name: string;
  events: SloEvent[];
  coverage: SloCoverage;
  timeline: { fromMs: number; toMs: number; stepMs: number };
  expect: Record<string, SloExpectation>;
};
export type SloProject = {
  kind: "rsswag-slo-project";
  version: 1;
  name: string;
  objectives: SloObjective[];
  scenarios: SloScenario[];
};
export class SloError extends Error {
  constructor(
    public code:
      | "json"
      | "project"
      | "event"
      | "limit"
      | "har"
      | "clock"
      | "late"
      | "duplicate"
      | "cancelled",
  ) {
    super(code);
    this.name = "SloError";
  }
}
export const sloObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const sloInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const sloText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
const id = (v: unknown): v is string =>
  sloText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
const named = (v: unknown): v is string => sloText(v, 120) && !!v.trim();
export const sloMethod = (v: unknown): v is string =>
  sloText(v, 20) && /^[A-Z][A-Z0-9_-]*$/.test(v);
export function sloList(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    throw new SloError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new SloError("project");
  return v;
}
function unique<T extends { id: string }>(values: T[]): T[] {
  if (new Set(values.map((v) => v.id)).size !== values.length)
    throw new SloError("project");
  return values;
}
export function sloJson(source: string, max = MAX_SLO_PROJECT): unknown {
  if (getByteSize(source) > max) throw new SloError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new SloError("json");
  }
}
export function normalizeSloCoverage(v: unknown): SloCoverage {
  if (v === null) return null;
  if (
    !sloObject(v) ||
    !sloInt(v.fromMs, 0, MAX_SLO_TIME) ||
    !sloInt(v.toMs, v.fromMs, MAX_SLO_TIME)
  )
    throw new SloError("project");
  return { fromMs: v.fromMs, toMs: v.toMs };
}
export function normalizeSloEvent(v: unknown): SloEvent {
  if (
    !sloObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !sloInt(v.atMs, 0, MAX_SLO_TIME) ||
    !sloText(v.service, 120) ||
    !sloText(v.route, 256) ||
    !sloMethod(v.method) ||
    !sloInt(v.status, 100, 599) ||
    typeof v.latencyMs !== "number" ||
    !Number.isFinite(v.latencyMs) ||
    v.latencyMs < 0 ||
    v.latencyMs > 86400000 ||
    !sloInt(v.weight, 1, 1000000) ||
    typeof v.excluded !== "boolean"
  )
    throw new SloError("event");
  return {
    id: v.id,
    name: v.name,
    atMs: v.atMs,
    service: v.service,
    route: v.route,
    method: v.method,
    status: v.status,
    latencyMs: v.latencyMs,
    weight: v.weight,
    excluded: v.excluded,
  };
}
export function normalizeSloObjective(v: unknown): SloObjective {
  if (
    !sloObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !["availability", "latency", "combined"].includes(v.mode as string) ||
    !sloInt(v.targetPpm, 1, 1000000) ||
    !sloInt(v.windowMs, 1, MAX_SLO_WINDOW) ||
    !sloInt(v.thresholdMs, 0, 86400000) ||
    typeof v.requireCoverage !== "boolean" ||
    !sloObject(v.scope) ||
    !sloText(v.scope.service, 120) ||
    !sloText(v.scope.route, 256) ||
    !(v.scope.method === "*" || sloMethod(v.scope.method))
  )
    throw new SloError("project");
  const goodStatuses = sloList(v.goodStatuses, 1, 8).map((r) => {
    if (
      !sloObject(r) ||
      !sloInt(r.from, 100, 599) ||
      !sloInt(r.to, r.from, 599)
    )
      throw new SloError("project");
    return { from: r.from, to: r.to };
  });
  const windowMs = v.windowMs;
  const rules = unique(
    sloList(v.rules, 0, 4).map((r): SloRule => {
      if (
        !sloObject(r) ||
        !id(r.id) ||
        !named(r.name) ||
        !sloInt(r.longMs, 1, windowMs) ||
        !sloInt(r.shortMs, 1, r.longMs) ||
        !sloInt(r.burnMilli, 1, 1000000000) ||
        !sloInt(r.minLongUnits, 1, 5000000000) ||
        !sloInt(r.minShortUnits, 1, 5000000000) ||
        !sloInt(r.forMs, 0, windowMs)
      )
        throw new SloError("project");
      return {
        id: r.id,
        name: r.name,
        longMs: r.longMs,
        shortMs: r.shortMs,
        burnMilli: r.burnMilli,
        minLongUnits: r.minLongUnits,
        minShortUnits: r.minShortUnits,
        forMs: r.forMs,
      };
    }),
  );
  return {
    id: v.id,
    name: v.name,
    mode: v.mode as SloObjective["mode"],
    targetPpm: v.targetPpm,
    windowMs,
    thresholdMs: v.thresholdMs,
    requireCoverage: v.requireCoverage,
    scope: {
      service: v.scope.service,
      route: v.scope.route,
      method: v.scope.method as string,
    },
    goodStatuses,
    rules,
  };
}
export function normalizeSloScenario(
  v: unknown,
  objectives: SloObjective[],
): SloScenario {
  if (
    !sloObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !sloObject(v.timeline) ||
    !sloInt(v.timeline.fromMs, 0, MAX_SLO_TIME) ||
    !sloInt(v.timeline.toMs, v.timeline.fromMs, MAX_SLO_TIME) ||
    v.timeline.toMs - v.timeline.fromMs > MAX_SLO_WINDOW ||
    !sloInt(v.timeline.stepMs, 1, MAX_SLO_WINDOW) ||
    !sloObject(v.expect)
  )
    throw new SloError("project");
  if (
    Math.ceil((v.timeline.toMs - v.timeline.fromMs) / v.timeline.stepMs) + 1 >
    240
  )
    throw new SloError("limit");
  const expect = Object.fromEntries(
    Object.entries(v.expect).map(([key, e]) => {
      if (
        !objectives.some((o) => o.id === key) ||
        !sloObject(e) ||
        !["met", "missed", "no-data", "unknown"].includes(e.target as string) ||
        !sloInt(e.maxFiringPoints, 0, 960) ||
        !sloInt(e.maxIncidents, 0, 960)
      )
        throw new SloError("project");
      return [
        key,
        {
          target: e.target as SloTarget,
          maxFiringPoints: e.maxFiringPoints,
          maxIncidents: e.maxIncidents,
        },
      ];
    }),
  );
  return {
    id: v.id,
    name: v.name,
    events: unique(sloList(v.events, 0, 5000).map(normalizeSloEvent)),
    coverage: normalizeSloCoverage(v.coverage),
    timeline: {
      fromMs: v.timeline.fromMs,
      toMs: v.timeline.toMs,
      stepMs: v.timeline.stepMs,
    },
    expect,
  };
}
export function normalizeSloProject(v: unknown): SloProject {
  if (
    !sloObject(v) ||
    v.kind !== "rsswag-slo-project" ||
    v.version !== 1 ||
    !named(v.name)
  )
    throw new SloError("project");
  const objectives = unique(
      sloList(v.objectives, 1, 5).map(normalizeSloObjective),
    ),
    scenarios = unique(
      sloList(v.scenarios, 0, 8).map((s) =>
        normalizeSloScenario(s, objectives),
      ),
    ),
    p: SloProject = {
      kind: "rsswag-slo-project",
      version: 1,
      name: v.name,
      objectives,
      scenarios,
    };
  if (getByteSize(JSON.stringify(p)) > MAX_SLO_PROJECT)
    throw new SloError("limit");
  return p;
}
export const parseSloProject = (s: string) => normalizeSloProject(sloJson(s));
export function serializeSloProject(p: SloProject): string {
  const value = normalizeSloProject(p),
    pretty = JSON.stringify(value, null, 2);
  return getByteSize(pretty) <= MAX_SLO_PROJECT
    ? pretty
    : JSON.stringify(value);
}
export function sloPercentToPpm(value: string): number {
  const m = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!m) throw new SloError("project");
  const n = Number(m[1]) * 10000 + Number((m[2] ?? "").padEnd(4, "0"));
  if (n < 1 || n > 1000000) throw new SloError("project");
  return n;
}
export function newSloObjective(id = "objective-1"): SloObjective {
  return {
    id,
    name: id,
    mode: "availability",
    targetPpm: 990000,
    windowMs: 60000,
    thresholdMs: 300,
    requireCoverage: true,
    scope: { service: "", route: "", method: "*" },
    goodStatuses: [{ from: 200, to: 399 }],
    rules: [
      {
        id: "fast",
        name: "Fast burn",
        longMs: 30000,
        shortMs: 10000,
        burnMilli: 2000,
        minLongUnits: 5,
        minShortUnits: 2,
        forMs: 4000,
      },
    ],
  };
}
export function newSloScenario(id = "scenario-1"): SloScenario {
  const at = Date.UTC(2026, 10, 2);
  return {
    id,
    name: id,
    events: [],
    coverage: null,
    timeline: { fromMs: at, toMs: at + 120000, stepMs: 2000 },
    expect: {},
  };
}
export function emptySloProject(): SloProject {
  return {
    kind: "rsswag-slo-project",
    version: 1,
    name: "API service-level objectives",
    objectives: [newSloObjective()],
    scenarios: [newSloScenario()],
  };
}
