import {
  StreamingDecoder,
  StreamError,
  streamError,
  validateStreamConnection,
  parseStreamHeaders,
  streamLastEventIdHeader,
  MAX_STREAM_BYTES,
  type StreamConnection,
  type StreamRecord,
  type StreamErrorCode,
} from "./streaming-http";

export type StreamStop =
  | "eof"
  | "no-content"
  | "cancelled"
  | "handshake-timeout"
  | "idle-timeout"
  | "duration-limit"
  | "record-limit"
  | "sentinel"
  | "http"
  | "mime"
  | "retry-limit"
  | "json"
  | "utf8"
  | "framing"
  | "limit"
  | "headers"
  | "network";
export type StreamingState = {
  status: "idle" | "connecting" | "streaming" | "waiting" | "closed";
  connections: number;
  records: number;
  bytes: number;
  comments: number;
  lastEventId: string;
  retryMs: number;
  httpStatus: number | null;
  reason?: StreamStop;
};
export type StreamingRun = {
  kind: "rsswag-streaming-session-report";
  version: 1;
  mode: "live";
  reason: StreamStop;
  connections: number;
  records: number;
  bytes: number;
  comments: number;
  elapsedMs: number;
  firstRecordMs: number | null;
  httpStatus: number | null;
};
type Observer = {
  onState: (state: StreamingState) => void;
  onRecord: (record: StreamRecord) => void;
};
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new StreamError("cancelled"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
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
export class StreamingSession {
  state: StreamingState;
  private config: StreamConnection;
  private controller = new AbortController();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private started = false;
  private reason: StreamStop | null = null;
  private origin = 0;
  private firstRecord: number | null = null;
  constructor(
    connection: StreamConnection,
    private headersSource: string,
    private observer: Observer,
    private fetcher: typeof fetch = fetch,
  ) {
    this.config = validateStreamConnection(connection, true);
    this.state = {
      status: "idle",
      connections: 0,
      records: 0,
      bytes: 0,
      comments: 0,
      lastEventId: connection.lastEventId,
      retryMs: connection.retryMs,
      httpStatus: null,
    };
  }
  private update(patch: Partial<StreamingState>) {
    this.state = { ...this.state, ...patch };
    this.observer.onState({ ...this.state });
  }
  stop(reason: StreamStop = "cancelled") {
    if (this.reason !== null) return;
    this.reason = reason;
    this.controller.abort();
    try {
      void this.reader?.cancel().catch(() => {});
    } catch {
      /* The reader may already be released. */
    }
  }
  dispose() {
    this.stop();
  }
  async run(signal?: AbortSignal): Promise<StreamingRun> {
    if (this.started) throw new StreamError("connection");
    this.started = true;
    const headers = parseStreamHeaders(this.headersSource),
      c = this.config,
      controller = this.controller;
    const abort = () => this.stop();
    signal?.addEventListener("abort", abort, { once: true });
    this.origin = performance.now();
    if (signal?.aborted) this.stop();
    const elapsed = () =>
      Math.min(
        120000,
        Math.max(0, Math.round(performance.now() - this.origin)),
      );
    const overall = setTimeout(() => this.stop("duration-limit"), c.durationMs);
    try {
      while (!this.reason) {
        this.update({
          status: "connecting",
          connections: this.state.connections + 1,
          httpStatus: null,
        });
        let handshake: ReturnType<typeof setTimeout> | null = null,
          idle: ReturnType<typeof setTimeout> | null = null;
        let retryable = false,
          decoder: StreamingDecoder | null = null;
        let attemptEnd: "network" | "eof" = "network";
        let response: Response | null = null;
        const resetIdle = () => {
          if (idle !== null) clearTimeout(idle);
          idle = setTimeout(() => this.stop("idle-timeout"), c.idleMs);
        };
        try {
          const requestHeaders = new Headers(headers);
          requestHeaders.set(
            "Accept",
            c.format === "sse" ? "text/event-stream" : "application/x-ndjson",
          );
          if (
            c.method === "POST" &&
            c.body &&
            !requestHeaders.has("Content-Type")
          )
            requestHeaders.set("Content-Type", "application/json");
          if (c.format === "sse" && this.state.lastEventId)
            requestHeaders.set(
              "Last-Event-ID",
              streamLastEventIdHeader(this.state.lastEventId),
            );
          handshake = setTimeout(
            () => this.stop("handshake-timeout"),
            c.handshakeMs,
          );
          response = await abortable<Response>(
            Promise.resolve().then(async () => {
              const fetched = await this.fetcher(c.url, {
                method: c.method,
                body: c.method === "POST" ? c.body : undefined,
                headers: requestHeaders,
                signal: controller.signal,
                credentials: "omit",
                redirect: "error",
                cache: "no-store",
                mode: "cors",
              });
              if (controller.signal.aborted) {
                try {
                  void fetched.body?.cancel().catch(() => {});
                } catch {}
                throw new StreamError("cancelled");
              }
              return fetched;
            }),
            controller.signal,
          );
          clearTimeout(handshake);
          handshake = null;
          if (this.reason) break;
          this.update({ httpStatus: response.status });
          if (response.status === 204) {
            this.stop("no-content");
            break;
          }
          if (c.format === "sse" ? response.status !== 200 : !response.ok) {
            this.stop("http");
            break;
          }
          const mime =
            response.headers
              .get("Content-Type")
              ?.split(";", 1)[0]
              .trim()
              .toLowerCase() ?? "";
          if (
            c.requireContentType &&
            (c.format === "sse"
              ? mime !== "text/event-stream"
              : ![
                  "application/x-ndjson",
                  "application/ndjson",
                  "application/jsonl",
                ].includes(mime))
          ) {
            this.stop("mime");
            break;
          }
          if (!response.body) {
            this.stop("network");
            break;
          }
          this.reader = response.body.getReader();
          decoder = new StreamingDecoder(c.format, c, this.state.lastEventId);
          this.update({ status: "streaming" });
          resetIdle();
          const emit = (frame: import("./streaming-http").StreamFrame) => {
            if (this.reason) return false;
            if (performance.now() - this.origin >= c.durationMs) {
              this.stop("duration-limit");
              return false;
            }
            const atMs = elapsed();
            this.firstRecord ??= atMs;
            const record: StreamRecord = {
              ...frame,
              sequence: this.state.records + 1,
              atMs,
              connection: this.state.connections,
            };
            this.update({
              records: record.sequence,
              lastEventId: decoder!.lastEventId,
            });
            this.observer.onRecord(record);
            if (c.stopText && frame.data === c.stopText) this.stop("sentinel");
            else if (this.state.records >= c.maxRecords)
              this.stop("record-limit");
            return !this.reason;
          };
          while (!this.reason) {
            const part = await abortable(this.reader.read(), controller.signal);
            if (this.reason) break;
            if (performance.now() - this.origin >= c.durationMs) {
              this.stop("duration-limit");
              break;
            }
            if (part.done) {
              decoder.finish(emit);
              retryable = !this.reason;
              attemptEnd = "eof";
              break;
            }
            if (
              !ArrayBuffer.isView(part.value) ||
              Object.prototype.toString.call(part.value) !==
                "[object Uint8Array]"
            )
              throw new StreamError("framing");
            if (!part.value.byteLength) continue;
            const received = this.state.bytes + part.value.byteLength;
            if (received > MAX_STREAM_BYTES) {
              this.stop("limit");
              break;
            }
            this.update({ bytes: received });
            resetIdle();
            const before = decoder.comments;
            try {
              decoder.push(part.value, emit);
            } finally {
              this.update({
                comments: this.state.comments + decoder.comments - before,
                lastEventId: decoder.lastEventId,
                retryMs: decoder.retryMs ?? this.state.retryMs,
              });
            }
          }
        } catch (error) {
          if (!this.reason) {
            const code: StreamErrorCode = streamError(error).code;
            if (code === "network") retryable = true;
            else
              this.stop(
                ["json", "utf8", "framing", "limit", "headers"].includes(code)
                  ? (code as StreamStop)
                  : "network",
              );
          }
        } finally {
          if (handshake !== null) clearTimeout(handshake);
          if (idle !== null) clearTimeout(idle);
          if (this.reader) {
            try {
              void this.reader.cancel().catch(() => {});
            } catch {}
            try {
              this.reader.releaseLock();
            } catch {}
            this.reader = null;
          } else if (response?.body && !response.body.locked) {
            try {
              void response.body.cancel().catch(() => {});
            } catch {}
          }
        }
        if (this.reason) break;
        if (
          !retryable ||
          c.format !== "sse" ||
          c.method !== "GET" ||
          this.state.connections > c.reconnects
        ) {
          this.stop(attemptEnd);
          break;
        }
        if (this.state.retryMs > 30000) {
          this.stop("retry-limit");
          break;
        }
        this.update({ status: "waiting" });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await abortable(
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, this.state.retryMs);
            }),
            controller.signal,
          );
        } catch {
          /* stop() already records the terminal reason. */
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      }
    } finally {
      clearTimeout(overall);
      signal?.removeEventListener("abort", abort);
      this.update({ status: "closed", reason: this.reason ?? "network" });
    }
    return {
      kind: "rsswag-streaming-session-report",
      version: 1,
      mode: "live",
      reason: this.reason ?? "network",
      connections: this.state.connections,
      records: this.state.records,
      bytes: this.state.bytes,
      comments: this.state.comments,
      elapsedMs: elapsed(),
      firstRecordMs: this.firstRecord,
      httpStatus: this.state.httpStatus,
    };
  }
}
