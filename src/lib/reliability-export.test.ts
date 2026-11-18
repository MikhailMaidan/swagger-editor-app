import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  analyzeRLProject,
  evaluateRLProject,
  findRLRepairs,
  recordRLExpectation,
  rlReport,
  type RLOptions,
  type RLRun,
} from "./reliability-engine";
import { demoRLProject } from "./reliability-demo";
import {
  emptyRLProject,
  serializeRLProject,
  type RLProject,
} from "./reliability-model";
import { generateRLRunner, generateRLToolkit } from "./reliability-export";
const fast: RLOptions = { yield: async () => {} };
async function recorded(): Promise<RLProject> {
  const project = emptyRLProject(),
    run = await analyzeRLProject(project, undefined, fast);
  project.cases.forEach((scenario, i) => {
    scenario.expected = recordRLExpectation(run.cases[i]);
  });
  return project;
}
describe("standalone reliability exports", () => {
  it("keeps the runtime synchronized with its shared TypeScript source", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/build-reliability-runtime.mjs", "--check"],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
  it("runs native ESM with exact availability, outage and repair parity", async () => {
    const project = demoRLProject(),
      source = generateRLToolkit(project);
    const sdk = (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      analyzeArchitecture: (
        p: RLProject,
        cases?: string[],
        options?: RLOptions,
      ) => Promise<RLRun>;
      evaluateRLProject: typeof evaluateRLProject;
      findRLRepairs: typeof findRLRepairs;
    };
    expect(await sdk.analyzeArchitecture(project, undefined, fast)).toEqual(
      await analyzeRLProject(project, undefined, fast),
    );
    expect(
      sdk.evaluateRLProject(project, ["zone-a", "zone-b", "auth"]),
    ).toEqual(evaluateRLProject(project, ["zone-a", "zone-b", "auth"]));
    expect(
      await sdk.findRLRepairs(
        project,
        "service",
        ["zone-a", "zone-b", "auth"],
        fast,
      ),
    ).toEqual(
      await findRLRepairs(
        project,
        "service",
        ["zone-a", "zone-b", "auth"],
        fast,
      ),
    );
    expect(source).not.toMatch(
      /\bfetch\s*\(|\beval\s*\(|new Function|localStorage/,
    );
  });
  it("executes standalone CI with pass, changed-behavior and missing-expectation exit codes", async () => {
    const project = await recorded(),
      execute = (p: RLProject) =>
        spawnSync(process.execPath, ["--input-type=module"], {
          input: generateRLRunner(p),
          encoding: "utf8",
          timeout: 10000,
        });
    const passing = execute(project);
    expect(passing.status).toBe(0);
    expect(passing.stderr).toBe("");
    expect(JSON.parse(passing.stdout)).toEqual(
      rlReport(await analyzeRLProject(project, undefined, fast)),
    );
    const node = project.nodes[0];
    if (node.kind === "event") node.probability = 0.5;
    expect(execute(project).status).toBe(1);
    project.cases[0].expected = null;
    expect(execute(project).status).toBe(2);
  });
  it("reads future project files with BOM support and rejects malformed/oversized sources", async () => {
    const project = await recorded(),
      directory = mkdtempSync(join(tmpdir(), "rsswag-reliability-")),
      file = join(directory, "project.json"),
      source = generateRLRunner(emptyRLProject());
    try {
      for (const [text, status] of [
        [`\uFEFF${serializeRLProject(project)}`, 0],
        ["{", 2],
        [" ".repeat(524289), 2],
      ] as const) {
        writeFileSync(file, text, "utf8");
        const result = spawnSync(
          process.execPath,
          ["--input-type=module", "-", file],
          { input: source, encoding: "utf8", timeout: 10000 },
        );
        expect(result.status).toBe(status);
      }
    } finally {
      unlinkSync(file);
      rmdirSync(directory);
    }
  });
});
