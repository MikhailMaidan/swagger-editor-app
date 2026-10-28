import { describe, expect, it } from "vitest";
import { generateRpcMockHandler, rpcCurl } from "./rpc-export";
import {
  emptyRpcProject,
  defaultRpcCase,
  mockRpcResponse,
  normalizeRpcProject,
  parseRpcProject,
  rpcCasesReport,
  runRpcCases,
  demoRpcProject,
  serializeRpcProject,
} from "./rpc-studio";
import { MAX_RPC_PROJECT_BYTES, MAX_RPC_FRAME_BYTES } from "./rpc-json";
import { getByteSize } from "./text-encoding";
type Handler = (request: Request) => Promise<Response>;
async function generated() {
  const source = generateRpcMockHandler(emptyRpcProject().mocks);
  return import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  ) as Promise<{
    createJsonRpcMockHandler: (options?: {
      maxBytes?: number;
      timeoutMs?: number;
    }) => Handler;
    default: { fetch: Handler };
  }>;
}
const post = (body: string, signal?: AbortSignal) =>
  new Request("https://mock.example/rpc", { method: "POST", body, signal });
describe("standalone JSON-RPC static mock artifact", () => {
  it("quotes POSIX cURL payloads as literal data and validates the destination and frame", () => {
    const frame = JSON.stringify({
      jsonrpc: "2.0",
      method: "literal",
      params: ["it's $(private) `data`"],
      id: 1,
    });
    const source = rpcCurl("https://rpc.example/path?name=it's", frame);
    expect(source).toContain("curl --request POST");
    expect(source).toContain("it'\\''s $(private) `data`");
    expect(source).not.toContain("Authorization");
    expect(() => rpcCurl("file:///etc/passwd", frame)).toThrow("url");
    expect(() => rpcCurl("https://rpc.example", "[]")).toThrow("request");
  });
  it.each([
    '{"jsonrpc":"2.0","method":"math.add","params":[1,2],"id":1}',
    '[{"jsonrpc":"2.0","method":"math.add","id":1},{"jsonrpc":"2.0","method":"profile.get","id":"1"},{"jsonrpc":"2.0","method":"events.log"}]',
    '{"jsonrpc":"2.0","method":"account.fail","id":null}',
    '{"jsonrpc":"2.0","method":"unknown","id":0}',
    "{",
    "[]",
    "[1]",
    "null",
  ])(
    "executes actual ESM and agrees with offline wire mocks for %s",
    async (source) => {
      const { default: module } = await generated(),
        response = await module.fetch(post(source)),
        expected = mockRpcResponse(source, emptyRpcProject().mocks);
      expect(response.status).toBe(expected.status);
      expect(JSON.parse(await response.text())).toEqual(
        JSON.parse(expected.body),
      );
    },
  );
  it("returns no JSON response for single or batched notifications, including unknown methods", async () => {
    const { default: module } = await generated();
    for (const source of [
      '{"jsonrpc":"2.0","method":"unknown"}',
      '[{"jsonrpc":"2.0","method":"events.log"}]',
    ]) {
      const r = await module.fetch(post(source));
      expect(r.status).toBe(204);
      expect(await r.text()).toBe("");
    }
  });
  it("keeps zero/null results and malicious-looking method names as ordinary fixture data", async () => {
    const source = generateRpcMockHandler([
      { method: "__proto__", kind: "result", value: "null" },
      {
        method: 'test;throw new Error("injected")',
        kind: "result",
        value: "0",
      },
    ]);
    const m = await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    const response = await m.default.fetch(
      post('{"jsonrpc":"2.0","method":"__proto__","id":0}'),
    );
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 0,
      result: null,
    });
  });
  it("bounds input, batch and output sizes and rejects non-POST requests", async () => {
    const { createJsonRpcMockHandler, default: module } = await generated();
    expect(
      (await createJsonRpcMockHandler({ maxBytes: 10 })(post("x".repeat(11))))
        .status,
    ).toBe(413);
    expect(
      (
        await module.fetch(
          post(
            JSON.stringify(
              Array.from({ length: 31 }, () => ({
                jsonrpc: "2.0",
                method: "m",
                id: 1,
              })),
            ),
          ),
        )
      ).status,
    ).toBe(413);
    const get = await module.fetch(new Request("https://mock.example"));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
  });
  it("times out stalled request bodies and accepts cancellation without hanging", async () => {
    const { createJsonRpcMockHandler } = await generated();
    const request = new Request("https://mock.example", {
      method: "POST",
      body: new ReadableStream<Uint8Array>(),
      duplex: "half",
    } as RequestInit);
    expect(
      (await createJsonRpcMockHandler({ timeoutMs: 100 })(request)).status,
    ).toBe(408);
    const abort = new AbortController();
    abort.abort();
    expect(
      (await createJsonRpcMockHandler()(post("{}", abort.signal))).status,
    ).toBe(408);
  });
});
describe("JSON-RPC project portability and reports", () => {
  it("round-trips contract source and fixtures while ignoring imported results and session headers", () => {
    const p = demoRpcProject(),
      source = serializeRpcProject(
        normalizeRpcProject({
          ...p,
          headers: { authorization: "secret" },
          results: { passed: true },
        }),
      );
    expect(source).not.toContain("secret");
    expect(source).not.toContain('"results"');
    expect(parseRpcProject(source)).toEqual(p);
    expect(parseRpcProject(source).contract).toBe(p.contract);
  });
  it("rejects coerced variants, invalid expectations and duplicate fixture/case identities", () => {
    const p = demoRpcProject();
    expect(() =>
      normalizeRpcProject({
        ...p,
        mocks: [{ ...p.mocks[0], kind: ["result"] }],
      }),
    ).toThrow("project");
    expect(() =>
      normalizeRpcProject({ ...p, mocks: [p.mocks[0], p.mocks[0]] }),
    ).toThrow("project");
    expect(() =>
      normalizeRpcProject({ ...p, cases: [p.cases[0], p.cases[0]] }),
    ).toThrow("project");
    expect(() =>
      normalizeRpcProject({
        ...p,
        cases: [{ ...p.cases[0], expectedResults: '{"30":1}' }],
      }),
    ).toThrow("project");
    expect(() =>
      parseRpcProject(" ".repeat(MAX_RPC_PROJECT_BYTES + 1)),
    ).toThrow("limit");
  });
  it("round-trips projects near the byte limit using compact output and rejects over-limit growth", () => {
    const p = emptyRpcProject();
    p.cases = Array.from({ length: 8 }, (_, i) => ({
      ...defaultRpcCase(`case-${i}`),
      response: i < 7 ? "x".repeat(MAX_RPC_FRAME_BYTES) : "",
    }));
    p.cases[7].response = "x".repeat(
      MAX_RPC_PROJECT_BYTES - 64 - getByteSize(JSON.stringify(p)),
    );
    const source = serializeRpcProject(p);
    expect(getByteSize(source)).toBe(MAX_RPC_PROJECT_BYTES - 64);
    expect(source).toBe(JSON.stringify(p));
    expect(parseRpcProject(source)).toEqual(p);
    expect(() => normalizeRpcProject({ ...p, name: "x".repeat(120) })).toThrow(
      "limit",
    );
    expect(p.name).toBe("JSON-RPC project");
  });
  it("exports decisions without URLs, RPC IDs, parameters, bodies, expectations or error messages", () => {
    const p = demoRpcProject();
    p.cases[0].request =
      '{"jsonrpc":"2.0","method":"math.add","params":[777,888],"id":"private-rpc-id"}';
    p.cases[0].requireContract = false;
    p.mocks[0].value = '{"private-result-key":"private-result-value"}';
    const report = rpcCasesReport(runRpcCases(p));
    for (const literal of [
      "private-rpc-id",
      "private-result-key",
      "private-result-value",
      "Fixture rejection",
      "rpc.example",
      "777",
      "888",
    ])
      expect(report).not.toContain(literal);
    expect(JSON.parse(report).cases[0].rows[0].outcome).toBe("result");
  });
});
