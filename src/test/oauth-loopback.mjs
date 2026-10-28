// Execute the real OAuth state machine/transport with native Fetch and WebCrypto.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const sourceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  ),
  loadSource = createRequire(import.meta.url);
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
const { OAuthSession, discoverOAuthProfile, oauthHttp } = loadSource(
    "../lib/oauth-session.ts",
  ),
  { defaultOAuthProfile } = loadSource("../lib/oauth-studio.ts");
const sockets = new Set(),
  requests = [];
let challenge = "",
  devicePolls = 0;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const part of request) body += part;
  const form = new URLSearchParams(body);
  requests.push({
    url: request.url,
    method: request.method,
    headers: request.headers,
    form,
  });
  const json = (value, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(value));
  };
  if (request.url === "/.well-known/oauth-authorization-server") {
    json({
      issuer: origin,
      authorization_endpoint: origin + "/authorize",
      token_endpoint: origin + "/token",
      device_authorization_endpoint: origin + "/device",
      revocation_endpoint: origin + "/revoke",
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
    });
    return;
  }
  if (request.url === "/redirect") {
    response.writeHead(302, { Location: "/never" });
    response.end();
    return;
  }
  if (request.url === "/hold") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"access_token":');
    return;
  }
  if (request.url === "/device") {
    json({
      device_code: "private-device",
      user_code: "LOCAL-CODE",
      verification_uri: origin + "/verify",
      expires_in: 120,
      interval: 1,
    });
    return;
  }
  if (request.url === "/revoke") {
    assert.equal(form.get("token"), "rotated-refresh");
    response.writeHead(200);
    response.end();
    return;
  }
  if (request.url === "/token") {
    assert.equal(form.get("client_id"), "loopback-public-client");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(
      request.headers["content-type"],
      "application/x-www-form-urlencoded",
    );
    if (form.get("grant_type") === "authorization_code") {
      assert.equal(form.get("code"), "loopback-code");
      assert.equal(
        createHash("sha256")
          .update(form.get("code_verifier"))
          .digest("base64url"),
        challenge,
      );
      json({
        access_token: "private-access",
        refresh_token: "private-refresh",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "read",
      });
      return;
    }
    if (form.get("grant_type") === "refresh_token") {
      assert.equal(form.get("refresh_token"), "private-refresh");
      json({
        access_token: "rotated-access",
        refresh_token: "rotated-refresh",
        token_type: "Bearer",
        expires_in: 3600,
      });
      return;
    }
    if (++devicePolls === 1) {
      json({ error: "authorization_pending" }, 400);
      return;
    }
    if (devicePolls === 2) {
      json({ error: "slow_down" }, 400);
      return;
    }
    assert.equal(form.get("device_code"), "private-device");
    json({
      access_token: "device-access",
      token_type: "Bearer",
      expires_in: 60,
    });
    return;
  }
  json(
    { error: "invalid_request", error_description: "private-description" },
    400,
  );
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
  const base = {
      ...defaultOAuthProfile(),
      issuer: origin,
      metadataUrl: "",
      clientId: "loopback-public-client",
    },
    profile = await discoverOAuthProfile(base);
  const session = new OAuthSession(profile),
    auth = await session.prepare("http://localhost:3000/oauth/callback");
  challenge = new URL(auth.url).searchParams.get("code_challenge");
  await session.acceptCallback(
    `${new URL(auth.url).searchParams.get("redirect_uri")}&iss=${encodeURIComponent(origin)}&state=${auth.state}&code=loopback-code`,
  );
  assert.equal(session.accessToken(), "private-access");
  await session.refresh();
  assert.equal(session.accessToken(), "rotated-access");
  assert.equal(session.snapshot().scope, "read");
  await session.revoke("refresh");
  assert.equal(session.tokenValues(), null);
  let now = Date.now();
  const waits = [],
    device = new OAuthSession(profile, () => {}, {
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
  await device.startDevice();
  await device.pollDevice();
  assert.deepEqual(waits, [1000, 1000, 6000]);
  assert.equal(device.accessToken(), "device-access");
  const report = JSON.stringify({
    code: session.report(),
    device: device.report(),
  });
  for (const value of [
    "private-access",
    "private-refresh",
    "private-device",
    "LOCAL-CODE",
    "loopback-code",
    "code_verifier",
    "rotated-access",
  ])
    assert.ok(!report.includes(value));
  await assert.rejects(
    oauthHttp(origin + "/redirect", { timeoutMs: 1000 }),
    (e) => e.code === "network",
  );
  assert.ok(!requests.some((r) => r.url === "/never"));
  await assert.rejects(
    oauthHttp(origin + "/hold", { timeoutMs: 100 }),
    (e) => e.code === "timeout",
  );
  session.dispose();
  device.dispose();
  process.stdout.write(
    "OAuth loopback passed: metadata, S256 code exchange, rotation, revocation, device slowdown, redirects, deadlines, credential-free reports.\n",
  );
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}
