import { afterEach, describe, expect, it, vi } from "vitest";
import { WsSession, type WsSocket } from "./websocket-session";
import {
  MAX_WS_HISTORY_BYTES,
  MAX_WS_MESSAGE_BYTES,
  MAX_WS_MESSAGES,
} from "./websocket-studio";

class Socket extends EventTarget {
  readyState = 0;
  bufferedAmount = 0;
  binaryType: BinaryType = "blob";
  protocol = "chat.v2";
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 2;
  });
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  message(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  closed(code = 1000, reason = "Done", wasClean = true) {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close", { code, reason, wasClean }));
  }
}
function setup(bufferIncoming = true, timeoutMs = 1000) {
  const socket = new Socket(),
    onState = vi.fn(),
    onMessage = vi.fn();
  const factory = vi.fn(() => socket as unknown as WsSocket);
  const session = new WsSession(
    { url: "wss://example.com/socket", protocols: ["chat.v2"], timeoutMs },
    { onState, onMessage },
    { factory, bufferIncoming },
  );
  const opened = session.connect();
  void opened.catch(() => {});
  return { session, socket, opened, onState, onMessage, factory };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WebSocket session lifecycle", () => {
  it("opens only on explicit connect, selects ArrayBuffer messages and observes negotiated protocols", async () => {
    const socket = new Socket(),
      factory = vi.fn(() => socket as unknown as WsSocket);
    const session = new WsSession(
      { url: "ws://localhost:8000", protocols: [], timeoutMs: 1000 },
      { onState: vi.fn(), onMessage: vi.fn() },
      { factory },
    );
    expect(factory).not.toHaveBeenCalled();
    const opened = session.connect();
    socket.open();
    await opened;
    expect(factory).toHaveBeenCalledWith("ws://localhost:8000", []);
    expect(socket.binaryType).toBe("arraybuffer");
    expect(session.state).toMatchObject({
      status: "open",
      protocol: "chat.v2",
    });
    await expect(session.connect()).rejects.toMatchObject({
      code: "connection",
    });
    session.dispose();
  });
  it("records original JSON/text and binary messages with wire-byte lengths in order", async () => {
    const { session, socket, opened, onMessage } = setup();
    socket.open();
    await opened;
    session.send({ format: "json", data: ' {"id":1} ' });
    session.send({ format: "binary", data: "AAEC" });
    socket.message("😀");
    socket.message('{"id":2}');
    socket.message(Uint8Array.from([0, 255]).buffer);
    expect(socket.send.mock.calls[0][0]).toBe(' {"id":1} ');
    expect(new Uint8Array(socket.send.mock.calls[1][0])).toEqual(
      Uint8Array.from([0, 1, 2]),
    );
    expect(
      onMessage.mock.calls.map(([m]) => [
        m.sequence,
        m.direction,
        m.format,
        m.bytes,
      ]),
    ).toEqual([
      [1, "send", "json", 10],
      [2, "send", "binary", 3],
      [3, "receive", "text", 4],
      [4, "receive", "json", 8],
      [5, "receive", "binary", 2],
    ]);
    expect((await session.receive(100)).data).toBe("😀");
    expect((await session.receive(100)).data).toBe('{"id":2}');
    session.dispose();
  });
  it("handles a response arriving synchronously during send without losing it", async () => {
    const { session, socket, opened } = setup();
    socket.open();
    await opened;
    socket.send.mockImplementation(() => socket.message('{"ack":true}'));
    session.send({ format: "text", data: "request" });
    expect((await session.receive(100)).data).toBe('{"ack":true}');
    session.dispose();
  });
  it("delivers awaited messages and cleans their deadline/abort listeners", async () => {
    vi.useFakeTimers();
    const { session, socket, opened } = setup();
    socket.open();
    await opened;
    const controller = new AbortController();
    const received = session.receive(1000, controller.signal);
    socket.message("ready");
    expect((await received).data).toBe("ready");
    controller.abort();
    expect(vi.getTimerCount()).toBe(0);
    session.dispose();
  });
  it("times out a receive without closing a reusable interactive socket", async () => {
    vi.useFakeTimers();
    const { session, socket, opened } = setup();
    socket.open();
    await opened;
    const received = expect(session.receive(10)).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(10);
    await received;
    expect(session.state.status).toBe("open");
    socket.message("later");
    expect((await session.receive(10)).data).toBe("later");
    session.dispose();
  });
  it("cancels handshake and receive waits without reconnecting", async () => {
    const a = setup();
    const handshake = expect(a.opened).rejects.toMatchObject({
      code: "cancelled",
    });
    a.session.dispose();
    await handshake;
    expect(a.factory).toHaveBeenCalledTimes(1);
    const b = setup();
    b.socket.open();
    await b.opened;
    const controller = new AbortController();
    const pending = expect(
      b.session.receive(1000, controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    controller.abort();
    await pending;
    expect(b.session.state.status).toBe("open");
    b.session.dispose();
  });
  it("uses an abort signal during connection and never opens for an already-aborted request", async () => {
    const controller = new AbortController(),
      socket = new Socket(),
      factory = vi.fn(() => socket as unknown as WsSocket);
    const session = new WsSession(
      { url: "wss://example.com", protocols: [], timeoutMs: 1000 },
      { onState: vi.fn(), onMessage: vi.fn() },
      { factory },
    );
    const pending = expect(
      session.connect(controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    controller.abort();
    await pending;
    expect(socket.close).toHaveBeenCalledTimes(1);
    const other = new WsSession(
      { url: "wss://example.com", protocols: [], timeoutMs: 1000 },
      { onState: vi.fn(), onMessage: vi.fn() },
      { factory },
    );
    await expect(other.connect(controller.signal)).rejects.toMatchObject({
      code: "cancelled",
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it("enforces handshake timeout and detaches late events", async () => {
    vi.useFakeTimers();
    const { session, socket, opened, onMessage } = setup();
    const result = expect(opened).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    socket.open();
    socket.message("late");
    expect(session.state).toMatchObject({ status: "closed", error: "timeout" });
    expect(onMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("handles constructor errors and browser error events without leaking server URLs", async () => {
    const session = new WsSession(
      {
        url: "wss://example.com/?secret=value",
        protocols: [],
        timeoutMs: 1000,
      },
      { onState: vi.fn(), onMessage: vi.fn() },
      {
        factory: () => {
          throw new Error("secret server detail");
        },
      },
    );
    await expect(session.connect()).rejects.toMatchObject({
      code: "connection",
    });
    expect(JSON.stringify(session.state)).not.toContain("secret");
    const other = setup();
    other.socket.open();
    await other.opened;
    const pending = expect(other.session.receive(1000)).rejects.toMatchObject({
      code: "connection",
    });
    other.socket.dispatchEvent(new Event("error"));
    await pending;
    expect(other.session.state.status).toBe("closed");
  });
  it("retains close metadata and allows queued final messages to be consumed after server close", async () => {
    const { session, socket, opened } = setup();
    socket.open();
    await opened;
    socket.message("last");
    socket.closed(4001, "Finished", false);
    expect(session.state).toMatchObject({
      status: "closed",
      closeCode: 4001,
      closeReason: "Finished",
      wasClean: false,
    });
    expect((await session.receive(100)).data).toBe("last");
    await expect(session.receive(100)).rejects.toMatchObject({
      code: "closed",
    });
    expect(() => session.send({ format: "text", data: "later" })).toThrowError(
      expect.objectContaining({ code: "closed" }),
    );
  });
  it("requests graceful close, rejects pending waits and bounds close handshake time", async () => {
    vi.useFakeTimers();
    const { session, socket, opened } = setup();
    socket.open();
    await opened;
    const pending = expect(session.receive(1000)).rejects.toMatchObject({
      code: "closed",
    });
    session.close(3001, "Done");
    await pending;
    expect(socket.close).toHaveBeenCalledWith(3001, "Done");
    expect(session.state.status).toBe("closing");
    await vi.advanceTimersByTimeAsync(2000);
    expect(session.state.status).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("respects browser close-code and UTF-8 close-reason limits", async () => {
    const { session, socket, opened } = setup();
    socket.open();
    await opened;
    for (const code of [1009, 2000, 4999.5, 5000])
      expect(() => session.close(code)).toThrow();
    expect(() => session.close(1000, "😀".repeat(31))).toThrow();
    session.close(1000, "😀".repeat(30));
    socket.closed();
    expect(session.state.status).toBe("closed");
  });
  it("guards send buffering and malformed outgoing messages without claiming they were sent", async () => {
    const { session, socket, opened, onMessage } = setup();
    socket.open();
    await opened;
    socket.bufferedAmount = 512 * 1024;
    expect(() => session.send({ format: "text", data: "x" })).toThrowError(
      expect.objectContaining({ code: "buffer" }),
    );
    socket.bufferedAmount = 0;
    expect(() => session.send({ format: "json", data: "{" })).toThrowError(
      expect.objectContaining({ code: "json" }),
    );
    expect(socket.send).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
    socket.send.mockImplementation(() => {
      throw new Error();
    });
    expect(() => session.send({ format: "text", data: "x" })).toThrowError(
      expect.objectContaining({ code: "connection" }),
    );
    expect(onMessage).not.toHaveBeenCalled();
    session.dispose();
  });
  it("closes on oversized incoming messages and bounds buffered conversations", async () => {
    const a = setup();
    a.socket.open();
    await a.opened;
    a.socket.message("x".repeat(MAX_WS_MESSAGE_BYTES + 1));
    expect(a.session.state.error).toBe("limit");
    expect(a.onMessage).not.toHaveBeenCalled();
    const b = setup();
    b.socket.open();
    await b.opened;
    for (let i = 0; i <= MAX_WS_MESSAGES; i++) b.socket.message("x");
    expect(b.session.state.error).toBe("buffer");
    const c = setup();
    c.socket.open();
    await c.opened;
    for (let i = 0; i <= MAX_WS_HISTORY_BYTES / MAX_WS_MESSAGE_BYTES; i++)
      c.socket.message("x".repeat(MAX_WS_MESSAGE_BYTES));
    expect(c.session.state.error).toBe("buffer");
  });
  it("does not accumulate unread conversation messages for interactive-only connections", async () => {
    const { session, socket, opened, onMessage } = setup(false);
    socket.open();
    await opened;
    for (let i = 0; i < 250; i++) socket.message("event");
    expect(session.state.status).toBe("open");
    expect(onMessage).toHaveBeenCalledTimes(250);
    await expect(session.receive(10)).rejects.toMatchObject({
      code: "connection",
    });
    session.dispose();
    socket.message("late");
    expect(onMessage).toHaveBeenCalledTimes(250);
  });
});
