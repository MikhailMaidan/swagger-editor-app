import { getByteSize } from "./text-encoding";
import {
  EventStoreError,
  normalizeEventDefinition,
  normalizeEventCommand,
  normalizeEventLog,
  normalizeRawEvent,
  normalizeEventJson,
  eventKey,
  eventInt,
  type EventStoreDefinition,
  type RawStoredEvent,
  type StoredEvent,
  type EventJson,
  type EventSource,
  type EventKind,
  type ProjectionRow,
  type ProjectionState,
  type EventStoreSnapshot,
  type EventStoreCommand,
  type EventStoreDecision,
  type EventLog,
} from "./event-store-model";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function resolveEventPointer(
  value: EventJson,
  pointer: string,
): { found: boolean; value?: EventJson } {
  if (pointer === "") return { found: true, value };
  for (const encoded of pointer.slice(1).split("/")) {
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))
    )
      return { found: false };
    value = (value as Record<string, EventJson>)[key];
  }
  return { found: true, value };
}
function kindMatches(v: EventJson, kind: EventKind) {
  if (kind === "null") return v === null;
  if (kind === "array") return Array.isArray(v);
  if (kind === "object")
    return v !== null && typeof v === "object" && !Array.isArray(v);
  if (kind === "integer")
    return typeof v === "number" && Number.isSafeInteger(v);
  return typeof v === kind;
}
function upgrade(
  d: EventStoreDefinition,
  input: RawStoredEvent,
): RawStoredEvent {
  const type = d.types.find((t) => t.id === input.type);
  if (!type || input.version > type.version)
    throw new EventStoreError("contract");
  let version = input.version,
    payload = clone(input.payload);
  while (version < type.version) {
    const u = d.upcasters.find(
      (u) => u.type === type.id && u.fromVersion === version,
    );
    if (!u) throw new EventStoreError("upcast");
    const fields = new Map(Object.entries(payload)),
      sources = new Set(u.rename.map((r) => r.from));
    for (const r of u.rename)
      if (fields.has(r.from) && fields.has(r.to) && !sources.has(r.to))
        throw new EventStoreError("upcast");
    for (const r of u.rename) fields.delete(r.from);
    for (const r of u.rename)
      if (Object.hasOwn(payload, r.from)) fields.set(r.to, payload[r.from]);
    for (const [field, value] of Object.entries(u.defaults))
      if (!fields.has(field)) fields.set(field, clone(value));
    try {
      payload = normalizeEventJson(Object.fromEntries(fields)) as Record<
        string,
        EventJson
      >;
    } catch {
      throw new EventStoreError("upcast");
    }
    version++;
  }
  for (const f of type.fields) {
    const result = resolveEventPointer(payload, f.pointer);
    if (!result.found) {
      if (f.required) throw new EventStoreError("contract");
    } else if (!kindMatches(result.value!, f.kind))
      throw new EventStoreError("contract");
  }
  return { ...input, version, payload };
}
export function upcastStoredEvent(d: EventStoreDefinition, input: unknown) {
  return upgrade(normalizeEventDefinition(d), normalizeRawEvent(input));
}
class ProjectionFault extends Error {}
function sourceValue(s: EventSource, event: StoredEvent): EventJson {
  if (s.source === "literal") return s.value;
  if (s.source === "event") return event[s.field];
  const v = resolveEventPointer(event.payload, s.pointer);
  if (!v.found) throw new ProjectionFault("missing-source");
  return v.value!;
}
const rowKey = (key: string | number) => JSON.stringify([typeof key, key]);
function projectOne(
  d: EventStoreDefinition,
  p: ProjectionState,
  event: StoredEvent,
): { rows: ProjectionRow[]; matched: boolean } {
  const rules = d.projections
    .find((x) => x.id === p.id)!
    .rules.filter((r) => r.eventType === event.type);
  if (!rules.length) return { rows: p.rows, matched: false };
  const rows = new Map(p.rows.map((row) => [rowKey(row.key), clone(row)]));
  for (const r of rules) {
    const key = sourceValue(r.key, event);
    if (!eventKey(key)) throw new ProjectionFault("key");
    const identity = rowKey(key),
      existing = rows.get(identity);
    if (r.mode === "create" && existing) throw new ProjectionFault("exists");
    if ((r.mode === "update" || r.mode === "delete") && !existing)
      throw new ProjectionFault("missing-entity");
    if (r.mode === "delete") {
      rows.delete(identity);
      continue;
    }
    const fields = new Map(Object.entries(existing?.fields ?? {}));
    for (const op of r.operations) {
      if (op.op === "unset") {
        fields.delete(op.field);
        continue;
      }
      if (op.op === "assert") {
        const value = fields.get(op.field);
        if (
          typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < op.min ||
          value > op.max
        )
          throw new ProjectionFault("invariant");
        continue;
      }
      const value = sourceValue(op.value, event);
      if (op.op === "set") fields.set(op.field, clone(value));
      else if (op.op === "increment") {
        const before = fields.has(op.field) ? fields.get(op.field) : 0;
        if (
          typeof before !== "number" ||
          typeof value !== "number" ||
          !Number.isSafeInteger(before) ||
          !Number.isSafeInteger(value) ||
          !eventInt(before + value, -1000000000000, 1000000000000)
        )
          throw new ProjectionFault("counter");
        fields.set(op.field, before + value);
      } else {
        const before = fields.has(op.field) ? fields.get(op.field) : [];
        if (!Array.isArray(before)) throw new ProjectionFault("array");
        const values = [...before];
        if (!values.some((v) => JSON.stringify(v) === JSON.stringify(value)))
          values.push(clone(value));
        if (values.length > 64) throw new ProjectionFault("view-capacity");
        fields.set(op.field, values);
      }
    }
    if (fields.size > 32) throw new ProjectionFault("view-capacity");
    rows.set(identity, { key, fields: Object.fromEntries(fields) });
  }
  const result = [...rows.values()];
  if (result.length > 100 || getByteSize(JSON.stringify(result)) > 256 * 1024)
    throw new ProjectionFault("view-capacity");
  return { rows: result, matched: true };
}
export function summarizeEventStore(s: EventStoreSnapshot) {
  return {
    events: s.events.length,
    streams: new Set(s.events.map((e) => e.stream)).size,
    commands: s.commands,
    errors: s.projections.filter((p) => p.error !== null).length,
    lag: s.projections.reduce((n, p) => n + s.events.length - p.checkpoint, 0),
    rows: s.projections.reduce((n, p) => n + p.rows.length, 0),
    skipped: s.metrics.skipped,
    metrics: { ...s.metrics },
    projections: s.projections.map((p) => ({
      id: p.id,
      checkpoint: p.checkpoint,
      lag: s.events.length - p.checkpoint,
      rows: p.rows.length,
      applied: p.applied,
      skipped: p.skipped,
      error: p.error ? { ...p.error } : null,
    })),
  };
}
export function createEventStore(
  value: EventStoreDefinition,
  initialLog?: unknown,
) {
  const d = normalizeEventDefinition(value),
    emptyProjection = (id: string): ProjectionState => ({
      id,
      checkpoint: 0,
      applied: 0,
      skipped: 0,
      error: null,
      rows: [],
    });
  let state: EventStoreSnapshot = {
    events: [],
    batches: [],
    projections: d.projections.map((p) => emptyProjection(p.id)),
    commands: 0,
    metrics: {
      appended: 0,
      batches: 0,
      duplicates: 0,
      rejected: 0,
      projected: 0,
      skipped: 0,
      rebuilds: 0,
    },
    journal: [],
  };
  function catchUp(s: EventStoreSnapshot, p: ProjectionState, limit: number) {
    let processed = 0;
    p.error = null;
    while (p.checkpoint < s.events.length && processed < limit) {
      const raw = s.events[p.checkpoint];
      try {
        const event = { ...raw, ...upgrade(d, raw) },
          result = projectOne(d, p, event);
        p.rows = result.rows;
        p.checkpoint++;
        if (result.matched) {
          p.applied++;
          s.metrics.projected++;
        }
        processed++;
      } catch (e) {
        if (!(e instanceof ProjectionFault) && !(e instanceof EventStoreError))
          throw e;
        p.error = {
          position: raw.position,
          reason: e instanceof EventStoreError ? e.code : e.message,
        };
        break;
      }
    }
    return processed;
  }
  function execute(
    s: EventStoreSnapshot,
    command: EventStoreCommand,
  ): EventStoreDecision {
    const result = (
      accepted: boolean,
      reason: string,
      processed = 0,
      revision: number | null = null,
    ): EventStoreDecision => {
      if (!accepted) s.metrics.rejected++;
      s.journal.push({
        command: s.commands,
        type: command.type,
        reason,
        position: s.events.length,
        processed,
        projectionId: "projectionId" in command ? command.projectionId : null,
      });
      return {
        accepted,
        reason,
        position: s.events.length,
        processed,
        revision,
      };
    };
    if (command.type === "append") {
      const current = s.events.filter(
          (e) => e.stream === command.stream,
        ).length,
        ids = command.events.map((e) => e.id);
      if (new Set(ids).size !== ids.length)
        return result(false, "id-conflict", 0, current);
      const old = s.events.filter((e) => ids.includes(e.id));
      if (old.length) {
        if (
          s.batches.some((b) => JSON.stringify(b) === JSON.stringify(command))
        ) {
          s.metrics.duplicates++;
          return result(true, "duplicate", 0, current);
        }
        return result(
          false,
          old.length === command.events.length
            ? "id-conflict"
            : "partial-duplicate",
          0,
          current,
        );
      }
      if (command.expectedRevision !== current)
        return result(false, "revision", 0, current);
      if (s.events.length + command.events.length > d.capacity)
        return result(false, "capacity", 0, current);
      try {
        command.events.forEach((e) => upgrade(d, e));
      } catch (e) {
        if (e instanceof EventStoreError)
          return result(
            false,
            e.code === "upcast" ? "upcast" : "contract",
            0,
            current,
          );
        throw e;
      }
      for (let i = 0; i < command.events.length; i++)
        s.events.push({
          ...command.events[i],
          stream: command.stream,
          revision: current + i + 1,
          position: s.events.length + 1,
        });
      s.batches.push(clone(command));
      s.metrics.appended += command.events.length;
      s.metrics.batches++;
      return result(
        true,
        "appended",
        command.events.length,
        current + command.events.length,
      );
    }
    const p = s.projections.find((p) => p.id === command.projectionId);
    if (!p) return result(false, "projection-missing");
    if (command.type === "skip") {
      if (
        !p.error ||
        p.error.position !== command.position ||
        command.position !== p.checkpoint + 1
      )
        return result(false, "skip-mismatch");
      p.checkpoint++;
      p.skipped++;
      p.error = null;
      s.metrics.skipped++;
      return result(true, "skipped", 1);
    }
    if (command.type === "rebuild") {
      const index = s.projections.indexOf(p),
        fresh = emptyProjection(p.id);
      s.projections[index] = fresh;
      s.metrics.rebuilds++;
      const processed = catchUp(s, fresh, 500);
      return result(
        !fresh.error,
        fresh.error ? "projection-error" : "rebuilt",
        processed,
      );
    }
    const processed = catchUp(s, p, command.limit);
    return result(
      !p.error,
      p.error ? "projection-error" : "projected",
      processed,
    );
  }
  if (initialLog !== undefined) {
    const log = normalizeEventLog(initialLog);
    for (const batch of log.batches) {
      const r = execute(state, batch);
      if (!r.accepted || r.reason !== "appended")
        throw new EventStoreError("log");
    }
    state.journal = [];
  }
  return {
    apply(input: unknown) {
      const command = normalizeEventCommand(input);
      if (state.commands >= 300) throw new EventStoreError("limit");
      const next = clone(state);
      next.commands++;
      const result = execute(next, command);
      state = next;
      return clone(result);
    },
    snapshot: () => clone(state),
    summary: () => summarizeEventStore(state),
    exportLog: (): EventLog => ({
      kind: "rsswag-event-log",
      version: 1,
      batches: clone(state.batches),
    }),
    read(after = 0, limit = 100) {
      if (!eventInt(after, 0, 500) || !eventInt(limit, 1, 100))
        throw new EventStoreError("command");
      return clone(
        state.events.filter((e) => e.position > after).slice(0, limit),
      );
    },
    view(id: string) {
      const p = state.projections.find((p) => p.id === id);
      if (!p) throw new EventStoreError("reference");
      return clone(p);
    },
  };
}
export type EventStore = ReturnType<typeof createEventStore>;
export function prefixEventLog(
  d: EventStoreDefinition,
  source: unknown,
  position: number,
): EventLog {
  const store = createEventStore(d, source),
    log = store.exportLog();
  if (!eventInt(position, 0, store.snapshot().events.length))
    throw new EventStoreError("command");
  const batches: EventLog["batches"] = [];
  let left = position;
  for (const b of log.batches) {
    if (!left) break;
    const count = Math.min(left, b.events.length);
    batches.push({ ...b, events: b.events.slice(0, count) });
    left -= count;
  }
  return { kind: "rsswag-event-log", version: 1, batches };
}
