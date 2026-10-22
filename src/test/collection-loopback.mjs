// Keep native Fetch outside jsdom and execute the real TypeScript runner.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const loadSource = createRequire(import.meta.url);
loadSource.extensions[".ts"] = (module, file) => {
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, file);
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...options) {
  return originalResolve.call(
    this,
    request.startsWith("@/")
      ? path.join(sourceRoot, request.slice(2))
      : request,
    parent,
    ...options,
  );
};
const { defaultCollectionPlan } = loadSource("../lib/api-collection.ts");
const { runCollection, collectionFixturesFromRun, collectionRunReport } =
  loadSource("../lib/api-collection-runner.ts");

const sockets = new Set(),
  requests = [];
const server = createServer((request, response) => {
  requests.push({
    url: request.url,
    headers: request.headers,
    method: request.method,
  });
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/redirect") {
    response.writeHead(302, { Location: "/never-follow" });
    response.end();
    return;
  }
  if (url.pathname === "/hold") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"items":[');
    return;
  }
  if (url.pathname === "/cross") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        items: [{ id: 1 }],
        next: "https://other.example/private",
      }),
    );
    return;
  }
  if (!["/link", "/cursor"].includes(url.pathname)) {
    response.writeHead(404);
    response.end();
    return;
  }
  const second = url.searchParams.has("cursor") || url.searchParams.has("page");
  const items = second
    ? [{ id: 2, name: "Cedar" }]
    : [
        { id: 1, name: "Привет 🌍" },
        { id: 2, name: "Birch" },
      ];
  response.writeHead(200, {
    "Content-Type": "application/vnd.example+json; charset=utf-8",
    "Set-Cookie": "private=never-retain",
    ...(!second && url.pathname === "/link"
      ? { Link: '<?page=2>; rel="next"; title="Next, page"' }
      : {}),
  });
  const bytes = Buffer.from(
    JSON.stringify({ items, next: second ? null : "opaque+/= &" }),
  );
  // Split a multi-byte character between native stream chunks.
  const split = bytes.indexOf(Buffer.from("🌍")) + 2;
  response.write(bytes.subarray(0, split > 2 ? split : 8));
  setImmediate(() => response.end(bytes.subarray(split > 2 ? split : 8)));
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const plan = {
    ...defaultCollectionPlan(),
    url: origin + "/link",
    strategy: "link",
    deduplicate: "last",
    minRecords: 2,
    expectedMaxRecords: 2,
    maxDuplicates: 1,
  };
  const link = await runCollection(plan, {
    mode: "live",
    headers: '{"Authorization":"Bearer local-secret"}',
  });
  assert.equal(link.reason, "complete");
  assert.equal(link.passed, true);
  assert.equal(link.pages.length, 2);
  assert.deepEqual(link.records, [
    { id: 1, name: "Привет 🌍" },
    { id: 2, name: "Cedar" },
  ]);
  assert.equal(requests[1].url, "/link?page=2");
  assert.ok(
    requests.every(
      (r) =>
        r.method === "GET" &&
        r.headers.cookie === undefined &&
        r.headers.authorization === "Bearer local-secret",
    ),
  );
  const captured = collectionFixturesFromRun(link);
  assert.ok(captured.every((f) => f.headers["set-cookie"] === undefined));
  const before = requests.length,
    replay = await runCollection(plan, { mode: "offline", fixtures: captured });
  assert.deepEqual(replay.records, link.records);
  assert.equal(replay.passed, true);
  assert.equal(requests.length, before);
  const cursor = await runCollection(
    { ...plan, strategy: "cursor", url: origin + "/cursor" },
    { mode: "live" },
  );
  assert.equal(cursor.passed, true);
  assert.equal(
    new URL(origin + requests.at(-1).url).searchParams.get("cursor"),
    "opaque+/= &",
  );
  const cross = await runCollection(
    { ...plan, strategy: "next-url", url: origin + "/cross" },
    { mode: "live" },
  );
  assert.equal(cross.reason, "origin");
  assert.equal(cross.pages.length, 1);
  const redirect = await runCollection(
    { ...plan, url: origin + "/redirect" },
    { mode: "live" },
  );
  assert.equal(redirect.reason, "network");
  assert.ok(!requests.some((r) => r.url === "/never-follow"));
  const timeout = await runCollection(
    { ...plan, url: origin + "/hold", requestTimeoutMs: 100 },
    { mode: "live" },
  );
  assert.equal(timeout.reason, "timeout");
  const limited = await runCollection(
    { ...plan, maxBytes: 10 },
    { mode: "live" },
  );
  assert.equal(limited.reason, "max-bytes");
  assert.deepEqual(limited.records, []);
  assert.ok(!JSON.stringify(collectionRunReport([link])).includes("Привет"));
  process.stdout.write(
    "Collection loopback passed: links, cursors, UTF-8, fixtures, origin, redirect, timeout, byte limits.\n",
  );
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}
