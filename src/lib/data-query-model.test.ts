import { describe, expect, it } from "vitest";
import {
  emptyDqProject,
  dqJson,
  normalizeDqProject,
  normalizeDqRows,
  normalizeDqExpr,
  normalizeDqStep,
  type DQRecord,
} from "./data-query-model";
import {
  checkDqResult,
  recordDqExpectation,
  runDataQuery,
} from "./data-query-engine";
describe("bounded data query project model", () => {
  it("rejects recursive/non-JSON/sparse values without inherited keys", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const value of [
      cycle,
      [undefined],
      Array(1),
      Infinity,
      new Date(),
      { nested: NaN },
    ])
      expect(() => dqJson(value)).toThrow();
    const value = JSON.parse('{"__proto__":{"kept":1},"constructor":2}');
    const normalized = dqJson(value) as DQRecord;
    expect(Object.hasOwn(normalized, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).kept).toBeUndefined();
  });
  it("rejects record, expression, stage and whole-project bounds", () => {
    expect(() =>
      normalizeDqRows(Array.from({ length: 2001 }, () => ({}))),
    ).toThrow("limit");
    expect(() => normalizeDqRows([{ value: "x".repeat(16384) }])).toThrow(
      "limit",
    );
    let expression: unknown = { op: "literal", value: 1 };
    for (let i = 0; i < 10; i++)
      expression = { op: "string", value: expression };
    expect(() => normalizeDqExpr(expression)).toThrow("limit");
    expect(() =>
      normalizeDqStep({ op: "slice", offset: -1, limit: 1 }),
    ).toThrow();
    expect(() =>
      normalizeDqStep({
        op: "join",
        source: { kind: "dataset", id: "records" },
        as: "right",
        mode: "inner",
        nulls: "never",
        keys: [],
      }),
    ).toThrow();
    const p = emptyDqProject();
    p.queries[0].steps = Array.from({ length: 13 }, () => ({
      op: "distinct" as const,
      keys: [],
    }));
    expect(() => normalizeDqProject(p)).toThrow("limit");
    p.queries[0].steps = [];
    p.datasets = Array.from({ length: 5 }, (_, i) => ({
      id: i === 0 ? "records" : `data-${i}`,
      name: "Table",
      rows: Array.from({ length: 100 }, () => ({ text: "x".repeat(10000) })),
    }));
    expect(() => normalizeDqProject(p)).toThrow("limit");
  });
  it("validates declared parameters, duplicate fields/aliases and unknown operators", () => {
    const p = emptyDqProject();
    p.queries[0].steps = [
      {
        op: "select",
        columns: [{ name: "value", value: { op: "param", name: "absent" } }],
      },
    ];
    expect(() => normalizeDqProject(p)).toThrow("reference");
    p.parameters = [
      { name: "absent", value: { op: "param", name: "this-is-literal-data" } },
    ];
    expect(normalizeDqProject(p)).toEqual(p);
    expect(() =>
      normalizeDqStep({
        op: "select",
        columns: [
          { name: "x", value: { op: "literal", value: 1 } },
          { name: "x", value: { op: "literal", value: 2 } },
        ],
      }),
    ).toThrow("query");
    expect(() => normalizeDqStep({ op: "eval", code: "return 1" })).toThrow(
      "query",
    );
    p.queries[0].steps = [
      {
        op: "join",
        source: { kind: "dataset", id: "records" },
        as: "row",
        mode: "inner",
        nulls: "never",
        keys: [{ left: "/row/id", right: "/id" }],
      },
    ];
    expect(() => normalizeDqProject(p)).toThrow("query");
  });
  it("fails missing-field checks for nonexistent output rows", async () => {
    const result = await runDataQuery(emptyDqProject(), "query-1"),
      expected = recordDqExpectation(result);
    expected.checks = [{ row: 0, pointer: "/field", missing: true }];
    expect(checkDqResult(result, expected).at(-1)?.passed).toBe(false);
    const p = emptyDqProject();
    p.datasets[0].rows = [{}];
    const existing = await runDataQuery(p, "query-1");
    expect(checkDqResult(existing, expected).at(-1)?.passed).toBe(true);
  });
});
