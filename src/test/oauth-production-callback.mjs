// Run after next build. Verify the emitted callback script, not just its TS source.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { once } from "node:events";
import { JSDOM, VirtualConsole } from "jsdom";
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const child = spawn(
  process.execPath,
  [
    path.resolve("node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { windowsHide: true, stdio: "ignore" },
);
let dom;
try {
  const base = `http://127.0.0.1:${port}`,
    state = "a".repeat(43),
    url = `${base}/oauth/callback?state=${state}&code=production-private-code`;
  let response;
  for (let i = 0; i < 100; i++) {
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(500) });
      break;
    } catch {
      if (child.exitCode !== null)
        throw new Error("Production server exited before callback validation");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(response?.ok, "Production callback did not start");
  const html = await response.text();
  assert.ok(!html.includes("production-private-code"));
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  const sent = [],
    errors = [],
    console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error));
  dom = new JSDOM(html, {
    url,
    runScripts: "dangerously",
    virtualConsole: console,
    beforeParse(window) {
      window.BroadcastChannel = class {
        constructor(name) {
          assert.equal(name, "rsswag-oauth:" + state);
        }
        postMessage(value) {
          sent.push(value);
        }
        close() {}
      };
    },
  });
  assert.equal(dom.window.location.search, "");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, "rsswag-oauth-callback");
  assert.equal(sent[0].url, url);
  assert.equal(errors.length, 0, errors.map((e) => e.message).join("; "));
  assert.ok(
    dom.window.document
      .getElementById("callback-status")
      .textContent.includes("Return to the OAuth studio"),
  );
  process.stdout.write(
    "Production OAuth callback passed: standalone script, query scrubbing, state-bound delivery, no reflected credentials.\n",
  );
} finally {
  dom?.window.close();
  const exited = once(child, "exit");
  child.kill();
  let timer;
  try {
    await Promise.race([
      exited,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
