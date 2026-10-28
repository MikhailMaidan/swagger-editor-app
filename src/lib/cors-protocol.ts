import {
  corsToken,
  type CorsCase,
  type CorsHeaders,
  type CorsPolicy,
} from "./cors-project";

export const corsSafeMethods = new Set(["GET", "HEAD", "POST"]);
const forbiddenNames = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);
export function corsForbiddenRequest(name: string, value: string): boolean {
  name = name.toLowerCase();
  return (
    forbiddenNames.has(name) ||
    /^(sec-|proxy-)/.test(name) ||
    (["x-http-method", "x-http-method-override", "x-method-override"].includes(
      name,
    ) &&
      value
        .split(",")
        .some((v) =>
          ["CONNECT", "TRACE", "TRACK"].includes(v.trim().toUpperCase()),
        ))
  );
}
const unsafeByte = /[\x00-\x08\x0a-\x1f"():<>?@\[\\\]{}\x7f]/;
export function corsSafelistedHeader(name: string, value: string): boolean {
  if (value.length > 128) return false;
  switch (name.toLowerCase()) {
    case "accept":
      return !unsafeByte.test(value);
    case "accept-language":
    case "content-language":
      return /^[a-z0-9 *,.;=\-]*$/i.test(value);
    case "content-type": {
      if (unsafeByte.test(value)) return false;
      const essence = value.split(";")[0].trim().toLowerCase();
      return [
        "application/x-www-form-urlencoded",
        "multipart/form-data",
        "text/plain",
      ].includes(essence);
    }
    case "range": {
      const m = /^bytes=(\d+)-(\d*)$/.exec(value);
      return !!m && (!m[2] || BigInt(m[2]) >= BigInt(m[1]));
    }
    default:
      return false;
  }
}
export function corsUnsafeHeaders(headers: CorsHeaders): string[] {
  const safe = Object.entries(headers).filter(([n, v]) =>
    corsSafelistedHeader(n, v),
  );
  const overflow = safe.reduce((sum, [, v]) => sum + v.length, 0) > 1024;
  return Object.keys(headers)
    .filter((n) => overflow || !corsSafelistedHeader(n, headers[n]))
    .sort();
}
export function corsList(
  value: string | undefined,
  lower = false,
): string[] | null {
  if (value === undefined) return [];
  const parts = value
    .split(",")
    .map((v) => v.replace(/^[\t ]+|[\t ]+$/g, ""))
    .filter(Boolean);
  if (parts.some((v) => !corsToken.test(v))) return null;
  return [...new Set(lower ? parts.map((v) => v.toLowerCase()) : parts)];
}
export type CorsReason =
  | "same-origin"
  | "same-origin-mode"
  | "no-cors-method"
  | "no-cors-header"
  | "forbidden-header"
  | "preflight-required"
  | "preflight-cached"
  | "simple-request"
  | "preflight-network"
  | "preflight-status"
  | "missing-origin"
  | "origin-mismatch"
  | "wildcard-credentials"
  | "credentials-header"
  | "allow-list"
  | "method-denied"
  | "header-denied"
  | "authorization-explicit"
  | "response-network"
  | "redirect"
  | "response-allowed"
  | "opaque"
  | "vary-origin"
  | "cache-evicted";
export function corsCheck(
  origin: string,
  credentials: CorsCase["credentials"],
  headers: CorsHeaders,
): CorsReason | null {
  const allowed = headers["access-control-allow-origin"];
  if (allowed === undefined) return "missing-origin";
  if (allowed === "*" && credentials !== "include") return null;
  if (allowed === "*" && credentials === "include")
    return "wildcard-credentials";
  if (allowed !== origin) return "origin-mismatch";
  if (
    credentials === "include" &&
    headers["access-control-allow-credentials"] !== "true"
  )
    return "credentials-header";
  return null;
}
export function corsPreflightCheck(
  c: CorsCase,
  status: number,
  headers: CorsHeaders,
): {
  issue: CorsReason | null;
  methods: string[];
  names: string[];
  maxAge: number;
} {
  let methods = corsList(headers["access-control-allow-methods"]);
  const names = corsList(headers["access-control-allow-headers"], true);
  let issue: CorsReason | null =
    status === 0
      ? "preflight-network"
      : corsCheck(c.origin, c.credentials, headers);
  if (!issue && (status < 200 || status >= 300)) issue = "preflight-status";
  if (!issue && (!methods || !names)) issue = "allow-list";
  if (
    !Object.hasOwn(headers, "access-control-allow-methods") &&
    c.forcePreflight
  )
    methods = [c.method];
  const wildcard = c.credentials !== "include";
  if (
    !issue &&
    !corsSafeMethods.has(c.method) &&
    !methods!.includes(c.method) &&
    !(wildcard && methods!.includes("*"))
  )
    issue = "method-denied";
  if (
    !issue &&
    Object.hasOwn(c.headers, "authorization") &&
    !names!.includes("authorization")
  )
    issue = "authorization-explicit";
  if (
    !issue &&
    corsUnsafeHeaders(c.headers).some(
      (n) => !names!.includes(n) && !(wildcard && names!.includes("*")),
    )
  )
    issue = "header-denied";
  const age = headers["access-control-max-age"];
  const maxAge =
    age === undefined || !/^\d+$/.test(age)
      ? 5
      : Math.min(Number(age), 2147483648);
  return { issue, methods: methods ?? [], names: names ?? [], maxAge };
}
export function corsPolicyHeaders(
  policy: CorsPolicy,
  origin: string,
  preflight: boolean,
): CorsHeaders {
  const headers: CorsHeaders = {
    vary: preflight
      ? "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
      : "Origin",
  };
  if (policy.origins.includes("*") || policy.origins.includes(origin)) {
    headers["access-control-allow-origin"] = policy.origins.includes("*")
      ? "*"
      : origin;
    if (policy.credentials)
      headers["access-control-allow-credentials"] = "true";
    if (preflight) {
      headers["access-control-allow-methods"] = policy.methods.join(", ");
      headers["access-control-allow-headers"] =
        policy.requestHeaders.join(", ");
      headers["access-control-max-age"] = String(policy.maxAge);
    } else if (policy.exposeHeaders.length)
      headers["access-control-expose-headers"] =
        policy.exposeHeaders.join(", ");
  }
  return headers;
}
export function corsApplyPolicy(
  base: CorsHeaders,
  generated: CorsHeaders,
): CorsHeaders {
  const headers = Object.fromEntries(
    Object.entries(base).filter(([n]) => !n.startsWith("access-control-")),
  );
  const vary = [
    ...new Set(
      [...(headers.vary ?? "").split(","), ...(generated.vary ?? "").split(",")]
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return {
    ...headers,
    ...generated,
    vary: vary.includes("*") ? "*" : vary.join(", "),
  };
}
export function corsVisibleHeaders(
  headers: CorsHeaders,
  basic: boolean,
  credentials: CorsCase["credentials"],
): CorsHeaders {
  const exposed =
    corsList(headers["access-control-expose-headers"], true) ?? [];
  const safe = new Set([
    "cache-control",
    "content-language",
    "content-length",
    "content-type",
    "expires",
    "last-modified",
    "pragma",
    ...exposed,
  ]);
  const all = basic || (credentials !== "include" && exposed.includes("*"));
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([n]) =>
        !["set-cookie", "set-cookie2"].includes(n) && (all || safe.has(n)),
    ),
  );
}
export type CorsPolicyFinding =
  | "credential-wildcard-origin"
  | "credential-wildcard-method"
  | "credential-wildcard-header"
  | "credential-wildcard-exposure"
  | "null-origin";
export function corsPolicyFindings(
  p: CorsPolicy,
): { code: CorsPolicyFinding; error: boolean }[] {
  return [
    ...(p.credentials && p.origins.includes("*")
      ? [{ code: "credential-wildcard-origin" as const, error: true }]
      : []),
    ...(p.credentials && p.methods.includes("*")
      ? [{ code: "credential-wildcard-method" as const, error: true }]
      : []),
    ...(p.credentials && p.requestHeaders.includes("*")
      ? [{ code: "credential-wildcard-header" as const, error: true }]
      : []),
    ...(p.credentials && p.exposeHeaders.includes("*")
      ? [{ code: "credential-wildcard-exposure" as const, error: true }]
      : []),
    ...(p.origins.includes("null")
      ? [{ code: "null-origin" as const, error: false }]
      : []),
  ];
}
