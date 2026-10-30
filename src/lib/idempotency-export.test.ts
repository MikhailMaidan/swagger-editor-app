import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateIdemMiddleware } from "./idempotency-export";
import {
  createIdempotencyStore,
  idemFingerprint,
  type IdemAdmission,
} from "./idempotency-engine";
import {
  newIdemPolicy,
  newIdemRequest,
  type IdemPolicy,
} from "./idempotency-project";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function artifact(policy: IdemPolicy) {
  const source = generateIdemMiddleware(policy);
  const exported = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )) as {
    createIdempotencyStore: () => ReturnType<
      typeof createIdempotencyStore<unknown>
    >;
    fingerprint: typeof idemFingerprint;
    createIdempotencyMiddleware: (options: {
      identify: (request: Request, ...args: unknown[]) => unknown;
      handler: (
        request: Request,
        admission: IdemAdmission,
        ...args: unknown[]
      ) => Response | Promise<Response>;
      now?: () => number;
      ioTimeoutMs?: number;
    }) => (request: Request, ...args: unknown[]) => Promise<Response>;
  };
  return { source, ...exported };
}
const identity = () => ({
  client: "trusted-client",
  route: "/orders",
  key: "key-1",
});
const request = (body: BodyInit = '{"item":"book"}', method = "POST") =>
  new Request("https://local.example/orders", {
    method,
    ...(method === "GET" || method === "HEAD" ? {} : { body }),
    headers: { "content-type": "application/json" },
  });
describe("standalone Fetch idempotency middleware", () => {
  it.each(["reject", "wait"] as const)(
    "keeps native %s store and fingerprint parity",
    async (inFlight) => {
      const policy = { ...newIdemPolicy(), inFlight, maxWaiters: 1 },
        exported = await artifact(policy),
        browser = createIdempotencyStore(policy),
        server = exported.createIdempotencyStore(),
        q = { ...newIdemRequest(), bytes: 1, fingerprint: "a".repeat(64) };
      for (const now of [0, 1, 2])
        expect(server.admit(q, now)).toEqual(browser.admit(q, now));
      server.release(1);
      browser.release(1);
      expect(server.admit(q, 3)).toEqual(browser.admit(q, 3));
      const result = { status: 201, bytes: 1, payload: "first", failed: false };
      expect(server.finish(1, 100, result)).toBe(
        browser.finish(1, 100, result),
      );
      for (const now of [101, 1099, 1100])
        expect(server.admit(q, now)).toEqual(browser.admit(q, now));
      expect(server.inspect()).toEqual(browser.inspect());
      const bytes = new TextEncoder().encode(q.body);
      expect(await exported.fingerprint(q, bytes)).toBe(
        await idemFingerprint(q, bytes),
      );
    },
  );
  it("coalesces twenty concurrent writes into one handler execution and independent replay responses", async () => {
    const { createIdempotencyMiddleware } = await artifact({
      ...newIdemPolicy(),
      inFlight: "wait",
      waitMs: 1000,
      maxWaiters: 32,
    });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const handler = vi.fn(async (r: Request) => {
      const body = await r.text();
      await gate;
      return new Response(body, {
        status: 201,
        headers: { "set-cookie": "session=private", "x-request-id": "first" },
      });
    });
    const run = createIdempotencyMiddleware({
      identify: identity,
      handler,
      now: () => 0,
    });
    const calls = Array.from({ length: 20 }, () => run(request()));
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    release();
    const responses = await Promise.all(calls);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(
      responses.filter((r) => r.headers.get("idempotency-replayed") === "true"),
    ).toHaveLength(19);
    for (const r of responses) {
      expect(await r.text()).toBe('{"item":"book"}');
      if (r.headers.has("idempotency-replayed")) {
        expect(r.headers.has("set-cookie")).toBe(false);
        expect(r.headers.get("cache-control")).toBe("no-store");
        expect(r.headers.get("x-request-id")).toBe("first");
      }
    }
  });
  it("rejects conflicting/pending writes and re-executes only at retention expiry", async () => {
    const { createIdempotencyMiddleware } = await artifact(newIdemPolicy());
    let now = 0,
      release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const handler = vi.fn(async () => {
      await gate;
      return new Response("first", { status: 201 });
    });
    const run = createIdempotencyMiddleware({
      identify: identity,
      handler,
      now: () => now,
    });
    const original = run(request());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect((await run(request())).status).toBe(409);
    expect(await (await run(request("different"))).json()).toEqual({
      error: "idempotency_conflict",
    });
    release();
    await original;
    now = 999;
    expect((await run(request())).headers.get("idempotency-replayed")).toBe(
      "true",
    );
    now = 1000;
    await run(request());
    expect(handler).toHaveBeenCalledTimes(2);
  });
  it("retains failed/uncacheable writes and can explicitly replay HTTP errors", async () => {
    for (const [status, cacheErrors, repeated] of [
      [500, false, 503],
      [500, true, 500],
      [201, false, 503],
    ] as const) {
      const { createIdempotencyMiddleware } = await artifact({
        ...newIdemPolicy(),
        cacheErrors,
        maxResponseBytes: status === 201 ? 1 : 100,
      });
      const handler = vi.fn(() => new Response("response", { status }));
      const run = createIdempotencyMiddleware({
        identify: identity,
        handler,
        now: () => 0,
      });
      const first = await run(request());
      expect(first.status).toBe(status);
      expect(await first.text()).toBe("response");
      expect((await run(request())).status).toBe(repeated);
      expect(handler).toHaveBeenCalledTimes(1);
    }
    const { createIdempotencyMiddleware } = await artifact(newIdemPolicy()),
      handler = vi.fn(() => {
        throw Error("business failure");
      }),
      run = createIdempotencyMiddleware({
        identify: identity,
        handler,
        now: () => 0,
      });
    await expect(run(request())).rejects.toThrow("business failure");
    expect((await run(request())).status).toBe(503);
    expect(handler).toHaveBeenCalledTimes(1);
    const encodedHandler = vi.fn(
      () =>
        new Response(new Uint8Array([31, 139, 8]), {
          status: 201,
          headers: { "content-encoding": "gzip" },
        }),
    );
    const encoded = createIdempotencyMiddleware({
      identify: identity,
      handler: encodedHandler,
      now: () => 0,
    });
    const original = await encoded(request());
    expect(original.status).toBe(201);
    expect(original.headers.get("content-encoding")).toBe("gzip");
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(
      new Uint8Array([31, 139, 8]),
    );
    expect((await encoded(request())).status).toBe(503);
    expect(encodedHandler).toHaveBeenCalledTimes(1);
  });
  it("bounds duplicate waits and waiter slots without releasing the original reservation", async () => {
    const { createIdempotencyMiddleware } = await artifact({
      ...newIdemPolicy(),
      inFlight: "wait",
      waitMs: 30,
      maxWaiters: 1,
    });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const handler = vi.fn(async () => {
        await gate;
        return new Response("done");
      }),
      run = createIdempotencyMiddleware({
        identify: identity,
        handler,
        now: () => 0,
      }),
      original = run(request());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const waiting = run(request());
    await new Promise((r) => setTimeout(r, 5));
    expect(await (await run(request())).json()).toEqual({
      error: "idempotency_wait_capacity",
    });
    expect(await (await waiting).json()).toEqual({
      error: "idempotency_wait_timeout",
    });
    expect(handler).toHaveBeenCalledTimes(1);
    release();
    await original;
  });
  it("handles missing identities, request byte/I/O limits and safe-method bypass", async () => {
    const { createIdempotencyMiddleware } = await artifact({
        ...newIdemPolicy(),
        maxRequestBytes: 2,
      }),
      handler = vi.fn(() => new Response("done"));
    expect(
      (
        await createIdempotencyMiddleware({ identify: identity, handler })(
          request("big"),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await createIdempotencyMiddleware({
          identify: () => ({ ...identity(), key: "" }),
          handler,
        })(request())
      ).status,
    ).toBe(400);
    expect(
      (
        await createIdempotencyMiddleware({ identify: () => null, handler })(
          request(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createIdempotencyMiddleware({
          identify: () => {
            throw Error("should not classify");
          },
          handler,
        })(request("", "GET"))
      ).status,
    ).toBe(200);
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    const hanging = new Request("https://local.example", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: string });
    expect(
      (
        await createIdempotencyMiddleware({
          identify: identity,
          handler,
          ioTimeoutMs: 5,
        })(hanging)
      ).status,
    ).toBe(408);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("retains unresolved reservations when the completion clock fails", async () => {
    const { createIdempotencyMiddleware } = await artifact(newIdemPolicy());
    let now = 10;
    const handler = vi.fn(() => {
        now = 9;
        return new Response("created");
      }),
      run = createIdempotencyMiddleware({
        identify: identity,
        handler,
        now: () => now,
      });
    expect((await run(request())).status).toBe(200);
    now = 100000;
    expect((await run(request())).status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("forwards exact binary bodies and context and reconstructs bodyless replay statuses", async () => {
    const { createIdempotencyMiddleware } = await artifact(newIdemPolicy()),
      body = new Uint8Array([0, 255, 17]),
      context = { tenant: "trusted" };
    const identify = vi.fn((_r: Request, ctx: unknown) => {
      expect(ctx).toBe(context);
      return identity();
    });
    const handler = vi.fn(
      async (r: Request, _decision: IdemAdmission, ctx: unknown) => {
        expect(ctx).toBe(context);
        expect(new Uint8Array(await r.arrayBuffer())).toEqual(body);
        return new Response(null, { status: 204 });
      },
    );
    const run = createIdempotencyMiddleware({
      identify,
      handler,
      now: () => 0,
    });
    expect((await run(request(body), context)).status).toBe(204);
    const replay = await run(request(body), context);
    expect(replay.status).toBe(204);
    expect(replay.body).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("bounds response capture time and blocks later execution when a result cannot be captured", async () => {
    const { createIdempotencyMiddleware } = await artifact(newIdemPolicy());
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const handler = vi.fn(
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                controller = c;
              },
            }),
          ),
      ),
      run = createIdempotencyMiddleware({
        identify: identity,
        handler,
        ioTimeoutMs: 5,
        now: () => 0,
      });
    const first = await run(request());
    controller.close();
    expect(first.status).toBe(200);
    expect((await run(request())).status).toBe(503);
    expect(handler).toHaveBeenCalledTimes(1);
    await first.text();
  });
  it("emits source-safe policy literals without traffic fixtures", async () => {
    const exported = await artifact({
      ...newIdemPolicy(),
      name: "</script>`\u2028",
    });
    expect(exported.source).not.toContain("</script>");
    expect(exported.source).not.toContain("\u2028");
    expect(exported.source).not.toContain("order-created");
  });
});
