import { parseTransformValue } from "./api-transform";
import { getByteSize } from "./text-encoding";

export const MAX_HOOK_BODY = 256 * 1024;
export const MAX_HOOK_PROJECT = 2 * 1024 * 1024;
export const MAX_HOOK_DELIVERIES = 40;
export const MAX_HOOK_KEYS = 8;
export const MAX_HOOK_PROFILES = 8;
export const HOOK_PROVIDERS = ["github", "stripe", "standard"] as const;
export type HookProvider = (typeof HOOK_PROVIDERS)[number];
export type HookOutcome = "accepted" | "rejected" | "duplicate" | "capacity";
export type HookKey = {
  id: string;
  name: string;
  provider: HookProvider;
  enabled: boolean;
};
export type HookProfile = {
  id: string;
  name: string;
  provider: HookProvider;
  keyIds: string[];
  requireTimestamp: boolean;
  maxAgeSeconds: number;
  maxFutureSeconds: number;
  replay: "off" | "body" | "signed-id";
  ttlSeconds: number;
  capacity: number;
};
export type HookDelivery = {
  id: string;
  name: string;
  profileId: string;
  atSeconds: number;
  encoding: "utf8" | "base64";
  body: string;
  headers: string;
  expect: HookOutcome;
};
export type HookProject = {
  kind: "rsswag-webhook-project";
  version: 1;
  name: string;
  clockSeconds: number;
  keys: HookKey[];
  profiles: HookProfile[];
  deliveries: HookDelivery[];
};
export type HookErrorCode =
  | "project"
  | "json"
  | "limit"
  | "encoding"
  | "headers"
  | "key"
  | "crypto"
  | "cancelled"
  | "har";
export class HookError extends Error {
  constructor(public code: HookErrorCode) {
    super(code);
    this.name = "HookError";
  }
}
export const hookObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const hookText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const hookInteger = (
  v: unknown,
  min: number,
  max: number,
): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const hookId = (v: unknown): v is string =>
  hookText(v, 80) && /^[a-z0-9_-]+$/i.test(v);
export const hookProvider = (v: unknown): v is HookProvider =>
  typeof v === "string" && (HOOK_PROVIDERS as readonly string[]).includes(v);
export function hookJson(source: string, max = MAX_HOOK_PROJECT): unknown {
  if (!hookText(source, max)) throw new HookError("limit");
  try {
    return parseTransformValue(source);
  } catch {
    throw new HookError("json");
  }
}
export function hookBase64(bytes: Uint8Array): string {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}
export function hookDecode(source: string, max = MAX_HOOK_BODY): Uint8Array {
  if (typeof source !== "string" || source.length > Math.ceil(max / 3) * 4)
    throw new HookError("limit");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      source,
    )
  )
    throw new HookError("encoding");
  try {
    const bytes = Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
    if (bytes.length > max) throw new HookError("limit");
    if (hookBase64(bytes) !== source) throw new HookError("encoding");
    return bytes;
  } catch (e) {
    throw e instanceof HookError ? e : new HookError("encoding");
  }
}
export function hookBody(
  d: Pick<HookDelivery, "body" | "encoding">,
): Uint8Array {
  if (d.encoding === "base64") return hookDecode(d.body);
  if (d.encoding !== "utf8" || !hookText(d.body, MAX_HOOK_BODY))
    throw new HookError("limit");
  // Lone surrogates would silently be replaced by TextEncoder, changing bytes.
  if (!d.body.isWellFormed()) throw new HookError("encoding");
  return new TextEncoder().encode(d.body);
}
export function hookHeaders(value: unknown): Record<string, string> {
  if (
    !hookObject(value) ||
    Object.keys(value).length > 60 ||
    getByteSize(JSON.stringify(value)) > 32768
  )
    throw new HookError("headers");
  const pairs: [string, string][] = [],
    names = new Set<string>();
  for (const [key, v] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]{1,128}$/i.test(key) ||
      names.has(lower) ||
      !hookText(v, 8192) ||
      /[\x00-\x1f\x7f]/.test(v)
    )
      throw new HookError("headers");
    names.add(lower);
    pairs.push([lower, v]);
  }
  return Object.fromEntries(pairs);
}
export const parseHookHeaders = (source: string) =>
  hookHeaders(hookJson(source, 32768));
export function normalizeHookKey(v: unknown): HookKey {
  if (
    !hookObject(v) ||
    !hookId(v.id) ||
    !hookText(v.name, 120) ||
    !v.name.trim() ||
    !hookProvider(v.provider) ||
    typeof v.enabled !== "boolean"
  )
    throw new HookError("project");
  return { id: v.id, name: v.name, provider: v.provider, enabled: v.enabled };
}
export function normalizeHookProfile(v: unknown): HookProfile {
  if (
    !hookObject(v) ||
    !hookId(v.id) ||
    !hookText(v.name, 120) ||
    !v.name.trim() ||
    !hookProvider(v.provider) ||
    !Array.isArray(v.keyIds) ||
    !v.keyIds.length ||
    v.keyIds.length > MAX_HOOK_KEYS ||
    v.keyIds.some((k) => !hookId(k)) ||
    new Set(v.keyIds).size !== v.keyIds.length ||
    typeof v.requireTimestamp !== "boolean" ||
    !hookInteger(v.maxAgeSeconds, 0, 86400) ||
    !hookInteger(v.maxFutureSeconds, 0, 3600) ||
    (v.replay !== "off" && v.replay !== "body" && v.replay !== "signed-id") ||
    (v.replay === "signed-id" && v.provider !== "standard") ||
    !hookInteger(v.ttlSeconds, 1, 86400) ||
    !hookInteger(v.capacity, 1, 500)
  )
    throw new HookError("project");
  return {
    id: v.id,
    name: v.name,
    provider: v.provider,
    keyIds: [...v.keyIds] as string[],
    requireTimestamp: v.requireTimestamp,
    maxAgeSeconds: v.maxAgeSeconds,
    maxFutureSeconds: v.maxFutureSeconds,
    replay: v.replay,
    ttlSeconds: v.ttlSeconds,
    capacity: v.capacity,
  };
}
export function normalizeHookDelivery(v: unknown): HookDelivery {
  if (
    !hookObject(v) ||
    !hookId(v.id) ||
    !hookText(v.name, 120) ||
    !v.name.trim() ||
    !hookId(v.profileId) ||
    !hookInteger(v.atSeconds, 0, 86400) ||
    (v.encoding !== "utf8" && v.encoding !== "base64") ||
    typeof v.body !== "string" ||
    !hookText(v.headers, 32768) ||
    (v.expect !== "accepted" &&
      v.expect !== "rejected" &&
      v.expect !== "duplicate" &&
      v.expect !== "capacity")
  )
    throw new HookError("project");
  const d: HookDelivery = {
    id: v.id,
    name: v.name,
    profileId: v.profileId,
    atSeconds: v.atSeconds,
    encoding: v.encoding,
    body: v.body,
    headers: v.headers,
    expect: v.expect,
  };
  hookBody(d);
  parseHookHeaders(d.headers);
  return d;
}
export function normalizeHookProject(v: unknown): HookProject {
  if (
    !hookObject(v) ||
    v.kind !== "rsswag-webhook-project" ||
    v.version !== 1 ||
    !hookText(v.name, 120) ||
    !v.name.trim() ||
    !hookInteger(v.clockSeconds, 0, 4102444800) ||
    !Array.isArray(v.keys) ||
    !v.keys.length ||
    v.keys.length > MAX_HOOK_KEYS ||
    !Array.isArray(v.profiles) ||
    !v.profiles.length ||
    v.profiles.length > MAX_HOOK_PROFILES ||
    !Array.isArray(v.deliveries) ||
    v.deliveries.length > MAX_HOOK_DELIVERIES
  )
    throw new HookError("project");
  const keys = v.keys.map(normalizeHookKey),
    profiles = v.profiles.map(normalizeHookProfile),
    deliveries = v.deliveries.map(normalizeHookDelivery);
  for (const list of [keys, profiles, deliveries])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw new HookError("project");
  if (
    profiles.some((p) =>
      p.keyIds.some(
        (id) => !keys.some((k) => k.id === id && k.provider === p.provider),
      ),
    ) ||
    deliveries.some((d) => !profiles.some((p) => p.id === d.profileId))
  )
    throw new HookError("project");
  const p: HookProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    clockSeconds: v.clockSeconds,
    keys,
    profiles,
    deliveries,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_HOOK_PROJECT)
    throw new HookError("limit");
  return p;
}
export const parseHookProject = (source: string) =>
  normalizeHookProject(hookJson(source));
export function serializeHookProject(value: HookProject): string {
  const p = normalizeHookProject(value),
    source = JSON.stringify(p, null, 2);
  return getByteSize(source) <= MAX_HOOK_PROJECT ? source : JSON.stringify(p);
}
export const newHookProfile = (
  provider: HookProvider,
  id = provider,
): HookProfile => ({
  id,
  name: `${provider} receiver`,
  provider,
  keyIds: [`${provider}-key`],
  requireTimestamp: provider !== "github",
  maxAgeSeconds: 300,
  maxFutureSeconds: 30,
  replay: provider === "standard" ? "signed-id" : "body",
  ttlSeconds: 600,
  capacity: 100,
});
export const newHookDelivery = (
  id = "delivery-1",
  profileId = "standard",
): HookDelivery => ({
  id,
  name: id,
  profileId,
  atSeconds: 0,
  encoding: "utf8",
  body: '{"id":"evt_1","type":"user.created","data":{"name":"Ada"}}',
  headers: "{}",
  expect: "accepted",
});
export const emptyHookProject = (): HookProject => ({
  kind: "rsswag-webhook-project",
  version: 1,
  name: "Webhook verification project",
  clockSeconds: 1700000000,
  keys: HOOK_PROVIDERS.map((provider) => ({
    id: `${provider}-key`,
    name: `${provider} secret`,
    provider,
    enabled: true,
  })),
  profiles: HOOK_PROVIDERS.map((provider) => newHookProfile(provider)),
  deliveries: [newHookDelivery()],
});
