import { describe, expect, it } from "vitest";
import {
  createEventStore,
  prefixEventLog,
  upcastStoredEvent,
} from "./event-store-engine";
import {
  newEventDefinition,
  normalizeEventJson,
  normalizeEventDefinition,
  type EventStoreDefinition,
  type RawStoredEvent,
} from "./event-store-model";
import { demoEventStoreProject } from "./event-store-studio";
const event = (id = "event-1", value = 1): RawStoredEvent => ({
    id,
    type: "Changed",
    version: 1,
    payload: { value },
  }),
  append = (
    s: ReturnType<typeof createEventStore>,
    events = [event()],
    expectedRevision = 0,
    stream = "stream-a",
  ) => s.apply({ type: "append", stream, expectedRevision, events }),
  project = (s: ReturnType<typeof createEventStore>, limit = 500) =>
    s.apply({ type: "project", projectionId: "totals", limit });
describe("append-only event streams and atomic projections", () => {
  it("rolls back an earlier matching rule when a later rule for the same event fails", () => {
    const d = newEventDefinition();
    d.projections[0].rules.push({
      id: "later-failure",
      eventType: "Changed",
      key: { source: "literal", value: "shadow" },
      mode: "upsert",
      operations: [{ op: "assert", field: "missing", min: 0, max: 1 }],
    });
    const store = createEventStore(d);
    append(store);
    expect(project(store).reason).toBe("projection-error");
    expect(store.view("totals")).toMatchObject({
      checkpoint: 0,
      applied: 0,
      rows: [],
      error: { position: 1, reason: "invariant" },
    });
    expect(store.read()).toHaveLength(1);
  });
  it("assigns contiguous global positions and independent stream revisions with optimistic concurrency", () => {
    const s = createEventStore(newEventDefinition());
    append(s, [event("a1"), event("a2")]);
    append(s, [event("b1")], 0, "stream-b");
    expect(append(s, [event("stale")], 1).reason).toBe("revision");
    expect(append(s, [event("a3")], 2).accepted).toBe(true);
    expect(
      s.snapshot().events.map((e) => [e.position, e.stream, e.revision]),
    ).toEqual([
      [1, "stream-a", 1],
      [2, "stream-a", 2],
      [3, "stream-b", 1],
      [4, "stream-a", 3],
    ]);
  });
  it("deduplicates only an exact canonical committed batch before checking the old expected revision", () => {
    const s = createEventStore(newEventDefinition()),
      events = [event("a"), event("b")];
    append(s, events);
    append(s, [event("later")], 2);
    expect(append(s, events).reason).toBe("duplicate");
    expect(append(s, [event("a"), event("new")], 3).reason).toBe(
      "partial-duplicate",
    );
    expect(append(s, [...events].reverse()).reason).toBe("id-conflict");
    expect(append(s, [event("a", 2)], 3).accepted).toBe(false);
    expect(s.snapshot().events).toHaveLength(3);
    expect(s.summary().metrics.duplicates).toBe(1);
  });
  it("validates the complete batch before publication, including contracts and duplicate IDs", () => {
    const s = createEventStore(newEventDefinition());
    expect(
      append(s, [
        event("good"),
        { ...event("bad"), payload: { value: "wrong" } },
      ]).reason,
    ).toBe("contract");
    expect(s.read()).toEqual([]);
    expect(append(s, [event("same"), event("same")]).reason).toBe(
      "id-conflict",
    );
    expect(s.summary().streams).toBe(0);
    expect(append(s, [event()]).accepted).toBe(true);
  });
  it("preserves raw legacy events and validates chained rename/default upcasters without overwriting nulls", () => {
    const d = demoEventStoreProject().definition,
      input = {
        id: "old",
        type: "BalanceChanged",
        version: 1,
        payload: { account: "account-a", cents: 12 },
      };
    const up = upcastStoredEvent(d, input);
    expect(up).toMatchObject({
      version: 2,
      payload: { accountId: "account-a", deltaCents: 12, currency: "EUR" },
    });
    expect(input.version).toBe(1);
    expect(input.payload).not.toHaveProperty("currency");
    expect(() =>
      upcastStoredEvent(d, {
        ...input,
        payload: { ...input.payload, currency: null },
      }),
    ).toThrow("contract");
    expect(() =>
      upcastStoredEvent(d, {
        ...input,
        payload: { ...input.payload, accountId: "collision" },
      }),
    ).toThrow("upcast");
    const missing = structuredClone(d);
    missing.upcasters = [];
    expect(() => upcastStoredEvent(missing, input)).toThrow("upcast");
  });
  it("applies simultaneous renames using the old payload and rejects missing chains or future versions", () => {
    const d = newEventDefinition();
    d.types[0].version = 3;
    d.types[0].fields = [];
    d.upcasters = [
      {
        type: "Changed",
        fromVersion: 1,
        rename: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
        defaults: {},
      },
      {
        type: "Changed",
        fromVersion: 2,
        rename: [],
        defaults: { added: true },
      },
    ];
    expect(
      upcastStoredEvent(d, { ...event(), payload: { a: 1, b: 2 } }).payload,
    ).toEqual({ a: 2, b: 1, added: true });
    expect(() => upcastStoredEvent(d, { ...event(), version: 4 })).toThrow(
      "contract",
    );
  });
  it("tracks projection lag and checkpoints and never reapplies already consumed events", () => {
    const s = createEventStore(newEventDefinition());
    append(s, [event("one", 2), event("two", 3)]);
    expect(s.summary().lag).toBe(2);
    project(s, 1);
    expect(s.view("totals")).toMatchObject({
      checkpoint: 1,
      applied: 1,
      rows: [{ key: "stream-a", fields: { total: 2 } }],
    });
    project(s);
    project(s);
    expect(s.view("totals").rows[0].fields.total).toBe(5);
    expect(s.summary()).toMatchObject({ lag: 0, metrics: { projected: 2 } });
  });
  it("rolls back every rule for a failed event, retains the good prefix and keeps other projections independent", () => {
    const d = demoEventStoreProject().definition,
      s = createEventStore(d),
      source = demoEventStoreProject().scenarios.find(
        (c) => c.id === "poison",
      )!;
    source.commands.forEach((c) => s.apply(c));
    expect(s.view("balances")).toMatchObject({
      checkpoint: 1,
      error: { position: 2, reason: "invariant" },
      rows: [{ fields: { balanceCents: 0 } }],
    });
    expect(s.view("totals")).toMatchObject({
      checkpoint: 3,
      error: null,
      rows: [{ fields: { deltaTotal: 100 } }],
    });
    expect(s.snapshot().events).toHaveLength(3);
  });
  it("allows only an explicit skip of the current failed position and re-exposes the failure on rebuild", () => {
    const p = demoEventStoreProject(),
      s = createEventStore(p.definition);
    p.scenarios
      .find((c) => c.id === "poison")!
      .commands.forEach((c) => s.apply(c));
    expect(
      s.apply({ type: "skip", projectionId: "balances", position: 3 }).reason,
    ).toBe("skip-mismatch");
    s.apply({ type: "skip", projectionId: "balances", position: 2 });
    s.apply({ type: "project", projectionId: "balances", limit: 500 });
    expect(s.view("balances").rows[0].fields.balanceCents).toBe(200);
    expect(s.apply({ type: "rebuild", projectionId: "balances" }).reason).toBe(
      "projection-error",
    );
    expect(s.view("balances")).toMatchObject({
      checkpoint: 1,
      skipped: 0,
      error: { position: 2 },
    });
    expect(s.summary().skipped).toBe(1);
  });
  it("preserves numeric/string entity key identity and supports set/unset/unique arrays", () => {
    const d = newEventDefinition();
    d.types[0].fields = [];
    d.projections[0].rules[0] = {
      id: "any",
      eventType: "Changed",
      key: { source: "payload", pointer: "/key" },
      mode: "upsert",
      operations: [
        {
          op: "set",
          field: "seen",
          value: { source: "event", field: "position" },
        },
        {
          op: "appendUnique",
          field: "values",
          value: { source: "payload", pointer: "/value" },
        },
        {
          op: "set",
          field: "unused",
          value: { source: "literal", value: true },
        },
        { op: "unset", field: "unused" },
      ],
    };
    const s = createEventStore(d);
    append(s, [
      { ...event("number"), payload: { key: 7, value: 1 } },
      { ...event("string"), payload: { key: "7", value: 1 } },
      { ...event("repeat"), payload: { key: 7, value: 1 } },
    ]);
    project(s);
    expect(s.view("totals").rows).toEqual([
      { key: 7, fields: { seen: 3, values: [1] } },
      { key: "7", fields: { seen: 2, values: [1] } },
    ]);
  });
  it("stops on missing projection sources, unsafe counters, invalid modes and bounded entity capacity", () => {
    const d = newEventDefinition();
    d.types[0].fields = [];
    const s = createEventStore(d);
    append(s, [{ ...event(), payload: {} }]);
    expect(project(s).reason).toBe("projection-error");
    expect(s.view("totals").error?.reason).toBe("missing-source");
    const overflow = createEventStore(newEventDefinition());
    append(overflow, [event("huge", Number.MAX_SAFE_INTEGER)]);
    project(overflow);
    expect(overflow.view("totals").error?.reason).toBe("counter");
    const capacity = createEventStore(newEventDefinition());
    for (let i = 0; i < 101; i++)
      append(capacity, [event(`event-${i}`)], 0, `stream-${i}`);
    project(capacity);
    expect(capacity.view("totals")).toMatchObject({
      checkpoint: 100,
      error: { position: 101, reason: "view-capacity" },
    });
  });
  it("reconstructs logs by verifying every append, resets read models and refuses tampered or duplicated source", () => {
    const s = createEventStore(newEventDefinition());
    append(s, [event("one"), event("two")]);
    project(s);
    const log = s.exportLog(),
      restored = createEventStore(newEventDefinition(), log);
    expect(restored.read()).toEqual(s.read());
    expect(restored.summary()).toMatchObject({
      commands: 0,
      lag: 2,
      metrics: { appended: 2 },
    });
    project(restored);
    expect(restored.view("totals").rows).toEqual(s.view("totals").rows);
    expect(() =>
      createEventStore(newEventDefinition(), {
        ...log,
        batches: [log.batches[0], log.batches[0]],
      }),
    ).toThrow("log");
    log.batches[0].expectedRevision = 1;
    expect(() => createEventStore(newEventDefinition(), log)).toThrow("log");
  });
  it("creates independent event prefixes, including an explicit cut inside an append batch", () => {
    const d = newEventDefinition(),
      s = createEventStore(d);
    append(s, [event("one"), event("two"), event("three")]);
    const prefix = prefixEventLog(d, s.exportLog(), 2),
      branch = createEventStore(d, prefix);
    expect(branch.read()).toHaveLength(2);
    expect(append(branch, [event("branch", 10)], 2).accepted).toBe(true);
    project(branch);
    expect(branch.view("totals").rows[0].fields.total).toBe(12);
    expect(s.read()).toHaveLength(3);
    expect(s.read()[2].id).toBe("three");
  });
  it("enforces retained capacity, command budgets, defensive copies and atomic invalid commands", () => {
    const d: EventStoreDefinition = { ...newEventDefinition(), capacity: 1 },
      s = createEventStore(d),
      input = event();
    append(s, [input]);
    input.payload.value = 99;
    expect(s.read()[0].payload.value).toBe(1);
    expect(append(s, [event("overflow")], 1).reason).toBe("capacity");
    const snapshot = s.snapshot();
    snapshot.events[0].payload.value = 100;
    expect(s.read()[0].payload.value).toBe(1);
    const before = s.snapshot();
    expect(() =>
      s.apply({ type: "project", projectionId: "totals", limit: 0 }),
    ).toThrow("command");
    expect(s.snapshot()).toEqual(before);
    for (let i = s.summary().commands; i < 300; i++) project(s);
    const full = s.snapshot();
    expect(() => project(s)).toThrow("limit");
    expect(s.snapshot()).toEqual(full);
  });
  it("rejects malformed definitions, references, sparse/prototype/oversized values and unsafe field names", () => {
    for (const v of [new Date(), undefined, Infinity, new Array(1)])
      expect(() => normalizeEventJson(v)).toThrow();
    expect(() => normalizeEventJson("x".repeat(4097))).toThrow("limit");
    const d = newEventDefinition();
    d.projections[0].rules[0].operations = [
      { op: "unset", field: "__proto__" },
    ];
    expect(() => normalizeEventDefinition(d)).toThrow("definition");
    const value = JSON.parse('{"__proto__":{"safe":true}}');
    expect(JSON.stringify(normalizeEventJson(value))).toContain("__proto__");
    expect(({} as { safe?: boolean }).safe).toBeUndefined();
  });
});
