import {
  createEventStore,
  prefixEventLog,
  summarizeEventStore,
} from "./event-store-engine";
import {
  EventStoreError,
  MAX_EVENT_LOG,
  eventJson,
  normalizeEventProject,
  normalizeEventLog,
  normalizeEventDefinition,
  emptyEventProject,
  type EventStoreProject,
  type EventStoreScenario,
  type EventStoreDefinition,
  type EventStoreCommand,
  type EventStoreSnapshot,
  type EventLog,
  type RawStoredEvent,
  type EventJson,
  type EventViewExpectation,
} from "./event-store-model";
import { getByteSize } from "./text-encoding";
export type EventStorePoint = {
  command: number;
  accepted: boolean;
  reason: string;
  summary: ReturnType<typeof summarizeEventStore>;
};
export type EventStoreRun = {
  scenarioId: string;
  scenarioName: string;
  checked: boolean;
  passed: boolean;
  summary: ReturnType<typeof summarizeEventStore>;
  viewChecks: {
    index: number;
    passed: boolean;
    reason: "matched" | "missing" | "different";
  }[];
  snapshot: EventStoreSnapshot;
  timeline: EventStorePoint[];
};
export function eventStoreExpectation(snapshot: EventStoreSnapshot) {
  const s = summarizeEventStore(snapshot);
  return {
    events: s.events,
    streams: s.streams,
    maxRejected: s.metrics.rejected,
    maxErrors: s.errors,
    maxLag: s.lag,
    maxSkipped: s.skipped,
    views: [],
  };
}
export async function replayEventStore(
  definition: EventStoreDefinition,
  scenario: EventStoreScenario,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
) {
  const p = normalizeEventProject({
      kind: "rsswag-event-store-project",
      version: 1,
      name: "Replay",
      definition,
      scenarios: [scenario],
    }),
    s = p.scenarios[0],
    store = createEventStore(p.definition, s.baseLog ?? undefined),
    timeline: EventStorePoint[] = [];
  for (let i = 0; i < s.commands.length; i++) {
    if (cancelled()) throw new EventStoreError("cancelled");
    const r = store.apply(s.commands[i]);
    timeline.push({
      command: i + 1,
      accepted: r.accepted,
      reason: r.reason,
      summary: store.summary(),
    });
    if (i % 10 === 0 || i === s.commands.length - 1) {
      progress?.(i + 1, s.commands.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (cancelled()) throw new EventStoreError("cancelled");
  return { store, snapshot: store.snapshot(), timeline };
}
export async function runEventStoreScenarios(
  value: EventStoreProject,
  id?: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<EventStoreRun[]> {
  const p = normalizeEventProject(value),
    cases = id ? p.scenarios.filter((s) => s.id === id) : p.scenarios;
  if (id && !cases.length) throw new EventStoreError("reference");
  const runs: EventStoreRun[] = [];
  for (const s of cases) {
    const replay = await replayEventStore(p.definition, s, cancelled),
      snapshot = replay.snapshot,
      summary = summarizeEventStore(snapshot),
      e = s.expect,
      viewChecks = (e?.views ?? []).map((v, index) => {
        const row = snapshot.projections
            .find((p) => p.id === v.projectionId)
            ?.rows.find(
              (r) => typeof r.key === typeof v.key && r.key === v.key,
            ),
          found = !!row && Object.hasOwn(row.fields, v.field);
        return {
          index,
          passed:
            v.missing === true
              ? !found
              : found &&
                JSON.stringify(row!.fields[v.field]) ===
                  JSON.stringify(v.value),
          reason: (
            v.missing === true
              ? !found
              : found &&
                JSON.stringify(row!.fields[v.field]) === JSON.stringify(v.value)
          )
            ? ("matched" as const)
            : !found
              ? ("missing" as const)
              : ("different" as const),
        };
      });
    runs.push({
      scenarioId: s.id,
      scenarioName: s.name,
      checked: e !== null,
      passed:
        e !== null &&
        summary.events === e.events &&
        summary.streams === e.streams &&
        summary.metrics.rejected <= e.maxRejected &&
        summary.errors <= e.maxErrors &&
        summary.lag <= e.maxLag &&
        summary.skipped <= e.maxSkipped &&
        viewChecks.every((c) => c.passed),
      summary,
      viewChecks,
      snapshot,
      timeline: replay.timeline,
    });
    progress?.(runs.length, cases.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (cancelled()) throw new EventStoreError("cancelled");
  return runs;
}
export function eventStoreReport(runs: EventStoreRun[], details = false) {
  return {
    kind: "rsswag-event-store-report",
    version: 1,
    total: runs.length,
    checked: runs.filter((r) => r.checked).length,
    passed: runs.filter((r) => r.passed).length,
    runs: runs.map((r) => ({
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      checked: r.checked,
      passed: r.passed,
      summary: r.summary,
      viewChecks: r.viewChecks,
      ...(details ? { timeline: r.timeline, journal: r.snapshot.journal } : {}),
    })),
  };
}
function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function eventStoreCsv(r: EventStoreRun) {
  return [
    [
      "scenarioId",
      "command",
      "accepted",
      "reason",
      "events",
      "streams",
      "lag",
      "errors",
      "rows",
      "rejected",
      "skipped",
    ],
    ...r.timeline.map((p) => [
      r.scenarioId,
      p.command,
      p.accepted,
      p.reason,
      p.summary.events,
      p.summary.streams,
      p.summary.lag,
      p.summary.errors,
      p.summary.rows,
      p.summary.metrics.rejected,
      p.summary.skipped,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
export const parseEventLog = (source: string) =>
  normalizeEventLog(eventJson(source, MAX_EVENT_LOG));
export function serializeEventLog(log: EventLog) {
  const value = normalizeEventLog(log),
    pretty = JSON.stringify(value, null, 2);
  return getByteSize(pretty) <= MAX_EVENT_LOG ? pretty : JSON.stringify(value);
}
export async function previewEventPrefix(
  definition: EventStoreDefinition,
  log: EventLog,
  position: number,
  cancelled = () => false,
) {
  const d = normalizeEventDefinition(definition),
    baseLog = prefixEventLog(d, log, position),
    commands: EventStoreCommand[] = d.projections.map((p) => ({
      type: "project",
      projectionId: p.id,
      limit: 500,
    }));
  return {
    ...(await replayEventStore(
      d,
      { id: "prefix", name: "Event prefix", baseLog, commands, expect: null },
      cancelled,
    )),
    baseLog,
  };
}
export function forkEventScenario(
  d: EventStoreDefinition,
  log: EventLog,
  position: number,
  id: string,
): EventStoreScenario {
  const definition = normalizeEventDefinition(d);
  return {
    id,
    name: id,
    baseLog: prefixEventLog(definition, log, position),
    commands: definition.projections.map((p) => ({
      type: "project",
      projectionId: p.id,
      limit: 500,
    })),
    expect: null,
  };
}
export function demoEventStoreProject(): EventStoreProject {
  const p = emptyEventProject();
  p.name = "Event sourcing, concurrency and projection recovery";
  p.definition = {
    name: "Account event store",
    capacity: 500,
    types: [
      {
        id: "AccountOpened",
        name: "Account opened",
        version: 1,
        fields: [{ pointer: "/owner", kind: "string", required: true }],
      },
      {
        id: "BalanceChanged",
        name: "Balance changed",
        version: 2,
        fields: [
          { pointer: "/accountId", kind: "string", required: true },
          { pointer: "/deltaCents", kind: "integer", required: true },
          { pointer: "/currency", kind: "string", required: true },
        ],
      },
      {
        id: "LabelAdded",
        name: "Label added",
        version: 1,
        fields: [{ pointer: "/label", kind: "string", required: true }],
      },
      { id: "AccountClosed", name: "Account closed", version: 1, fields: [] },
    ],
    upcasters: [
      {
        type: "BalanceChanged",
        fromVersion: 1,
        rename: [
          { from: "account", to: "accountId" },
          { from: "cents", to: "deltaCents" },
        ],
        defaults: { currency: "EUR" },
      },
    ],
    projections: [
      {
        id: "balances",
        name: "Account balances",
        rules: [
          {
            id: "opened",
            eventType: "AccountOpened",
            key: { source: "event", field: "stream" },
            mode: "create",
            operations: [
              {
                op: "set",
                field: "owner",
                value: { source: "payload", pointer: "/owner" },
              },
              {
                op: "set",
                field: "balanceCents",
                value: { source: "literal", value: 0 },
              },
              {
                op: "set",
                field: "labels",
                value: { source: "literal", value: [] },
              },
            ],
          },
          {
            id: "changed",
            eventType: "BalanceChanged",
            key: { source: "payload", pointer: "/accountId" },
            mode: "update",
            operations: [
              {
                op: "increment",
                field: "balanceCents",
                value: { source: "payload", pointer: "/deltaCents" },
              },
              {
                op: "assert",
                field: "balanceCents",
                min: 0,
                max: 1000000000000,
              },
              {
                op: "set",
                field: "lastRevision",
                value: { source: "event", field: "revision" },
              },
            ],
          },
          {
            id: "label",
            eventType: "LabelAdded",
            key: { source: "event", field: "stream" },
            mode: "update",
            operations: [
              {
                op: "appendUnique",
                field: "labels",
                value: { source: "payload", pointer: "/label" },
              },
            ],
          },
          {
            id: "closed",
            eventType: "AccountClosed",
            key: { source: "event", field: "stream" },
            mode: "delete",
            operations: [],
          },
        ],
      },
      {
        id: "totals",
        name: "Cross-account totals",
        rules: [
          {
            id: "opened",
            eventType: "AccountOpened",
            key: { source: "literal", value: "all" },
            mode: "upsert",
            operations: [
              {
                op: "increment",
                field: "accounts",
                value: { source: "literal", value: 1 },
              },
            ],
          },
          {
            id: "changed",
            eventType: "BalanceChanged",
            key: { source: "literal", value: "all" },
            mode: "upsert",
            operations: [
              {
                op: "increment",
                field: "deltaTotal",
                value: { source: "payload", pointer: "/deltaCents" },
              },
            ],
          },
          {
            id: "closed",
            eventType: "AccountClosed",
            key: { source: "literal", value: "all" },
            mode: "upsert",
            operations: [
              {
                op: "increment",
                field: "accounts",
                value: { source: "literal", value: -1 },
              },
            ],
          },
        ],
      },
    ],
  };
  const event = (
      id: string,
      type: string,
      payload: Record<string, EventJson>,
      version = type === "BalanceChanged" ? 2 : 1,
    ): RawStoredEvent => ({ id, type, version, payload }),
    open = (id = "opened", owner = "Ada") =>
      event(id, "AccountOpened", { owner }),
    change = (id: string, deltaCents: number, accountId = "account-a") =>
      event(id, "BalanceChanged", { accountId, deltaCents, currency: "EUR" }),
    append = (
      events: RawStoredEvent[],
      expectedRevision = 0,
      stream = "account-a",
    ): EventStoreCommand => ({
      type: "append",
      stream,
      expectedRevision,
      events,
    }),
    project = (projectionId = "balances"): EventStoreCommand => ({
      type: "project",
      projectionId,
      limit: 500,
    }),
    views = (balance: number): EventViewExpectation[] => [
      {
        projectionId: "balances",
        key: "account-a",
        field: "balanceCents",
        value: balance,
      },
    ],
    scenario = (
      id: string,
      name: string,
      commands: EventStoreCommand[],
      events: number,
      streams: number,
      viewAssertions: EventViewExpectation[] = [],
      maxRejected = 0,
      maxErrors = 0,
      maxLag = 0,
      maxSkipped = 0,
    ): EventStoreScenario => ({
      id,
      name,
      baseLog: null,
      commands,
      expect: {
        events,
        streams,
        maxRejected,
        maxErrors,
        maxLag,
        maxSkipped,
        views: viewAssertions,
      },
    });
  const normal = [open(), change("credit", 100)],
    poison = [open(), change("debit", -100), change("recovery", 200)],
    bad = [append(poison), project(), project("totals")];
  p.scenarios = [
    scenario(
      "happy",
      "Accounts, counters and unique labels",
      [
        append([
          ...normal,
          event("label-one", "LabelAdded", { label: "VIP" }),
          event("label-two", "LabelAdded", { label: "VIP" }),
        ]),
        project(),
        project("totals"),
      ],
      4,
      1,
      [
        ...views(100),
        {
          projectionId: "balances",
          key: "account-a",
          field: "labels",
          value: ["VIP"],
        },
      ],
    ),
    scenario(
      "concurrency",
      "Optimistic concurrency rejects a stale writer",
      [
        append([open()]),
        append([change("stale", 100)], 0),
        append([change("credit", 100)], 1),
        project(),
        project("totals"),
      ],
      2,
      1,
      views(100),
      1,
    ),
    scenario(
      "duplicate",
      "Exact append retry and checkpoint idempotency",
      [append(normal), append(normal), project(), project(), project("totals")],
      2,
      1,
      views(100),
    ),
    scenario(
      "legacy",
      "Upcast a legacy event without rewriting the log",
      [
        append([
          open(),
          event(
            "legacy",
            "BalanceChanged",
            { account: "account-a", cents: 100 },
            1,
          ),
        ]),
        project(),
        project("totals"),
      ],
      2,
      1,
      views(100),
    ),
    scenario(
      "atomic",
      "Invalid event rolls back the entire append batch",
      [
        append([
          open(),
          event("broken", "BalanceChanged", {
            accountId: "account-a",
            currency: "EUR",
          }),
        ]),
        project(),
        project("totals"),
      ],
      0,
      0,
      [],
      1,
    ),
    scenario(
      "poison",
      "Projection failure leaves the event committed",
      bad,
      3,
      1,
      [
        ...views(0),
        { projectionId: "totals", key: "all", field: "deltaTotal", value: 100 },
      ],
      1,
      1,
      2,
    ),
    scenario(
      "skip",
      "Explicit skip resumes a failed projection",
      [
        ...bad,
        { type: "skip", projectionId: "balances", position: 2 },
        project(),
      ],
      3,
      1,
      views(200),
      1,
      0,
      0,
      1,
    ),
    scenario(
      "rebuild",
      "Rebuild exposes a previously skipped failure",
      [
        ...bad,
        { type: "skip", projectionId: "balances", position: 2 },
        project(),
        { type: "rebuild", projectionId: "balances" },
      ],
      3,
      1,
      views(0),
      2,
      1,
      2,
      1,
    ),
    scenario(
      "closed",
      "Delete a read-model entity through a new event",
      [
        append([...normal, event("closed", "AccountClosed", {})]),
        project(),
        project("totals"),
      ],
      3,
      1,
      [
        {
          projectionId: "balances",
          key: "account-a",
          field: "balanceCents",
          missing: true,
        },
        { projectionId: "totals", key: "all", field: "accounts", value: 0 },
      ],
    ),
    scenario(
      "streams",
      "Independent stream revisions and global positions",
      [
        append([open("open-a")]),
        append([open("open-b", "Lin")], 0, "account-b"),
        append([change("credit-a", 50)], 1),
        append([change("credit-b", 75, "account-b")], 1, "account-b"),
        project(),
        project("totals"),
      ],
      4,
      2,
      [
        ...views(50),
        {
          projectionId: "balances",
          key: "account-b",
          field: "balanceCents",
          value: 75,
        },
        { projectionId: "totals", key: "all", field: "deltaTotal", value: 125 },
      ],
    ),
  ];
  return normalizeEventProject(p);
}
