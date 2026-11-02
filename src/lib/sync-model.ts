import { getByteSize } from "./text-encoding";
export const MAX_SYNC_STATE = 256 * 1024,
  MAX_SYNC_PROJECT = 2 * 1024 * 1024,
  MAX_SYNC_QUEUE = 2 * 1024 * 1024;
export type SyncValue =
  null | boolean | number | string | SyncValue[] | { [key: string]: SyncValue };
export type SyncField = {
  id: string;
  name: string;
  type: "counter" | "set" | "register";
};
export type SyncDefinition = {
  documentId: string;
  actors: { id: string; name: string }[];
  fields: SyncField[];
  links: { from: string; to: string }[];
};
export type SyncClock = Record<string, number>;
export type SyncDot = { actor: string; sequence: number; value: SyncValue };
export type SyncFieldState =
  | { type: "counter"; positive: SyncClock; negative: SyncClock }
  | { type: "set" | "register"; context: SyncClock; entries: SyncDot[] };
export type SyncState = {
  kind: "rsswag-sync-state";
  version: 1;
  schema: string;
  fields: Record<string, SyncFieldState>;
};
export type SyncStep =
  | { type: "increment"; actor: string; field: string; amount: number }
  | { type: "assign"; actor: string; field: string; value: SyncValue }
  | { type: "clear"; actor: string; field: string }
  | { type: "add" | "remove"; actor: string; field: string; value: string }
  | { type: "send"; from: string; to: string }
  | { type: "deliver" | "duplicate" | "drop"; message: string }
  | { type: "link"; from: string; to: string; enabled: boolean }
  | { type: "merge"; actor: string; state: SyncState }
  | { type: "round" };
export class SyncError extends Error {
  constructor(
    public code:
      | "json"
      | "definition"
      | "state"
      | "step"
      | "limit"
      | "capacity"
      | "equivocation"
      | "cancelled",
  ) {
    super(code);
    this.name = "SyncError";
  }
}
export const syncObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const syncInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const syncText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const syncId = (v: unknown): v is string =>
  syncText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
export const syncName = (v: unknown): v is string =>
  syncText(v, 120) && !!v.trim();
export function syncList(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    throw new SyncError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new SyncError("state");
  return v;
}
export const syncKey = (a: string, b: string) => JSON.stringify([a, b]);
export function syncJson(source: string, max = MAX_SYNC_PROJECT): unknown {
  if (getByteSize(source) > max) throw new SyncError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new SyncError("json");
  }
}
export function normalizeSyncValue(value: unknown): SyncValue {
  let nodes = 0;
  function visit(v: unknown, depth: number): SyncValue {
    if (depth > 16 || ++nodes > 1024) throw new SyncError("limit");
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v))
      return Object.is(v, -0) ? 0 : v;
    if (Array.isArray(v))
      return syncList(v, 0, 1024).map((x) => visit(x, depth + 1));
    if (syncObject(v)) {
      const proto = Object.getPrototypeOf(v);
      if (proto === null || Object.getPrototypeOf(proto) === null)
        return Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, visit(v[k], depth + 1)]),
        );
    }
    throw new SyncError("state");
  }
  const result = visit(value, 0);
  if (getByteSize(JSON.stringify(result)) > 2048) throw new SyncError("limit");
  return result;
}
export function normalizeSyncDefinition(v: unknown): SyncDefinition {
  if (!syncObject(v) || !syncId(v.documentId))
    throw new SyncError("definition");
  const actors = syncList(v.actors, 1, 8).map((a) => {
    if (!syncObject(a) || !syncId(a.id) || !syncName(a.name))
      throw new SyncError("definition");
    return { id: a.id, name: a.name };
  });
  const fields = syncList(v.fields, 1, 12).map((f) => {
    if (
      !syncObject(f) ||
      !syncId(f.id) ||
      !syncName(f.name) ||
      !["counter", "set", "register"].includes(f.type as string)
    )
      throw new SyncError("definition");
    return { id: f.id, name: f.name, type: f.type as SyncField["type"] };
  });
  if (
    new Set(actors.map((a) => a.id)).size !== actors.length ||
    new Set(fields.map((f) => f.id)).size !== fields.length
  )
    throw new SyncError("definition");
  const links = syncList(v.links, 0, 56).map((l) => {
    if (
      !syncObject(l) ||
      !actors.some((a) => a.id === l.from) ||
      !actors.some((a) => a.id === l.to) ||
      l.from === l.to
    )
      throw new SyncError("definition");
    return { from: l.from as string, to: l.to as string };
  });
  if (new Set(links.map((l) => syncKey(l.from, l.to))).size !== links.length)
    throw new SyncError("definition");
  return { documentId: v.documentId, actors, fields, links };
}
export function syncSchema(definition: SyncDefinition): string {
  return JSON.stringify([
    definition.documentId,
    definition.actors.map((a) => a.id).sort(),
    definition.fields
      .map((f) => [f.id, f.type])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  ]);
}
export const syncClockValue = (clock: SyncClock, actor: string) =>
  Object.hasOwn(clock, actor) ? clock[actor] : 0;
function normalizeClock(v: unknown, d: SyncDefinition, max: number): SyncClock {
  if (!syncObject(v) || Object.keys(v).length > d.actors.length)
    throw new SyncError("state");
  for (const [key, value] of Object.entries(v))
    if (!d.actors.some((a) => a.id === key) || !syncInt(value, 0, max))
      throw new SyncError("state");
  return Object.fromEntries(
    d.actors
      .map((a) => a.id)
      .sort()
      .filter((id) => Object.hasOwn(v, id) && v[id] !== 0)
      .map((id) => [id, v[id] as number]),
  );
}
export function normalizeSyncState(
  d: SyncDefinition,
  value: unknown,
): SyncState {
  if (
    !syncObject(value) ||
    value.kind !== "rsswag-sync-state" ||
    value.version !== 1 ||
    value.schema !== syncSchema(d) ||
    !syncObject(value.fields) ||
    Object.keys(value.fields).length !== d.fields.length
  )
    throw new SyncError("state");
  const source = value.fields;
  const fields = Object.fromEntries(
    [...d.fields]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((field): [string, SyncFieldState] => {
        const v = Object.hasOwn(source, field.id) ? source[field.id] : null;
        if (!syncObject(v) || v.type !== field.type)
          throw new SyncError("state");
        if (field.type === "counter")
          return [
            field.id,
            {
              type: "counter",
              positive: normalizeClock(v.positive, d, 1000000000),
              negative: normalizeClock(v.negative, d, 1000000000),
            },
          ];
        const context = normalizeClock(v.context, d, 1000000),
          entries = syncList(v.entries, 0, field.type === "register" ? 8 : 64)
            .map((e) => {
              if (
                !syncObject(e) ||
                typeof e.actor !== "string" ||
                !d.actors.some((a) => a.id === e.actor) ||
                !syncInt(e.sequence, 1, syncClockValue(context, e.actor))
              )
                throw new SyncError("state");
              if (field.type === "set" && !syncText(e.value, 120))
                throw new SyncError("state");
              return {
                actor: e.actor,
                sequence: e.sequence,
                value: normalizeSyncValue(e.value),
              };
            })
            .sort((a, b) =>
              a.actor < b.actor
                ? -1
                : a.actor > b.actor
                  ? 1
                  : a.sequence - b.sequence,
            );
        if (
          new Set(entries.map((e) => syncKey(e.actor, String(e.sequence))))
            .size !== entries.length ||
          (field.type === "register" &&
            new Set(entries.map((e) => e.actor)).size !== entries.length)
        )
          throw new SyncError("state");
        return [field.id, { type: field.type, context, entries }];
      }),
  );
  const result: SyncState = {
    kind: "rsswag-sync-state",
    version: 1,
    schema: syncSchema(d),
    fields,
  };
  if (getByteSize(JSON.stringify(result)) > MAX_SYNC_STATE)
    throw new SyncError("capacity");
  return result;
}
export function normalizeSyncStep(d: SyncDefinition, v: unknown): SyncStep {
  if (!syncObject(v)) throw new SyncError("step");
  const type = v.type,
    actor = (value: unknown): value is string =>
      typeof value === "string" && d.actors.some((a) => a.id === value);
  if (type === "round") return { type };
  if (type === "send" || type === "link") {
    if (
      !actor(v.from) ||
      !actor(v.to) ||
      v.from === v.to ||
      (type === "link" && typeof v.enabled !== "boolean")
    )
      throw new SyncError("step");
    return type === "send"
      ? { type, from: v.from, to: v.to }
      : { type, from: v.from, to: v.to, enabled: v.enabled as boolean };
  }
  if (type === "deliver" || type === "duplicate" || type === "drop") {
    if (!syncText(v.message, 80) || !/^message-[1-9]\d{0,5}$/.test(v.message))
      throw new SyncError("step");
    return { type, message: v.message };
  }
  if (!actor(v.actor)) throw new SyncError("step");
  if (type === "merge")
    return { type, actor: v.actor, state: normalizeSyncState(d, v.state) };
  const f = d.fields.find((f) => f.id === v.field);
  if (!f) throw new SyncError("step");
  if (
    type === "increment" &&
    f.type === "counter" &&
    syncInt(v.amount, -1000000, 1000000) &&
    v.amount !== 0
  )
    return { type, actor: v.actor, field: f.id, amount: v.amount };
  if (type === "assign" && f.type === "register")
    return {
      type,
      actor: v.actor,
      field: f.id,
      value: normalizeSyncValue(v.value),
    };
  if (type === "clear" && f.type === "register")
    return { type, actor: v.actor, field: f.id };
  if (
    (type === "add" || type === "remove") &&
    f.type === "set" &&
    syncText(v.value, 120)
  )
    return { type, actor: v.actor, field: f.id, value: v.value };
  throw new SyncError("step");
}
export function newSyncDefinition(): SyncDefinition {
  const actors = [
    { id: "alpha", name: "Laptop" },
    { id: "beta", name: "Phone" },
    { id: "gamma", name: "Server" },
  ];
  return {
    documentId: "sync-document",
    actors,
    fields: [
      { id: "count", name: "Shared counter", type: "counter" },
      { id: "labels", name: "Labels", type: "set" },
      { id: "status", name: "Status", type: "register" },
    ],
    links: actors.flatMap((a) =>
      actors
        .filter((b) => b.id !== a.id)
        .map((b) => ({ from: a.id, to: b.id })),
    ),
  };
}
