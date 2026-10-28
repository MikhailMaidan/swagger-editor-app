import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OAuthSession,
  discoverOAuthProfile,
  oauthHttp,
  runOAuthOfflineDemo,
} from "./oauth-session";
import { demoOAuthProject, oauthPkceChallenge } from "./oauth-studio";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const profile = () => demoOAuthProject().profiles[0];
const token = (patch = {}) => ({
  access_token: "private-access",
  token_type: "Bearer",
  refresh_token: "private-refresh",
  expires_in: 3600,
  ...patch,
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const callback = (state: string) =>
  `https://app.example/oauth/callback?as=${encodeURIComponent(profile().issuer)}&iss=${encodeURIComponent(profile().issuer)}&state=${state}&code=private-code`;
async function authorized(fetcher: typeof fetch, now = () => 1000) {
  const session = new OAuthSession(profile(), () => {}, { fetcher, now });
  const auth = await session.prepare("https://app.example/oauth/callback");
  await session.acceptCallback(callback(auth.state));
  return session;
}
describe("OAuth authorization sessions", () => {
  it("exchanges a code once using the original redirect and matching S256 verifier", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(token())),
      session = new OAuthSession(profile(), () => {}, {
        fetcher,
        now: () => 1000,
      });
    const auth = await session.prepare("https://app.example/oauth/callback");
    await session.acceptCallback(callback(auth.state));
    const form = new URLSearchParams(String(fetcher.mock.calls[0][1]?.body));
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("private-code");
    expect(form.get("redirect_uri")).toBe(
      new URL(auth.url).searchParams.get("redirect_uri"),
    );
    expect(await oauthPkceChallenge(form.get("code_verifier")!)).toBe(
      new URL(auth.url).searchParams.get("code_challenge"),
    );
    expect(session.snapshot()).toMatchObject({
      phase: "ready",
      hasAccessToken: true,
      hasRefreshToken: true,
      expiresAt: 3601000,
    });
    expect(session.accessToken()).toBe("private-access");
    await expect(
      session.acceptCallback(callback(auth.state)),
    ).rejects.toThrowError("state");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      mode: "cors",
      method: "POST",
    });
  });
  it("keeps pending authorization after unrelated state but consumes a provider denial", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(token())),
      session = new OAuthSession(profile(), () => {}, { fetcher });
    const auth = await session.prepare("https://app.example/oauth/callback");
    await expect(
      session.acceptCallback(callback("wrong")),
    ).rejects.toThrowError("state");
    expect(session.snapshot().phase).toBe("awaiting-authorization");
    await expect(
      session.acceptCallback(
        callback(auth.state).replace(
          "code=private-code",
          "error=access_denied&error_description=private-message",
        ),
      ),
    ).rejects.toThrowError("oauth-error");
    expect(session.snapshot()).toMatchObject({
      phase: "error",
      remote: "access_denied",
    });
    await expect(
      session.acceptCallback(callback(auth.state)),
    ).rejects.toThrowError("state");
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(session.report())).not.toContain("private-message");
  });
  it("never exposes authorization codes, verifiers or token values through reports/snapshots", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(token())),
      session = await authorized(fetcher),
      source = JSON.stringify({
        snapshot: session.snapshot(),
        report: session.report(),
      });
    for (const secret of [
      "private-access",
      "private-refresh",
      "private-code",
      "code_verifier",
      "identity.example",
    ])
      expect(source).not.toContain(secret);
    expect(session.tokenValues()).toEqual({
      accessToken: "private-access",
      refreshToken: "private-refresh",
    });
  });
  it("retains narrowed scopes and rotates or preserves refresh tokens correctly", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(token({ scope: "read" })))
      .mockResolvedValueOnce(
        json({
          access_token: "rotated-access",
          token_type: "Bearer",
          refresh_token: "rotated-refresh",
          expires_in: 10,
        }),
      )
      .mockResolvedValueOnce(
        json({ access_token: "final-access", token_type: "Bearer" }),
      );
    const session = await authorized(fetcher);
    await session.refresh();
    expect(session.tokenValues()).toEqual({
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
    });
    expect(session.snapshot().scope).toBe("read");
    await session.refresh();
    expect(session.tokenValues()?.refreshToken).toBe("rotated-refresh");
    expect(session.snapshot().expiresAt).toBeNull();
    expect(
      new URLSearchParams(String(fetcher.mock.calls[2][1]?.body)).get(
        "refresh_token",
      ),
    ).toBe("rotated-refresh");
  });
  it("retains the previous token on failed refresh and rejects expired-token handoff", async () => {
    let now = 1000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(token({ expires_in: 1 })))
      .mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
    const session = await authorized(fetcher, () => now);
    await expect(session.refresh()).rejects.toThrowError("oauth-error");
    expect(session.accessToken()).toBe("private-access");
    now = 2000;
    expect(session.snapshot().hasAccessToken).toBe(false);
    expect(() => session.accessToken()).toThrowError("unavailable");
  });
  it("revokes the selected token using a form and clears local credentials only on success", async () => {
    const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(token()))
        .mockResolvedValueOnce(new Response(null, { status: 200 })),
      session = await authorized(fetcher);
    await session.revoke("refresh");
    const form = new URLSearchParams(String(fetcher.mock.calls[1][1]?.body));
    expect(form.get("token")).toBe("private-refresh");
    expect(form.get("token_type_hint")).toBe("refresh_token");
    expect(session.tokenValues()).toBeNull();
    expect(session.snapshot().phase).toBe("revoked");
  });
  it("rejects overlapping operations and disposes cancelled/stale responses", async () => {
    const cancel = vi.fn();
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
      session = new OAuthSession(profile(), () => {}, { fetcher });
    const auth = await session.prepare("https://app.example/oauth/callback"),
      pending = session.acceptCallback(callback(auth.state)).catch((e) => e);
    await Promise.resolve();
    await expect(session.startDevice()).rejects.toThrowError("busy");
    session.dispose();
    expect(await pending).toHaveProperty("code", "cancelled");
    resolve(json(token()));
    await Promise.resolve();
    expect(session.tokenValues()).toBeNull();
    // A late body is actively discarded even when the fetch implementation ignores AbortSignal.
    const abort = new AbortController();
    let late!: (r: Response) => void;
    const request = oauthHttp(profile().tokenEndpoint, {
      timeoutMs: 1000,
      signal: abort.signal,
      fetcher: vi.fn(
        () =>
          new Promise<Response>((r) => {
            late = r;
          }),
      ),
    }).catch((e) => e);
    await Promise.resolve();
    abort.abort();
    expect(await request).toHaveProperty("code", "cancelled");
    late(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
  it("binds the in-flight flow to an immutable profile", async () => {
    const original = profile(),
      session = new OAuthSession(original);
    original.tokenEndpoint = "https://attacker.example/token";
    expect(session.profile.tokenEndpoint).toBe(
      "https://identity.example/token",
    );
    expect(() => {
      session.profile.tokenEndpoint = "https://other.example";
    }).toThrow();
  });
});
describe("device authorization scheduling", () => {
  it("reserves the polling interval before an in-flight request so cancellation cannot cause a rapid retry", async () => {
    let now = 0;
    const waits: number[] = [],
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          json({
            device_code: "x",
            user_code: "x",
            verification_uri: "https://identity.example/verify",
            expires_in: 60,
            interval: 1,
          }),
        )
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockResolvedValueOnce(json(token()));
    const session = new OAuthSession(profile(), () => {}, {
      fetcher,
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await session.startDevice();
    const pending = session.pollDevice().catch((e) => e);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    session.cancel();
    expect(await pending).toHaveProperty("code", "cancelled");
    await session.pollDevice();
    expect(waits).toEqual([1000, 1000]);
    expect(session.snapshot().phase).toBe("ready");
  });
  it("waits before every poll, handles pending and persists the five-second slowdown", async () => {
    let now = 1000;
    const waits: number[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          device_code: "private-device",
          user_code: "ABCD",
          verification_uri: "https://identity.example/verify",
          expires_in: 60,
          interval: 1,
        }),
      )
      .mockResolvedValueOnce(json({ error: "authorization_pending" }, 400))
      .mockResolvedValueOnce(json({ error: "slow_down" }, 400))
      .mockResolvedValueOnce(json(token()));
    const session = new OAuthSession(profile(), () => {}, {
      fetcher,
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await session.startDevice();
    expect(session.deviceView()).toMatchObject({ userCode: "ABCD" });
    await session.pollDevice();
    expect(waits).toEqual([1000, 1000, 6000]);
    expect(session.snapshot()).toMatchObject({ phase: "ready", polls: 3 });
    expect(JSON.stringify(session.report())).not.toContain("private-device");
    expect(JSON.stringify(session.report())).not.toContain("ABCD");
  });
  it("does not poll at or after grant expiry", async () => {
    let now = 0;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      json({
        device_code: "x",
        user_code: "x",
        verification_uri: "https://identity.example/verify",
        expires_in: 1,
        interval: 1,
      }),
    );
    const session = new OAuthSession(profile(), () => {}, {
      fetcher,
      now: () => now,
      wait: async (ms) => {
        now += ms;
      },
    });
    await session.startDevice();
    await expect(session.pollDevice()).rejects.toThrowError("expired");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("ends on denial without retrying or leaking provider descriptions", async () => {
    let now = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          device_code: "x",
          user_code: "x",
          verification_uri: "https://identity.example/verify",
          expires_in: 60,
          interval: 1,
        }),
      )
      .mockResolvedValueOnce(
        json({ error: "access_denied", error_description: "private" }, 400),
      );
    const session = new OAuthSession(profile(), () => {}, {
      fetcher,
      now: () => now,
      wait: async (ms) => {
        now += ms;
      },
    });
    await session.startDevice();
    await expect(session.pollDevice()).rejects.toMatchObject({
      remote: "access_denied",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(session.report())).not.toContain("private");
  });
  it("cancels waiting without polling and supports resuming the same device grant", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          device_code: "x",
          user_code: "x",
          verification_uri: "https://identity.example/verify",
          expires_in: 60,
        }),
      )
      .mockResolvedValueOnce(json(token()));
    const session = new OAuthSession(profile(), () => {}, { fetcher });
    await session.startDevice();
    const pending = session.pollDevice().catch((e) => e);
    session.cancel();
    expect(await pending).toHaveProperty("code", "cancelled");
    expect(fetcher).toHaveBeenCalledOnce();
    const resumed = session.pollDevice();
    await vi.advanceTimersByTimeAsync(5000);
    await resumed;
    expect(session.snapshot().phase).toBe("ready");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("runs the offline lifecycle without any ambient network and prevents applying synthetic tokens", async () => {
    const ambient = vi.fn();
    vi.stubGlobal("fetch", ambient);
    const session = await runOAuthOfflineDemo();
    expect(session.snapshot()).toMatchObject({
      source: "demo",
      phase: "ready",
      polls: 3,
    });
    expect(() => session.accessToken()).toThrowError("unavailable");
    expect(ambient).not.toHaveBeenCalled();
    await session.revoke("refresh");
    expect(session.snapshot().phase).toBe("revoked");
  });
});
describe("bounded OAuth HTTP and discovery", () => {
  it("loads metadata explicitly and checks the issuer before applying endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      json({
        issuer: profile().issuer,
        token_endpoint: "https://identity.example/v2/token",
      }),
    );
    const discovered = await discoverOAuthProfile(
      profile(),
      undefined,
      fetcher,
    );
    expect(discovered.tokenEndpoint).toBe("https://identity.example/v2/token");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://identity.example/.well-known/oauth-authorization-server",
    );
  });
  it("bounds streamed responses and cancels oversized or invalid media bodies", async () => {
    for (const oversized of [true, false]) {
      const cancel = vi.fn(),
        response = new Response(
          new ReadableStream({
            start(c) {
              if (oversized) c.enqueue(new Uint8Array(65537));
            },
            cancel,
          }),
          {
            headers: {
              "Content-Type": oversized ? "application/json" : "text/html",
            },
          },
        );
      await expect(
        oauthHttp(profile().tokenEndpoint, {
          timeoutMs: 1000,
          fetcher: vi.fn().mockResolvedValueOnce(response),
        }),
      ).rejects.toThrowError(oversized ? "limit" : "json");
      expect(cancel).toHaveBeenCalled();
    }
  });
  it("times out stalled reads, omits credentials, rejects redirects and sanitizes errors", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(),
      fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const result = oauthHttp(profile().tokenEndpoint, {
      timeoutMs: 100,
      fetcher,
    }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toHaveProperty("code", "timeout");
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    const redirect = json({});
    Object.defineProperty(redirect, "redirected", { value: true });
    await expect(
      oauthHttp(profile().tokenEndpoint, {
        timeoutMs: 100,
        fetcher: vi.fn().mockResolvedValueOnce(redirect),
      }),
    ).rejects.toThrowError("network");
  });
});
