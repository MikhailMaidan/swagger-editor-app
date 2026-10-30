import {
  IdemError,
  idemInt,
  idemWriteMethod,
  normalizeIdemIdentity,
  normalizeIdemPolicy,
  type IdemIdentity,
  type IdemPolicy,
} from "./idempotency-project";
export type IdemAdmission = {
  outcome:
    | "execute"
    | "replay"
    | "wait"
    | "conflict"
    | "in-flight"
    | "capacity"
    | "missing"
    | "bypass"
    | "unreplayable"
    | "wait-capacity"
    | "body-limit";
  token: number | null;
  retryAfterMs: number | null;
  entries: number;
};
export type IdemCompletion<T> = {
  status: number;
  bytes: number;
  payload: T;
  failed: boolean;
};
type Entry<T> = {
  token: number;
  fingerprint: string;
  state: "pending" | "cached" | "unreplayable";
  startedAt: number;
  completedAt: number | null;
  expiresAt: number | null;
  waiters: number;
  payload?: T;
};
export async function idemFingerprint(
  q: IdemIdentity,
  body: Uint8Array,
): Promise<string> {
  const prefix = new TextEncoder().encode(
      JSON.stringify([q.method, q.route, q.contentType]),
    ),
    bytes = new Uint8Array(prefix.length + 1 + body.length);
  bytes.set(prefix);
  bytes.set(body, prefix.length + 1);
  try {
    return Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    throw new IdemError("crypto");
  }
}
export function createIdempotencyStore<T>(value: IdemPolicy) {
  const p = normalizeIdemPolicy(value),
    entries = new Map<string, Entry<T>>(),
    tokens = new Map<number, Entry<T>>();
  let lastNow = -1,
    nextToken = 1;
  const clock = (now: number) => {
    if (!idemInt(now, 0, 4102531200000) || now < lastNow)
      throw new IdemError("clock");
    lastNow = now;
  };
  function sweep(now: number) {
    for (const [key, e] of entries)
      if (e.expiresAt !== null && e.expiresAt <= now) {
        entries.delete(key);
        tokens.delete(e.token);
      }
  }
  function admit(
    value: IdemIdentity & { fingerprint: string; bytes: number },
    now: number,
  ): IdemAdmission {
    const q = normalizeIdemIdentity(value);
    if (
      !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
      !idemInt(value.bytes, 0, 16384)
    )
      throw new IdemError("input");
    clock(now);
    sweep(now);
    const result = (
      outcome: IdemAdmission["outcome"],
      e?: Entry<T>,
      retryAfterMs: number | null = null,
    ): IdemAdmission => ({
      outcome,
      token: e?.token ?? null,
      retryAfterMs,
      entries: entries.size,
    });
    if (!idemWriteMethod(q.method)) return result("bypass");
    if (!q.key) return result(p.missingKey === "reject" ? "missing" : "bypass");
    if (value.bytes > p.maxRequestBytes) return result("body-limit");
    const key = JSON.stringify(
        p.scope === "client"
          ? [q.client, q.key]
          : [q.client, q.method, q.route, q.key],
      ),
      e = entries.get(key);
    if (e) {
      const retry = e.expiresAt === null ? null : e.expiresAt - now;
      if (e.fingerprint !== value.fingerprint)
        return result("conflict", e, retry);
      if (e.state === "cached") return result("replay", e);
      if (e.state === "unreplayable") return result("unreplayable", e, retry);
      if (p.inFlight === "reject") return result("in-flight", e);
      if (e.waiters >= p.maxWaiters) return result("wait-capacity", e);
      e.waiters++;
      return result("wait", e);
    }
    if (entries.size >= p.maxEntries) {
      const expiries = [...entries.values()].flatMap((e) =>
        e.expiresAt === null ? [] : [e.expiresAt],
      );
      return result(
        "capacity",
        undefined,
        expiries.length ? Math.min(...expiries) - now : null,
      );
    }
    const entry: Entry<T> = {
      token: nextToken++,
      fingerprint: value.fingerprint,
      state: "pending",
      startedAt: now,
      completedAt: null,
      expiresAt: null,
      waiters: 0,
    };
    entries.set(key, entry);
    tokens.set(entry.token, entry);
    return result("execute", entry);
  }
  function finish(token: number, now: number, result: IdemCompletion<T>) {
    const e = tokens.get(token);
    if (
      !e ||
      e.state !== "pending" ||
      !idemInt(result.status, 200, 599) ||
      !idemInt(result.bytes, 0, Number.MAX_SAFE_INTEGER)
    )
      throw new IdemError("input");
    clock(now);
    e.completedAt = now;
    e.expiresAt = now + p.ttlMs;
    e.state =
      result.failed ||
      result.bytes > p.maxResponseBytes ||
      (!p.cacheErrors && result.status >= 300)
        ? "unreplayable"
        : "cached";
    if (e.state === "cached") e.payload = result.payload;
    return e.state;
  }
  return {
    admit,
    finish,
    replay(token: number) {
      return tokens.get(token)?.payload;
    },
    release(token: number) {
      const e = tokens.get(token);
      if (e) e.waiters = Math.max(0, e.waiters - 1);
    },
    time: () => lastNow,
    inspect: () => {
      sweep(lastNow);
      return [...tokens.values()].map(
        ({ token, state, startedAt, completedAt, expiresAt, waiters }) => ({
          token,
          state,
          startedAt,
          completedAt,
          expiresAt,
          waiters,
        }),
      );
    },
  };
}
