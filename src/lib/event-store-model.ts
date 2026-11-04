import { getByteSize } from "./text-encoding";
export const MAX_EVENT_PROJECT = 2 * 1024 * 1024,
  MAX_EVENT_LOG = 4 * 1024 * 1024,
  MAX_EVENT_DEFINITION = 128 * 1024;
export type EventJson =
  null | boolean | number | string | EventJson[] | { [key: string]: EventJson };
export type EventKind =
  "string" | "integer" | "number" | "boolean" | "object" | "array" | "null";
export type EventContract = {
  id: string;
  name: string;
  version: number;
  fields: { pointer: string; kind: EventKind; required: boolean }[];
};
export type EventUpcaster = {
  type: string;
  fromVersion: number;
  rename: { from: string; to: string }[];
  defaults: Record<string, EventJson>;
};
export type EventSource =
  | { source: "payload"; pointer: string }
  | { source: "literal"; value: EventJson }
  | { source: "event"; field: "id" | "stream" | "revision" | "position" };
export type ProjectionOperation =
  | {
      op: "set" | "increment" | "appendUnique";
      field: string;
      value: EventSource;
    }
  | { op: "unset"; field: string }
  | { op: "assert"; field: string; min: number; max: number };
export type ProjectionRule = {
  id: string;
  eventType: string;
  key: EventSource;
  mode: "upsert" | "create" | "update" | "delete";
  operations: ProjectionOperation[];
};
export type EventProjection = {
  id: string;
  name: string;
  rules: ProjectionRule[];
};
export type EventStoreDefinition = {
  name: string;
  capacity: number;
  types: EventContract[];
  upcasters: EventUpcaster[];
  projections: EventProjection[];
};
export type RawStoredEvent = {
  id: string;
  type: string;
  version: number;
  payload: Record<string, EventJson>;
};
export type EventAppend = {
  type: "append";
  stream: string;
  expectedRevision: number;
  events: RawStoredEvent[];
};
export type EventStoreCommand =
  | EventAppend
  | { type: "project"; projectionId: string; limit: number }
  | { type: "rebuild"; projectionId: string }
  | { type: "skip"; projectionId: string; position: number };
export type StoredEvent = RawStoredEvent & {
  stream: string;
  revision: number;
  position: number;
};
export type EventLog = {
  kind: "rsswag-event-log";
  version: 1;
  batches: EventAppend[];
};
export type ProjectionRow = {
  key: string | number;
  fields: Record<string, EventJson>;
};
export type ProjectionState = {
  id: string;
  checkpoint: number;
  applied: number;
  skipped: number;
  error: null | { position: number; reason: string };
  rows: ProjectionRow[];
};
export type EventStoreMetrics = Record<
  | "appended"
  | "batches"
  | "duplicates"
  | "rejected"
  | "projected"
  | "skipped"
  | "rebuilds",
  number
>;
export type EventStoreJournal = {
  command: number;
  type: EventStoreCommand["type"];
  reason: string;
  position: number;
  processed: number;
  projectionId: string | null;
};
export type EventStoreSnapshot = {
  events: StoredEvent[];
  batches: EventAppend[];
  projections: ProjectionState[];
  commands: number;
  metrics: EventStoreMetrics;
  journal: EventStoreJournal[];
};
export type EventStoreDecision = {
  accepted: boolean;
  reason: string;
  position: number;
  processed: number;
  revision: number | null;
};
export type EventViewExpectation = {
  projectionId: string;
  key: string | number;
  field: string;
  value?: EventJson;
  missing?: boolean;
};
export type EventStoreExpectation = {
  events: number;
  streams: number;
  maxRejected: number;
  maxErrors: number;
  maxLag: number;
  maxSkipped: number;
  views: EventViewExpectation[];
};
export type EventStoreScenario = {
  id: string;
  name: string;
  baseLog: EventLog | null;
  commands: EventStoreCommand[];
  expect: EventStoreExpectation | null;
};
export type EventStoreProject = {
  kind: "rsswag-event-store-project";
  version: 1;
  name: string;
  definition: EventStoreDefinition;
  scenarios: EventStoreScenario[];
};
export class EventStoreError extends Error {
  constructor(
    public code:
      | "json"
      | "definition"
      | "command"
      | "reference"
      | "contract"
      | "upcast"
      | "log"
      | "limit"
      | "cancelled",
  ) {
    super(code);
    this.name = "EventStoreError";
  }
}
export const eventObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const eventInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const eventText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const eventId = (v: unknown): v is string =>
  eventText(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
export const eventName = (v: unknown): v is string =>
  eventText(v, 120) && !!v.trim();
export const eventField = (v: unknown): v is string =>
  eventText(v, 64) &&
  /^[A-Za-z_][A-Za-z0-9_-]*$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
export const eventPointer = (v: unknown): v is string =>
  eventText(v, 256) && (v === "" || v.startsWith("/")) && !/~(?![01])/.test(v);
export const eventKey = (v: unknown): v is string | number =>
  typeof v === "number" ? Number.isFinite(v) : eventText(v, 256) && !!v.trim();
export function eventList(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new EventStoreError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new EventStoreError("definition");
  return v;
}
export function eventJson(source: string, max = MAX_EVENT_PROJECT): unknown {
  if (getByteSize(source) > max) throw new EventStoreError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new EventStoreError("json");
  }
}
export function normalizeEventJson(input: unknown, max = 4096): EventJson {
  let nodes = 0;
  function visit(v: unknown, depth: number): EventJson {
    if (depth > 12 || ++nodes > 512) throw new EventStoreError("limit");
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v))
      return Object.is(v, -0) ? 0 : v;
    if (Array.isArray(v))
      return eventList(v, 512).map((x) => visit(x, depth + 1));
    if (eventObject(v)) {
      const proto = Object.getPrototypeOf(v);
      if (proto === null || Object.getPrototypeOf(proto) === null)
        return Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, visit(v[k], depth + 1)]),
        );
    }
    throw new EventStoreError("command");
  }
  const value = visit(input, 0);
  if (getByteSize(JSON.stringify(value)) > max)
    throw new EventStoreError("limit");
  return value;
}
function unique<T extends { id: string }>(v: T[]) {
  if (new Set(v.map((x) => x.id)).size !== v.length)
    throw new EventStoreError("definition");
  return v;
}
export function normalizeEventSource(v: unknown): EventSource {
  if (!eventObject(v)) throw new EventStoreError("definition");
  if (v.source === "payload" && eventPointer(v.pointer))
    return { source: v.source, pointer: v.pointer };
  if (v.source === "literal")
    return { source: v.source, value: normalizeEventJson(v.value, 2048) };
  if (
    v.source === "event" &&
    ["id", "stream", "revision", "position"].includes(v.field as string)
  )
    return {
      source: v.source,
      field: v.field as "id" | "stream" | "revision" | "position",
    };
  throw new EventStoreError("definition");
}
export function normalizeEventDefinition(v: unknown): EventStoreDefinition {
  if (!eventObject(v) || !eventName(v.name) || !eventInt(v.capacity, 1, 500))
    throw new EventStoreError("definition");
  const types = unique(
    eventList(v.types, 12).map((t) => {
      if (
        !eventObject(t) ||
        !eventId(t.id) ||
        !eventName(t.name) ||
        !eventInt(t.version, 1, 8)
      )
        throw new EventStoreError("definition");
      const fields = eventList(t.fields, 16).map((f) => {
        if (
          !eventObject(f) ||
          !eventPointer(f.pointer) ||
          ![
            "string",
            "integer",
            "number",
            "boolean",
            "object",
            "array",
            "null",
          ].includes(f.kind as string) ||
          typeof f.required !== "boolean"
        )
          throw new EventStoreError("definition");
        return {
          pointer: f.pointer,
          kind: f.kind as EventKind,
          required: f.required,
        };
      });
      if (new Set(fields.map((f) => f.pointer)).size !== fields.length)
        throw new EventStoreError("definition");
      return { id: t.id, name: t.name, version: t.version, fields };
    }),
  );
  if (!types.length) throw new EventStoreError("definition");
  const upcasters = eventList(v.upcasters, 32).map((u) => {
    if (
      !eventObject(u) ||
      !types.some(
        (t) => t.id === u.type && eventInt(u.fromVersion, 1, t.version - 1),
      ) ||
      !eventObject(u.defaults) ||
      Object.keys(u.defaults).length > 16 ||
      Object.keys(u.defaults).some((k) => !eventField(k))
    )
      throw new EventStoreError("definition");
    const rename = eventList(u.rename, 16).map((r) => {
      if (
        !eventObject(r) ||
        !eventField(r.from) ||
        !eventField(r.to) ||
        r.from === r.to
      )
        throw new EventStoreError("definition");
      return { from: r.from, to: r.to };
    });
    if (
      new Set(rename.map((r) => r.from)).size !== rename.length ||
      new Set(rename.map((r) => r.to)).size !== rename.length
    )
      throw new EventStoreError("definition");
    const defaults = Object.fromEntries(
      Object.entries(u.defaults).map(([k, val]) => [
        k,
        normalizeEventJson(val, 2048),
      ]),
    );
    return {
      type: u.type as string,
      fromVersion: u.fromVersion as number,
      rename,
      defaults,
    };
  });
  if (
    new Set(upcasters.map((u) => JSON.stringify([u.type, u.fromVersion])))
      .size !== upcasters.length
  )
    throw new EventStoreError("definition");
  const projections = unique(
    eventList(v.projections, 4).map((p) => {
      if (!eventObject(p) || !eventId(p.id) || !eventName(p.name))
        throw new EventStoreError("definition");
      const rules = unique(
        eventList(p.rules, 16).map((r) => {
          if (
            !eventObject(r) ||
            !eventId(r.id) ||
            !types.some((t) => t.id === r.eventType) ||
            !["upsert", "create", "update", "delete"].includes(r.mode as string)
          )
            throw new EventStoreError("reference");
          const operations = eventList(r.operations, 8).map(
            (o): ProjectionOperation => {
              if (!eventObject(o) || !eventField(o.field))
                throw new EventStoreError("definition");
              if (o.op === "unset") return { op: o.op, field: o.field };
              if (
                o.op === "assert" &&
                eventInt(o.min, -1000000000000, 1000000000000) &&
                eventInt(o.max, o.min, 1000000000000)
              )
                return { op: o.op, field: o.field, min: o.min, max: o.max };
              if (["set", "increment", "appendUnique"].includes(o.op as string))
                return {
                  op: o.op as "set" | "increment" | "appendUnique",
                  field: o.field,
                  value: normalizeEventSource(o.value),
                };
              throw new EventStoreError("definition");
            },
          );
          if (
            (r.mode === "delete" && operations.length) ||
            (r.mode !== "delete" && !operations.length)
          )
            throw new EventStoreError("definition");
          return {
            id: r.id,
            eventType: r.eventType as string,
            key: normalizeEventSource(r.key),
            mode: r.mode as ProjectionRule["mode"],
            operations,
          };
        }),
      );
      return { id: p.id, name: p.name, rules };
    }),
  );
  const d = {
    name: v.name,
    capacity: v.capacity,
    types,
    upcasters,
    projections,
  };
  if (getByteSize(JSON.stringify(d)) > MAX_EVENT_DEFINITION)
    throw new EventStoreError("limit");
  return d;
}
export function normalizeRawEvent(v: unknown): RawStoredEvent {
  if (
    !eventObject(v) ||
    !eventId(v.id) ||
    !eventId(v.type) ||
    !eventInt(v.version, 1, 8) ||
    !eventObject(v.payload)
  )
    throw new EventStoreError("command");
  return {
    id: v.id,
    type: v.type,
    version: v.version,
    payload: normalizeEventJson(v.payload) as Record<string, EventJson>,
  };
}
export function normalizeEventCommand(v: unknown): EventStoreCommand {
  if (!eventObject(v)) throw new EventStoreError("command");
  if (
    v.type === "append" &&
    eventId(v.stream) &&
    eventInt(v.expectedRevision, 0, 500)
  ) {
    const events = eventList(v.events, 20).map(normalizeRawEvent);
    if (!events.length) throw new EventStoreError("command");
    return {
      type: v.type,
      stream: v.stream,
      expectedRevision: v.expectedRevision,
      events,
    };
  }
  if (
    v.type === "project" &&
    eventId(v.projectionId) &&
    eventInt(v.limit, 1, 500)
  )
    return { type: v.type, projectionId: v.projectionId, limit: v.limit };
  if (v.type === "rebuild" && eventId(v.projectionId))
    return { type: v.type, projectionId: v.projectionId };
  if (
    v.type === "skip" &&
    eventId(v.projectionId) &&
    eventInt(v.position, 1, 500)
  )
    return { type: v.type, projectionId: v.projectionId, position: v.position };
  throw new EventStoreError("command");
}
export function normalizeEventLog(v: unknown): EventLog {
  if (!eventObject(v) || v.kind !== "rsswag-event-log" || v.version !== 1)
    throw new EventStoreError("log");
  const batches = eventList(v.batches, 500).map((b) => {
    const command = normalizeEventCommand(b);
    if (command.type !== "append") throw new EventStoreError("log");
    return command;
  });
  if (
    batches.reduce((n, b) => n + b.events.length, 0) > 500 ||
    getByteSize(JSON.stringify(batches)) > MAX_EVENT_LOG
  )
    throw new EventStoreError("limit");
  return { kind: v.kind, version: 1, batches };
}
export function normalizeEventScenario(
  v: unknown,
  d: EventStoreDefinition,
): EventStoreScenario {
  if (!eventObject(v) || !eventId(v.id) || !eventName(v.name))
    throw new EventStoreError("definition");
  let expect: EventStoreExpectation | null = null;
  if (v.expect !== null) {
    const e = v.expect;
    if (
      !eventObject(e) ||
      !eventInt(e.events, 0, 500) ||
      !eventInt(e.streams, 0, 500) ||
      !eventInt(e.maxRejected, 0, 300) ||
      !eventInt(e.maxErrors, 0, 4) ||
      !eventInt(e.maxLag, 0, 2000) ||
      !eventInt(e.maxSkipped, 0, 150000)
    )
      throw new EventStoreError("definition");
    const views = eventList(e.views, 32).map((x) => {
      if (
        !eventObject(x) ||
        !d.projections.some((p) => p.id === x.projectionId) ||
        !eventKey(x.key) ||
        !eventField(x.field) ||
        (x.missing !== undefined && typeof x.missing !== "boolean")
      )
        throw new EventStoreError("reference");
      return {
        projectionId: x.projectionId as string,
        key: x.key,
        field: x.field,
        ...(x.missing === true
          ? { missing: true }
          : { value: normalizeEventJson(x.value) }),
      };
    });
    expect = {
      events: e.events,
      streams: e.streams,
      maxRejected: e.maxRejected,
      maxErrors: e.maxErrors,
      maxLag: e.maxLag,
      maxSkipped: e.maxSkipped,
      views,
    };
  }
  return {
    id: v.id,
    name: v.name,
    baseLog: v.baseLog === null ? null : normalizeEventLog(v.baseLog),
    commands: eventList(v.commands, 300).map(normalizeEventCommand),
    expect,
  };
}
export function normalizeEventProject(v: unknown): EventStoreProject {
  if (
    !eventObject(v) ||
    v.kind !== "rsswag-event-store-project" ||
    v.version !== 1 ||
    !eventName(v.name)
  )
    throw new EventStoreError("definition");
  const definition = normalizeEventDefinition(v.definition),
    scenarios = unique(
      eventList(v.scenarios, 12).map((s) =>
        normalizeEventScenario(s, definition),
      ),
    ),
    p: EventStoreProject = {
      kind: v.kind,
      version: 1,
      name: v.name,
      definition,
      scenarios,
    };
  if (getByteSize(JSON.stringify(p)) > MAX_EVENT_PROJECT)
    throw new EventStoreError("limit");
  return p;
}
export const parseEventProject = (s: string) =>
  normalizeEventProject(eventJson(s));
export function serializeEventProject(p: EventStoreProject) {
  const v = normalizeEventProject(p),
    pretty = JSON.stringify(v, null, 2);
  return getByteSize(pretty) <= MAX_EVENT_PROJECT ? pretty : JSON.stringify(v);
}
export const newEventScenario = (id = "case-1"): EventStoreScenario => ({
  id,
  name: id,
  baseLog: null,
  commands: [],
  expect: null,
});
export const newEventDefinition = (): EventStoreDefinition => ({
  name: "Event-sourced API",
  capacity: 500,
  types: [
    {
      id: "Changed",
      name: "Changed",
      version: 1,
      fields: [{ pointer: "/value", kind: "integer", required: true }],
    },
  ],
  upcasters: [],
  projections: [
    {
      id: "totals",
      name: "Totals",
      rules: [
        {
          id: "changed",
          eventType: "Changed",
          key: { source: "event", field: "stream" },
          mode: "upsert",
          operations: [
            {
              op: "increment",
              field: "total",
              value: { source: "payload", pointer: "/value" },
            },
          ],
        },
      ],
    },
  ],
});
export const emptyEventProject = (): EventStoreProject => ({
  kind: "rsswag-event-store-project",
  version: 1,
  name: "Event streams and read models",
  definition: newEventDefinition(),
  scenarios: [newEventScenario()],
});
