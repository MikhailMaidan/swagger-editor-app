import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  emptyRTProject,
  normalizeRTProject,
  serializeRTProject,
  type RTProject,
} from "./routing-model";
import {
  runRTProject,
  createRTRouter,
  recordRTExpectation,
  rtReport,
  type RTOptions,
} from "./routing-engine";
import { importRTHar, routeFromRTOperation } from "./routing-import";
import { generateRTRunner, generateRTToolkit } from "./routing-export";
import { demoRTProject } from "./routing-demo";
import { parseOpenApiSchema } from "./openapi";
const fast: RTOptions = { yield: async () => {} };
async function recorded() {
  const p = demoRTProject(),
    runs = await runRTProject(p, undefined, fast);
  p.cases.forEach((scenario, index) => {
    scenario.expected = recordRTExpectation(runs[index]);
  });
  return p;
}
const harEntry = (url: string, startedDateTime = "2026-11-18T12:00:00Z") => ({
  startedDateTime,
  time: 10.2,
  request: {
    method: "GET",
    url,
    headers: [{ name: "X-Client-Id", value: "alice" }],
  },
  response: { status: 200, content: { text: "PRIVATE_RESPONSE_BODY" } },
});
describe("routing imports and executable exports", () => {
  it("imports timestamped HAR metadata without response bodies or losing query parameters", () => {
    const project = emptyRTProject(),
      scenario = importRTHar(
        JSON.stringify({
          log: {
            entries: [
              harEntry("https://client.test/a?q=a&tag=x&tag=y"),
              harEntry(
                "https://client.test/b",
                "2026-11-18T13:00:00.050+01:00",
              ),
            ],
          },
        }),
        project,
        project.cases,
      );
    expect(scenario.requests.map((r) => r.atMs)).toEqual([0, 50]);
    expect(scenario.requests[0].outcome.durationMs).toBe(11);
    expect(scenario.requests[0].headers).toEqual({ "x-client-id": "alice" });
    expect(scenario.requests[0].url).toContain("?q=a&tag=x&tag=y");
    expect(JSON.stringify(scenario)).not.toContain("PRIVATE_RESPONSE_BODY");
  });
  it("rejects ambiguous or oversized HAR captures without silently skipping rows", () => {
    const project = emptyRTProject(),
      entry = harEntry("https://client.test");
    entry.request.headers.push({ name: "x-client-id", value: "bob" });
    expect(() =>
      importRTHar(
        JSON.stringify({ log: { entries: [entry] } }),
        project,
        project.cases,
      ),
    ).toThrow("duplicate");
    expect(() =>
      importRTHar(
        JSON.stringify({
          log: {
            entries: Array.from({ length: 201 }, () =>
              harEntry("https://client.test"),
            ),
          },
        }),
        project,
        [],
      ),
    ).toThrow("limit");
    expect(() =>
      importRTHar(
        JSON.stringify({
          log: { entries: [harEntry("https://client.test", "no-timezone")] },
        }),
        project,
        [],
      ),
    ).toThrow("traffic");
    expect(() =>
      importRTHar(
        JSON.stringify({
          log: {
            entries: [
              { ...harEntry("https://client.test"), response: { status: 0 } },
            ],
          },
        }),
        project,
        [],
      ),
    ).toThrow();
  });
  it("creates operation routes without changing the OpenAPI document", () => {
    const schema = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "API", version: "1" },
      paths: {
        "/items/{id}": { get: { responses: { "200": { description: "OK" } } } },
      },
    });
    const parsed = parseOpenApiSchema(schema);
    if (!parsed.ok) throw Error(parsed.error);
    expect(
      routeFromRTOperation(parsed.value.endpoints[0], "api", []),
    ).toMatchObject({
      methods: ["GET"],
      path: "/items/{id}",
      pool: "api",
      rewrite: null,
    });
    expect(
      JSON.parse(schema).paths["/items/{id}"].get.responses["200"].description,
    ).toBe("OK");
  });
  it("keeps generated runtime sources reproducible", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/build-routing-runtime.mjs", "--check"],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
  it("executes native ESM with exact routing/replay parity and no network dependencies", async () => {
    const p = demoRTProject(),
      source = generateRTToolkit(p),
      sdk = (await import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
      )) as {
        runRTProject: typeof runRTProject;
        createRTRouter: typeof createRTRouter;
        normalizeRTProject: typeof normalizeRTProject;
      };
    expect(await sdk.runRTProject(p, undefined, fast)).toEqual(
      await runRTProject(p, undefined, fast),
    );
    const a = sdk.createRTRouter(p),
      b = createRTRouter(p),
      input = {
        id: "x",
        method: "GET",
        url: "/v1/items/42?query=x",
        headers: {},
      };
    expect(a.dispatch(input, 100)).toEqual(b.dispatch(input, 100));
    expect(a.snapshot()).toEqual(b.snapshot());
    const oversizedRequest = emptyRTProject(),
      oversizedBackend = emptyRTProject();
    oversizedRequest.cases[0].requests[0].url = `/${"é".repeat(700)}`;
    oversizedBackend.backends[0].url = `https://backend.test/${"é".repeat(340)}`;
    for (const oversized of [oversizedRequest, oversizedBackend]) {
      expect(() => sdk.normalizeRTProject(oversized)).toThrow("limit");
      expect(() => normalizeRTProject(oversized)).toThrow("limit");
    }
    expect(source).not.toMatch(
      /\bfetch\s*\(|\beval\s*\(|new Function|localStorage/,
    );
  });
  it("runs CI with exact reports and distinct pass, regression and missing-expectation exits", async () => {
    const project = await recorded(),
      execute = (p: RTProject) =>
        spawnSync(process.execPath, ["--input-type=module"], {
          input: generateRTRunner(p),
          encoding: "utf8",
          timeout: 10000,
        });
    const pass = execute(project);
    expect(pass.stderr).toBe("");
    expect(pass.status).toBe(0);
    expect(JSON.parse(pass.stdout)).toEqual(
      rtReport(await runRTProject(project, undefined, fast)),
    );
    project.backends[0].healthy = false;
    expect(execute(project).status).toBe(1);
    project.cases[0].expected = null;
    expect(execute(project).status).toBe(2);
  });
  it("reads future BOM-prefixed project files and rejects malformed or oversized input", async () => {
    const project = await recorded(),
      directory = mkdtempSync(join(tmpdir(), "rsswag-routing-")),
      file = join(directory, "project.json"),
      source = generateRTRunner(emptyRTProject());
    try {
      for (const [text, status] of [
        [`\uFEFF${serializeRTProject(project)}`, 0],
        ["{", 2],
        [" ".repeat(2097153), 2],
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
