import { describe, expect, it } from "vitest";
import {
  evaluateDecision,
  analyzeDecisionCatalog,
  findDecisionCounterfactual,
  runDecisionSuite,
  recordDecisionExpectation,
  decisionReport,
  dtRead,
  createDecisionEvaluator,
} from "./decision-engine";
import { demoDtProject } from "./decision-demo";
import {
  emptyDtProject,
  normalizeDtProject,
  parseDtProject,
  serializeDtProject,
  dtJson,
  type DTProject,
  type DTDecision,
  type DTExpr,
  type DTCondition,
} from "./decision-model";
const literal = (value: number | string | null): DTExpr => ({
  op: "literal",
  value,
});
function constantDecision(policy: DTDecision["policy"]): DTProject {
  const p = emptyDtProject();
  p.inputs = [];
  p.decisions[0] = {
    id: "decision",
    name: "Constant",
    policy,
    columns: [],
    rules: [
      { id: "a", name: "A", when: [], output: literal(2) },
      { id: "b", name: "B", when: [], output: literal(3) },
    ],
    fallback: null,
  };
  return p;
}
describe("decision-table automation engine", () => {
  it("snapshots compiled evaluators and isolates returned outputs from future evaluations", () => {
    const p = constantDecision("first"),
      evaluate = createDecisionEvaluator(p);
    p.decisions[0].rules[0].output = literal(999);
    const result = evaluate("decision", {});
    expect(result.result.output).toBe(2);
    result.result.output = 0;
    expect(evaluate("decision", {}).result.output).toBe(2);
  });
  it("labels bounded counterfactual results as provisional even when a candidate was found", async () => {
    const p = emptyDtProject();
    p.inputs = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      name: "Input",
      type: "number" as const,
      required: true,
      nullable: false,
      cost: 1,
      catalog: Array.from({ length: 8 }, (_, value) => ({
        present: true as const,
        value,
      })),
    }));
    p.decisions[0].columns = p.inputs.map((i) => ({
      id: i.id,
      name: i.name,
      source: { kind: "input" as const, id: i.id },
    }));
    p.decisions[0].rules = [
      {
        id: "target",
        name: "Target",
        when: p.inputs.map((_, i) =>
          i === 4 ? { op: "eq" as const, value: 1 } : { op: "any" as const },
        ),
        output: literal(1),
      },
    ];
    const result = await findDecisionCounterfactual(
      p,
      "decision",
      { i0: 0, i1: 0, i2: 0, i3: 0, i4: 0 },
      { status: "matched", output: 1 },
    );
    expect(result).toMatchObject({
      enumerated: 4096,
      complete: false,
      optimal: false,
      reason: "cases",
      best: { cost: 1 },
    });
  });
  it("honors the shared work budget before catalog enumeration finishes", async () => {
    const p = emptyDtProject();
    p.inputs = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      name: "Input",
      type: "number" as const,
      required: true,
      nullable: false,
      cost: 1,
      catalog: Array.from({ length: 8 }, (_, value) => ({
        present: true as const,
        value,
      })),
    }));
    p.decisions = Array.from({ length: 4 }, (_, i) => ({
      id: i ? `dependency-${i}` : "decision",
      name: "Layer",
      policy: "first" as const,
      columns: p.inputs.map((input) => ({
        id: input.id,
        name: input.name,
        source: { kind: "input" as const, id: input.id },
      })),
      rules: Array.from({ length: 24 }, (_, row) => ({
        id: `r-${row}`,
        name: "Rule",
        when: p.inputs.map(() => ({ op: "any" as const })),
        output:
          i < 3 && row === 0
            ? {
                op: "ref" as const,
                ref: {
                  kind: "decision" as const,
                  id: `dependency-${i + 1}`,
                  pointer: "",
                },
              }
            : literal(1),
      })),
      fallback: null,
    }));
    const result = await analyzeDecisionCatalog(p, "decision");
    expect(result.complete).toBe(false);
    expect(result.reason).toBe("work");
    expect(result.checked).toBeLessThan(4096);
    expect(result.work).toBeLessThanOrEqual(2000000);
  });
  it("passes twelve specified shipping, dependency, overlap, aggregate, and error regressions", async () => {
    const runs = await runDecisionSuite(demoDtProject());
    expect(runs).toHaveLength(12);
    expect(runs.map((run) => [run.caseId, run.passed])).toEqual(
      demoDtProject().cases.map((s) => [s.id, true]),
    );
  });
  it("implements all hit policies and keeps full matching traces after first-hit selection", () => {
    expect(
      evaluateDecision(constantDecision("unique"), "decision", {}).result,
    ).toMatchObject({
      status: "conflict",
      matched: ["a", "b"],
      selected: [],
      output: null,
    });
    expect(
      evaluateDecision(constantDecision("first"), "decision", {}).result,
    ).toMatchObject({
      status: "matched",
      matched: ["a", "b"],
      selected: ["a"],
      output: 2,
    });
    expect(
      evaluateDecision(constantDecision("all"), "decision", {}).result.output,
    ).toEqual([2, 3]);
    expect(
      evaluateDecision(constantDecision("sum"), "decision", {}).result.output,
    ).toBe(5);
    const bad = constantDecision("sum");
    bad.decisions[0].rules[1].output = literal("3");
    expect(evaluateDecision(bad, "decision", {}).result).toMatchObject({
      status: "error",
      error: "sum-type",
    });
  });
  it("distinguishes missing values, explicit null, strict types and inclusive boundaries", () => {
    const p = demoDtProject();
    const membership = (context: unknown) =>
      evaluateDecision(p, "membership", context).result;
    expect(membership({}).output).toBe("guest");
    expect(membership({ member: null }).output).toBe("standard");
    expect(membership({ member: true }).output).toBe("loyal");
    expect(() => membership({ member: "true" })).toThrow("context");
    expect(
      evaluateDecision(p, "shipping", { region: "EU", subtotal: 100 }).result
        .output,
    ).toBe(0);
    expect(
      evaluateDecision(p, "shipping", { region: "EU", subtotal: 99 }).result
        .output,
    ).toBe(10);
    expect(() => evaluateDecision(p, "shipping", { region: "EU" })).toThrow(
      "context",
    );
    expect(() => membership({ unknown: 1 })).toThrow("context");
  });
  it("caches dependencies per evaluation, blocks invalid dependencies and lazily ignores unselected output expressions", () => {
    const p = demoDtProject(),
      evaluation = evaluateDecision(p, "total", {
        region: "EU",
        subtotal: 50,
        member: false,
        express: true,
      });
    expect(evaluation.result.output).toBe(17);
    expect(
      evaluation.decisions.filter((d) => d.decisionId === "membership"),
    ).toHaveLength(1);
    expect(evaluation.decisions.reduce((sum, d) => sum + d.work, 0)).toBe(
      evaluation.work,
    );
    expect(
      evaluateDecision(p, "blocked", { subtotal: 100 }).result,
    ).toMatchObject({ status: "blocked", blockedBy: ["conflicting"] });
    const lazy = constantDecision("first");
    lazy.decisions[0].rules[1].output = {
      op: "divide",
      left: literal(1),
      right: literal(0),
    };
    expect(evaluateDecision(lazy, "decision", {}).result.output).toBe(2);
  });
  it("evaluates fallback expressions and reports arithmetic and missing-output diagnostics", () => {
    const p = emptyDtProject();
    p.inputs[0].required = false;
    p.inputs[0].catalog = [{ present: false }];
    p.decisions[0].fallback = literal(null);
    expect(evaluateDecision(p, "decision", {}).result).toMatchObject({
      status: "default",
      output: null,
    });
    p.decisions[0].fallback = {
      op: "ref",
      ref: { kind: "input", id: "amount" },
    };
    expect(evaluateDecision(p, "decision", {}).result).toMatchObject({
      status: "error",
      error: "missing-output",
    });
    expect(
      evaluateDecision(demoDtProject(), "bad-math", { subtotal: 0 }).result,
    ).toMatchObject({ status: "error", error: "division-zero" });
  });
  it("analyzes the complete configured catalogs with exact gap, overlap and shadowing counts", async () => {
    const p = demoDtProject(),
      shipping = await analyzeDecisionCatalog(p, "shipping");
    expect(shipping).toMatchObject({
      checked: 48,
      total: 48,
      complete: true,
      overlaps: 0,
      counts: { matched: 32, "no-match": 16 },
    });
    expect(shipping.rules.map((r) => r.selected)).toEqual([4, 6, 6, 16]);
    expect(shipping.samples).toHaveLength(12);
    const tier = await analyzeDecisionCatalog(p, "membership");
    expect(tier).toMatchObject({ checked: 4, complete: true, overlaps: 3 });
    expect(tier.rules.find((r) => r.id === "shadowed")).toMatchObject({
      matches: 1,
      selected: 0,
    });
  });
  it("returns partial coverage when the finite product exceeds the case bound and supports cancellation", async () => {
    const p = emptyDtProject();
    p.inputs = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      name: "Input",
      type: "number" as const,
      required: true,
      nullable: false,
      cost: 1,
      catalog: Array.from({ length: 8 }, (_, value) => ({
        present: true as const,
        value,
      })),
    }));
    p.decisions[0].columns = p.inputs.map((i) => ({
      id: i.id,
      name: i.name,
      source: { kind: "input" as const, id: i.id },
    }));
    const result = await analyzeDecisionCatalog(p, "decision");
    expect(result).toMatchObject({
      checked: 4096,
      total: 32768,
      complete: false,
      reason: "cases",
    });
    let stop = false;
    await expect(
      analyzeDecisionCatalog(p, "decision", {
        cancelled: () => stop,
        progress: (point) => {
          if (point.checked >= 16) stop = true;
        },
      }),
    ).rejects.toThrow("cancelled");
  });
  it("finds a weighted optimum in catalogs, retains baseline values outside them and freezes excluded inputs", async () => {
    const p = demoDtProject(),
      context = { region: "EU", subtotal: 50, member: false, express: false };
    const result = await findDecisionCounterfactual(p, "shipping", context, {
      status: "matched",
      output: 0,
    });
    expect(result).toMatchObject({
      optimal: true,
      complete: true,
      best: {
        cost: 1,
        context: { region: "EU", subtotal: 100, member: false, express: false },
      },
    });
    expect(result.best!.changes.map((c) => c.id)).toEqual(["subtotal"]);
    const frozen = await findDecisionCounterfactual(
      p,
      "shipping",
      context,
      { status: "matched", output: 0 },
      ["member"],
    );
    expect(frozen.best).toMatchObject({
      cost: 3,
      context: { subtotal: 50, member: true },
    });
    expect(context.subtotal).toBe(50);
    const already = await findDecisionCounterfactual(p, "shipping", context, {
      status: "matched",
      output: 10,
    });
    expect(already).toMatchObject({
      optimal: true,
      reason: "zero",
      evaluated: 1,
      best: { cost: 0 },
    });
  });
  it("records exact expectations when requested and exports metadata without context or output values", async () => {
    const p = demoDtProject(),
      evaluation = evaluateDecision(p, "membership", { member: true });
    p.cases = [
      {
        id: "recorded",
        name: "Private case",
        decisionId: "membership",
        context: { member: true },
        expect: recordDecisionExpectation(evaluation, true),
      },
    ];
    expect((await runDecisionSuite(p))[0].passed).toBe(true);
    p.cases[0].expect!.output = "wrong";
    expect((await runDecisionSuite(p))[0].passed).toBe(false);
    const report = decisionReport(await runDecisionSuite(p));
    expect(report).not.toMatch(
      /"context"\s*:|"output"\s*:|"value"\s*:|Private case|"loyal"\s*:/,
    );
    p.cases[0].expect = null;
    expect((await runDecisionSuite(p))[0]).toMatchObject({
      checked: false,
      passed: false,
    });
  });
  it("validates cycles, references, bounded values and source-only round trips", () => {
    const p = demoDtProject();
    expect(parseDtProject(serializeDtProject(p))).toEqual(p);
    expect(normalizeDtProject({ ...p, results: ["forged"] })).toEqual(p);
    const cycle = demoDtProject();
    cycle.decisions[0].columns[0].source = {
      kind: "decision",
      id: "shipping",
      pointer: "",
    };
    expect(() => normalizeDtProject(cycle)).toThrow("reference");
    const own = dtJson(JSON.parse('{"__proto__":{"a/b":{"~":7}}}'));
    expect(dtRead(own, "/__proto__/a~1b/~0")).toEqual({
      present: true,
      value: 7,
    });
    expect(dtRead({}, "/constructor").present).toBe(false);
    const recursive: Record<string, unknown> = {};
    recursive.self = recursive;
    expect(() => dtJson(recursive)).toThrow("limit");
    expect(() => dtJson(new Date())).toThrow();
    expect(() => dtJson([undefined])).toThrow();
  });
  it("agrees with an independent exhaustive scalar predicate oracle", () => {
    const p = emptyDtProject();
    p.inputs[0].required = false;
    p.inputs[0].nullable = true;
    p.inputs[0].catalog = [
      { present: false },
      { present: true, value: null },
      { present: true, value: 0 },
    ];
    const conditions: DTCondition[] = [
      { op: "any" },
      { op: "present" },
      { op: "missing" },
      { op: "eq", value: null },
      { op: "ne", value: 1 },
      { op: "in", values: [null, 1] },
      { op: "notIn", values: [null, 1] },
      { op: "range", min: 0, max: 2, minInclusive: true, maxInclusive: false },
    ];
    for (const value of [undefined, null, -1, 0, 1, 2])
      for (const condition of conditions) {
        const present = value !== undefined,
          oracle =
            condition.op === "any"
              ? true
              : condition.op === "present"
                ? present
                : condition.op === "missing"
                  ? !present
                  : !present
                    ? false
                    : condition.op === "eq"
                      ? value === condition.value
                      : condition.op === "ne"
                        ? value !== condition.value
                        : condition.op === "in"
                          ? condition.values.includes(value!)
                          : condition.op === "notIn"
                            ? !condition.values.includes(value!)
                            : condition.op === "range"
                              ? typeof value === "number" &&
                                value >= 0 &&
                                value < 2
                              : false;
        p.decisions[0].rules = [
          {
            id: "rule",
            name: "Rule",
            when: [condition],
            output: literal("yes"),
          },
        ];
        expect(
          evaluateDecision(p, "decision", present ? { amount: value } : {})
            .result.status,
        ).toBe(oracle ? "matched" : "no-match");
      }
  });
});
