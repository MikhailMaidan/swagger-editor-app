import { describe, expect, it } from "vitest";
import {
  normalizeRLProject,
  emptyRLProject,
  parseRLProject,
  serializeRLProject,
  type RLProject,
  type RLNode,
} from "./reliability-model";
import {
  analyzeRLProject,
  evaluateRLProject,
  findRLRepairs,
  recordRLExpectation,
} from "./reliability-engine";
import { demoRLProject } from "./reliability-demo";

const fast = { yield: async () => {} };
function system(
  kind: "all" | "any" | "at-least",
  probabilities = [0.9, 0.8],
  threshold = 1,
): RLProject {
  const events: RLNode[] = probabilities.map((probability, i) => ({
    id: `e${i}`,
    name: `Event ${i}`,
    kind: "event",
    probability,
  }));
  return {
    ...emptyRLProject(),
    nodes: [
      ...events,
      kind === "at-least"
        ? {
            id: "root",
            name: "Root",
            kind,
            threshold,
            inputs: events.map((e) => e.id),
          }
        : { id: "root", name: "Root", kind, inputs: events.map((e) => e.id) },
    ],
    roots: [{ node: "root", operation: "", minAvailability: 0.9 }],
  };
}
describe("reliability project validation", () => {
  it("round-trips portable models without trusting imported analysis", () => {
    const project = demoRLProject();
    expect(parseRLProject(`\uFEFF${serializeRLProject(project)}`)).toEqual(
      project,
    );
    expect(
      normalizeRLProject({ ...project, analysis: { availability: 1 } }),
    ).not.toHaveProperty("analysis");
  });
  it.each([
    (p: RLProject) => ({ ...p, nodes: [] }),
    (p: RLProject) => ({ ...p, windowHours: Infinity }),
    (p: RLProject) => ({ ...p, nodes: [...p.nodes, p.nodes[0]] }),
    (p: RLProject) => ({
      ...p,
      nodes: p.nodes.map((n) =>
        n.kind === "event" ? { ...n, probability: 1.01 } : n,
      ),
    }),
    (p: RLProject) => ({
      ...p,
      nodes: p.nodes.map((n) =>
        n.kind === "event" ? n : { ...n, inputs: ["missing"] },
      ),
    }),
    (p: RLProject) => ({
      ...p,
      nodes: p.nodes.map((n) =>
        n.kind === "event" ? n : { ...n, inputs: ["service"] },
      ),
    }),
    (p: RLProject) => ({
      ...p,
      nodes: p.nodes.map((n) =>
        n.kind === "event" ? n : { ...n, kind: "at-least", threshold: 3 },
      ),
    }),
    (p: RLProject) => ({ ...p, roots: [...p.roots, p.roots[0]] }),
    (p: RLProject) => ({
      ...p,
      cases: [{ ...p.cases[0], overrides: { missing: 0 } }],
    }),
    (p: RLProject) => ({ ...p, cases: [{ ...p.cases[0], expected: {} }] }),
  ])("rejects malformed models (%#)", (change) => {
    expect(() => normalizeRLProject(change(emptyRLProject()))).toThrow();
  });
  it("finds cycles even in disconnected gates and rejects duplicate inputs", () => {
    const p = emptyRLProject();
    expect(() =>
      normalizeRLProject({
        ...p,
        nodes: [
          ...p.nodes,
          { id: "loop", name: "Loop", kind: "any", inputs: ["loop"] },
        ],
      }),
    ).toThrow("cycle");
    expect(() =>
      normalizeRLProject({
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === "service"
            ? { ...n, kind: "all", inputs: ["app", "app"] }
            : n,
        ),
      }),
    ).toThrow("duplicate");
  });
  it("bounds actual UTF-8 input and finite event count", () => {
    expect(() =>
      parseRLProject(`{"padding":"${"\u20ac".repeat(180_000)}"}`),
    ).toThrow("limit");
    expect(() =>
      normalizeRLProject(
        system(
          "any",
          Array.from({ length: 17 }, () => 0.9),
        ),
      ),
    ).toThrow("limit");
  });
});
describe("finite-state reliability analysis", () => {
  it("matches series, parallel and quorum closed-form results", async () => {
    expect(
      (await analyzeRLProject(system("all"), undefined, fast)).baseline.roots[0]
        .availability,
    ).toBeCloseTo(0.9 * 0.8, 14);
    expect(
      (await analyzeRLProject(system("any"), undefined, fast)).baseline.roots[0]
        .availability,
    ).toBeCloseTo(1 - 0.1 * 0.2, 14);
    const quorum = (
      await analyzeRLProject(
        system("at-least", [0.9, 0.9, 0.9], 2),
        undefined,
        fast,
      )
    ).baseline.roots[0];
    expect(quorum.availability).toBeCloseTo(0.972, 14);
    expect(quorum.cutsetCount).toBe(3);
    expect(quorum.cutsets.every((cut) => cut.events.length === 2)).toBe(true);
  });
  it("accounts for shared failure domains instead of multiplying correlated gate outputs", async () => {
    const p = system("any", [0.9, 0.8, 0.7]);
    p.nodes = [
      p.nodes[0],
      p.nodes[1],
      p.nodes[2],
      { id: "branch-a", name: "A", kind: "all", inputs: ["e0", "e1"] },
      { id: "branch-b", name: "B", kind: "all", inputs: ["e0", "e2"] },
      {
        id: "root",
        name: "Shared root",
        kind: "any",
        inputs: ["branch-a", "branch-b"],
      },
    ];
    const analysis = await analyzeRLProject(p, undefined, fast),
      result = analysis.baseline.roots[0];
    expect(result.availability).toBeCloseTo(0.9 * (1 - 0.2 * 0.3), 14);
    expect(result.availability).not.toBeCloseTo(
      1 - (1 - 0.9 * 0.8) * (1 - 0.9 * 0.7),
      5,
    );
    expect(result.cutsets.map((cut) => cut.events)).toEqual([
      ["e0"],
      ["e1", "e2"],
    ]);
    expect(result.unavailability).toBeCloseTo(0.154, 14);
    expect(
      result.cutsets.reduce((sum, cut) => sum + cut.jointProbability, 0),
    ).not.toBeCloseTo(result.unavailability, 5);
  });
  it("calculates conditional importance and the actual ideal-component gain", async () => {
    const result = (await analyzeRLProject(system("all"), undefined, fast))
      .baseline.roots[0];
    expect(result.importance[0]).toMatchObject({ event: "e1" });
    const first = result.importance.find((i) => i.event === "e0")!;
    expect(first.whenHealthy).toBeCloseTo(0.8, 14);
    expect(first.whenFailed).toBe(0);
    expect(first.gainIfPerfect).toBeCloseTo(0.08, 14);
    expect(result.expectedDowntimeSeconds).toBeCloseTo(0.28 * 720 * 3600, 7);
  });
  it("handles zero/one probabilities and overrides without division-by-zero", async () => {
    const p = system("all");
    p.cases.push(
      { id: "outage", name: "Outage", overrides: { e0: 0 }, expected: null },
      {
        id: "perfect",
        name: "Perfect",
        overrides: { e0: 1, e1: 1 },
        expected: null,
      },
    );
    const run = await analyzeRLProject(p, undefined, fast);
    expect(run.cases[1].roots[0]).toMatchObject({
      availability: 0,
      unavailability: 1,
    });
    expect(run.cases[2].roots[0]).toMatchObject({
      availability: 1,
      unavailability: 0,
    });
    expect(
      run.cases[1].roots[0].importance.find((i) => i.event === "e0")!
        .whenHealthy,
    ).toBeCloseTo(0.8, 14);
    expect(JSON.stringify(run)).not.toMatch(/NaN|Infinity/);
  });
  it("retains tiny unavailable probabilities even when uptime rounds to one", async () => {
    const p = system("any", [1 - 1e-10, 1 - 1e-10]);
    p.roots[0].minAvailability = 1;
    const result = (await analyzeRLProject(p, undefined, fast)).baseline
      .roots[0];
    expect(result.availability).toBe(1);
    expect(result.unavailability).toBeGreaterThan(0);
    expect(result.unavailability).toBeLessThan(1e-19);
    expect(result.meetsTarget).toBe(false);
    const expected = recordRLExpectation(
      (await analyzeRLProject(p, undefined, fast)).baseline,
    ).root;
    expect(expected.minUnavailability).toBeGreaterThan(0);
  });
  it("explains interactive outage gates and supports every output", () => {
    const p = demoRLProject(),
      evaluation = evaluateRLProject(p, ["zone-a", "zone-b"]);
    expect(evaluation.roots.find((root) => root.node === "service")?.up).toBe(
      false,
    );
    expect(evaluation.roots.find((root) => root.node === "quorum")?.up).toBe(
      true,
    );
    expect(
      evaluation.nodes.find((node) => node.id === "applications"),
    ).toMatchObject({
      up: false,
      required: 1,
      healthyInputs: 0,
      failedInputs: ["app-zone-a", "app-zone-b"],
    });
    expect(() => evaluateRLProject(p, ["missing"])).toThrow("reference");
  });
  it("finds inclusion-minimal repair sets and recognizes an already healthy graph", async () => {
    const p = system("at-least", [0.9, 0.9, 0.9], 2);
    const repairs = await findRLRepairs(p, "root", ["e0", "e1", "e2"], fast);
    expect(repairs.sets).toEqual([
      ["e0", "e1"],
      ["e0", "e2"],
      ["e1", "e2"],
    ]);
    expect((await findRLRepairs(p, "root", ["e0", "e1"], fast)).sets).toEqual([
      ["e0"],
      ["e1"],
    ]);
    expect(await findRLRepairs(p, "root", [], fast)).toMatchObject({
      alreadyHealthy: true,
      total: 0,
      sets: [],
    });
  });
  it("keeps structural cuts even when their current probability is zero", async () => {
    const root = (
      await analyzeRLProject(system("all", [1, 1]), undefined, fast)
    ).baseline.roots[0];
    expect(root.cutsetCount).toBe(2);
    expect(root.cutsets.every((cut) => cut.jointProbability === 0)).toBe(true);
  });
  it("matches independent exhaustive probability and minimal-cut oracles", async () => {
    for (let variant = 0; variant < 12; variant++) {
      const p = system(variant % 2 ? "all" : "any", [
        0.1 + variant / 20,
        0.3,
        0.7,
      ]);
      p.nodes = [
        ...p.nodes.slice(0, 3),
        { id: "left", name: "Left", kind: "all", inputs: ["e0", "e1"] },
        {
          id: "root",
          name: "Root",
          kind: variant % 2 ? "all" : "any",
          inputs: ["left", "e2"],
        },
      ];
      let expected = 0;
      const failures: number[] = [];
      for (let mask = 0; mask < 8; mask++) {
        const a = !(mask & 1),
          b = !(mask & 2),
          c = !(mask & 4),
          up = variant % 2 ? a && b && c : (a && b) || c;
        const probabilities = [0.1 + variant / 20, 0.3, 0.7];
        const weight = probabilities.reduce(
          (n, value, i) => n * (mask & (1 << i) ? 1 - value : value),
          1,
        );
        if (up) expected += weight;
        else failures.push(mask);
      }
      const result = (await analyzeRLProject(p, undefined, fast)).baseline
        .roots[0];
      expect(result.availability).toBeCloseTo(expected, 14);
      const minimal = failures.filter(
        (mask) =>
          !failures.some((other) => other !== mask && (other & mask) === other),
      );
      expect(
        result.cutsets
          .map((cut) =>
            cut.events.reduce(
              (mask, id) => mask | (1 << Number(id.slice(1))),
              0,
            ),
          )
          .sort(),
      ).toEqual(minimal.sort());
    }
  });
  it("records deterministic regression ranges and detects a changed architecture", async () => {
    const p = system("any"),
      run = await analyzeRLProject(p, undefined, fast);
    p.cases[0].expected = recordRLExpectation(run.cases[0]);
    expect((await analyzeRLProject(p, undefined, fast)).cases[0].matched).toBe(
      true,
    );
    p.nodes[p.nodes.length - 1] = {
      id: "root",
      name: "Root",
      kind: "all",
      inputs: ["e0", "e1"],
    };
    expect((await analyzeRLProject(p, undefined, fast)).cases[0].matched).toBe(
      false,
    );
  });
  it("cancels truth enumeration and probability accumulation without publishing partial results", async () => {
    for (const phase of ["truth", "probability"] as const) {
      const abort = new AbortController();
      let current = "";
      await expect(
        analyzeRLProject(system("any"), undefined, {
          signal: abort.signal,
          onProgress: (progress) => {
            current = progress.phase;
          },
          yield: async () => {
            if (current === phase) abort.abort();
          },
        }),
      ).rejects.toThrow("cancelled");
    }
  });
  it("handles the maximum state space and reports truncated cut lists with exact totals", async () => {
    const p = system(
        "at-least",
        Array.from({ length: 16 }, () => 0.9),
        8,
      ),
      run = await analyzeRLProject(p, undefined, fast);
    expect(run.baseline.states).toBe(65536);
    expect(run.baseline.roots[0].cutsetCount).toBe(11440);
    expect(run.baseline.roots[0].cutsets).toHaveLength(128);
    expect(run.baseline.roots[0].cutsetsTruncated).toBe(true);
    const repairs = await findRLRepairs(
      p,
      "root",
      p.nodes.filter((node) => node.kind === "event").map((node) => node.id),
      fast,
    );
    expect(repairs.total).toBe(12870);
    expect(repairs.sets).toHaveLength(128);
    expect(repairs.truncated).toBe(true);
  });
  it("assigns no importance to events outside an output's dependency cone", async () => {
    const p = system("all");
    p.nodes.push({
      id: "unused",
      name: "Unused",
      kind: "event",
      probability: 0.2,
    });
    const output = (await analyzeRLProject(p, undefined, fast)).baseline
      .roots[0];
    expect(output.availability).toBeCloseTo(0.72, 14);
    expect(
      output.importance.find((item) => item.event === "unused"),
    ).toMatchObject({ importance: 0, gainIfPerfect: 0 });
    expect(output.cutsets.every((set) => !set.events.includes("unused"))).toBe(
      true,
    );
  });
  it("rejects excessive dependency depth before state enumeration", () => {
    const p = emptyRLProject();
    let previous = "app";
    for (let i = 0; i < 22; i++) {
      const id = `chain-${i}`;
      p.nodes.push({ id, name: id, kind: "all", inputs: [previous] });
      previous = id;
    }
    expect(() => normalizeRLProject(p)).toThrow("limit");
  });
});
