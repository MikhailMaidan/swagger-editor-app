import { getByteSize } from "./text-encoding";
import {
  ConsistencyError,
  MAX_LC_ATTEMPTS,
  MAX_LC_MEMORY,
  normalizeLcProject,
  type LCJson,
  type LCMode,
  type LCHistory,
  type LCObject,
  type LCOperation,
  type LCProject,
  type LCVerdict,
} from "./consistency-model";

export type LCEdge = {
  before: string;
  after: string;
  reason: "realtime" | "client" | "both";
};
export type LCWitness = {
  id: string;
  pending: boolean;
  output: LCJson;
  after: LCJson;
};
export type LCRejected = {
  id: string;
  reason: "output" | "range";
  expected: LCJson | null;
};
export type LCResult = {
  historyId: string;
  mode: LCMode;
  verdict: LCVerdict;
  reason: "witness" | "exhausted" | "states" | "work" | "memory";
  states: number;
  attempts: number;
  memoHits: number;
  completed: number;
  pending: number;
  order: LCWitness[];
  ignored: string[];
  edges: LCEdge[];
  deadEnd: { prefix: string[]; rejected: LCRejected[] } | null;
};
export type LCOptions = {
  mode?: LCMode;
  cancelled?: () => boolean;
  progress?: (counts: { states: number; attempts: number }) => void;
  maxAttempts?: number;
};
const equal = (a: LCJson, b: LCJson) => JSON.stringify(a) === JSON.stringify(b);
function transition(
  spec: LCObject,
  state: LCJson,
  op: LCOperation,
): { after: LCJson; output: LCJson } | null {
  if (spec.kind === "register") {
    if (op.method === "read") return { after: state, output: state };
    if (op.method === "write") return { after: op.input, output: null };
    const input = op.input as { expected: LCJson; value: LCJson },
      matched = equal(state, input.expected);
    return { after: matched ? input.value : state, output: matched };
  }
  if (spec.kind === "counter") {
    if (op.method === "read") return { after: state, output: state };
    const value = (state as number) + (op.input as number);
    return Number.isSafeInteger(value) ? { after: value, output: value } : null;
  }
  const queue = state as LCJson[];
  if (op.method === "enqueue")
    return { after: [...queue, op.input], output: null };
  const output = {
    found: queue.length > 0,
    value: queue.length ? queue[0] : null,
  };
  return {
    after: op.method === "dequeue" && queue.length ? queue.slice(1) : queue,
    output,
  };
}
export function consistencyEdges(
  history: LCHistory,
  mode: LCMode = history.mode,
): LCEdge[] {
  const edges: LCEdge[] = [];
  for (const before of history.operations)
    for (const after of history.operations) {
      if (before.id === after.id) continue;
      const time = before.end !== null && before.end <= after.start,
        client = before.client === after.client && before.start < after.start;
      if (client || (mode === "linearizable" && time))
        edges.push({
          before: before.id,
          after: after.id,
          reason:
            client && mode === "linearizable" && time
              ? "both"
              : client
                ? "client"
                : "realtime",
        });
    }
  return edges;
}
export async function analyzeConsistency(
  source: LCProject,
  historyId: string,
  options: LCOptions = {},
): Promise<LCResult> {
  const project = normalizeLcProject(source),
    history = project.histories.find((h) => h.id === historyId);
  if (!history) throw new ConsistencyError("reference");
  const mode = options.mode ?? history.mode;
  if (mode !== "linearizable" && mode !== "sequential")
    throw new ConsistencyError("project");
  const maxAttempts =
    options.maxAttempts === undefined ? MAX_LC_ATTEMPTS : options.maxAttempts;
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > MAX_LC_ATTEMPTS
  )
    throw new ConsistencyError("limit");
  const operations = [...history.operations].sort(
      (a, b) => a.start - b.start || (a.id < b.id ? -1 : 1),
    ),
    edges = consistencyEdges(history, mode),
    index = new Map(operations.map((op, i) => [op.id, i])),
    predecessors = operations.map(() => 0);
  for (const edge of edges)
    predecessors[index.get(edge.after)!] |= 1 << index.get(edge.before)!;
  const required = operations.reduce(
      (mask, op, i) => (op.end === null ? mask : mask | (1 << i)),
      0,
    ),
    failed = new Set<string>(),
    path: LCWitness[] = [];
  let states = 0,
    attempts = 0,
    memoHits = 0,
    memory = 0,
    turns = 0,
    deadEnd: LCResult["deadEnd"] = null;
  class Limit extends Error {
    constructor(public reason: "states" | "work" | "memory") {
      super(reason);
    }
  }
  async function cooperate(force = false) {
    if (options.cancelled?.()) throw new ConsistencyError("cancelled");
    if (force || ++turns % 128 === 0) {
      options.progress?.({ states, attempts });
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (options.cancelled?.()) throw new ConsistencyError("cancelled");
    }
  }
  async function search(mask: number, state: LCJson[]): Promise<boolean> {
    await cooperate();
    if ((mask & required) === required) return true;
    const key = `${mask}:${JSON.stringify(state)}`;
    if (failed.has(key)) {
      memoHits++;
      return false;
    }
    if (states >= history!.maxStates) throw new Limit("states");
    states++;
    const rejected: LCRejected[] = [];
    for (let i = 0; i < operations.length; i++) {
      if (mask & (1 << i) || (mask & predecessors[i]) !== predecessors[i])
        continue;
      if (attempts >= maxAttempts) throw new Limit("work");
      attempts++;
      const op = operations[i],
        objectIndex = project.objects.findIndex((o) => o.id === op.objectId),
        next = transition(project.objects[objectIndex], state[objectIndex], op);
      if (!next || (op.end !== null && !equal(next.output, op.output)))
        rejected.push({
          id: op.id,
          reason: next ? "output" : "range",
          expected: next?.output ?? null,
        });
      else {
        const updated = [...state];
        updated[objectIndex] = next.after;
        if (getByteSize(JSON.stringify(updated)) > 65536)
          throw new Limit("memory");
        path.push({
          id: op.id,
          pending: op.end === null,
          output: next.output,
          after: next.after,
        });
        if (await search(mask | (1 << i), updated)) return true;
        path.pop();
      }
      await cooperate();
    }
    if (deadEnd === null || path.length > deadEnd.prefix.length)
      deadEnd = { prefix: path.map((op) => op.id), rejected };
    const size = getByteSize(key) * 2 + 64;
    if (memory + size > MAX_LC_MEMORY) throw new Limit("memory");
    failed.add(key);
    memory += size;
    return false;
  }
  const result = (
    verdict: LCVerdict,
    reason: LCResult["reason"],
  ): LCResult => ({
    historyId,
    mode,
    verdict,
    reason,
    states,
    attempts,
    memoHits,
    completed: operations.filter((op) => op.end !== null).length,
    pending: operations.filter((op) => op.end === null).length,
    order: verdict === "valid" ? path : [],
    ignored:
      verdict === "valid"
        ? operations
            .filter(
              (op) => op.end === null && !path.some((p) => p.id === op.id),
            )
            .map((op) => op.id)
        : [],
    edges,
    deadEnd: verdict === "valid" ? null : deadEnd,
  });
  await cooperate(true);
  try {
    const valid = await search(
      0,
      project.objects.map((o) => o.initial),
    );
    return result(valid ? "valid" : "invalid", valid ? "witness" : "exhausted");
  } catch (error) {
    if (error instanceof Limit) return result("inconclusive", error.reason);
    throw error;
  }
}
export type LCSuiteRun = {
  historyId: string;
  expected: LCHistory["expected"];
  passed: boolean;
  result: LCResult;
};
export async function runConsistencySuite(
  source: LCProject,
  options: LCOptions & {
    suiteProgress?: (done: number, total: number) => void;
  } = {},
): Promise<LCSuiteRun[]> {
  const project = normalizeLcProject(source),
    runs: LCSuiteRun[] = [];
  for (const history of project.histories) {
    const result = await analyzeConsistency(project, history.id, options);
    if (options.cancelled?.()) throw new ConsistencyError("cancelled");
    runs.push({
      historyId: history.id,
      expected: history.expected,
      passed: history.expected !== null && result.verdict === history.expected,
      result,
    });
    options.suiteProgress?.(runs.length, project.histories.length);
  }
  if (options.cancelled?.()) throw new ConsistencyError("cancelled");
  return runs;
}
export function consistencyPrefix(
  history: LCHistory,
  cutoff: number,
): LCHistory {
  return {
    ...history,
    operations: history.operations
      .filter((op) => op.start < cutoff)
      .map((op) =>
        op.end !== null && op.end <= cutoff
          ? { ...op }
          : { ...op, end: null, output: null },
      ),
  };
}
export type LCPrefixResult = {
  status: "found" | "inconclusive";
  checked: number;
  cutoff: number | null;
  history: LCHistory;
  result: LCResult;
};
export async function findFailingPrefix(
  source: LCProject,
  historyId: string,
  options: LCOptions = {},
): Promise<LCPrefixResult> {
  const project = normalizeLcProject(source),
    history = project.histories.find((h) => h.id === historyId);
  if (!history) throw new ConsistencyError("reference");
  const baseline = await analyzeConsistency(project, historyId, options);
  if (baseline.verdict !== "invalid") throw new ConsistencyError("not-invalid");
  // A linearizable history is prefix closed. Sequential consistency can depend
  // on future operations, so scan explicitly rather than assuming monotonicity.
  const cuts = [
    ...new Set(
      history.operations.flatMap((op) => (op.end === null ? [] : [op.end])),
    ),
  ].sort((a, b) => a - b);
  let checked = 0,
    work = baseline.attempts;
  for (const cutoff of cuts) {
    const prefix = consistencyPrefix(history, cutoff),
      remaining = MAX_LC_ATTEMPTS - work;
    if (remaining < 1)
      return {
        status: "inconclusive",
        checked,
        cutoff: null,
        history,
        result: {
          ...baseline,
          verdict: "inconclusive",
          reason: "work",
          order: [],
        },
      };
    const result = await analyzeConsistency(
      { ...project, histories: [prefix] },
      historyId,
      {
        ...options,
        maxAttempts: Math.min(
          options.maxAttempts ?? MAX_LC_ATTEMPTS,
          remaining,
        ),
      },
    );
    checked++;
    work += result.attempts;
    if (result.verdict === "inconclusive")
      return {
        status: "inconclusive",
        checked,
        cutoff,
        history: prefix,
        result,
      };
    if (result.verdict === "invalid")
      return {
        status: "found",
        checked,
        cutoff,
        history: { ...prefix, expected: "invalid" },
        result,
      };
  }
  return {
    status: "found",
    checked,
    cutoff: null,
    history: { ...history, expected: "invalid" },
    result: baseline,
  };
}
export function consistencyReport(runs: LCSuiteRun[]) {
  return JSON.stringify(
    {
      kind: "rsswag-consistency-report",
      version: 1,
      runs: runs.map((run) => ({
        historyId: run.historyId,
        expected: run.expected,
        passed: run.passed,
        result: {
          historyId: run.result.historyId,
          mode: run.result.mode,
          verdict: run.result.verdict,
          reason: run.result.reason,
          states: run.result.states,
          attempts: run.result.attempts,
          memoHits: run.result.memoHits,
          completed: run.result.completed,
          pending: run.result.pending,
          ignored: [...run.result.ignored],
          edges: run.result.edges.map((edge) => ({
            before: edge.before,
            after: edge.after,
            reason: edge.reason,
          })),
          order: run.result.order.map((op) => ({
            id: op.id,
            pending: op.pending,
          })),
          deadEnd: run.result.deadEnd
            ? {
                prefix: run.result.deadEnd.prefix,
                rejected: run.result.deadEnd.rejected.map((op) => ({
                  id: op.id,
                  reason: op.reason,
                })),
              }
            : null,
        },
      })),
    },
    null,
    2,
  );
}
