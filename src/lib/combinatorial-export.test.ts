import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCTSpace,
  generateCTSuite,
  auditCTRows,
} from "./combinatorial-engine";
import {
  ctCaseValues,
  ctManifest,
  exportCTCsv,
  exportCTNdjson,
  exportCTSuite,
  generateCTVerifier,
  verifyCTPortable,
} from "./combinatorial-export";
import { importCTRows, projectFromCTEndpoint } from "./combinatorial-import";
import { demoCTProject } from "./combinatorial-demo";
import { emptyCTProject, type CTProject } from "./combinatorial-model";
import { parseOpenApiSchema, type EndpointSummary } from "./openapi";

const fast = { yield: async () => {} };
function operation(parameters: unknown[]) {
  const parsed = parseOpenApiSchema(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Parameters", version: "1" },
      paths: {
        "/search/{id}": {
          get: { parameters, responses: { "200": { description: "OK" } } },
        },
      },
    }),
  );
  if (!parsed.ok) throw Error(parsed.error);
  return parsed.value.endpoints[0];
}
describe("combinatorial interchange and API parameter imports", () => {
  it("round-trips assignment JSON and CSV without confusing omitted and empty values", async () => {
    const project = demoCTProject(),
      space = await buildCTSpace(project, fast),
      suite = await generateCTSuite(space, project.rows, "replace", fast);
    expect(
      importCTRows(exportCTSuite(project, suite), "json", project),
    ).toEqual(suite);
    const csvRows = importCTRows(
      `\uFEFF${exportCTCsv(project, suite)}`,
      "csv",
      project,
    );
    expect(csvRows.map((r) => r.choices)).toEqual(suite.map((r) => r.choices));
    expect(csvRows.map((r) => r.pinned)).toEqual(suite.map((r) => r.pinned));
    const values = exportCTNdjson(project, suite)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      values.some(
        (v) => v.omitted.includes("trace") && !Object.hasOwn(v.values, "trace"),
      ),
    ).toBe(true);
    expect(
      values.some((v) => v.values.trace === "" && !v.omitted.includes("trace")),
    ).toBe(true);
    expect(ctCaseValues(project, suite[0]).omitted).toEqual(["trace"]);
  });
  it("supports reordered/quoted CSV columns and avoids variable/header name collisions", () => {
    const project: CTProject = {
      ...emptyCTProject(),
      strength: 1,
      variables: [{ ...emptyCTProject().variables[0], id: "pinned" }],
    };
    const rows = importCTRows(
      '"choice:pinned",pinned,case_id\r\n"true",false,my-case\r\n',
      "csv",
      project,
    );
    expect(rows[0]).toMatchObject({
      id: "my-case",
      pinned: false,
      choices: { pinned: "true" },
    });
    expect(importCTRows(exportCTCsv(project, rows), "csv", project)).toEqual(
      rows,
    );
  });
  it.each([
    "case_id,pinned,choice:a,choice:b,choice:c\nx,false,true,false\n",
    "case_id,pinned,choice:a,choice:b,choice:c\nx,yes,true,false,true\n",
    "case_id,pinned,choice:a,choice:b,choice:c\nx,false,unknown,false,true\n",
    'case_id,pinned,choice:a,choice:b,choice:c\n"x,false,true,false,true\n',
    'case_id,pinned,choice:a,choice:b,choice:c\n"x"junk,false,true,false,true\n',
    "case_id,pinned,choice:a,choice:a,choice:c\nx,false,true,false,true\n",
    "case_id,pinned,choice:a,choice:b,choice:c\n=FORMULA,false,true,false,true\n",
  ])("rejects malformed assignment CSV (%#)", (source) => {
    expect(() => importCTRows(source, "csv", emptyCTProject())).toThrow();
  });
  it("imports typed enum, boolean, numeric boundary and optional omission choices", () => {
    const project = projectFromCTEndpoint(
      operation([
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", enum: [1, 2] },
        },
        { name: "enabled", in: "query", schema: { type: "boolean" } },
        {
          name: "offset",
          in: "query",
          required: true,
          schema: { type: "integer", minimum: 2.5, maximum: 5.5 },
        },
        {
          name: "Accept",
          in: "header",
          required: true,
          schema: { type: "string", enum: ["application/json", "text/csv"] },
        },
      ]),
    );
    expect(project.variables[0].choices).toMatchObject([
      { kind: "value", value: 1 },
      { kind: "value", value: 2 },
    ]);
    expect(project.variables[1].choices).toMatchObject([
      { kind: "omit" },
      { kind: "value", value: false },
      { kind: "value", value: true },
    ]);
    expect(project.variables[2].choices).toMatchObject([
      { kind: "value", value: 3 },
      { kind: "value", value: 5 },
    ]);
    expect(project.variables[3].choices).toMatchObject([
      { value: "application/json" },
      { value: "text/csv" },
    ]);
  });
  it("imports negative-only numeric ranges and bounded strings without losing values", () => {
    const endpoint = operation([
      {
        name: "n",
        in: "query",
        required: true,
        schema: { type: "number", maximum: -5 },
      },
      {
        name: "q",
        in: "query",
        required: true,
        schema: { type: "string", minLength: 2, maxLength: 3 },
        example: "ok",
      },
    ]);
    const project = projectFromCTEndpoint(endpoint);
    expect(project.variables[0].choices).toMatchObject([
      { kind: "value", value: -5 },
    ]);
    expect(
      project.variables[1].choices.map((c) =>
        c.kind === "value" ? c.value : undefined,
      ),
    ).toEqual(["ok", "aa", "aaa"]);
    const integers = projectFromCTEndpoint(
      operation([
        {
          name: "n",
          in: "query",
          required: true,
          schema: { type: "integer", maximum: -5.5 },
        },
      ]),
    );
    expect(integers.variables[0].choices).toMatchObject([
      { kind: "value", value: -6 },
    ]);
  });
  it.each([
    ["integer", {}, 42, [0, 1, 42]],
    ["integer", {}, -42, [0, 1, -42]],
    ["number", { minimum: 10 }, 25.5, [10, 11, 25.5]],
    ["integer", { maximum: 10 }, -5, [0, 10, -5]],
    ["number", { maximum: -5 }, -20, [-5, -20]],
    ["integer", { maximum: -5.5 }, -10, [-6, -10]],
    ["number", { minimum: 2.5, maximum: 5.5 }, 4.5, [2.5, 5.5, 4.5]],
    ["integer", { minimum: 0, maximum: 1 }, -5, [0, 1]],
    ["integer", { minimum: 0, maximum: 1 }, 5, [0, 1]],
  ])(
    "filters %s values against documented bounds %j with example %j",
    (type, bounds, example, expected) => {
      const project = projectFromCTEndpoint(
        operation([
          {
            name: "n",
            in: "query",
            required: true,
            schema: { type, ...bounds },
            example,
          },
        ]),
      );
      expect(
        project.variables[0].choices.map((choice) =>
          choice.kind === "value" ? choice.value : undefined,
        ),
      ).toEqual(expected);
    },
  );
  it.each([
    [{}, "documented search term", ["documented search term", "", "aaaaaaa"]],
    [
      { minLength: 3 },
      "long documented value",
      ["long documented value", "aaa", "aaaaaaa"],
    ],
    [{ maxLength: 12 }, "long example", ["long example", "", "aaaaaaaaaaaa"]],
    [{ minLength: 2, maxLength: 5 }, "too long", ["aa", "aaaaa"]],
    [{ minLength: 5 }, "tiny", ["aaaaa", "aaaaaaa"]],
    [{ maxLength: 3 }, "😀😀😀", ["😀😀😀", "", "aaa"]],
    [{ maxLength: 2 }, "😀😀😀", ["", "aa"]],
    [{ maxLength: 0 }, "nonempty", [""]],
    [{}, undefined, ["example", "", "aaaaaaa"]],
  ])(
    "filters string examples against documented length bounds %j with example %j",
    (bounds, example, expected) => {
      const project = projectFromCTEndpoint(
        operation([
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", ...bounds },
            example,
          },
        ]),
      );
      expect(
        project.variables[0].choices.map((choice) =>
          choice.kind === "value" ? choice.value : undefined,
        ),
      ).toEqual(expected);
    },
  );
  it("preserves long string examples within the studio limit and rejects oversized values", () => {
    const endpoint = (example: string) =>
      operation([
        {
          name: "q",
          in: "query",
          required: true,
          schema: { type: "string" },
          example,
        },
      ]);
    const example = "a".repeat(2048);
    expect(
      projectFromCTEndpoint(endpoint(example)).variables[0].choices[0],
    ).toMatchObject({ kind: "value", value: example });
    expect(() => projectFromCTEndpoint(endpoint(`${example}a`))).toThrow(
      "limit",
    );
  });
  it("does not silently truncate large enums or operation parameter catalogs", () => {
    expect(() =>
      projectFromCTEndpoint(
        operation([
          {
            name: "n",
            in: "query",
            schema: { enum: Array.from({ length: 9 }, (_, i) => `v${i}`) },
          },
        ]),
      ),
    ).toThrow("limit");
    expect(() =>
      projectFromCTEndpoint({ parameters: [] } as unknown as EndpointSummary),
    ).toThrow("schema");
    expect(() =>
      projectFromCTEndpoint(
        operation(
          Array.from({ length: 13 }, (_, i) => ({
            name: `p${i}`,
            in: "query",
            schema: { type: "boolean" },
          })),
        ),
      ),
    ).toThrow("limit");
  });
});
describe("portable CI coverage verifier", () => {
  it("reads future suite files, strips a leading BOM and rejects malformed files", async () => {
    const project = demoCTProject(),
      space = await buildCTSpace(project, fast),
      suite = await generateCTSuite(space, project.rows, "replace", fast);
    const directory = mkdtempSync(join(tmpdir(), "rsswag-ct-")),
      file = join(directory, "suite.json"),
      source = generateCTVerifier(space, []);
    try {
      for (const [content, status] of [
        [`\uFEFF${exportCTSuite(project, suite)}`, 0],
        [JSON.stringify(suite.slice(0, 1)), 1],
        ["{", 2],
        [" ".repeat(524_289), 2],
      ] as const) {
        writeFileSync(file, content, "utf8");
        const run = spawnSync(
          process.execPath,
          ["--input-type=module", "-", file],
          { input: source, encoding: "utf8", timeout: 10_000 },
        );
        expect(run.status).toBe(status);
        if (status !== 2)
          expect(JSON.parse(run.stdout).complete).toBe(status === 0);
        else expect(run.stderr).not.toBe("");
      }
    } finally {
      unlinkSync(file);
      rmdirSync(directory);
    }
  });
  it("matches browser audits and reports missing or invalid rows independently", async () => {
    const project = demoCTProject(),
      space = await buildCTSpace(project, fast),
      suite = await generateCTSuite(space, project.rows, "replace", fast),
      manifest = ctManifest(space);
    for (const rows of [suite, suite.slice(0, 2), []]) {
      const browser = auditCTRows(space, rows),
        portable = verifyCTPortable(manifest, rows);
      expect(portable).toMatchObject({
        complete: browser.complete,
        feasibleRows: browser.feasibleRows,
        feasibleTuples: browser.feasibleTuples,
        covered: browser.covered.length,
        missing: browser.missing,
      });
    }
    expect(
      verifyCTPortable(manifest, [
        { ...suite[0], choices: { ...suite[0].choices, plan: "enterprise" } },
      ]),
    ).toMatchObject({ complete: false, covered: 0, invalidRows: 1 });
    expect(verifyCTPortable(manifest, [{ choices: {} }])).toMatchObject({
      complete: false,
      invalidRows: 1,
    });
    expect(verifyCTPortable(manifest, [suite[0], suite[0]]).invalidRows).toBe(
      1,
    );
  });
  it("executes the exported ESM with successful and failing CI exit codes", async () => {
    const project = demoCTProject(),
      space = await buildCTSpace(project, fast),
      suite = await generateCTSuite(space, project.rows, "replace", fast);
    for (const [rows, status] of [
      [suite, 0],
      [suite.slice(0, 1), 1],
    ] as const) {
      const source = generateCTVerifier(space, [...rows]);
      const run = spawnSync(process.execPath, ["--input-type=module"], {
        input: source,
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(run.stderr).toBe("");
      expect(run.status).toBe(status);
      expect(JSON.parse(run.stdout).complete).toBe(status === 0);
      expect(source).not.toMatch(/\bfetch\s*\(|localStorage|"value"\s*:/);
    }
  });
});
