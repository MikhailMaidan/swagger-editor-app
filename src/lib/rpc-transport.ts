import {
  MAX_RPC_FRAME_BYTES,
  RpcError,
  rpcJson,
  rpcObject,
  rpcText,
  rpcUrl,
} from "./rpc-json";
import { readRpcRequests } from "./rpc-wire";

export type RpcExchange = {
  request: string;
  body: string;
  status: number;
  durationMs: number;
  bytes: number;
  contentType: string;
  mode: "live" | "mock" | "manual";
};
export function rpcHttpHeaders(source = "{}"): Headers {
  const value = rpcJson(source, 16384);
  if (!rpcObject(value) || Object.keys(value).length > 40)
    throw new RpcError("headers");
  const names = new Set<string>(),
    pairs: [string, string][] = [];
  for (const [key, v] of Object.entries(value)) {
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(key) ||
      key.length > 128 ||
      !rpcText(v, 8192) ||
      /[\x00-\x08\x0a-\x1f\x7f]/.test(v) ||
      names.has(key.toLowerCase()) ||
      /^(content-type|cookie|cookie2|set-cookie|host|origin|referer|connection|content-length|transfer-encoding|upgrade|proxy-.*|sec-.*)$/i.test(
        key,
      )
    )
      throw new RpcError("headers");
    names.add(key.toLowerCase());
    pairs.push([key, v]);
  }
  try {
    const headers = new Headers(pairs);
    headers.set("Content-Type", "application/json");
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    return headers;
  } catch {
    throw new RpcError("headers");
  }
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(new RpcError("cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
const discard = (body: ReadableStream<Uint8Array> | null) => {
  try {
    void body?.cancel().catch(() => {});
  } catch {}
};
export async function sendRpcRequest(input: {
  url: string;
  request: string;
  timeoutMs: number;
  headers?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<RpcExchange> {
  const url = rpcUrl(input.url),
    headers = rpcHttpHeaders(input.headers);
  readRpcRequests(input.request);
  if (
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 100 ||
    input.timeoutMs > 30000
  )
    throw new RpcError("limit");
  const controller = new AbortController(),
    signal = controller.signal,
    started = performance.now();
  let reason: "cancelled" | "timeout" | undefined,
    response: Response | undefined,
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    complete = false;
  const stop = (why: "cancelled" | "timeout") => {
    if (!reason) {
      reason = why;
      controller.abort();
      try {
        void reader?.cancel().catch(() => {});
      } catch {}
    }
  };
  const abort = () => stop("cancelled");
  input.signal?.addEventListener("abort", abort, { once: true });
  if (input.signal?.aborted) abort();
  const timer = setTimeout(() => stop("timeout"), input.timeoutMs);
  try {
    if (signal.aborted) throw new RpcError(reason ?? "cancelled");
    response = await abortable<Response>(
      Promise.resolve().then(async () => {
        const received = await (input.fetcher ?? fetch)(url, {
          method: "POST",
          body: input.request,
          headers,
          signal,
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          mode: "cors",
        });
        response = received;
        if (signal.aborted) {
          discard(received.body);
          throw new RpcError(reason ?? "cancelled");
        }
        return received;
      }),
      signal,
    );
    if (signal.aborted) throw new RpcError(reason ?? "cancelled");
    if (performance.now() - started >= input.timeoutMs) {
      stop("timeout");
      throw new RpcError("timeout");
    }
    if (
      response.redirected ||
      response.type === "opaqueredirect" ||
      response.type === "opaque"
    )
      throw new RpcError("network");
    const chunks: string[] = [],
      decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    if (response.body) {
      reader = response.body.getReader();
      while (true) {
        const { done, value } = await abortable(reader.read(), signal);
        if (signal.aborted) throw new RpcError(reason ?? "cancelled");
        if (performance.now() - started >= input.timeoutMs) {
          stop("timeout");
          throw new RpcError("timeout");
        }
        if (done) break;
        if (
          !ArrayBuffer.isView(value) ||
          Object.prototype.toString.call(value) !== "[object Uint8Array]"
        )
          throw new RpcError("network");
        bytes += value.byteLength;
        if (bytes > MAX_RPC_FRAME_BYTES) throw new RpcError("limit");
        try {
          const decoded = decoder.decode(value, { stream: true });
          if (decoded) chunks.push(decoded);
        } catch {
          throw new RpcError("json");
        }
      }
    }
    try {
      chunks.push(decoder.decode());
    } catch {
      throw new RpcError("json");
    }
    const body = chunks.join(""),
      contentType = response.headers.get("Content-Type") ?? "",
      mime = contentType.split(";", 1)[0].trim().toLowerCase();
    if (
      body.length &&
      !(
        mime === "application/json" ||
        mime === "application/json-rpc" ||
        /^application\/[\w.+-]+\+json$/.test(mime)
      )
    )
      throw new RpcError("mime");
    complete = true;
    return {
      request: input.request,
      body,
      status: response.status,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      bytes,
      contentType,
      mode: "live",
    };
  } catch (e) {
    throw new RpcError(reason ?? (e instanceof RpcError ? e.code : "network"));
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
    if (!complete) {
      if (reader) {
        try {
          void reader.cancel().catch(() => {});
        } catch {}
      } else if (response) discard(response.body);
    }
    try {
      reader?.releaseLock();
    } catch {}
  }
}
