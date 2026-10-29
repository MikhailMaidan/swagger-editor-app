import { describe, expect, it, vi } from "vitest";
import { generateRateMiddleware } from "./rate-export";
import {
  createRateLimiter,
  type RateDecision,
  type RateIdentity,
} from "./rate-engine";
import { demoRateProject } from "./rate-studio";
import { newRateRule, type RatePolicy } from "./rate-project";
async function artifact(policy: RatePolicy) {
  const source = generateRateMiddleware(policy);
  const exported = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )) as {
    createRateLimiter: () => {
      take: (q: RateIdentity, time: number) => RateDecision;
      reset: () => void;
    };
    createRateLimitMiddleware: (options: {
      identify: (request: Request) => unknown;
      handler: (
        request: Request,
        decision: RateDecision,
      ) => Response | Promise<Response>;
      now?: () => number;
    }) => (request: Request) => Promise<Response>;
  };
  return { source, ...exported };
}
const q = (cost = 1) => ({
  client: "a",
  route: "/orders",
  method: "GET",
  cost,
});
describe("standalone Fetch quota middleware", () => {
  it("charges concurrent admissions before asynchronous handlers start business work", async () => {
    const policy = { id: "p", name: "p", rules: [newRateRule()] },
      { createRateLimitMiddleware } = await artifact(policy);
    const handler = vi.fn(async () => {
      await Promise.resolve();
      return new Response(null, { status: 204 });
    });
    const middleware = createRateLimitMiddleware({
      identify: () => q(),
      handler,
      now: () => 0,
    });
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        middleware(new Request("https://local.example")),
      ),
    );
    expect(responses.filter((r) => r.status === 204)).toHaveLength(3);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(17);
    expect(handler).toHaveBeenCalledTimes(3);
  });
  it.each(["token", "sliding"] as const)(
    "keeps parity through nondefault %s refill/history boundaries",
    async (algorithm) => {
      const policy = {
        id: "p",
        name: "p",
        rules: [
          {
            ...newRateRule("r", algorithm),
            limit: algorithm === "sliding" ? 10000 : 3,
            refillTokens: 2,
            refillMs: 3,
            windowMs: 10000,
          },
        ],
      };
      const { createRateLimiter: create } = await artifact(policy),
        server = create(),
        browser = createRateLimiter(policy);
      for (let now = 0; now < 140; now++)
        expect(server.take(q(), now)).toEqual(browser.take(q(), now));
    },
  );
  it.each(["token", "fixed", "sliding", "stacked"])(
    "executes actual %s ESM with parity against the browser engine",
    async (id) => {
      const p = demoRateProject(),
        policy = p.policies.find((p) => p.id === id)!,
        exported = await artifact(policy);
      for (const scenario of p.scenarios) {
        const browser = createRateLimiter(policy),
          server = exported.createRateLimiter();
        const rows = scenario.requests
          .map((request, index) => ({ request, index }))
          .sort((a, b) => a.request.atMs - b.request.atMs || a.index - b.index);
        for (const { request } of rows)
          expect(server.take(request, request.atMs)).toEqual(
            browser.take(request, request.atMs),
          );
      }
      expect(exported.source).not.toContain("client-a");
    },
  );
  it("returns 429 with rounded Retry-After/no-store and preserves admitted request bodies", async () => {
    const policy = {
        id: "p",
        name: "p",
        rules: [{ ...newRateRule(), limit: 1 }],
      },
      { createRateLimitMiddleware } = await artifact(policy);
    const handler = vi.fn(
      async (request: Request) =>
        new Response(await request.text(), { status: 201 }),
    );
    let now = 0;
    const middleware = createRateLimitMiddleware({
      identify: () => q(),
      handler,
      now: () => now,
    });
    expect(
      await (
        await middleware(
          new Request("https://local.example", {
            method: "POST",
            body: "exact-body",
          }),
        )
      ).text(),
    ).toBe("exact-body");
    now = 1;
    const response = await middleware(
      new Request("https://local.example", {
        method: "POST",
        body: "never forwarded",
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "rate_limited",
      retryAfterMs: 999,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    now = 1000;
    expect(
      (
        await middleware(
          new Request("https://local.example", { method: "POST" }),
        )
      ).status,
    ).toBe(201);
  });
  it("returns 503 for bounded-state refusals and treats impossible costs as unbounded retries", async () => {
    const policy = {
        id: "p",
        name: "p",
        rules: [{ ...newRateRule(), keyCapacity: 1 }],
      },
      { createRateLimitMiddleware } = await artifact(policy);
    let client = "a",
      cost = 1;
    const handler = vi.fn(() => new Response(null, { status: 204 })),
      middleware = createRateLimitMiddleware({
        identify: () => ({ ...q(cost), client }),
        handler,
        now: () => 0,
      });
    expect(
      (await middleware(new Request("https://local.example"))).status,
    ).toBe(204);
    client = "b";
    expect(
      (await middleware(new Request("https://local.example"))).status,
    ).toBe(503);
    client = "a";
    cost = 4;
    const response = await middleware(new Request("https://local.example"));
    expect(response.status).toBe(429);
    expect(response.headers.has("retry-after")).toBe(false);
  });
  it("refuses invalid identities, asynchronous classifiers and backward clocks without forwarding", async () => {
    const policy = { id: "p", name: "p", rules: [newRateRule()] },
      { createRateLimitMiddleware } = await artifact(policy),
      handler = vi.fn(() => new Response("ok"));
    const bad = createRateLimitMiddleware({
      identify: () => ({ ...q(), cost: 0 }),
      handler,
    });
    expect((await bad(new Request("https://local.example"))).status).toBe(400);
    const asynchronous = createRateLimitMiddleware({
      identify: async () => {
        throw new Error("private failure");
      },
      handler,
    });
    expect(
      (await asynchronous(new Request("https://local.example"))).status,
    ).toBe(400);
    let now = 100;
    const clock = createRateLimitMiddleware({
      identify: () => q(),
      handler,
      now: () => now,
    });
    await clock(new Request("https://local.example"));
    now = 99;
    const response = await clock(new Request("https://local.example"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private failure");
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("charges at admission even if the application fails and returns no entity for HEAD refusals", async () => {
    const policy = {
        id: "p",
        name: "p",
        rules: [{ ...newRateRule(), limit: 1 }],
      },
      { createRateLimitMiddleware } = await artifact(policy);
    const middleware = createRateLimitMiddleware({
      identify: () => q(),
      handler: () => {
        throw new Error("application failed");
      },
      now: () => 0,
    });
    await expect(
      middleware(new Request("https://local.example")),
    ).rejects.toThrow("application failed");
    const response = await middleware(
      new Request("https://local.example", { method: "HEAD" }),
    );
    expect(response.status).toBe(429);
    expect(await response.text()).toBe("");
  });
  it("handles untrusted policy strings as data and resets only on explicit request", async () => {
    const policy = {
      id: "p",
      name: "</script>${private}",
      rules: [
        {
          ...newRateRule("__proto__", "fixed"),
          name: '"; throw Error("injected"); //',
          limit: 1,
        },
      ],
    };
    const { createRateLimiter: create } = await artifact(policy),
      limiter = create();
    expect(limiter.take(q(), 0).allowed).toBe(true);
    expect(limiter.take(q(), 0).allowed).toBe(false);
    limiter.reset();
    expect(limiter.take(q(), 0).allowed).toBe(true);
  });
});
