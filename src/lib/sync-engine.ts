import { getByteSize } from "./text-encoding";
import {
  MAX_SYNC_QUEUE,
  SyncError,
  normalizeSyncDefinition,
  normalizeSyncState,
  normalizeSyncStep,
  syncClockValue,
  syncKey,
  syncSchema,
  type SyncClock,
  type SyncDefinition,
  type SyncDot,
  type SyncFieldState,
  type SyncState,
  type SyncStep,
  type SyncValue,
} from "./sync-model";
export function emptySyncState(definition: SyncDefinition): SyncState {
  const d = normalizeSyncDefinition(definition);
  return normalizeSyncState(d, {
    kind: "rsswag-sync-state",
    version: 1,
    schema: syncSchema(d),
    fields: Object.fromEntries(
      d.fields.map((f) => [
        f.id,
        f.type === "counter"
          ? { type: f.type, positive: {}, negative: {} }
          : { type: f.type, context: {}, entries: [] },
      ]),
    ),
  });
}
function joinClock(d: SyncDefinition, a: SyncClock, b: SyncClock): SyncClock {
  return Object.fromEntries(
    d.actors
      .map((a) => a.id)
      .sort()
      .flatMap((id) => {
        const n = Math.max(syncClockValue(a, id), syncClockValue(b, id));
        return n ? [[id, n]] : [];
      }),
  );
}
const dotKey = (e: SyncDot) => syncKey(e.actor, String(e.sequence));
export function mergeSyncStates(
  definition: SyncDefinition,
  left: SyncState,
  right: SyncState,
): SyncState {
  const d = normalizeSyncDefinition(definition),
    a = normalizeSyncState(d, left),
    b = normalizeSyncState(d, right);
  const fields = Object.fromEntries(
    d.fields.map((f): [string, SyncFieldState] => {
      const x = a.fields[f.id],
        y = b.fields[f.id];
      if (x.type === "counter" && y.type === "counter")
        return [
          f.id,
          {
            type: "counter",
            positive: joinClock(d, x.positive, y.positive),
            negative: joinClock(d, x.negative, y.negative),
          },
        ];
      if (x.type === "counter" || y.type === "counter")
        throw new SyncError("state");
      const ax = new Map(x.entries.map((e) => [dotKey(e), e])),
        by = new Map(y.entries.map((e) => [dotKey(e), e])),
        entries: SyncDot[] = [];
      for (const e of x.entries) {
        const other = by.get(dotKey(e));
        if (other) {
          if (JSON.stringify(e.value) !== JSON.stringify(other.value))
            throw new SyncError("equivocation");
          entries.push(e);
        } else if (syncClockValue(y.context, e.actor) < e.sequence)
          entries.push(e);
      }
      for (const e of y.entries)
        if (
          !ax.has(dotKey(e)) &&
          syncClockValue(x.context, e.actor) < e.sequence
        )
          entries.push(e);
      if (entries.length > (f.type === "register" ? 8 : 64))
        throw new SyncError("capacity");
      return [
        f.id,
        { type: x.type, context: joinClock(d, x.context, y.context), entries },
      ];
    }),
  );
  return normalizeSyncState(d, { ...a, fields });
}
export function mutateSyncState(
  definition: SyncDefinition,
  value: SyncState,
  operation: SyncStep,
): SyncState {
  const d = normalizeSyncDefinition(definition),
    state = normalizeSyncState(d, value),
    step = normalizeSyncStep(d, operation);
  if (
    !["increment", "assign", "clear", "add", "remove"].includes(step.type) ||
    !("field" in step) ||
    !("actor" in step)
  )
    throw new SyncError("step");
  const f = state.fields[step.field];
  let next: SyncFieldState;
  if (step.type === "increment" && f.type === "counter") {
    const key = step.amount > 0 ? "positive" : "negative",
      n = syncClockValue(f[key], step.actor) + Math.abs(step.amount);
    if (n > 1000000000) throw new SyncError("capacity");
    next = { ...f, [key]: { ...f[key], [step.actor]: n } };
  } else if (f.type !== "counter") {
    const sequence = syncClockValue(f.context, step.actor) + 1;
    if (sequence > 1000000) throw new SyncError("capacity");
    const context = { ...f.context, [step.actor]: sequence };
    let entries = f.entries;
    if (step.type === "assign")
      entries = [{ actor: step.actor, sequence, value: step.value }];
    else if (step.type === "clear") entries = [];
    else if (step.type === "add")
      entries = [
        ...entries.filter((e) => e.value !== step.value),
        { actor: step.actor, sequence, value: step.value },
      ];
    else if (step.type === "remove")
      entries = entries.filter((e) => e.value !== step.value);
    else throw new SyncError("step");
    if (entries.length > 64) throw new SyncError("capacity");
    next = { type: f.type, context, entries };
  } else throw new SyncError("step");
  return normalizeSyncState(d, {
    ...state,
    fields: { ...state.fields, [step.field]: next },
  });
}
export type SyncView = Record<
  string,
  | { type: "counter"; value: number }
  | { type: "set"; values: string[] }
  | { type: "register"; values: SyncValue[]; conflict: boolean }
>;
export function projectSyncState(
  d: SyncDefinition,
  value: SyncState,
): SyncView {
  const state = normalizeSyncState(d, value);
  return Object.fromEntries(
    Object.entries(state.fields).map(([id, f]) => {
      if (f.type === "counter")
        return [
          id,
          {
            type: f.type,
            value:
              Object.values(f.positive).reduce((a, b) => a + b, 0) -
              Object.values(f.negative).reduce((a, b) => a + b, 0),
          },
        ];
      const values = [
        ...new Map(
          f.entries.map((e) => [JSON.stringify(e.value), e.value]),
        ).entries(),
      ]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, v]) => v);
      return [
        id,
        f.type === "set"
          ? { type: f.type, values: values as string[] }
          : { type: f.type, values, conflict: values.length > 1 },
      ];
    }),
  );
}
export type SyncMessage = {
  id: string;
  from: string;
  to: string;
  state: SyncState;
};
export type SyncStepStatus =
  "applied" | "unchanged" | "blocked" | "missing" | "capacity" | "equivocation";
export type SyncJournal = {
  index: number;
  type: SyncStep["type"];
  status: SyncStepStatus;
  queued: number;
  conflicts: number;
  converged: boolean;
  viewsEqual: boolean;
};
export type SyncLab = {
  states: Record<string, SyncState>;
  links: { from: string; to: string }[];
  messages: SyncMessage[];
  serial: number;
  steps: SyncStep[];
  journal: SyncJournal[];
  sent: number;
  delivered: number;
  dropped: number;
};
export function createSyncLab(d: SyncDefinition): SyncLab {
  const definition = normalizeSyncDefinition(d);
  return {
    states: Object.fromEntries(
      definition.actors.map((a) => [a.id, emptySyncState(definition)]),
    ),
    links: definition.links.map((l) => ({ ...l })),
    messages: [],
    serial: 0,
    steps: [],
    journal: [],
    sent: 0,
    delivered: 0,
    dropped: 0,
  };
}
export function summarizeSyncLab(d: SyncDefinition, lab: SyncLab) {
  const views = Object.fromEntries(
      d.actors.map((a) => [a.id, projectSyncState(d, lab.states[a.id])]),
    ),
    stateStrings = d.actors.map((a) => JSON.stringify(lab.states[a.id])),
    viewStrings = d.actors.map((a) => JSON.stringify(views[a.id]));
  return {
    views,
    converged: new Set(stateStrings).size === 1,
    viewsEqual: new Set(viewStrings).size === 1,
    conflicts: Object.values(views).reduce(
      (n, v) =>
        n +
        Object.values(v).filter((f) => f.type === "register" && f.conflict)
          .length,
      0,
    ),
    queued: lab.messages.length,
    rejected: lab.journal.filter(
      (j) => !["applied", "unchanged"].includes(j.status),
    ).length,
  };
}
/** Pure transition: rejected network/capacity actions leave states and queues intact. */
export function stepSyncLab(
  d: SyncDefinition,
  lab: SyncLab,
  input: unknown,
): SyncLab {
  const step = normalizeSyncStep(d, input);
  if (lab.steps.length >= 300) throw new SyncError("limit");
  let result: SyncLab = {
      ...lab,
      states: { ...lab.states },
      links: lab.links.map((l) => ({ ...l })),
      messages: [...lab.messages],
      steps: [...lab.steps, step],
      journal: [...lab.journal],
    },
    status: SyncStepStatus = "applied";
  const connected = (from: string, to: string) =>
    lab.links.some((l) => l.from === from && l.to === to);
  const enqueue = (from: string, to: string, state: SyncState) => {
    const message = {
      id: `message-${result.serial + 1}`,
      from,
      to,
      state: normalizeSyncState(d, state),
    };
    if (
      result.messages.length >= 64 ||
      getByteSize(JSON.stringify([...result.messages, message])) >
        MAX_SYNC_QUEUE
    )
      throw new SyncError("capacity");
    result.messages.push(message);
    result.serial++;
    result.sent++;
  };
  try {
    if (step.type === "send") {
      if (!connected(step.from, step.to)) status = "blocked";
      else enqueue(step.from, step.to, lab.states[step.from]);
    } else if (step.type === "link") {
      const exists = connected(step.from, step.to);
      if (exists === step.enabled) status = "unchanged";
      else
        result.links = step.enabled
          ? [...result.links, { from: step.from, to: step.to }]
          : result.links.filter(
              (l) => l.from !== step.from || l.to !== step.to,
            );
    } else if (
      step.type === "deliver" ||
      step.type === "drop" ||
      step.type === "duplicate"
    ) {
      const message = lab.messages.find((m) => m.id === step.message);
      if (!message) status = "missing";
      else if (step.type === "duplicate")
        enqueue(message.from, message.to, message.state);
      else if (step.type === "drop") {
        result.messages = result.messages.filter((m) => m.id !== message.id);
        result.dropped++;
      } else if (!connected(message.from, message.to)) status = "blocked";
      else {
        const merged = mergeSyncStates(
          d,
          lab.states[message.to],
          message.state,
        );
        status =
          JSON.stringify(merged) === JSON.stringify(lab.states[message.to])
            ? "unchanged"
            : "applied";
        result.states[message.to] = merged;
        result.messages = result.messages.filter((m) => m.id !== message.id);
        result.delivered++;
      }
    } else if (step.type === "round") {
      for (const link of lab.links)
        result.states[link.to] = mergeSyncStates(
          d,
          result.states[link.to],
          lab.states[link.from],
        );
      result.sent += lab.links.length;
      result.delivered += lab.links.length;
      if (
        d.actors.every(
          (a) =>
            JSON.stringify(result.states[a.id]) ===
            JSON.stringify(lab.states[a.id]),
        )
      )
        status = "unchanged";
    } else if (step.type === "merge") {
      const merged = mergeSyncStates(d, lab.states[step.actor], step.state);
      status =
        JSON.stringify(merged) === JSON.stringify(lab.states[step.actor])
          ? "unchanged"
          : "applied";
      result.states[step.actor] = merged;
    } else if ("actor" in step)
      result.states[step.actor] = mutateSyncState(
        d,
        lab.states[step.actor],
        step,
      );
    else throw new SyncError("step");
  } catch (e) {
    if (
      !(e instanceof SyncError) ||
      !["capacity", "equivocation"].includes(e.code)
    )
      throw e;
    status = e.code as "capacity" | "equivocation";
    result = { ...lab, steps: [...lab.steps, step], journal: [...lab.journal] };
  }
  const summary = summarizeSyncLab(d, result);
  result.journal.push({
    index: result.steps.length,
    type: step.type,
    status,
    queued: summary.queued,
    conflicts: summary.conflicts,
    converged: summary.converged,
    viewsEqual: summary.viewsEqual,
  });
  return result;
}
