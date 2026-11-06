import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  generateLcToolkit,
  generateLcRunner,
  exportLcSvg,
} from "./consistency-export";
import { demoLcProject } from "./consistency-demo";
import { emptyLcProject, type LCProject } from "./consistency-model";
import { runConsistencySuite, type LCSuiteRun } from "./consistency-engine";
describe("portable consistency checker exports", () => {
  it("executes native ESM with exact verdict, witness, budget and diagnostic parity", async () => {
    const source = generateLcToolkit(),
      sdk = (await import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
      )) as { runConsistencySuite: (p: LCProject) => Promise<LCSuiteRun[]> };
    expect(source).not.toMatch(
      /\bfetch\s*\(|\beval\s*\(|new Function|localStorage|Concurrent API correctness examples/,
    );
    const p = demoLcProject();
    expect(await sdk.runConsistencySuite(p)).toEqual(
      await runConsistencySuite(p),
    );
    p.histories[0].maxStates = 1;
    expect((await sdk.runConsistencySuite(p))[0].result.verdict).toBe(
      "inconclusive",
    );
  });
  it("runs standalone Node regressions with accurate exits and reports without private values", () => {
    const run = (p: LCProject) =>
      spawnSync(process.execPath, ["--input-type=module"], {
        input: generateLcRunner(p),
        encoding: "utf8",
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 2 * 1024 * 1024,
      });
    const p = demoLcProject(),
      ok = run(p);
    expect(ok.error).toBeUndefined();
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).runs.every((r: LCSuiteRun) => r.passed)).toBe(
      true,
    );
    for (const run of JSON.parse(ok.stdout).runs as LCSuiteRun[]) {
      for (const step of run.result.order)
        expect(Object.keys(step).sort()).toEqual(["id", "pending"]);
      for (const rejected of run.result.deadEnd?.rejected ?? [])
        expect(Object.keys(rejected).sort()).toEqual(["id", "reason"]);
    }
    expect(ok.stdout).not.toMatch(/"input"\s*:|"output"\s*:|"client"\s*:/);
    p.histories = [p.histories[0]];
    p.histories[0].expected = "invalid";
    expect(run(p).status).toBe(1);
    p.histories[0].expected = null;
    expect(run(p).status).toBe(1);
    p.histories[0].expected = "valid";
    p.histories[0].maxStates = 1;
    expect(run(p).status).toBe(1);
    p.histories = [];
    const empty = run(p);
    expect(empty.status).toBe(1);
    expect(JSON.parse(empty.stdout).runs).toEqual([]);
    expect(empty.stderr).toContain("No consistency histories");
  });
  it("escapes embedded metadata and preserves own JSON keys", async () => {
    const p = emptyLcProject();
    p.name = "</script>\u2028";
    p.objects[0] = {
      id: "value",
      name: "Value",
      kind: "register",
      initial: JSON.parse('{"__proto__":{"kept":true}}'),
    };
    p.histories[0].expected = "valid";
    const source = generateLcRunner(p);
    expect(source).not.toContain("</script>");
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: source,
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
    });
    expect(result.status).toBe(0);
    const svg = exportLcSvg({
      ...p.histories[0],
      name: '<script>alert("x")</script>&\uffff\ud800',
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(
      new DOMParser()
        .parseFromString(svg, "image/svg+xml")
        .querySelector("parsererror"),
    ).toBeNull();
  });
  it("keeps generated runtime synchronized with its TypeScript sources", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/build-consistency-toolkit.mjs", "--check"],
      { encoding: "utf8", windowsHide: true, timeout: 20000 },
    );
    expect(result.status, result.stderr).toBe(0);
  });
});
