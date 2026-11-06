import { describe, expect, it } from "vitest";
import {
  runDataQuery,
  runDqScenarios,
  compareDqRows,
  dqResolve,
  recordDqExpectation,
  dqReport,
} from "./data-query-engine";
import { demoDqProject } from "./data-query-demo";
import {
  emptyDqProject,
  normalizeDqProject,
  serializeDqProject,
  parseDqProject,
  DataQueryError,
  type DQStep,
  type DQRecord,
  type DQExpr,
} from "./data-query-model";
const get = (pointer: string): DQExpr => ({ op: "get", pointer });
const literal = (value: null | string | number | boolean): DQExpr => ({
  op: "literal",
  value,
});
function project(rows: DQRecord[], steps: DQStep[] = []) {
  const p = emptyDqProject();
  p.datasets[0].rows = rows;
  p.queries[0].steps = steps;
  return p;
}
describe("API data query and federation engine", () => {
  it("passes ten specified shop regressions, including an expected arithmetic error", async () => {
    const runs = await runDqScenarios(demoDqProject());
    expect(runs).toHaveLength(10);
    expect(runs.map((r) => [r.scenarioId, r.passed])).toEqual(
      demoDqProject().scenarios.map((s) => [s.id, true]),
    );
    expect(runs[0].result!.rows.map((r) => r.total)).toEqual([
      250, 125, 75, 20, 10,
    ]);
    expect(runs[9]).toMatchObject({
      passed: true,
      error: { code: "expression", queryId: "line-items", stage: 3 },
    });
  });
  it("uses typed composite join keys, preserves right-row order, and distinguishes missing keys from null", async () => {
    const p = project(
      [
        { id: 1, region: "a" },
        { id: "1", region: "a" },
        { id: null, region: "a" },
        { region: "a" },
      ],
      [
        {
          op: "join",
          source: { kind: "dataset", id: "right" },
          as: "match",
          mode: "left",
          nulls: "never",
          keys: [
            { left: "/row/id", right: "/id" },
            { left: "/row/region", right: "/region" },
          ],
        },
      ],
    );
    p.datasets.push({
      id: "right",
      name: "Right",
      rows: [
        { id: 1, region: "a", label: "first" },
        { id: 1, region: "a", label: "second" },
        { id: "1", region: "a", label: "string" },
        { id: null, region: "a", label: "null" },
        { region: "a", label: "missing" },
      ],
    });
    const result = await runDataQuery(p, "query-1");
    expect(
      result.rows.map((r) =>
        r.match === null ? null : (r.match as DQRecord).label,
      ),
    ).toEqual(["first", "second", "string", null, null]);
    const join = p.queries[0].steps[0];
    if (join.op !== "join") throw new Error();
    join.nulls = "equal";
    expect(
      (await runDataQuery(p, "query-1")).rows.map((r) =>
        r.match === null ? null : (r.match as DQRecord).label,
      ),
    ).toEqual(["first", "second", "string", "null", null]);
    expect(result.plan[1]).toMatchObject({
      lookups: 4,
      matches: 3,
      input: 4,
      output: 5,
    });
  });
  it("implements semi and anti joins without multiplying left rows", async () => {
    const p = demoDqProject();
    expect(
      (await runDataQuery(p, "customers-with-orders")).rows.map((r) => r.id),
    ).toEqual(["c1", "c2", 2, "2"]);
    expect((await runDataQuery(p, "orphan-orders")).rows).toEqual([
      { id: "o4" },
    ]);
  });
  it("groups missing/null/number/string keys separately and evaluates all aggregate functions", async () => {
    const p = project(
      [
        { g: 1, n: 2 },
        { g: 1, n: 4 },
        { g: "1", n: 3 },
        { g: null, n: 8 },
        { n: 10 },
      ],
      [
        {
          op: "group",
          by: [{ name: "key", value: get("/row/g") }],
          measures: [
            { name: "count", op: "count", value: null },
            { name: "sum", op: "sum", value: get("/row/n") },
            { name: "avg", op: "avg", value: get("/row/n") },
            { name: "min", op: "min", value: get("/row/n") },
            { name: "max", op: "max", value: get("/row/n") },
            { name: "unique", op: "countDistinct", value: get("/row/n") },
          ],
        },
      ],
    );
    const result = await runDataQuery(p, "query-1");
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toEqual({
      key: 1,
      count: 2,
      sum: 6,
      avg: 3,
      min: 2,
      max: 4,
      unique: 2,
    });
    expect(result.rows[2].key).toBe(null);
    expect(Object.hasOwn(result.rows[3], "key")).toBe(false);
  });
  it("handles empty global aggregates and ignores missing/null aggregate values", async () => {
    const steps: DQStep[] = [
      {
        op: "group",
        by: [],
        measures: [
          { name: "all", op: "count", value: null },
          { name: "present", op: "count", value: get("/row/n") },
          { name: "sum", op: "sum", value: get("/row/n") },
          { name: "avg", op: "avg", value: get("/row/n") },
          { name: "min", op: "min", value: get("/row/n") },
        ],
      },
    ];
    expect((await runDataQuery(project([], steps), "query-1")).rows).toEqual([
      { all: 0, present: 0, sum: 0, avg: null, min: null },
    ]);
    expect(
      (
        await runDataQuery(
          project([{ n: null }, {}, { n: 2 }], steps),
          "query-1",
        )
      ).rows,
    ).toEqual([{ all: 3, present: 1, sum: 2, avg: 2, min: 2 }]);
  });
  it("preserves missing values through projections and evaluates typed expressions and boolean filters", async () => {
    const p = project(
      [{ n: "2", name: "ADA" }, { n: "3", name: "LIN" }, { name: "none" }],
      [
        {
          op: "filter",
          condition: {
            op: "not",
            condition: { op: "isMissing", value: get("/row/n") },
          },
        },
        {
          op: "derive",
          columns: [
            { name: "n", value: { op: "number", value: get("/row/n") } },
            { name: "label", value: { op: "lower", value: get("/row/name") } },
            { name: "unavailable", value: get("/n") },
          ],
        },
        {
          op: "select",
          columns: [
            {
              name: "doubled",
              value: { op: "multiply", left: get("/n"), right: literal(2) },
            },
            { name: "label", value: get("/label") },
            { name: "missing", value: get("/unavailable") },
            {
              name: "fallback",
              value: {
                op: "coalesce",
                values: [get("/missing"), literal("default")],
              },
            },
          ],
        },
      ],
    );
    expect((await runDataQuery(p, "query-1")).rows).toEqual([
      { doubled: 4, label: "ada", fallback: "default" },
      { doubled: 6, label: "lin", fallback: "default" },
    ]);
  });
  it("uses canonical structural equality, stable distinct/sort, fixed null placement and slices", async () => {
    const p = project(
      [
        { n: 2, id: "a" },
        { n: 2, id: "b" },
        { n: null, id: "c" },
        { id: "d" },
        { n: "2", id: "e" },
        { n: 2, id: "a" },
      ],
      [
        {
          op: "select",
          columns: [
            { name: "id", value: get("/row/id") },
            { name: "n", value: get("/row/n") },
          ],
        },
        { op: "distinct", keys: [] },
        {
          op: "sort",
          keys: [{ value: get("/n"), direction: "desc", nulls: "first" }],
        },
        { op: "slice", offset: 1, limit: 3 },
      ],
    );
    expect((await runDataQuery(p, "query-1")).rows.map((r) => r.id)).toEqual([
      "d",
      "e",
      "a",
    ]);
    const filter = project(
      [{ data: { a: 1, b: 2 } }],
      [
        {
          op: "filter",
          condition: {
            op: "eq",
            left: get("/row/data"),
            right: { op: "literal", value: { b: 2, a: 1 } },
          },
        },
      ],
    );
    expect((await runDataQuery(filter, "query-1")).rows).toHaveLength(1);
  });
  it("unnests arrays and supports left expansion while rejecting field collisions", async () => {
    const p = project(
      [{ items: [1, 2] }, { items: [] }, {}, { items: null }],
      [{ op: "unnest", pointer: "/row/items", as: "item", mode: "left" }],
    );
    expect((await runDataQuery(p, "query-1")).rows.map((r) => r.item)).toEqual([
      1,
      2,
      null,
      null,
      null,
    ]);
    p.queries[0].steps = [
      { op: "derive", columns: [{ name: "row", value: literal(1) }] },
    ];
    await expect(runDataQuery(p, "query-1")).rejects.toMatchObject({
      code: "query",
      stage: 1,
    });
  });
  it("caches dependent views per run and accounts plan work without double-counting", async () => {
    const p = project(
      [{ id: 1 }, { id: 2 }],
      [{ op: "select", columns: [{ name: "id", value: get("/row/id") }] }],
    );
    p.queries.push({
      id: "second",
      name: "Second",
      from: { kind: "query", id: "query-1" },
      as: "view",
      steps: [
        { op: "select", columns: [{ name: "id", value: get("/view/id") }] },
      ],
    });
    p.queries.push({
      id: "combined",
      name: "Combined",
      from: { kind: "query", id: "query-1" },
      as: "left",
      steps: [
        {
          op: "join",
          source: { kind: "query", id: "second" },
          as: "right",
          mode: "inner",
          nulls: "never",
          keys: [{ left: "/left/id", right: "/id" }],
        },
      ],
    });
    const result = await runDataQuery(p, "combined");
    expect(result.rows).toHaveLength(2);
    expect(
      result.plan.filter((p) => p.queryId === "query-1" && p.op === "source"),
    ).toHaveLength(1);
    expect(result.plan.reduce((n, p) => n + p.work, 0)).toBe(result.work);
  });
  it("tracks source rows across joins and aggregates and marks bounded lineage samples", async () => {
    const result = await runDataQuery(demoDqProject(), "revenue");
    expect(result.lineage[0].sources).toEqual(
      expect.arrayContaining([
        { datasetId: "orders", row: 0 },
        { datasetId: "customers", row: 0 },
      ]),
    );
    const p = project(
      Array.from({ length: 60 }, (_, id) => ({ id })),
      [
        {
          op: "group",
          by: [],
          measures: [{ name: "count", op: "count", value: null }],
        },
      ],
    );
    const grouped = await runDataQuery(p, "query-1");
    expect(grouped.rows[0].count).toBe(60);
    expect(grouped.lineage[0]).toMatchObject({ truncated: true });
    expect(grouped.lineage[0].sources).toHaveLength(32);
  });
  it("rejects invalid join/aggregate/sort keys and unsafe arithmetic with located diagnostics", async () => {
    const p = project(
      [{ key: {} }],
      [
        {
          op: "join",
          source: { kind: "dataset", id: "records" },
          as: "right",
          mode: "inner",
          nulls: "never",
          keys: [{ left: "/row/key", right: "/key" }],
        },
      ],
    );
    await expect(runDataQuery(p, "query-1")).rejects.toMatchObject({
      code: "join-key",
      queryId: "query-1",
      stage: 1,
    });
    p.queries[0].steps = [
      {
        op: "group",
        by: [],
        measures: [{ name: "sum", op: "sum", value: get("/row/key") }],
      },
    ];
    await expect(runDataQuery(p, "query-1")).rejects.toMatchObject({
      code: "aggregate",
    });
    p.queries[0].steps = [
      {
        op: "sort",
        keys: [{ value: get("/row/key"), direction: "asc", nulls: "last" }],
      },
    ];
    await expect(runDataQuery(p, "query-1")).rejects.toMatchObject({
      code: "sort-key",
    });
    p.queries[0].steps = [
      {
        op: "select",
        columns: [
          {
            name: "x",
            value: { op: "divide", left: literal(1), right: literal(0) },
          },
        ],
      },
    ];
    await expect(runDataQuery(p, "query-1")).rejects.toMatchObject({
      code: "expression",
    });
  });
  it("stops join fan-out and excessive expression work without altering source data", async () => {
    const p = project(
      Array.from({ length: 100 }, () => ({ id: 1 })),
      [
        {
          op: "join",
          source: { kind: "dataset", id: "records" },
          as: "right",
          mode: "inner",
          nulls: "never",
          keys: [{ left: "/row/id", right: "/id" }],
        },
      ],
    );
    const before = serializeDqProject(p);
    await expect(runDataQuery(p, "query-1")).rejects.toMatchObject({
      code: "limit",
      stage: 1,
    });
    expect(serializeDqProject(p)).toBe(before);
    const heavy = project(
      Array.from({ length: 500 }, () => ({})),
      Array.from({ length: 12 }, (_, i) => ({
        op: "derive" as const,
        columns: Array.from({ length: 32 }, (_, j) => ({
          name: `field_${i}_${j}`,
          value: { op: "add" as const, left: literal(1), right: literal(2) },
        })),
      })),
    );
    await expect(runDataQuery(heavy, "query-1")).rejects.toMatchObject({
      code: "limit",
    });
  });
  it("captures async inputs, supports cancellation, and keeps result mutation isolated", async () => {
    const p = demoDqProject(),
      running = runDataQuery(p, "revenue");
    p.datasets[1].rows = [];
    const result = await running;
    expect(result.rows).toHaveLength(5);
    result.rows[0].total = 999;
    expect((await runDataQuery(demoDqProject(), "revenue")).rows[0].total).toBe(
      250,
    );
    let stop = false;
    await expect(
      runDataQuery(demoDqProject(), "revenue", {}, [], {
        cancelled: () => stop,
        progress: () => {
          stop = true;
        },
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
  it("validates dependency cycles, references, parameters, prototypes and source-only round trips", async () => {
    const p = demoDqProject();
    expect(parseDqProject(serializeDqProject(p))).toEqual(p);
    expect(normalizeDqProject({ ...p, results: ["forged"] })).toEqual(p);
    const cycle = demoDqProject();
    cycle.queries[0].from = { kind: "query", id: "revenue" };
    expect(() => normalizeDqProject(cycle)).toThrow("reference");
    const ref = demoDqProject();
    ref.queries[0].from.id = "missing";
    expect(() => normalizeDqProject(ref)).toThrow("reference");
    await expect(runDataQuery(p, "revenue", { unknown: 1 })).rejects.toThrow(
      "reference",
    );
    const own = project(
      [JSON.parse('{"__proto__":{"value":7}}')],
      [
        {
          op: "select",
          columns: [{ name: "value", value: get("/row/__proto__/value") }],
        },
      ],
    );
    expect((await runDataQuery(own, "query-1")).rows).toEqual([{ value: 7 }]);
    expect(dqResolve({}, "/constructor").found).toBe(false);
    expect(dqResolve([1], "/01").found).toBe(false);
    expect(dqResolve({ "a/b": { "~": null } }, "/a~1b/~0")).toEqual({
      found: true,
      value: null,
    });
  });
  it("records expectations, detects changed values, exports reports without data, and distinguishes unchecked/error cases", async () => {
    const p = demoDqProject(),
      result = await runDataQuery(p, "revenue"),
      e = recordDqExpectation(result, true);
    p.scenarios = [
      {
        id: "recorded",
        name: "Recorded",
        queryId: "revenue",
        parameters: {},
        overrides: [],
        expect: e,
      },
    ];
    expect((await runDqScenarios(p))[0].passed).toBe(true);
    e.checks = [{ row: 0, pointer: "/customer", value: "incorrect" }];
    const failed = await runDqScenarios(p);
    expect(failed[0].passed).toBe(false);
    expect(failed[0].checks.at(-1)!.passed).toBe(false);
    expect(dqReport(failed)).not.toMatch(
      /"Ada"|"Grace"|"rows"\s*:\s*\[|"parameters"|"lineage"|"exact"\s*:/,
    );
    p.scenarios[0].expect = null;
    expect((await runDqScenarios(p))[0]).toMatchObject({
      checked: false,
      passed: false,
    });
    await expect(runDqScenarios(p, "unknown")).rejects.toThrow("reference");
  });
  it("compares captured outputs by typed keys and rejects ambiguous identities", () => {
    const baseline: DQRecord[] = [
        { id: 1, value: "old" },
        { id: "1", value: "same" },
        { id: 2 },
      ],
      candidate: DQRecord[] = [
        { id: "1", value: "same" },
        { id: 1, value: "new" },
        { id: 3 },
      ];
    const diff = compareDqRows(baseline, candidate, "/id");
    expect(diff.summary).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 1,
    });
    expect(diff.differences.map((d) => d.kind)).toEqual([
      "changed",
      "removed",
      "added",
    ]);
    expect(() => compareDqRows([{ id: 1 }, { id: 1 }], [], "/id")).toThrow(
      "comparison-key",
    );
    expect(() => compareDqRows([{}], [], "/id")).toThrow("comparison-key");
    expect(DataQueryError).toBeDefined();
  });
});
