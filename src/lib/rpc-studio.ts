import {
  MAX_RPC_BATCH,
  MAX_RPC_FRAME_BYTES,
  MAX_RPC_PROJECT_BYTES,
  RpcError,
  equalRpcValue,
  rpcFault,
  rpcJson,
  rpcObject,
  rpcOwn,
  rpcText,
  rpcUrl,
  type JsonValue,
} from "./rpc-json";
import { readRpcContract } from "./rpc-contract";
import {
  inspectRpcExchange,
  isRpcRequest,
  type RpcInspection,
} from "./rpc-wire";
import { getByteSize } from "./text-encoding";

export type RpcMock = {
  method: string;
  kind: "result" | "error";
  value: string;
};
export type RpcCase = {
  id: string;
  name: string;
  mode: "mock" | "fixture";
  request: string;
  response: string;
  httpStatus: number;
  expect: "valid" | "invalid" | "error" | "notification";
  errorCode: number | null;
  requireContract: boolean;
  expectedResults: string;
};
export type RpcProject = {
  kind: "rsswag-json-rpc-project";
  version: 1;
  name: string;
  contract: string;
  endpoint: string;
  timeoutMs: number;
  request: string;
  response: string;
  responseStatus: number;
  mocks: RpcMock[];
  cases: RpcCase[];
};
export const MAX_RPC_CASES = 30;
export const MAX_RPC_MOCKS = 50;
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export function normalizeRpcMock(v: unknown): RpcMock {
  if (
    !rpcObject(v) ||
    !rpcText(v.method, 256) ||
    !v.method ||
    (v.kind !== "result" && v.kind !== "error") ||
    !rpcText(v.value, MAX_RPC_FRAME_BYTES)
  )
    throw new RpcError("project");
  const value = rpcJson(v.value);
  if (v.kind === "error" && !rpcFault(value)) throw new RpcError("project");
  return { method: v.method, kind: v.kind, value: v.value };
}
export function normalizeRpcCase(v: unknown): RpcCase {
  if (
    !rpcObject(v) ||
    !rpcText(v.id, 80) ||
    !/^[a-z0-9_-]+$/i.test(v.id) ||
    !rpcText(v.name, 120) ||
    !v.name.trim() ||
    (v.mode !== "mock" && v.mode !== "fixture") ||
    !rpcText(v.request, MAX_RPC_FRAME_BYTES) ||
    !rpcText(v.response, MAX_RPC_FRAME_BYTES) ||
    !integer(v.httpStatus, 200, 599) ||
    (v.expect !== "valid" &&
      v.expect !== "invalid" &&
      v.expect !== "error" &&
      v.expect !== "notification") ||
    !(
      v.errorCode === null ||
      (typeof v.errorCode === "number" && Number.isSafeInteger(v.errorCode))
    ) ||
    typeof v.requireContract !== "boolean" ||
    !rpcText(v.expectedResults, 65536)
  )
    throw new RpcError("project");
  const expected = rpcJson(v.expectedResults, 65536);
  if (
    !rpcObject(expected) ||
    Object.keys(expected).some(
      (k) => !/^(0|[1-9]\d*)$/.test(k) || Number(k) >= MAX_RPC_BATCH,
    )
  )
    throw new RpcError("project");
  return {
    id: v.id,
    name: v.name,
    mode: v.mode,
    request: v.request,
    response: v.response,
    httpStatus: v.httpStatus,
    expect: v.expect,
    errorCode: v.errorCode,
    requireContract: v.requireContract,
    expectedResults: v.expectedResults,
  };
}
export function normalizeRpcProject(v: unknown): RpcProject {
  if (
    !rpcObject(v) ||
    v.kind !== "rsswag-json-rpc-project" ||
    v.version !== 1 ||
    !rpcText(v.name, 120) ||
    !v.name.trim() ||
    !rpcText(v.contract, 1024 * 1024) ||
    !rpcText(v.request, MAX_RPC_FRAME_BYTES) ||
    !rpcText(v.response, MAX_RPC_FRAME_BYTES) ||
    !integer(v.responseStatus, 200, 599) ||
    !integer(v.timeoutMs, 100, 30000) ||
    !Array.isArray(v.mocks) ||
    v.mocks.length > MAX_RPC_MOCKS ||
    !Array.isArray(v.cases) ||
    v.cases.length > MAX_RPC_CASES
  )
    throw new RpcError("project");
  readRpcContract(v.contract);
  const mocks = v.mocks.map(normalizeRpcMock),
    cases = v.cases.map(normalizeRpcCase);
  if (
    new Set(mocks.map((m) => m.method)).size !== mocks.length ||
    new Set(cases.map((c) => c.id)).size !== cases.length
  )
    throw new RpcError("project");
  const p: RpcProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    contract: v.contract,
    endpoint: rpcUrl(v.endpoint),
    timeoutMs: v.timeoutMs,
    request: v.request,
    response: v.response,
    responseStatus: v.responseStatus,
    mocks,
    cases,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_RPC_PROJECT_BYTES)
    throw new RpcError("limit");
  return p;
}
export function parseRpcProject(source: string): RpcProject {
  return normalizeRpcProject(rpcJson(source, MAX_RPC_PROJECT_BYTES));
}
export function serializeRpcProject(project: RpcProject): string {
  const p = normalizeRpcProject(project),
    pretty = JSON.stringify(p, null, 2);
  return getByteSize(pretty) <= MAX_RPC_PROJECT_BYTES
    ? pretty
    : JSON.stringify(p);
}
export function mockRpcResponse(
  source: string,
  definitions: RpcMock[],
): { body: string; status: number } {
  const mocks = definitions.map(normalizeRpcMock),
    map = new Map(mocks.map((m) => [m.method, m]));
  const fault = (code: number, message: string) => ({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
  let value: JsonValue;
  try {
    value = rpcJson(source);
  } catch (e) {
    if (e instanceof RpcError && e.code === "limit") throw e;
    return { body: JSON.stringify(fault(-32700, "Parse error")), status: 200 };
  }
  const batch = Array.isArray(value),
    list = Array.isArray(value) ? value : [value];
  if (!list.length)
    return {
      body: JSON.stringify(fault(-32600, "Invalid Request")),
      status: 200,
    };
  if (list.length > MAX_RPC_BATCH) throw new RpcError("limit");
  const replies: JsonValue[] = [];
  for (const item of list) {
    if (!isRpcRequest(item)) {
      replies.push(fault(-32600, "Invalid Request"));
      continue;
    }
    if (!rpcOwn(item, "id")) continue;
    const mock = map.get(item.method);
    replies.push(
      !mock
        ? {
            jsonrpc: "2.0",
            error: { code: -32601, message: "Method not found" },
            id: item.id!,
          }
        : { jsonrpc: "2.0", id: item.id!, [mock.kind]: rpcJson(mock.value) },
    );
  }
  if (!replies.length) return { body: "", status: 204 };
  const body = JSON.stringify(batch ? replies : replies[0], null, 2);
  if (getByteSize(body) > MAX_RPC_FRAME_BYTES) throw new RpcError("limit");
  return { body, status: 200 };
}
export type RpcCaseResult = {
  id: string;
  name: string;
  passed: boolean;
  protocolMatched: boolean;
  contractMatched: boolean;
  expectedMatched: boolean;
  assertions: { index: number; passed: boolean }[];
  inspection: RpcInspection | null;
  issue?: string;
  httpStatus: number;
};
export function runRpcCases(value: RpcProject, only?: string): RpcCaseResult[] {
  const p = normalizeRpcProject(value),
    contract = readRpcContract(p.contract);
  if (only && !p.cases.some((c) => c.id === only))
    throw new RpcError("project");
  return p.cases
    .filter((c) => !only || c.id === only)
    .map((c) => {
      try {
        const response =
          c.mode === "mock"
            ? mockRpcResponse(c.request, p.mocks)
            : { body: c.response, status: c.httpStatus };
        const inspection = inspectRpcExchange(
          contract,
          c.request,
          response.body,
          response.status,
        );
        const protocolMatched =
          c.expect === "invalid" ? !inspection.valid : inspection.valid;
        const expectedMatched =
          (c.expect !== "error" ||
            inspection.rows.some((r) => r.outcome === "error")) &&
          (c.expect !== "notification" ||
            inspection.notifications === inspection.requests) &&
          (c.errorCode === null ||
            inspection.rows.some((r) => r.errorCode === c.errorCode));
        const expected = rpcJson(c.expectedResults) as Record<
          string,
          JsonValue
        >;
        const assertions = Object.entries(expected).map(([key, value]) => {
          const row = inspection.rows[Number(key)];
          return {
            index: Number(key),
            passed:
              row?.outcome === "result" && equalRpcValue(row.result, value),
          };
        });
        const contractMatched = !c.requireContract || inspection.contractValid;
        return {
          id: c.id,
          name: c.name,
          passed:
            protocolMatched &&
            expectedMatched &&
            contractMatched &&
            assertions.every((a) => a.passed),
          protocolMatched,
          contractMatched,
          expectedMatched,
          assertions,
          inspection,
          httpStatus: response.status,
        };
      } catch (e) {
        const supportedNegative =
          e instanceof RpcError && (e.code === "request" || e.code === "json");
        const passed =
          supportedNegative &&
          c.expect === "invalid" &&
          !c.requireContract &&
          c.errorCode === null &&
          Object.keys(rpcJson(c.expectedResults) as object).length === 0;
        return {
          id: c.id,
          name: c.name,
          passed,
          protocolMatched: passed,
          contractMatched: !c.requireContract,
          expectedMatched: passed,
          assertions: [],
          inspection: null,
          issue: e instanceof RpcError ? e.code : "project",
          httpStatus: c.httpStatus,
        };
      }
    });
}
export function rpcCasesReport(results: RpcCaseResult[]): string {
  return JSON.stringify(
    {
      kind: "rsswag-json-rpc-report",
      version: 1,
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      cases: results.map((r) => ({
        id: r.id,
        name: r.name,
        passed: r.passed,
        protocolMatched: r.protocolMatched,
        contractMatched: r.contractMatched,
        expectedMatched: r.expectedMatched,
        assertions: r.assertions,
        httpStatus: r.httpStatus,
        ...(r.issue ? { issue: r.issue } : {}),
        ...(r.inspection
          ? {
              valid: r.inspection.valid,
              contractValid: r.inspection.contractValid,
              requests: r.inspection.requests,
              notifications: r.inspection.notifications,
              responses: r.inspection.responses,
              findings: r.inspection.findings,
              rows: r.inspection.rows.map((row) => ({
                index: row.index,
                method: row.method,
                outcome: row.outcome,
                errorCode: row.errorCode,
                input: {
                  status: row.input.status,
                  code: row.input.code,
                  issues: row.input.issues.map((i) => ({
                    code: i.code,
                    error: i.error,
                  })),
                },
                output: {
                  status: row.output.status,
                  issues: row.output.issues.map((i) => ({
                    code: i.code,
                    error: i.error,
                  })),
                },
              })),
            }
          : {}),
      })),
    },
    null,
    2,
  );
}
export const RPC_DEMO_CONTRACT = JSON.stringify(
  {
    openrpc: "1.4.0",
    info: { title: "Calculator RPC", version: "1.0.0" },
    servers: [{ url: "https://rpc.example/jsonrpc" }],
    components: { schemas: { Number: { type: "number" } } },
    methods: [
      {
        name: "math.add",
        summary: "Return the fixture sum for two numbers",
        paramStructure: "either",
        params: [
          {
            name: "a",
            required: true,
            schema: { $ref: "#/components/schemas/Number" },
          },
          {
            name: "b",
            required: true,
            schema: { $ref: "#/components/schemas/Number" },
          },
        ],
        result: { name: "sum", schema: { type: "number" } },
      },
      {
        name: "profile.get",
        params: [
          {
            name: "id",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        result: {
          name: "profile",
          schema: {
            type: "object",
            required: ["id", "name"],
            properties: { id: { type: "integer" }, name: { type: "string" } },
          },
        },
      },
      {
        name: "events.log",
        params: [
          { name: "message", required: true, schema: { type: "string" } },
        ],
      },
      {
        name: "account.fail",
        params: [],
        result: { name: "result", schema: true },
        errors: [{ code: 1001, message: "Fixture rejection" }],
      },
    ],
  },
  null,
  2,
);
export const defaultRpcCase = (id = "case-1"): RpcCase => ({
  id,
  name: id,
  mode: "mock",
  request: '{"jsonrpc":"2.0","method":"math.add","params":[1,2],"id":1}',
  response: "",
  httpStatus: 200,
  expect: "valid",
  errorCode: null,
  requireContract: true,
  expectedResults: '{"0":3}',
});
export const emptyRpcProject = (): RpcProject => ({
  kind: "rsswag-json-rpc-project",
  version: 1,
  name: "JSON-RPC project",
  contract: RPC_DEMO_CONTRACT,
  endpoint: "https://rpc.example/jsonrpc",
  timeoutMs: 10000,
  request: defaultRpcCase().request,
  response: "",
  responseStatus: 200,
  mocks: [
    { method: "math.add", kind: "result", value: "3" },
    { method: "profile.get", kind: "result", value: '{"id":1,"name":"Ada"}' },
    {
      method: "account.fail",
      kind: "error",
      value: '{"code":1001,"message":"Fixture rejection"}',
    },
  ],
  cases: [],
});
export function demoRpcProject(): RpcProject {
  const p = emptyRpcProject();
  p.name = "JSON-RPC lifecycle examples";
  const base = defaultRpcCase();
  const batch = [
    { jsonrpc: "2.0", method: "math.add", params: { a: 1, b: 2 }, id: 1 },
    { jsonrpc: "2.0", method: "events.log", params: { message: "demo" } },
    { jsonrpc: "2.0", method: "profile.get", params: { id: 1 }, id: "1" },
  ];
  p.cases = [
    base,
    {
      ...base,
      id: "batch",
      name: "Out-of-order batch with notification",
      mode: "fixture",
      request: JSON.stringify(batch),
      response:
        '[{"jsonrpc":"2.0","id":"1","result":{"id":1,"name":"Ada"}},{"jsonrpc":"2.0","id":1,"result":3}]',
      expectedResults: '{"0":3,"2":{"id":1,"name":"Ada"}}',
    },
    {
      ...base,
      id: "notification",
      name: "Notification without a reply",
      request:
        '{"jsonrpc":"2.0","method":"events.log","params":{"message":"hello"}}',
      expect: "notification",
      expectedResults: "{}",
    },
    {
      ...base,
      id: "error",
      name: "Application RPC error",
      request: '{"jsonrpc":"2.0","method":"account.fail","id":"error-call"}',
      expect: "error",
      errorCode: 1001,
      expectedResults: "{}",
    },
    {
      ...base,
      id: "unknown",
      name: "Unknown method returns -32601",
      request: '{"jsonrpc":"2.0","method":"not.registered","id":0}',
      expect: "error",
      errorCode: -32601,
      requireContract: false,
      expectedResults: "{}",
    },
    {
      ...base,
      id: "duplicate-response",
      name: "Reject duplicate response IDs",
      mode: "fixture",
      request: '[{"jsonrpc":"2.0","method":"math.add","params":[1,2],"id":1}]',
      response:
        '[{"jsonrpc":"2.0","id":1,"result":3},{"jsonrpc":"2.0","id":1,"result":3}]',
      expect: "invalid",
      expectedResults: "{}",
    },
    {
      ...base,
      id: "typed-id",
      name: "Reject string/numeric ID confusion",
      mode: "fixture",
      response: '{"jsonrpc":"2.0","id":"1","result":3}',
      expect: "invalid",
      requireContract: false,
      expectedResults: "{}",
    },
  ];
  return normalizeRpcProject(p);
}
