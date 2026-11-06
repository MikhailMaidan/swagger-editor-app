import { getByteSize } from "./text-encoding";

export const MAX_LC_PROJECT = 2 * 1024 * 1024;
export const MAX_LC_OPERATIONS = 24;
export const MAX_LC_ATTEMPTS = 250000;
export const MAX_LC_MEMORY = 16 * 1024 * 1024;
export type LCJson =
  null | boolean | number | string | LCJson[] | { [key: string]: LCJson };
export type LCMode = "linearizable" | "sequential";
export type LCVerdict = "valid" | "invalid" | "inconclusive";
export type LCMethod =
  "read" | "write" | "cas" | "add" | "enqueue" | "dequeue" | "peek";
export type LCObject = { id: string; name: string } & (
  | { kind: "register"; initial: LCJson }
  | { kind: "counter"; initial: number }
  | { kind: "queue"; initial: LCJson[] }
);
export type LCOperation = {
  id: string;
  client: string;
  objectId: string;
  method: LCMethod;
  start: number;
  end: number | null;
  input: LCJson;
  output: LCJson;
};
export type LCHistory = {
  id: string;
  name: string;
  mode: LCMode;
  maxStates: number;
  expected: "valid" | "invalid" | null;
  operations: LCOperation[];
};
export type LCProject = {
  kind: "rsswag-consistency-project";
  version: 1;
  name: string;
  objects: LCObject[];
  histories: LCHistory[];
};
export class ConsistencyError extends Error {
  constructor(
    public code:
      | "json"
      | "project"
      | "limit"
      | "reference"
      | "operation"
      | "client-overlap"
      | "cancelled"
      | "not-invalid"
      | "capture",
  ) {
    super(code);
    this.name = "ConsistencyError";
  }
}
export const lcObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const lcText = (v: unknown, max = 120): v is string =>
  typeof v === "string" &&
  !!v.trim() &&
  !/[\u0000-\u001f\u007f]/.test(v) &&
  getByteSize(v) <= max;
export const lcId = (v: unknown): v is string =>
  lcText(v, 64) && /^[A-Za-z0-9_-]+$/.test(v);
export const lcInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export function lcList(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new ConsistencyError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new ConsistencyError("project");
  return v;
}
export function lcJson(v: unknown, max = 2048): LCJson {
  let nodes = 0;
  function visit(x: unknown, depth: number): LCJson {
    if (++nodes > 512 || depth > 12) throw new ConsistencyError("limit");
    if (x === null || typeof x === "boolean" || typeof x === "string") return x;
    if (typeof x === "number" && Number.isFinite(x))
      return Object.is(x, -0) ? 0 : x;
    if (Array.isArray(x))
      return lcList(x, 512).map((item) => visit(item, depth + 1));
    if (
      lcObject(x) &&
      (Object.getPrototypeOf(x) === null ||
        Object.getPrototypeOf(Object.getPrototypeOf(x)) === null)
    )
      return Object.fromEntries(
        Object.keys(x)
          .sort()
          .map((key) => [key, visit(x[key], depth + 1)]),
      );
    throw new ConsistencyError("project");
  }
  const value = visit(v, 0);
  if (getByteSize(JSON.stringify(value)) > max)
    throw new ConsistencyError("limit");
  return value;
}
export function parseLcJson(text: string, max = MAX_LC_PROJECT): unknown {
  if (getByteSize(text) > max) throw new ConsistencyError("limit");
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new ConsistencyError("json");
  }
}
export const lcMethods = (kind: LCObject["kind"]): LCMethod[] =>
  kind === "register"
    ? ["read", "write", "cas"]
    : kind === "counter"
      ? ["read", "add"]
      : ["enqueue", "dequeue", "peek"];
export function normalizeLcObjects(value: unknown): LCObject[] {
  const objects: LCObject[] = lcList(value, 8).map((raw) => {
    if (!lcObject(raw) || !lcId(raw.id) || !lcText(raw.name))
      throw new ConsistencyError("project");
    const base = { id: raw.id, name: raw.name };
    if (raw.kind === "register")
      return { ...base, kind: raw.kind, initial: lcJson(raw.initial) };
    if (
      raw.kind === "counter" &&
      lcInt(raw.initial, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    )
      return { ...base, kind: raw.kind, initial: raw.initial };
    if (raw.kind === "queue")
      return {
        ...base,
        kind: raw.kind,
        initial: lcList(raw.initial, 16).map((item) => lcJson(item)),
      };
    throw new ConsistencyError("project");
  });
  if (
    !objects.length ||
    new Set(objects.map((o) => o.id)).size !== objects.length
  )
    throw new ConsistencyError("project");
  return objects;
}
export function normalizeLcOperation(
  raw: unknown,
  objects: LCObject[],
): LCOperation {
  if (
    !lcObject(raw) ||
    !lcId(raw.id) ||
    !lcText(raw.client, 64) ||
    typeof raw.objectId !== "string" ||
    !lcInt(raw.start, 0, 1e12) ||
    !(raw.end === null || lcInt(raw.end, raw.start + 1, 1e12))
  )
    throw new ConsistencyError("operation");
  const spec = objects.find((o) => o.id === raw.objectId);
  if (!spec || !lcMethods(spec.kind).includes(raw.method as LCMethod))
    throw new ConsistencyError("reference");
  const method = raw.method as LCMethod,
    input = lcJson(raw.input),
    output = lcJson(raw.output);
  if (raw.end === null && output !== null)
    throw new ConsistencyError("operation");
  if (["read", "dequeue", "peek"].includes(method) && input !== null)
    throw new ConsistencyError("operation");
  if (
    method === "cas" &&
    (!lcObject(input) ||
      !Object.hasOwn(input, "expected") ||
      !Object.hasOwn(input, "value") ||
      Object.keys(input).length !== 2)
  )
    throw new ConsistencyError("operation");
  if (
    method === "add" &&
    !lcInt(input, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
  )
    throw new ConsistencyError("operation");
  if (raw.end !== null) {
    if ((method === "write" || method === "enqueue") && output !== null)
      throw new ConsistencyError("operation");
    if (method === "cas" && typeof output !== "boolean")
      throw new ConsistencyError("operation");
    if (
      spec.kind === "counter" &&
      !lcInt(output, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    )
      throw new ConsistencyError("operation");
    if (
      (method === "dequeue" || method === "peek") &&
      (!lcObject(output) ||
        typeof output.found !== "boolean" ||
        !Object.hasOwn(output, "value") ||
        Object.keys(output).length !== 2 ||
        (!output.found && output.value !== null))
    )
      throw new ConsistencyError("operation");
  }
  return {
    id: raw.id,
    client: raw.client,
    objectId: raw.objectId,
    method,
    start: raw.start,
    end: raw.end,
    input,
    output,
  };
}
export function normalizeLcHistory(
  raw: unknown,
  objects: LCObject[],
): LCHistory {
  if (
    !lcObject(raw) ||
    !lcId(raw.id) ||
    !lcText(raw.name) ||
    !["linearizable", "sequential"].includes(raw.mode as string) ||
    !lcInt(raw.maxStates, 1, 50000) ||
    (raw.expected !== null &&
      raw.expected !== "valid" &&
      raw.expected !== "invalid")
  )
    throw new ConsistencyError("project");
  const operations = lcList(raw.operations, MAX_LC_OPERATIONS).map((op) =>
    normalizeLcOperation(op, objects),
  );
  if (new Set(operations.map((op) => op.id)).size !== operations.length)
    throw new ConsistencyError("operation");
  const byTime = [...operations].sort(
    (a, b) => a.start - b.start || (a.id < b.id ? -1 : 1),
  );
  const clients = new Map<string, LCOperation>();
  for (const op of byTime) {
    const previous = clients.get(op.client);
    if (previous && (previous.end === null || previous.end > op.start))
      throw new ConsistencyError("client-overlap");
    clients.set(op.client, op);
  }
  return {
    id: raw.id,
    name: raw.name,
    mode: raw.mode as LCMode,
    maxStates: raw.maxStates,
    expected: raw.expected as LCHistory["expected"],
    operations,
  };
}
export function normalizeLcProject(raw: unknown): LCProject {
  if (
    !lcObject(raw) ||
    raw.kind !== "rsswag-consistency-project" ||
    raw.version !== 1 ||
    !lcText(raw.name)
  )
    throw new ConsistencyError("project");
  const objects = normalizeLcObjects(raw.objects),
    histories = lcList(raw.histories, 16).map((history) =>
      normalizeLcHistory(history, objects),
    );
  if (new Set(histories.map((h) => h.id)).size !== histories.length)
    throw new ConsistencyError("project");
  const project: LCProject = {
    kind: raw.kind,
    version: 1,
    name: raw.name,
    objects,
    histories,
  };
  if (getByteSize(JSON.stringify(project)) > MAX_LC_PROJECT)
    throw new ConsistencyError("limit");
  return project;
}
export const parseLcProject = (text: string) =>
  normalizeLcProject(parseLcJson(text));
export function serializeLcProject(project: LCProject) {
  const clean = normalizeLcProject(project),
    pretty = JSON.stringify(clean, null, 2);
  return getByteSize(pretty) <= MAX_LC_PROJECT ? pretty : JSON.stringify(clean);
}
export function emptyLcProject(): LCProject {
  return {
    kind: "rsswag-consistency-project",
    version: 1,
    name: "API concurrency project",
    objects: [
      { id: "value", name: "Atomic value", kind: "register", initial: 0 },
    ],
    histories: [
      {
        id: "history-1",
        name: "Operation history",
        mode: "linearizable",
        maxStates: 20000,
        expected: null,
        operations: [],
      },
    ],
  };
}
