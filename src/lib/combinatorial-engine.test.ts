import { describe, expect, it } from "vitest";
import {
  auditCTRows,
  buildCTSpace,
  evaluateCTCondition,
  generateCTSuite,
  ctCoverageReport,
} from "./combinatorial-engine";
import {
  CTError,
  emptyCTProject,
  normalizeCTProject,
  normalizeCTRows,
  parseCTProject,
  serializeCTProject,
  type CTProject,
  type CTRow,
  type CTCondition,
} from "./combinatorial-model";
import { demoCTProject } from "./combinatorial-demo";

const fast = { yield: async () => {} };
const binary = (count: number, strength: 1 | 2 | 3 = 2): CTProject => ({
  ...emptyCTProject(),
  strength,
  variables: Array.from({ length: count }, (_, i) => ({
    id: `v${i}`,
    name: `Variable ${i}`,
    location: "custom",
    choices: [false, true].map((value) => ({
      id: String(value),
      label: String(value),
      kind: "value",
      value,
    })),
  })),
});
function row(
  project: CTProject,
  id: string,
  indices: number[],
  pinned = false,
): CTRow {
  return {
    id,
    name: id,
    pinned,
    choices: Object.fromEntries(
      project.variables.map((v, i) => [v.id, v.choices[indices[i]].id]),
    ),
  };
}
describe("finite-domain project validation", () => {
  it("bounds the readable export as well as compact input so projects stay restorable", () => {
    const variables: CTProject["variables"] = Array.from(
      { length: 12 },
      (_, i) => ({
        id: `variable-${String(i).padStart(23, "0")}`,
        name: "Variable",
        location: "custom",
        choices: Array.from({ length: 8 }, (_, c) => ({
          id: `value-${c}`,
          label: `Value ${c}`,
          kind: "value",
          value: "\u20ac".repeat(1100) + c,
        })),
      }),
    );
    const project = {
      ...emptyCTProject(),
      variables,
      rows: Array.from({ length: 256 }, (_, i) => ({
        id: `case-${i}`,
        name: "N".repeat(160),
        pinned: false,
        choices: Object.fromEntries(variables.map((v) => [v.id, "value-0"])),
      })),
    };
    expect(Buffer.byteLength(JSON.stringify(project))).toBeLessThan(512 * 1024);
    expect(Buffer.byteLength(JSON.stringify(project, null, 2))).toBeGreaterThan(
      512 * 1024,
    );
    expect(() => normalizeCTProject(project)).toThrow("limit");
  });
  it("round-trips portable projects without importing results or unknown fields", () => {
    const project = demoCTProject();
    expect(parseCTProject(`\uFEFF${serializeCTProject(project)}`)).toEqual(
      project,
    );
    expect(
      normalizeCTProject({ ...project, results: { complete: true } }),
    ).not.toHaveProperty("results");
  });
  it.each([
    (p: CTProject) => ({ ...p, strength: 3.5 }),
    (p: CTProject) => ({ ...p, seed: -1 }),
    (p: CTProject) => ({ ...p, seed: 2 ** 32 }),
    (p: CTProject) => ({ ...p, variables: [] }),
    (p: CTProject) => ({ ...p, variables: [p.variables[0], p.variables[0]] }),
    (p: CTProject) => ({
      ...p,
      variables: [{ ...p.variables[0], id: "__proto__" }],
    }),
    (p: CTProject) => ({
      ...p,
      variables: [{ ...p.variables[0], choices: [] }],
    }),
    (p: CTProject) => ({
      ...p,
      variables: [
        {
          ...p.variables[0],
          choices: [{ id: "a", label: "NaN", kind: "value", value: NaN }],
        },
      ],
    }),
    (p: CTProject) => ({
      ...p,
      variables: [
        {
          ...p.variables[0],
          location: "path",
          choices: [{ id: "absent", label: "Absent", kind: "omit" }],
        },
      ],
    }),
    (p: CTProject) => ({
      ...p,
      constraints: [
        {
          id: "rule",
          name: "Rule",
          condition: { op: "is", variable: "unknown", choice: "false" },
        },
      ],
    }),
  ])("rejects malformed models atomically (%#)", (change) => {
    expect(() => normalizeCTProject(change(emptyCTProject()))).toThrow(CTError);
  });
  it("keeps omission, null, false, empty string, zero and their string forms distinct", () => {
    const choices = [null, false, "", 0, "0", "false"].map((value, i) => ({
      id: `value${i}`,
      label: `Value ${i}`,
      kind: "value",
      value,
    }));
    const p = normalizeCTProject({
      ...binary(1, 1),
      variables: [
        {
          id: "constructor",
          name: "Special name",
          location: "query",
          choices: [
            { id: "absent", label: "Absent", kind: "omit" },
            ...choices,
          ],
        },
      ],
    });
    expect(p.variables[0].choices).toHaveLength(7);
    expect(() =>
      normalizeCTProject({
        ...p,
        variables: [
          {
            ...p.variables[0],
            choices: [...choices, { ...choices[0], id: "duplicate" }],
          },
        ],
      }),
    ).toThrow("duplicate");
  });
  it("rejects partial, extra, unknown and duplicate row assignments", () => {
    const p = emptyCTProject(),
      valid = row(p, "r", [0, 0, 0]);
    for (const choices of [
      {},
      { ...valid.choices, extra: "false" },
      { ...valid.choices, a: "missing" },
    ])
      expect(() =>
        normalizeCTRows([{ ...valid, choices }], p.variables),
      ).toThrow("rows");
    expect(() => normalizeCTRows([valid, valid], p.variables)).toThrow(
      "duplicate",
    );
  });
  it("bounds nested constraints and actual UTF-8 project bytes", () => {
    let condition: CTCondition = { op: "is", variable: "a", choice: "true" };
    for (let i = 0; i < 14; i++) condition = { op: "not", arg: condition };
    expect(() =>
      normalizeCTProject({
        ...emptyCTProject(),
        constraints: [{ id: "deep", name: "Deep", condition }],
      }),
    ).toThrow("limit");
    expect(() =>
      parseCTProject(`{"padding":"${"\u20ac".repeat(180_000)}"}`),
    ).toThrow("limit");
  });
});

describe("constrained covering arrays", () => {
  it("generates reproducible compact pairwise suites with exhaustive interaction coverage", async () => {
    const p = binary(5),
      before = serializeCTProject(p),
      space = await buildCTSpace(p, fast);
    const suite = await generateCTSuite(space, [], "replace", fast);
    expect(space.candidates).toHaveLength(32);
    expect(space.tuples).toHaveLength(40);
    expect(suite.length).toBeLessThan(10);
    expect(auditCTRows(space, suite)).toMatchObject({
      complete: true,
      percentage: 100,
      feasibleTuples: 40,
      missing: [],
    });
    expect(await generateCTSuite(space, [], "replace", fast)).toEqual(suite);
    expect(serializeCTProject(p)).toBe(before);
    for (const test of suite)
      expect(
        auditCTRows(
          space,
          suite.filter((r) => r.id !== test.id),
        ).missing.length,
      ).toBeGreaterThan(0);
  });
  it("distinguishes pairwise coverage from three-way coverage", async () => {
    const p = binary(3),
      pairs = await buildCTSpace(p, fast),
      suite = await generateCTSuite(pairs, [], "replace", fast);
    const triples = await buildCTSpace({ ...p, strength: 3 }, fast);
    expect(auditCTRows(pairs, suite).complete).toBe(true);
    expect(auditCTRows(triples, suite).complete).toBe(false);
    expect(await generateCTSuite(triples, [], "replace", fast)).toHaveLength(8);
  });
  it("computes excluded interactions from full constraint feasibility, including third-variable dependencies", async () => {
    const p = binary(3);
    p.constraints = [
      {
        id: "equal-a-c",
        name: "A implies C",
        condition: {
          op: "implies",
          if: { op: "is", variable: "v0", choice: "true" },
          then: { op: "is", variable: "v2", choice: "true" },
        },
      },
      {
        id: "b-not-c",
        name: "B excludes C",
        condition: {
          op: "not",
          arg: {
            op: "all",
            args: [
              { op: "is", variable: "v1", choice: "true" },
              { op: "is", variable: "v2", choice: "true" },
            ],
          },
        },
      },
    ];
    const space = await buildCTSpace(p, fast);
    expect(space.tuples.find((t) => t.id === "v0=true|v1=true")?.feasible).toBe(
      false,
    );
    const rows = await generateCTSuite(space, [], "replace", fast);
    expect(
      rows.every((r) =>
        p.constraints.every((c) => evaluateCTCondition(c.condition, r.choices)),
      ),
    ).toBe(true);
    expect(auditCTRows(space, rows).complete).toBe(true);
  });
  it("audits the demo's pinned row, preserves it exactly, and repairs an incomplete selection", async () => {
    const p = demoCTProject(),
      space = await buildCTSpace(p, fast);
    expect(auditCTRows(space, p.rows).percentage).toBeLessThan(100);
    const suite = await generateCTSuite(space, p.rows, "replace", fast);
    expect(suite[0]).toEqual(p.rows[0]);
    const partial = suite.slice(0, 2),
      extended = await generateCTSuite(space, partial, "extend", fast);
    expect(extended.slice(0, partial.length)).toEqual(partial);
    expect(auditCTRows(space, extended).complete).toBe(true);
  });
  it("never counts invalid rows, reports duplicates, and refuses invalid retained tests", async () => {
    const p = binary(2),
      existing = row(p, "existing", [1, 1], true);
    p.constraints = [
      {
        id: "forbid",
        name: "Forbid",
        condition: {
          op: "not",
          arg: {
            op: "all",
            args: [
              { op: "is", variable: "v0", choice: "true" },
              { op: "is", variable: "v1", choice: "true" },
            ],
          },
        },
      },
    ];
    const space = await buildCTSpace(p, fast),
      audit = auditCTRows(space, [existing, { ...existing, id: "duplicate" }]);
    expect(audit.covered).toEqual([]);
    expect(audit.rows[1]).toMatchObject({
      valid: false,
      duplicateOf: "existing",
      failedConstraints: ["forbid"],
    });
    await expect(
      generateCTSuite(space, [existing], "replace", fast),
    ).rejects.toThrow("invalid-row");
    await expect(
      generateCTSuite(space, [{ ...existing, pinned: false }], "extend", fast),
    ).rejects.toThrow("invalid-row");
    expect(
      auditCTRows(
        space,
        await generateCTSuite(
          space,
          [{ ...existing, pinned: false }],
          "replace",
          fast,
        ),
      ).complete,
    ).toBe(true);
  });
  it("does not report unsatisfiable models as complete or 100 percent covered", async () => {
    const p = binary(1, 1);
    p.constraints = [
      {
        id: "never",
        name: "Never",
        condition: {
          op: "all",
          args: [
            { op: "is", variable: "v0", choice: "true" },
            { op: "is", variable: "v0", choice: "false" },
          ],
        },
      },
    ];
    const space = await buildCTSpace(p, fast);
    expect(auditCTRows(space, [])).toMatchObject({
      complete: false,
      percentage: 0,
      feasibleRows: 0,
      feasibleTuples: 0,
      infeasibleTuples: 2,
    });
    await expect(generateCTSuite(space, [], "replace", fast)).rejects.toThrow(
      "unsatisfiable",
    );
  });
  it("prunes only definite false conditions while assignments are partial", () => {
    const a: CTCondition = { op: "is", variable: "a", choice: "true" };
    expect(evaluateCTCondition(a, {})).toBeUndefined();
    expect(
      evaluateCTCondition(
        { op: "implies", if: a, then: { op: "not", arg: a } },
        {},
      ),
    ).toBeUndefined();
    expect(
      evaluateCTCondition(
        { op: "any", args: [a, { op: "is", variable: "b", choice: "true" }] },
        { b: "true" },
      ),
    ).toBe(true);
    expect(
      evaluateCTCondition(
        { op: "is", variable: "constructor", choice: "true" },
        {},
      ),
    ).toBeUndefined();
  });
  it("matches independent exhaustive feasibility and tuple oracles across constrained models", async () => {
    for (let seed = 0; seed < 20; seed++) {
      const p = binary(4, seed % 2 ? 2 : 3);
      p.seed = seed;
      const forbiddenA = seed % 2,
        forbiddenB = Math.floor(seed / 2) % 2;
      p.constraints = [
        {
          id: "forbid",
          name: "Forbid",
          condition: {
            op: "not",
            arg: {
              op: "all",
              args: [
                {
                  op: "is",
                  variable: "v0",
                  choice: String(Boolean(forbiddenA)),
                },
                {
                  op: "is",
                  variable: "v3",
                  choice: String(Boolean(forbiddenB)),
                },
              ],
            },
          },
        },
      ];
      const expected: CTRow[] = [];
      for (let bits = 0; bits < 16; bits++) {
        const indices = [0, 1, 2, 3].map((n) => (bits >> n) & 1);
        if (indices[0] !== forbiddenA || indices[3] !== forbiddenB)
          expected.push(row(p, `r${bits}`, indices));
      }
      const space = await buildCTSpace(p, fast);
      expect(space.candidates.length).toBe(expected.length);
      for (const tuple of space.tuples)
        expect(tuple.feasible).toBe(
          expected.some((r) =>
            tuple.terms.every(
              (term) => r.choices[term.variable] === term.choice,
            ),
          ),
        );
      expect(
        auditCTRows(space, await generateCTSuite(space, [], "replace", fast))
          .complete,
      ).toBe(true);
    }
  });
  it("cancels enumeration and generation at cooperative yield boundaries", async () => {
    const abort = new AbortController();
    await expect(
      buildCTSpace(binary(5), {
        signal: abort.signal,
        yield: async () => {
          abort.abort();
        },
      }),
    ).rejects.toThrow("cancelled");
    const space = await buildCTSpace(binary(5), fast),
      other = new AbortController();
    await expect(
      generateCTSuite(space, [], "replace", {
        signal: other.signal,
        yield: async () => {
          other.abort();
        },
      }),
    ).rejects.toThrow("cancelled");
  });
  it("rejects excessive interaction universes before assignment search", async () => {
    const p = binary(12, 3);
    p.variables = p.variables.map((v) => ({
      ...v,
      choices: Array.from({ length: 8 }, (_, i) => ({
        id: `c${i}`,
        label: String(i),
        kind: "value",
        value: i,
      })),
    }));
    await expect(buildCTSpace(p, fast)).rejects.toThrow("limit");
  });
  it("bounds candidate storage and incidence storage independently", async () => {
    const p = binary(10, 1);
    p.variables = p.variables.map((v) => ({
      ...v,
      choices: Array.from({ length: 3 }, (_, i) => ({
        id: `c${i}`,
        label: String(i),
        kind: "value",
        value: i,
      })),
    }));
    let candidates = 0;
    await expect(
      buildCTSpace(p, {
        ...fast,
        onProgress: (progress) => {
          candidates = progress.candidates;
        },
      }),
    ).rejects.toThrow("limit");
    expect(candidates).toBeGreaterThan(19_000);
    candidates = 0;
    await expect(
      buildCTSpace(
        { ...p, strength: 3 },
        {
          ...fast,
          onProgress: (progress) => {
            candidates = progress.candidates;
          },
        },
      ),
    ).rejects.toThrow("limit");
    expect(candidates).toBeLessThan(9_000);
  });
  it("bounds search work even when constraints make all assignments infeasible", async () => {
    const p = binary(12, 1);
    p.variables = p.variables.map((v) => ({
      ...v,
      choices: Array.from({ length: 8 }, (_, i) => ({
        id: `c${i}`,
        label: String(i),
        kind: "value",
        value: i,
      })),
    }));
    p.constraints = [
      {
        id: "impossible-last",
        name: "Impossible last input",
        condition: {
          op: "all",
          args: [
            { op: "is", variable: "v11", choice: "c0" },
            { op: "is", variable: "v11", choice: "c1" },
          ],
        },
      },
    ];
    let last = 0;
    await expect(
      buildCTSpace(p, {
        ...fast,
        onProgress: (progress) => {
          last = progress.states;
        },
      }),
    ).rejects.toThrow("limit");
    expect(last).toBeGreaterThan(199_000);
  });
  it("fails atomically when a full-strength suite needs more than 256 rows", async () => {
    const p = binary(3, 3);
    p.variables = p.variables.map((v) => ({
      ...v,
      choices: Array.from({ length: 8 }, (_, i) => ({
        id: `c${i}`,
        label: String(i),
        kind: "value",
        value: i,
      })),
    }));
    const space = await buildCTSpace(p, fast);
    await expect(generateCTSuite(space, [], "replace", fast)).rejects.toThrow(
      "limit",
    );
    expect(auditCTRows(space, []).covered).toEqual([]);
  });
  it("produces reports without scalar input values or choice labels", async () => {
    const p = binary(2);
    p.variables[0].choices[0] = {
      id: "secret",
      label: "private-label",
      kind: "value",
      value: "private-input-value",
    };
    const space = await buildCTSpace(p, fast),
      suite = await generateCTSuite(space, [], "replace", fast);
    expect(JSON.stringify(ctCoverageReport(space, suite))).not.toMatch(
      /private-label|private-input-value|"value"\s*:/,
    );
  });
});
