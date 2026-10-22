import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("native paginated HTTP collection", () => {
  it("collects real Link/cursor pages, replays recorded responses, and bounds redirects, origins, reads, and deadlines", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.resolve("src/test/collection-loopback.mjs")],
      { timeout: 12000 },
    );
    expect(stdout).toContain(
      "Collection loopback passed: links, cursors, UTF-8, fixtures, origin, redirect, timeout, byte limits.",
    );
  }, 15000);
});
