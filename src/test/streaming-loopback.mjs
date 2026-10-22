// Exercise native Fetch/ReadableStream outside jsdom against a real HTTP server.
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
const { StreamingSession } = loadSource("../lib/streaming-session.ts");
const { emptyStreamProject } = loadSource("../lib/streaming-http.ts");

async function main() {
  const sockets = new Set(),
    requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body,
    });
    if (request.url === "/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
      });
      const cursor = request.headers["last-event-id"];
      const payload = cursor
        ? "id:\n\ndata: second\n\n"
        : 'retry: 0\nid: 事件🌍\nevent: task\ndata: {"title":"Привет 🌍"}\r\n\r\n';
      const bytes = Buffer.from(payload);
      response.write(bytes.subarray(0, bytes.length - 5));
      setImmediate(() => response.end(bytes.subarray(bytes.length - 5)));
    } else if (request.url === "/ndjson") {
      response.writeHead(200, { "Content-Type": "application/x-ndjson" });
      const bytes = Buffer.from('{"city":"東京 🌸"}\r\n42');
      response.write(bytes.subarray(0, 12));
      setImmediate(() => response.end(bytes.subarray(12)));
    } else if (request.url === "/hold") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write("data: waiting\n\n");
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const records = [];
    const sse = new StreamingSession(
      {
        ...emptyStreamProject().connection,
        url: url + "/events",
        reconnects: 1,
        retryMs: 0,
      },
      "{}",
      { onState() {}, onRecord: (r) => records.push(r) },
    );
    assert.deepEqual((await sse.run()).reason, "eof");
    assert.equal(records.length, 2);
    assert.equal(records[0].data, '{"title":"Привет 🌍"}');
    assert.equal(records[0].id, "事件🌍");
    assert.equal(records[1].id, "");
    const cursor = requests.filter((r) => r.url === "/events")[1].headers[
      "last-event-id"
    ];
    assert.equal(Buffer.from(cursor, "latin1").toString("utf8"), "事件🌍");
    const ndRecords = [];
    const nd = new StreamingSession(
      {
        ...emptyStreamProject().connection,
        url: url + "/ndjson",
        format: "ndjson",
        method: "POST",
        body: '{"stream":true}',
      },
      '{"Authorization":"Bearer loopback-test"}',
      { onState() {}, onRecord: (r) => ndRecords.push(r) },
    );
    assert.equal((await nd.run()).records, 2);
    assert.equal(ndRecords[0].data, '{"city":"東京 🌸"}');
    const posted = requests.find((r) => r.url === "/ndjson");
    assert.equal(posted.method, "POST");
    assert.equal(posted.body, '{"stream":true}');
    assert.equal(posted.headers.authorization, "Bearer loopback-test");
    assert.equal(posted.headers.cookie, undefined);
    const held = new StreamingSession(
      { ...emptyStreamProject().connection, url: url + "/hold" },
      "{}",
      {
        onState() {},
        onRecord() {
          held.stop();
        },
      },
    );
    assert.equal((await held.run()).reason, "cancelled");
    process.stdout.write(
      "Streaming HTTP loopback passed: SSE resume, POST NDJSON, cancellation.\n",
    );
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}
await main();
