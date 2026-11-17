import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { generateMTRunner, generateMTToolkit } from "./mutation-export";
import { fixtureFromMTOperation, importMTChecks } from "./mutation-import";
import { demoMTProject } from "./mutation-demo";
import {
  runMTProject,
  mtRecordedExpectation,
  mtReport,
  type MTOptions,
  type MTFixtureRun,
} from "./mutation-engine";
import {
  emptyMTProject,
  serializeMTProject,
  type MTProject,
} from "./mutation-model";
import { serializeResponseAssertions } from "./response-assertions";
import { parseOpenApiSchema } from "./openapi";
const fast: MTOptions = { yield: async () => {} };
async function budgeted(): Promise<MTProject> {
  const project = demoMTProject(),
    runs = await runMTProject(project, undefined, fast);
  project.fixtures.forEach((f, i) => {
    f.expectation = mtRecordedExpectation(runs[i]);
  });
  return project;
}
describe("mutation imports and executable exports", () => {
  it("imports the existing response assertion format with distinct IDs and exact rule semantics", () => {
    const fixture = emptyMTProject().fixtures[0],
      source = serializeResponseAssertions(fixture.checks.map((c) => c.rule));
    const checks = importMTChecks(source, fixture);
    expect(checks).toHaveLength(2);
    expect(checks[1].rule).toEqual(checks[0].rule);
    expect(checks[1].id).not.toBe(checks[0].id);
    expect(() => importMTChecks('{"kind":"wrong"}', fixture)).toThrow(
      "assertion",
    );
  });
  it("imports OpenAPI response examples and required fields without changing the document", () => {
    const schema = {
      openapi: "3.1.0",
      info: { title: "API", version: "1" },
      paths: {
        "/users": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["id"],
                      properties: { id: { type: "integer" } },
                    },
                    example: { id: 7 },
                  },
                },
              },
            },
          },
        },
      },
    };
    const source = JSON.stringify(schema),
      parsed = parseOpenApiSchema(source);
    if (!parsed.ok) throw Error(parsed.error);
    const fixture = fixtureFromMTOperation(parsed.value.endpoints[0], 0, []);
    expect(fixture.response).toMatchObject({
      status: "200",
      source: "mock",
      body: '{\n  "id": 7\n}',
    });
    expect(
      fixture.checks.some(
        (c) => c.rule.path === "/id" && c.rule.operator === "exists",
      ),
    ).toBe(true);
    expect(JSON.stringify(schema)).toBe(source);
    expect(() =>
      fixtureFromMTOperation(parsed.value.endpoints[0], 99, []),
    ).toThrow("schema");
  });
  it("keeps runtime sources reproducible from shared code", () => {
    const check = spawnSync(
      process.execPath,
      ["scripts/build-mutation-runtime.mjs", "--check"],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
  });
  it("executes a native ESM toolkit with exact in-app result parity", async () => {
    const project = await budgeted(),
      source = generateMTToolkit(project);
    const sdk = (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      testAssertions: (
        project?: MTProject,
        fixtureIds?: string[],
        options?: MTOptions,
      ) => Promise<MTFixtureRun[]>;
    };
    expect(await sdk.testAssertions(project, undefined, fast)).toEqual(
      await runMTProject(project, undefined, fast),
    );
    expect(source).not.toMatch(
      /\bfetch\s*\(|\beval\s*\(|new Function|localStorage/,
    );
    const prototype = emptyMTProject();
    prototype.fixtures[0].response.body = '{"__proto__":{"polluted":true}}';
    expect(await sdk.testAssertions(prototype, undefined, fast)).toEqual(
      await runMTProject(prototype, undefined, fast),
    );
    expect({}).not.toHaveProperty("polluted");
  });
  it("runs standalone CI with exact reports and success, regression and missing-budget exit codes", async () => {
    const project = await budgeted();
    const run = (p: MTProject) =>
      spawnSync(process.execPath, ["--input-type=module"], {
        input: generateMTRunner(p),
        encoding: "utf8",
        timeout: 10_000,
      });
    const passing = run(project);
    expect(passing.stderr).toBe("");
    expect(passing.status).toBe(0);
    expect(JSON.parse(passing.stdout)).toEqual(
      mtReport(await runMTProject(project, undefined, fast)),
    );
    project.fixtures[1].checks.find((c) => c.id === "body")!.enabled = false;
    expect(run(project).status).toBe(1);
    project.fixtures[0].expectation = null;
    expect(run(project).status).toBe(2);
  });
  it("accepts future project files, handles a BOM, and rejects malformed or oversized inputs", async () => {
    const project = await budgeted(),
      source = generateMTRunner(emptyMTProject()),
      directory = mkdtempSync(join(tmpdir(), "rsswag-mutation-")),
      file = join(directory, "project.json");
    try {
      for (const [text, code] of [
        [`\uFEFF${serializeMTProject(project)}`, 0],
        ["{", 2],
        [" ".repeat(2 * 1024 * 1024 + 1), 2],
      ] as const) {
        writeFileSync(file, text, "utf8");
        const result = spawnSync(
          process.execPath,
          ["--input-type=module", "-", file],
          { input: source, encoding: "utf8", timeout: 10_000 },
        );
        expect(result.status).toBe(code);
      }
    } finally {
      unlinkSync(file);
      rmdirSync(directory);
    }
  });
});
