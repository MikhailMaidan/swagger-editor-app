import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateWebhookVerifier } from "./webhook-export";
import { demoHookProject } from "./webhook-studio";
import { MAX_HOOK_BODY, hookBody } from "./webhook-project";
import { verifyHookDelivery } from "./webhook-crypto";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
type Result = {
  accepted: boolean;
  signature: string;
  freshness: string;
  keyId: string | null;
  findings: string[];
  body: Uint8Array | null;
  error?: string;
};
async function generated(provider = "standard") {
  const { project, secrets } = await demoHookProject(),
    profile = project.profiles.find((p) => p.provider === provider)!;
  const source = generateWebhookVerifier(profile, project.keys);
  const artifact = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )) as {
    createWebhookVerifier: (options: {
      secrets?: Record<string, string>;
      now?: () => number;
      timeoutMs?: number;
    }) => (r: Request) => Promise<Result>;
  };
  return {
    project,
    profile,
    secrets,
    source,
    create: artifact.createWebhookVerifier,
  };
}
describe("standalone webhook verifier artifact", () => {
  it.each(["github", "stripe", "standard"])(
    "executes exported ESM with the same %s decisions as the browser core",
    async (provider) => {
      const { project, profile, secrets, create, source } =
        await generated(provider);
      for (const d of project.deliveries.filter(
        (d) => d.profileId === profile.id,
      )) {
        const now = project.clockSeconds + d.atSeconds,
          verify = create({ secrets, now: () => now });
        const result = await verify(
          new Request("https://receiver.example", {
            method: "POST",
            headers: JSON.parse(d.headers),
            body: hookBody(d) as BodyInit,
          }),
        );
        const expected = await verifyHookDelivery(
          profile,
          project.keys,
          secrets,
          d,
          now,
        );
        expect(result).toMatchObject({
          accepted: expected.accepted,
          signature: expected.signature,
          freshness: expected.freshness,
          keyId: expected.keyId,
          findings: expected.findings,
        });
        expect(result.body ? Array.from(result.body) : null).toEqual(
          result.accepted ? Array.from(hookBody(d)) : null,
        );
      }
      for (const secret of Object.values(secrets))
        expect(source).not.toContain(secret);
      expect(source).not.toContain("demo-only");
    },
  );
  it("bounds raw body bytes and never returns unverified bodies", async () => {
    const { create } = await generated();
    const verify = create({});
    expect(await verify(new Request("https://receiver.example"))).toMatchObject(
      { accepted: false, error: "method", body: null },
    );
    expect(
      await verify(
        new Request("https://receiver.example", {
          method: "POST",
          body: "x".repeat(MAX_HOOK_BODY + 1),
        }),
      ),
    ).toMatchObject({ accepted: false, error: "limit", body: null });
  });
  it("times out stalled bodies, responds to abort, and cancels the reader", async () => {
    const { create } = await generated();
    const cancel = vi.fn();
    const request = new Request("https://receiver.example", {
      method: "POST",
      body: new ReadableStream({ cancel }),
      duplex: "half",
    } as RequestInit);
    expect(await create({ timeoutMs: 100 })(request)).toMatchObject({
      error: "timeout",
      body: null,
    });
    expect(cancel).toHaveBeenCalled();
    const abort = new AbortController();
    abort.abort();
    expect(
      await create({})(
        new Request("https://receiver.example", {
          method: "POST",
          signal: abort.signal,
        }),
      ),
    ).toMatchObject({ error: "cancelled" });
  });
  it("discards verification results when cancellation occurs during crypto", async () => {
    const { create, project, secrets } = await generated(),
      d = project.deliveries[0],
      abort = new AbortController();
    const native = webcrypto.subtle.verify.bind(webcrypto.subtle);
    vi.spyOn(webcrypto.subtle, "verify").mockImplementation(async (...args) => {
      const value = await native(...args);
      abort.abort();
      return value;
    });
    expect(
      await create({ secrets, now: () => project.clockSeconds })(
        new Request("https://receiver.example", {
          method: "POST",
          headers: JSON.parse(d.headers),
          body: hookBody(d) as BodyInit,
          signal: abort.signal,
        }),
      ),
    ).toMatchObject({ accepted: false, error: "cancelled", body: null });
  });
  it("times out stalled crypto without retaining or exposing payload bytes", async () => {
    const { create, project, secrets } = await generated(),
      d = project.deliveries[0];
    vi.spyOn(webcrypto.subtle, "verify").mockImplementation(
      () => new Promise<boolean>(() => {}),
    );
    const result = await create({
      secrets,
      timeoutMs: 100,
      now: () => project.clockSeconds,
    })(
      new Request("https://receiver.example", {
        method: "POST",
        headers: JSON.parse(d.headers),
        body: hookBody(d) as BodyInit,
      }),
    );
    expect(result).toMatchObject({
      accepted: false,
      error: "timeout",
      body: null,
    });
  });
  it("bounds a stream of zero-length chunks even when timer callbacks are starved", async () => {
    const { create } = await generated(),
      cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array());
      },
      cancel,
    });
    expect(
      await create({ timeoutMs: 100 })(
        new Request("https://receiver.example", {
          method: "POST",
          body: stream,
          duplex: "half",
        } as RequestInit),
      ),
    ).toMatchObject({ accepted: false, error: "timeout", body: null });
    expect(cancel).toHaveBeenCalled();
  });
});
