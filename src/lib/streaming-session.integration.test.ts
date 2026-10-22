import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("native streaming HTTP interoperability", () => {
  it("streams real SSE and POST NDJSON, forwards UTF-8 resume ids and cancels an open response", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.resolve("src/test/streaming-loopback.mjs")],
      { timeout: 12000 },
    );
    expect(stdout).toContain(
      "Streaming HTTP loopback passed: SSE resume, POST NDJSON, cancellation.",
    );
  }, 15000);
});
