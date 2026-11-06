import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { generateDqToolkit, generateDqRunner } from "./data-query-export";
import { demoDqProject } from "./data-query-demo";
import {
  runDataQuery,
  runDqScenarios,
  type DQResult,
} from "./data-query-engine";
import {
  emptyDqProject,
  type DQProject,
  type DQRecord,
  type DQJson,
} from "./data-query-model";
async function artifact(p: DQProject) {
  const source = generateDqToolkit(p);
  return {
    source,
    sdk: (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      queryData: (
        data: Record<string, DQRecord[]>,
        query: string,
        parameters?: Record<string, DQJson>,
      ) => Promise<DQResult>;
    },
  };
}
describe("standalone query SDK and Node regression runner", () => {
  it("executes native ESM with exact output, lineage, work and plan parity for every demo case", async () => {
    const p = demoDqProject(),
      { source, sdk } = await artifact(p);
    expect(source).not.toContain("Ada");
    expect(source).not.toContain("Grace");
    expect(source).not.toMatch(
      /\bfetch\s*\(|new Function|\beval\s*\(|localStorage|from ["']/,
    );
    for (const scenario of p.scenarios) {
      const datasets = Object.fromEntries(
        p.datasets.map((d) => [
          d.id,
          scenario.overrides.find((o) => o.id === d.id)?.rows ?? d.rows,
        ]),
      );
      if (scenario.expect?.error)
        await expect(
          sdk.queryData(datasets, scenario.queryId, scenario.parameters),
        ).rejects.toMatchObject({ code: scenario.expect.error });
      else
        expect(
          await sdk.queryData(datasets, scenario.queryId, scenario.parameters),
        ).toEqual(
          await runDataQuery(
            p,
            scenario.queryId,
            scenario.parameters,
            scenario.overrides,
          ),
        );
    }
  });
  it("requires referenced datasets, accepts omitted unused ones and validates caller inputs", async () => {
    const p = demoDqProject(),
      { sdk } = await artifact(p);
    expect(
      (await sdk.queryData({ orders: p.datasets[1].rows }, "count-orders"))
        .rows[0].count,
    ).toBe(6);
    await expect(sdk.queryData({}, "count-orders")).rejects.toThrow(
      "reference",
    );
    await expect(
      sdk.queryData({ unknown: [] }, "count-orders"),
    ).rejects.toThrow("reference");
    await expect(
      sdk.queryData({ orders: [] }, "count-orders", { unknown: 1 }),
    ).rejects.toThrow("reference");
  });
  it("preserves own JSON keys and escapes embedded script metadata", async () => {
    const p = emptyDqProject();
    p.name = "</script>\u2028";
    p.queries[0].steps = [
      {
        op: "select",
        columns: [
          {
            name: "value",
            value: {
              op: "literal",
              value: JSON.parse('{"__proto__":{"kept":true}}'),
            },
          },
        ],
      },
    ];
    const { source, sdk } = await artifact(p);
    expect(source).not.toContain("</script>");
    const result = await sdk.queryData({ records: [{}] }, "query-1");
    expect(Object.hasOwn(result.rows[0].value as object, "__proto__")).toBe(
      true,
    );
  });
  it("runs portable Node cases with value-free reports and meaningful success/failure/empty exit codes", async () => {
    const p = demoDqProject(),
      native = await runDqScenarios(p);
    const run = (p: DQProject) =>
      spawnSync(process.execPath, ["--input-type=module"], {
        input: generateDqRunner(p),
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
      });
    const result = run(p);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.runs.map((r: { passed: boolean }) => r.passed)).toEqual(
      native.map((r) => r.passed),
    );
    expect(result.stdout).not.toMatch(
      /"Ada"|"Grace"|"parameters"|"lineage"|"rows"\s*:\s*\[/,
    );
    p.scenarios = [p.scenarios[0]];
    p.scenarios[0].expect = null;
    expect(run(p).status).toBe(1);
    p.scenarios = [];
    const empty = run(p);
    expect(empty.status).toBe(1);
    expect(JSON.parse(empty.stdout).runs).toEqual([]);
    expect(empty.stderr).toContain("No data query scenarios");
  });
});
