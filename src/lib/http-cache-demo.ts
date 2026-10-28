import {
  defaultCacheBudgets,
  defaultCacheStep,
  emptyCacheProject,
  normalizeCacheProject,
  type CacheOrigin,
  type CacheStep,
} from "./http-cache-project";
import type { CacheHeaders } from "./http-cache";

const response = (
  headers: CacheHeaders,
  body = '{"version":1}',
  status = 200,
): CacheOrigin => ({ kind: "response", status, headers, body, delayMs: 120 });
function step(
  id: string,
  atMs: number,
  origin: CacheOrigin | null,
  options: Partial<CacheStep> = {},
): CacheStep {
  return { ...defaultCacheStep(id, atMs), origin, ...options };
}
export function demoCacheProject() {
  const project = emptyCacheProject();
  project.name = "HTTP cache lifecycle examples";
  project.scenarios = [
    {
      id: "freshness",
      name: "Freshness and conditional revalidation",
      budgets: {
        ...defaultCacheBudgets(),
        minHitPercent: 50,
        maxOriginRequests: 2,
      },
      steps: [
        step(
          "prime",
          0,
          response({ "cache-control": "max-age=60", etag: '"v1"' }),
          { expect: { outcome: "miss", status: 200 } },
        ),
        step("hit", 10000, null, { expect: { outcome: "fresh", status: 200 } }),
        step(
          "validate",
          65000,
          response({ "cache-control": "max-age=120", etag: '"v1"' }, "", 304),
          { expect: { outcome: "revalidated", status: 200 } },
        ),
        step("renewed", 100000, null, {
          expect: { outcome: "fresh", status: 200 },
        }),
      ],
    },
    {
      id: "variants",
      name: "Language variants and cache-only misses",
      budgets: { ...defaultCacheBudgets(), maxErrors: 1 },
      steps: [
        step(
          "english",
          0,
          response(
            { "cache-control": "max-age=60", vary: "Accept-Language" },
            '{"hello":"Hello"}',
          ),
          { headers: { "accept-language": "en" } },
        ),
        step(
          "russian",
          1000,
          response(
            { "cache-control": "max-age=60", vary: "Accept-Language" },
            '{"hello":"Привет"}',
          ),
          { headers: { "accept-language": "ru" } },
        ),
        step("english-hit", 2000, null, {
          headers: { "accept-language": "en" },
          expect: { outcome: "fresh" },
        }),
        step("cache-only", 3000, null, {
          headers: {
            "accept-language": "de",
            "cache-control": "only-if-cached",
          },
          expect: { outcome: "only-if-cached", status: 504 },
        }),
      ],
    },
    {
      id: "availability",
      name: "Stale fallback and its expiration",
      budgets: { ...defaultCacheBudgets(), maxErrors: 1 },
      steps: [
        step(
          "seed",
          0,
          response({
            "cache-control": "max-age=1, stale-if-error=60",
            etag: 'W/"v1"',
          }),
        ),
        step(
          "outage",
          3000,
          { kind: "network-error", delayMs: 500 },
          { expect: { outcome: "stale-error", status: 200 } },
        ),
        step(
          "too-old",
          70000,
          response({ "cache-control": "no-store" }, "Unavailable", 503),
          { expect: { status: 503 } },
        ),
      ],
    },
    {
      id: "write-through",
      name: "Write invalidation and subsequent refill",
      budgets: { ...defaultCacheBudgets(), maxOriginRequests: 4 },
      steps: [
        step("list", 0, response({ "cache-control": "max-age=600" })),
        step("detail", 1000, response({ "cache-control": "max-age=600" }), {
          url: "https://cache.example/items/1",
        }),
        step(
          "update",
          2000,
          response({ "content-location": "/items/1" }, "", 204),
          { method: "POST" },
        ),
        step(
          "refill",
          3000,
          response({ "cache-control": "max-age=600" }, '{"version":2}'),
          { expect: { outcome: "miss" } },
        ),
        step("refilled-hit", 4000, null, { expect: { outcome: "fresh" } }),
      ],
    },
    {
      id: "visibility",
      name: "Private data and shared freshness",
      budgets: defaultCacheBudgets(),
      steps: [
        step(
          "account",
          0,
          response({ "cache-control": "private, max-age=60" }),
          { headers: { authorization: "Bearer DEMO-ONLY" } },
        ),
        step(
          "account-repeat",
          1000,
          response({ "cache-control": "private, max-age=60" }),
          { headers: { authorization: "Bearer DEMO-ONLY" } },
        ),
        step(
          "public",
          2000,
          response({ "cache-control": "public, max-age=1, s-maxage=120" }),
          { url: "https://cache.example/catalog" },
        ),
        step(
          "public-repeat",
          20000,
          response({ "cache-control": "public, max-age=1, s-maxage=120" }),
          { url: "https://cache.example/catalog" },
        ),
      ],
    },
  ];
  return normalizeCacheProject(project);
}
