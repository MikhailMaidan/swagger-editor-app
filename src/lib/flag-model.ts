import { getByteSize } from "./text-encoding";
export const MAX_FLAG_PROJECT = 2 * 1024 * 1024,
  MAX_FLAG_DEFINITION = 256 * 1024,
  MAX_FLAG_TIME = 4102531200000;
export type FlagJson =
  null | boolean | number | string | FlagJson[] | { [key: string]: FlagJson };
export type FlagCondition = {
  pointer: string;
  operator:
    | "exists"
    | "absent"
    | "equal"
    | "notEqual"
    | "in"
    | "contains"
    | "startsWith"
    | "greater"
    | "greaterOrEqual"
    | "less"
    | "lessOrEqual";
  value?: FlagJson;
};
export type FlagSegment = {
  id: string;
  name: string;
  conditions: FlagCondition[];
};
export type FlagVariant = {
  id: string;
  name: string;
  weightPpm: number;
  value: FlagJson;
};
export type FlagRule = {
  id: string;
  name: string;
  include: string[];
  exclude: string[];
  conditions: FlagCondition[];
  rolloutPpm: number;
  variantId: string;
};
export type FeatureFlag = {
  id: string;
  name: string;
  kind: "boolean" | "string" | "number" | "json";
  enabled: boolean;
  salt: string;
  rolloutPpm: number;
  offValue: FlagJson;
  startMs: number | null;
  endMs: number | null;
  include: string[];
  exclude: string[];
  prerequisites: { flagId: string; variantId: string }[];
  variants: FlagVariant[];
  rules: FlagRule[];
};
export type FlagDefinition = {
  salt: string;
  segments: FlagSegment[];
  flags: FeatureFlag[];
};
export type FlagContext = {
  key: string;
  attributes: { [key: string]: FlagJson };
  nowMs: number;
};
export type FlagReason =
  | "disabled"
  | "schedule"
  | "excluded"
  | "audience"
  | "prerequisite"
  | "rule"
  | "rollout"
  | "allocated";
export type FlagExpectation = {
  variantId: string | null;
  served: boolean;
  reason?: FlagReason;
};
export type FlagCase = {
  id: string;
  name: string;
  context: FlagContext;
  expect: Record<string, FlagExpectation>;
};
export type FlagProject = {
  kind: "rsswag-flag-project";
  version: 1;
  name: string;
  definition: FlagDefinition;
  candidate: FlagDefinition | null;
  cases: FlagCase[];
  planner: FlagPlanner;
};
export type FlagPlanner = {
  count: number;
  prefix: string;
  attributes: FlagContext["attributes"];
  nowMs: number;
  stages: number[];
};
export class FlagError extends Error {
  constructor(
    public code:
      | "json"
      | "definition"
      | "context"
      | "reference"
      | "cycle"
      | "limit"
      | "crypto"
      | "cancelled",
  ) {
    super(code);
    this.name = "FlagError";
  }
}
export const flagObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const flagInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const flagText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const flagId = (v: unknown): v is string =>
  flagText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
export const flagName = (v: unknown): v is string =>
  flagText(v, 120) && !!v.trim();
export function flagList(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new FlagError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new FlagError("definition");
  return v;
}
export function flagJson(source: string, max = MAX_FLAG_PROJECT): unknown {
  if (getByteSize(source) > max) throw new FlagError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new FlagError("json");
  }
}
export function normalizeFlagJson(input: unknown, maxBytes = 2048): FlagJson {
  let nodes = 0;
  function visit(v: unknown, depth: number): FlagJson {
    if (depth > 12 || ++nodes > 512) throw new FlagError("limit");
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v))
      return Object.is(v, -0) ? 0 : v;
    if (Array.isArray(v))
      return flagList(v, 512).map((x) => visit(x, depth + 1));
    if (flagObject(v)) {
      const proto = Object.getPrototypeOf(v);
      if (proto === null || Object.getPrototypeOf(proto) === null)
        return Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, visit(v[k], depth + 1)]),
        );
    }
    throw new FlagError("definition");
  }
  const value = visit(input, 0);
  if (getByteSize(JSON.stringify(value)) > maxBytes)
    throw new FlagError("limit");
  return value;
}
function unique<T extends { id: string }>(values: T[]) {
  if (new Set(values.map((v) => v.id)).size !== values.length)
    throw new FlagError("definition");
  return values;
}
function ids(v: unknown) {
  const values = flagList(v, 16).map((id) => {
    if (!flagId(id)) throw new FlagError("definition");
    return id;
  });
  if (new Set(values).size !== values.length) throw new FlagError("definition");
  return values;
}
function conditions(v: unknown): FlagCondition[] {
  return flagList(v, 16).map((c) => {
    if (
      !flagObject(c) ||
      !flagText(c.pointer, 256) ||
      (c.pointer !== "" && !c.pointer.startsWith("/")) ||
      /~(?![01])/.test(c.pointer) ||
      ![
        "exists",
        "absent",
        "equal",
        "notEqual",
        "in",
        "contains",
        "startsWith",
        "greater",
        "greaterOrEqual",
        "less",
        "lessOrEqual",
      ].includes(c.operator as string)
    )
      throw new FlagError("definition");
    const operator = c.operator as FlagCondition["operator"];
    return {
      pointer: c.pointer,
      operator,
      ...(operator === "exists" || operator === "absent"
        ? {}
        : { value: normalizeFlagJson(c.value) }),
    };
  });
}
function typedValue(kind: FeatureFlag["kind"], input: unknown) {
  const value = normalizeFlagJson(input);
  if (kind !== "json" && typeof value !== kind)
    throw new FlagError("definition");
  return value;
}
export function normalizeFeatureFlag(v: unknown): FeatureFlag {
  if (
    !flagObject(v) ||
    !flagId(v.id) ||
    !flagName(v.name) ||
    !["boolean", "string", "number", "json"].includes(v.kind as string) ||
    typeof v.enabled !== "boolean" ||
    !flagText(v.salt, 80) ||
    !v.salt ||
    !flagInt(v.rolloutPpm, 0, 1000000) ||
    (v.startMs !== null && !flagInt(v.startMs, 0, MAX_FLAG_TIME)) ||
    (v.endMs !== null && !flagInt(v.endMs, 0, MAX_FLAG_TIME)) ||
    (v.startMs !== null &&
      v.endMs !== null &&
      (v.endMs as number) <= (v.startMs as number))
  )
    throw new FlagError("definition");
  const kind = v.kind as FeatureFlag["kind"],
    variants = unique(
      flagList(v.variants, 8).map((x) => {
        if (
          !flagObject(x) ||
          !flagId(x.id) ||
          !flagName(x.name) ||
          !flagInt(x.weightPpm, 0, 1000000)
        )
          throw new FlagError("definition");
        return {
          id: x.id,
          name: x.name,
          weightPpm: x.weightPpm,
          value: typedValue(kind, x.value),
        };
      }),
    );
  if (
    !variants.length ||
    variants.reduce((n, x) => n + x.weightPpm, 0) !== 1000000
  )
    throw new FlagError("definition");
  const rules = unique(
    flagList(v.rules, 8).map((x) => {
      if (
        !flagObject(x) ||
        !flagId(x.id) ||
        !flagName(x.name) ||
        !flagInt(x.rolloutPpm, 0, 1000000) ||
        !variants.some((y) => y.id === x.variantId)
      )
        throw new FlagError("definition");
      return {
        id: x.id,
        name: x.name,
        include: ids(x.include),
        exclude: ids(x.exclude),
        conditions: conditions(x.conditions),
        rolloutPpm: x.rolloutPpm,
        variantId: x.variantId as string,
      };
    }),
  );
  const prerequisites = flagList(v.prerequisites, 8).map((p) => {
    if (!flagObject(p) || !flagId(p.flagId) || !flagId(p.variantId))
      throw new FlagError("definition");
    return { flagId: p.flagId, variantId: p.variantId };
  });
  if (new Set(prerequisites.map((p) => p.flagId)).size !== prerequisites.length)
    throw new FlagError("definition");
  return {
    id: v.id,
    name: v.name,
    kind,
    enabled: v.enabled,
    salt: v.salt,
    rolloutPpm: v.rolloutPpm,
    offValue: typedValue(kind, v.offValue),
    startMs: v.startMs as number | null,
    endMs: v.endMs as number | null,
    include: ids(v.include),
    exclude: ids(v.exclude),
    prerequisites,
    variants,
    rules,
  };
}
export function normalizeFlagDefinition(v: unknown): FlagDefinition {
  if (!flagObject(v) || !flagText(v.salt, 80) || !v.salt)
    throw new FlagError("definition");
  const segments = unique(
      flagList(v.segments, 16).map((s) => {
        if (!flagObject(s) || !flagId(s.id) || !flagName(s.name))
          throw new FlagError("definition");
        return { id: s.id, name: s.name, conditions: conditions(s.conditions) };
      }),
    ),
    flags = unique(flagList(v.flags, 16).map(normalizeFeatureFlag));
  if (!flags.length) throw new FlagError("definition");
  for (const f of flags) {
    for (const segment of [
      ...f.include,
      ...f.exclude,
      ...f.rules.flatMap((r) => [...r.include, ...r.exclude]),
    ])
      if (!segments.some((s) => s.id === segment))
        throw new FlagError("reference");
    for (const p of f.prerequisites)
      if (
        !flags.some(
          (other) =>
            other.id === p.flagId &&
            other.variants.some((x) => x.id === p.variantId),
        )
      )
        throw new FlagError("reference");
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function walk(id: string) {
    if (visiting.has(id)) throw new FlagError("cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    flags
      .find((f) => f.id === id)!
      .prerequisites.forEach((p) => walk(p.flagId));
    visiting.delete(id);
    visited.add(id);
  }
  flags.forEach((f) => walk(f.id));
  const d = { salt: v.salt, segments, flags };
  if (getByteSize(JSON.stringify(d)) > MAX_FLAG_DEFINITION)
    throw new FlagError("limit");
  return d;
}
export function normalizeFlagContext(v: unknown): FlagContext {
  if (
    !flagObject(v) ||
    !flagText(v.key, 256) ||
    !v.key.trim() ||
    !flagObject(v.attributes) ||
    !flagInt(v.nowMs, 0, MAX_FLAG_TIME)
  )
    throw new FlagError("context");
  return {
    key: v.key,
    attributes: normalizeFlagJson(
      v.attributes,
      8192,
    ) as FlagContext["attributes"],
    nowMs: v.nowMs,
  };
}
export function normalizeFlagProject(v: unknown): FlagProject {
  if (
    !flagObject(v) ||
    v.kind !== "rsswag-flag-project" ||
    v.version !== 1 ||
    !flagName(v.name)
  )
    throw new FlagError("definition");
  const definition = normalizeFlagDefinition(v.definition),
    candidate =
      v.candidate === null ? null : normalizeFlagDefinition(v.candidate),
    cases = unique(
      flagList(v.cases, 200).map((c) => {
        if (
          !flagObject(c) ||
          !flagId(c.id) ||
          !flagName(c.name) ||
          !flagObject(c.expect)
        )
          throw new FlagError("definition");
        const expect = Object.fromEntries(
          Object.entries(c.expect).map(([id, e]) => {
            const f = definition.flags.find((f) => f.id === id);
            if (
              !f ||
              !flagObject(e) ||
              typeof e.served !== "boolean" ||
              (e.variantId !== null &&
                !f.variants.some((x) => x.id === e.variantId)) ||
              (e.served && e.variantId === null) ||
              (!e.served && e.variantId !== null) ||
              (e.reason !== undefined &&
                ![
                  "disabled",
                  "schedule",
                  "excluded",
                  "audience",
                  "prerequisite",
                  "rule",
                  "rollout",
                  "allocated",
                ].includes(e.reason as string))
            )
              throw new FlagError("reference");
            return [
              id,
              {
                variantId: e.variantId as string | null,
                served: e.served,
                ...(e.reason === undefined
                  ? {}
                  : { reason: e.reason as FlagReason }),
              },
            ];
          }),
        );
        return {
          id: c.id,
          name: c.name,
          context: normalizeFlagContext(c.context),
          expect,
        };
      }),
    );
  const p: FlagProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    definition,
    candidate,
    cases,
    planner: normalizeFlagPlanner(v.planner),
  };
  if (getByteSize(JSON.stringify(p)) > MAX_FLAG_PROJECT)
    throw new FlagError("limit");
  return p;
}
export function normalizeFlagPlanner(v: unknown): FlagPlanner {
  if (
    !flagObject(v) ||
    !flagInt(v.count, 1, 500) ||
    !flagText(v.prefix, 80) ||
    !v.prefix.trim() ||
    !flagObject(v.attributes) ||
    !flagInt(v.nowMs, 0, MAX_FLAG_TIME)
  )
    throw new FlagError("context");
  const stages = flagList(v.stages, 8).map((n) => {
    if (!flagInt(n, 0, 1000000)) throw new FlagError("definition");
    return n;
  });
  if (!stages.length || stages.some((n, i) => i > 0 && n <= stages[i - 1]))
    throw new FlagError("definition");
  return {
    count: v.count,
    prefix: v.prefix,
    attributes: normalizeFlagJson(
      v.attributes,
      8192,
    ) as FlagContext["attributes"],
    nowMs: v.nowMs,
    stages,
  };
}
export const parseFlagProject = (source: string) =>
  normalizeFlagProject(flagJson(source));
export function serializeFlagProject(p: FlagProject) {
  const v = normalizeFlagProject(p),
    pretty = JSON.stringify(v, null, 2);
  return getByteSize(pretty) <= MAX_FLAG_PROJECT ? pretty : JSON.stringify(v);
}
export function flagPercentToPpm(value: string) {
  const m = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!m) throw new FlagError("definition");
  const n = Number(m[1]) * 10000 + Number((m[2] ?? "").padEnd(4, "0"));
  if (n > 1000000) throw new FlagError("definition");
  return n;
}
export const newFeatureFlag = (id = "flag-1"): FeatureFlag => ({
  id,
  name: id,
  kind: "boolean",
  enabled: true,
  salt: "stable-v1",
  rolloutPpm: 100000,
  offValue: false,
  startMs: null,
  endMs: null,
  include: [],
  exclude: [],
  prerequisites: [],
  variants: [{ id: "on", name: "Enabled", weightPpm: 1000000, value: true }],
  rules: [],
});
export const newFlagCase = (id = "case-1"): FlagCase => ({
  id,
  name: id,
  context: { key: id, attributes: { plan: "free", staff: false }, nowMs: 2000 },
  expect: {},
});
export const emptyFlagProject = (): FlagProject => ({
  kind: "rsswag-flag-project",
  version: 1,
  name: "API feature rollout",
  definition: {
    salt: "environment-v1",
    segments: [],
    flags: [newFeatureFlag()],
  },
  candidate: null,
  cases: [newFlagCase()],
  planner: {
    count: 100,
    prefix: "subject",
    attributes: { plan: "pro", staff: false, blocked: false },
    nowMs: 2000,
    stages: [0, 100000, 250000, 500000, 1000000],
  },
});
