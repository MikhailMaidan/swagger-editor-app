import {
  normalizeLcProject,
  type LCHistory,
  type LCOperation,
  type LCJson,
  type LCProject,
} from "./consistency-model";
export function demoLcProject(): LCProject {
  const op = (
    id: string,
    objectId: string,
    method: LCOperation["method"],
    start: number,
    end: number | null,
    input: LCJson,
    output: LCJson,
    client = id,
  ): LCOperation => ({
    id,
    client,
    objectId,
    method,
    start,
    end,
    input,
    output,
  });
  const history = (
    id: string,
    name: string,
    expected: LCHistory["expected"],
    operations: LCOperation[],
    mode: LCHistory["mode"] = "linearizable",
  ): LCHistory => ({ id, name, mode, maxStates: 20000, expected, operations });
  const stale = [
    op("write", "value", "write", 0, 2, 1, null),
    op("read", "value", "read", 3, 4, null, 0),
  ];
  return normalizeLcProject({
    kind: "rsswag-consistency-project",
    version: 1,
    name: "Concurrent API correctness examples",
    objects: [
      { id: "value", name: "Atomic value", kind: "register", initial: 0 },
      { id: "other", name: "Second value", kind: "register", initial: 0 },
      { id: "counter", name: "Atomic counter", kind: "counter", initial: 0 },
      { id: "jobs", name: "FIFO jobs", kind: "queue", initial: [] },
    ],
    histories: [
      history("overlap", "Overlapping write and read", "valid", [
        op("write", "value", "write", 0, 10, 1, null),
        op("read", "value", "read", 2, 5, null, 1),
      ]),
      history("stale", "Stale read violates real-time order", "invalid", stale),
      history(
        "stale-sequential",
        "Same history under sequential consistency",
        "valid",
        stale,
        "sequential",
      ),
      history(
        "lost-update",
        "Two increments return the same total",
        "invalid",
        [
          op("add-a", "counter", "add", 0, 5, 1, 1),
          op("add-b", "counter", "add", 1, 4, 1, 1),
        ],
      ),
      history("double-cas", "Two compare-and-swaps claim success", "invalid", [
        op("cas-a", "value", "cas", 0, 5, { expected: 0, value: 1 }, true),
        op("cas-b", "value", "cas", 1, 4, { expected: 0, value: 2 }, true),
      ]),
      history("valid-cas", "One compare-and-swap wins", "valid", [
        op("cas-a", "value", "cas", 0, 5, { expected: 0, value: 1 }, true),
        op("cas-b", "value", "cas", 1, 4, { expected: 0, value: 2 }, false),
      ]),
      history("fifo", "Queue returns the wrong first item", "invalid", [
        op("put-a", "jobs", "enqueue", 0, 1, "a", null),
        op("put-b", "jobs", "enqueue", 2, 3, "b", null),
        op("take", "jobs", "dequeue", 4, 5, null, { found: true, value: "b" }),
      ]),
      history(
        "fifo-overlap",
        "Concurrent enqueues permit either order",
        "valid",
        [
          op("put-a", "jobs", "enqueue", 0, 5, "a", null),
          op("put-b", "jobs", "enqueue", 1, 4, "b", null),
          op("take", "jobs", "dequeue", 6, 7, null, {
            found: true,
            value: "b",
          }),
        ],
      ),
      history("pending", "Pending write explains a completed read", "valid", [
        op("pending-write", "value", "write", 0, null, 1, null),
        op("read", "value", "read", 2, 3, null, 1),
      ]),
      history(
        "future-pending",
        "Future pending write cannot explain an earlier read",
        "invalid",
        [
          op("read", "value", "read", 0, 1, null, 1),
          op("pending-write", "value", "write", 2, null, 1, null),
        ],
      ),
      history(
        "cross-object",
        "Cross-object client-order cycle",
        "invalid",
        [
          op("write-x", "value", "write", 0, 1, 1, null, "a"),
          op("read-y", "other", "read", 2, 3, null, 0, "a"),
          op("write-y", "other", "write", 0, 1, 1, null, "b"),
          op("read-x", "value", "read", 2, 3, null, 0, "b"),
        ],
        "sequential",
      ),
      history(
        "duplicate-dequeue",
        "A queue item is returned twice",
        "invalid",
        [
          op("put", "jobs", "enqueue", 0, 1, null, null),
          op("take-a", "jobs", "dequeue", 2, 6, null, {
            found: true,
            value: null,
          }),
          op("take-b", "jobs", "dequeue", 3, 5, null, {
            found: true,
            value: null,
          }),
        ],
      ),
    ],
  });
}
