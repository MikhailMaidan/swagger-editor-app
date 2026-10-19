import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("native WebSocket interoperability", () => {
  it("exchanges JSON and binary messages and closes cleanly over a real loopback connection", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.resolve("src/test/websocket-loopback.mjs")],
      { timeout: 12000 },
    );
    expect(stdout).toContain(
      "WebSocket loopback passed: JSON, binary, clean close.",
    );
  }, 15000);
});
