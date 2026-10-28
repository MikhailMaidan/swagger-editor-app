import { createHmac, webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_HOOK_BODY,
  MAX_HOOK_PROJECT,
  HookError,
  emptyHookProject,
  hookBase64,
  hookBody,
  hookDecode,
  normalizeHookProject,
  parseHookHeaders,
  parseHookProject,
  serializeHookProject,
  type HookDelivery,
  type HookProvider,
} from "./webhook-project";
import {
  generateHookSecret,
  hookSecret,
  signHookDelivery,
  verifyHookDelivery,
} from "./webhook-crypto";
import {
  demoHookProject,
  hookRunReport,
  hookVerificationReport,
  importHookHar,
  runHookDeliveries,
} from "./webhook-studio";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const secret = (provider: HookProvider) =>
  provider === "standard"
    ? "whsec_" + Buffer.alloc(32, 7).toString("base64")
    : "whsec_test_private_literal";
async function delivery(provider: HookProvider, body = "hello") {
  const project = emptyHookProject(),
    profile = project.profiles.find((p) => p.provider === provider)!;
  const d: HookDelivery = {
    ...project.deliveries[0],
    profileId: profile.id,
    body,
  };
  const secrets = { [`${provider}-key`]: secret(provider) };
  d.headers = await signHookDelivery(
    provider,
    d,
    [secret(provider)],
    project.clockSeconds,
    "msg_example",
  );
  return {
    project,
    profile,
    d,
    secrets,
    verify: (changed = d, now = project.clockSeconds) =>
      verifyHookDelivery(profile, project.keys, secrets, changed, now),
  };
}
describe("webhook signatures over exact bytes", () => {
  it("matches GitHub's independent published HMAC-SHA256 vector", async () => {
    const { project, profile, d } = await delivery("github", "Hello, World!");
    const source = await signHookDelivery(
      "github",
      d,
      ["It's a Secret to Everybody"],
      1700000000,
      "ignored",
    );
    expect(parseHookHeaders(source)["x-hub-signature-256"]).toBe(
      "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    );
    expect(
      (
        await verifyHookDelivery(
          profile,
          project.keys,
          { "github-key": "It's a Secret to Everybody" },
          { ...d, headers: source },
          project.clockSeconds,
        )
      ).accepted,
    ).toBe(true);
  });
  it.each(["github", "stripe", "standard"] as const)(
    "agrees with independent Node HMAC for %s and rejects changed bytes",
    async (provider) => {
      const { d, project, verify } = await delivery(provider, "Привет 😀\r\n");
      const data =
        provider === "github"
          ? d.body
          : provider === "stripe"
            ? `${project.clockSeconds}.${d.body}`
            : `msg_example.${project.clockSeconds}.${d.body}`;
      const mac = createHmac(
        "sha256",
        provider === "standard" ? Buffer.alloc(32, 7) : secret(provider),
      )
        .update(data)
        .digest();
      const h = parseHookHeaders(d.headers);
      expect(
        provider === "github"
          ? h["x-hub-signature-256"]
          : provider === "stripe"
            ? h["stripe-signature"]
            : h["webhook-signature"],
      ).toContain(
        provider === "standard" ? mac.toString("base64") : mac.toString("hex"),
      );
      expect((await verify()).accepted).toBe(true);
      expect(
        (await verify({ ...d, body: d.body.replace("\r\n", "\n") })).signature,
      ).toBe("invalid");
    },
  );
  it("verifies binary payloads without decoding or JSON reserialization", async () => {
    const { d, project, profile, secrets } = await delivery("standard");
    const binary = { ...d, encoding: "base64" as const, body: "AP9BgA==" };
    binary.headers = await signHookDelivery(
      "standard",
      binary,
      [secrets["standard-key"]],
      project.clockSeconds,
      "msg_example",
    );
    expect(
      (
        await verifyHookDelivery(
          profile,
          project.keys,
          secrets,
          binary,
          project.clockSeconds,
        )
      ).accepted,
    ).toBe(true);
    expect(Array.from(hookBody(binary))).toEqual([0, 255, 65, 128]);
  });
  it("authenticates Standard Webhooks IDs and timestamps and Stripe timestamps", async () => {
    for (const provider of ["standard", "stripe"] as const) {
      const { d, verify } = await delivery(provider);
      expect(
        (
          await verify({
            ...d,
            headers: d.headers.replace("1700000000", "1700000001"),
          })
        ).signature,
      ).toBe("invalid");
      if (provider === "standard")
        expect(
          (
            await verify({
              ...d,
              headers: d.headers.replace("msg_example", "msg_changed"),
            })
          ).signature,
        ).toBe("invalid");
    }
  });
  it("keeps signature validity separate from freshness, including exact boundaries and disabled enforcement", async () => {
    const { project, profile, d, secrets, verify } = await delivery("stripe");
    expect((await verify(d, project.clockSeconds + 300)).accepted).toBe(true);
    expect(await verify(d, project.clockSeconds + 301)).toMatchObject({
      accepted: false,
      signature: "valid",
      freshness: "expired",
    });
    expect((await verify(d, project.clockSeconds - 30)).accepted).toBe(true);
    expect((await verify(d, project.clockSeconds - 31)).freshness).toBe(
      "future",
    );
    expect(
      (
        await verifyHookDelivery(
          { ...profile, requireTimestamp: false },
          project.keys,
          secrets,
          d,
          project.clockSeconds + 301,
        )
      ).accepted,
    ).toBe(true);
  });
  it("does not trust GitHub delivery metadata for authenticated freshness", async () => {
    const { profile, project, d, secrets, verify } = await delivery("github");
    expect(await verify()).toMatchObject({
      accepted: true,
      freshness: "unavailable",
      signedId: null,
    });
    expect(
      (
        await verifyHookDelivery(
          { ...profile, requireTimestamp: true },
          project.keys,
          secrets,
          d,
          project.clockSeconds,
        )
      ).accepted,
    ).toBe(false);
  });
  it("tries all allowed active keys/signatures for rotation and ignores unknown algorithms", async () => {
    const { profile, project, d, secrets } = await delivery("standard");
    project.keys.push({
      id: "old-key",
      name: "old",
      provider: "standard",
      enabled: false,
    });
    profile.keyIds.push("old-key");
    const old = "whsec_" + Buffer.alloc(32, 8).toString("base64");
    d.headers = await signHookDelivery(
      "standard",
      d,
      [old, secrets["standard-key"]],
      project.clockSeconds,
      "msg_example",
    );
    const h = parseHookHeaders(d.headers);
    h["webhook-signature"] = "v1a,ignored " + h["webhook-signature"];
    d.headers = JSON.stringify(h);
    expect(
      await verifyHookDelivery(
        profile,
        project.keys,
        { ...secrets, "old-key": old },
        d,
        project.clockSeconds,
      ),
    ).toMatchObject({
      accepted: true,
      keyId: "standard-key",
      findings: ["unsupported-version"],
    });
    project.keys.find((k) => k.id === "standard-key")!.enabled = false;
    expect(
      (
        await verifyHookDelivery(
          profile,
          project.keys,
          secrets,
          d,
          project.clockSeconds,
        )
      ).findings,
    ).toContain("missing-key");
  });
  it.each([
    "t=1700000000,t=1700000000,v1=" + "a".repeat(64),
    "t=1700000000,v1=wrong",
    "t=01700000000,v1=" + "a".repeat(64),
    "t=1700000000,v0=" + "a".repeat(64),
  ])("rejects ambiguous/unsupported Stripe header %s", async (h) => {
    const { d, verify } = await delivery("stripe");
    expect(
      (
        await verify({
          ...d,
          headers: JSON.stringify({ "Stripe-Signature": h }),
        })
      ).accepted,
    ).toBe(false);
  });
  it("bounds signature work and rejects dot-delimited IDs and duplicate case-insensitive headers", async () => {
    const { d, verify } = await delivery("standard"),
      h = parseHookHeaders(d.headers);
    h["webhook-signature"] = Array(17).fill(h["webhook-signature"]).join(" ");
    expect(
      (await verify({ ...d, headers: JSON.stringify(h) })).findings,
    ).toContain("signature-limit");
    expect(
      (
        await verify({
          ...d,
          headers: d.headers.replace("msg_example", "msg.example"),
        })
      ).accepted,
    ).toBe(false);
    expect(() => parseHookHeaders('{"A":"1","a":"2"}')).toThrow("headers");
    expect(() => parseHookHeaders('{"A":"line\\r\\nline"}')).toThrow("headers");
  });
  it("distinguishes missing keys, missing headers and wrong secrets", async () => {
    const { d, profile, project, verify } = await delivery("github");
    expect((await verify({ ...d, headers: "{}" })).findings).toContain(
      "missing-header",
    );
    expect(
      (
        await verifyHookDelivery(
          profile,
          project.keys,
          {},
          d,
          project.clockSeconds,
        )
      ).signature,
    ).toBe("not-checked");
    expect(
      (
        await verifyHookDelivery(
          profile,
          project.keys,
          { "github-key": "wrong" },
          d,
          project.clockSeconds,
        )
      ).signature,
    ).toBe("invalid");
  });
  it("rejects signatures that would push captured headers beyond their limits", async () => {
    const { d, project, secrets } = await delivery("standard");
    d.headers = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 60 }, (_, i) => [`x-test-${i}`, "value"]),
      ),
    );
    await expect(
      signHookDelivery(
        "standard",
        d,
        [secrets["standard-key"]],
        project.clockSeconds,
        "msg_example",
      ),
    ).rejects.toMatchObject({ code: "headers" });
  });
  it("uses literal Stripe secrets and decoded Standard Webhooks secrets and generates correct test keys", () => {
    expect(Buffer.from(hookSecret("stripe", "whsec_AQID")).toString()).toBe(
      "whsec_AQID",
    );
    for (const provider of ["standard", "stripe", "github"] as const)
      expect(
        hookSecret(provider, generateHookSecret(provider)).length,
      ).toBeGreaterThanOrEqual(32);
    expect(() => hookSecret("standard", "whsec_AQID")).toThrow("key");
    expect(() => hookSecret("standard", "whsec_" + "-".repeat(43))).toThrow(
      "key",
    );
    expect(
      hookSecret("standard", secret("standard").replace(/=+$/, "")),
    ).toEqual(hookSecret("standard", secret("standard")));
  });
  it("stops an asynchronous verification when cancelled", async () => {
    const { project, profile, d, secrets } = await delivery("stripe");
    const check = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    await expect(
      verifyHookDelivery(
        profile,
        project.keys,
        secrets,
        d,
        project.clockSeconds,
        check,
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("webhook replay policies and portable projects", () => {
  it("runs all twelve offline demos including rotation, replay, tampering and binary data", async () => {
    const { project, secrets } = await demoHookProject(),
      run = await runHookDeliveries(project, secrets);
    expect(run.total).toBe(12);
    expect(run.rows.map((r) => [r.id, r.passed])).toEqual(
      run.rows.map((r) => [r.id, true]),
    );
    expect(run.duplicates).toBe(3);
    expect(run.rejected).toBe(4);
  });
  it("prunes expired replay entries, fails closed at capacity, and does not evict live entries", async () => {
    const { project, profile, d, secrets } = await delivery("standard");
    profile.capacity = 1;
    profile.ttlSeconds = 3;
    const next = {
      ...d,
      id: "next",
      name: "next",
      atSeconds: 1,
      expect: "capacity" as const,
    };
    next.headers = await signHookDelivery(
      "standard",
      next,
      [secrets["standard-key"]],
      project.clockSeconds,
      "another_id",
    );
    project.deliveries = [
      d,
      next,
      { ...d, id: "retry", name: "retry", atSeconds: 2, expect: "duplicate" },
      { ...next, id: "later", name: "later", atSeconds: 3, expect: "accepted" },
    ];
    const run = await runHookDeliveries(project, secrets);
    expect(run.passed).toBe(4);
    expect(run.rows.map((r) => r.cacheSize)).toEqual([1, 1, 1, 1]);
  });
  it("does not reserve replay identities for unauthenticated or stale events and sorts arrivals stably", async () => {
    const { project, d, secrets } = await delivery("standard");
    project.deliveries = [
      { ...d, id: "good", name: "good", atSeconds: 2 },
      {
        ...d,
        id: "bad",
        name: "bad",
        body: "tamper",
        atSeconds: 1,
        expect: "rejected",
      },
    ];
    const run = await runHookDeliveries(project, secrets);
    expect(run.passed).toBe(2);
    expect(run.rows.map((r) => r.id)).toEqual(["bad", "good"]);
  });
  it("lets an explicit replay-off policy accept repeated authenticated events", async () => {
    const { project, secrets } = await demoHookProject();
    project.profiles.forEach((p) => {
      p.replay = "off";
    });
    const run = await runHookDeliveries(project, secrets);
    expect(run.rows.find((r) => r.id === "standard-retry")!.outcome).toBe(
      "accepted",
    );
  });
  it("strips supplied secrets, results and unknown execution metadata on import/export", async () => {
    const { project } = await demoHookProject();
    const parsed = parseHookProject(
      JSON.stringify({
        ...project,
        secrets: { private: "never-export" },
        results: [{ passed: true }],
        keys: project.keys.map((k) => ({ ...k, secret: "never-export" })),
      }),
    );
    expect(serializeHookProject(parsed)).not.toContain("never-export");
    expect(parsed).toEqual(project);
  });
  it("exports reports without payloads, signature values, signed IDs, absolute timestamps or deduplication hashes", async () => {
    const { project, secrets } = await demoHookProject(),
      run = await runHookDeliveries(project, secrets),
      source = hookRunReport(run);
    for (const text of [
      ...Object.values(secrets),
      "evt_private",
      "demo-only",
      "msg_one",
      "1700000000",
      ...run.rows.map((r) => r.identity).filter((x): x is string => !!x),
    ])
      expect(source).not.toContain(text);
    expect(hookVerificationReport(run.rows[0].verification)).not.toContain(
      "msg_one",
    );
  });
  it("rejects coerced discriminators, duplicate identities, unsupported replay modes and dangling references", () => {
    const p = emptyHookProject();
    for (const changed of [
      { ...p, version: "1" },
      { ...p, keys: [p.keys[0], p.keys[0]] },
      { ...p, deliveries: [p.deliveries[0], p.deliveries[0]] },
      { ...p, profiles: [{ ...p.profiles[0], replay: ["body"] }] },
      { ...p, profiles: [{ ...p.profiles[0], replay: "signed-id" }] },
      { ...p, deliveries: [{ ...p.deliveries[0], profileId: "missing" }] },
    ])
      expect(() => normalizeHookProject(changed)).toThrow();
    expect(() => parseHookProject(" ".repeat(MAX_HOOK_PROJECT + 1))).toThrow(
      "limit",
    );
  });
  it("bounds payload bytes, rejects malformed Base64 and refuses silent UTF-8 surrogate replacement", () => {
    expect(hookBase64(hookDecode("AP8="))).toBe("AP8=");
    for (const text of ["A", "AB==", "AA", "AA-_", "AA==\n"])
      expect(() => hookDecode(text)).toThrow();
    expect(() =>
      hookBody({ encoding: "utf8", body: "😀".repeat(MAX_HOOK_BODY / 4 + 1) }),
    ).toThrow("limit");
    expect(() => hookBody({ encoding: "utf8", body: "\ud800" })).toThrow(
      "encoding",
    );
  });
  it("round-trips a project close to the byte limit with compact output and rejects oversized growth", () => {
    const p = emptyHookProject();
    p.deliveries = Array.from({ length: 8 }, (_, i) => ({
      ...p.deliveries[0],
      id: `large-${i}`,
      body: i < 7 ? "x".repeat(MAX_HOOK_BODY) : "",
    }));
    const size = (v: unknown) =>
      new TextEncoder().encode(JSON.stringify(v)).length;
    p.deliveries[7].body = "x".repeat(MAX_HOOK_PROJECT - 64 - size(p));
    const source = serializeHookProject(p);
    expect(source).toBe(JSON.stringify(p));
    expect(parseHookProject(source)).toEqual(p);
    expect(() => normalizeHookProject({ ...p, name: "x".repeat(120) })).toThrow(
      "limit",
    );
    expect(p.name).toBe(emptyHookProject().name);
  });
  it("never uses an unpermitted key even when its material matches a signature", async () => {
    const { d, profile, project, secrets } = await delivery("standard");
    project.keys.push({
      id: "another-key",
      name: "not trusted",
      provider: "standard",
      enabled: true,
    });
    expect(
      (
        await verifyHookDelivery(
          profile,
          project.keys,
          { "another-key": secrets["standard-key"] },
          d,
          project.clockSeconds,
        )
      ).findings,
    ).toContain("missing-key");
  });
  it("imports only HAR POST text with unambiguous headers and demonstrable byte lengths", () => {
    const p = emptyHookProject(),
      request = {
        method: "POST",
        url: "https://private.example/path",
        headers: [
          { name: "X-Hub-Signature-256", value: "sha256=" + "a".repeat(64) },
          { name: "content-length", value: "2" },
        ],
        postData: { text: "é" },
      };
    const root = {
      log: {
        entries: [
          { request },
          { request: { ...request, method: "GET" } },
          { request: { ...request, postData: { params: [], text: "a" } } },
          {
            request: {
              ...request,
              headers: [{ name: "content-length", value: "1" }],
            },
          },
        ],
      },
    };
    const imported = importHookHar(p, JSON.stringify(root), "github");
    expect(imported.imported).toBe(1);
    expect(imported.skipped).toBe(3);
    expect(imported.project.deliveries[1].body).toBe("é");
    expect(serializeHookProject(imported.project)).not.toContain(
      "private.example",
    );
    expect(p.deliveries).toHaveLength(1);
    expect(() => importHookHar(p, '{"log":{"entries":[]}}', "github")).toThrow(
      "har",
    );
  });
  it("cancels an entire run without returning partial results", async () => {
    const { project, secrets } = await demoHookProject();
    await expect(
      runHookDeliveries(project, secrets, () => true),
    ).rejects.toBeInstanceOf(HookError);
  });
});
