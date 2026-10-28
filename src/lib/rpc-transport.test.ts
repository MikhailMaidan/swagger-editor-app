import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcHttpHeaders, sendRpcRequest } from "./rpc-transport";
import { MAX_RPC_FRAME_BYTES } from "./rpc-json";
const request = '{"jsonrpc":"2.0","method":"math.add","params":[1,2],"id":1}';
const body = '{"jsonrpc":"2.0","result":3,"id":1}';
const args = { url: "https://rpc.example/jsonrpc", request, timeoutMs: 1000 };
const response = (text = body, status = 200, type = "application/json") =>
  new Response(text, { status, headers: { "Content-Type": type } });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("explicit JSON-RPC HTTP transport", () => {
  it("posts the exact saved payload with explicit headers, no cookies/redirects/retries or cache", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const result = await sendRpcRequest({
      ...args,
      headers: '{"Authorization":"Bearer session-only"}',
      fetcher,
    });
    expect(result).toMatchObject({
      request,
      status: 200,
      body,
      mode: "live",
      bytes: body.length,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(args.url);
    expect(options).toMatchObject({
      method: "POST",
      body: request,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      mode: "cors",
    });
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "Bearer session-only",
    );
    expect(new Headers(options?.headers).get("content-type")).toBe(
      "application/json",
    );
  });
  it("preserves HTTP error status and JSON-RPC error bodies for protocol inspection", async () => {
    const error =
      '{"jsonrpc":"2.0","id":1,"error":{"code":1001,"message":"no"}}';
    expect(
      await sendRpcRequest({
        ...args,
        fetcher: vi.fn().mockResolvedValue(response(error, 500)),
      }),
    ).toMatchObject({ status: 500, body: error });
  });
  it("accepts empty notification responses without a Content-Type", async () => {
    const notification = '{"jsonrpc":"2.0","method":"events.log"}';
    expect(
      await sendRpcRequest({
        ...args,
        request: notification,
        fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
      }),
    ).toMatchObject({ status: 204, body: "", bytes: 0 });
  });
  it("decodes multi-byte UTF-8 correctly across every single-byte chunk", async () => {
    const text = '{"jsonrpc":"2.0","id":1,"result":"Привет 😀"}',
      bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(Uint8Array.of(b));
        c.close();
      },
    });
    const result = await sendRpcRequest({
      ...args,
      fetcher: vi.fn().mockResolvedValue(
        new Response(stream, {
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    });
    expect(result.body).toBe(text);
    expect(result.bytes).toBe(bytes.length);
  });
  it("rejects invalid UTF-8 and non-JSON media types", async () => {
    await expect(
      sendRpcRequest({
        ...args,
        fetcher: vi.fn().mockResolvedValue(
          new Response(Uint8Array.of(0xff), {
            headers: { "Content-Type": "application/json" },
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: "json" });
    await expect(
      sendRpcRequest({
        ...args,
        fetcher: vi
          .fn()
          .mockResolvedValue(response("<html>no</html>", 502, "text/html")),
      }),
    ).rejects.toMatchObject({ code: "mime" });
  });
  it("cancels an oversized response body and limits received bytes", async () => {
    const cancel = vi.fn(),
      stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(MAX_RPC_FRAME_BYTES + 1));
        },
        cancel,
      });
    await expect(
      sendRpcRequest({
        ...args,
        fetcher: vi.fn().mockResolvedValue(
          new Response(stream, {
            headers: { "Content-Type": "application/json" },
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: "limit" });
    expect(cancel).toHaveBeenCalled();
  });
  it("enforces cancellation and deadlines even for bodyless responses", async () => {
    const abort = new AbortController();
    const result = sendRpcRequest({
      ...args,
      signal: abort.signal,
      fetcher: vi.fn(async () => {
        queueMicrotask(() => abort.abort());
        return new Response(null, { status: 204 });
      }),
    });
    await expect(result).rejects.toMatchObject({ code: "cancelled" });
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    await expect(
      sendRpcRequest({
        ...args,
        fetcher: vi.fn(async () => {
          now = 1001;
          return new Response(null, { status: 204 });
        }),
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
  it("times out a fetch that ignores abort and discards its eventual response body", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await expect(
      sendRpcRequest({ ...args, timeoutMs: 100, fetcher }),
    ).rejects.toMatchObject({ code: "timeout" });
    const cancel = vi.fn();
    finish(
      new Response(new ReadableStream({ cancel }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
  it("cancels a stalled body read on explicit cancellation", async () => {
    const abort = new AbortController(),
      cancel = vi.fn(),
      stream = new ReadableStream<Uint8Array>({ cancel });
    const result = sendRpcRequest({
      ...args,
      signal: abort.signal,
      fetcher: vi.fn().mockResolvedValue(
        new Response(stream, {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });
    await Promise.resolve();
    await Promise.resolve();
    abort.abort();
    await expect(result).rejects.toMatchObject({ code: "cancelled" });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
  it("does not call fetch for a pre-aborted or invalid request", async () => {
    const signal = new AbortController();
    signal.abort();
    const fetcher = vi.fn();
    await expect(
      sendRpcRequest({ ...args, signal: signal.signal, fetcher }),
    ).rejects.toMatchObject({ code: "cancelled" });
    await expect(
      sendRpcRequest({ ...args, request: "[]", fetcher }),
    ).rejects.toMatchObject({ code: "request" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects duplicate, reserved and injected headers and unsafe endpoint URLs", async () => {
    for (const headers of [
      '{"A":"1","a":"2"}',
      '{"Cookie":"session=x"}',
      '{"Content-Type":"text/plain"}',
      '{"X":"a\\r\\nb"}',
    ])
      expect(() => rpcHttpHeaders(headers)).toThrow();
    await expect(
      sendRpcRequest({
        ...args,
        url: "https://user:pass@rpc.example",
        fetcher: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "url" });
  });
});
