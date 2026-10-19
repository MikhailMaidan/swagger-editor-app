import { parseTransformValue, type JsonValue } from "./api-transform";
import { getByteSize } from "./text-encoding";

export const JWT_ALGORITHMS = ["HS256", "RS256", "PS256", "ES256"] as const;
export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];
export const MAX_JWT_BYTES = 32 * 1024;
export const MAX_JWT_PROJECT_BYTES = 1024 * 1024;
export const MAX_JWT_KEYS = 30;
export const MAX_JWT_CASES = 30;
export type JwtObject = { [key: string]: JsonValue };
export type JwtErrorCode =
  | "format"
  | "encoding"
  | "json"
  | "limit"
  | "algorithm"
  | "key"
  | "key-usage"
  | "missing-key"
  | "ambiguous-key"
  | "header"
  | "crypto"
  | "policy"
  | "project"
  | "case";
export class JwtError extends Error {
  constructor(public code: JwtErrorCode) {
    super(code);
  }
}
export const jwtError = (e: unknown) =>
  e instanceof JwtError ? e : new JwtError("crypto");
export type JwtKey = {
  id: string;
  name: string;
  algorithm: JwtAlgorithm;
  jwk: JwtObject;
};
export type JwtPolicy = {
  algorithms: JwtAlgorithm[];
  issuer: string;
  audience: string;
  subject: string;
  type: string;
  toleranceSeconds: number;
  requireExpiration: boolean;
  checkIssuedAt: boolean;
  maxAgeSeconds: number;
  nowSeconds: number | null;
};
export type JwtFindingCode =
  | JwtErrorCode
  | "signature"
  | "claim-type"
  | "expired"
  | "not-active"
  | "issued-future"
  | "expiration-required"
  | "issued-at-required"
  | "too-old"
  | "issuer"
  | "audience"
  | "subject"
  | "type";
export type JwtFinding = { code: JwtFindingCode; claim?: string };
export type JwtInspection = {
  header: JwtObject;
  claims: JwtObject;
  signingInput: string;
  signature: Uint8Array;
  headerBytes: number;
  claimsBytes: number;
};
export type JwtVerification = {
  status: "accepted" | "rejected";
  signature: "valid" | "invalid" | "not-checked";
  claims: "valid" | "invalid" | "not-checked";
  algorithm: string;
  keyId?: string;
  checkedAt: number;
  findings: JwtFinding[];
};
export type JwtCase = {
  id: string;
  name: string;
  token: string;
  keyId: string;
  expected: "accepted" | "rejected";
};
export type JwtCaseResult = {
  id: string;
  name: string;
  expected: JwtCase["expected"];
  status: "passed" | "failed";
  verification: JwtVerification;
};
export type JwtProject = {
  kind: "rsswag-jwt-project";
  version: 1;
  name: string;
  token: string;
  policy: JwtPolicy;
  keys: JwtKey[];
  cases: JwtCase[];
};
const record = (v: unknown): v is JwtObject =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: object, key: string) =>
  Object.prototype.hasOwnProperty.call(v, key);
const named = (v: unknown, max = 120): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const algorithm = (v: unknown): v is JwtAlgorithm =>
  typeof v === "string" && (JWT_ALGORITHMS as readonly string[]).includes(v);
function jsonValue(source: string, max: number, code: JwtErrorCode): JsonValue {
  if (typeof source !== "string") throw new JwtError(code);
  if (getByteSize(source) > max) throw new JwtError("limit");
  try {
    return parseTransformValue(source);
  } catch {
    throw new JwtError(code);
  }
}
export function parseJwtObject(source: string, header = false): JwtObject {
  const value = jsonValue(source, header ? 4096 : 16 * 1024, "json");
  if (!record(value)) throw new JwtError("json");
  return value;
}
export function jwtEncode(bytes: Uint8Array): string {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function jwtDecode(value: string, max = MAX_JWT_BYTES): Uint8Array {
  if (typeof value !== "string" || value.length > Math.ceil((max * 4) / 3) + 2)
    throw new JwtError("limit");
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1)
    throw new JwtError("encoding");
  try {
    const raw = atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    );
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    if (bytes.length > max) throw new JwtError("limit");
    if (jwtEncode(bytes) !== value) throw new JwtError("encoding");
    return bytes;
  } catch (e) {
    throw e instanceof JwtError ? e : new JwtError("encoding");
  }
}
const utf8 = (s: string) => new TextEncoder().encode(s);
function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new JwtError("crypto");
  return globalThis.crypto.subtle;
}
function segment(value: string, max: number): JwtObject {
  const bytes = jwtDecode(value, max);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new JwtError("encoding");
  }
  if (text.startsWith("\uFEFF")) throw new JwtError("json");
  const parsed = jsonValue(text, max, "json");
  if (!record(parsed)) throw new JwtError("json");
  return parsed;
}
export function inspectJwt(token: string): JwtInspection {
  if (getByteSize(token) > MAX_JWT_BYTES) throw new JwtError("limit");
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || /\s/.test(token))
    throw new JwtError("format");
  return {
    header: segment(parts[0], 4096),
    claims: segment(parts[1], 16 * 1024),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: jwtDecode(parts[2], 512),
    headerBytes: jwtDecode(parts[0], 4096).length,
    claimsBytes: jwtDecode(parts[1], 16 * 1024).length,
  };
}
function validateHeader(header: JwtObject) {
  if (typeof header.alg !== "string" || !algorithm(header.alg))
    throw new JwtError("algorithm");
  if (
    own(header, "crit") ||
    (own(header, "b64") && header.b64 !== true) ||
    (own(header, "kid") &&
      (typeof header.kid !== "string" || header.kid.length > 200)) ||
    (own(header, "typ") && typeof header.typ !== "string")
  )
    throw new JwtError("header");
}
function fieldBytes(
  jwk: JwtObject,
  name: string,
  min: number,
  max = min,
): Uint8Array {
  if (typeof jwk[name] !== "string") throw new JwtError("key");
  let bytes: Uint8Array;
  try {
    bytes = jwtDecode(jwk[name] as string, max);
  } catch {
    throw new JwtError("key");
  }
  if (bytes.length < min || bytes.length > max) throw new JwtError("key");
  return bytes;
}
export function normalizeJwtKey(value: unknown): JwtKey {
  if (
    !record(value) ||
    !named(value.id, 80) ||
    !named(value.name) ||
    !algorithm(value.algorithm) ||
    !record(value.jwk)
  )
    throw new JwtError("key");
  const raw = value.jwk,
    alg = value.algorithm;
  if (
    (raw.alg !== undefined && raw.alg !== alg) ||
    (raw.use !== undefined && raw.use !== "sig") ||
    (raw.kid !== undefined &&
      (typeof raw.kid !== "string" || raw.kid.length > 200)) ||
    (raw.ext !== undefined && typeof raw.ext !== "boolean")
  )
    throw new JwtError("key");
  if (
    raw.key_ops !== undefined &&
    (!Array.isArray(raw.key_ops) ||
      !raw.key_ops.length ||
      raw.key_ops.some((op) => op !== "sign" && op !== "verify") ||
      new Set(raw.key_ops).size !== raw.key_ops.length)
  )
    throw new JwtError("key-usage");
  let fields: string[];
  if (alg === "HS256") {
    if (raw.kty !== "oct") throw new JwtError("key");
    fieldBytes(raw, "k", 32, 128);
    fields = ["k"];
  } else if (alg === "ES256") {
    if (raw.kty !== "EC" || raw.crv !== "P-256") throw new JwtError("key");
    fieldBytes(raw, "x", 32);
    fieldBytes(raw, "y", 32);
    if (own(raw, "d")) fieldBytes(raw, "d", 32);
    fields = ["crv", "x", "y", ...(own(raw, "d") ? ["d"] : [])];
  } else {
    if (raw.kty !== "RSA" || own(raw, "oth")) throw new JwtError("key");
    const modulus = fieldBytes(raw, "n", 256, 512),
      exponent = fieldBytes(raw, "e", 1, 4);
    const bits = (modulus.length - 1) * 8 + 32 - Math.clz32(modulus[0]);
    const e = exponent.reduce((n, b) => n * 256 + b, 0);
    if (
      !modulus[0] ||
      bits < 2048 ||
      bits > 4096 ||
      !(modulus.at(-1)! & 1) ||
      !exponent[0] ||
      e < 3 ||
      e % 2 !== 1
    )
      throw new JwtError("key");
    fields = ["n", "e"];
    if (own(raw, "d"))
      for (const name of ["d", "p", "q", "dp", "dq", "qi"]) {
        fieldBytes(raw, name, 1, 512);
        fields.push(name);
      }
  }
  const jwk = Object.fromEntries(
    ["kty", "kid", "use", "key_ops", "ext", ...fields]
      .filter((k) => own(raw, k))
      .map((k) => [k, raw[k]]),
  );
  jwk.alg = alg;
  const key = { id: value.id, name: value.name, algorithm: alg, jwk };
  if (!jwtCanSign(key) && !jwtCanVerify(key)) throw new JwtError("key-usage");
  return key;
}
export function jwtKeyKind(key: JwtKey): "secret" | "private" | "public" {
  return key.jwk.kty === "oct"
    ? "secret"
    : own(key.jwk, "d")
      ? "private"
      : "public";
}
const allows = (key: JwtKey, op: string) =>
  !Array.isArray(key.jwk.key_ops) || key.jwk.key_ops.includes(op);
export function jwtCanSign(key: JwtKey) {
  return jwtKeyKind(key) !== "public" && allows(key, "sign");
}
export function jwtCanVerify(key: JwtKey) {
  return jwtKeyKind(key) !== "private" && allows(key, "verify");
}
export function jwtPublicKey(key: JwtKey): JwtKey {
  if (jwtKeyKind(key) === "secret") throw new JwtError("key-usage");
  const jwk = Object.fromEntries(
    Object.entries(key.jwk).filter(
      ([name]) => !["d", "p", "q", "dp", "dq", "qi", "oth"].includes(name),
    ),
  );
  jwk.key_ops = ["verify"];
  return normalizeJwtKey({ ...key, name: key.name, jwk });
}
function cryptoAlgorithm(
  alg: JwtAlgorithm,
): HmacImportParams | RsaHashedImportParams | EcKeyImportParams {
  return alg === "HS256"
    ? { name: "HMAC", hash: "SHA-256" }
    : alg === "ES256"
      ? { name: "ECDSA", namedCurve: "P-256" }
      : {
          name: alg === "PS256" ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        };
}
function operationAlgorithm(
  alg: JwtAlgorithm,
): Algorithm | EcdsaParams | RsaPssParams {
  return alg === "PS256"
    ? { name: "RSA-PSS", saltLength: 32 }
    : alg === "ES256"
      ? { name: "ECDSA", hash: "SHA-256" }
      : { name: alg === "HS256" ? "HMAC" : "RSASSA-PKCS1-v1_5" };
}
async function importKey(
  key: JwtKey,
  usage: "sign" | "verify",
  extractable = false,
): Promise<CryptoKey> {
  const clean = normalizeJwtKey(key);
  if (!(usage === "sign" ? jwtCanSign(clean) : jwtCanVerify(clean)))
    throw new JwtError("key-usage");
  try {
    return await subtle().importKey(
      "jwk",
      clean.jwk as JsonWebKey,
      cryptoAlgorithm(clean.algorithm),
      extractable,
      [usage],
    );
  } catch (error) {
    throw error instanceof JwtError ? error : new JwtError("key");
  }
}
export function parseJwtKeys(
  source: string,
  defaultAlgorithm: JwtAlgorithm,
  name = "Imported key",
): JwtKey[] {
  if (!algorithm(defaultAlgorithm) || !named(name)) throw new JwtError("key");
  const v = jsonValue(source, 256 * 1024, "key");
  const list = record(v) && Array.isArray(v.keys) ? v.keys : [v];
  if (!list.length || list.length > MAX_JWT_KEYS) throw new JwtError("limit");
  const keys: JwtKey[] = [];
  for (const raw of list) {
    if (!record(raw)) throw new JwtError("key");
    const alg = raw.alg === undefined ? defaultAlgorithm : raw.alg;
    const key = normalizeJwtKey({
      id: crypto.randomUUID(),
      name: `${name}${list.length > 1 ? ` ${keys.length + 1}` : ""}`.slice(
        0,
        120,
      ),
      algorithm: alg,
      jwk: raw,
    });
    keys.push(key);
    if (jwtKeyKind(key) === "private")
      keys.push({
        ...jwtPublicKey(key),
        id: crypto.randomUUID(),
        name: `${key.name} (public)`.slice(0, 120),
      });
  }
  if (keys.length > MAX_JWT_KEYS) throw new JwtError("limit");
  return keys;
}
export async function validateJwtKeys(keys: JwtKey[]): Promise<void> {
  if (keys.length > MAX_JWT_KEYS) throw new JwtError("limit");
  for (const key of keys)
    await importKey(key, jwtCanVerify(key) ? "verify" : "sign");
}
export function jwtSecretKey(
  source: string,
  encoding: "utf8" | "base64url",
  name: string,
  kid: string,
): JwtKey {
  if (!named(name) || kid.length > 200 || getByteSize(source) > 1024)
    throw new JwtError("key");
  const bytes =
    encoding === "base64url" ? jwtDecode(source, 128) : utf8(source);
  return normalizeJwtKey({
    id: crypto.randomUUID(),
    name,
    algorithm: "HS256",
    jwk: {
      kty: "oct",
      k: jwtEncode(bytes),
      alg: "HS256",
      ...(kid ? { kid } : {}),
      key_ops: ["sign", "verify"],
    },
  });
}
export async function generateJwtKeys(
  alg: JwtAlgorithm,
  name: string,
  kid: string,
): Promise<JwtKey[]> {
  if (!algorithm(alg) || !named(name) || !named(kid, 200))
    throw new JwtError("key");
  try {
    let generated: CryptoKey | CryptoKeyPair;
    if (alg === "HS256")
      generated = await subtle().generateKey(
        { name: "HMAC", hash: "SHA-256", length: 256 },
        true,
        ["sign", "verify"],
      );
    else if (alg === "ES256")
      generated = await subtle().generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
    else
      generated = await subtle().generateKey(
        {
          name: alg === "PS256" ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: Uint8Array.from([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      );
    const list =
      "privateKey" in generated
        ? [generated.privateKey, generated.publicKey]
        : [generated];
    const keys: JwtKey[] = [];
    for (const key of list) {
      const jwk = await subtle().exportKey("jwk", key);
      keys.push(
        normalizeJwtKey({
          id: crypto.randomUUID(),
          name: `${name}${list.length > 1 ? (key.type === "private" ? " (private)" : " (public)") : ""}`.slice(
            0,
            120,
          ),
          algorithm: alg,
          jwk: { ...jwk, alg, kid },
        }),
      );
    }
    return keys;
  } catch (e) {
    throw e instanceof JwtError ? e : new JwtError("crypto");
  }
}
export async function importJwtPem(
  source: string,
  alg: JwtAlgorithm,
  name: string,
  kid: string,
): Promise<JwtKey[]> {
  if (
    alg === "HS256" ||
    !algorithm(alg) ||
    !named(name) ||
    kid.length > 200 ||
    getByteSize(source) > 16 * 1024
  )
    throw new JwtError("key");
  const match =
    /^\s*-----BEGIN (PUBLIC KEY|PRIVATE KEY)-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END \1-----\s*$/.exec(
      source,
    );
  if (!match) throw new JwtError("key");
  try {
    const raw = atob(match[2].replace(/\s/g, ""));
    const key = await subtle().importKey(
      match[1] === "PRIVATE KEY" ? "pkcs8" : "spki",
      bytesBuffer(Uint8Array.from(raw, (c) => c.charCodeAt(0))),
      cryptoAlgorithm(alg),
      true,
      [match[1] === "PRIVATE KEY" ? "sign" : "verify"],
    );
    const jwk = await subtle().exportKey("jwk", key);
    return parseJwtKeys(
      JSON.stringify({ ...jwk, alg, ...(kid ? { kid } : {}) }),
      alg,
      name,
    );
  } catch (e) {
    throw e instanceof JwtError ? e : new JwtError("key");
  }
}
export async function exportJwtPem(
  key: JwtKey,
  privateKey = false,
): Promise<string> {
  if (
    jwtKeyKind(key) === "secret" ||
    (privateKey && jwtKeyKind(key) !== "private")
  )
    throw new JwtError("key-usage");
  const selected = privateKey ? key : jwtPublicKey(key);
  try {
    const imported = await importKey(
      selected,
      privateKey ? "sign" : "verify",
      true,
    );
    const bytes = await subtle().exportKey(
      privateKey ? "pkcs8" : "spki",
      imported,
    );
    let raw = "";
    for (const b of new Uint8Array(bytes)) raw += String.fromCharCode(b);
    const body = btoa(raw)
        .match(/.{1,64}/g)!
        .join("\n"),
      label = privateKey ? "PRIVATE KEY" : "PUBLIC KEY";
    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
  } catch (e) {
    throw e instanceof JwtError ? e : new JwtError("key");
  }
}
export async function jwtThumbprint(key: JwtKey): Promise<string> {
  if (jwtKeyKind(key) === "secret") throw new JwtError("key-usage");
  const j = key.jwk;
  const members =
    j.kty === "RSA"
      ? { e: j.e, kty: j.kty, n: j.n }
      : { crv: j.crv, kty: j.kty, x: j.x, y: j.y };
  try {
    return jwtEncode(
      new Uint8Array(
        await subtle().digest(
          "SHA-256",
          bytesBuffer(utf8(JSON.stringify(members))),
        ),
      ),
    );
  } catch {
    throw new JwtError("crypto");
  }
}
export function defaultJwtPolicy(): JwtPolicy {
  return {
    algorithms: ["RS256"],
    issuer: "",
    audience: "",
    subject: "",
    type: "JWT",
    toleranceSeconds: 0,
    requireExpiration: true,
    checkIssuedAt: true,
    maxAgeSeconds: 0,
    nowSeconds: null,
  };
}
export function normalizeJwtPolicy(v: unknown): JwtPolicy {
  if (
    !record(v) ||
    !Array.isArray(v.algorithms) ||
    !v.algorithms.length ||
    v.algorithms.some((a) => !algorithm(a)) ||
    new Set(v.algorithms).size !== v.algorithms.length ||
    ["issuer", "audience", "subject", "type"].some(
      (k) => typeof v[k] !== "string" || (v[k] as string).length > 2048,
    ) ||
    typeof v.requireExpiration !== "boolean" ||
    typeof v.checkIssuedAt !== "boolean" ||
    !Number.isInteger(v.toleranceSeconds) ||
    Number(v.toleranceSeconds) < 0 ||
    Number(v.toleranceSeconds) > 300 ||
    !Number.isInteger(v.maxAgeSeconds) ||
    Number(v.maxAgeSeconds) < 0 ||
    Number(v.maxAgeSeconds) > 31536000 ||
    (v.nowSeconds !== null &&
      (typeof v.nowSeconds !== "number" ||
        !Number.isFinite(v.nowSeconds) ||
        v.nowSeconds < 0 ||
        v.nowSeconds > 8640000000000))
  )
    throw new JwtError("policy");
  return {
    algorithms: v.algorithms as JwtAlgorithm[],
    issuer: v.issuer as string,
    audience: v.audience as string,
    subject: v.subject as string,
    type: v.type as string,
    toleranceSeconds: v.toleranceSeconds as number,
    requireExpiration: v.requireExpiration,
    checkIssuedAt: v.checkIssuedAt,
    maxAgeSeconds: v.maxAgeSeconds as number,
    nowSeconds: v.nowSeconds as number | null,
  };
}
function verificationTime(policy: JwtPolicy, now: number): number {
  const at = policy.nowSeconds ?? now;
  if (!Number.isFinite(at) || at < 0 || at > 8640000000000)
    throw new JwtError("policy");
  return at;
}
export function checkJwtClaims(
  claims: JwtObject,
  policy: JwtPolicy,
  now = Date.now() / 1000,
): JwtFinding[] {
  const p = normalizeJwtPolicy(policy),
    at = verificationTime(p, now);
  const findings: JwtFinding[] = [];
  for (const claim of ["exp", "nbf", "iat"])
    if (
      own(claims, claim) &&
      (typeof claims[claim] !== "number" || !Number.isFinite(claims[claim]))
    )
      findings.push({ code: "claim-type", claim });
  for (const claim of ["iss", "sub", "jti"])
    if (own(claims, claim) && typeof claims[claim] !== "string")
      findings.push({ code: "claim-type", claim });
  if (
    own(claims, "aud") &&
    typeof claims.aud !== "string" &&
    (!Array.isArray(claims.aud) ||
      claims.aud.some((a) => typeof a !== "string"))
  )
    findings.push({ code: "claim-type", claim: "aud" });
  if (p.requireExpiration && !own(claims, "exp"))
    findings.push({ code: "expiration-required", claim: "exp" });
  if (typeof claims.exp === "number" && at - p.toleranceSeconds >= claims.exp)
    findings.push({ code: "expired", claim: "exp" });
  if (typeof claims.nbf === "number" && at + p.toleranceSeconds < claims.nbf)
    findings.push({ code: "not-active", claim: "nbf" });
  if (
    p.checkIssuedAt &&
    typeof claims.iat === "number" &&
    at + p.toleranceSeconds < claims.iat
  )
    findings.push({ code: "issued-future", claim: "iat" });
  if (p.maxAgeSeconds && !own(claims, "iat"))
    findings.push({ code: "issued-at-required", claim: "iat" });
  if (
    p.maxAgeSeconds &&
    typeof claims.iat === "number" &&
    at - claims.iat > p.maxAgeSeconds + p.toleranceSeconds
  )
    findings.push({ code: "too-old", claim: "iat" });
  if (p.issuer && claims.iss !== p.issuer)
    findings.push({ code: "issuer", claim: "iss" });
  if (p.subject && claims.sub !== p.subject)
    findings.push({ code: "subject", claim: "sub" });
  if (
    p.audience &&
    claims.aud !== p.audience &&
    !(Array.isArray(claims.aud) && claims.aud.includes(p.audience))
  )
    findings.push({ code: "audience", claim: "aud" });
  return findings;
}
export async function signJwt(
  key: JwtKey,
  headerSource: string,
  claimsSource: string,
): Promise<string> {
  const selected = normalizeJwtKey(key);
  if (!jwtCanSign(selected)) throw new JwtError("key-usage");
  const h = parseJwtObject(headerSource, true),
    claims = parseJwtObject(claimsSource);
  if (h.alg !== undefined && h.alg !== selected.algorithm)
    throw new JwtError("algorithm");
  if (
    h.kid !== undefined &&
    selected.jwk.kid !== undefined &&
    h.kid !== selected.jwk.kid
  )
    throw new JwtError("key");
  const header = {
    ...h,
    alg: selected.algorithm,
    ...(h.kid === undefined && selected.jwk.kid !== undefined
      ? { kid: selected.jwk.kid }
      : {}),
  };
  validateHeader(header);
  const input = `${jwtEncode(utf8(JSON.stringify(header)))}.${jwtEncode(utf8(JSON.stringify(claims)))}`;
  try {
    const signature = await subtle().sign(
      operationAlgorithm(selected.algorithm),
      await importKey(selected, "sign"),
      bytesBuffer(utf8(input)),
    );
    const token = `${input}.${jwtEncode(new Uint8Array(signature))}`;
    inspectJwt(token);
    return token;
  } catch (e) {
    throw e instanceof JwtError ? e : new JwtError("crypto");
  }
}
export async function verifyJwt(
  token: string,
  keys: JwtKey[],
  policy: JwtPolicy,
  keyId = "",
  now = Date.now() / 1000,
): Promise<JwtVerification> {
  const p = normalizeJwtPolicy(policy);
  const result: JwtVerification = {
    status: "rejected",
    signature: "not-checked",
    claims: "not-checked",
    algorithm: "",
    checkedAt: verificationTime(p, now),
    findings: [],
  };
  try {
    const parsed = inspectJwt(token),
      h = parsed.header;
    result.algorithm = algorithm(h.alg) ? h.alg : "";
    validateHeader(h);
    if (!p.algorithms.includes(h.alg as JwtAlgorithm))
      throw new JwtError("algorithm");
    const candidates = keys
      .map(normalizeJwtKey)
      .filter(
        (k) =>
          jwtCanVerify(k) &&
          k.algorithm === h.alg &&
          (keyId ? k.id === keyId : h.kid === undefined || k.jwk.kid === h.kid),
      );
    if (!candidates.length) throw new JwtError("missing-key");
    if (candidates.length !== 1) throw new JwtError("ambiguous-key");
    const key = candidates[0];
    result.keyId = key.id;
    const expectedLength =
      key.algorithm === "HS256"
        ? 32
        : key.algorithm === "ES256"
          ? 64
          : fieldBytes(key.jwk, "n", 256, 512).length;
    let valid = false;
    if (parsed.signature.length === expectedLength)
      valid = await subtle().verify(
        operationAlgorithm(key.algorithm),
        await importKey(key, "verify"),
        bytesBuffer(parsed.signature),
        bytesBuffer(utf8(parsed.signingInput)),
      );
    result.signature = valid ? "valid" : "invalid";
    if (!valid) {
      result.findings.push({ code: "signature" });
      return result;
    }
    result.findings = checkJwtClaims(parsed.claims, p, result.checkedAt);
    if (p.type && h.typ !== p.type) result.findings.push({ code: "type" });
    result.claims = result.findings.length ? "invalid" : "valid";
    if (!result.findings.length) result.status = "accepted";
    return result;
  } catch (e) {
    result.findings.push({ code: jwtError(e).code });
    return result;
  }
}
export function emptyJwtProject(): JwtProject {
  return {
    kind: "rsswag-jwt-project",
    version: 1,
    name: "JWT verification project",
    token: "",
    policy: defaultJwtPolicy(),
    keys: [],
    cases: [],
  };
}
export function normalizeJwtCase(v: unknown): JwtCase {
  if (
    !record(v) ||
    !named(v.id, 80) ||
    !named(v.name) ||
    typeof v.token !== "string" ||
    typeof v.keyId !== "string" ||
    v.keyId.length > 80 ||
    (v.expected !== "accepted" && v.expected !== "rejected")
  )
    throw new JwtError("case");
  if (getByteSize(v.token) > MAX_JWT_BYTES) throw new JwtError("limit");
  return {
    id: v.id,
    name: v.name,
    token: v.token,
    keyId: v.keyId,
    expected: v.expected,
  };
}
export function parseJwtProject(source: string): JwtProject {
  const v = jsonValue(source, MAX_JWT_PROJECT_BYTES, "project");
  if (
    !record(v) ||
    v.kind !== "rsswag-jwt-project" ||
    v.version !== 1 ||
    !named(v.name, 200) ||
    typeof v.token !== "string" ||
    !Array.isArray(v.keys) ||
    v.keys.length > MAX_JWT_KEYS ||
    !Array.isArray(v.cases) ||
    v.cases.length > MAX_JWT_CASES
  )
    throw new JwtError("project");
  if (getByteSize(v.token) > MAX_JWT_BYTES) throw new JwtError("limit");
  const keys = v.keys.map(normalizeJwtKey),
    cases = v.cases.map(normalizeJwtCase);
  if (
    new Set(keys.map((k) => k.id)).size !== keys.length ||
    new Set(cases.map((c) => c.id)).size !== cases.length
  )
    throw new JwtError("project");
  return {
    kind: "rsswag-jwt-project",
    version: 1,
    name: v.name,
    token: v.token,
    policy: normalizeJwtPolicy(v.policy),
    keys,
    cases,
  };
}
export function serializeJwtProject(
  project: JwtProject,
  includeSigningKeys = false,
): string {
  const clean = parseJwtProject(JSON.stringify(project));
  if (!includeSigningKeys)
    clean.keys = clean.keys.filter((k) => jwtKeyKind(k) === "public");
  const output = JSON.stringify(clean, null, 2);
  if (getByteSize(output) > MAX_JWT_PROJECT_BYTES) throw new JwtError("limit");
  return output;
}
export function jwtPublicJwks(keys: JwtKey[]): string {
  const entries = keys
    .filter((k) => jwtKeyKind(k) === "public")
    .map((k) => normalizeJwtKey(k).jwk);
  return JSON.stringify({ keys: entries }, null, 2);
}
export async function runJwtCases(
  project: JwtProject,
  signal?: AbortSignal,
  onProgress?: (done: number) => void,
): Promise<JwtCaseResult[]> {
  const clean = parseJwtProject(JSON.stringify(project));
  const results: JwtCaseResult[] = [];
  const now = Date.now() / 1000;
  for (const c of clean.cases) {
    if (signal?.aborted) break;
    const verification = await verifyJwt(
      c.token,
      clean.keys,
      clean.policy,
      c.keyId,
      now,
    );
    if (signal?.aborted) break;
    results.push({
      id: c.id,
      name: c.name,
      expected: c.expected,
      status: c.expected === verification.status ? "passed" : "failed",
      verification,
    });
    onProgress?.(results.length);
  }
  return results;
}
export function jwtVerificationReport(result: JwtVerification) {
  return {
    kind: "rsswag-jwt-verification-report",
    version: 1,
    status: result.status,
    signature: result.signature,
    claims: result.claims,
    algorithm: result.algorithm,
    keyId: result.keyId,
    checkedAt: result.checkedAt,
    findings: result.findings.map(({ code, claim }) => ({ code, claim })),
  };
}
export function jwtCasesReport(results: JwtCaseResult[], total: number) {
  return {
    kind: "rsswag-jwt-cases-report",
    version: 1,
    total,
    completed: results.length,
    complete: results.length === total,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    cases: results.map((r) => ({
      id: r.id,
      name: r.name,
      expected: r.expected,
      status: r.status,
      verification: jwtVerificationReport(r.verification),
    })),
  };
}
export async function demoJwtProject(): Promise<JwtProject> {
  const p = emptyJwtProject(),
    now = Math.floor(Date.now() / 1000);
  p.name = "JWT API authentication demo";
  p.keys = await generateJwtKeys("RS256", "Demo RSA key", "demo-rsa");
  p.policy = {
    ...p.policy,
    issuer: "https://issuer.example",
    audience: "rsswag-api",
    nowSeconds: now,
  };
  const key = p.keys.find(jwtCanSign)!;
  const claims = {
    iss: p.policy.issuer,
    aud: p.policy.audience,
    sub: "example-user",
    iat: now,
    exp: now + 3600,
  };
  p.token = await signJwt(key, '{"typ":"JWT"}', JSON.stringify(claims));
  const expired = await signJwt(
    key,
    '{"typ":"JWT"}',
    JSON.stringify({ ...claims, exp: now - 1 }),
  );
  const audience = await signJwt(
    key,
    '{"typ":"JWT"}',
    JSON.stringify({ ...claims, aud: "another-api" }),
  );
  const early = await signJwt(
    key,
    '{"typ":"JWT"}',
    JSON.stringify({ ...claims, nbf: now + 600 }),
  );
  const parts = p.token.split(".");
  parts[1] = jwtEncode(utf8(JSON.stringify({ ...claims, sub: "tampered" })));
  p.cases = [
    ["Valid token", p.token, "accepted"],
    ["Expired token", expired, "rejected"],
    ["Wrong audience", audience, "rejected"],
    ["Not active yet", early, "rejected"],
    ["Tampered claims", parts.join("."), "rejected"],
  ].map(([name, token, expected]) => ({
    id: crypto.randomUUID(),
    name,
    token,
    keyId: "",
    expected: expected as JwtCase["expected"],
  }));
  return p;
}
