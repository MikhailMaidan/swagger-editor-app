import {
  validateWsConnection,
  wsIncoming,
  wsPayload,
  wsPayloadBytes,
  decodeWsBinary,
  WsError,
  wsError,
  wsAbort,
  wsPause,
  MAX_WS_HISTORY_BYTES,
  MAX_WS_MESSAGES,
  type WsConnection,
  type WsErrorCode,
  type WsMessage,
  type WsPayload,
  type WsTransport,
} from "./websocket-studio";

export type WsConnectionState = {
  status: "closed" | "connecting" | "open" | "closing";
  protocol: string;
  closeCode?: number;
  closeReason?: string;
  wasClean?: boolean;
  error?: WsErrorCode;
};
export type WsSocket = Pick<
  WebSocket,
  | "readyState"
  | "bufferedAmount"
  | "binaryType"
  | "protocol"
  | "send"
  | "close"
  | "addEventListener"
  | "removeEventListener"
>;
export type WsSocketFactory = (url: string, protocols: string[]) => WsSocket;
type Waiting = {
  resolve: (m: WsMessage) => void;
  reject: (e: WsError) => void;
  cleanup: () => void;
};

// A single explicit connection. No automatic retries or implicit resends.
export class WsSession implements WsTransport {
  state: WsConnectionState = { status: "closed", protocol: "" };
  private socket: WsSocket | null = null;
  private started = false;
  private origin = 0;
  private lastTime = 0;
  private sequence = 0;
  private queue: WsMessage[] = [];
  private queueBytes = 0;
  private waiting: Waiting | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveOpen: (() => void) | null = null;
  private rejectOpen: ((e: WsError) => void) | null = null;
  private removeAbort: (() => void) | null = null;
  private config: WsConnection;
  constructor(
    connection: WsConnection,
    private observer: {
      onState: (state: WsConnectionState) => void;
      onMessage: (message: WsMessage) => void;
    },
    private options: {
      bufferIncoming?: boolean;
      factory?: WsSocketFactory;
    } = {},
  ) {
    this.config = validateWsConnection(connection);
  }
  private update(patch: Partial<WsConnectionState>) {
    this.state = { ...this.state, ...patch };
    this.observer.onState({ ...this.state });
  }
  private clearConnect() {
    if (this.connectTimer !== null) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    this.removeAbort?.();
    this.removeAbort = null;
  }
  async connect(signal?: AbortSignal): Promise<void> {
    wsAbort(signal);
    if (this.started) return Promise.reject(new WsError("connection"));
    this.started = true;
    this.origin = performance.now();
    return new Promise((resolve, reject) => {
      this.resolveOpen = resolve;
      this.rejectOpen = reject;
      this.update({ status: "connecting" });
      try {
        this.socket = (
          this.options.factory ??
          ((url, protocols) => new WebSocket(url, protocols))
        )(this.config.url, this.config.protocols);
        this.socket.binaryType = "arraybuffer";
        this.socket.addEventListener("open", this.onOpen);
        this.socket.addEventListener("message", this.onMessage);
        this.socket.addEventListener("error", this.onError);
        this.socket.addEventListener("close", this.onClose);
        const abort = () => this.stop("cancelled");
        signal?.addEventListener("abort", abort, { once: true });
        this.removeAbort = () => signal?.removeEventListener("abort", abort);
        this.connectTimer = setTimeout(
          () => this.stop("timeout"),
          this.config.timeoutMs,
        );
        if (signal?.aborted) abort();
      } catch {
        this.stop("connection");
      }
    });
  }
  private onOpen: EventListener = () => {
    if (this.state.status !== "connecting") return;
    this.clearConnect();
    this.update({ status: "open", protocol: this.socket?.protocol ?? "" });
    this.resolveOpen?.();
    this.resolveOpen = this.rejectOpen = null;
  };
  private onError: EventListener = () => {
    // Browsers intentionally do not expose handshake/network details.
    this.stop("connection");
  };
  private onClose: EventListener = (event) => {
    const close = event as CloseEvent;
    this.finish("closed", {
      closeCode: close.code,
      closeReason: close.reason.slice(0, 256),
      wasClean: close.wasClean,
    });
  };
  private log(
    payload: WsPayload,
    direction: WsMessage["direction"],
  ): WsMessage {
    this.lastTime = Math.max(
      this.lastTime,
      Math.max(0, Math.round(performance.now() - this.origin)),
    );
    const message: WsMessage = {
      ...payload,
      sequence: ++this.sequence,
      direction,
      bytes: wsPayloadBytes(payload),
      atMs: this.lastTime,
    };
    this.observer.onMessage(message);
    return message;
  }
  private onMessage: EventListener = (event) => {
    if (this.state.status !== "open") return;
    try {
      const message = this.log(
        wsIncoming((event as MessageEvent).data),
        "receive",
      );
      if (!this.options.bufferIncoming) return;
      if (this.waiting) {
        const waiting = this.waiting;
        this.waiting = null;
        waiting.cleanup();
        waiting.resolve(message);
      } else {
        const size = message.bytes;
        if (
          this.queue.length >= MAX_WS_MESSAGES ||
          this.queueBytes + size > MAX_WS_HISTORY_BYTES
        )
          throw new WsError("buffer");
        this.queue.push(message);
        this.queueBytes += size;
      }
    } catch (error) {
      this.stop(wsError(error).code);
    }
  };
  send(value: WsPayload) {
    if (
      this.state.status !== "open" ||
      !this.socket ||
      this.socket.readyState !== 1
    )
      throw new WsError("closed");
    const payload = wsPayload(value);
    if (this.socket.bufferedAmount + wsPayloadBytes(payload) > 512 * 1024)
      throw new WsError("buffer");
    try {
      if (payload.format === "binary") {
        const bytes = decodeWsBinary(payload.data);
        const buffer = new ArrayBuffer(bytes.length);
        new Uint8Array(buffer).set(bytes);
        this.socket.send(buffer);
      } else this.socket.send(payload.data);
    } catch {
      throw new WsError("connection");
    }
    this.log(payload, "send");
  }
  async receive(timeoutMs: number, signal?: AbortSignal): Promise<WsMessage> {
    wsAbort(signal);
    if (!this.options.bufferIncoming || this.waiting)
      return Promise.reject(new WsError("connection"));
    const queued = this.queue.shift();
    if (queued) {
      this.queueBytes -= queued.bytes;
      return Promise.resolve(queued);
    }
    if (this.state.status !== "open")
      return Promise.reject(new WsError(this.state.error ?? "closed"));
    return new Promise((resolve, reject) => {
      const fail = (code: WsErrorCode) => {
        const waiting = this.waiting;
        if (!waiting) return;
        this.waiting = null;
        waiting.cleanup();
        reject(new WsError(code));
      };
      const timer = setTimeout(() => fail("timeout"), Math.max(1, timeoutMs));
      const abort = () => fail("cancelled");
      this.waiting = {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        },
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  pause(ms: number, signal?: AbortSignal) {
    return wsPause(ms, signal);
  }
  close(code = 1000, reason = "") {
    if (
      !Number.isInteger(code) ||
      (code !== 1000 && (code < 3000 || code > 4999)) ||
      new TextEncoder().encode(reason).length > 123
    )
      throw new WsError("connection");
    if (this.state.status === "closed" || this.state.status === "closing")
      return;
    this.clearConnect();
    this.rejectOpen?.(new WsError("cancelled"));
    this.resolveOpen = this.rejectOpen = null;
    if (this.waiting) {
      this.waiting.cleanup();
      this.waiting.reject(new WsError("closed"));
      this.waiting = null;
    }
    this.update({ status: "closing" });
    this.closeTimer = setTimeout(() => this.finish("closed"), 2000);
    try {
      this.socket?.close(code, reason);
    } catch {
      this.finish("closed");
      return;
    }
  }
  private stop(code: WsErrorCode) {
    const socket = this.socket;
    this.finish(code);
    try {
      if (socket && socket.readyState < 2)
        socket.close(code === "limit" || code === "buffer" ? 4009 : 1000);
    } catch {
      /* Connection has already failed. */
    }
  }
  private finish(code: WsErrorCode, metadata: Partial<WsConnectionState> = {}) {
    this.clearConnect();
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.socket?.removeEventListener("open", this.onOpen);
    this.socket?.removeEventListener("message", this.onMessage);
    this.socket?.removeEventListener("error", this.onError);
    this.socket?.removeEventListener("close", this.onClose);
    this.rejectOpen?.(new WsError(code));
    this.resolveOpen = this.rejectOpen = null;
    if (this.waiting) {
      this.waiting.cleanup();
      this.waiting.reject(new WsError(code));
      this.waiting = null;
    }
    this.update({
      status: "closed",
      ...(code !== "closed" ? { error: code } : {}),
      ...metadata,
    });
  }
  dispose(code: WsErrorCode = "cancelled") {
    this.stop(code);
    this.queue = [];
    this.queueBytes = 0;
  }
}
