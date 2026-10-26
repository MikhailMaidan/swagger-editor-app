import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("native SOAP HTTP interoperability", () => {
  it("sends SOAP 1.1/1.2 to a real HTTP service, preserves fault responses, and cancels bounded reads", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.resolve("src/test/soap-loopback.mjs")],
      { timeout: 12000 },
    );
    expect(stdout).toContain(
      "SOAP loopback passed: 1.1/1.2 bindings, exact POST XML, UTF-8, HTTP 500 faults, redirects, deadlines, cancellation.",
    );
  }, 15000);
});
