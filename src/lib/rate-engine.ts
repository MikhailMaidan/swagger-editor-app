import {
  MAX_RATE_HISTORY,
  RateError,
  normalizeRatePolicy,
  rateInt,
  rateMethod,
  rateText,
  type RatePolicy,
  type RateRule,
  type RateOutcome,
} from "./rate-project";
export type RateIdentity = {
  client: string;
  route: string;
  method: string;
  cost: number;
};
export type RateRuleDecision = {
  id: string;
  name: string;
  algorithm: RateRule["algorithm"];
  scope: RateRule["scope"];
  wouldAllow: boolean;
  charged: boolean;
  reason: "none" | "limit" | "cost" | "key-capacity" | "history-capacity";
  remaining: number;
  retryAfterMs: number | null;
  keys: number;
  history: number;
};
export type RateDecision = {
  allowed: boolean;
  outcome: RateOutcome;
  retryAfterMs: number | null;
  rules: RateRuleDecision[];
};
type Entry = {
  at: number;
  credit: bigint;
  used: number;
  events: { at: number; cost: number }[];
};
export function normalizeRateIdentity(v: RateIdentity): RateIdentity {
  if (
    !v ||
    !rateText(v.client, 120) ||
    !v.client.trim() ||
    !rateText(v.route, 256) ||
    !v.route.trim() ||
    !rateMethod(v.method) ||
    !rateInt(v.cost, 1, 10000)
  )
    throw new RateError("request");
  return { client: v.client, route: v.route, method: v.method, cost: v.cost };
}
const ceil = (a: bigint, b: bigint): number => Number((a + b - BigInt(1)) / b);
export function createRateLimiter(value: RatePolicy) {
  const p = normalizeRatePolicy(value),
    stores = new Map(p.rules.map((r) => [r.id, new Map<string, Entry>()]));
  let lastNow = -1;
  const keyFor = (r: RateRule, q: RateIdentity) =>
    JSON.stringify(
      r.scope === "global"
        ? []
        : r.scope === "client"
          ? [q.client]
          : r.scope === "route"
            ? [q.method, q.route]
            : [q.client, q.method, q.route],
    );
  const fullAt = (r: RateRule, e: Entry) =>
    e.at +
    ceil(
      BigInt(r.limit) * BigInt(r.refillMs) - e.credit,
      BigInt(r.refillTokens),
    );
  function sweep(r: RateRule, now: number) {
    const store = stores.get(r.id)!;
    for (const [key, e] of store) {
      if (r.algorithm === "fixed") {
        if (e.at + r.windowMs <= now) store.delete(key);
      } else if (r.algorithm === "token") {
        if (fullAt(r, e) <= now) store.delete(key);
      } else {
        let removed = 0;
        while (
          removed < e.events.length &&
          e.events[removed].at + r.windowMs <= now
        ) {
          e.used -= e.events[removed].cost;
          removed++;
        }
        if (removed) e.events.splice(0, removed);
        if (!e.events.length) store.delete(key);
      }
    }
  }
  function take(input: RateIdentity, now: number): RateDecision {
    const q = normalizeRateIdentity(input);
    if (!rateInt(now, 0, 4102531200000) || now < lastNow)
      throw new RateError("clock");
    lastNow = now;
    for (const r of p.rules) sweep(r, now);
    const previews = p.rules
      .filter(
        (r) =>
          r.enabled &&
          (r.matchMethod === "*" || r.matchMethod === q.method) &&
          (!r.matchRoute || r.matchRoute === q.route),
      )
      .map((r) => {
        const store = stores.get(r.id)!,
          key = keyFor(r, q),
          existing = store.get(key),
          unit = BigInt(r.refillMs),
          maximum = BigInt(r.limit) * unit;
        let e: Entry,
          remaining = r.limit,
          wait: number | null = 0,
          reason: RateRuleDecision["reason"] = "none";
        if (r.algorithm === "fixed") {
          e = existing
            ? { ...existing, events: [] }
            : {
                at: Math.floor(now / r.windowMs) * r.windowMs,
                used: 0,
                credit: BigInt(0),
                events: [],
              };
          remaining = r.limit - e.used;
          if (q.cost > r.limit) {
            reason = "cost";
            wait = null;
          } else if (q.cost > remaining) {
            reason = "limit";
            wait = e.at + r.windowMs - now;
          }
        } else if (r.algorithm === "sliding") {
          e = existing
            ? {
                ...existing,
                events: existing.events.map((event) => ({ ...event })),
              }
            : { at: now, used: 0, credit: BigInt(0), events: [] };
          remaining = r.limit - e.used;
          if (q.cost > r.limit) {
            reason = "cost";
            wait = null;
          } else if (q.cost > remaining) {
            reason = "limit";
            let freed = 0;
            for (const event of e.events) {
              freed += event.cost;
              if (e.used - freed + q.cost <= r.limit) {
                wait = event.at + r.windowMs - now;
                break;
              }
            }
          } else if (
            e.events.length >= MAX_RATE_HISTORY &&
            e.events.at(-1)?.at !== now
          ) {
            reason = "history-capacity";
            wait = e.events[0].at + r.windowMs - now;
          }
        } else {
          const credit = existing
            ? existing.credit +
              BigInt(now - existing.at) * BigInt(r.refillTokens)
            : maximum;
          e = {
            at: now,
            credit: credit > maximum ? maximum : credit,
            used: 0,
            events: [],
          };
          remaining = Number(e.credit / unit);
          if (q.cost > r.limit) {
            reason = "cost";
            wait = null;
          } else if (e.credit < BigInt(q.cost) * unit) {
            reason = "limit";
            wait = ceil(
              BigInt(q.cost) * unit - e.credit,
              BigInt(r.refillTokens),
            );
          }
        }
        if (reason === "none" && !existing && store.size >= r.keyCapacity) {
          reason = "key-capacity";
          let earliest = Infinity;
          for (const entry of store.values()) {
            const expiry =
              r.algorithm === "fixed"
                ? entry.at + r.windowMs
                : r.algorithm === "token"
                  ? fullAt(r, entry)
                  : entry.events.at(-1)!.at + r.windowMs;
            earliest = Math.min(earliest, expiry);
          }
          wait = earliest - now;
        }
        const decision: RateRuleDecision = {
          id: r.id,
          name: r.name,
          algorithm: r.algorithm,
          scope: r.scope,
          wouldAllow: reason === "none",
          charged: false,
          reason,
          remaining,
          retryAfterMs: reason === "none" ? 0 : wait,
          keys: store.size,
          history: e.events.length,
        };
        return { r, store, key, e, decision };
      });
    const denied = previews.filter((x) => !x.decision.wouldAllow),
      allowed = denied.length === 0;
    if (allowed)
      for (const { r, store, key, e, decision } of previews) {
        if (r.algorithm === "token")
          e.credit -= BigInt(q.cost) * BigInt(r.refillMs);
        else {
          e.used += q.cost;
          if (r.algorithm === "sliding") {
            const last = e.events.at(-1);
            if (last?.at === now) last.cost += q.cost;
            else e.events.push({ at: now, cost: q.cost });
          }
        }
        store.set(key, e);
        decision.charged = true;
        decision.remaining =
          r.algorithm === "token"
            ? Number(e.credit / BigInt(r.refillMs))
            : r.limit - e.used;
        decision.keys = store.size;
        decision.history = e.events.length;
      }
    const outcome: RateOutcome = !previews.length
      ? "unmatched"
      : allowed
        ? "allowed"
        : denied.some(
              (x) =>
                x.decision.reason === "key-capacity" ||
                x.decision.reason === "history-capacity",
            )
          ? "capacity"
          : "limited";
    return {
      allowed,
      outcome,
      retryAfterMs: allowed
        ? 0
        : denied.some((x) => x.decision.retryAfterMs === null)
          ? null
          : Math.max(...denied.map((x) => x.decision.retryAfterMs!)),
      rules: previews.map((x) => x.decision),
    };
  }
  return {
    take,
    reset() {
      for (const store of stores.values()) store.clear();
      lastNow = -1;
    },
  };
}
