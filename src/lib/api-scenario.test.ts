import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary } from "./openapi";
import {
  createScenarioStep,
  executeScenarioLive,
  expandScenarioText,
  parseScenario,
  parseScenarioVariables,
  runApiScenario,
  serializeScenario,
  serializeScenarioReport,
  validateScenario,
  validScenarioStatus,
  type ApiScenario,
  type ScenarioResponse,
  type ScenarioStep,
  type ScenarioTransport,
} from "./api-scenario";

function endpoint(
  path = "/users",
  method = "GET",
  body = '{"id":7,"token":"secret-token"}',
): EndpointSummary {
  return {
    path,
    method,
    operationId: "",
    deprecated: false,
    secured: false,
    securityRequirements: [],
    serverUrl: "https://example.test",
    summary: "Example",
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
  body: '{"id":7,"token":"secret-token"}',
  headers: { "content-type": "application/json" },
  status: "200",
  durationMs: 12,
  ...patch,
});
const plan = (steps: ScenarioStep[]): ApiScenario => ({
  name: "Workflow",
  variableNames: [],
  stopOnFailure: true,
  steps,
});
const signal = () => new AbortController().signal;

describe("API scenarios", () => {
  it("chains extracted values into encoded parameters and typed JSON bodies in sequence", async () => {
    const first = endpoint("/create", "POST");
    const second = endpoint("/users/{id}", "POST");
    second.parameters = [
      {
        name: "id",
        location: "path",
        required: true,
        example: "",
        description: "",
      },
    ];
    const a = createScenarioStep(first, "one");
    a.extracts = [
      { name: "userId", pointer: "/id" },
      { name: "token", pointer: "/token" },
    ];
    const b = createScenarioStep(second, "two");
    b.parameters = [
      { name: "id", location: "path", value: "{{userId}}" },
      { name: "Authorization", location: "header", value: "Bearer {{token}}" },
    ];
    b.body =
      '{"owner":"{{userId}}","enabled":"{{enabled}}","message":"Hello {{name}}"}';
    const execute = vi.fn<ScenarioTransport>().mockResolvedValue(response());
    const report = await runApiScenario(
      plan([a, b]),
      [first, second],
      { enabled: false, name: 'Ada "quote"' },
      { mode: "live", signal: signal(), transport: execute },
    );
    expect(report.outcome).toBe("passed");
    expect(execute).toHaveBeenCalledTimes(2);
    const request = execute.mock.calls[1][0];
    expect(request.requestParameters).toEqual([
      { name: "id", location: "path", value: "7" },
      {
        name: "Authorization",
        location: "header",
        value: "Bearer secret-token",
      },
    ]);
    expect(JSON.parse(request.requestBody)).toEqual({
      owner: 7,
      enabled: false,
      message: 'Hello Ada "quote"',
    });
    expect(report.results[0].extracted).toEqual(["userId", "token"]);
    expect(serializeScenarioReport(report)).not.toMatch(
      /secret-token|Ada|Authorization/,
    );
  });

  it("rehearses with documented mock responses without fetching or mutating the plan", async () => {
    const api = endpoint();
    const step = createScenarioStep(api, "one");
    step.checkContract = true;
    const scenario = plan([step]);
    const original = JSON.stringify(scenario);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      const report = await runApiScenario(
        scenario,
        [api],
        {},
        { mode: "mock", signal: signal() },
      );
      expect(report.results[0]).toMatchObject({
        outcome: "passed",
        durationMs: 0,
        contract: "passed",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(scenario)).toBe(original);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("stops on failures and can continue independent steps when configured", async () => {
    const api = endpoint();
    const scenario = plan([
      createScenarioStep(api, "one"),
      createScenarioStep(api, "two"),
    ]);
    scenario.steps[0].expectedStatus = "201";
    const execute = vi.fn<ScenarioTransport>().mockResolvedValue(response());
    const stopped = await runApiScenario(
      scenario,
      [api],
      {},
      { mode: "live", signal: signal(), transport: execute },
    );
    expect(stopped.results.map((row) => row.outcome)).toEqual([
      "failed",
      "skipped",
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    scenario.stopOnFailure = false;
    const continued = await runApiScenario(
      scenario,
      [api],
      {},
      { mode: "live", signal: signal(), transport: execute },
    );
    expect(continued.results.map((row) => row.outcome)).toEqual([
      "failed",
      "passed",
    ]);
  });

  it("publishes extractions atomically and invalidates failed outputs before continuing", async () => {
    const api = endpoint();
    const a = createScenarioStep(api, "one");
    a.extracts = [
      { name: "id", pointer: "/id" },
      { name: "missing", pointer: "/absent" },
    ];
    const b = createScenarioStep(api, "two");
    b.parameters = [{ location: "query", name: "id", value: "{{id}}" }];
    const scenario = { ...plan([a, b]), stopOnFailure: false };
    const execute = vi.fn<ScenarioTransport>().mockResolvedValue(response());
    const report = await runApiScenario(
      scenario,
      [api],
      { id: 99 },
      { mode: "live", signal: signal(), transport: execute },
    );
    expect(report.results.map((row) => row.issue)).toEqual([
      "extraction-failed",
      "missing-variable",
    ]);
    expect(report.results[0].extracted).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("uses own properties and exact pointer escaping while preserving scalar types", async () => {
    const api = endpoint();
    const a = createScenarioStep(api, "one");
    a.extracts = [{ name: "constructor", pointer: "/__proto__/a~1b~0" }];
    const b = createScenarioStep(endpoint("/post", "POST"), "two");
    b.body = '{"value":"{{constructor}}"}';
    const execute = vi
      .fn<ScenarioTransport>()
      .mockResolvedValue(response({ body: '{"__proto__":{"a/b~":null}}' }));
    const report = await runApiScenario(
      plan([a, b]),
      [api, endpoint("/post", "POST")],
      {},
      { mode: "live", signal: signal(), transport: execute },
    );
    expect(report.outcome).toBe("passed");
    expect(JSON.parse(execute.mock.calls[1][0].requestBody)).toEqual({
      value: null,
    });
  });

  it.each(["{}", '{"id":{}}', '{"id":9007199254740992}', "not JSON"])(
    "rejects unusable extraction body %s",
    async (body) => {
      const api = endpoint();
      const step = createScenarioStep(api, "one");
      step.extracts = [{ name: "id", pointer: "/id" }];
      const report = await runApiScenario(
        plan([step]),
        [api],
        {},
        {
          mode: "live",
          signal: signal(),
          transport: async () => response({ body }),
        },
      );
      expect(report.results[0].issue).toBe("extraction-failed");
    },
  );

  it("checks timing and documented contracts independently of HTTP expectations", async () => {
    const api = endpoint();
    const step = createScenarioStep(api, "one");
    step.maxDurationMs = 10;
    const run = () =>
      runApiScenario(
        plan([step]),
        [api],
        {},
        {
          mode: "live",
          signal: signal(),
          transport: async () => response({ body: "{}" }),
        },
      );
    expect((await run()).results[0].issue).toBe("duration-exceeded");
    step.maxDurationMs = 0;
    step.checkContract = true;
    expect((await run()).results[0]).toMatchObject({
      issue: "contract-failed",
      contract: "failed",
    });
    api.responses[0].schema = null;
    expect((await run()).results[0]).toMatchObject({
      outcome: "passed",
      contract: "partial",
    });
  });

  it("cancels an in-flight request without starting another or accepting a late response", async () => {
    const api = endpoint();
    const abort = new AbortController();
    let finish!: (response: ScenarioResponse) => void;
    const execute = vi.fn<ScenarioTransport>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const progress = vi.fn();
    const pending = runApiScenario(
      plan([createScenarioStep(api, "a"), createScenarioStep(api, "b")]),
      [api],
      {},
      {
        mode: "live",
        signal: abort.signal,
        transport: execute,
        onProgress: progress,
      },
    );
    abort.abort();
    const report = await pending;
    expect(report.outcome).toBe("cancelled");
    expect(report.results.map((row) => row.outcome)).toEqual([
      "cancelled",
      "skipped",
    ]);
    expect(execute.mock.calls[0][1].aborted).toBe(true);
    finish(response());
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledTimes(2);
    expect(report.results[0].status).toBeNull();
  });

  it("enforces timeouts even if the transport does not settle on abort", async () => {
    vi.useFakeTimers();
    try {
      const api = endpoint();
      const step = createScenarioStep(api, "one");
      step.timeoutMs = 1000;
      const pending = runApiScenario(
        plan([step]),
        [api],
        {},
        {
          mode: "live",
          signal: signal(),
          transport: () => new Promise(() => {}),
        },
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect((await pending).results[0].issue).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks all endpoint bindings before making any request", async () => {
    const api = endpoint();
    const execute = vi.fn<ScenarioTransport>();
    const scenario = plan([
      createScenarioStep(api, "one"),
      createScenarioStep(endpoint("/missing"), "two"),
    ]);
    await expect(
      runApiScenario(
        scenario,
        [api],
        {},
        { mode: "live", signal: signal(), transport: execute },
      ),
    ).rejects.toMatchObject({ code: "missing-endpoint" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("matches required headers without case sensitivity while preserving query parameter casing", async () => {
    const api = endpoint();
    api.parameters = [
      {
        location: "header",
        name: "X-Account",
        required: true,
        example: "",
        description: "",
      },
      {
        location: "query",
        name: "accountId",
        required: true,
        example: "",
        description: "",
      },
    ];
    const step = createScenarioStep(api, "one");
    step.parameters = [
      { location: "header", name: "x-account", value: "example" },
      { location: "query", name: "accountId", value: "7" },
    ];
    const execute = vi.fn<ScenarioTransport>().mockResolvedValue(response());
    const run = () =>
      runApiScenario(
        plan([step]),
        [api],
        {},
        { mode: "live", signal: signal(), transport: execute },
      );
    expect((await run()).outcome).toBe("passed");
    step.parameters[1].name = "accountid";
    expect((await run()).results[0].issue).toBe("missing-parameter");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reports invalid bodies and missing parameters without sending a request", async () => {
    const api = endpoint("/items/{id}", "POST");
    api.parameters = [
      {
        name: "id",
        location: "path",
        required: true,
        example: "",
        description: "",
      },
    ];
    const step = createScenarioStep(api, "one");
    const execute = vi.fn<ScenarioTransport>();
    const run = () =>
      runApiScenario(
        plan([step]),
        [api],
        {},
        { mode: "live", signal: signal(), transport: execute },
      );
    expect((await run()).results[0].issue).toBe("missing-parameter");
    step.parameters[0].value = "7";
    step.body = '{"id":{{id}}}';
    expect((await run()).results[0].issue).toBe("invalid-body");
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates bounded typed variables and performs single-pass substitutions", () => {
    expect(
      parseScenarioVariables('{"id":7,"flag":false,"nothing":null}'),
    ).toEqual({ id: 7, flag: false, nothing: null });
    for (const input of [
      "[]",
      "null",
      '{"bad-key":1}',
      '{"x":{}}',
      '{"x":1e400}',
      '{"x":9007199254740992}',
    ])
      expect(() => parseScenarioVariables(input)).toThrow("invalid-variables");
    expect(expandScenarioText("{{id}}", new Map([["id", "{{other}}"]]))).toBe(
      "{{other}}",
    );
    expect(() => expandScenarioText("{{id}}", new Map())).toThrow(
      "missing-variable",
    );
    expect(() =>
      expandScenarioText(
        "{{id}}".repeat(20),
        new Map([["id", "a".repeat(8192)]]),
      ),
    ).toThrow("limit");
    expect(validScenarioStatus("200, 4XX")).toBe(true);
    expect(validScenarioStatus("any")).toBe(true);
    expect(validScenarioStatus("200,")).toBe(false);
  });

  it("round-trips definitions, strips unknown fields, and enforces structural limits", () => {
    const scenario = plan([createScenarioStep(endpoint(), "one")]);
    scenario.variableNames = ["token"];
    const raw = JSON.parse(serializeScenario(scenario));
    raw.secret = "ignore";
    raw.scenario.steps[0].response = "ignore";
    expect(parseScenario("\uFEFF" + JSON.stringify(raw))).toEqual(scenario);
    for (const invalid of [
      "not JSON",
      '{"kind":"rsswag-api-scenario","version":2}',
      serializeScenario({
        ...scenario,
        steps: Array(21).fill(scenario.steps[0]),
      }),
    ])
      expect(() => parseScenario(invalid)).toThrow("invalid-plan");
    expect(() => parseScenario(" ".repeat(2 * 1024 * 1024 + 1))).toThrow(
      "limit",
    );
    expect(
      validateScenario({
        ...scenario,
        steps: [scenario.steps[0], scenario.steps[0]],
      }),
    ).toBe(false);
    expect(
      validateScenario({
        ...scenario,
        steps: [{ ...scenario.steps[0], timeoutMs: 0 }],
      }),
    ).toBe(false);
    expect(
      validateScenario({
        ...scenario,
        steps: [
          {
            ...scenario.steps[0],
            extracts: [{ name: "a", pointer: "/bad~2" }],
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("scenario Live transport", () => {
  const request = {
    method: "GET",
    path: "/users",
    serverUrl: "https://example.test",
    requestParameters: [],
    requestBody: "",
    contentType: "application/json",
    timeoutMs: 1000,
  };
  it("requires actual live execution and validates the proxy result", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(response()));
    try {
      expect(await executeScenarioLive(request, signal())).toEqual(response());
      expect(
        JSON.parse(fetchMock.mock.calls[0][1]!.body as string).requireLive,
      ).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });
  it.each([
    [{ status: "0", errorCode: "timeout" }, "timeout"],
    [{ status: "0", errorCode: "response-limit" }, "response-limit"],
    [{ status: "0" }, "network"],
    [{ durationMs: -1 }, "invalid-response"],
  ])("rejects failed or invalid Live responses", async (patch, code) => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ ...response(), ...patch }));
    try {
      await expect(
        executeScenarioLive(request, signal()),
      ).rejects.toMatchObject({ code });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
