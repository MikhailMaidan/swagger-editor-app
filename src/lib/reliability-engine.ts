import {
  normalizeRLProject,
  rlTopological,
  RLError,
  RL_LIMITS,
  type RLProject,
  type RLNode,
  type RLRange,
} from "./reliability-model";

export type RLProgress = {
  phase: "truth" | "cuts" | "probability" | "repairs";
  done: number;
  total: number;
  caseId: string | null;
};
export type RLOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: RLProgress) => void;
  yield?: () => Promise<void>;
};
export type RLNodeState = {
  id: string;
  up: boolean;
  required: number;
  healthyInputs: number;
  failedInputs: string[];
};
export type RLImportance = {
  event: string;
  probability: number;
  overridden: boolean;
  whenHealthy: number;
  whenFailed: number;
  importance: number;
  gainIfPerfect: number;
};
export type RLCut = { events: string[]; jointProbability: number };
export type RLRootResult = {
  node: string;
  operation: string;
  availability: number;
  unavailability: number;
  expectedDowntimeSeconds: number;
  minAvailability: number;
  meetsTarget: boolean;
  cutsetCount: number;
  cutsetsTruncated: boolean;
  cutsets: RLCut[];
  importance: RLImportance[];
  matched: boolean | null;
};
export type RLAnalysis = {
  caseId: string | null;
  states: number;
  events: { id: string; probability: number; overridden: boolean }[];
  roots: RLRootResult[];
  matched: boolean | null;
};
export type RLRun = { baseline: RLAnalysis; cases: RLAnalysis[] };
type Compiled = {
  project: RLProject;
  ordered: RLNode[];
  positions: Map<string, number>;
  events: Extract<RLNode, { kind: "event" }>[];
  instructions: { event: number; inputs: number[]; required: number }[];
  rootPositions: number[];
  size: number;
};
type Truth = Compiled & {
  tables: Uint8Array[];
  cuts: number[][];
  cardinalities: Uint8Array;
};
function checkpoint(options: RLOptions) {
  if (options.signal?.aborted) throw new RLError("cancelled");
}
async function pause(options: RLOptions, progress: RLProgress) {
  checkpoint(options);
  options.onProgress?.({ ...progress });
  await (options.yield?.() ??
    new Promise<void>((resolve) => setTimeout(resolve, 0)));
  checkpoint(options);
}
function compile(project: RLProject): Compiled {
  const ordered = rlTopological(project.nodes),
    positions = new Map(ordered.map((n, i) => [n.id, i]));
  const events = project.nodes.filter(
    (n): n is Extract<RLNode, { kind: "event" }> => n.kind === "event",
  );
  const eventIndex = new Map(events.map((event, i) => [event.id, i]));
  return {
    project,
    ordered,
    positions,
    events,
    instructions: ordered.map((node) =>
      node.kind === "event"
        ? { event: eventIndex.get(node.id)!, inputs: [], required: 1 }
        : {
            event: -1,
            inputs: node.inputs.map((id) => positions.get(id)!),
            required:
              node.kind === "at-least"
                ? node.threshold
                : node.kind === "all"
                  ? node.inputs.length
                  : 1,
          },
    ),
    rootPositions: project.roots.map((root) => positions.get(root.node)!),
    size: 2 ** events.length,
  };
}
function evaluateMask(compiled: Compiled, mask: number, values: Uint8Array) {
  for (let i = 0; i < compiled.instructions.length; i++) {
    const instruction = compiled.instructions[i];
    if (instruction.event >= 0) {
      values[i] = mask & (1 << instruction.event) ? 0 : 1;
      continue;
    }
    let count = 0;
    for (let j = 0; j < instruction.inputs.length; j++) {
      count += values[instruction.inputs[j]];
      if (
        count >= instruction.required ||
        count + instruction.inputs.length - j - 1 < instruction.required
      )
        break;
    }
    values[i] = count >= instruction.required ? 1 : 0;
  }
}
function downMask(compiled: Compiled, down: string[]) {
  if (
    !Array.isArray(down) ||
    down.length > compiled.events.length ||
    new Set(down).size !== down.length
  )
    throw new RLError("reference");
  let mask = 0;
  for (const id of down) {
    const index = compiled.events.findIndex((event) => event.id === id);
    if (index < 0) throw new RLError("reference");
    mask |= 1 << index;
  }
  return mask;
}
export function evaluateRLProject(
  input: RLProject,
  down: string[] = [],
): { nodes: RLNodeState[]; roots: { node: string; up: boolean }[] } {
  const project = normalizeRLProject(input),
    compiled = compile(project),
    values = new Uint8Array(compiled.ordered.length);
  evaluateMask(compiled, downMask(compiled, down), values);
  return {
    nodes: compiled.ordered.map((node, i) => ({
      id: node.id,
      up: !!values[i],
      required: compiled.instructions[i].required,
      healthyInputs:
        node.kind === "event"
          ? values[i]
          : compiled.instructions[i].inputs.reduce(
              (sum, index) => sum + values[index],
              0,
            ),
      failedInputs:
        node.kind === "event"
          ? []
          : node.inputs.filter((id) => !values[compiled.positions.get(id)!]),
    })),
    roots: project.roots.map((root, i) => ({
      node: root.node,
      up: !!values[compiled.rootPositions[i]],
    })),
  };
}
async function buildTruth(
  project: RLProject,
  options: RLOptions,
): Promise<Truth> {
  const compiled = compile(project),
    tables = project.roots.map(() => new Uint8Array(compiled.size)),
    values = new Uint8Array(compiled.ordered.length),
    cardinalities = new Uint8Array(compiled.size);
  await pause(options, {
    phase: "truth",
    done: 0,
    total: compiled.size,
    caseId: null,
  });
  for (let mask = 0; mask < compiled.size; mask++) {
    evaluateMask(compiled, mask, values);
    for (let i = 0; i < tables.length; i++)
      tables[i][mask] = values[compiled.rootPositions[i]];
    cardinalities[mask] = cardinalities[mask >> 1] + (mask & 1);
    if ((mask + 1) % 1024 === 0)
      await pause(options, {
        phase: "truth",
        done: mask + 1,
        total: compiled.size,
        caseId: null,
      });
  }
  const cuts = project.roots.map(() => [] as number[]);
  for (let mask = 1; mask < compiled.size; mask++) {
    for (let root = 0; root < tables.length; root++) {
      if (tables[root][mask]) continue;
      let minimal = true;
      for (let bits = mask; bits; bits &= bits - 1) {
        const bit = bits & -bits;
        if (!tables[root][mask ^ bit]) {
          minimal = false;
          break;
        }
      }
      if (minimal) cuts[root].push(mask);
    }
    if ((mask + 1) % 1024 === 0)
      await pause(options, {
        phase: "cuts",
        done: mask + 1,
        total: compiled.size,
        caseId: null,
      });
  }
  checkpoint(options);
  return { ...compiled, tables, cuts, cardinalities };
}
type Sum = { value: number; error: number };
const sum = (): Sum => ({ value: 0, error: 0 });
function add(target: Sum, value: number) {
  const y = value - target.error,
    next = target.value + y;
  target.error = next - target.value - y;
  target.value = next;
}
const clamp = (value: number) => Math.min(1, Math.max(0, value));
function eventsInMask(truth: Truth, mask: number) {
  return truth.events
    .filter((_, index) => mask & (1 << index))
    .map((event) => event.id);
}
async function weigh(
  truth: Truth,
  overrides: Record<string, number>,
  caseId: string | null,
  options: RLOptions,
): Promise<RLAnalysis> {
  const probabilities = truth.events.map((event) =>
      Object.hasOwn(overrides, event.id)
        ? overrides[event.id]
        : event.probability,
    ),
    n = probabilities.length;
  const up = truth.tables.map(sum),
    down = truth.tables.map(sum),
    healthy = truth.tables.map(() => truth.events.map(sum)),
    failed = truth.tables.map(() => truth.events.map(sum));
  const prefix = new Float64Array(n + 1),
    suffix = new Float64Array(n + 1),
    factors = new Float64Array(n);
  await pause(options, {
    phase: "probability",
    done: 0,
    total: truth.size,
    caseId,
  });
  for (let mask = 0; mask < truth.size; mask++) {
    prefix[0] = 1;
    suffix[n] = 1;
    for (let i = 0; i < n; i++) {
      factors[i] = mask & (1 << i) ? 1 - probabilities[i] : probabilities[i];
      prefix[i + 1] = prefix[i] * factors[i];
    }
    for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] * factors[i];
    for (let root = 0; root < truth.tables.length; root++) {
      if (!truth.tables[root][mask]) {
        add(down[root], prefix[n]);
        continue;
      }
      add(up[root], prefix[n]);
      for (let i = 0; i < n; i++)
        add(
          mask & (1 << i) ? failed[root][i] : healthy[root][i],
          prefix[i] * suffix[i + 1],
        );
    }
    if ((mask + 1) % 1024 === 0)
      await pause(options, {
        phase: "probability",
        done: mask + 1,
        total: truth.size,
        caseId,
      });
  }
  const roots: RLRootResult[] = truth.project.roots.map((root, index) => {
    const mass = up[index].value + down[index].value;
    const availability = clamp(up[index].value / mass),
      unavailability = clamp(down[index].value / mass);
    const ranked = truth.cuts[index]
      .map((mask) => {
        let joint = 1;
        for (let i = 0; i < n; i++)
          if (mask & (1 << i)) joint *= 1 - probabilities[i];
        return { mask, joint };
      })
      .sort(
        (a, b) =>
          b.joint - a.joint ||
          truth.cardinalities[a.mask] - truth.cardinalities[b.mask] ||
          a.mask - b.mask,
      );
    const importance = truth.events
      .map((event, i) => {
        const whenHealthy = clamp(healthy[index][i].value),
          whenFailed = clamp(failed[index][i].value),
          importance = Math.max(0, whenHealthy - whenFailed);
        return {
          event: event.id,
          probability: probabilities[i],
          overridden: Object.hasOwn(overrides, event.id),
          whenHealthy,
          whenFailed,
          importance,
          gainIfPerfect: (1 - probabilities[i]) * importance,
        };
      })
      .sort(
        (a, b) =>
          b.gainIfPerfect - a.gainIfPerfect ||
          (a.event < b.event ? -1 : a.event > b.event ? 1 : 0),
      );
    return {
      node: root.node,
      operation: root.operation,
      availability,
      unavailability,
      expectedDowntimeSeconds:
        unavailability * truth.project.windowHours * 3600,
      minAvailability: root.minAvailability,
      meetsTarget: unavailability <= 1 - root.minAvailability,
      cutsetCount: ranked.length,
      cutsetsTruncated: ranked.length > RL_LIMITS.sets,
      cutsets: ranked.slice(0, RL_LIMITS.sets).map((cut) => ({
        events: eventsInMask(truth, cut.mask),
        jointProbability: cut.joint,
      })),
      importance,
      matched: null,
    };
  });
  checkpoint(options);
  return {
    caseId,
    states: truth.size,
    events: truth.events.map((event, i) => ({
      id: event.id,
      probability: probabilities[i],
      overridden: Object.hasOwn(overrides, event.id),
    })),
    roots,
    matched: null,
  };
}
export async function analyzeRLProject(
  input: RLProject,
  caseIds?: string[],
  options: RLOptions = {},
): Promise<RLRun> {
  checkpoint(options);
  const project = normalizeRLProject(input),
    ids = caseIds ?? project.cases.map((scenario) => scenario.id);
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !project.cases.some((scenario) => scenario.id === id))
  )
    throw new RLError("reference");
  const truth = await buildTruth(project, options),
    baseline = await weigh(truth, {}, null, options),
    cache = new Map<string, RLAnalysis>([["[]", baseline]]),
    cases: RLAnalysis[] = [];
  for (const scenario of project.cases.filter((item) =>
    ids.includes(item.id),
  )) {
    const key = JSON.stringify(
      Object.entries(scenario.overrides).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    );
    let analysis = cache.get(key);
    if (!analysis) {
      analysis = await weigh(truth, scenario.overrides, scenario.id, options);
      cache.set(key, analysis);
    }
    const roots = analysis.roots.map((root) => ({
      ...root,
      matched: scenario.expected
        ? root.unavailability >=
            scenario.expected[root.node].minUnavailability &&
          root.unavailability <= scenario.expected[root.node].maxUnavailability
        : null,
    }));
    cases.push({
      ...analysis,
      caseId: scenario.id,
      roots,
      matched: scenario.expected ? roots.every((root) => root.matched) : null,
    });
  }
  checkpoint(options);
  return { baseline, cases };
}
export type RLRepairs = {
  root: string;
  down: string[];
  alreadyHealthy: boolean;
  total: number;
  truncated: boolean;
  sets: string[][];
};
export async function findRLRepairs(
  input: RLProject,
  rootId: string,
  down: string[],
  options: RLOptions = {},
): Promise<RLRepairs> {
  checkpoint(options);
  const project = normalizeRLProject(input),
    root = project.roots.findIndex((item) => item.node === rootId);
  if (root < 0) throw new RLError("reference");
  const compiled = compile(project),
    current = downMask(compiled, down),
    values = new Uint8Array(compiled.ordered.length);
  evaluateMask(compiled, current, values);
  if (values[compiled.rootPositions[root]])
    return {
      root: rootId,
      down: [...down],
      alreadyHealthy: true,
      total: 0,
      truncated: false,
      sets: [],
    };
  const truth = await buildTruth(project, options),
    table = truth.tables[root];
  const repairs: number[] = [];
  let work = 0;
  await pause(options, {
    phase: "repairs",
    done: 0,
    total: 2 ** truth.cardinalities[current],
    caseId: null,
  });
  for (let repair = current; repair; repair = (repair - 1) & current) {
    if (table[current & ~repair]) {
      let minimal = true;
      for (let bits = repair; bits; bits &= bits - 1) {
        const bit = bits & -bits;
        if (table[current & ~(repair ^ bit)]) {
          minimal = false;
          break;
        }
      }
      if (minimal) repairs.push(repair);
    }
    if (++work % 1024 === 0)
      await pause(options, {
        phase: "repairs",
        done: work,
        total: 2 ** truth.cardinalities[current],
        caseId: null,
      });
  }
  repairs.sort(
    (a, b) => truth.cardinalities[a] - truth.cardinalities[b] || a - b,
  );
  checkpoint(options);
  return {
    root: rootId,
    down: [...down],
    alreadyHealthy: false,
    total: repairs.length,
    truncated: repairs.length > RL_LIMITS.sets,
    sets: repairs
      .slice(0, RL_LIMITS.sets)
      .map((mask) => eventsInMask(truth, mask)),
  };
}
export function recordRLExpectation(
  analysis: RLAnalysis,
): Record<string, RLRange> {
  return Object.fromEntries(
    analysis.roots.map((root) => {
      const error = Math.min(1e-10, root.unavailability * 1e-8);
      return [
        root.node,
        {
          minUnavailability: Math.max(0, root.unavailability - error),
          maxUnavailability: Math.min(1, root.unavailability + error),
        },
      ];
    }),
  );
}
export function rlReport(run: RLRun) {
  return { version: 1, kind: "rsswag-service-reliability-report", ...run };
}
