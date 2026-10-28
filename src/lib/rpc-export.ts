import {
  MAX_RPC_BATCH,
  MAX_RPC_FRAME_BYTES,
  RpcError,
  rpcUrl,
} from "./rpc-json";
import { normalizeRpcMock, type RpcMock } from "./rpc-studio";
import { readRpcRequests } from "./rpc-wire";

export function rpcCurl(url: string, request: string): string {
  readRpcRequests(request);
  const quote = (v: string) => "'" + v.replace(/'/g, "'\\''") + "'";
  return (
    [
      "curl --request POST",
      quote(rpcUrl(url)),
      "--header 'Content-Type: application/json'",
      "--header 'Accept: application/json'",
      `--data-binary ${quote(request)}`,
    ].join(" \\\n  ") + "\n"
  );
}

export function generateRpcMockHandler(input: RpcMock[]): string {
  if (input.length > 50) throw new RpcError("limit");
  const mocks = input.map(normalizeRpcMock);
  if (new Set(mocks.map((m) => m.method)).size !== mocks.length)
    throw new RpcError("project");
  const definitions = mocks.map((m) => ({
    method: m.method,
    kind: m.kind,
    value: JSON.parse(m.value),
  }));
  return `// RSSwag JSON-RPC 2.0 static-fixture mock. No runtime dependencies.
// Mount createJsonRpcMockHandler() as a Fetch-compatible POST handler.
// Application values are fixtures, not executable method implementations.
const definitions = ${JSON.stringify(definitions, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")};
const fixtures = new Map(definitions.map(value => [value.method, value]));
const own = (value, name) => Object.hasOwn(value, name);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validId = value => value === null || (typeof value === "string" && new TextEncoder().encode(value).length <= 256) || (typeof value === "number" && Number.isSafeInteger(value));
const requestObject = value => object(value) && value.jsonrpc === "2.0" && typeof value.method === "string" && new TextEncoder().encode(value.method).length <= 256 && (!own(value, "params") || Array.isArray(value.params) || object(value.params)) && (!own(value, "id") || validId(value.id));
const failure = (code, message, id = null) => ({ jsonrpc: "2.0", error: { code, message }, id });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
function parseFrame(text) {
  const value = JSON.parse(text.replace(/^\\uFEFF/, ""));
  let nodes = 0;
  function visit(v, depth) {
    if (++nodes > 50000 || depth > 64 || (typeof v === "number" && (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v))))) throw new Error("Unsupported JSON");
    if (v !== null && typeof v === "object") for (const child of Object.values(v)) visit(child, depth + 1);
  }
  visit(value, 0); return value;
}
function reply(value) {
  if (!requestObject(value)) return failure(-32600, "Invalid Request");
  if (!own(value, "id")) return null;
  const fixture = fixtures.get(value.method);
  return fixture ? { jsonrpc: "2.0", id: value.id, [fixture.kind]: fixture.value } : failure(-32601, "Method not found", value.id);
}
export function createJsonRpcMockHandler(options = {}) {
  const maxBytes = options.maxBytes ?? ${MAX_RPC_FRAME_BYTES};
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > ${MAX_RPC_FRAME_BYTES} || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new TypeError("Invalid mock limits");
  return async function jsonRpcMock(request) {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const started = performance.now();
    const timer = setTimeout(abort, timeoutMs);
    let reader;
    async function boundedRead() {
      if (performance.now() - started >= timeoutMs) controller.abort();
      if (controller.signal.aborted) throw new Error("aborted");
      let listener;
      try {
        return await Promise.race([reader.read(), new Promise((_, reject) => {
          listener = () => reject(new Error("aborted"));
          controller.signal.addEventListener("abort", listener, { once: true });
          if (controller.signal.aborted) listener();
        })]);
      } finally { if (listener) controller.signal.removeEventListener("abort", listener); }
    }
    try {
      if (controller.signal.aborted) return new Response(null, { status: 408 });
      let bytes = 0, text = "";
      const decoder = new TextDecoder("utf-8", { fatal: true });
      if (request.body) {
        reader = request.body.getReader();
        while (true) {
          const chunk = await boundedRead();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) return json(failure(-32600, "Request limit exceeded"), 413);
          text += decoder.decode(chunk.value, { stream: true });
        }
      }
      text += decoder.decode();
      let value;
      try { value = parseFrame(text); } catch { return json(failure(-32700, "Parse error")); }
      if (Array.isArray(value) && value.length > ${MAX_RPC_BATCH}) return json(failure(-32600, "Batch limit exceeded"), 413);
      if (Array.isArray(value) && value.length === 0) return json(failure(-32600, "Invalid Request"));
      const result = Array.isArray(value) ? value.map(reply).filter(v => v !== null) : reply(value);
      if (result === null || (Array.isArray(result) && result.length === 0)) return new Response(null, { status: 204 });
      const serialized = JSON.stringify(result);
      if (new TextEncoder().encode(serialized).length > ${MAX_RPC_FRAME_BYTES}) return json(failure(-32603, "Response limit exceeded"), 500);
      return new Response(serialized, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } catch {
      return controller.signal.aborted ? new Response(null, { status: 408 }) : json(failure(-32700, "Parse error"));
    } finally {
      clearTimeout(timer); request.signal.removeEventListener("abort", abort);
      if (reader) { try { void reader.cancel().catch(() => {}); } catch {} try { reader.releaseLock(); } catch {} }
    }
  };
}
export default { fetch: createJsonRpcMockHandler() };
`;
}
