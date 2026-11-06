import { describe, expect, it } from "vitest";
import {
  analyzeConsistency,
  runConsistencySuite,
  findFailingPrefix,
  consistencyReport,
  consistencyEdges,
} from "./consistency-engine";
import { demoLcProject } from "./consistency-demo";
import {
  emptyLcProject,
  normalizeLcProject,
  parseLcProject,
  serializeLcProject,
  lcJson,
  type LCProject,
  type LCOperation,
} from "./consistency-model";
function project(operations: LCOperation[]): LCProject {
  const p = emptyLcProject();
  p.histories[0].operations = operations;
  return p;
}
const read = (
  id: string,
  start: number,
  end: number | null,
  output = 0,
  client = id,
): LCOperation => ({
  id,
  client,
  objectId: "value",
  method: "read",
  start,
  end,
  input: null,
  output: end === null ? null : output,
});
const write = (
  id: string,
  start: number,
  end: number | null,
  value: number,
  client = id,
): LCOperation => ({
  ...read(id, start, end, 0, client),
  method: "write",
  input: value,
  output: null,
});
describe("API concurrency and consistency checker", () => {
  it("treats reference-state memory bounds as inconclusive and bounded-counter overflow as an illegal transition", async () => {
    const p = emptyLcProject();
    p.objects = Array.from({ length: 8 }, (_, i) => ({
      id: i ? `queue-${i}` : "value",
      name: "Queue",
      kind: "queue" as const,
      initial: Array(16).fill("x".repeat(1900)),
    }));
    p.histories[0].operations = [
      {
        ...read("peek", 0, 1),
        method: "peek",
        output: { found: true, value: "x".repeat(1900) },
      },
    ];
    expect(await analyzeConsistency(p, "history-1")).toMatchObject({
      verdict: "inconclusive",
      reason: "memory",
    });
    p.objects = [
      {
        id: "value",
        name: "Counter",
        kind: "counter",
        initial: Number.MAX_SAFE_INTEGER,
      },
    ];
    p.histories[0].operations = [
      { ...read("add", 0, 1), method: "add", input: 1, output: 0 },
    ];
    expect(await analyzeConsistency(p, "history-1")).toMatchObject({
      verdict: "invalid",
      deadEnd: { rejected: [{ id: "add", reason: "range" }] },
    });
  });
  it("checks twelve explicit histories including stale reads, lost increments, CAS, FIFO, pending effects and cross-object cycles", async () => {
    const runs = await runConsistencySuite(demoLcProject());
    expect(runs).toHaveLength(12);
    expect(runs.every((run) => run.passed)).toBe(true);
    expect(
      runs.find((r) => r.historyId === "pending")!.result.order,
    ).toMatchObject([
      { id: "pending-write", pending: true, output: null, after: 1 },
      { id: "read", pending: false, output: 1 },
    ]);
    expect(
      runs.find((r) => r.historyId === "cross-object")!.result.verdict,
    ).toBe("invalid");
  });
  it("respects real-time boundaries while allowing operations to take effect before their response", async () => {
    const p = project([write("w", 0, 10, 1), read("r", 2, 5, 1)]);
    expect(
      (await analyzeConsistency(p, "history-1")).order.map((op) => op.id),
    ).toEqual(["w", "r"]);
    p.histories[0].operations = [write("w", 0, 1, 1), read("r", 1, 2, 0)];
    expect((await analyzeConsistency(p, "history-1")).verdict).toBe("invalid");
    expect(
      (
        await analyzeConsistency(p, "history-1", { mode: "sequential" })
      ).order.map((op) => op.id),
    ).toEqual(["r", "w"]);
  });
  it("preserves client order under the weaker model and rejects overlapping operations on a sequential client", async () => {
    const p = project([
      write("w", 0, 1, 1, "same"),
      read("r", 2, 3, 0, "same"),
    ]);
    expect(
      (await analyzeConsistency(p, "history-1", { mode: "sequential" }))
        .verdict,
    ).toBe("invalid");
    p.histories[0].operations[1].start = 0;
    expect(() => normalizeLcProject(p)).toThrow("client-overlap");
    p.histories[0].operations = [
      write("w", 0, null, 1, "same"),
      read("r", 2, 3, 1, "same"),
    ];
    expect(() => normalizeLcProject(p)).toThrow("client-overlap");
  });
  it("can omit or complete pending operations without moving them before earlier completed responses", async () => {
    const p = project([write("future", 3, null, 1), read("past", 0, 2, 1)]);
    const result = await analyzeConsistency(p, "history-1");
    expect(result.verdict).toBe("invalid");
    expect(result.edges).toContainEqual({
      before: "past",
      after: "future",
      reason: "realtime",
    });
    p.histories[0].operations[1].output = 0;
    const ignored = await analyzeConsistency(p, "history-1");
    expect(ignored.verdict).toBe("valid");
    expect(ignored.ignored).toEqual(["future"]);
    expect(
      (
        await analyzeConsistency(
          project([write("only", 0, null, 1)]),
          "history-1",
        )
      ).order,
    ).toEqual([]);
  });
  it("backtracks past plausible but invalid write orders and returns a deterministic witness", async () => {
    const p = project([
        write("a", 0, 10, 1),
        write("b", 1, 9, 2),
        read("r", 11, 12, 1),
      ]),
      a = await analyzeConsistency(p, "history-1"),
      b = await analyzeConsistency(p, "history-1");
    expect(a.verdict).toBe("valid");
    expect(a.order.map((op) => op.id)).toEqual(["b", "a", "r"]);
    expect(a).toEqual(b);
    expect(a.attempts).toBeGreaterThan(3);
    expect(a.deadEnd).toBeNull();
  });
  it("reports limits as inconclusive and cancellation as cancellation, never a correctness violation", async () => {
    const p = project([write("a", 0, 10, 1), read("b", 1, 9, 1)]);
    p.histories[0].maxStates = 1;
    expect(await analyzeConsistency(p, "history-1")).toMatchObject({
      verdict: "inconclusive",
      reason: "states",
      order: [],
    });
    p.histories[0].maxStates = 20000;
    expect(
      await analyzeConsistency(p, "history-1", { maxAttempts: 1 }),
    ).toMatchObject({ verdict: "inconclusive", reason: "work" });
    let stop = false;
    await expect(
      analyzeConsistency(p, "history-1", {
        cancelled: () => stop,
        progress: () => {
          stop = true;
        },
      }),
    ).rejects.toThrow("cancelled");
    p.histories[0].expected = "valid";
    p.histories[0].maxStates = 1;
    expect((await runConsistencySuite(p))[0].passed).toBe(false);
  });
  it("distinguishes empty queues from an actual null item and supports non-destructive peeks", async () => {
    const p = emptyLcProject();
    p.objects = [
      { id: "value", name: "Queue", kind: "queue", initial: [null] },
    ];
    const base = read("peek", 0, 1);
    p.histories[0].operations = [
      { ...base, method: "peek", output: { found: true, value: null } },
      {
        ...base,
        id: "take",
        method: "dequeue",
        start: 2,
        end: 3,
        output: { found: true, value: null },
      },
      {
        ...base,
        id: "empty",
        method: "dequeue",
        start: 4,
        end: 5,
        output: { found: false, value: null },
      },
    ];
    expect((await analyzeConsistency(p, "history-1")).verdict).toBe("valid");
    p.histories[0].operations[2].output = { found: true, value: null };
    expect((await analyzeConsistency(p, "history-1")).verdict).toBe("invalid");
  });
  it("uses canonical typed JSON equality for registers/CAS and protects own special keys", async () => {
    const p = emptyLcProject();
    p.objects[0] = {
      id: "value",
      name: "Value",
      kind: "register",
      initial: { b: 2, a: 1 },
    };
    p.histories[0].operations = [
      { ...read("r", 0, 1), output: { a: 1, b: 2 } },
      {
        ...read("cas", 2, 3),
        method: "cas",
        input: {
          expected: { a: 1, b: 2 },
          value: JSON.parse('{"__proto__":{"kept":1}}'),
        },
        output: true,
      },
    ];
    const result = await analyzeConsistency(p, "history-1");
    expect(result.verdict).toBe("valid");
    expect(Object.hasOwn(result.order[1].after as object, "__proto__")).toBe(
      true,
    );
    p.histories[0].operations[0].output = "1";
    expect((await analyzeConsistency(p, "history-1")).verdict).toBe("invalid");
  });
  it("finds an earliest failing event prefix while retaining ongoing writes as pending", async () => {
    const p = project([
        write("w", 0, 10, 1),
        read("observed", 2, 3, 1),
        read("stale", 11, 12, 0),
        read("later", 13, 14, 1),
      ]),
      before = serializeLcProject(p),
      prefix = await findFailingPrefix(p, "history-1");
    expect(prefix).toMatchObject({ status: "found", cutoff: 12, checked: 3 });
    expect(prefix.history.operations.map((op) => op.id)).toEqual([
      "w",
      "observed",
      "stale",
    ]);
    expect(prefix.result.verdict).toBe("invalid");
    expect(serializeLcProject(p)).toBe(before);
    p.histories[0].operations = [read("r", 0, 1, 0)];
    await expect(findFailingPrefix(p, "history-1")).rejects.toThrow(
      "not-invalid",
    );
  });
  it("snapshots inputs, isolates each run, and reports metadata without row or state values", async () => {
    const p = demoLcProject(),
      started = analyzeConsistency(p, "overlap");
    p.histories[0].operations = [];
    const result = await started;
    expect(result.completed).toBe(2);
    const fresh = demoLcProject();
    fresh.objects[0].initial = "PRIVATE-INITIAL";
    fresh.histories = [fresh.histories[0]];
    fresh.histories[0].operations[0].input = "PRIVATE-INPUT";
    fresh.histories[0].operations[1].output = "PRIVATE-OUTPUT";
    fresh.histories[0].expected = "invalid";
    const runs = await runConsistencySuite(fresh),
      report = consistencyReport(runs);
    expect(report).not.toMatch(
      /PRIVATE-|"output"\s*:|"client"\s*:|"initial"\s*:/,
    );
    expect(
      JSON.parse(report).runs[0].result.deadEnd.rejected[0],
    ).not.toHaveProperty("expected");
  });
  it("rejects malformed projects, invalid outputs, duplicates, source bounds and non-JSON values", () => {
    const p = demoLcProject();
    expect(parseLcProject(serializeLcProject(p))).toEqual(p);
    expect(normalizeLcProject({ ...p, result: "forged" })).toEqual(p);
    const invalid = project([{ ...write("w", 0, 1, 1), output: "ack" }]);
    expect(() => normalizeLcProject(invalid)).toThrow("operation");
    invalid.histories[0].operations = [read("r", 0, 0)];
    expect(() => normalizeLcProject(invalid)).toThrow("operation");
    invalid.histories[0].operations = Array.from({ length: 25 }, (_, i) =>
      read(`r-${i}`, i * 2, i * 2 + 1),
    );
    expect(() => normalizeLcProject(invalid)).toThrow("limit");
    expect(() => lcJson([undefined])).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => lcJson(cycle)).toThrow("limit");
    expect(() => lcJson(new Date())).toThrow();
    expect(consistencyEdges(p.histories[1])).toHaveLength(1);
  });
  it("agrees with an independent permutation oracle on small register histories", async () => {
    function permutations<T>(items: T[]): T[][] {
      return items.length
        ? items.flatMap((item, i) =>
            permutations(items.filter((_, j) => j !== i)).map((tail) => [
              item,
              ...tail,
            ]),
          )
        : [[]];
    }
    for (const overlap of [false, true])
      for (const observed of [0, 1, 2, 3])
        for (const mode of ["linearizable", "sequential"] as const) {
          const ops = [
            write("w1", 0, overlap ? 8 : 1, 1),
            write("w2", overlap ? 1 : 2, overlap ? 7 : 3, 2),
            read("r", overlap ? 2 : 4, overlap ? 6 : 5, observed),
          ];
          const possible = permutations(ops).some((order) => {
            for (let i = 0; i < order.length; i++)
              for (let j = i + 1; j < order.length; j++)
                if (mode === "linearizable" && order[j].end! <= order[i].start)
                  return false;
            let value = 0;
            for (const op of order) {
              if (op.method === "write") value = op.input as number;
              else if (op.output !== value) return false;
            }
            return true;
          });
          expect(
            (await analyzeConsistency(project(ops), "history-1", { mode }))
              .verdict,
          ).toBe(possible ? "valid" : "invalid");
        }
  });
});
