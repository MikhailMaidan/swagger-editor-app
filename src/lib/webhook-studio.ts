import {
  HookError,
  MAX_HOOK_DELIVERIES,
  hookBody,
  hookJson,
  hookObject,
  normalizeHookProject,
  parseHookHeaders,
  emptyHookProject,
  newHookDelivery,
  type HookDelivery,
  type HookOutcome,
  type HookProject,
} from "./webhook-project";
import {
  hookDigest,
  signHookDelivery,
  verifyHookDelivery,
  type HookSecrets,
  type HookVerification,
} from "./webhook-crypto";

export type HookRunRow = {
  id: string;
  name: string;
  profileId: string;
  provider: string;
  atSeconds: number;
  outcome: HookOutcome;
  expected: HookOutcome;
  passed: boolean;
  replay: "off" | "new" | "duplicate" | "capacity" | "not-checked";
  cacheSize: number;
  verification: HookVerification;
  identity: string | null;
};
export type HookRun = {
  kind: "rsswag-webhook-run";
  rows: HookRunRow[];
  passed: number;
  total: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  capacity: number;
};
export async function runHookDeliveries(
  value: HookProject,
  secrets: HookSecrets,
  check?: () => boolean,
): Promise<HookRun> {
  const p = normalizeHookProject(value),
    stores = new Map<string, Map<string, number>>(),
    rows: HookRunRow[] = [];
  const deliveries = p.deliveries
    .map((delivery, index) => ({ delivery, index }))
    .sort(
      (a, b) =>
        a.delivery.atSeconds - b.delivery.atSeconds || a.index - b.index,
    );
  for (const { delivery: d } of deliveries) {
    if (check?.()) throw new HookError("cancelled");
    const profile = p.profiles.find((x) => x.id === d.profileId)!,
      now = p.clockSeconds + d.atSeconds;
    const verification = await verifyHookDelivery(
      profile,
      p.keys,
      secrets,
      d,
      now,
      check,
    );
    let outcome: HookOutcome = verification.accepted ? "accepted" : "rejected",
      replay: HookRunRow["replay"] = "not-checked",
      identity: string | null = null;
    const store = stores.get(profile.id) ?? new Map<string, number>();
    stores.set(profile.id, store);
    for (const [key, expiry] of store) if (expiry <= now) store.delete(key);
    if (verification.accepted) {
      if (profile.replay === "off") replay = "off";
      else {
        identity =
          profile.replay === "signed-id"
            ? verification.signedId
            : await hookDigest(hookBody(d));
        if (check?.()) throw new HookError("cancelled");
        if (identity === null) throw new HookError("project");
        if (store.has(identity)) {
          outcome = "duplicate";
          replay = "duplicate";
        } else if (store.size >= profile.capacity) {
          outcome = "capacity";
          replay = "capacity";
        } else {
          store.set(identity, now + profile.ttlSeconds);
          replay = "new";
        }
      }
    }
    rows.push({
      id: d.id,
      name: d.name,
      profileId: profile.id,
      provider: profile.provider,
      atSeconds: d.atSeconds,
      outcome,
      expected: d.expect,
      passed: outcome === d.expect,
      replay,
      cacheSize: store.size,
      verification,
      identity,
    });
  }
  return {
    kind: "rsswag-webhook-run",
    rows,
    total: rows.length,
    passed: rows.filter((r) => r.passed).length,
    accepted: rows.filter((r) => r.outcome === "accepted").length,
    rejected: rows.filter((r) => r.outcome === "rejected").length,
    duplicates: rows.filter((r) => r.outcome === "duplicate").length,
    capacity: rows.filter((r) => r.outcome === "capacity").length,
  };
}
export function hookRunReport(run: HookRun): string {
  return JSON.stringify(
    {
      kind: "rsswag-webhook-report",
      version: 1,
      total: run.total,
      passed: run.passed,
      accepted: run.accepted,
      rejected: run.rejected,
      duplicates: run.duplicates,
      capacity: run.capacity,
      rows: run.rows.map((r) => ({
        id: r.id,
        name: r.name,
        profileId: r.profileId,
        provider: r.provider,
        atSeconds: r.atSeconds,
        outcome: r.outcome,
        expected: r.expected,
        passed: r.passed,
        replay: r.replay,
        cacheSize: r.cacheSize,
        verification: {
          accepted: r.verification.accepted,
          signature: r.verification.signature,
          freshness: r.verification.freshness,
          keyId: r.verification.keyId,
          bytes: r.verification.bytes,
          findings: r.verification.findings,
        },
      })),
    },
    null,
    2,
  );
}
export function hookVerificationReport(verification: HookVerification): string {
  const { signature, freshness, keyId, bytes, findings, accepted } =
    verification;
  return JSON.stringify(
    {
      kind: "rsswag-webhook-verification",
      version: 1,
      accepted,
      signature,
      freshness,
      keyId,
      bytes,
      findings,
    },
    null,
    2,
  );
}
export function importHookHar(
  project: HookProject,
  source: string,
  profileId: string,
): { project: HookProject; imported: number; skipped: number } {
  const p = normalizeHookProject(project),
    root = hookJson(source, 4 * 1024 * 1024);
  if (
    !p.profiles.some((x) => x.id === profileId) ||
    !hookObject(root) ||
    !hookObject(root.log) ||
    !Array.isArray(root.log.entries) ||
    root.log.entries.length > 1000
  )
    throw new HookError("har");
  const deliveries: HookDelivery[] = [];
  let skipped = 0;
  const names = new Set(p.deliveries.map((d) => d.id));
  let counter = 1;
  for (const entry of root.log.entries) {
    try {
      if (
        !hookObject(entry) ||
        !hookObject(entry.request) ||
        entry.request.method !== "POST" ||
        !Array.isArray(entry.request.headers) ||
        !hookObject(entry.request.postData) ||
        typeof entry.request.postData.text !== "string" ||
        entry.request.postData.params !== undefined ||
        entry.request.postData.encoding !== undefined ||
        entry.request.postData._encoding !== undefined
      )
        throw 0;
      const pairs: [string, string][] = [],
        seen = new Set<string>();
      if (entry.request.headers.length > 60) throw 0;
      for (const h of entry.request.headers) {
        if (
          !hookObject(h) ||
          typeof h.name !== "string" ||
          typeof h.value !== "string" ||
          seen.has(h.name.toLowerCase())
        )
          throw 0;
        seen.add(h.name.toLowerCase());
        pairs.push([h.name, h.value]);
      }
      const headers = Object.fromEntries(pairs),
        normalized = parseHookHeaders(JSON.stringify(headers));
      if (
        normalized["content-encoding"] &&
        normalized["content-encoding"] !== "identity"
      )
        throw 0;
      while (names.has(`har-${counter}`)) counter++;
      const d = {
        ...newHookDelivery(`har-${counter++}`, profileId),
        name: `HAR POST ${deliveries.length + 1}`,
        body: entry.request.postData.text,
        headers: JSON.stringify(headers, null, 2),
      };
      const bytes = hookBody(d);
      if (
        normalized["content-length"] &&
        (!/^\d+$/.test(normalized["content-length"]) ||
          Number(normalized["content-length"]) !== bytes.length)
      )
        throw 0;
      if (p.deliveries.length + deliveries.length >= MAX_HOOK_DELIVERIES)
        throw new HookError("limit");
      names.add(d.id);
      deliveries.push(d);
    } catch (e) {
      if (e instanceof HookError && e.code === "limit") throw e;
      skipped++;
    }
  }
  if (!deliveries.length) throw new HookError("har");
  return {
    project: normalizeHookProject({
      ...p,
      deliveries: [...p.deliveries, ...deliveries],
    }),
    imported: deliveries.length,
    skipped,
  };
}
export async function demoHookProject(
  check?: () => boolean,
): Promise<{ project: HookProject; secrets: HookSecrets }> {
  const project = emptyHookProject();
  project.name = "Webhook signature and replay examples";
  project.keys.push({
    id: "standard-old",
    name: "Retired standard test key",
    provider: "standard",
    enabled: false,
  });
  project.profiles
    .find((p) => p.provider === "standard")!
    .keyIds.push("standard-old");
  const secrets: HookSecrets = {
    "github-key": "It's a Secret to Everybody",
    "stripe-key": "whsec_DEMO_ONLY_stripe_signing_secret",
    "standard-key": "whsec_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=",
    "standard-old": "whsec_ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=",
  };
  const make = async (
    id: string,
    provider: "github" | "stripe" | "standard",
    atSeconds: number,
    expect: HookOutcome,
    body: string,
    stamp = project.clockSeconds,
    event = id,
    rotation = false,
  ) => {
    const d = {
      ...newHookDelivery(id, provider),
      name: id,
      body,
      atSeconds,
      expect,
    };
    d.headers = await signHookDelivery(
      provider,
      d,
      rotation
        ? [secrets["standard-old"], secrets["standard-key"]]
        : [secrets[`${provider}-key`]],
      stamp,
      event,
      check,
    );
    return d;
  };
  const first = await make(
    "standard-valid",
    "standard",
    0,
    "accepted",
    '{"private":"demo-only","type":"user.created"}',
    undefined,
    "msg_one",
  );
  const changedId = {
    ...first,
    id: "changed-signed-id",
    name: "Changed signed message ID",
    atSeconds: 2,
    expect: "rejected" as const,
    headers: first.headers.replace("msg_one", "msg_other"),
  };
  const gh = await make(
    "github-vector",
    "github",
    8,
    "accepted",
    "Hello, World!",
  );
  const stripe = await make(
    "stripe-valid",
    "stripe",
    10,
    "accepted",
    '{"id":"evt_private","amount":12345}',
  );
  project.deliveries = [
    first,
    {
      ...first,
      id: "standard-retry",
      name: "Duplicate signed message ID",
      atSeconds: 1,
      expect: "duplicate",
    },
    changedId,
    {
      ...first,
      id: "body-tampered",
      name: "Tampered payload bytes",
      body: first.body + " ",
      atSeconds: 3,
      expect: "rejected",
    },
    await make(
      "expired",
      "standard",
      4,
      "rejected",
      "{}",
      project.clockSeconds - 301,
    ),
    await make(
      "future",
      "standard",
      5,
      "rejected",
      "{}",
      project.clockSeconds + 1000,
    ),
    await make(
      "rotation",
      "standard",
      6,
      "accepted",
      "{}",
      project.clockSeconds,
      "msg_rotation",
      true,
    ),
    await make(
      "binary",
      "standard",
      7,
      "accepted",
      "",
      project.clockSeconds,
      "msg_binary",
    ),
    gh,
    {
      ...gh,
      id: "github-retry",
      name: "Unsigned delivery header cannot bypass body replay protection",
      atSeconds: 9,
      expect: "duplicate",
      headers: JSON.stringify({
        ...parseHookHeaders(gh.headers),
        "x-github-delivery": "different-unsigned-id",
      }),
    },
    stripe,
    await make(
      "stripe-retry",
      "stripe",
      11,
      "duplicate",
      stripe.body,
      project.clockSeconds + 11,
    ),
  ];
  const binary = project.deliveries.find((d) => d.id === "binary")!;
  binary.encoding = "base64";
  binary.body = "AP9BgA==";
  binary.headers = await signHookDelivery(
    "standard",
    binary,
    [secrets["standard-key"]],
    project.clockSeconds,
    "msg_binary",
    check,
  );
  return { project: normalizeHookProject(project), secrets };
}
