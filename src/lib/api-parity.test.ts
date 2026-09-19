import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createParityCase,
  createParityPlan,
  MAX_PARITY_BYTES,
  parseParityHeaders,
  parseParityPlan,
  runApiParity,
  serializeParityPlan,
  serializeParityReport,
  validateParityPlan,
  type ParityPlan,
} from "./api-parity";
import {
  ScenarioError,
  type ScenarioResponse,
  type ScenarioTransport,
} from "./api-scenario";
import type { EndpointSummary } from "./openapi";

function endpoint(path = "/items", method = "GET"): EndpointSummary {
  return {
    method,
    path,
    operationId: "",
    summary: "Read items",
    description: "",
    tags: [],
    deprecated: false,
    secured: false,
    securityRequirements: [],
    serverUrl: "https://schema.example.com",
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
          example: '{"id":1,"token":"private-body"}',
          exampleName: "",
          hasExplicitExample: true,
        },
      },
      {
        status: "404",
        description: "Not found",
        contentTypes: ["application/json"],
        schema: {
          type: "object",
          properties: ["error"],
          example: '{"error":"missing"}',
          exampleName: "",
          hasExplicitExample: true,
        },
      },
    ],
  };
}
const response = (patch: Partial<ScenarioResponse> = {}): ScenarioResponse => ({
  status: "200",
  durationMs: 10,
  headers: { "content-type": "application/json" },
  body: '{"id":1,"token":"private-body"}',
  ...patch,
});
const signal = () => new AbortController().signal;
function plan(endpoints = [endpoint()]): ParityPlan {
  return {
    ...createParityPlan(),
    baselineUrl: "https://baseline.example.com/v1",
    candidateUrl: "https://candidate.example.com/v2",
    cases: endpoints.map((endpoint, index) =>
      createParityCase(endpoint, `case-${index}`),
    ),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("portable comparison definitions", () => {
  it("round-trips definitions and strips imported runtime payloads at every level", () => {
    const definition = plan();
    const decorated = {
      ...definition,
      sessionHeaders: { Authorization: "secret-session" },
      results: [{ body: "secret-response" }],
      cases: definition.cases.map((entry) => ({
        ...entry,
        response: "secret-response",
        parameters: [
          {
            name: "q",
            value: "kept-parameter",
            location: "query" as const,
            secret: "private-extension",
          },
        ],
      })),
    };
    const input = JSON.stringify({
      kind: "rsswag-api-parity",
      version: 1,
      plan: decorated,
      runtime: "private-top",
    });
    const parsed = parseParityPlan("\uFEFF" + input);
    const serialized = serializeParityPlan(parsed);
    expect(serialized).not.toMatch(
      /secret-session|secret-response|private-extension|private-top/,
    );
    expect(serialized).toContain("kept-parameter");
    expect(parseParityPlan(serialized)).toEqual(parsed);
    expect(serializeParityPlan(decorated)).not.toMatch(
      /secret-session|secret-response|private-extension/,
    );
  });
  it("supports repeated query parameters but rejects duplicate header inputs", () => {
    const definition = plan();
    definition.cases[0].parameters = [
      { name: "tag", location: "query", value: "one" },
      { name: "tag", location: "query", value: "two" },
    ];
    expect(validateParityPlan(definition)).toBe(true);
    definition.cases[0].parameters = [
      { name: "X-Key", location: "header", value: "one" },
      { name: "x-key", location: "header", value: "two" },
    ];
    expect(validateParityPlan(definition)).toBe(false);
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"])(
    "refuses %s cases even in imported plans",
    (method) => {
      expect(() =>
        createParityCase(endpoint("/items", method), "one"),
      ).toThrow();
      const definition = plan();
      const input = JSON.stringify({
        kind: "rsswag-api-parity",
        version: 1,
        plan: { ...definition, cases: [{ ...definition.cases[0], method }] },
      });
      expect(() => parseParityPlan(input)).toThrow("invalid-plan");
    },
  );
  it.each([
    {},
    { name: "" },
    { timeoutMs: 999 },
    { timeoutMs: 30001 },
    { timeoutMs: 1000.5 },
    { maxSlowdownMs: -1 },
    { maxSlowdownMs: 60001 },
    { ignoredBodyPaths: ["/bad~2"] },
    { ignoredBodyPaths: ["#/id"] },
    { ignoredHeaders: ["bad header"] },
  ])("rejects invalid configuration %j", (patch) => {
    const definition = Object.keys(patch).length ? { ...plan(), ...patch } : {};
    expect(validateParityPlan(definition)).toBe(false);
  });
  it("rejects malformed envelopes, duplicate IDs, excess cases and oversized files", () => {
    for (const text of [
      "{",
      "[]",
      JSON.stringify({ kind: "rsswag-api-parity", version: 2, plan: plan() }),
    ])
      expect(() => parseParityPlan(text)).toThrow("invalid-plan");
    const definition = plan();
    definition.cases.push({ ...definition.cases[0] });
    expect(validateParityPlan(definition)).toBe(false);
    definition.cases = Array.from({ length: 21 }, (_, index) =>
      createParityCase(endpoint(), String(index)),
    );
    expect(validateParityPlan(definition)).toBe(false);
    expect(() => parseParityPlan(" ".repeat(MAX_PARITY_BYTES + 1))).toThrow(
      "limit",
    );
  });
  it.each([
    "[]",
    '{"Authorization":2}',
    '{"Host":"example.com"}',
    '{"a":"line\\nbreak"}',
    '{"Authorization":"a","authorization":"b"}',
    '{"bad name":"x"}',
  ])("rejects invalid session headers %s", (text) => {
    expect(() => parseParityHeaders(text)).toThrow("headers");
  });
  it("preserves literal prototype-looking header names without prototype mutation", () => {
    const headers = parseParityHeaders(
      '{"__proto__":"ordinary-value","constructor":"ordinary-value"}',
    );
    expect(Object.hasOwn(headers, "__proto__")).toBe(true);
    expect(headers.__proto__).toBe("ordinary-value");
    expect(Object.getPrototypeOf(headers)).toBe(Object.prototype);
  });
  it("rejects header values the fetch runtime cannot represent", async () => {
    expect(() => parseParityHeaders('{"X-Test":"token🚀"}')).toThrow("headers");
    expect(parseParityHeaders('{"X-Test":"café"}')).toEqual({
      "X-Test": "café",
    });
    const definition = plan();
    definition.cases[0].parameters = [
      { location: "header", name: "X-Test", value: "token🚀" },
    ];
    expect(validateParityPlan(definition)).toBe(false);
    const transport = vi.fn<ScenarioTransport>();
    await expect(
      runApiParity(plan(), [endpoint()], {
        mode: "live",
        signal: signal(),
        transport,
        headers: { baseline: {}, candidate: { "X-Test": "token🚀" } },
      }),
    ).rejects.toMatchObject({ code: "headers", side: "candidate" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("exports only report metadata even if untrusted fields are attached to results", async () => {
    const report = await runApiParity(plan(), [endpoint()], {
      mode: "mock",
      signal: signal(),
    });
    Object.assign(report, {
      sessionHeaders: "secret-runtime",
      baselineUrl: "secret-server",
    });
    Object.assign(report.results[0], {
      body: "secret-body",
      headers: "secret-header",
    });
    report.results[0].differences.push({
      area: "body",
      kind: "changed",
      path: "/id",
      ...{ before: "secret-before", after: "secret-after" },
    });
    Object.assign(report.results[0].baseline!, { body: "secret-baseline" });
    const text = serializeParityReport(report);
    expect(text).not.toContain("secret-");
    expect(JSON.parse(text)).toMatchObject({
      kind: "rsswag-api-parity-report",
      version: 1,
      planName: report.planName,
      mode: "mock",
      results: [
        { differences: [{ area: "body", kind: "changed", path: "/id" }] },
      ],
    });
  });
});

describe("environment comparison execution", () => {
  it("runs request pairs in order with distinct headers, unchanged parameters and no retained values", async () => {
    const api = endpoint("/items/{id}");
    api.parameters = [
      {
        location: "path",
        name: "id",
        example: "a/b",
        required: true,
        description: "",
      },
      {
        location: "header",
        name: "Authorization",
        example: "",
        required: true,
        description: "",
      },
    ];
    const definition = plan([api]);
    definition.cases[0].parameters.push(
      { location: "query", name: "q", value: "private-query" },
      { location: "query", name: "q", value: "second" },
    );
    const before = JSON.stringify(definition);
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(
        response({
          headers: {
            "content-type": "application/json",
            Date: "first",
            "set-cookie": "private-cookie-a",
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          durationMs: 25,
          headers: {
            "content-type": "application/json",
            date: "second",
            "set-cookie": "private-cookie-b",
          },
          body: '{"id":2,"token":"private-candidate"}',
        }),
      );
    const onProgress = vi.fn();
    const report = await runApiParity(definition, [api], {
      mode: "live",
      signal: signal(),
      transport,
      headers: {
        baseline: { authorization: "Bearer baseline-secret" },
        candidate: { Authorization: "Bearer candidate-secret" },
      },
      onProgress,
    });
    expect(transport.mock.calls.map(([request]) => request.serverUrl)).toEqual([
      definition.baselineUrl,
      definition.candidateUrl,
    ]);
    expect(transport.mock.calls[0][0]).toMatchObject({
      method: "GET",
      path: "/items/{id}",
      requestBody: "",
      contentType: "",
    });
    expect(transport.mock.calls[0][0].requestParameters).toEqual(
      expect.arrayContaining([
        { name: "id", location: "path", value: "a/b" },
        {
          name: "authorization",
          location: "header",
          value: "Bearer baseline-secret",
        },
      ]),
    );
    expect(transport.mock.calls[1][0].requestParameters).toContainEqual({
      name: "Authorization",
      location: "header",
      value: "Bearer candidate-secret",
    });
    expect(report.results[0]).toMatchObject({
      outcome: "different",
      durationDeltaMs: 15,
      baseline: { status: "200", contract: { failed: 0 } },
      candidate: { status: "200", contract: { failed: 0 } },
    });
    expect(report.results[0].differences).toEqual([
      { area: "headers", kind: "changed", path: "/set-cookie" },
      { area: "body", kind: "changed", path: "/id" },
      { area: "body", kind: "changed", path: "/token" },
    ]);
    expect(JSON.stringify(report)).not.toMatch(
      /private-|baseline-secret|candidate-secret|example\.com/,
    );
    expect(JSON.stringify(definition)).toBe(before);
    expect(
      onProgress.mock.calls.map(([, active]) => active?.side ?? null),
    ).toEqual(["baseline", "candidate", null]);
    expect(report).toMatchObject({
      planName: definition.name,
      startedAt: expect.any(String),
      completedAt: expect.any(String),
    });
  });

  it("uses the real proxy adapter with requireLive and never saves request history", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response()), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    // Each response stream can only be consumed once.
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify(response()), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const result = await runApiParity(plan(), [endpoint()], {
      mode: "live",
      signal: signal(),
    });
    expect(result.outcome).toBe("matched");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("/api/try-it-out");
      expect(JSON.parse(init!.body as string)).toMatchObject({
        requireLive: true,
        method: "GET",
        requestBody: "",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("compares mock variants without credentials, URLs, parameters or network requests", async () => {
    const api = endpoint("/items/{id}");
    api.parameters = [
      {
        name: "id",
        location: "path",
        required: true,
        example: "",
        description: "",
      },
    ];
    const definition = plan([api]);
    definition.baselineUrl = "";
    definition.candidateUrl = "";
    definition.cases[0].candidateMockStatus = "404";
    const network = vi.spyOn(globalThis, "fetch");
    const report = await runApiParity(definition, [api], {
      mode: "mock",
      signal: signal(),
      headers: { baseline: { Host: "ignored" }, candidate: {} },
    });
    expect(report.mode).toBe("mock");
    expect(report.outcome).toBe("failed");
    expect(report.results[0]).toMatchObject({
      outcome: "different",
      baseline: { status: "200", durationMs: 0 },
      candidate: { status: "404", durationMs: 0 },
    });
    expect(network).not.toHaveBeenCalled();
  });
  it.each(["HEAD", "204", "304"])(
    "suppresses mock bodies for %s",
    async (variant) => {
      const api = endpoint("/items", variant === "HEAD" ? "HEAD" : "GET");
      if (variant !== "HEAD") api.responses[0].status = variant;
      const report = await runApiParity(plan([api]), [api], {
        mode: "mock",
        signal: signal(),
      });
      expect(report.outcome).toBe("matched");
      expect(report.results[0].baseline?.bodyBytes).toBe(0);
      expect(report.results[0].candidate?.bodyBytes).toBe(0);
    },
  );

  it("ignores configured JSON subtrees and headers while preserving contract checks", async () => {
    const definition = plan();
    definition.ignoredBodyPaths = ["/meta"];
    definition.ignoredHeaders.push("X-Version");
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(
        response({
          body: '{"meta":{"at":1},"id":1}',
          headers: { "content-type": "application/json", "x-version": "old" },
        }),
      )
      .mockResolvedValueOnce(
        response({
          body: '{"id":1,"meta":{"at":2}}',
          headers: { "content-type": "application/json", "X-Version": "new" },
        }),
      );
    expect(
      (
        await runApiParity(definition, [endpoint()], {
          mode: "live",
          signal: signal(),
          transport,
        })
      ).outcome,
    ).toBe("matched");
    definition.ignoredBodyPaths = ["/id"];
    definition.compareHeaders = false;
    transport
      .mockResolvedValueOnce(response({ body: '{"id":1}' }))
      .mockResolvedValueOnce(
        response({ body: "{}", headers: { "content-type": "text/plain" } }),
      );
    const result = await runApiParity(definition, [endpoint()], {
      mode: "live",
      signal: signal(),
      transport,
    });
    expect(result.results[0].differences).toEqual([]);
    expect(result.results[0].candidate?.contract?.failed).toBeGreaterThan(0);
    expect(result.outcome).toBe("failed");
  });

  it("checks the candidate latency increase and treats the threshold as inclusive", async () => {
    const definition = plan();
    definition.maxSlowdownMs = 50;
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(response({ durationMs: 20 }))
      .mockResolvedValueOnce(response({ durationMs: 70 }));
    expect(
      (
        await runApiParity(definition, [endpoint()], {
          mode: "live",
          signal: signal(),
          transport,
        })
      ).outcome,
    ).toBe("matched");
    transport
      .mockResolvedValueOnce(response({ durationMs: 20 }))
      .mockResolvedValueOnce(response({ durationMs: 71 }));
    const result = await runApiParity(definition, [endpoint()], {
      mode: "live",
      signal: signal(),
      transport,
    });
    expect(result.results[0]).toMatchObject({
      outcome: "different",
      slowdown: true,
      durationDeltaMs: 51,
    });
  });

  it("preflights every case and both sets of required values before sending anything", async () => {
    const first = endpoint();
    const second = endpoint("/users/{id}");
    second.parameters = [
      {
        name: "id",
        location: "path",
        example: "",
        required: true,
        description: "",
      },
    ];
    const definition = plan([first, second]);
    const transport = vi.fn<ScenarioTransport>();
    await expect(
      runApiParity(definition, [first, second], {
        mode: "live",
        signal: signal(),
        transport,
      }),
    ).rejects.toMatchObject({
      code: "missing-parameter",
      caseIndex: 1,
      side: "baseline",
    });
    definition.cases[1].parameters[0].value = "1";
    second.parameters.push({
      name: "x-key",
      location: "header",
      example: "",
      required: true,
      description: "",
    });
    await expect(
      runApiParity(definition, [first, second], {
        mode: "live",
        signal: signal(),
        transport,
        headers: { baseline: { "x-key": "a" }, candidate: {} },
      }),
    ).rejects.toMatchObject({
      code: "missing-parameter",
      caseIndex: 1,
      side: "candidate",
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    "",
    "http://localhost",
    "https://127.0.0.1",
    "https://user:pass@example.com",
    "https://example.com?q=secret",
    "https://example.com#fragment",
    "ftp://example.com",
  ])("rejects invalid Live targets before transport: %s", async (url) => {
    const definition = plan();
    definition.candidateUrl = url;
    const transport = vi.fn<ScenarioTransport>();
    await expect(
      runApiParity(definition, [endpoint()], {
        mode: "live",
        signal: signal(),
        transport,
      }),
    ).rejects.toMatchObject({ code: "target", side: "candidate" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects missing or ambiguous schema operations and obsolete mock variants", async () => {
    await expect(
      runApiParity(plan(), [], { mode: "mock", signal: signal() }),
    ).rejects.toMatchObject({ code: "missing-endpoint", caseIndex: 0 });
    await expect(
      runApiParity(plan(), [endpoint(), endpoint()], {
        mode: "mock",
        signal: signal(),
      }),
    ).rejects.toMatchObject({ code: "missing-endpoint" });
    const definition = plan();
    definition.cases[0].candidateMockStatus = "418";
    await expect(
      runApiParity(definition, [endpoint()], {
        mode: "mock",
        signal: signal(),
      }),
    ).rejects.toMatchObject({ code: "mock-response", side: "candidate" });
  });

  it("continues after errors by default, retains the successful side and supports stop on failure", async () => {
    const apis = [endpoint(), endpoint("/other")];
    const definition = plan(apis);
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new Error("secret-server-error"))
      .mockResolvedValue(response());
    const result = await runApiParity(definition, apis, {
      mode: "live",
      signal: signal(),
      transport,
    });
    expect(result.results[0]).toMatchObject({
      outcome: "error",
      issue: "network",
      side: "candidate",
      baseline: { status: "200" },
      candidate: null,
    });
    expect(result.results[1].outcome).toBe("matched");
    expect(JSON.stringify(result)).not.toContain("secret-server-error");
    definition.stopOnFailure = true;
    transport
      .mockClear()
      .mockRejectedValue(new ScenarioError("invalid-server"));
    const stopped = await runApiParity(definition, apis, {
      mode: "live",
      signal: signal(),
      transport,
    });
    expect(stopped.results[0].issue).toBe("target");
    expect(stopped.results[1]).toMatchObject({
      outcome: "skipped",
      issue: "stopped",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("cancels an uncooperative transport promptly, keeps completed data and ignores late errors", async () => {
    const apis = [endpoint(), endpoint("/other")];
    const controller = new AbortController();
    let rejectLate: (error: Error) => void = () => {};
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(response())
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectLate = reject;
          }),
      );
    const running = runApiParity(plan(apis), apis, {
      mode: "live",
      signal: controller.signal,
      transport,
    });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    controller.abort();
    const result = await running;
    expect(result.outcome).toBe("cancelled");
    expect(result.results[0]).toMatchObject({
      outcome: "cancelled",
      side: "candidate",
      baseline: { status: "200" },
    });
    expect(result.results[1]).toMatchObject({
      outcome: "skipped",
      issue: "cancelled",
    });
    expect(transport.mock.calls[1][1].aborted).toBe(true);
    rejectLate(new Error("late"));
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("does not start any requests when already cancelled or cancelled by progress", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn<ScenarioTransport>();
    expect(
      (
        await runApiParity(plan(), [endpoint()], {
          mode: "live",
          signal: controller.signal,
          transport,
        })
      ).outcome,
    ).toBe("cancelled");
    const next = new AbortController();
    const result = await runApiParity(plan(), [endpoint()], {
      mode: "live",
      signal: next.signal,
      transport,
      onProgress: () => next.abort(),
    });
    expect(result.outcome).toBe("cancelled");
    expect(transport).not.toHaveBeenCalled();
  });
  it("enforces per-request deadlines even if the transport ignores its abort signal", async () => {
    vi.useFakeTimers();
    const definition = plan();
    definition.timeoutMs = 1000;
    const transport = vi
      .fn<ScenarioTransport>()
      .mockImplementation(() => new Promise(() => {}));
    const running = runApiParity(definition, [endpoint()], {
      mode: "live",
      signal: signal(),
      transport,
    });
    await vi.advanceTimersByTimeAsync(1001);
    const result = await running;
    expect(result.results[0]).toMatchObject({
      outcome: "error",
      issue: "timeout",
      side: "baseline",
    });
    expect(transport.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a stable plan and contract snapshot throughout an asynchronous run", async () => {
    const api = endpoint();
    const definition = plan([api]);
    let finish: (value: ScenarioResponse) => void = () => {};
    const transport = vi
      .fn<ScenarioTransport>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(response());
    const running = runApiParity(definition, [api], {
      mode: "live",
      signal: signal(),
      transport,
    });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    definition.candidateUrl = "https://changed.example.com";
    definition.cases[0].path = "/changed";
    api.responses.length = 0;
    finish(response());
    const result = await running;
    expect(result.outcome).toBe("matched");
    expect(transport.mock.calls[1][0]).toMatchObject({
      serverUrl: "https://candidate.example.com/v2",
      path: "/items",
    });
  });

  it("never reports equality when structural comparison is incomplete", async () => {
    const body = '{"a":'.repeat(65) + "0" + "}".repeat(65);
    const definition = plan();
    definition.checkContract = false;
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(response({ body }))
      .mockResolvedValueOnce(response({ body: " " + body }));
    const result = await runApiParity(definition, [endpoint()], {
      mode: "live",
      signal: signal(),
      transport,
    });
    expect(result.results[0]).toMatchObject({
      outcome: "inconclusive",
      limited: true,
      differences: [],
    });
    expect(result.outcome).toBe("failed");
  });
  it("bounds retained difference paths without hiding a known mismatch", async () => {
    const name = "a".repeat(3000);
    const definition = plan();
    definition.checkContract = false;
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValueOnce(response({ body: JSON.stringify({ [name]: 1 }) }))
      .mockResolvedValueOnce(response({ body: JSON.stringify({ [name]: 2 }) }));
    const result = await runApiParity(definition, [endpoint()], {
      mode: "live",
      signal: signal(),
      transport,
    });
    expect(result.results[0]).toMatchObject({
      outcome: "different",
      limited: true,
      differences: [],
    });
    expect(serializeParityReport(result)).not.toContain(name);
  });
  it.each([
    { status: "0" },
    { durationMs: -1 },
    { durationMs: Infinity },
    { headers: { invalid: 3 } },
  ])("rejects invalid response metadata: %j", async (patch) => {
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValue({ ...response(), ...patch } as ScenarioResponse);
    expect(
      (
        await runApiParity(plan(), [endpoint()], {
          mode: "live",
          signal: signal(),
          transport,
        })
      ).results[0].issue,
    ).toBe("invalid-response");
  });
  it("rejects oversized bodies and reports without throwing away earlier completed cases", async () => {
    const transport = vi
      .fn<ScenarioTransport>()
      .mockResolvedValue(response({ body: "x".repeat(1024 * 1024 + 1) }));
    expect(
      (
        await runApiParity(plan(), [endpoint()], {
          mode: "live",
          signal: signal(),
          transport,
        })
      ).results[0].issue,
    ).toBe("response-limit");
  });
});
