import { getByteSize } from "./text-encoding";

export type CacheHeaders = Record<string, string>;
export type CacheDirectives = {
  values: Map<string, string | null>;
  invalid: boolean;
};
const token = /^[!#$%&'*+.^_`|~\da-z-]+$/i;
const own = (v: object, key: string) => Object.hasOwn(v, key);
export const cacheObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export type CacheErrorCode =
  "json" | "project" | "headers" | "url" | "limit" | "har";
export class CacheError extends Error {
  constructor(public code: CacheErrorCode) {
    super(code);
    this.name = "CacheError";
  }
}
export function cacheError(e: unknown): CacheErrorCode {
  return e instanceof CacheError ? e.code : "project";
}
export function cacheText(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length <= max && getByteSize(v) <= max;
}
export function cacheHeaders(value: unknown): CacheHeaders {
  if (!cacheObject(value) || Object.keys(value).length > 80)
    throw new CacheError("headers");
  const entries = Object.entries(value).map(([key, v]) => {
    if (
      !token.test(key) ||
      key.length > 128 ||
      !cacheText(v, 8192) ||
      /[\x00-\x08\x0a-\x1f\x7f]/.test(v)
    )
      throw new CacheError("headers");
    return [key.toLowerCase(), v.trim()] as const;
  });
  if (
    new Set(entries.map(([key]) => key)).size !== entries.length ||
    getByteSize(JSON.stringify(entries)) > 32768
  )
    throw new CacheError("headers");
  return Object.fromEntries(entries);
}
export function cacheUrl(value: unknown): string {
  try {
    if (!cacheText(value, 8192)) throw 0;
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw 0;
    return url.href;
  } catch {
    throw new CacheError("url");
  }
}

// Split list fields without splitting commas inside quoted field-name lists.
export function cacheControl(source = ""): CacheDirectives {
  const values = new Map<string, string | null>();
  const parts: string[] = [];
  let quoted = false,
    escaped = false,
    start = 0,
    invalid = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (escaped) escaped = false;
    else if (quoted && c === "\\") escaped = true;
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  invalid = quoted || escaped;
  for (const part of parts) {
    if (!part.trim()) continue;
    const match = /^\s*([^=\s]+)\s*(?:=\s*(.*?))?\s*$/.exec(part);
    if (!match || !token.test(match[1])) {
      invalid = true;
      continue;
    }
    const key = match[1].toLowerCase();
    let value: string | null = match[2] ?? null;
    if (value !== null && value.startsWith('"')) {
      if (!/^"(?:[^"\\\x00-\x1f\x7f]|\\[\x20-\x7e])*"$/.test(value))
        invalid = true;
      else value = value.slice(1, -1).replace(/\\(.)/g, "$1");
    } else if (value !== null && !token.test(value)) invalid = true;
    if (values.has(key)) invalid = true;
    else values.set(key, value);
  }
  return { values, invalid };
}
export function cacheSeconds(
  directives: CacheDirectives,
  key: string,
): number | undefined {
  const value = directives.values.get(key);
  if (directives.invalid || typeof value !== "string" || !/^\d+$/.test(value))
    return undefined;
  return Math.min(Number(value), 2147483648);
}
export function cacheDate(value?: string): number | undefined {
  if (
    !value ||
    !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/i.test(
      value,
    )
  )
    return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) &&
    new Date(parsed).toUTCString().toLowerCase() === value.toLowerCase()
    ? parsed
    : undefined;
}
export function cacheVary(headers: CacheHeaders): string[] | null {
  if (!own(headers, "vary") || !headers.vary.trim()) return [];
  const fields = headers.vary.split(",").map((v) => v.trim().toLowerCase());
  if (fields.some((v) => !token.test(v) || v === "*")) return null;
  return [...new Set(fields)].sort();
}
export function cacheEtag(value?: string): string | undefined {
  return value && /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)
    ? value
    : undefined;
}
export function matchingCacheEtag(a: string, b: string): boolean {
  return (
    !!cacheEtag(a) &&
    !!cacheEtag(b) &&
    a.replace(/^W\//, "") === b.replace(/^W\//, "")
  );
}
export function storedCacheHeaders(headers: CacheHeaders): CacheHeaders {
  const hop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "proxy-connection",
    ...(headers.connection ?? "").split(",").map((s) => s.trim().toLowerCase()),
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !hop.has(key)),
  );
}

export type CacheMode = "private" | "shared";
export type CacheFreshness = {
  ageMs: number;
  lifetimeMs: number;
  staleMs: number;
  fresh: boolean;
  source: "s-maxage" | "max-age" | "expires" | "heuristic" | "none" | "invalid";
};
export function cacheFreshness(
  headers: CacheHeaders,
  requestAt: number,
  responseAt: number,
  now: number,
  mode: CacheMode,
  heuristic: boolean,
): CacheFreshness {
  const cc = cacheControl(headers["cache-control"]);
  const date = cacheDate(headers.date) ?? responseAt;
  const apparentAge = Math.max(0, responseAt - date);
  const ageValue = (headers.age ?? "").split(",")[0].trim();
  const age = /^\d+$/.test(ageValue)
    ? Math.min(Number(ageValue), 2147483648) * 1000
    : 0;
  const initialAge = Math.max(
    apparentAge,
    age + Math.max(0, responseAt - requestAt),
  );
  const ageMs = initialAge + Math.max(0, now - responseAt);
  let lifetimeMs = 0;
  let source: CacheFreshness["source"] = "none";
  const field =
    mode === "shared" && cc.values.has("s-maxage") ? "s-maxage" : "max-age";
  if (cc.invalid) source = "invalid";
  else if (cc.values.has(field)) {
    const seconds = cacheSeconds(cc, field);
    if (seconds === undefined) source = "invalid";
    else {
      lifetimeMs = seconds * 1000;
      source = field;
    }
  } else if (own(headers, "expires")) {
    const expires = cacheDate(headers.expires);
    if (expires === undefined) source = "invalid";
    else {
      lifetimeMs = Math.max(0, expires - date);
      source = "expires";
    }
  } else if (heuristic) {
    const modified = cacheDate(headers["last-modified"]);
    if (modified !== undefined && modified <= date) {
      lifetimeMs = Math.min(86400000, Math.floor((date - modified) / 10));
      source = "heuristic";
    }
  }
  return {
    ageMs,
    lifetimeMs,
    staleMs: Math.max(0, ageMs - lifetimeMs),
    fresh: lifetimeMs > ageMs,
    source,
  };
}
