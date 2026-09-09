import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary } from "./openapi";
import { createSmokeTestExport } from "./smoke-test-export";

const endpoint: EndpointSummary = {
  method: "GET",
  path: "/users",
  operationId: "listUsers",
  deprecated: false,
  secured: false,
  securityRequirements: [],
  serverUrl: "https://do-not-embed.test",
  summary: "secret description",
  description: "",
  parameters: [],
  requestBodies: [],
  tags: [],
  responses: [
    {
      status: "200",
      description: "OK",
      contentTypes: ["application/json"],
      schema: {
        type: "object",
        exampleName: "",
        example: '{"secret":"do-not-embed"}',
        properties: ["id"],
        requiredProperties: ["id"],
      },
    },
  ],
};
type Report = {
  ok: boolean;
  error?: string;
  summary: Record<string, number>;
  results: {
    method: string;
    path: string;
    outcome: string;
    reason?: string;
    checks: { code: string; passed: boolean }[];
  }[];
};
async function runtime(endpoints = [endpoint], options = {}) {
  const build = createSmokeTestExport(endpoints, "People API", options);
  const loaded = await import(
    `data:text/javascript;base64,${Buffer.from(build.source).toString("base64")}#${Math.random()}`
  );
  return {
    build,
    run: loaded.runSmokeTests as (
      config: unknown,
      fetchImpl?: typeof fetch,
    ) => Promise<Report>,
  };
}
const goodFetch = () =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ id: 7 }));
const config = { baseUrl: "https://example.test/api" };

describe("CI smoke-test export", () => {
  it("selects only GET/HEAD operations, deduplicates, and filters deprecated routes", () => {
    const endpoints = [
      endpoint,
      endpoint,
      { ...endpoint, method: "post" },
      { ...endpoint, method: "HEAD", deprecated: true },
    ];
    const build = createSmokeTestExport(endpoints, "CON", {
      includeDeprecated: false,
    });
    expect(build.operations).toEqual([
      {
        key: "GET /users",
        method: "GET",
        path: "/users",
        requiredInputs: 0,
        secured: false,
      },
    ]);
    expect(build.excludedCount).toBe(3);
    expect(build.scriptFileName).toBe("rsswag-openapi-con-smoke-tests.mjs");
    expect(build.configFileName).toBe("rsswag-openapi-con-smoke-config.json");
    expect(createSmokeTestExport(endpoints, "").operations).toHaveLength(2);
    expect(createSmokeTestExport([], "").configFileName).toBe(
      "rsswag-openapi-schema-smoke-config.json",
    );
  });

  it("generates required placeholders without embedding examples, servers, or descriptions", () => {
    const build = createSmokeTestExport(
      [
        {
          ...endpoint,
          path: "/users/{id}/{__proto__}",
          secured: true,
          parameters: [
            {
              name: "q",
              location: "query",
              required: true,
              description: "",
              example: "private example",
            },
            {
              name: "optional",
              location: "query",
              required: false,
              description: "",
              example: "",
            },
            {
              name: "X-Tenant",
              location: "header",
              required: true,
              description: "",
              example: "",
            },
          ],
        },
      ],
      "API",
    );
    const settings = JSON.parse(build.config).operations[
      "GET /users/{id}/{__proto__}"
    ];
    expect(settings.parameters.path).toEqual(
      JSON.parse('{"id":"","__proto__":""}'),
    );
    expect(settings.parameters.query).toEqual({ q: "" });
    expect(build.operations[0].requiredInputs).toBe(4);
    expect(build.source + build.config).not.toMatch(
      /private example|secret description|do-not-embed/,
    );
  });

  it("runs generated JavaScript and checks successful documented JSON responses", async () => {
    const { run } = await runtime();
    const fetchMock = goodFetch();
    const report = await run(config, fetchMock);
    expect(report.ok).toBe(true);
    expect(report.summary).toEqual({
      total: 1,
      passed: 1,
      failed: 0,
      blocked: 0,
      skipped: 0,
    });
    expect(report.results[0].checks).toEqual([
      { code: "successful-status", passed: true },
      { code: "documented-status", passed: true },
      { code: "documented-content-type", passed: true },
      { code: "valid-json", passed: true },
      { code: "json-top-level-type", passed: true },
      { code: "json-required-properties", passed: true },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://example.test/api/users",
    );
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("encodes parameters and inherits shared headers for empty required placeholders", async () => {
    const { run } = await runtime([
      {
        ...endpoint,
        path: "/users/{id}",
        parameters: [
          {
            name: "X-Tenant",
            location: "header",
            required: true,
            description: "",
            example: "",
          },
          {
            name: "session",
            location: "cookie",
            required: true,
            description: "",
            example: "",
          },
        ],
      },
    ]);
    const fetchMock = goodFetch();
    const report = await run(
      {
        ...config,
        headers: {
          "x-tenant": "private-tenant",
          authorization: "Bearer private-token",
        },
        operations: {
          "GET /users/{id}": {
            parameters: {
              path: { id: "a/b?c" },
              query: { q: "a&b" },
              header: { "X-Tenant": "" },
              cookie: { session: "x;y" },
            },
          },
        },
      },
      fetchMock,
    );
    expect(report.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://example.test/api/users/a%2Fb%3Fc?q=a%26b",
    );
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("x-tenant")).toBe("private-tenant");
    expect(headers.get("cookie")).toBe("session=x%3By");
    expect(JSON.stringify(report)).not.toMatch(
      /private|a%2F|x%3B|authorization/,
    );
  });

  it.each([
    null,
    { baseUrl: "ftp://example.test" },
    { baseUrl: "https://user:pass@example.test" },
    { baseUrl: "https://example.test?q=x" },
    { ...config, timeoutMs: 99 },
    { ...config, timeoutMs: 1.5 },
    { ...config, headers: { x: 1 } },
    { ...config, operations: { typo: {} } },
  ])("rejects invalid config before making requests: %j", async (settings) => {
    const { run } = await runtime();
    const fetchMock = goodFetch();
    expect(await run(settings, fetchMock)).toMatchObject({
      ok: false,
      error: "invalid-config",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks missing inputs and unsafe paths before issuing a request", async () => {
    const fetchMock = goodFetch();
    for (const path of [
      "/users/{id}",
      "/../private",
      "/%2e%2e/private",
      "/users?x=1",
      "/users\\private",
    ]) {
      const { run } = await runtime([{ ...endpoint, path }]);
      const report = await run(config, fetchMock);
      expect(report.summary.blocked).toBe(1);
    }
    const { run } = await runtime([
      {
        ...endpoint,
        parameters: [
          {
            name: "q",
            location: "query",
            required: true,
            description: "",
            example: "",
          },
        ],
      },
    ]);
    expect((await run(config, fetchMock)).results[0].reason).toBe(
      "missing-required-parameter",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not report empty or fully skipped suites as successful", async () => {
    const { run } = await runtime();
    const fetchMock = goodFetch();
    const report = await run(
      { ...config, operations: { "GET /users": { enabled: false } } },
      fetchMock,
    );
    expect(report.summary.skipped).toBe(1);
    expect(report.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await (await runtime([])).run(config, fetchMock)).ok).toBe(false);
  });

  it("fails documented errors and redirects without following them", async () => {
    const { run } = await runtime([
      {
        ...endpoint,
        responses: [{ ...endpoint.responses[0], status: "default" }],
      },
    ]);
    for (const status of [302, 401, 500]) {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ id: 1 }, { status }));
      const report = await run(config, fetchMock);
      expect(report.ok).toBe(false);
      expect(report.results[0].checks[0]).toEqual({
        code: "successful-status",
        passed: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("uses exact status before ranges and default, and exact media types before wildcards", async () => {
    const { run } = await runtime([
      {
        ...endpoint,
        responses: [
          {
            ...endpoint.responses[0],
            status: "default",
            contentTypes: ["text/plain"],
          },
          {
            ...endpoint.responses[0],
            status: "2XX",
            contentTypes: ["text/plain"],
          },
          {
            ...endpoint.responses[0],
            contentTypes: ["*/*", "application/json"],
            schemasByContentType: {
              "*/*": { ...endpoint.responses[0].schema!, type: "string" },
              "application/json": endpoint.responses[0].schema!,
            },
          },
        ],
      },
    ]);
    expect((await run(config, goodFetch())).ok).toBe(true);
    for (const status of ["2XX", "default"]) {
      const generated = await runtime([
        {
          ...endpoint,
          responses: [
            {
              ...endpoint.responses[0],
              status,
              contentTypes: ["application/*"],
            },
          ],
        },
      ]);
      expect((await generated.run(config, goodFetch())).ok).toBe(true);
    }
    const missing = await runtime([{ ...endpoint, responses: [] }]);
    expect((await missing.run(config, goodFetch())).ok).toBe(false);
  });

  it.each([
    ["bad JSON", "application/json", "valid-json"],
    ['{"name":"Ada"}', "application/json", "json-required-properties"],
    ["[]", "application/json", "json-top-level-type"],
    ['{"id":1}', "text/plain", "documented-content-type"],
  ])("fails invalid contract data %s", async (body, contentType, code) => {
    const { run } = await runtime();
    const report = await run(
      config,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(body, { headers: { "content-type": contentType } }),
        ),
    );
    expect(report.ok).toBe(false);
    expect(report.results[0].checks).toContainEqual({ code, passed: false });
  });

  it("can disable JSON shape checks and skips body checks for HEAD/204/205", async () => {
    const { run } = await runtime([endpoint], { checkJson: false });
    expect(
      (
        await run(
          config,
          vi.fn<typeof fetch>().mockResolvedValue(
            new Response("invalid", {
              headers: { "content-type": "application/json" },
            }),
          ),
        )
      ).ok,
    ).toBe(true);
    for (const [method, status] of [
      ["HEAD", 200],
      ["GET", 204],
      ["GET", 205],
    ] as const) {
      const generated = await runtime([
        {
          ...endpoint,
          method,
          responses: [{ ...endpoint.responses[0], status: String(status) }],
        },
      ]);
      const report = await generated.run(
        config,
        vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })),
      );
      expect(report.ok).toBe(true);
      expect(report.results[0].checks).toHaveLength(2);
    }
  });

  it("enforces timing budgets, timeouts, and body limits with value-free errors", async () => {
    const { run } = await runtime([endpoint], { maxDurationMs: 1 });
    const delayed = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return Response.json({ id: 1 });
    });
    expect((await run(config, delayed)).results[0].checks).toContainEqual({
      code: "response-time",
      passed: false,
    });
    const timedOut = await run(
      { ...config, timeoutMs: 100 },
      vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {})),
    );
    expect(timedOut.results[0].reason).toBe("request-timeout");
    const huge = await run(
      config,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("x".repeat(1024 * 1024 + 1))),
    );
    expect(huge.results[0].reason).toBe("body-too-large");
    const failed = await run(
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("secret URL/token")),
    );
    expect(failed.results[0].reason).toBe("request-failed");
    expect(JSON.stringify(failed)).not.toContain("secret");
  });

  it("executes sequentially and continues after failed or blocked operations", async () => {
    const { run } = await runtime([
      endpoint,
      { ...endpoint, path: "/blocked/{id}" },
      { ...endpoint, path: "/next" },
    ]);
    let active = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      expect(active++).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return Response.json({ id: 1 });
    });
    const report = await run(config, fetchMock);
    expect(report.summary).toEqual({
      total: 3,
      passed: 2,
      failed: 0,
      blocked: 1,
      skipped: 0,
    });
    expect(report.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("escapes generated literals and normalizes numeric settings", async () => {
    const build = createSmokeTestExport(
      [{ ...endpoint, path: '/</script>/"\u2028' }],
      "../A/B",
      { timeoutMs: Infinity, maxDurationMs: -1 },
    );
    expect(build.source).not.toContain("</script>");
    expect(build.source).toContain('"timeoutMs": 10000');
    expect(build.source).toContain('"maxDurationMs": 1');
    expect(
      createSmokeTestExport([], "API", {
        timeoutMs: 999999,
        maxDurationMs: NaN,
      }).source,
    ).toContain('"timeoutMs": 120000');
    await runtime([{ ...endpoint, path: '/</script>/"\u2028' }]);
  });

  it("runs the exported CLI against a local server with environment overrides and exit codes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rsswag-smoke-"));
    const scriptPath = join(directory, "runner.mjs");
    const configPath = join(directory, "config.json");
    const server = createServer((request, response) => {
      response.writeHead(
        request.headers.authorization === "Bearer runtime" ? 200 : 401,
        { "content-type": "application/json" },
      );
      response.end('{"id":1,"private":"never export"}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing local address");
      const build = createSmokeTestExport([endpoint], "API");
      await writeFile(scriptPath, build.source);
      await writeFile(
        configPath,
        JSON.stringify({ headers: { Authorization: "Bearer old" } }),
      );
      const env = {
        ...process.env,
        RSSWAG_SMOKE_CONFIG: configPath,
        RSSWAG_BASE_URL: `http://127.0.0.1:${address.port}`,
        RSSWAG_HEADERS_JSON: '{"authorization":"Bearer runtime"}',
      };
      const result = await promisify(execFile)(process.execPath, [scriptPath], {
        env,
      });
      expect(JSON.parse(result.stdout).ok).toBe(true);
      expect(result.stdout).not.toMatch(/runtime|never export|Bearer/);
      await expect(
        promisify(execFile)(process.execPath, [scriptPath], {
          env: { ...env, RSSWAG_BASE_URL: "invalid" },
        }),
      ).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining('"invalid-config"'),
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await unlink(scriptPath).catch(() => {});
      await unlink(configPath).catch(() => {});
      await rmdir(directory);
    }
  });
});
