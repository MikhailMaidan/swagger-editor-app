import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { generateSagaToolkit, generateSagaRunner } from "./saga-export";
import { createSaga } from "./saga-engine";
import { demoSagaProject, runSagaScenarios } from "./saga-studio";
import {
  emptySagaProject,
  defaultSagaFixtures,
  type SagaDefinition,
} from "./saga-model";
async function artifact(d: SagaDefinition) {
  return (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(generateSagaToolkit(d)).toString("base64")}`
  )) as {
    createConfiguredSaga: (
      input: unknown,
      f: unknown,
    ) => ReturnType<typeof createSaga>;
    createSaga: typeof createSaga;
    definition: SagaDefinition;
  };
}
describe("portable saga simulator and Node regression runner", () => {
  it("executes a dependency-free ESM artifact with exact state/summary/source parity across every demo command", async () => {
    const p = demoSagaProject(),
      sdk = await artifact(p.definition);
    for (const scenario of p.scenarios) {
      const core = createSaga(p.definition, scenario.input, scenario.fixtures),
        out = sdk.createConfiguredSaga(scenario.input, scenario.fixtures);
      for (const command of scenario.commands) {
        expect(out.apply(command)).toEqual(core.apply(command));
        expect(out.snapshot()).toEqual(core.snapshot());
      }
      expect(out.source()).toEqual(core.source());
    }
    expect(generateSagaToolkit(p.definition)).not.toMatch(
      /\bfetch\s*\(|\beval\s*\(|new Function|\bsetTimeout\s*\(|from ["']|localStorage/,
    );
  });
  it("matches seeded retry, timeout, concurrency, deadline and compensation schedules", async () => {
    const p = demoSagaProject(),
      sdk = await artifact(p.definition);
    let seed = 201;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let i = 0; i < 80; i++) {
      const d = structuredClone(p.definition);
      d.concurrency = (random() % 4) + 1;
      d.deadlineMs = (random() % 1000) + 1;
      const f = defaultSagaFixtures(d);
      for (const fixture of f)
        for (const phase of ["forward", "compensate"] as const)
          for (const a of fixture[phase]) {
            a.durationMs = random() % 2000;
            a.outcome = (["success", "failure", "unknown"] as const)[
              random() % 3
            ];
          }
      const core = createSaga(d, { customer: "seeded" }, f),
        out = sdk.createSaga(d, { customer: "seeded" }, f);
      core.apply({ type: "run" });
      out.apply({ type: "run" });
      expect(out.snapshot()).toEqual(core.snapshot());
    }
  });
  it("preserves own special JSON keys and escaped metadata while validating untrusted runtime input", async () => {
    const p = emptySagaProject();
    p.definition.name = "</script>\u2028";
    p.definition.steps[0].forward.input = {
      literal: {
        from: "literal",
        value: JSON.parse('{"__proto__":{"retained":true}}'),
      },
    };
    const sdk = await artifact(p.definition),
      f = defaultSagaFixtures(p.definition),
      out = sdk.createConfiguredSaga({}, f);
    out.apply({ type: "run" });
    expect(
      Object.hasOwn(
        out.snapshot().steps[0].input!.literal as object,
        "__proto__",
      ),
    ).toBe(true);
    expect(sdk.definition.name).toBe(p.definition.name);
    expect(generateSagaToolkit(p.definition)).not.toContain("</script>");
    expect(() => sdk.createConfiguredSaga(undefined, f)).toThrow();
    expect(() => sdk.createConfiguredSaga({}, [])).toThrow("reference");
    const before = out.snapshot();
    expect(() =>
      out.apply({
        type: "reconcile",
        stepId: "step-1",
        phase: "forward",
        outcome: "committed",
        output: null,
      }),
    ).toThrow("command");
    expect(out.snapshot()).toEqual(before);
  });
  it("runs the exported Node suite with matching value-free results and a failing exit status for regressions or unchecked cases", async () => {
    const p = demoSagaProject(),
      native = await runSagaScenarios(p);
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: generateSagaRunner(p),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.runs.map((r: { summary: unknown }) => r.summary)).toEqual(
      native.map((r) => r.summary),
    );
    expect(result.stdout).not.toMatch(
      /demo-customer|confirmed-payment|"output"\s*:|"input"/,
    );
    p.scenarios = [p.scenarios[0]];
    p.scenarios[0].expect = null;
    const failed = spawnSync(process.execPath, ["--input-type=module"], {
      input: generateSagaRunner(p),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    expect(failed.status).toBe(1);
    expect(JSON.parse(failed.stdout).runs[0]).toMatchObject({
      checked: false,
      passed: false,
    });
  });
});
