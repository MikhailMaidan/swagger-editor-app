import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseOpenApiSchema } from "./openapi";
import { createNodeMockServer } from "./node-mock-server";

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info:
  title: People API
  version: 3.0.0
paths:
  /users/{id}:
    get:
      operationId: getUser
      summary: Get user
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
        - name: expand
          in: query
          required: true
          schema: { type: string }
        - name: X-Tenant
          in: header
          required: true
          schema: { type: string }
      responses:
        '200':
          description: User
          headers:
            X-Mock-Source:
              schema: { type: string }
              example: rsswag
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: string }
              example:
                id: user-42
        '404':
          description: Missing
          content:
            application/json:
              schema:
                type: object
                properties:
                  error: { type: string }
              example:
                error: Not found
  /users:
    post:
      operationId: createUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  created: { type: boolean }
              example:
                created: true
    delete:
      deprecated: true
      description: '<script>unsafe()</script>'
      responses:
        '204':
          description: Deleted`);

if (!parsed.ok) {
  throw new Error(parsed.error);
}

const schema = parsed.value;
const openServers: Array<{
  close: (callback: (error?: Error) => void) => void;
}> = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

async function importGeneratedServer(source: string) {
  const sourceUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Date.now()}-${Math.random()}`;
  return (await import(sourceUrl)) as {
    createMockServer: (options?: {
      cors?: boolean;
      defaultDelayMs?: number;
      quiet?: boolean;
      validateRequiredInputs?: boolean;
    }) => {
      address: () => AddressInfo | string | null;
      close: (callback: (error?: Error) => void) => void;
      listen: (port: number, callback: () => void) => void;
    };
    matchRoute: (
      method: string,
      pathname: string,
    ) => { parameters: Record<string, string> } | null;
    routes: Array<{ method: string; path: string; statuses: string[] }>;
  };
}

async function listenOnAvailablePort(server: {
  address: () => AddressInfo | string | null;
  close: (callback: (error?: Error) => void) => void;
  listen: (port: number, callback: () => void) => void;
}) {
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock server did not expose a TCP address.");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("createNodeMockServer", () => {
  it("serializes routes, variants, defaults, and deprecated filtering", () => {
    const build = createNodeMockServer(
      schema.endpoints,
      { title: schema.title, version: schema.version },
      {
        cors: false,
        defaultDelayMs: 125,
        defaultPort: 5050,
        includeDeprecated: false,
      },
    );

    expect(build.summary).toEqual({
      bodyVariantCount: 3,
      deprecatedExcludedCount: 1,
      responseVariantCount: 3,
      routeCount: 2,
    });
    expect(build.routes).toEqual([
      expect.objectContaining({
        defaultStatus: 200,
        method: "GET",
        path: "/users/{id}",
        responseStatuses: ["200", "404"],
      }),
      expect.objectContaining({
        defaultStatus: 201,
        method: "POST",
        path: "/users",
        responseStatuses: ["201"],
      }),
    ]);
    expect(build.source).toContain('"cors": false');
    expect(build.source).toContain('"defaultDelayMs": 125');
    expect(build.source).toContain('"defaultPort": 5050');
    expect(build.source).not.toContain("<script>unsafe()</script>");
  });

  it("generates a runnable server with validation and response selection", async () => {
    const build = createNodeMockServer(
      schema.endpoints,
      { title: schema.title, version: schema.version },
      { defaultDelayMs: 0 },
    );
    const generated = await importGeneratedServer(build.source);
    const server = generated.createMockServer({ quiet: true });
    const baseUrl = await listenOnAvailablePort(server);

    expect(generated.routes).toHaveLength(3);
    expect(
      generated.matchRoute("GET", "/users/hello%20world")?.parameters,
    ).toEqual({ id: "hello world" });

    const missingInputs = await fetch(`${baseUrl}/users/user-42`);
    expect(missingInputs.status).toBe(400);
    expect(await missingInputs.json()).toEqual({
      error: "Required request inputs are missing.",
      missing: ["query:expand", "header:X-Tenant"],
    });

    const success = await fetch(`${baseUrl}/users/user-42?expand=team`, {
      headers: { "X-Tenant": "acme" },
    });
    expect(success.status).toBe(200);
    expect(success.headers.get("access-control-allow-origin")).toBe("*");
    expect(success.headers.get("x-mock-source")).toBe("rsswag");
    expect(await success.json()).toEqual({ id: "user-42" });

    const notFound = await fetch(
      `${baseUrl}/users/user-42?expand=team&__status=404`,
      { headers: { "X-Tenant": "acme" } },
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "Not found" });

    const undocumented = await fetch(
      `${baseUrl}/users/user-42?expand=team&__status=418`,
      { headers: { "X-Tenant": "acme" } },
    );
    expect(undocumented.status).toBe(400);
    expect(await undocumented.json()).toEqual({
      availableStatuses: ["200", "404"],
      error: "Requested mock status is not documented.",
    });

    const missingBody = await fetch(`${baseUrl}/users`, { method: "POST" });
    expect(missingBody.status).toBe(400);
    expect(await missingBody.json()).toEqual({
      error: "Required request inputs are missing.",
      missing: ["body"],
    });

    const created = await fetch(`${baseUrl}/users`, {
      body: JSON.stringify({ name: "Sam" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ created: true });
  });

  it("serves metadata routes, CORS preflight, and unmatched-route errors", async () => {
    const build = createNodeMockServer(
      schema.endpoints,
      { title: schema.title, version: schema.version },
      { defaultPort: Number.NaN },
    );
    const generated = await importGeneratedServer(build.source);
    const server = generated.createMockServer({ quiet: true });
    const baseUrl = await listenOnAvailablePort(server);

    expect(build.source).toContain('"defaultPort": 4010');

    const health = await fetch(`${baseUrl}/__rsswag/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      ok: true,
      schema: { title: "People API", version: "3.0.0" },
    });

    const routeIndex = await fetch(`${baseUrl}/__rsswag/routes`);
    const routePayload = (await routeIndex.json()) as {
      routes: Array<{ method: string; path: string }>;
    };
    expect(routePayload.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "GET", path: "/users/{id}" }),
        expect.objectContaining({ method: "POST", path: "/users" }),
      ]),
    );

    const preflight = await fetch(`${baseUrl}/users`, {
      headers: { "Access-Control-Request-Method": "POST" },
      method: "OPTIONS",
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    const unmatched = await fetch(`${baseUrl}/unknown`);
    expect(unmatched.status).toBe(404);
    expect(await unmatched.json()).toEqual({
      error: "No mock route matched.",
      method: "GET",
      path: "/unknown",
    });
  });
});
