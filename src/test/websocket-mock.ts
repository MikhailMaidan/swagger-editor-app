import { vi } from "vitest";

export class MockWebSocket extends EventTarget {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  bufferedAmount = 0;
  binaryType: BinaryType = "blob";
  protocol = "";
  onSend?: (data: string | ArrayBuffer) => void;
  constructor(
    public url: string,
    public protocols: string[] = [],
  ) {
    super();
    MockWebSocket.instances.push(this);
  }
  send = vi.fn((data: string | ArrayBuffer) => this.onSend?.(data));
  close = vi.fn((code = 1000, reason = "") => this.serverClose(code, reason));
  open(protocol = this.protocols[0] ?? "") {
    this.readyState = 1;
    this.protocol = protocol;
    this.dispatchEvent(new Event("open"));
  }
  message(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  serverClose(code = 1000, reason = "", wasClean = true) {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close", { code, reason, wasClean }));
  }
  error() {
    this.dispatchEvent(new Event("error"));
  }
}
