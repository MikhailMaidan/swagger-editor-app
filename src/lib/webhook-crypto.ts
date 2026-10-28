import {
  HookError,
  hookBase64,
  hookBody,
  hookDecode,
  hookHeaders,
  hookInteger,
  hookText,
  normalizeHookProfile,
  normalizeHookKey,
  parseHookHeaders,
  type HookDelivery,
  type HookKey,
  type HookProfile,
  type HookProvider,
} from "./webhook-project";

export type HookSecrets = Record<string, string>;
export type HookFinding =
  | "missing-header"
  | "header-format"
  | "signature-limit"
  | "missing-key"
  | "signature-mismatch"
  | "expired"
  | "future"
  | "timestamp-unavailable"
  | "github-metadata"
  | "weak-key"
  | "unsupported-version";
export type HookVerification = {
  accepted: boolean;
  signature: "valid" | "invalid" | "not-checked";
  freshness: "valid" | "expired" | "future" | "unavailable" | "not-checked";
  keyId: string | null;
  timestamp: number | null;
  signedId: string | null;
  bytes: number;
  checkedAt: number;
  findings: HookFinding[];
};
type Envelope = {
  data: Uint8Array;
  signatures: Uint8Array[];
  timestamp: number | null;
  signedId: string | null;
  unknown: boolean;
};
export const hookBuffer = (v: Uint8Array): ArrayBuffer => {
  const b = new ArrayBuffer(v.length);
  new Uint8Array(b).set(v);
  return b;
};
export const hookHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (v: string): Uint8Array => {
  if (!/^[a-f0-9]{64}$/i.test(v)) throw new HookError("headers");
  return Uint8Array.from(v.match(/../g)!, (b) => parseInt(b, 16));
};
function subtle() {
  if (!globalThis.crypto?.subtle) throw new HookError("crypto");
  return globalThis.crypto.subtle;
}
const cancelled = (check?: () => boolean) => {
  if (check?.()) throw new HookError("cancelled");
};
export function hookSecret(provider: HookProvider, source: string): Uint8Array {
  if (!hookText(source, 4096) || !source || !source.isWellFormed())
    throw new HookError("key");
  if (provider !== "standard") return new TextEncoder().encode(source);
  try {
    const raw = source.startsWith("whsec_") ? source.slice(6) : source;
    // Accept canonical padded or unpadded standard Base64, never base64url.
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4),
      bytes = hookDecode(padded, 64);
    if (
      bytes.length < 24 ||
      bytes.length > 64 ||
      hookBase64(bytes).replace(/=+$/, "") !== raw.replace(/=+$/, "")
    )
      throw 0;
    return bytes;
  } catch {
    throw new HookError("key");
  }
}
export function generateHookSecret(provider: HookProvider): string {
  const bytes = new Uint8Array(32);
  if (!globalThis.crypto?.getRandomValues) throw new HookError("crypto");
  crypto.getRandomValues(bytes);
  return (provider === "standard" ? "whsec_" : "") + hookBase64(bytes);
}
const timestampValue = (value: string | undefined): number => {
  if (
    !value ||
    !/^(0|[1-9]\d{0,9})$/.test(value) ||
    !hookInteger(Number(value), 0, 4102444800)
  )
    throw new HookError("headers");
  return Number(value);
};
function signedBytes(prefix: string, body: Uint8Array): Uint8Array {
  const first = new TextEncoder().encode(prefix),
    all = new Uint8Array(first.length + body.length);
  all.set(first);
  all.set(body, first.length);
  return all;
}
function envelope(
  provider: HookProvider,
  body: Uint8Array,
  raw: Record<string, string>,
): Envelope {
  const h = hookHeaders(raw);
  if (provider === "github") {
    const signature = h["x-hub-signature-256"];
    if (!signature) throw new Error("missing-header");
    if (!signature.startsWith("sha256=")) throw new HookError("headers");
    return {
      data: body,
      signatures: [unhex(signature.slice(7))],
      timestamp: null,
      signedId: null,
      unknown: false,
    };
  }
  if (provider === "stripe") {
    const header = h["stripe-signature"];
    if (!header) throw new Error("missing-header");
    const parts = header.split(",");
    if (parts.length > 32) throw new Error("signature-limit");
    const stamps: string[] = [],
      signatures: Uint8Array[] = [];
    let unknown = false;
    for (const part of parts) {
      const match = /^([^=\s]+)=(\S+)$/.exec(part.trim());
      if (!match) throw new HookError("headers");
      if (match[1] === "t") stamps.push(match[2]);
      else if (match[1] === "v1") signatures.push(unhex(match[2]));
      else unknown = true;
    }
    if (stamps.length !== 1 || !signatures.length)
      throw new HookError("headers");
    if (signatures.length > 16) throw new Error("signature-limit");
    return {
      data: signedBytes(`${stamps[0]}.`, body),
      timestamp: timestampValue(stamps[0]),
      signedId: null,
      signatures,
      unknown,
    };
  }
  const id = h["webhook-id"],
    stamp = h["webhook-timestamp"],
    header = h["webhook-signature"];
  if (!id || !stamp || !header) throw new Error("missing-header");
  if (!hookText(id, 256) || !/^[\x21-\x2d\x2f-\x7e]+$/.test(id))
    throw new HookError("headers");
  const parts = header.trim().split(/\s+/);
  if (parts.length > 16) throw new Error("signature-limit");
  const signatures: Uint8Array[] = [];
  let unknown = false;
  for (const part of parts) {
    const match = /^([^,]+),([^,]+)$/.exec(part);
    if (!match) throw new HookError("headers");
    if (match[1] !== "v1") {
      unknown = true;
      continue;
    }
    const bytes = hookDecode(match[2], 32);
    if (bytes.length !== 32) throw new HookError("headers");
    signatures.push(bytes);
  }
  if (!signatures.length) throw new HookError("headers");
  return {
    data: signedBytes(`${id}.${stamp}.`, body),
    timestamp: timestampValue(stamp),
    signedId: id,
    signatures,
    unknown,
  };
}
export async function verifyHookBytes(
  profileValue: HookProfile,
  keys: HookKey[],
  secrets: HookSecrets,
  body: Uint8Array,
  headers: Record<string, string>,
  now: number,
  check?: () => boolean,
): Promise<HookVerification> {
  const p = normalizeHookProfile(profileValue);
  if (keys.length > 8 || new Set(keys.map((k) => k.id)).size !== keys.length)
    throw new HookError("project");
  keys = keys.map(normalizeHookKey);
  if (!hookInteger(now, 0, 4102531200)) throw new HookError("project");
  cancelled(check);
  if (body.byteLength > 256 * 1024) throw new HookError("limit");
  const result: HookVerification = {
    accepted: false,
    signature: "not-checked",
    freshness: "not-checked",
    keyId: null,
    timestamp: null,
    signedId: null,
    bytes: body.length,
    checkedAt: now,
    findings: [],
  };
  let e: Envelope;
  try {
    e = envelope(p.provider, body, headers);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    result.findings.push(
      code === "missing-header" || code === "signature-limit"
        ? code
        : "header-format",
    );
    return result;
  }
  if (e.unknown) result.findings.push("unsupported-version");
  result.timestamp = e.timestamp;
  result.signedId = e.signedId;
  if (e.timestamp === null) {
    result.freshness = "unavailable";
    result.findings.push("github-metadata");
    if (p.requireTimestamp) result.findings.push("timestamp-unavailable");
  } else if (now - e.timestamp > p.maxAgeSeconds) {
    result.freshness = "expired";
    result.findings.push("expired");
  } else if (e.timestamp - now > p.maxFutureSeconds) {
    result.freshness = "future";
    result.findings.push("future");
  } else result.freshness = "valid";
  const candidates = keys.filter(
    (k) =>
      k.enabled &&
      k.provider === p.provider &&
      p.keyIds.includes(k.id) &&
      Object.hasOwn(secrets, k.id) &&
      secrets[k.id],
  );
  if (!candidates.length) {
    result.findings.push("missing-key");
    return result;
  }
  const data = hookBuffer(e.data);
  for (const candidate of candidates) {
    cancelled(check);
    const bytes = hookSecret(p.provider, secrets[candidate.id]);
    const key = await subtle().importKey(
      "raw",
      hookBuffer(bytes),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    cancelled(check);
    for (const signature of e.signatures) {
      const valid = await subtle().verify(
        "HMAC",
        key,
        hookBuffer(signature),
        data,
      );
      cancelled(check);
      if (valid) {
        result.signature = "valid";
        result.keyId = candidate.id;
        if (bytes.length < 16) result.findings.push("weak-key");
        break;
      }
    }
    if (result.signature === "valid") break;
  }
  if (result.signature !== "valid") {
    result.signature = "invalid";
    result.findings.push("signature-mismatch");
  }
  result.accepted =
    result.signature === "valid" &&
    (!p.requireTimestamp || result.freshness === "valid");
  return result;
}
export const verifyHookDelivery = (
  p: HookProfile,
  keys: HookKey[],
  secrets: HookSecrets,
  d: HookDelivery,
  now: number,
  check?: () => boolean,
) =>
  verifyHookBytes(
    p,
    keys,
    secrets,
    hookBody(d),
    parseHookHeaders(d.headers),
    now,
    check,
  );
export async function signHookDelivery(
  provider: HookProvider,
  delivery: HookDelivery,
  secrets: string[],
  stamp: number,
  signedId: string,
  check?: () => boolean,
): Promise<string> {
  if (
    !secrets.length ||
    secrets.length > 8 ||
    (provider === "github" && secrets.length !== 1) ||
    !hookInteger(stamp, 0, 4102444800)
  )
    throw new HookError("key");
  const body = hookBody(delivery),
    headers = parseHookHeaders(delivery.headers),
    signatures: string[] = [];
  if (
    provider === "standard" &&
    (!hookText(signedId, 256) || !/^[\x21-\x2d\x2f-\x7e]+$/.test(signedId))
  )
    throw new HookError("headers");
  const data = hookBuffer(
    provider === "github"
      ? body
      : signedBytes(
          provider === "stripe" ? `${stamp}.` : `${signedId}.${stamp}.`,
          body,
        ),
  );
  for (const secret of secrets) {
    cancelled(check);
    const key = await subtle().importKey(
      "raw",
      hookBuffer(hookSecret(provider, secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    cancelled(check);
    const signature = new Uint8Array(await subtle().sign("HMAC", key, data));
    cancelled(check);
    signatures.push(
      provider === "standard"
        ? `v1,${hookBase64(signature)}`
        : hookHex(signature),
    );
  }
  if (provider === "github")
    headers["x-hub-signature-256"] = `sha256=${signatures[0]}`;
  else if (provider === "stripe")
    headers["stripe-signature"] =
      `t=${stamp},${signatures.map((s) => `v1=${s}`).join(",")}`;
  else {
    headers["webhook-id"] = signedId;
    headers["webhook-timestamp"] = String(stamp);
    headers["webhook-signature"] = signatures.join(" ");
  }
  const normalized = hookHeaders(headers),
    source = JSON.stringify(normalized, null, 2);
  return new TextEncoder().encode(source).length <= 32768
    ? source
    : JSON.stringify(normalized);
}
export async function hookDigest(bytes: Uint8Array): Promise<string> {
  return hookHex(
    new Uint8Array(await subtle().digest("SHA-256", hookBuffer(bytes))),
  );
}
