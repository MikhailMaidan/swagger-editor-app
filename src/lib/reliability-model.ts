import { getByteSize } from "./text-encoding";

export type RLNode = { id: string; name: string } & (
  | { kind: "event"; probability: number }
  | { kind: "all" | "any"; inputs: string[] }
  | { kind: "at-least"; inputs: string[]; threshold: number }
);
export type RLRoot = {
  node: string;
  minAvailability: number;
  operation: string;
};
export type RLRange = { minUnavailability: number; maxUnavailability: number };
export type RLCase = {
  id: string;
  name: string;
  overrides: Record<string, number>;
  expected: Record<string, RLRange> | null;
};
export type RLProject = {
  version: 1;
  name: string;
  windowHours: number;
  nodes: RLNode[];
  roots: RLRoot[];
  cases: RLCase[];
};
export const RL_LIMITS = {
  bytes: 512 * 1024,
  nodes: 40,
  events: 16,
  inputs: 16,
  roots: 4,
  cases: 8,
  depth: 20,
  sets: 128,
} as const;
export type RLErrorCode =
  | "project"
  | "limit"
  | "reference"
  | "cycle"
  | "duplicate"
  | "expectation"
  | "cancelled"
  | "schema";
export class RLError extends Error {
  constructor(public readonly code: RLErrorCode) {
    super(code);
    this.name = "RLError";
  }
}
export function rlRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RLError("project");
  return value as Record<string, unknown>;
}
function list(value: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min) throw new RLError("project");
  if (value.length > max) throw new RLError("limit");
  return value;
}
function text(value: unknown, max = 160, empty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new RLError("project");
  return value;
}
function id(value: unknown) {
  const result = text(value, 48);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(result)) throw new RLError("project");
  return result;
}
export function rlProbability(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    throw new RLError("project");
  return value;
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new RLError("duplicate");
  return items;
}
export function normalizeRLNode(raw: unknown): RLNode {
  const value = rlRecord(raw),
    base = { id: id(value.id), name: text(value.name) };
  if (value.kind === "event")
    return {
      ...base,
      kind: "event",
      probability: rlProbability(value.probability),
    };
  if (value.kind !== "all" && value.kind !== "any" && value.kind !== "at-least")
    throw new RLError("project");
  const inputs = list(value.inputs, RL_LIMITS.inputs, 1).map(id);
  if (new Set(inputs).size !== inputs.length) throw new RLError("duplicate");
  if (value.kind === "at-least") {
    if (
      typeof value.threshold !== "number" ||
      !Number.isInteger(value.threshold) ||
      value.threshold < 1 ||
      value.threshold > inputs.length
    )
      throw new RLError("project");
    return { ...base, kind: "at-least", inputs, threshold: value.threshold };
  }
  return { ...base, kind: value.kind, inputs };
}
export function rlTopological(nodes: RLNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node])),
    colors = new Map<string, number>(),
    depths = new Map<string, number>(),
    ordered: RLNode[] = [];
  function visit(nodeId: string): number {
    const node = byId.get(nodeId);
    if (!node) throw new RLError("reference");
    if (colors.get(nodeId) === 1) throw new RLError("cycle");
    if (colors.get(nodeId) === 2) return depths.get(nodeId)!;
    colors.set(nodeId, 1);
    const depth =
      node.kind === "event" ? 0 : 1 + Math.max(...node.inputs.map(visit));
    if (depth > RL_LIMITS.depth) throw new RLError("limit");
    colors.set(nodeId, 2);
    depths.set(nodeId, depth);
    ordered.push(node);
    return depth;
  }
  for (const node of nodes) visit(node.id);
  return ordered;
}
export function normalizeRLProject(raw: unknown): RLProject {
  const value = rlRecord(raw);
  if (
    value.version !== 1 ||
    typeof value.windowHours !== "number" ||
    !Number.isFinite(value.windowHours) ||
    value.windowHours < 0.01 ||
    value.windowHours > 87600
  )
    throw new RLError("project");
  const nodes = unique(
      list(value.nodes, RL_LIMITS.nodes, 1).map(normalizeRLNode),
    ),
    events = nodes.filter((node) => node.kind === "event");
  if (!events.length || events.length > RL_LIMITS.events)
    throw new RLError("limit");
  rlTopological(nodes);
  const roots = list(value.roots, RL_LIMITS.roots, 1).map((raw): RLRoot => {
    const root = rlRecord(raw),
      node = id(root.node);
    if (!nodes.some((n) => n.id === node)) throw new RLError("reference");
    return {
      node,
      minAvailability: rlProbability(root.minAvailability),
      operation: text(root.operation, 160, true),
    };
  });
  if (new Set(roots.map((root) => root.node)).size !== roots.length)
    throw new RLError("duplicate");
  const cases = unique(
    list(value.cases, RL_LIMITS.cases, 1).map((raw): RLCase => {
      const scenario = rlRecord(raw),
        overrides = Object.fromEntries(
          Object.entries(rlRecord(scenario.overrides)).map(
            ([node, probability]) => {
              if (!events.some((event) => event.id === node))
                throw new RLError("reference");
              return [node, rlProbability(probability)];
            },
          ),
        );
      let expected: RLCase["expected"] = null;
      if (scenario.expected !== null) {
        const ranges = rlRecord(scenario.expected);
        if (
          Object.keys(ranges).length !== roots.length ||
          roots.some((root) => !Object.hasOwn(ranges, root.node))
        )
          throw new RLError("expectation");
        expected = Object.fromEntries(
          roots.map((root) => {
            const range = rlRecord(ranges[root.node]),
              minUnavailability = rlProbability(range.minUnavailability),
              maxUnavailability = rlProbability(range.maxUnavailability);
            if (minUnavailability > maxUnavailability)
              throw new RLError("expectation");
            return [root.node, { minUnavailability, maxUnavailability }];
          }),
        );
      }
      return {
        id: id(scenario.id),
        name: text(scenario.name),
        overrides,
        expected,
      };
    }),
  );
  const project: RLProject = {
    version: 1,
    name: text(value.name),
    windowHours: value.windowHours,
    nodes,
    roots,
    cases,
  };
  if (getByteSize(JSON.stringify(project, null, 2)) > RL_LIMITS.bytes)
    throw new RLError("limit");
  return project;
}
export function parseRLJson(source: string): unknown {
  if (source.length > RL_LIMITS.bytes || getByteSize(source) > RL_LIMITS.bytes)
    throw new RLError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new RLError("project");
  }
}
export function parseRLProject(source: string) {
  return normalizeRLProject(parseRLJson(source));
}
export function serializeRLProject(project: RLProject) {
  return JSON.stringify(normalizeRLProject(project), null, 2);
}
export function rlFreshId(prefix: string, items: { id: string }[]) {
  let n = 1;
  while (items.some((item) => item.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
export function emptyRLProject(): RLProject {
  return {
    version: 1,
    name: "API service reliability",
    windowHours: 720,
    nodes: [
      { id: "app", name: "Application", kind: "event", probability: 0.999 },
      { id: "database", name: "Database", kind: "event", probability: 0.995 },
      {
        id: "service",
        name: "API service",
        kind: "all",
        inputs: ["app", "database"],
      },
    ],
    roots: [{ node: "service", minAvailability: 0.99, operation: "" }],
    cases: [
      { id: "baseline", name: "Baseline", overrides: {}, expected: null },
    ],
  };
}
