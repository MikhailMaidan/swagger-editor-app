import { getByteSize } from "./text-encoding";

export const MAX_CORS_BYTES = 2 * 1024 * 1024;
export const MAX_CORS_BODY_BYTES = 64 * 1024;
export const MAX_CORS_POLICIES = 5;
export const MAX_CORS_SCENARIOS = 10;
export const MAX_CORS_CASES = 100;
export const CORS_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;
export type CorsMethod = (typeof CORS_METHODS)[number];
export type CorsHeaders = Record<string, string>;
export type CorsOutcome = "allowed" | "blocked" | "opaque" | "invalid";
export type CorsPreflight = "sent" | "cached" | "not-needed";
export const CORS_OUTCOMES: CorsOutcome[] = [
  "allowed",
  "blocked",
  "opaque",
  "invalid",
];
export const CORS_PREFLIGHTS: CorsPreflight[] = [
  "sent",
  "cached",
  "not-needed",
];
export type CorsPolicy = {
  id: string;
  name: string;
  origins: string[];
  methods: (CorsMethod | "*")[];
  requestHeaders: string[];
  exposeHeaders: string[];
  credentials: boolean;
  maxAge: number;
};
export type CorsFixture = {
  usePolicy: boolean;
  status: number;
  headers: CorsHeaders;
  body: string;
  delayMs: number;
};
export type CorsCase = {
  id: string;
  name: string;
  atMs: number;
  partition: string;
  origin: string;
  url: string;
  method: CorsMethod;
  mode: "cors" | "same-origin" | "no-cors";
  credentials: "include" | "same-origin" | "omit";
  headers: CorsHeaders;
  forcePreflight: boolean;
  preflight: CorsFixture;
  response: CorsFixture;
  expect: { outcome?: CorsOutcome; preflight?: CorsPreflight; status?: number };
};
export type CorsBudgets = {
  maxBlocked: number;
  maxPreflights: number;
  maxWaitMs: number;
};
export type CorsScenario = {
  id: string;
  name: string;
  cases: CorsCase[];
  budgets: CorsBudgets;
};
export type CorsProject = {
  kind: "rsswag-cors-project";
  version: 1;
  name: string;
  maxAgeCap: number;
  cacheCapacity: number;
  policies: CorsPolicy[];
  scenarios: CorsScenario[];
};
export type CorsErrorCode =
  "project" | "json" | "headers" | "origin" | "url" | "limit" | "export";
export class CorsError extends Error {
  constructor(public code: CorsErrorCode) {
    super(code);
    this.name = "CorsError";
  }
}
export const corsError = (e: unknown): CorsErrorCode =>
  e instanceof CorsError ? e.code : "project";
export const corsObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const corsToken = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
const int = (v: unknown, max: number, min = 0): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const named = (v: Record<string, unknown>) => {
  if (
    !text(v.id, 80) ||
    !/^[a-z0-9_-]+$/i.test(v.id) ||
    !text(v.name, 120) ||
    !v.name.trim()
  )
    throw new CorsError("project");
  return { id: v.id, name: v.name };
};
export function corsUrl(v: unknown): string {
  try {
    if (!text(v, 8192) || v !== v.trim()) throw 0;
    const url = new URL(v);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw 0;
    return url.href;
  } catch {
    throw new CorsError("url");
  }
}
export function corsOrigin(v: unknown): string {
  if (v === "null") return v;
  try {
    const url = new URL(corsUrl(v));
    if (url.pathname !== "/" || url.search) throw 0;
    return url.origin;
  } catch {
    throw new CorsError("origin");
  }
}
export function corsHeaders(v: unknown): CorsHeaders {
  if (!corsObject(v) || Object.keys(v).length > 80)
    throw new CorsError("headers");
  const pairs = Object.entries(v).map(([key, value]) => {
    if (
      !corsToken.test(key) ||
      key.length > 128 ||
      !text(value, 8192) ||
      /[\x00-\x08\x0a-\x1f\x7f\u0100-\uffff]/.test(value)
    )
      throw new CorsError("headers");
    return [key.toLowerCase(), value.replace(/^[\t ]+|[\t ]+$/g, "")] as const;
  });
  if (
    new Set(pairs.map(([key]) => key)).size !== pairs.length ||
    getByteSize(JSON.stringify(pairs)) > 32768
  )
    throw new CorsError("headers");
  return Object.fromEntries(pairs);
}
function headerNames(v: unknown): string[] {
  if (
    !Array.isArray(v) ||
    v.length > 80 ||
    v.some((h) => !text(h, 128) || !corsToken.test(h))
  )
    throw new CorsError("project");
  return [...new Set((v as string[]).map((h) => h.toLowerCase()))];
}
export function normalizeCorsPolicy(v: unknown): CorsPolicy {
  if (
    !corsObject(v) ||
    !Array.isArray(v.origins) ||
    v.origins.length > 30 ||
    !Array.isArray(v.methods) ||
    v.methods.length > 8 ||
    v.methods.some((m) => m !== "*" && !CORS_METHODS.includes(m)) ||
    typeof v.credentials !== "boolean" ||
    !int(v.maxAge, 86400)
  )
    throw new CorsError("project");
  const origins = [
    ...new Set(v.origins.map((o) => (o === "*" ? o : corsOrigin(o)))),
  ];
  if (origins.includes("*") && origins.length > 1)
    throw new CorsError("project");
  return {
    ...named(v),
    origins,
    methods: [...new Set(v.methods)] as CorsPolicy["methods"],
    requestHeaders: headerNames(v.requestHeaders),
    exposeHeaders: headerNames(v.exposeHeaders),
    credentials: v.credentials,
    maxAge: v.maxAge,
  };
}
function fixture(v: unknown, preflight: boolean): CorsFixture {
  if (
    !corsObject(v) ||
    typeof v.usePolicy !== "boolean" ||
    !int(v.status, 599) ||
    (v.status > 0 && v.status < 200) ||
    !text(v.body, preflight ? 0 : MAX_CORS_BODY_BYTES) ||
    !int(v.delayMs, 60000) ||
    ([0, 204, 205, 304].includes(v.status) && v.body !== "")
  )
    throw new CorsError("project");
  return {
    usePolicy: v.usePolicy,
    status: v.status,
    headers: corsHeaders(v.headers),
    body: v.body,
    delayMs: v.delayMs,
  };
}
export function normalizeCorsCase(v: unknown): CorsCase {
  if (
    !corsObject(v) ||
    !int(v.atMs, 604800000) ||
    !text(v.partition, 80) ||
    !v.partition.trim() ||
    !CORS_METHODS.includes(v.method as CorsMethod) ||
    (v.mode !== "cors" && v.mode !== "same-origin" && v.mode !== "no-cors") ||
    (v.credentials !== "include" &&
      v.credentials !== "same-origin" &&
      v.credentials !== "omit") ||
    typeof v.forcePreflight !== "boolean" ||
    !corsObject(v.expect)
  )
    throw new CorsError("project");
  const expect: CorsCase["expect"] = {};
  if (v.expect.outcome !== undefined) {
    if (!CORS_OUTCOMES.includes(v.expect.outcome as CorsOutcome))
      throw new CorsError("project");
    expect.outcome = v.expect.outcome as CorsOutcome;
  }
  if (v.expect.preflight !== undefined) {
    if (!CORS_PREFLIGHTS.includes(v.expect.preflight as CorsPreflight))
      throw new CorsError("project");
    expect.preflight = v.expect.preflight as CorsPreflight;
  }
  if (v.expect.status !== undefined) {
    if (
      !int(v.expect.status, 599) ||
      (v.expect.status > 0 && v.expect.status < 200)
    )
      throw new CorsError("project");
    expect.status = v.expect.status;
  }
  return {
    ...named(v),
    atMs: v.atMs,
    partition: v.partition,
    origin: corsOrigin(v.origin),
    url: corsUrl(v.url),
    method: v.method as CorsMethod,
    mode: v.mode,
    credentials: v.credentials,
    headers: corsHeaders(v.headers),
    forcePreflight: v.forcePreflight,
    preflight: fixture(v.preflight, true),
    response: fixture(v.response, false),
    expect,
  };
}
export function normalizeCorsScenario(v: unknown): CorsScenario {
  if (
    !corsObject(v) ||
    !Array.isArray(v.cases) ||
    !v.cases.length ||
    v.cases.length > MAX_CORS_CASES ||
    !corsObject(v.budgets) ||
    !int(v.budgets.maxBlocked, MAX_CORS_CASES) ||
    !int(v.budgets.maxPreflights, MAX_CORS_CASES) ||
    !int(v.budgets.maxWaitMs, 12000000)
  )
    throw new CorsError("project");
  const cases = v.cases.map(normalizeCorsCase);
  if (
    new Set(cases.map((c) => c.id)).size !== cases.length ||
    cases.some((c, i) => i > 0 && c.atMs < cases[i - 1].atMs)
  )
    throw new CorsError("project");
  return {
    ...named(v),
    cases,
    budgets: {
      maxBlocked: v.budgets.maxBlocked,
      maxPreflights: v.budgets.maxPreflights,
      maxWaitMs: v.budgets.maxWaitMs,
    },
  };
}
export function normalizeCorsProject(v: unknown): CorsProject {
  if (
    !corsObject(v) ||
    v.kind !== "rsswag-cors-project" ||
    v.version !== 1 ||
    !text(v.name, 120) ||
    !v.name.trim() ||
    !int(v.maxAgeCap, 86400) ||
    !int(v.cacheCapacity, 256, 1) ||
    !Array.isArray(v.policies) ||
    !v.policies.length ||
    v.policies.length > MAX_CORS_POLICIES ||
    !Array.isArray(v.scenarios) ||
    !v.scenarios.length ||
    v.scenarios.length > MAX_CORS_SCENARIOS
  )
    throw new CorsError("project");
  const policies = v.policies.map(normalizeCorsPolicy),
    scenarios = v.scenarios.map(normalizeCorsScenario);
  if (
    new Set(policies.map((p) => p.id)).size !== policies.length ||
    new Set(scenarios.map((s) => s.id)).size !== scenarios.length
  )
    throw new CorsError("project");
  const p: CorsProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    maxAgeCap: v.maxAgeCap,
    cacheCapacity: v.cacheCapacity,
    policies,
    scenarios,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_CORS_BYTES)
    throw new CorsError("limit");
  return p;
}
export function parseCorsProject(source: string): CorsProject {
  if (getByteSize(source) > MAX_CORS_BYTES) throw new CorsError("limit");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CorsError("json");
  }
  return normalizeCorsProject(value);
}
export function serializeCorsProject(project: CorsProject): string {
  const p = normalizeCorsProject(project),
    pretty = JSON.stringify(p, null, 2);
  return getByteSize(pretty) <= MAX_CORS_BYTES ? pretty : JSON.stringify(p);
}
export const defaultCorsPolicy = (id = "trusted"): CorsPolicy => ({
  id,
  name: "Trusted application",
  origins: ["https://app.example"],
  methods: [...CORS_METHODS],
  requestHeaders: ["content-type", "authorization", "x-request-id"],
  exposeHeaders: ["x-request-id"],
  credentials: true,
  maxAge: 600,
});
export const defaultCorsBudgets = (): CorsBudgets => ({
  maxBlocked: 100,
  maxPreflights: 100,
  maxWaitMs: 12000000,
});
export const defaultCorsCase = (id = "request-1", atMs = 0): CorsCase => ({
  id,
  name: id,
  atMs,
  partition: "workspace",
  origin: "https://app.example",
  url: "https://api.example/items",
  method: "GET",
  mode: "cors",
  credentials: "omit",
  headers: {},
  forcePreflight: false,
  preflight: {
    usePolicy: true,
    status: 204,
    headers: {},
    body: "",
    delayMs: 80,
  },
  response: {
    usePolicy: true,
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "demo-trace",
    },
    body: '{"items":[1,2,3]}',
    delayMs: 120,
  },
  expect: {},
});
export const emptyCorsProject = (): CorsProject => ({
  kind: "rsswag-cors-project",
  version: 1,
  name: "CORS policy project",
  maxAgeCap: 600,
  cacheCapacity: 128,
  policies: [
    defaultCorsPolicy(),
    {
      ...defaultCorsPolicy("public"),
      name: "Public API",
      origins: ["*"],
      credentials: false,
    },
  ],
  scenarios: [
    {
      id: "scenario-1",
      name: "Browser request sequence",
      cases: [defaultCorsCase()],
      budgets: defaultCorsBudgets(),
    },
  ],
});
