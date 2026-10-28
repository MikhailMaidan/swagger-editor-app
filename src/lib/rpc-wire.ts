import {
  MAX_RPC_BATCH,
  RpcError,
  rpcFault,
  rpcId,
  rpcIdKey,
  rpcJson,
  rpcObject,
  rpcOwn,
  rpcText,
  type JsonValue,
  type RpcId,
} from "./rpc-json";
import {
  checkRpcSchema,
  type RpcContract,
  type RpcMethod,
  type RpcSchemaIssue,
} from "./rpc-contract";

export type RpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params?: JsonValue[] | Record<string, JsonValue>;
  id?: RpcId;
};
export type RpcWireIssue =
  | "request"
  | "duplicate-id"
  | "null-id"
  | "reserved-method"
  | "response-json"
  | "response-shape"
  | "response-envelope"
  | "duplicate-response"
  | "unknown-id"
  | "missing-response"
  | "notification-response"
  | "notification-http"
  | "http-status";
export type RpcFinding = { code: RpcWireIssue; index: number; error: boolean };
export function isRpcRequest(v: unknown): v is RpcRequest {
  return (
    rpcObject(v) &&
    v.jsonrpc === "2.0" &&
    rpcText(v.method, 256) &&
    (!rpcOwn(v, "params") || Array.isArray(v.params) || rpcObject(v.params)) &&
    (!rpcOwn(v, "id") || rpcId(v.id))
  );
}
export function readRpcRequests(source: string): {
  batch: boolean;
  requests: RpcRequest[];
  findings: RpcFinding[];
} {
  const value = rpcJson(source),
    batch = Array.isArray(value),
    list = batch ? value : [value];
  if (
    !list.length ||
    list.length > MAX_RPC_BATCH ||
    list.some((v) => !isRpcRequest(v))
  )
    throw new RpcError("request");
  const requests = list as RpcRequest[],
    ids = new Set<string>(),
    findings: RpcFinding[] = [];
  requests.forEach((r, index) => {
    if (rpcOwn(r, "id")) {
      const key = rpcIdKey(r.id!);
      if (ids.has(key)) throw new RpcError("request");
      ids.add(key);
      if (r.id === null)
        findings.push({ code: "null-id", index, error: false });
    }
    if (r.method.startsWith("rpc.") && r.method !== "rpc.discover")
      findings.push({ code: "reserved-method", index, error: false });
  });
  return { batch, requests, findings };
}
export function buildRpcRequest(
  method: string,
  params: string,
  id: string,
  notification: boolean,
): string {
  const request: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (params.trim()) request.params = rpcJson(params);
  if (!notification) request.id = rpcJson(id);
  const source = JSON.stringify(request, null, 2);
  readRpcRequests(source);
  return source;
}
export function appendRpcRequest(source: string, call: string): string {
  const next = [
    ...readRpcRequests(source).requests,
    ...readRpcRequests(call).requests,
  ];
  const result = JSON.stringify(next, null, 2);
  readRpcRequests(result);
  return result;
}
export type RpcContractCheck = {
  status: "valid" | "invalid" | "partial" | "unknown";
  issues: RpcSchemaIssue[];
  code?:
    | "unknown-method"
    | "params-structure"
    | "params-count"
    | "params-required"
    | "params-extra"
    | "notification-only";
};
function inputCheck(
  contract: RpcContract,
  method: RpcMethod | undefined,
  request: RpcRequest,
  budget: { steps: number },
): RpcContractCheck {
  if (!method) return { status: "unknown", issues: [], code: "unknown-method" };
  if (!method.result && rpcOwn(request, "id"))
    return { status: "invalid", issues: [], code: "notification-only" };
  const positional = Array.isArray(request.params),
    supplied = request.params ?? {};
  if (
    request.params !== undefined &&
    ((method.structure === "by-name" && positional) ||
      (method.structure === "by-position" && !positional))
  )
    return { status: "invalid", issues: [], code: "params-structure" };
  if (
    positional &&
    (request.params as JsonValue[]).length > method.params.length
  )
    return { status: "invalid", issues: [], code: "params-count" };
  if (
    !positional &&
    Object.keys(supplied).some((k) => !method.params.some((p) => p.name === k))
  )
    return { status: "invalid", issues: [], code: "params-extra" };
  const issues: RpcSchemaIssue[] = [];
  for (let index = 0; index < method.params.length; index++) {
    const p = method.params[index],
      key = positional ? String(index) : p.name;
    if (!rpcOwn(supplied, key)) {
      if (p.required)
        return { status: "invalid", issues, code: "params-required" };
    } else
      issues.push(
        ...checkRpcSchema(
          contract.root,
          p.schema,
          (supplied as Record<string, JsonValue>)[key],
          budget,
        ).map((issue) => ({
          ...issue,
          path: `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}${issue.path}`,
        })),
      );
  }
  return {
    status: issues.some((i) => i.error)
      ? "invalid"
      : issues.length
        ? "partial"
        : "valid",
    issues: issues.slice(0, 50),
  };
}
export type RpcResponseRow = {
  index: number;
  method: string;
  id?: RpcId;
  outcome: "result" | "error" | "notification" | "missing";
  errorCode?: number;
  result?: JsonValue;
  input: RpcContractCheck;
  output: RpcContractCheck;
};
export type RpcInspection = {
  valid: boolean;
  contractValid: boolean;
  batch: boolean;
  requests: number;
  notifications: number;
  responses: number;
  findings: RpcFinding[];
  rows: RpcResponseRow[];
};
export function inspectRpcExchange(
  contract: RpcContract,
  requestSource: string,
  responseSource: string,
  httpStatus = 200,
): RpcInspection {
  const frame = readRpcRequests(requestSource),
    findings = [...frame.findings],
    budget = { steps: 0 };
  const calls = frame.requests.filter((r) => rpcOwn(r, "id"));
  const byId = new Map(calls.map((r) => [rpcIdKey(r.id!), r]));
  const received = new Map<string, Record<string, unknown>>();
  let responses: unknown[] = [];
  if (!calls.length) {
    if (responseSource.length)
      findings.push({ code: "notification-response", index: -1, error: true });
    if (httpStatus < 200 || httpStatus >= 300)
      findings.push({ code: "notification-http", index: -1, error: true });
  } else if (!responseSource.trim())
    findings.push({ code: "missing-response", index: -1, error: true });
  else {
    let value: JsonValue | undefined;
    try {
      value = rpcJson(responseSource);
    } catch (e) {
      if (e instanceof RpcError && e.code === "limit") throw e;
      findings.push({ code: "response-json", index: -1, error: true });
    }
    if (value !== undefined) {
      if (
        Array.isArray(value) !== frame.batch ||
        (Array.isArray(value) &&
          (!value.length || value.length > MAX_RPC_BATCH))
      )
        findings.push({ code: "response-shape", index: -1, error: true });
      responses = Array.isArray(value) ? value : [value];
      responses.slice(0, MAX_RPC_BATCH).forEach((response, index) => {
        if (
          !rpcObject(response) ||
          response.jsonrpc !== "2.0" ||
          !rpcOwn(response, "id") ||
          !rpcId(response.id) ||
          rpcOwn(response, "result") === rpcOwn(response, "error") ||
          (rpcOwn(response, "error") && !rpcFault(response.error))
        ) {
          findings.push({ code: "response-envelope", index, error: true });
          return;
        }
        const key = rpcIdKey(response.id);
        if (!byId.has(key)) {
          findings.push({ code: "unknown-id", index, error: true });
          return;
        }
        if (received.has(key)) {
          findings.push({ code: "duplicate-response", index, error: true });
          return;
        }
        received.set(key, response);
      });
    }
  }
  if (httpStatus < 200 || httpStatus >= 300)
    findings.push({ code: "http-status", index: -1, error: false });
  const rows = frame.requests.map((request, index): RpcResponseRow => {
    const method = contract.methods.find((m) => m.name === request.method),
      input = inputCheck(contract, method, request, budget);
    if (!rpcOwn(request, "id"))
      return {
        index,
        method: request.method,
        outcome: "notification",
        input,
        output: { status: "unknown", issues: [] },
      };
    const response = received.get(rpcIdKey(request.id!));
    if (!response) {
      findings.push({ code: "missing-response", index, error: true });
      return {
        index,
        method: request.method,
        id: request.id,
        outcome: "missing",
        input,
        output: { status: "unknown", issues: [] },
      };
    }
    if (rpcOwn(response, "error"))
      return {
        index,
        method: request.method,
        id: request.id,
        outcome: "error",
        errorCode: (response.error as { code: number }).code,
        input,
        output: { status: "unknown", issues: [] },
      };
    const issues = method?.result
      ? checkRpcSchema(
          contract.root,
          method.result.schema,
          response.result,
          budget,
        )
      : [];
    return {
      index,
      method: request.method,
      id: request.id,
      outcome: "result",
      result: response.result as JsonValue,
      input,
      output: {
        status: !method?.result
          ? "unknown"
          : issues.some((i) => i.error)
            ? "invalid"
            : issues.length
              ? "partial"
              : "valid",
        issues,
      },
    };
  });
  return {
    valid: !findings.some((f) => f.error),
    contractValid: rows.every(
      (r) =>
        r.input.status === "valid" &&
        (r.outcome === "notification" ||
          r.outcome === "error" ||
          (r.outcome === "result" && r.output.status === "valid")),
    ),
    batch: frame.batch,
    requests: frame.requests.length,
    notifications: frame.requests.length - calls.length,
    responses: responses.length,
    findings,
    rows,
  };
}
