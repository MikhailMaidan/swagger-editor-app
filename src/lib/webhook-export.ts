import {
  MAX_HOOK_BODY,
  HookError,
  normalizeHookKey,
  normalizeHookProfile,
  type HookKey,
  type HookProfile,
} from "./webhook-project";

// Literal source avoids function serialization and remains independent of bundler/minifier helpers.
// Keep protocol behavior in parity with webhook-crypto.ts through executable artifact tests.
export function generateWebhookVerifier(
  profileValue: HookProfile,
  keyValues: HookKey[],
): string {
  const profile = normalizeHookProfile(profileValue),
    keys = keyValues
      .map(normalizeHookKey)
      .filter(
        (k) => profile.keyIds.includes(k.id) && k.provider === profile.provider,
      );
  if (
    !keys.length ||
    keys.length > 8 ||
    new Set(keys.map((k) => k.id)).size !== keys.length
  )
    throw new HookError("project");
  const literal = (v: unknown) =>
    JSON.stringify(v, null, 2)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  return `// RSSwag webhook signature verifier. No dependencies or embedded secrets.
// Verification only: use a durable atomic idempotency store before business effects.
// Give this function the original request body, before parsing or decompression.
const profile = ${literal({ id: profile.id, name: profile.name, provider: profile.provider, keyIds: profile.keyIds, requireTimestamp: profile.requireTimestamp, maxAgeSeconds: profile.maxAgeSeconds, maxFutureSeconds: profile.maxFutureSeconds })};
const slots = ${literal(keys)};
const encoder = new TextEncoder();
const buffer = bytes => Uint8Array.from(bytes).buffer;
const concat = (prefix, body) => { const first = encoder.encode(prefix), out = new Uint8Array(first.length + body.length); out.set(first); out.set(body, first.length); return out; };
const encode64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
function decode64(text, max) {
  if (typeof text !== "string" || text.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new Error("headers");
  const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
  if (bytes.length > max || encode64(bytes) !== text) throw new Error("headers"); return bytes;
}
function secretBytes(source) {
  if (typeof source !== "string" || !source || source.length > 4096 || encoder.encode(source).length > 4096 || !source.isWellFormed()) throw new Error("key");
  if (profile.provider !== "standard") return encoder.encode(source);
  try {
    const raw = source.startsWith("whsec_") ? source.slice(6) : source;
    const bytes = decode64(raw + "=".repeat((4 - raw.length % 4) % 4), 64);
    if (bytes.length < 24 || bytes.length > 64 || encode64(bytes).replace(/=+$/, "") !== raw.replace(/=+$/, "")) throw 0;
    return bytes;
  } catch { throw new Error("key"); }
}
const unhex = text => { if (!/^[a-f0-9]{64}$/i.test(text)) throw new Error("header-format"); return Uint8Array.from(text.match(/../g), v => parseInt(v, 16)); };
const stamp = text => { if (!text || !/^(0|[1-9]\\d{0,9})$/.test(text) || Number(text) > 4102444800) throw new Error("header-format"); return Number(text); };
function envelope(body, headers) {
  if (profile.provider === "github") {
    const h = headers.get("x-hub-signature-256"); if (!h) throw new Error("missing-header");
    if (!h.startsWith("sha256=")) throw new Error("header-format");
    return { data: body, signatures: [unhex(h.slice(7))], timestamp: null, signedId: null, unknown: false };
  }
  if (profile.provider === "stripe") {
    const h = headers.get("stripe-signature"); if (!h) throw new Error("missing-header");
    const parts = h.split(","); if (parts.length > 32) throw new Error("signature-limit");
    const timestamps = [], signatures = []; let unknown = false;
    for (const part of parts) {
      const match = /^([^=\\s]+)=(\\S+)$/.exec(part.trim()); if (!match) throw new Error("header-format");
      if (match[1] === "t") timestamps.push(match[2]); else if (match[1] === "v1") signatures.push(unhex(match[2])); else unknown = true;
    }
    if (timestamps.length !== 1 || !signatures.length) throw new Error("header-format");
    if (signatures.length > 16) throw new Error("signature-limit");
    return { data: concat(timestamps[0] + ".", body), timestamp: stamp(timestamps[0]), signedId: null, signatures, unknown };
  }
  const id = headers.get("webhook-id"), timestamp = headers.get("webhook-timestamp"), h = headers.get("webhook-signature");
  if (!id || !timestamp || !h) throw new Error("missing-header");
  if (encoder.encode(id).length > 256 || !/^[\\x21-\\x2d\\x2f-\\x7e]+$/.test(id)) throw new Error("header-format");
  const parts = h.trim().split(/\\s+/); if (parts.length > 16) throw new Error("signature-limit");
  const signatures = []; let unknown = false;
  for (const part of parts) {
    const match = /^([^,]+),([^,]+)$/.exec(part); if (!match) throw new Error("header-format");
    if (match[1] !== "v1") { unknown = true; continue; }
    const sig = decode64(match[2], 32); if (sig.length !== 32) throw new Error("header-format"); signatures.push(sig);
  }
  if (!signatures.length) throw new Error("header-format");
  return { data: concat(id + "." + timestamp + ".", body), timestamp: stamp(timestamp), signedId: id, signatures, unknown };
}
export function createWebhookVerifier(options = {}) {
  const secrets = Object.fromEntries(Object.entries(options.secrets ?? {}));
  const timeoutMs = options.timeoutMs ?? 5000;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 || typeof now !== "function") throw new TypeError("Invalid verifier options");
  return async function verifyWebhookRequest(request) {
    const result = { accepted: false, signature: "not-checked", freshness: "not-checked", keyId: null, timestamp: null, signedId: null, bytes: 0, findings: [], body: null };
    if (request.method !== "POST") return { ...result, error: "method" };
    const controller = new AbortController(), started = performance.now(); let reason, reader;
    const stop = why => { reason ??= why; controller.abort(); try { void reader?.cancel().catch(() => {}); } catch {} };
    const abort = () => stop("cancelled");
    request.signal.addEventListener("abort", abort, { once: true }); if (request.signal.aborted) abort();
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    const guard = () => { if (performance.now() - started >= timeoutMs) stop("timeout"); if (controller.signal.aborted) throw new Error(reason); };
    const wait = async promise => {
      let listener;
      try { guard(); return await Promise.race([promise, new Promise((_, reject) => { listener = () => reject(new Error(reason)); controller.signal.addEventListener("abort", listener, { once: true }); if (controller.signal.aborted) listener(); })]); }
      catch (error) { void promise.catch(() => {}); throw error; }
      finally { if (listener) controller.signal.removeEventListener("abort", listener); }
    };
    try {
      guard(); const chunks = []; let bytes = 0;
      let headerBytes = 0, headerCount = 0;
      for (const [key, value] of request.headers) { headerCount++; headerBytes += encoder.encode(key + value).length; if (headerCount > 60 || headerBytes > 32768 || encoder.encode(value).length > 8192) throw new Error("headers"); }
      if (request.body) {
        reader = request.body.getReader();
        while (true) {
          const chunk = await wait(reader.read()); guard(); if (chunk.done) break;
          if (Object.prototype.toString.call(chunk.value) !== "[object Uint8Array]") throw new Error("encoding");
          bytes += chunk.value.byteLength; if (bytes > ${MAX_HOOK_BODY}) throw new Error("limit");
          if (chunk.value.length) chunks.push(Uint8Array.from(chunk.value));
        }
      }
      result.bytes = bytes; const body = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      let e;
      try { e = envelope(body, request.headers); } catch (error) { result.findings.push(["missing-header", "signature-limit"].includes(error.message) ? error.message : "header-format"); return result; }
      result.timestamp = e.timestamp; result.signedId = e.signedId;
      const checkedAt = now(); if (!Number.isSafeInteger(checkedAt) || checkedAt < 0 || checkedAt > 4102531200) throw new Error("clock");
      if (e.unknown) result.findings.push("unsupported-version");
      if (e.timestamp === null) { result.freshness = "unavailable"; result.findings.push("github-metadata"); if (profile.requireTimestamp) result.findings.push("timestamp-unavailable"); }
      else if (checkedAt - e.timestamp > profile.maxAgeSeconds) { result.freshness = "expired"; result.findings.push("expired"); }
      else if (e.timestamp - checkedAt > profile.maxFutureSeconds) { result.freshness = "future"; result.findings.push("future"); }
      else result.freshness = "valid";
      const candidates = slots.filter(k => k.enabled && Object.hasOwn(secrets, k.id) && secrets[k.id]);
      if (!candidates.length) { result.findings.push("missing-key"); return result; }
      const data = buffer(e.data);
      for (const slot of candidates) {
        guard(); const raw = secretBytes(secrets[slot.id]);
        const key = await wait(crypto.subtle.importKey("raw", buffer(raw), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])); guard();
        for (const sig of e.signatures) {
          const valid = await wait(crypto.subtle.verify("HMAC", key, buffer(sig), data)); guard();
          if (valid) { result.signature = "valid"; result.keyId = slot.id; if (raw.length < 16) result.findings.push("weak-key"); break; }
        }
        if (result.signature === "valid") break;
      }
      if (result.signature !== "valid") { result.signature = "invalid"; result.findings.push("signature-mismatch"); }
      result.accepted = result.signature === "valid" && (!profile.requireTimestamp || result.freshness === "valid");
      if (result.accepted) result.body = body;
      return result;
    } catch (error) { return { ...result, accepted: false, body: null, error: reason ?? (["key", "limit", "encoding", "headers", "clock"].includes(error.message) ? error.message : "crypto") }; }
    finally { clearTimeout(timer); request.signal.removeEventListener("abort", abort); if (reader) { try { void reader.cancel().catch(() => {}); } catch {} try { reader.releaseLock(); } catch {} } }
  };
}
`;
}
