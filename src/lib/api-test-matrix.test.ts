import { afterEach, describe, expect, it, vi } from "vitest";
import type { EndpointSummary } from "./openapi";
import {
  createScenarioStep,
  runApiScenario,
  type ScenarioResponse,
  type ScenarioTransport,
} from "./api-scenario";
import {
  addMatrixEndpoint,
  emptyMatrixProject,
  MatrixError,
  MAX_MATRIX_BYTES,
  matrixBinding,
  matrixJUnitReport,
  parseMatrixHeaders,
  parseMatrixProject,
  parseMatrixValues,
  previewMatrixRun,
  readMatrixDataset,
  runTestMatrix,
  serializeMatrixProject,
  serializeMatrixReport,
  validateMatrixProject,
  type MatrixAssertion,
  type MatrixProject,
  type MatrixReport,
} from "./api-test-matrix";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function endpoint(
  path = "/users",
  method = "GET",
  body = '{"id":7}',
): EndpointSummary {
  return {
    path,
    method,
    operationId: "",
    deprecated: false,
    secured: false,
    securityRequirements: [],
    serverUrl: "https://example.test",
    summary: "Users",
    description: "",
    tags: [],
    parameters: [],
    requestBodies: [],
    responses: [
      {
        status: "200",
        description: "OK",
        contentTypes: ["application/json"],
        schema: {
          type: "object",
          properties: ["id"],
          requiredProperties: ["id"],
          example: body,
          exampleName: "",
          hasExplicitExample: true,
        },
      },
    ],
  };
}
const response = (patch: Partial<ScenarioResponse> = {}): ScenarioResponse => ({
  body: '{"id":7}',
  headers: { "content-type": "application/json" },
  status: "200",
  durationMs: 10,
  ...patch,
});
function project(
  api = endpoint(),
  dataset = '[{"id":7},{"id":8}]',
): MatrixProject {
  return {
    ...emptyMatrixProject(),
    scenario: {
      name: "Workflow",
      variableNames: ["id"],
      steps: [createScenarioStep(api, "one")],
      stopOnFailure: true,
    },
    cases: readMatrixDataset(dataset, "json"),
  };
}
const signal = () => new AbortController().signal;
const rule = (patch: Partial<MatrixAssertion> = {}): MatrixAssertion => ({
  name: "Row ID",
  target: "body",
  path: "/id",
  operator: "equals",
  expected: "",
  valueVariable: "id",
  ...patch,
});
const live = (transport: ScenarioTransport) => ({
  mode: "live" as const,
  signal: signal(),
  transport,
});

describe("matrix datasets and projects", () => {
  it("preserves JSON scalar types and prototype-looking columns as own data", () => {
    const rows = readMatrixDataset(
      '[{"__proto__":"own","constructor":false,"id":2,"empty":null}]',
      "json",
    );
    expect(rows[0]).toMatchObject({
      key: "case-1",
      name: "Case 1",
      enabled: true,
    });
    expect(Object.hasOwn(rows[0].values, "__proto__")).toBe(true);
    expect(rows[0].values.constructor).toBe(false);
    expect(parseMatrixValues('{"id":2,"empty":null}')).toEqual({
      id: 2,
      empty: null,
    });
    expect({}).not.toHaveProperty("own");
  });
  it("reads BOM, CRLF, escaped quotes, commas and multiline CSV fields", () => {
    const rows = readMatrixDataset(
      '\uFEFFid,note\r\n1,"a,b"\r\n2,"line\n""quote"""\r\n',
      "csv",
    );
    expect(rows.map((r) => r.values)).toEqual([
      { id: "1", note: "a,b" },
      { id: "2", note: 'line\n"quote"' },
    ]);
  });
  it("infers CSV scalars only when requested and preserves ambiguous identifiers", () => {
    const csv =
      "id,enabled,empty,large,decimal\n001,false,null,9007199254740993,2.5";
    expect(readMatrixDataset(csv, "csv")[0].values.enabled).toBe("false");
    expect(readMatrixDataset(csv, "csv", true)[0].values).toEqual({
      id: "001",
      enabled: false,
      empty: null,
      large: "9007199254740993",
      decimal: 2.5,
    });
  });
  it.each([
    "{}",
    "[]",
    "[null]",
    '[{"nested":{}}]',
    '[{"x":[]}]',
    '[{"bad-name":1}]',
    '[{"n":9007199254740993}]',
  ])("rejects invalid or non-scalar JSON datasets: %s", (input) => {
    expect(() => readMatrixDataset(input, "json")).toThrow(MatrixError);
  });
  it.each([
    "id,id\n1,2",
    "bad-name\n1",
    "id,name\n1",
    'id\n"unterminated',
    'id\n"x" trailing',
    'id\nx"y',
    "id",
  ])("rejects malformed CSV: %s", (input) => {
    expect(() => readMatrixDataset(input, "csv")).toThrow(MatrixError);
  });
  it("enforces byte, row, column and cell limits", () => {
    expect(() =>
      readMatrixDataset(" ".repeat(MAX_MATRIX_BYTES + 1), "json"),
    ).toThrow("limit");
    expect(() =>
      readMatrixDataset(
        JSON.stringify(Array.from({ length: 101 }, () => ({}))),
        "json",
      ),
    ).toThrow("limit");
    expect(() =>
      readMatrixDataset(
        JSON.stringify([
          Object.fromEntries(
            Array.from({ length: 33 }, (_, i) => [`x${i}`, i]),
          ),
        ]),
        "json",
      ),
    ).toThrow();
    expect(() => readMatrixDataset("id\n" + "a".repeat(8193), "csv")).toThrow(
      "limit",
    );
  });
  it("round-trips portable projects while stripping unknown runtime fields", () => {
    const p = project();
    const read = parseMatrixProject(
      JSON.stringify({
        ...p,
        sharedHeaders: { Authorization: "secret" },
        mode: "live",
      }),
    );
    expect(read).toEqual(p);
    expect(serializeMatrixProject(read)).not.toContain("secret");
    expect(parseMatrixProject(serializeMatrixProject(p))).toEqual(p);
  });
  it("rejects duplicate cases, dangling bindings and unsupported settings", () => {
    const p = project();
    expect(() =>
      validateMatrixProject({ ...p, cases: [p.cases[0], p.cases[0]] }),
    ).toThrow("dataset");
    expect(() =>
      validateMatrixProject({ ...p, bindings: [matrixBinding("absent")] }),
    ).toThrow("binding");
    expect(() =>
      validateMatrixProject({
        ...p,
        bindings: [matrixBinding("one"), matrixBinding("one")],
      }),
    ).toThrow("binding");
    for (const concurrency of [0, 5, 1.5])
      expect(() => validateMatrixProject({ ...p, concurrency })).toThrow(
        "project",
      );
    for (const maxRunMs of [999, 300001])
      expect(() => validateMatrixProject({ ...p, maxRunMs })).toThrow(
        "project",
      );
  });
  it("templates endpoint parameters and fills only missing case values", () => {
    const api = endpoint("/users/{id}");
    api.parameters = [
      {
        name: "id",
        location: "path",
        required: true,
        description: "",
        type: "integer",
        example: "7",
      },
    ];
    const p = addMatrixEndpoint(emptyMatrixProject(), api);
    expect(p.cases[0].values).toEqual({ id: 7 });
    expect(p.scenario.steps[0].parameters[0].value).toBe("{{id}}");
    const next = addMatrixEndpoint(
      { ...p, cases: readMatrixDataset('[{"id":99}]', "json") },
      api,
    );
    expect(next.cases[0].values.id).toBe(99);
    expect(next.scenario.steps.map((s) => s.id)).toEqual(["step-1", "step-2"]);
  });
  it.each([
    "[]",
    '{"Bad header":"x"}',
    '{"X":"a\\nb"}',
    '{"X":1}',
    '{"X":"a","x":"b"}',
  ])("rejects invalid shared header maps: %s", (input) =>
    expect(() => parseMatrixHeaders(input)).toThrow("headers"),
  );
});

describe("matrix batch execution", () => {
  it("preflights substituted definitions against scenario limits before dispatch", async () => {
    const api = endpoint(),
      p = project(api);
    p.scenario.steps[0].parameters = Array.from({ length: 64 }, (_, i) => ({
      location: "query" as const,
      name: `p${i}`,
      value: "x",
    }));
    const execute = vi.fn<ScenarioTransport>();
    await expect(
      runTestMatrix(p, [api], {
        ...live(execute),
        serverOverride: "https://staging.test",
        sharedHeaders: { Authorization: "secret" },
      }),
    ).rejects.toMatchObject({ code: "binding", caseKey: "case-1" });
    expect(execute).not.toHaveBeenCalled();
  });
  it("defers concrete assertion validation when a previous extraction overwrites an initial value", async () => {
    const api = endpoint(),
      p = project(api, '[{"threshold":"not-a-number"}]');
    p.scenario.steps[0].extracts = [{ name: "threshold", pointer: "/id" }];
    p.scenario.steps.push(createScenarioStep(api, "two"));
    p.bindings = [
      {
        ...matrixBinding("two"),
        assertions: [rule({ operator: "gte", valueVariable: "threshold" })],
      },
    ];
    const report = await runTestMatrix(p, [api], {
      mode: "mock",
      signal: signal(),
    });
    expect(report.outcome).toBe("passed");
  });
  it("rehearses rows offline and evaluates typed row-dependent expectations without mutating inputs", async () => {
    const api = endpoint(),
      p = project(api);
    p.bindings = [{ ...matrixBinding("one"), assertions: [rule()] }];
    const original = JSON.stringify(p),
      network = vi.spyOn(globalThis, "fetch"),
      transport = vi.fn<ScenarioTransport>();
    const report = await runTestMatrix(p, [api], {
      mode: "mock",
      signal: signal(),
      transport,
    });
    expect(report.counts).toEqual({
      passed: 1,
      failed: 1,
      error: 0,
      cancelled: 0,
      skipped: 0,
    });
    expect(report.results[1].steps[0]).toMatchObject({
      issue: "assertion-failed",
      assertions: [{ outcome: "fail" }],
    });
    expect(network).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(JSON.stringify(p)).toBe(original);
  });
  it("preflights every selected row before dispatch and identifies the invalid case", async () => {
    const api = endpoint(),
      p = project(api, '[{"id":7},{}]');
    p.scenario.steps[0].parameters = [
      { name: "id", location: "query", value: "{{id}}" },
    ];
    const execute = vi.fn<ScenarioTransport>();
    await expect(runTestMatrix(p, [api], live(execute))).rejects.toMatchObject({
      code: "variables",
      caseKey: "case-2",
    });
    expect(execute).not.toHaveBeenCalled();
    const selected = previewMatrixRun(p, [api], { caseKeys: ["case-1"] });
    expect(selected.prepared).toHaveLength(1);
  });
  it("compiles status, documented mock variant and duration bindings per case", async () => {
    const api = endpoint();
    api.responses.push({ ...api.responses[0], status: "404" });
    const p = project(
      api,
      '[{"status":200,"variant":"200","budget":20},{"status":"4xx","variant":"404","budget":"0"}]',
    );
    p.bindings = [
      {
        ...matrixBinding("one"),
        statusVariable: "status",
        mockStatusVariable: "variant",
        durationVariable: "budget",
      },
    ];
    const report = await runTestMatrix(p, [api], {
      mode: "mock",
      signal: signal(),
    });
    expect(report.outcome).toBe("passed");
    expect(report.results.map((r) => r.steps[0].status)).toEqual([
      "200",
      "404",
    ]);
    p.cases[1].values.variant = "500";
    expect(() => previewMatrixRun(p, [api])).toThrow("binding");
    try {
      previewMatrixRun(p, [api]);
    } catch (e) {
      expect(e).toMatchObject({ caseKey: "case-2" });
    }
    p.cases[1].values.variant = "404";
    p.cases[1].values.budget = -1;
    expect(() => previewMatrixRun(p, [api])).toThrow("binding");
  });
  it("isolates extracted variables while running concurrent case workflows in order", async () => {
    const first = endpoint("/first"),
      second = endpoint("/second");
    const p = project(first);
    p.concurrency = 2;
    const a = p.scenario.steps[0],
      b = createScenarioStep(second, "two");
    a.parameters = [{ name: "id", location: "query", value: "{{id}}" }];
    a.extracts = [{ name: "token", pointer: "/token" }];
    b.parameters = [{ name: "token", location: "query", value: "{{token}}" }];
    p.scenario.steps.push(b);
    const tokens: string[] = [];
    const execute = vi.fn<ScenarioTransport>(async (req) => {
      if (req.path === "/first")
        return response({
          body: JSON.stringify({
            token: `token-${req.requestParameters[0].value}`,
          }),
        });
      tokens.push(req.requestParameters[0].value);
      return response();
    });
    const report = await runTestMatrix(p, [first, second], live(execute));
    expect(report.outcome).toBe("passed");
    expect(tokens.sort()).toEqual(["token-7", "token-8"]);
    expect(report.results.map((r) => r.key)).toEqual(["case-1", "case-2"]);
    expect(
      report.results.every(
        (r) => r.steps.map((s) => s.id).join(",") === "one,two",
      ),
    ).toBe(true);
  });
  it("escapes interpolated JSON Pointer segments and keeps expanded values out of reports", async () => {
    const api = endpoint(),
      p = project(api, '[{"column":"private/field~","expected":false}]');
    p.bindings = [
      {
        ...matrixBinding("one"),
        assertions: [rule({ path: "/{{column}}", valueVariable: "expected" })],
      },
    ];
    const report = await runTestMatrix(
      p,
      [api],
      live(async () => response({ body: '{"private/field~":false}' })),
    );
    expect(report.outcome).toBe("passed");
    expect(serializeMatrixReport(report)).not.toContain("private/field");
    expect(report.results[0].steps[0].assertions[0].path).toBe("/{{column}}");
  });
  it("asserts previous extractions and skips later steps after a mismatch", async () => {
    const api = endpoint(),
      p = project(api, "[{}]");
    p.scenario.steps[0].extracts = [{ name: "saved", pointer: "/id" }];
    p.scenario.steps.push(
      createScenarioStep(api, "two"),
      createScenarioStep(api, "three"),
    );
    p.bindings = [
      {
        ...matrixBinding("two"),
        assertions: [rule({ valueVariable: "saved" })],
      },
    ];
    const execute = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(response())
      .mockResolvedValue(response({ body: '{"id":8}' }));
    const report = await runTestMatrix(p, [api], live(execute));
    expect(report.results[0].steps.map((s) => s.outcome)).toEqual([
      "passed",
      "failed",
      "skipped",
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("distinguishes unreadable response assertion errors from ordinary failures", async () => {
    const api = endpoint(),
      p = project(api, '[{"id":7}]');
    p.bindings = [{ ...matrixBinding("one"), assertions: [rule()] }];
    const report = await runTestMatrix(
      p,
      [api],
      live(async () => response({ body: "not-json" })),
    );
    expect(report.counts.error).toBe(1);
    expect(report.results[0].steps[0]).toMatchObject({
      outcome: "error",
      assertions: [{ issue: "unreadable-body" }],
    });
  });
  it("allows explicit negative-input tests while keeping normal scenario validation intact", async () => {
    const api = endpoint();
    api.parameters = [
      {
        name: "required",
        location: "query",
        required: true,
        description: "",
        example: "",
      },
    ];
    const p = project(api, "[{}]");
    p.scenario.steps[0].parameters = [];
    expect(() => previewMatrixRun(p, [api])).toThrow("variables");
    const execute = vi.fn<ScenarioTransport>().mockResolvedValue(response());
    const original = await runApiScenario(p.scenario, [api], {}, live(execute));
    expect(original.results[0].issue).toBe("missing-parameter");
    expect(execute).not.toHaveBeenCalled();
    p.allowInvalidInputs = true;
    expect((await runTestMatrix(p, [api], live(execute))).outcome).toBe(
      "passed",
    );
    expect(execute.mock.calls[0][0].requestParameters).toEqual([]);
    const pathApi = endpoint("/users/{id}");
    const pathProject = project(pathApi, "[{}]");
    pathProject.allowInvalidInputs = true;
    expect(() => previewMatrixRun(pathProject, [pathApi])).toThrow("variables");
  });
  it("requires a write acknowledgement and sends shared headers only to the explicit server", async () => {
    const api = endpoint("/users", "POST"),
      p = project(api, '[{"id":7}]');
    p.scenario.steps[0].parameters = [
      {
        name: "authorization",
        location: "header",
        value: "Bearer {{missing}}",
      },
    ];
    const execute = vi.fn<ScenarioTransport>().mockResolvedValue(response());
    const options = {
      ...live(execute),
      sharedHeaders: { Authorization: "session-secret" },
      serverOverride: "https://staging.test/api",
    };
    await expect(runTestMatrix(p, [api], options)).rejects.toMatchObject({
      code: "writes",
    });
    expect(execute).not.toHaveBeenCalled();
    const report = await runTestMatrix(p, [api], {
      ...options,
      allowWrites: true,
    });
    expect(report.outcome).toBe("passed");
    expect(execute.mock.calls[0][0]).toMatchObject({
      serverUrl: "https://staging.test/api",
      requestParameters: [
        { name: "Authorization", location: "header", value: "session-secret" },
      ],
    });
    expect(
      serializeMatrixReport(report) + serializeMatrixProject(p),
    ).not.toContain("session-secret");
  });
  it.each([
    "",
    "https://{{host}}.test",
    "https://user:pass@example.test",
    "https://example.test?x=1",
    "https://example.test#fragment",
    "file:///tmp/api",
  ])(
    "rejects unsafe session-header server overrides in preview and execution: %s",
    async (serverOverride) => {
      const api = endpoint(),
        p = project(api);
      const execute = vi.fn<ScenarioTransport>();
      const options = {
        ...live(execute),
        serverOverride,
        sharedHeaders: { Authorization: "secret" },
      };
      expect(() => previewMatrixRun(p, [api], options)).toThrow("headers");
      await expect(runTestMatrix(p, [api], options)).rejects.toMatchObject({
        code: "headers",
      });
      expect(execute).not.toHaveBeenCalled();
    },
  );
  it("enforces the request cap and unique enabled rerun selections", () => {
    const api = endpoint(),
      p = project(api, JSON.stringify(Array.from({ length: 100 }, () => ({}))));
    p.scenario.steps = Array.from({ length: 6 }, (_, i) =>
      createScenarioStep(api, `step-${i}`),
    );
    expect(() => previewMatrixRun(p, [api])).toThrow("limit");
    expect(
      previewMatrixRun(p, [api], { caseKeys: ["case-1"] }).prepared,
    ).toHaveLength(1);
    expect(() =>
      previewMatrixRun(p, [api], { caseKeys: ["case-1", "case-1"] }),
    ).toThrow("dataset");
    p.cases[0].enabled = false;
    expect(() =>
      previewMatrixRun(p, [api], { caseKeys: ["case-1"] }),
    ).toThrow();
  });
  it("limits active cases and stops queued cases after a failure without aborting active peers", async () => {
    const api = endpoint(),
      p = project(api, "[{}, {}, {}]");
    p.concurrency = 2;
    p.stopOnCaseFailure = true;
    const resolve: ((r: ScenarioResponse) => void)[] = [];
    const execute = vi.fn<ScenarioTransport>(
      () => new Promise((r) => resolve.push(r)),
    );
    const pending = runTestMatrix(p, [api], live(execute));
    expect(execute).toHaveBeenCalledTimes(2);
    resolve[0](response({ status: "500" }));
    await vi.waitFor(() => expect(resolve).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][1].aborted).toBe(false);
    resolve[1](response());
    const report = await pending;
    expect(report.results.map((r) => r.outcome)).toEqual([
      "failed",
      "passed",
      "skipped",
    ]);
    expect(report.stopReason).toBe("failure");
  });
  it("cancels active and queued cases even if a transport ignores abort", async () => {
    const api = endpoint(),
      p = project(api, "[{}, {}, {}]");
    p.concurrency = 2;
    const abort = new AbortController();
    const execute = vi.fn<ScenarioTransport>(() => new Promise(() => {}));
    const pending = runTestMatrix(p, [api], {
      ...live(execute),
      signal: abort.signal,
    });
    abort.abort();
    const report = await pending;
    expect(report.outcome).toBe("cancelled");
    expect(report.stopReason).toBe("cancelled");
    expect(report.results.map((r) => r.outcome)).toEqual([
      "cancelled",
      "cancelled",
      "skipped",
    ]);
    expect(execute.mock.calls.every(([, s]) => s.aborted)).toBe(true);
  });
  it("honors a global budget and cleans all timers after hung requests", async () => {
    vi.useFakeTimers();
    const api = endpoint(),
      p = project(api, "[{},{}]");
    p.maxRunMs = 1000;
    const pending = runTestMatrix(
      p,
      [api],
      live(() => new Promise(() => {})),
    );
    await vi.advanceTimersByTimeAsync(1000);
    const report = await pending;
    expect(report.stopReason).toBe("budget");
    expect(report.counts).toMatchObject({ cancelled: 1, skipped: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not launch an already-cancelled batch and ignores observer failures", async () => {
    const api = endpoint(),
      p = project(api);
    const abort = new AbortController();
    abort.abort();
    const execute = vi.fn<ScenarioTransport>();
    const report = await runTestMatrix(p, [api], {
      ...live(execute),
      signal: abort.signal,
      onProgress: () => {
        throw Error("observer");
      },
    });
    expect(report.counts.skipped).toBe(2);
    expect(execute).not.toHaveBeenCalled();
  });
  it("reruns only selected enabled failures with corrected typed values", async () => {
    const api = endpoint(),
      p = project(api);
    p.bindings = [{ ...matrixBinding("one"), assertions: [rule()] }];
    const original = await runTestMatrix(p, [api], {
      mode: "mock",
      signal: signal(),
    });
    const keys = original.results
      .filter((r) => r.outcome === "failed")
      .map((r) => r.key);
    p.cases[1].values.id = 7;
    const report = await runTestMatrix(p, [api], {
      mode: "mock",
      signal: signal(),
      caseKeys: keys,
    });
    expect(report.outcome).toBe("passed");
    expect(report.results.map((r) => r.key)).toEqual(["case-2"]);
  });
  it("exports well-formed JUnit with step counts, XML escaping and no response values", async () => {
    const api = endpoint(),
      p = project(api);
    p.name = 'Matrix <&> "run"\u0001';
    p.cases[0].name = "Case <one>";
    p.scenario.steps.push(createScenarioStep(api, "two"));
    p.bindings = [{ ...matrixBinding("one"), assertions: [rule()] }];
    const report = await runTestMatrix(
      p,
      [api],
      live(async () =>
        response({ body: '{"id":7,"secret":"response-secret"}' }),
      ),
    );
    const xml = matrixJUnitReport(report),
      parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.documentElement.getAttribute("tests")).toBe("4");
    expect(parsed.documentElement.getAttribute("failures")).toBe("1");
    expect(parsed.documentElement.getAttribute("skipped")).toBe("1");
    expect(xml).toContain("Case &lt;one&gt;");
    expect(xml).not.toContain("response-secret");
    expect(serializeMatrixReport(report)).not.toContain("response-secret");
  });
  it("exports queued/cancelled rows as skipped JUnit cases", () => {
    const report: MatrixReport = {
      kind: "rsswag-api-test-matrix-report",
      version: 1,
      name: "Batch",
      mode: "live",
      outcome: "cancelled",
      counts: { passed: 0, failed: 0, error: 0, cancelled: 0, skipped: 1 },
      results: [
        {
          key: "case-1",
          name: "Queued",
          outcome: "skipped",
          reason: "cancelled",
          steps: [],
          durationMs: 0,
        },
      ],
    };
    const parsed = new DOMParser().parseFromString(
      matrixJUnitReport(report),
      "application/xml",
    );
    expect(parsed.documentElement.getAttribute("tests")).toBe("1");
    expect(parsed.querySelector("skipped")?.getAttribute("message")).toBe(
      "cancelled",
    );
  });
});
