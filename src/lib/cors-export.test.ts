import { describe, expect, it, vi } from "vitest";
import { generateCorsMiddleware } from "./cors-export";
import { defaultCorsPolicy } from "./cors-project";
import { corsApplyPolicy, corsPolicyHeaders } from "./cors-protocol";
type Module = {
  corsPolicy: ReturnType<typeof defaultCorsPolicy>;
  withCors: (
    handler: (
      this: unknown,
      request: Request,
      ...args: unknown[]
    ) => Response | Promise<Response>,
  ) => (request: Request, ...args: unknown[]) => Promise<Response>;
};
async function generated(policy = defaultCorsPolicy()): Promise<Module> {
  const source = generateCorsMiddleware(policy);
  // Use Node's native ESM loader: exercise the actual standalone artifact.
  return import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
}
const origin = "https://app.example";
describe("generated Fetch CORS middleware", () => {
  it("forwards application handler arguments and its invocation context", async () => {
    const { withCors } = await generated();
    const wrapped = withCors(function (this: unknown, request, ...args) {
      return Response.json({
        context: (this as { label: string }).label,
        method: request.method,
        args,
      });
    });
    const response = await wrapped.call(
      { label: "application" },
      new Request("https://api.example/items"),
      { binding: "env" },
      { waitUntil: true },
    );
    expect(await response.json()).toEqual({
      context: "application",
      method: "GET",
      args: [{ binding: "env" }, { waitUntil: true }],
    });
  });
  it("executes standalone ESM and answers preflights without invoking the application", async () => {
    const { withCors } = await generated(),
      handler = vi.fn(() => Response.json({ ok: true }));
    const response = await withCors(handler)(
      new Request("https://api.example/items", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "PUT",
          "access-control-request-headers": "authorization,content-type",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(handler).not.toHaveBeenCalled();
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("vary")).toContain(
      "access-control-request-method",
    );
  });
  it("preserves application status, body and headers while replacing old CORS metadata", async () => {
    const { withCors } = await generated(),
      wrap = withCors(
        () =>
          new Response("application-error", {
            status: 422,
            headers: {
              "x-app": "yes",
              vary: "Accept-Encoding",
              "access-control-allow-origin": "*",
              "access-control-allow-methods": "*",
            },
          }),
      );
    const response = await wrap(
      new Request("https://api.example/items", { headers: { origin } }),
    );
    expect(response.status).toBe(422);
    expect(await response.text()).toBe("application-error");
    expect(response.headers.get("x-app")).toBe("yes");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
    expect(response.headers.get("vary")).toBe("accept-encoding, origin");
  });
  it("does not treat CORS as authorization or stop ordinary disallowed-origin requests reaching the app", async () => {
    const { withCors } = await generated(),
      handler = vi.fn(
        () =>
          new Response("handled", {
            headers: { "access-control-allow-origin": "*" },
          }),
      );
    const response = await withCors(handler)(
      new Request("https://api.example/items", {
        headers: { origin: "https://untrusted.example" },
      }),
    );
    expect(handler).toHaveBeenCalledOnce();
    expect(await response.text()).toBe("handled");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBe("origin");
  });
  it("preserves requests without Origin, ordinary OPTIONS, and existing Vary:*", async () => {
    const { withCors } = await generated(),
      handler = vi.fn(
        () => new Response("options", { headers: { vary: "*" } }),
      );
    const response = await withCors(handler)(
      new Request("https://api.example/items", { method: "OPTIONS" }),
    );
    expect(handler).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBe("*");
  });
  it("freezes policy arrays and refuses inconsistent credential wildcard exports", async () => {
    const m = await generated();
    expect(Object.isFrozen(m.corsPolicy)).toBe(true);
    expect(Object.isFrozen(m.corsPolicy.origins)).toBe(true);
    const p = defaultCorsPolicy();
    for (const change of [
      { origins: ["*"] },
      { methods: ["*"] },
      { requestHeaders: ["*"] },
      { exposeHeaders: ["*"] },
    ])
      expect(() =>
        generateCorsMiddleware({ ...p, ...change } as typeof p),
      ).toThrow("export");
  });
  it("produces the same preflight headers as the studio's generated-policy preview", async () => {
    const p = defaultCorsPolicy(),
      { withCors } = await generated(p);
    const response = await withCors(() => new Response())(
      new Request("https://api.example/items", {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      }),
    );
    expect(Object.fromEntries(response.headers)).toEqual(
      corsApplyPolicy({}, corsPolicyHeaders(p, origin, true)),
    );
  });
  it("supports explicit null/public origins and safely quotes source literals", async () => {
    const p = {
        ...defaultCorsPolicy(),
        origins: ["null"],
        name: 'ignored "; throw new Error("injected")',
      },
      m = await generated(p);
    const response = await m.withCors(() => Response.json({ ok: true }))(
      new Request("https://api.example/items", { headers: { origin: "null" } }),
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("null");
    expect(generateCorsMiddleware(p)).not.toContain("injected");
    const publicModule = await generated({
      ...defaultCorsPolicy(),
      origins: ["*"],
      credentials: false,
    });
    expect(
      (
        await publicModule.withCors(() => new Response())(
          new Request("https://api.example/items", { headers: { origin } }),
        )
      ).headers.get("access-control-allow-origin"),
    ).toBe("*");
  });
  it("keeps handler failures and Response.error behavior intact", async () => {
    const { withCors } = await generated();
    await expect(
      withCors(() => {
        throw new Error("application failure");
      })(new Request("https://api.example/items")),
    ).rejects.toThrow("application failure");
    const response = Response.error();
    expect(
      await withCors(() => response)(new Request("https://api.example/items")),
    ).toBe(response);
  });
});
