// Test the real TypeScript HTTP transport with native Node Fetch, outside jsdom.
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
const { sendSoapRequest } = loadSource("../lib/soap-transport.ts");
const ns11 = "http://schemas.xmlsoap.org/soap/envelope/",
  ns12 = "http://www.w3.org/2003/05/soap-envelope";
const envelope = (ns, body) =>
  `<s:Envelope xmlns:s="${ns}"><s:Body>${body}</s:Body></s:Envelope>`;
const success = envelope(
  ns11,
  '<Result xmlns="urn:customer">Привет 🌍</Result>',
);
const fault = envelope(
  ns12,
  '<s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Customer missing</s:Text></s:Reason></s:Fault>',
);
const sockets = new Set(),
  requests = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const part of request) body += part;
  requests.push({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body,
  });
  if (request.url === "/redirect") {
    response.writeHead(302, { Location: "/never" });
    response.end();
    return;
  }
  if (request.url === "/hold") {
    response.writeHead(200, { "Content-Type": "text/xml" });
    response.write("<waiting>");
    return;
  }
  if (request.url === "/v12") {
    response.writeHead(500, {
      "Content-Type": "application/soap+xml; charset=utf-8",
      "Set-Cookie": "private=omit",
    });
    response.end(fault);
    return;
  }
  if (request.url === "/v11") {
    response.writeHead(200, { "Content-Type": "text/xml; charset=utf-8" });
    const bytes = Buffer.from(success),
      split = bytes.indexOf(Buffer.from("🌍")) + 2;
    response.write(bytes.subarray(0, split));
    setImmediate(() => response.end(bytes.subarray(split)));
    return;
  }
  response.writeHead(404);
  response.end();
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
  const input = {
    url: origin + "/v11",
    version: "1.1",
    action: "urn:customer:Get",
    xml: envelope(ns11, '<Get xmlns="urn:customer"><id>7</id></Get>'),
    timeoutMs: 1000,
    headers: '{"Authorization":"Bearer local-only"}',
  };
  const one = await sendSoapRequest(input);
  assert.equal(one.status, 200);
  assert.equal(one.body, success);
  assert.equal(one.bytes, Buffer.byteLength(success));
  assert.equal(requests[0].body, input.xml);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].headers.soapaction, '"urn:customer:Get"');
  assert.equal(requests[0].headers["content-type"], "text/xml; charset=utf-8");
  assert.equal(requests[0].headers.authorization, "Bearer local-only");
  assert.equal(requests[0].headers.cookie, undefined);
  const two = await sendSoapRequest({
    ...input,
    url: origin + "/v12",
    version: "1.2",
    xml: envelope(ns12, '<Get xmlns="urn:customer"/>'),
  });
  assert.equal(two.status, 500);
  assert.equal(two.body, fault);
  assert.equal(requests[1].headers.soapaction, undefined);
  assert.equal(
    requests[1].headers["content-type"],
    'application/soap+xml; charset=utf-8; action="urn:customer:Get"',
  );
  await assert.rejects(
    sendSoapRequest({ ...input, url: origin + "/redirect" }),
    (e) => e.code === "network",
  );
  assert.ok(!requests.some((r) => r.url === "/never"));
  await assert.rejects(
    sendSoapRequest({ ...input, url: origin + "/hold", timeoutMs: 100 }),
    (e) => e.code === "timeout",
  );
  const abort = new AbortController(),
    pending = sendSoapRequest({
      ...input,
      url: origin + "/hold",
      signal: abort.signal,
    });
  const timer = setTimeout(() => abort.abort(), 30);
  try {
    await assert.rejects(pending, (e) => e.code === "cancelled");
  } finally {
    clearTimeout(timer);
  }
  process.stdout.write(
    "SOAP loopback passed: 1.1/1.2 bindings, exact POST XML, UTF-8, HTTP 500 faults, redirects, deadlines, cancellation.\n",
  );
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}
