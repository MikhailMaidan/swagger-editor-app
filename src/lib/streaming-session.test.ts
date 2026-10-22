import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamingSession, type StreamingState } from "./streaming-session";
import {
  emptyStreamProject,
  type StreamConnection,
  type StreamRecord,
} from "./streaming-http";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const bytes = (s: string) => new TextEncoder().encode(s);
function response(
  chunks: (string | Uint8Array)[],
  mime = "text/event-stream",
  status = 200,
) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const chunk of chunks)
          c.enqueue(typeof chunk === "string" ? bytes(chunk) : chunk);
        c.close();
      },
    }),
    { status, headers: { "Content-Type": mime } },
  );
}
function setup(
  fetcher: typeof fetch,
  patch: Partial<StreamConnection> = {},
  headers = "{}",
) {
  const records: StreamRecord[] = [],
    states: StreamingState[] = [];
  const session = new StreamingSession(
    {
      ...emptyStreamProject().connection,
      url: "https://stream.example/events",
      ...patch,
    },
    headers,
    { onRecord: (r) => records.push(r), onState: (s) => states.push(s) },
    fetcher,
  );
  return { session, records, states };
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("live streaming HTTP session", () => {
  it("enforces the duration budget within an already buffered record batch", async () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(["data: first\n\ndata: late\n\n"]));
    const session = new StreamingSession(
      {
        ...emptyStreamProject().connection,
        url: "https://stream.example/events",
        durationMs: 100,
      },
      "{}",
      {
        onState() {},
        onRecord() {
          clock = 500;
        },
      },
      fetcher,
    );
    expect(await session.run()).toMatchObject({
      reason: "duration-limit",
      records: 1,
    });
  });
  it("reads incremental SSE with explicit headers, no ambient credentials, and value-free reports", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response(['data: {"ok":', "true}\r", "\n\r\n:beat\n\n"]),
      );
    const { session, records } = setup(
      fetcher,
      {},
      '{"Authorization":"Bearer private"}',
    );
    const r = await session.run();
    expect(r).toMatchObject({
      reason: "eof",
      connections: 1,
      records: 1,
      comments: 1,
      httpStatus: 200,
    });
    expect(records[0].data).toBe('{"ok":true}');
    const init = fetcher.mock.calls[0][1]!;
    expect(init).toMatchObject({
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      mode: "cors",
      method: "GET",
    });
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer private",
    );
    expect((init.headers as Headers).get("Accept")).toBe("text/event-stream");
    expect(JSON.stringify(r)).not.toMatch(
      /private|stream.example|Authorization|"data"|"lastEventId"/,
    );
    await expect(session.run()).rejects.toMatchObject({ code: "connection" });
  });
  it("streams POST NDJSON with a precise request body and no automatic resend", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(['{"n":1}\n2'], "application/x-ndjson"));
    const { session, records } = setup(fetcher, {
      method: "POST",
      format: "ndjson",
      body: '{"stream":true}',
    });
    expect(await session.run()).toMatchObject({
      reason: "eof",
      records: 2,
      connections: 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.body).toBe('{"stream":true}');
    expect(records.map((r) => r.data)).toEqual(['{"n":1}', "2"]);
  });
  it("reconnects only within the explicit GET SSE bound and forwards the committed event id", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(["retry: 0\nid: 42\ndata: first\n\n"]))
      .mockResolvedValueOnce(response(["id:\n\ndata: second\n\n"]))
      .mockResolvedValueOnce(response(["data: third\n\n"]));
    const { session, records } = setup(fetcher, { reconnects: 2, retryMs: 0 });
    expect(await session.run()).toMatchObject({
      reason: "eof",
      connections: 3,
      records: 3,
    });
    expect(
      (fetcher.mock.calls[1][1]?.headers as Headers).get("Last-Event-ID"),
    ).toBe("42");
    expect(
      (fetcher.mock.calls[2][1]?.headers as Headers).has("Last-Event-ID"),
    ).toBe(false);
    expect(records.map((r) => r.connection)).toEqual([1, 2, 3]);
  });
  it("recovers an opted-in GET stream from a network failure but reports unrecovered read failures accurately", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(response(["data: ok\n\n"]));
    expect(
      await setup(fetcher, { reconnects: 1, retryMs: 0 }).session.run(),
    ).toMatchObject({ reason: "eof", connections: 2 });
    const broken = new Response(
      new ReadableStream({
        start(c) {
          c.error(new TypeError("read failed"));
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
    expect(
      await setup(
        vi.fn<typeof fetch>().mockResolvedValue(broken),
      ).session.run(),
    ).toMatchObject({ reason: "network" });
  });
  it("stops on a sentinel or record limit without emitting later records from the same chunk", async () => {
    for (const patch of [{ stopText: "[DONE]" }, { maxRecords: 2 }]) {
      const { session, records } = setup(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            response(["data: first\n\ndata: [DONE]\n\ndata: late\n\n"]),
          ),
        patch,
      );
      expect((await session.run()).reason).toBe(
        "stopText" in patch ? "sentinel" : "record-limit",
      );
      expect(records.map((r) => r.data)).toEqual(["first", "[DONE]"]);
    }
  });
  it("treats HTTP 204 as terminal and does not retry HTTP errors or MIME mismatches", async () => {
    for (const [resp, reason] of [
      [new Response(null, { status: 204 }), "no-content"],
      [response([], "text/event-stream", 500), "http"],
      [response([], "text/html"), "mime"],
    ] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(resp);
      expect(
        (await setup(fetcher, { reconnects: 3 }).session.run()).reason,
      ).toBe(reason);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    expect(
      (
        await setup(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(response(["data: ok\n\n"], "text/plain")),
          { requireContentType: false },
        ).session.run()
      ).records,
    ).toBe(1);
  });
  it("cancels unwanted HTTP/MIME response bodies without reading their values", async () => {
    const cancel = vi.fn();
    const resp = new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Type": "text/html" },
    });
    expect(
      (await setup(vi.fn<typeof fetch>().mockResolvedValue(resp)).session.run())
        .reason,
    ).toBe("mime");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("terminates oversized server retry hints instead of silently shortening their delay", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(["retry: 30001\n\n"]));
    expect((await setup(fetcher, { reconnects: 1 }).session.run()).reason).toBe(
      "retry-limit",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cancels an unresolved handshake and cleans up a response arriving afterward", async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const abort = new AbortController(),
      { session } = setup(fetcher),
      pending = session.run(abort.signal);
    await flush();
    abort.abort();
    expect((await pending).reason).toBe("cancelled");
    const cancel = vi.fn();
    resolve(new Response(new ReadableStream({ cancel })));
    await flush();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("cancels reads and reconnect waits promptly, releasing readers and suppressing later callbacks", async () => {
    const cancel = vi.fn(),
      { session, records } = setup(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(new ReadableStream({ cancel }), {
            headers: { "Content-Type": "text/event-stream" },
          }),
        ),
      );
    const pending = session.run();
    await flush();
    session.dispose();
    expect((await pending).reason).toBe("cancelled");
    expect(cancel).toHaveBeenCalled();
    expect(records).toEqual([]);
    const f = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    const next = setup(f, { reconnects: 2, retryMs: 30000 });
    const waiting = next.session.run();
    await flush();
    expect(next.session.state.status).toBe("waiting");
    next.session.stop();
    expect((await waiting).reason).toBe("cancelled");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each(["handshake-timeout", "idle-timeout", "duration-limit"] as const)(
    "enforces %s independently and removes all timers",
    async (reason) => {
      vi.useFakeTimers();
      const fetcher =
        reason === "handshake-timeout"
          ? vi
              .fn<typeof fetch>()
              .mockImplementation(() => new Promise(() => {}))
          : vi.fn<typeof fetch>().mockResolvedValue(
              new Response(new ReadableStream(), {
                headers: { "Content-Type": "text/event-stream" },
              }),
            );
      const { session } = setup(fetcher, {
        handshakeMs: reason === "handshake-timeout" ? 100 : 1000,
        idleMs: reason === "idle-timeout" ? 100 : 1000,
        durationMs: reason === "duration-limit" ? 100 : 5000,
      });
      const pending = session.run();
      await flush();
      await vi.advanceTimersByTimeAsync(101);
      expect((await pending).reason).toBe(reason);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("keeps heartbeat traffic alive and rejects malformed NDJSON without retrying it", async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            stream = c;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const { session } = setup(fetcher, { idleMs: 100, durationMs: 1000 });
    const pending = session.run();
    await flush();
    await vi.advanceTimersByTimeAsync(80);
    stream.enqueue(bytes(":beat\n\n"));
    await flush();
    await vi.advanceTimersByTimeAsync(80);
    expect(session.state.status).toBe("streaming");
    session.stop();
    expect((await pending).comments).toBe(1);
    vi.useRealTimers();
    const bad = setup(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response(["1\n{bad}\n"], "application/x-ndjson")),
      { format: "ndjson" },
    );
    expect(await bad.session.run()).toMatchObject({
      reason: "json",
      records: 1,
    });
  });
});
