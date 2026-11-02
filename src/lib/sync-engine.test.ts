import { describe, expect, it } from "vitest";
import {
  createSyncLab,
  emptySyncState,
  mergeSyncStates,
  mutateSyncState,
  projectSyncState,
  stepSyncLab,
  summarizeSyncLab,
} from "./sync-engine";
import {
  newSyncDefinition,
  normalizeSyncState,
  normalizeSyncDefinition,
  normalizeSyncValue,
  SyncError,
  type SyncState,
  type SyncStep,
} from "./sync-model";
const d = newSyncDefinition(),
  empty = () => emptySyncState(d),
  apply = (s: SyncState, step: SyncStep) => mutateSyncState(d, s, step),
  view = (s: SyncState) => projectSyncState(d, s);
describe("state-based replicated API data", () => {
  it("merges independent positive and negative counter components exactly once", () => {
    const a = apply(empty(), {
        type: "increment",
        actor: "alpha",
        field: "count",
        amount: 3,
      }),
      b = apply(empty(), {
        type: "increment",
        actor: "beta",
        field: "count",
        amount: 5,
      }),
      c = apply(empty(), {
        type: "increment",
        actor: "gamma",
        field: "count",
        amount: -2,
      });
    const result = mergeSyncStates(d, mergeSyncStates(d, a, b), c);
    expect(view(result).count).toEqual({ type: "counter", value: 6 });
    expect(mergeSyncStates(d, result, a)).toEqual(result);
    expect(empty().fields.count).toEqual({
      type: "counter",
      positive: {},
      negative: {},
    });
  });
  it("keeps concurrent register values, deduplicates equal JSON views and resolves observed conflicts", () => {
    const a = apply(empty(), {
        type: "assign",
        actor: "alpha",
        field: "status",
        value: { b: 2, a: 1 },
      }),
      b = apply(empty(), {
        type: "assign",
        actor: "beta",
        field: "status",
        value: "review",
      }),
      both = mergeSyncStates(d, a, b);
    expect(view(both).status).toMatchObject({ conflict: true });
    const resolved = apply(both, {
      type: "assign",
      actor: "gamma",
      field: "status",
      value: "approved",
    });
    expect(view(mergeSyncStates(d, resolved, a)).status).toEqual({
      type: "register",
      values: ["approved"],
      conflict: false,
    });
    const same = apply(empty(), {
      type: "assign",
      actor: "beta",
      field: "status",
      value: { a: 1, b: 2 },
    });
    expect(view(mergeSyncStates(d, a, same)).status).toMatchObject({
      values: [{ a: 1, b: 2 }],
      conflict: false,
    });
    const cleared = apply(resolved, {
      type: "clear",
      actor: "alpha",
      field: "status",
    });
    expect(view(mergeSyncStates(d, cleared, resolved)).status).toMatchObject({
      values: [],
    });
    expect(
      view(
        apply(empty(), {
          type: "assign",
          actor: "alpha",
          field: "status",
          value: null,
        }),
      ).status,
    ).toMatchObject({ values: [null] });
  });
  it("implements observed-remove add-wins sets and prevents resurrection by stale full snapshots", () => {
    const original = apply(empty(), {
      type: "add",
      actor: "alpha",
      field: "labels",
      value: "red",
    });
    const removed = apply(original, {
        type: "remove",
        actor: "beta",
        field: "labels",
        value: "red",
      }),
      added = apply(original, {
        type: "add",
        actor: "gamma",
        field: "labels",
        value: "red",
      }),
      merged = mergeSyncStates(d, removed, added);
    expect(view(merged).labels).toEqual({ type: "set", values: ["red"] });
    const deleted = apply(merged, {
      type: "remove",
      actor: "alpha",
      field: "labels",
      value: "red",
    });
    expect(view(mergeSyncStates(d, deleted, original)).labels).toEqual({
      type: "set",
      values: [],
    });
    expect(mergeSyncStates(d, deleted, added)).toEqual(deleted);
    let repeated = empty();
    for (let i = 0; i < 100; i++)
      repeated = apply(repeated, {
        type: "add",
        actor: "alpha",
        field: "labels",
        value: "same",
      });
    expect(repeated.fields.labels).toMatchObject({
      entries: [{ actor: "alpha", sequence: 100, value: "same" }],
    });
  });
  it("preserves a concurrent assignment across a clear and rejects reused dots with another payload", () => {
    const assigned = apply(empty(), {
        type: "assign",
        actor: "alpha",
        field: "status",
        value: "keep",
      }),
      cleared = apply(empty(), {
        type: "clear",
        actor: "beta",
        field: "status",
      });
    expect(view(mergeSyncStates(d, assigned, cleared)).status).toMatchObject({
      values: ["keep"],
    });
    const fork = apply(empty(), {
      type: "assign",
      actor: "alpha",
      field: "status",
      value: "different",
    });
    expect(() => mergeSyncStates(d, assigned, fork)).toThrow("equivocation");
  });
  it("checks merge algebra across seeded histories with reordering, duplication and independent edits", () => {
    for (let seed = 1; seed <= 12; seed++) {
      let n = seed;
      const rand = () => {
        n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
        return n;
      };
      const states = [empty(), empty(), empty()],
        history: SyncState[] = [];
      for (let i = 0; i < 32; i++) {
        const who = rand() % 3,
          actor = d.actors[who].id,
          kind = rand() % 6;
        if (kind === 0)
          states[who] = mergeSyncStates(d, states[who], states[(who + 1) % 3]);
        else if (kind === 1)
          states[who] = apply(states[who], {
            type: "increment",
            actor,
            field: "count",
            amount: (rand() % 5) + 1,
          });
        else if (kind === 2)
          states[who] = apply(states[who], {
            type: "assign",
            actor,
            field: "status",
            value: String(rand() % 4),
          });
        else if (kind === 3)
          states[who] = apply(states[who], {
            type: "clear",
            actor,
            field: "status",
          });
        else
          states[who] = apply(states[who], {
            type: kind === 4 ? "add" : "remove",
            actor,
            field: "labels",
            value: String(rand() % 6),
          });
        history.push(states[who]);
      }
      for (let i = 0; i < 12; i++) {
        const a = history[rand() % history.length],
          b = history[rand() % history.length],
          c = history[rand() % history.length],
          before = JSON.stringify([a, b, c]);
        expect(mergeSyncStates(d, a, a)).toEqual(a);
        expect(mergeSyncStates(d, a, b)).toEqual(mergeSyncStates(d, b, a));
        expect(mergeSyncStates(d, mergeSyncStates(d, a, b), c)).toEqual(
          mergeSyncStates(d, a, mergeSyncStates(d, b, c)),
        );
        expect(JSON.stringify([a, b, c])).toBe(before);
      }
    }
  });
  it("captures immutable queued snapshots and handles duplicate/out-of-order delivery", () => {
    let lab = createSyncLab(d);
    for (const s of [
      { type: "assign", actor: "alpha", field: "status", value: "old" },
      { type: "send", from: "alpha", to: "beta" },
      { type: "assign", actor: "alpha", field: "status", value: "new" },
      { type: "send", from: "alpha", to: "beta" },
      { type: "duplicate", message: "message-2" },
      { type: "deliver", message: "message-2" },
      { type: "deliver", message: "message-1" },
      { type: "deliver", message: "message-3" },
    ] as SyncStep[])
      lab = stepSyncLab(d, lab, s);
    expect(view(lab.states.beta).status).toMatchObject({ values: ["new"] });
    expect(lab.journal.at(-1)!.status).toBe("unchanged");
    expect(lab.messages).toHaveLength(0);
    expect(lab.delivered).toBe(3);
  });
  it("retains blocked messages, drops explicitly, and treats missing IDs as rejected actions", () => {
    let lab = createSyncLab(d);
    for (const step of [
      { type: "send", from: "alpha", to: "beta" },
      { type: "link", from: "alpha", to: "beta", enabled: false },
      { type: "deliver", message: "message-1" },
    ] as SyncStep[])
      lab = stepSyncLab(d, lab, step);
    expect(lab.messages).toHaveLength(1);
    expect(lab.journal.at(-1)!.status).toBe("blocked");
    lab = stepSyncLab(d, lab, { type: "drop", message: "message-1" });
    expect(lab.dropped).toBe(1);
    lab = stepSyncLab(d, lab, { type: "deliver", message: "message-1" });
    expect(lab.journal.at(-1)!.status).toBe("missing");
  });
  it("distinguishes equal visible values from identical causal state", () => {
    const lab = stepSyncLab(d, createSyncLab(d), {
      type: "clear",
      actor: "alpha",
      field: "status",
    });
    expect(summarizeSyncLab(d, lab)).toMatchObject({
      viewsEqual: true,
      converged: false,
      conflicts: 0,
    });
  });
  it("refuses counter/dot capacity and a whole network round atomically", () => {
    const state = empty();
    state.fields.count = {
      type: "counter",
      positive: { alpha: 1000000000 },
      negative: {},
    };
    expect(() =>
      apply(state, {
        type: "increment",
        actor: "alpha",
        field: "count",
        amount: 1,
      }),
    ).toThrow("capacity");
    let lab = createSyncLab(d);
    for (let i = 0; i < 40; i++) {
      lab = stepSyncLab(d, lab, {
        type: "add",
        actor: "alpha",
        field: "labels",
        value: `a${i}`,
      });
      lab = stepSyncLab(d, lab, {
        type: "add",
        actor: "beta",
        field: "labels",
        value: `b${i}`,
      });
    }
    const before = JSON.stringify(lab.states),
      after = stepSyncLab(d, lab, { type: "round" });
    expect(after.journal.at(-1)!.status).toBe("capacity");
    expect(JSON.stringify(after.states)).toBe(before);
    expect(after.sent).toBe(0);
    const exhausted = empty();
    exhausted.fields.status = {
      type: "register",
      context: { alpha: 1000000 },
      entries: [],
    };
    expect(() =>
      apply(exhausted, { type: "clear", actor: "alpha", field: "status" }),
    ).toThrow("capacity");
  });
  it("bounds message queues without dropping existing messages", () => {
    let lab = createSyncLab(d);
    for (let i = 0; i < 64; i++)
      lab = stepSyncLab(d, lab, { type: "send", from: "alpha", to: "beta" });
    const next = stepSyncLab(d, lab, {
      type: "send",
      from: "alpha",
      to: "beta",
    });
    expect(next.messages).toHaveLength(64);
    expect(next.serial).toBe(64);
    expect(next.journal.at(-1)!.status).toBe("capacity");
  });
  it("validates wire schemas, actors, dot contexts, duplicate IDs and portable JSON", () => {
    const state = apply(empty(), {
      type: "assign",
      actor: "alpha",
      field: "status",
      value: "x",
    });
    for (const modify of [
      (s: SyncState) => {
        s.schema = "foreign";
      },
      (s) => {
        s.fields.status = {
          type: "register",
          context: {},
          entries: [{ actor: "alpha", sequence: 1, value: "x" }],
        };
      },
      (s) => {
        s.fields.count = {
          type: "counter",
          positive: { intruder: 1 },
          negative: {},
        };
      },
      (s) => {
        s.fields.status = {
          type: "register",
          context: { alpha: 1 },
          entries: [
            { actor: "alpha", sequence: 1, value: "x" },
            { actor: "alpha", sequence: 1, value: "x" },
          ],
        };
      },
    ] as ((s: SyncState) => void)[]) {
      const v = structuredClone(state);
      modify(v);
      expect(() => normalizeSyncState(d, v)).toThrow();
    }
    expect(
      normalizeSyncState(d, { ...state, runtime: { secret: true } }),
    ).toEqual(state);
    expect(() => normalizeSyncValue(NaN)).toThrow();
    expect(() => normalizeSyncValue(new Date())).toThrow();
    expect(() => normalizeSyncValue("x".repeat(2049))).toThrow("limit");
    expect(() => normalizeSyncValue(new Array(1))).toThrow();
  });
  it("handles prototype-like IDs and values without prototype pollution", () => {
    const definition = normalizeSyncDefinition({
      documentId: "__proto__",
      actors: [{ id: "constructor", name: "Actor" }],
      fields: [{ id: "__proto__", name: "Value", type: "register" }],
      links: [],
    });
    const state = mutateSyncState(definition, emptySyncState(definition), {
      type: "assign",
      actor: "constructor",
      field: "__proto__",
      value: JSON.parse('{"__proto__":{"polluted":true}}'),
    });
    expect(Object.hasOwn(state.fields, "__proto__")).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(projectSyncState(definition, state).__proto__).toMatchObject({
      conflict: false,
    });
  });
  it("keeps errors typed for callers", () => {
    expect(new SyncError("capacity").code).toBe("capacity");
  });
});
