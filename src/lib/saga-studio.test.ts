import { describe, expect, it, vi } from "vitest";
import {
  demoSagaProject,
  replaySaga,
  runSagaScenarios,
  sagaReport,
  sagaCsv,
  alignSagaScenario,
  recordSagaScenario,
  sagaExpectation,
} from "./saga-studio";
import {
  newSagaStep,
  parseSagaProject,
  serializeSagaProject,
  sagaJson,
  MAX_SAGA_PROJECT,
} from "./saga-model";
describe("saga projects, regressions and reports", () => {
  it("passes nine independently specified recovery scenarios with explicit output checks", async () => {
    const p = demoSagaProject(),
      runs = await runSagaScenarios(p);
    expect(runs).toHaveLength(9);
    expect(runs.map((r) => [r.scenarioId, r.passed])).toEqual(
      p.scenarios.map((s) => [s.id, true]),
    );
    expect(
      runs[2].snapshot.journal
        .filter((j) => j.kind === "started" && j.phase === "compensation")
        .map((j) => j.stepId),
    ).toEqual(["payment", "stock", "order"]);
    expect(runs[3].summary.status).toBe("blocked");
    expect(runs[4].snapshot.steps[2].compensationInput).toEqual({
      id: "confirmed-payment",
    });
  });
  it("distinguishes unchecked cases and catches status, budget, step and output regressions", async () => {
    const p = demoSagaProject();
    p.scenarios = p.scenarios.slice(0, 2);
    p.scenarios[0].expect = null;
    const e = p.scenarios[1].expect!;
    e.status = "attention";
    e.maxTimeMs = 0;
    e.maxRetries = 0;
    e.steps = [
      { stepId: "stock", forward: "failed", compensation: "retained" },
    ];
    e.outputs = [
      { stepId: "stock", pointer: "/id", value: "incorrect" },
      { stepId: "order", pointer: "/id", missing: true },
    ];
    const runs = await runSagaScenarios(p);
    expect(runs[0]).toMatchObject({ checked: false, passed: false });
    expect(runs[1].passed).toBe(false);
    expect(runs[1].checks.filter((c) => !c.passed).map((c) => c.kind)).toEqual([
      "status",
      "time",
      "retries",
      "step",
      "output",
      "output",
    ]);
  });
  it("reports invalid recovery commands per case rather than hiding the rest of a comparison", async () => {
    const p = demoSagaProject();
    p.definition.deadlineMs = 50;
    const runs = await runSagaScenarios(p);
    expect(runs).toHaveLength(9);
    expect(runs[4]).toMatchObject({ error: "command", passed: false });
    await expect(replaySaga(p.definition, p.scenarios[4])).rejects.toThrow(
      "command",
    );
  });
  it("round trips source-only projects and rejects forged runtime metadata, bad JSON and oversized values", () => {
    const p = demoSagaProject(),
      restored = parseSagaProject(serializeSagaProject(p));
    expect(restored).toEqual(p);
    const raw = {
      ...p,
      results: ["forged"],
      snapshot: { status: "succeeded" },
    };
    expect(parseSagaProject(JSON.stringify(raw))).toEqual(p);
    expect(() => parseSagaProject("{")).toThrow("json");
    expect(() => parseSagaProject(" ".repeat(MAX_SAGA_PROJECT + 1))).toThrow(
      "limit",
    );
    expect(() => sagaJson(Infinity)).toThrow();
    expect(() => sagaJson(new Array(2))).toThrow();
    expect(() => sagaJson(new Date())).toThrow();
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => sagaJson(cycle)).toThrow("limit");
  });
  it("records replayable private source and step expectations without capturing private output assertions implicitly", async () => {
    const p = demoSagaProject(),
      { machine, snapshot } = await replaySaga(p.definition, p.scenarios[0]);
    const recorded = recordSagaScenario(
      "recorded",
      "Recorded",
      machine.source(),
      snapshot,
      p.definition,
    );
    expect(recorded.expect).toEqual(sagaExpectation(snapshot, p.definition));
    expect(recorded.expect!.outputs).toEqual([]);
    const runs = await runSagaScenarios({ ...p, scenarios: [recorded] });
    expect(runs[0].passed).toBe(true);
  });
  it("aligns fixtures to explicit builder edits and resets obsolete expectations and removed-step commands", () => {
    const p = demoSagaProject(),
      d = structuredClone(p.definition);
    d.steps.push(newSagaStep("audit"));
    const s = alignSagaScenario(p.scenarios[0], d);
    expect(s.fixtures.at(-1)!.stepId).toBe("audit");
    expect(s.expect).toBe(null);
    d.steps = [d.steps[0]];
    const fewer = alignSagaScenario(p.scenarios[4], d);
    expect(fewer.fixtures).toHaveLength(1);
    expect(fewer.commands.some((c) => "stepId" in c)).toBe(false);
  });
  it("snapshots async inputs, yields progress, cancels without publishing partial suites and rejects unknown selections", async () => {
    const p = demoSagaProject(),
      progress = vi.fn();
    const run = runSagaScenarios(p, undefined, () => false, progress);
    p.scenarios[0].input = null;
    expect((await run)[0].passed).toBe(true);
    expect(progress).toHaveBeenCalledTimes(9);
    let stop = false;
    await expect(
      runSagaScenarios(
        demoSagaProject(),
        undefined,
        () => stop,
        () => {
          stop = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    await expect(runSagaScenarios(p, "unknown")).rejects.toThrow("reference");
  });
  it("exports value-free reports and CSV even with detailed timelines and spreadsheet-like IDs", async () => {
    const runs = await runSagaScenarios(demoSagaProject());
    for (const details of [false, true]) {
      const report = sagaReport(runs, details);
      expect(report).not.toMatch(
        /demo-customer|confirmed-payment|"input"|"output"\s*:|"fixtures"|"snapshot"/,
      );
      expect(JSON.parse(report).runs[0].journal !== undefined).toBe(details);
    }
    runs[0].scenarioId = "=SUM(A1)";
    const csv = sagaCsv(runs);
    expect(csv).toContain('"\'=SUM(A1)"');
    expect(csv).not.toContain("demo-customer");
  });
});
