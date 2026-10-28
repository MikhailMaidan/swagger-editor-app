import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOAuthMetadata,
  createOAuthAuthorization,
  defaultOAuthProfile,
  demoOAuthProject,
  normalizeOAuthProfile,
  oauthMetadataUrl,
  oauthPkceChallenge,
  oauthCallbackUri,
  oauthUrl,
  parseOAuthCallback,
  parseOAuthDevice,
  parseOAuthProject,
  parseOAuthToken,
  serializeOAuthProject,
} from "./oauth-studio";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const profile = () => demoOAuthProject().profiles[0];
describe("OAuth public profiles", () => {
  it("clears absent metadata endpoints and rejects discovery on a different origin", () => {
    const updated = applyOAuthMetadata(profile(), {
      issuer: profile().issuer,
      token_endpoint: "https://identity.example/token-v2",
    });
    expect(updated).toMatchObject({
      authorizationEndpoint: "",
      deviceEndpoint: "",
      revocationEndpoint: "",
    });
    expect(() =>
      oauthMetadataUrl({
        ...profile(),
        metadataUrl:
          "https://other.example/.well-known/oauth-authorization-server",
      }),
    ).toThrowError("metadata");
    expect(() =>
      applyOAuthMetadata(profile(), { issuer: profile().issuer }),
    ).toThrowError("metadata");
  });
  it("round-trips portable profiles and strips credential/session metadata", () => {
    const p = demoOAuthProject(),
      imported = parseOAuthProject(
        JSON.stringify({
          ...p,
          tokens: "private",
          profiles: p.profiles.map((p) => ({
            ...p,
            client_secret: "private",
            accessToken: "private",
            verifier: "private",
          })),
        }),
      );
    expect(imported).toEqual(p);
    expect(serializeOAuthProject(imported)).not.toContain("private");
  });
  it("rejects duplicate IDs, too many profiles, invalid scopes and deadlines", () => {
    const p = demoOAuthProject();
    expect(() =>
      parseOAuthProject(
        JSON.stringify({ ...p, profiles: [p.profiles[0], p.profiles[0]] }),
      ),
    ).toThrowError("project");
    for (const patch of [
      { scope: 'bad"scope' },
      { scope: "bad\tscope" },
      { timeoutMs: 0 },
      { timeoutMs: NaN },
    ])
      expect(() => normalizeOAuthProfile({ ...profile(), ...patch })).toThrow();
    expect(() => parseOAuthProject(" ".repeat(128 * 1024 + 1))).toThrowError(
      "limit",
    );
  });
  it.each([
    "http://identity.example/token",
    "https://user:password@identity.example",
    "https://identity.example/token#secret",
    "javascript:alert(1)",
    "/relative",
  ])("rejects insecure endpoint %s", (url) =>
    expect(() => oauthUrl(url)).toThrowError("url"),
  );
  it("allows HTTP only for literal loopback hosts and preserves issuer identity exactly", () => {
    expect(oauthUrl("http://localhost:3000/token")).toBe(
      "http://localhost:3000/token",
    );
    expect(oauthUrl("http://127.0.0.1:8000/token")).toBe(
      "http://127.0.0.1:8000/token",
    );
    expect(oauthUrl("https://identity.example", true)).toBe(
      "https://identity.example",
    );
    expect(() => oauthUrl("https://identity.example/?x=1", true)).toThrowError(
      "url",
    );
    expect(() => oauthUrl("http://localhost.evil.example/token")).toThrowError(
      "url",
    );
  });
  it("derives RFC 8414 discovery URLs and validates exact issuers and public/S256 support", () => {
    expect(
      oauthMetadataUrl({
        ...profile(),
        issuer: "https://identity.example/tenant",
      }),
    ).toBe(
      "https://identity.example/.well-known/oauth-authorization-server/tenant",
    );
    const metadata = {
      issuer: profile().issuer,
      authorization_endpoint: "https://login.example/authorize",
      token_endpoint: "https://identity.example/token-v2",
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    };
    expect(applyOAuthMetadata(profile(), metadata)).toMatchObject({
      requireIssuer: true,
      tokenEndpoint: metadata.token_endpoint,
    });
    expect(() =>
      applyOAuthMetadata(profile(), {
        ...metadata,
        issuer: metadata.issuer + "/",
      }),
    ).toThrowError("issuer");
    expect(() =>
      applyOAuthMetadata(profile(), {
        ...metadata,
        code_challenge_methods_supported: ["plain"],
      }),
    ).toThrowError("metadata");
    expect(() =>
      applyOAuthMetadata(profile(), {
        ...metadata,
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
      }),
    ).toThrowError("metadata");
  });
});
describe("S256 and authorization callbacks", () => {
  it("pins the redirect query to the issuer with identical displayed/request encoding", async () => {
    const p = { ...profile(), issuer: "https://identity.example/~tenant" },
      redirect = oauthCallbackUri("https://app.example", p.issuer);
    const auth = await createOAuthAuthorization(p, redirect, 0);
    expect(auth.redirectUri).toBe(redirect);
    expect(new URL(auth.url).searchParams.get("redirect_uri")).toBe(redirect);
    const wrong = new URL(auth.redirectUri);
    wrong.searchParams.set("state", auth.state);
    wrong.searchParams.set("code", "code");
    wrong.searchParams.set("as", "https://other.example");
    expect(() =>
      parseOAuthCallback(wrong.href, auth, { ...p, requireIssuer: false }, 1),
    ).toThrowError("issuer");
  });
  it("matches the RFC 7636 challenge test vector", async () => {
    expect(
      await oauthPkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("generates independent high-entropy state/verifiers and a code-only authorization URL", async () => {
    const pending = await createOAuthAuthorization(
        profile(),
        "https://app.example/oauth/callback",
        1000,
      ),
      second = await createOAuthAuthorization(
        profile(),
        pending.redirectUri,
        1000,
      ),
      url = new URL(pending.url);
    expect(pending.verifier).toHaveLength(43);
    expect(pending.state).toHaveLength(43);
    expect(pending.state).not.toBe(second.state);
    expect(pending.verifier).not.toBe(second.verifier);
    expect(pending.expiresAt).toBe(301000);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.href).not.toContain(pending.verifier);
  });
  it("accepts one matching code/issuer and rejects duplicate, implicit, mismatched or expired callbacks", async () => {
    const pending = await createOAuthAuthorization(
        profile(),
        "https://app.example/oauth/callback",
        0,
      ),
      base = pending.redirectUri + "&state=" + pending.state;
    expect(
      parseOAuthCallback(
        base + "&code=a%2Bb&iss=" + encodeURIComponent(profile().issuer),
        pending,
        { ...profile(), requireIssuer: true },
        100,
      ),
    ).toEqual({ code: "a+b" });
    for (const url of [
      base + "&code=a&code=b",
      base + "&code=a&state=duplicate",
      base + "&code=a&access_token=bad",
      base + "&code=a#access_token=bad",
      base.replace("app.example", "other.example") + "&code=a",
      base + "&code=a&error=access_denied",
    ])
      expect(() => parseOAuthCallback(url, pending, profile(), 100)).toThrow();
    expect(() =>
      parseOAuthCallback(
        pending.redirectUri + "&state=wrong&code=x",
        pending,
        profile(),
        100,
      ),
    ).toThrowError("state");
    expect(() =>
      parseOAuthCallback(
        base + "&code=a&iss=https://other.example",
        pending,
        profile(),
        100,
      ),
    ).toThrowError("issuer");
    expect(() =>
      parseOAuthCallback(base + "&code=a", pending, profile(), 300000),
    ).toThrowError("expired");
  });
  it("discards provider descriptions and supports only known value-free OAuth errors", async () => {
    const pending = await createOAuthAuthorization(
      profile(),
      "https://app.example/oauth/callback",
      0,
    );
    try {
      parseOAuthCallback(
        pending.redirectUri +
          `&state=${pending.state}&iss=${encodeURIComponent(profile().issuer)}&error=access_denied&error_description=private-password`,
        pending,
        profile(),
        100,
      );
    } catch (e) {
      expect(e).toMatchObject({ code: "oauth-error", remote: "access_denied" });
      expect(JSON.stringify(e)).not.toContain("private-password");
    }
    await expect(
      createOAuthAuthorization(defaultOAuthProfile(), pending.redirectUri),
    ).rejects.toThrowError("profile");
  });
});
describe("token/device response normalization", () => {
  it("normalizes bearer tokens, exact expiry, narrowed scope and rotated/omitted refresh tokens", () => {
    expect(
      parseOAuthToken(
        {
          access_token: "secret",
          token_type: "bearer",
          refresh_token: "new",
          expires_in: 60,
          scope: "read read",
        },
        "read write",
        "live",
        1000,
        "old",
      ),
    ).toMatchObject({
      tokenType: "Bearer",
      scope: "read",
      expiresAt: 61000,
      refreshToken: "new",
    });
    expect(
      parseOAuthToken(
        { access_token: "token", token_type: "Bearer" },
        "read",
        "live",
        0,
        "old",
      ),
    ).toMatchObject({ refreshToken: "old", expiresAt: null });
    expect(
      parseOAuthToken(
        { access_token: "token", token_type: "Bearer", expires_in: 0 },
        "",
        "live",
        10,
      ).expiresAt,
    ).toBe(10);
  });
  it.each([
    { access_token: "bad\r\nvalue", token_type: "Bearer" },
    { access_token: "token", token_type: "DPoP" },
    { access_token: "token", token_type: "Bearer", expires_in: -1 },
    { access_token: "token", token_type: "Bearer", expires_in: "3600" },
  ])("rejects malformed or unsupported token responses", (value) =>
    expect(() => parseOAuthToken(value, "", "live")).toThrow(),
  );
  it("uses the standard default polling interval and bounds device grants", () => {
    expect(
      parseOAuthDevice(
        {
          device_code: "private",
          user_code: "ABCD",
          verification_uri: "https://identity.example/verify",
          expires_in: 60,
        },
        1000,
      ),
    ).toMatchObject({ intervalMs: 5000, nextPollAt: 6000, expiresAt: 61000 });
    expect(() =>
      parseOAuthDevice({
        device_code: "x",
        user_code: "x",
        verification_uri: "http://other.example",
        expires_in: 60,
      }),
    ).toThrowError("url");
  });
});
