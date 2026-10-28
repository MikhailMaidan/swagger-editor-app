import { parseTransformValue } from "./api-transform";
import { getByteSize } from "./text-encoding";

export const OAUTH_CALLBACK_PATH = "/oauth/callback";
export const OAUTH_CHANNEL_PREFIX = "rsswag-oauth:";
export function oauthCallbackUri(origin: string, issuer: string): string {
  const url = new URL(OAUTH_CALLBACK_PATH, origin);
  if (issuer) url.searchParams.set("as", issuer);
  return url.href;
}
export const MAX_OAUTH_BYTES = 64 * 1024;
export const MAX_OAUTH_PROJECT_BYTES = 128 * 1024;
export const MAX_OAUTH_PROFILES = 10;
export type OAuthIssue =
  | "profile"
  | "project"
  | "url"
  | "scope"
  | "metadata"
  | "issuer"
  | "crypto"
  | "callback"
  | "state"
  | "expired"
  | "token"
  | "token-type"
  | "device"
  | "busy"
  | "cancelled"
  | "timeout"
  | "network"
  | "http"
  | "json"
  | "limit"
  | "oauth-error"
  | "unavailable";
export const OAUTH_REMOTE_ERRORS = [
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "access_denied",
  "authorization_pending",
  "slow_down",
  "expired_token",
  "server_error",
  "temporarily_unavailable",
  "unsupported_token_type",
] as const;
export type OAuthRemoteError = (typeof OAUTH_REMOTE_ERRORS)[number];
export class OAuthError extends Error {
  constructor(
    public code: OAuthIssue,
    public remote?: OAuthRemoteError,
    public status?: number,
  ) {
    super(code);
  }
}
export const oauthError = (e: unknown) =>
  e instanceof OAuthError ? e : new OAuthError("network");
export type OAuthProfile = {
  id: string;
  name: string;
  issuer: string;
  metadataUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  deviceEndpoint: string;
  revocationEndpoint: string;
  clientId: string;
  scope: string;
  resource: string;
  audience: string;
  requireIssuer: boolean;
  timeoutMs: number;
};
export type OAuthProject = {
  kind: "rsswag-oauth-project";
  version: 1;
  name: string;
  profiles: OAuthProfile[];
};
export type OAuthToken = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  scope: string;
  receivedAt: number;
  expiresAt: number | null;
  source: "live" | "demo";
};
export type OAuthDevice = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalMs: number;
  nextPollAt: number;
};
export type OAuthAuthorization = {
  state: string;
  verifier: string;
  challenge: string;
  redirectUri: string;
  expiresAt: number;
  url: string;
};
export const oauthObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const named = (v: unknown) => text(v, 120) && !!v.trim();
export function oauthUrl(source: string, issuer = false): string {
  try {
    if (!text(source, 8192) || !source || source !== source.trim()) throw 0;
    const url = new URL(source),
      loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      source.includes("#") ||
      (issuer && source.includes("?"))
    )
      throw 0;
    return issuer ? source : url.href;
  } catch {
    throw new OAuthError("url");
  }
}
export function oauthScope(source: string): string {
  if (!text(source, 2048)) throw new OAuthError("scope");
  const scopes = source.split(" ").filter(Boolean);
  if (scopes.some((s) => !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(s)))
    throw new OAuthError("scope");
  return Array.from(new Set(scopes)).join(" ");
}
export function normalizeOAuthProfile(v: unknown): OAuthProfile {
  if (
    !oauthObject(v) ||
    !named(v.id) ||
    !named(v.name) ||
    !text(v.issuer, 8192) ||
    !text(v.clientId, 1024) ||
    !text(v.scope, 2048) ||
    !text(v.resource, 4096) ||
    !text(v.audience, 4096) ||
    typeof v.requireIssuer !== "boolean" ||
    typeof v.timeoutMs !== "number" ||
    !Number.isInteger(v.timeoutMs) ||
    v.timeoutMs < 100 ||
    v.timeoutMs > 30000
  )
    throw new OAuthError("profile");
  const endpoints = [
    "metadataUrl",
    "authorizationEndpoint",
    "tokenEndpoint",
    "deviceEndpoint",
    "revocationEndpoint",
  ] as const;
  for (const k of endpoints)
    if (!text(v[k], 8192)) throw new OAuthError("profile");
  for (const k of endpoints)
    if (v[k]) {
      const url = new URL(oauthUrl(v[k] as string));
      if (
        Array.from(url.searchParams.keys()).some((name) =>
          /^(access_token|refresh_token|id_token|client_secret|client_assertion|code_verifier|device_code|password|request|request_uri)$/i.test(
            name,
          ),
        )
      )
        throw new OAuthError("profile");
    }
  return {
    id: v.id as string,
    name: v.name as string,
    issuer: v.issuer ? oauthUrl(v.issuer, true) : "",
    clientId: v.clientId,
    scope: oauthScope(v.scope),
    resource: v.resource,
    audience: v.audience,
    requireIssuer: v.requireIssuer,
    timeoutMs: v.timeoutMs,
    ...(Object.fromEntries(
      endpoints.map((k) => [k, v[k] ? oauthUrl(v[k] as string) : ""]),
    ) as Pick<OAuthProfile, (typeof endpoints)[number]>),
  };
}
export function defaultOAuthProfile(id = "starter"): OAuthProfile {
  return {
    id,
    name: "Public OAuth client",
    issuer: "https://identity.example",
    metadataUrl: "",
    authorizationEndpoint: "https://identity.example/authorize",
    tokenEndpoint: "https://identity.example/token",
    deviceEndpoint: "https://identity.example/device",
    revocationEndpoint: "https://identity.example/revoke",
    clientId: "",
    scope: "read:items",
    resource: "",
    audience: "",
    requireIssuer: true,
    timeoutMs: 10000,
  };
}
export const emptyOAuthProject = (): OAuthProject => ({
  kind: "rsswag-oauth-project",
  version: 1,
  name: "OAuth clients",
  profiles: [defaultOAuthProfile()],
});
export const demoOAuthProject = (): OAuthProject => ({
  ...emptyOAuthProject(),
  name: "Offline OAuth lifecycle",
  profiles: [{ ...defaultOAuthProfile(), clientId: "rsswag-demo-client" }],
});
export function parseOAuthJson(source: string): Record<string, unknown> {
  if (getByteSize(source) > MAX_OAUTH_BYTES) throw new OAuthError("limit");
  try {
    const value = parseTransformValue(source);
    if (!oauthObject(value)) throw 0;
    return value;
  } catch {
    throw new OAuthError("json");
  }
}
export function normalizeOAuthProject(v: unknown): OAuthProject {
  if (
    !oauthObject(v) ||
    v.kind !== "rsswag-oauth-project" ||
    v.version !== 1 ||
    !named(v.name) ||
    !Array.isArray(v.profiles) ||
    !v.profiles.length ||
    v.profiles.length > MAX_OAUTH_PROFILES
  )
    throw new OAuthError("project");
  const profiles = v.profiles.map(normalizeOAuthProfile);
  if (new Set(profiles.map((p) => p.id)).size !== profiles.length)
    throw new OAuthError("project");
  return {
    kind: "rsswag-oauth-project",
    version: 1,
    name: v.name as string,
    profiles,
  };
}
export function parseOAuthProject(source: string): OAuthProject {
  if (getByteSize(source) > MAX_OAUTH_PROJECT_BYTES)
    throw new OAuthError("limit");
  let value: unknown;
  try {
    value = parseTransformValue(source);
  } catch {
    throw new OAuthError("project");
  }
  return normalizeOAuthProject(value);
}
export function serializeOAuthProject(project: OAuthProject): string {
  const source = JSON.stringify(normalizeOAuthProject(project), null, 2) + "\n";
  if (getByteSize(source) > MAX_OAUTH_PROJECT_BYTES)
    throw new OAuthError("limit");
  return source;
}
export function oauthMetadataUrl(profile: OAuthProfile): string {
  const url = new URL(oauthUrl(profile.issuer, true));
  if (profile.metadataUrl) {
    const metadata = oauthUrl(profile.metadataUrl);
    if (new URL(metadata).origin !== url.origin)
      throw new OAuthError("metadata");
    return metadata;
  }
  return `${url.origin}/.well-known/oauth-authorization-server${url.pathname === "/" ? "" : url.pathname}`;
}
export function applyOAuthMetadata(
  profile: OAuthProfile,
  v: unknown,
): OAuthProfile {
  if (
    !profile.issuer ||
    !oauthObject(v) ||
    typeof v.issuer !== "string" ||
    v.issuer !== profile.issuer
  )
    throw new OAuthError("issuer");
  if (
    v.token_endpoint_auth_methods_supported !== undefined &&
    (!Array.isArray(v.token_endpoint_auth_methods_supported) ||
      !v.token_endpoint_auth_methods_supported.includes("none"))
  )
    throw new OAuthError("metadata");
  if (
    v.code_challenge_methods_supported !== undefined &&
    (!Array.isArray(v.code_challenge_methods_supported) ||
      !v.code_challenge_methods_supported.includes("S256"))
  )
    throw new OAuthError("metadata");
  const next = { ...profile };
  if (typeof v.token_endpoint !== "string" || !v.token_endpoint)
    throw new OAuthError("metadata");
  for (const [field, key] of [
    ["authorizationEndpoint", "authorization_endpoint"],
    ["tokenEndpoint", "token_endpoint"],
    ["deviceEndpoint", "device_authorization_endpoint"],
    ["revocationEndpoint", "revocation_endpoint"],
  ] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== "string") throw new OAuthError("metadata");
      next[field] = oauthUrl(v[key]);
    } else next[field] = "";
  }
  if (
    v.authorization_response_iss_parameter_supported !== undefined &&
    typeof v.authorization_response_iss_parameter_supported !== "boolean"
  )
    throw new OAuthError("metadata");
  next.requireIssuer =
    profile.requireIssuer ||
    v.authorization_response_iss_parameter_supported === true;
  return normalizeOAuthProfile(next);
}
export function oauthBase64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function oauthPkceChallenge(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    throw new OAuthError("crypto");
  try {
    return oauthBase64Url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
  } catch {
    throw new OAuthError("crypto");
  }
}
export async function createOAuthAuthorization(
  profile: OAuthProfile,
  redirect: string,
  now = Date.now(),
): Promise<OAuthAuthorization> {
  if (
    !profile.clientId.trim() ||
    !profile.issuer ||
    !profile.authorizationEndpoint ||
    !profile.tokenEndpoint
  )
    throw new OAuthError("profile");
  const redirectUrl = new URL(oauthUrl(redirect));
  if (
    redirectUrl.pathname !== OAUTH_CALLBACK_PATH ||
    Array.from(redirectUrl.searchParams.keys()).some((k) => k !== "as") ||
    redirectUrl.searchParams.getAll("as").length > 1 ||
    (redirectUrl.searchParams.has("as") &&
      redirectUrl.searchParams.get("as") !== profile.issuer)
  )
    throw new OAuthError("callback");
  redirectUrl.searchParams.set("as", profile.issuer);
  const redirectUri = oauthUrl(redirectUrl.href);
  let state: string, verifier: string;
  try {
    state = oauthBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    verifier = oauthBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  } catch {
    throw new OAuthError("crypto");
  }
  const challenge = await oauthPkceChallenge(verifier),
    url = new URL(oauthUrl(profile.authorizationEndpoint));
  for (const key of [
    "client_secret",
    "access_token",
    "code_verifier",
    "nonce",
    "request",
    "request_uri",
  ])
    if (url.searchParams.has(key)) throw new OAuthError("profile");
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: profile.clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: profile.scope,
    response_mode: "query",
  }))
    url.searchParams.set(k, v);
  if (profile.resource) url.searchParams.set("resource", profile.resource);
  if (profile.audience) url.searchParams.set("audience", profile.audience);
  return {
    state,
    verifier,
    challenge,
    redirectUri,
    expiresAt: now + 5 * 60 * 1000,
    url: url.href,
  };
}
export function parseOAuthCallback(
  source: string,
  pending: OAuthAuthorization,
  profile: OAuthProfile,
  now = Date.now(),
): { code: string } {
  if (now >= pending.expiresAt) throw new OAuthError("expired");
  let url: URL;
  try {
    if (getByteSize(source) > MAX_OAUTH_BYTES) throw 0;
    url = new URL(source);
  } catch {
    throw new OAuthError("callback");
  }
  const redirect = new URL(pending.redirectUri);
  if (
    url.origin !== redirect.origin ||
    url.pathname !== redirect.pathname ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new OAuthError("callback");
  const q = url.searchParams;
  if (
    q.getAll("as").length !== 1 ||
    q.get("as") !== profile.issuer ||
    q.get("as") !== redirect.searchParams.get("as")
  )
    throw new OAuthError("issuer");
  for (const k of ["state", "code", "error", "iss"])
    if (q.getAll(k).length > 1) throw new OAuthError("callback");
  if (!q.has("state") || q.get("state") !== pending.state)
    throw new OAuthError("state");
  if (
    q.has("access_token") ||
    q.has("id_token") ||
    (q.has("code") && q.has("error"))
  )
    throw new OAuthError("callback");
  if (
    (profile.requireIssuer && !q.has("iss")) ||
    (q.has("iss") && q.get("iss") !== profile.issuer)
  )
    throw new OAuthError("issuer");
  if (q.has("error"))
    throw new OAuthError("oauth-error", oauthRemoteError(q.get("error")));
  const code = q.get("code");
  if (!code || code.length > 8192 || /[\x00-\x1f\x7f]/.test(code))
    throw new OAuthError("callback");
  return { code };
}
export function oauthRemoteError(value: unknown): OAuthRemoteError | undefined {
  return typeof value === "string" &&
    (OAUTH_REMOTE_ERRORS as readonly string[]).includes(value)
    ? (value as OAuthRemoteError)
    : undefined;
}
export function parseOAuthToken(
  v: unknown,
  scope: string,
  source: OAuthToken["source"],
  now = Date.now(),
  previousRefresh = "",
): OAuthToken {
  if (
    !oauthObject(v) ||
    typeof v.access_token !== "string" ||
    v.access_token.length > 16384 ||
    !/^[A-Za-z0-9._~+\/-]+=*$/.test(v.access_token)
  )
    throw new OAuthError("token");
  if (
    typeof v.token_type !== "string" ||
    v.token_type.toLowerCase() !== "bearer"
  )
    throw new OAuthError("token-type");
  if (
    v.expires_in !== undefined &&
    (typeof v.expires_in !== "number" ||
      !Number.isInteger(v.expires_in) ||
      v.expires_in < 0 ||
      v.expires_in > 31536000)
  )
    throw new OAuthError("token");
  if (
    v.refresh_token !== undefined &&
    (!text(v.refresh_token, 16384) || !v.refresh_token)
  )
    throw new OAuthError("token");
  if (v.scope !== undefined && typeof v.scope !== "string")
    throw new OAuthError("scope");
  return {
    accessToken: v.access_token,
    refreshToken: (v.refresh_token as string | undefined) ?? previousRefresh,
    tokenType: "Bearer",
    scope: v.scope === undefined ? scope : oauthScope(v.scope),
    receivedAt: now,
    expiresAt:
      v.expires_in === undefined ? null : now + (v.expires_in as number) * 1000,
    source,
  };
}
export function parseOAuthDevice(v: unknown, now = Date.now()): OAuthDevice {
  if (
    !oauthObject(v) ||
    !text(v.device_code, 8192) ||
    !v.device_code ||
    !text(v.user_code, 512) ||
    !v.user_code ||
    typeof v.verification_uri !== "string" ||
    typeof v.expires_in !== "number" ||
    !Number.isInteger(v.expires_in) ||
    v.expires_in < 1 ||
    v.expires_in > 900 ||
    (v.interval !== undefined &&
      (typeof v.interval !== "number" ||
        !Number.isInteger(v.interval) ||
        v.interval < 1 ||
        v.interval > 60))
  )
    throw new OAuthError("device");
  const intervalMs =
    (v.interval === undefined ? 5 : (v.interval as number)) * 1000;
  return {
    deviceCode: v.device_code,
    userCode: v.user_code,
    verificationUri: oauthUrl(v.verification_uri),
    expiresAt: now + v.expires_in * 1000,
    intervalMs,
    nextPollAt: now + intervalMs,
  };
}
export function oauthForm(
  profile: OAuthProfile,
  fields: Record<string, string>,
  includeScope = false,
): URLSearchParams {
  if (!profile.clientId.trim() || !profile.tokenEndpoint)
    throw new OAuthError("profile");
  const form = new URLSearchParams({ ...fields, client_id: profile.clientId });
  if (includeScope && profile.scope) form.set("scope", profile.scope);
  if (profile.resource) form.set("resource", profile.resource);
  if (profile.audience) form.set("audience", profile.audience);
  return form;
}
