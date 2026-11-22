/**
 * A random RFC 4122 version-4 UUID that works outside secure contexts.
 *
 * `crypto.randomUUID` only exists on HTTPS or localhost, so calling it directly
 * throws when the app is opened over plain HTTP on a LAN address (e.g. the dev
 * server's "Network" URL on a phone). `crypto.getRandomValues` is available in
 * insecure contexts too, so the fallback stays cryptographically random there,
 * and only drops to Math.random if no Web Crypto is available at all.
 *
 * Client-side identifiers only — do not use for security tokens or nonces.
 */
export function randomUuid(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();

    if (uuid) {
      return uuid;
    }
  } catch {
    // Fall through to the manual construction below.
  }

  const bytes = new Uint8Array(16);
  let filled = false;

  try {
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      filled = true;
    }
  } catch {
    // Fall through to Math.random below.
  }

  if (!filled) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
