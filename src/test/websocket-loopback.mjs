// Run the real transport outside jsdom, whose DOM globals conflict with Node events.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
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
// Transpile the actual application modules in memory; no generated files/dependencies.
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
  const resolved = request.startsWith("@/")
    ? path.join(sourceRoot, request.slice(2))
    : request;
  return originalResolve.call(this, resolved, parent, ...options);
};
const { WsSession } = loadSource("../lib/websocket-session.ts");

async function main() {
  const server = createServer();
  const sockets = new Set();
  server.on("upgrade", (request, socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const accept = createHash("sha1")
      .update(
        `${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
      )
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const frame = (opcode, payload) =>
      Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
    socket.write(frame(1, Buffer.from('{"type":"welcome"}')));
    let pending = Buffer.alloc(0);
    socket.on("data", (data) => {
      pending = Buffer.concat([pending, data]);
      while (pending.length >= 2) {
        const opcode = pending[0] & 15;
        const length = pending[1] & 127;
        // The local fixture exchanges short, complete, masked client messages.
        if (length > 125 || !(pending[1] & 128)) {
          socket.destroy();
          return;
        }
        if (pending.length < 6 + length) return;
        const mask = pending.subarray(2, 6);
        const body = Buffer.from(pending.subarray(6, 6 + length));
        for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
        pending = pending.subarray(6 + length);
        if (opcode === 8) {
          socket.end(frame(8, body));
          return;
        }
        if (opcode === 1 || opcode === 2) socket.write(frame(opcode, body));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  let closed;
  const closing = new Promise((resolve) => {
    closed = resolve;
  });
  const NativeSocket =
    globalThis.WebSocket ?? (await import("undici")).WebSocket;
  const session = new WsSession(
    {
      url: `ws://127.0.0.1:${address.port}/events`,
      protocols: [],
      timeoutMs: 5000,
    },
    {
      onState: (state) => {
        if (state.status === "closed") closed();
      },
      onMessage: () => {},
    },
    {
      bufferIncoming: true,
      factory: (url, protocols) => new NativeSocket(url, protocols),
    },
  );
  try {
    await session.connect();
    assert.equal((await session.receive(1000)).data, '{"type":"welcome"}');
    session.send({ format: "json", data: '{"type":"echo","id":7}' });
    const json = await session.receive(1000);
    assert.equal(json.format, "json");
    assert.equal(json.data, '{"type":"echo","id":7}');
    session.send({ format: "binary", data: "AAEC/w==" });
    const binary = await session.receive(1000);
    assert.equal(binary.format, "binary");
    assert.equal(binary.data, "AAEC/w==");
    assert.equal(binary.bytes, 4);
    session.close();
    await closing;
    assert.equal(session.state.closeCode, 1000);
    assert.equal(session.state.wasClean, true);
  } finally {
    session.dispose("closed");
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  process.stdout.write(
    "WebSocket loopback passed: JSON, binary, clean close.\n",
  );
}
main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
