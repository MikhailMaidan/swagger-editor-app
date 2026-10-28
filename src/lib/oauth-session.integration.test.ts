import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
describe("native OAuth HTTP interoperability", () => {
  it("performs S256 authorization-code and device lifecycles with a local authorization server", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.resolve("src/test/oauth-loopback.mjs")],
      { timeout: 12000 },
    );
    expect(stdout).toContain(
      "OAuth loopback passed: metadata, S256 code exchange, rotation, revocation, device slowdown, redirects, deadlines, credential-free reports.",
    );
  }, 15000);
});
