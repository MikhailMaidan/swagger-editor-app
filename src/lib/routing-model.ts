import { getByteSize } from "./text-encoding";

export type RTBackend = {
  id: string;
  name: string;
  url: string;
  weight: number;
  capacity: number;
  healthy: boolean;
};
export type RTKey = { target: "header" | "query"; name: string };
export type RTPool = {
  id: string;
  name: string;
  algorithm: "round-robin" | "least-active" | "sticky";
  members: string[];
  key: RTKey;
};
export type RTFilter = RTKey & {
  op: "exists" | "absent" | "equals" | "contains";
  value: string;
};
export type RTRoute = {
  id: string;
  name: string;
  enabled: boolean;
  methods: string[];
  path: string;
  filters: RTFilter[];
  pool: string;
  rewrite: string | null;
  setHeaders: Record<string, string>;
};
export type RTConfig = {
  backends: RTBackend[];
  pools: RTPool[];
  routes: RTRoute[];
  health: { failureThreshold: number; cooldownMs: number };
};
export type RTRequest = {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
};
export type RTOutcome = { status: number; durationMs: number };
export type RTTraffic = RTRequest & {
  atMs: number;
  outcome: RTOutcome;
  backendOutcomes: Record<string, RTOutcome>;
};
export type RTExpectation = {
  route: string | null;
  backend: string | null;
  status: number;
};
export type RTCase = {
  id: string;
  name: string;
  requests: RTTraffic[];
  healthEvents: { atMs: number; backend: string; healthy: boolean }[];
  expected: Record<string, RTExpectation> | null;
};
export type RTProject = RTConfig & {
  version: 1;
  name: string;
  cases: RTCase[];
};
export const RT_LIMITS = {
  bytes: 2 * 1024 * 1024,
  backends: 12,
  pools: 8,
  routes: 20,
  cases: 8,
  requests: 200,
  healthEvents: 64,
  time: 3600000,
  duration: 600000,
  headers: 32,
} as const;
export type RTErrorCode =
  | "project"
  | "limit"
  | "reference"
  | "duplicate"
  | "path"
  | "url"
  | "clock"
  | "expectation"
  | "cancelled"
  | "schema"
  | "traffic";
export class RTError extends Error {
  constructor(public readonly code: RTErrorCode) {
    super(code);
    this.name = "RTError";
  }
}
export function rtRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RTError("project");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 160, empty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new RTError("project");
  return value;
}
function id(value: unknown) {
  const result = text(value, 48);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(result)) throw new RTError("project");
  return result;
}
function integer(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new RTError("project");
  return value;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") throw new RTError("project");
  return value;
}
function list(value: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min) throw new RTError("project");
  if (value.length > max) throw new RTError("limit");
  return value;
}
function unique<T extends { id: string }>(items: T[]) {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new RTError("duplicate");
  return items;
}
const HEADER = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/;
export function normalizeRTHeaders(raw: unknown) {
  const entries = Object.entries(rtRecord(raw));
  if (entries.length > RT_LIMITS.headers) throw new RTError("limit");
  if (
    new Set(entries.map(([name]) => name.toLowerCase())).size !== entries.length
  )
    throw new RTError("duplicate");
  return Object.fromEntries(
    entries.map(([name, raw]) => {
      const value = text(raw, 2048, true);
      if (!HEADER.test(name) || /[\r\n\0]/.test(value))
        throw new RTError("project");
      return [name.toLowerCase(), value.trim()];
    }),
  );
}
function method(raw: unknown) {
  const value = text(raw, 32).toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]*$/.test(value)) throw new RTError("project");
  return value;
}
export function parseRTUrl(raw: unknown) {
  const value = text(raw, 4096);
  if (/[\u0000-\u0020\\]/.test(value) || /%(?![a-f0-9]{2})/i.test(value))
    throw new RTError("url");
  let url: URL;
  try {
    url =
      value.startsWith("/") && !value.startsWith("//")
        ? new URL(value, "https://routing.invalid")
        : new URL(value);
  } catch {
    throw new RTError("url");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new RTError("url");
  url.hash = "";
  return url;
}
export type RTSegment =
  | { kind: "literal"; value: string }
  | { kind: "parameter"; name: string }
  | { kind: "rest"; name: string };
export function parseRTPattern(raw: unknown, rewrite = false): RTSegment[] {
  const path = text(raw, 512);
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\\s]/u.test(path))
    throw new RTError("path");
  const names = new Set<string>(),
    parts = path.slice(1).split("/");
  if (parts.length > 32) throw new RTError("limit");
  return parts.map((part, index): RTSegment => {
    const match = /^\{(\*?)([A-Za-z][A-Za-z0-9_-]{0,31})\}$/.exec(part);
    if (match) {
      if (
        (!rewrite && names.has(match[2])) ||
        (match[1] && index !== parts.length - 1)
      )
        throw new RTError("path");
      names.add(match[2]);
      return { kind: match[1] ? "rest" : "parameter", name: match[2] };
    }
    if (/[{}]/.test(part)) throw new RTError("path");
    let value: string;
    try {
      value = decodeURIComponent(part);
    } catch {
      throw new RTError("path");
    }
    if (value === "." || value === ".." || /[\u0000-\u001f\\]/.test(value))
      throw new RTError("path");
    return { kind: "literal", value };
  });
}
function normalizeKey(raw: unknown): RTKey {
  const value = rtRecord(raw),
    name = text(value.name, 128);
  if (
    (value.target !== "header" && value.target !== "query") ||
    (value.target === "header" && !HEADER.test(name))
  )
    throw new RTError("project");
  return {
    target: value.target,
    name: value.target === "header" ? name.toLowerCase() : name,
  };
}
export function normalizeRTConfig(raw: unknown): RTConfig {
  const value = rtRecord(raw);
  const backends = unique(
    list(value.backends, RT_LIMITS.backends, 1).map((raw): RTBackend => {
      const item = rtRecord(raw),
        source = text(item.url, 2048),
        url = parseRTUrl(source);
      if (!/^https?:\/\//i.test(source) || url.search || new URL(source).hash)
        throw new RTError("url");
      const baseUrl = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
      if (baseUrl.length > 2048) throw new RTError("limit");
      return {
        id: id(item.id),
        name: text(item.name),
        url: baseUrl,
        weight: integer(item.weight, 1, 100),
        capacity: integer(item.capacity, 1, 32),
        healthy: bool(item.healthy),
      };
    }),
  );
  const pools = unique(
    list(value.pools, RT_LIMITS.pools, 1).map((raw): RTPool => {
      const item = rtRecord(raw),
        members = list(item.members, 8, 1).map(id);
      if (
        members.some(
          (member) => !backends.some((backend) => backend.id === member),
        )
      )
        throw new RTError("reference");
      if (new Set(members).size !== members.length)
        throw new RTError("duplicate");
      if (
        item.algorithm !== "round-robin" &&
        item.algorithm !== "least-active" &&
        item.algorithm !== "sticky"
      )
        throw new RTError("project");
      return {
        id: id(item.id),
        name: text(item.name),
        algorithm: item.algorithm,
        members,
        key: normalizeKey(item.key),
      };
    }),
  );
  const routes = unique(
    list(value.routes, RT_LIMITS.routes).map((raw): RTRoute => {
      const item = rtRecord(raw),
        path = text(item.path, 512),
        pattern = parseRTPattern(path),
        pool = id(item.pool);
      if (!pools.some((p) => p.id === pool)) throw new RTError("reference");
      const methods = list(item.methods, 16, 1).map((v) =>
        v === "*" ? "*" : method(v),
      );
      if (
        new Set(methods).size !== methods.length ||
        (methods.includes("*") && methods.length > 1)
      )
        throw new RTError("duplicate");
      const filters = list(item.filters, 8).map((raw): RTFilter => {
        const filter = rtRecord(raw);
        if (
          typeof filter.op !== "string" ||
          !["exists", "absent", "equals", "contains"].includes(filter.op)
        )
          throw new RTError("project");
        return {
          ...normalizeKey(filter),
          op: filter.op as RTFilter["op"],
          value: text(filter.value, 512, true),
        };
      });
      const rewrite = item.rewrite === null ? null : text(item.rewrite, 512);
      if (rewrite !== null)
        for (const segment of parseRTPattern(rewrite, true))
          if (
            segment.kind !== "literal" &&
            !pattern.some(
              (p) => p.kind !== "literal" && p.name === segment.name,
            )
          )
            throw new RTError("reference");
      return {
        id: id(item.id),
        name: text(item.name),
        enabled: bool(item.enabled),
        methods,
        path,
        filters,
        pool,
        rewrite,
        setHeaders: normalizeRTHeaders(item.setHeaders),
      };
    }),
  );
  const health = rtRecord(value.health);
  return {
    backends,
    pools,
    routes,
    health: {
      failureThreshold: integer(health.failureThreshold, 0, 10),
      cooldownMs: integer(health.cooldownMs, 1, RT_LIMITS.duration),
    },
  };
}
export function normalizeRTRequest(raw: unknown): RTRequest {
  const value = rtRecord(raw),
    url = parseRTUrl(value.url).href;
  if (url.length > 4096) throw new RTError("limit");
  return {
    id: id(value.id),
    method: method(value.method),
    url,
    headers: normalizeRTHeaders(value.headers),
  };
}
function outcome(raw: unknown): RTOutcome {
  const value = rtRecord(raw);
  return {
    status: integer(value.status, 100, 599),
    durationMs: integer(value.durationMs, 0, RT_LIMITS.duration),
  };
}
export function normalizeRTCase(raw: unknown, config: RTConfig): RTCase {
  const value = rtRecord(raw),
    requests = unique(
      list(value.requests, RT_LIMITS.requests, 1).map((raw): RTTraffic => {
        const value = rtRecord(raw),
          input = normalizeRTRequest(value),
          atMs = integer(value.atMs, 0, RT_LIMITS.time);
        const backendOutcomes = Object.fromEntries(
          Object.entries(rtRecord(value.backendOutcomes)).map(([id, value]) => {
            if (!config.backends.some((backend) => backend.id === id))
              throw new RTError("reference");
            return [id, outcome(value)];
          }),
        );
        const fallback = outcome(value.outcome);
        if (
          atMs + fallback.durationMs > RT_LIMITS.time ||
          Object.values(backendOutcomes).some(
            (item) => atMs + item.durationMs > RT_LIMITS.time,
          )
        )
          throw new RTError("limit");
        return { ...input, atMs, outcome: fallback, backendOutcomes };
      }),
    );
  const healthEvents = list(value.healthEvents, RT_LIMITS.healthEvents).map(
    (raw) => {
      const event = rtRecord(raw),
        backend = id(event.backend);
      if (!config.backends.some((item) => item.id === backend))
        throw new RTError("reference");
      return {
        atMs: integer(event.atMs, 0, RT_LIMITS.time),
        backend,
        healthy: bool(event.healthy),
      };
    },
  );
  let expected: RTCase["expected"] = null;
  if (value.expected !== null) {
    const source = rtRecord(value.expected);
    if (
      Object.keys(source).length !== requests.length ||
      requests.some((request) => !Object.hasOwn(source, request.id))
    )
      throw new RTError("expectation");
    expected = Object.fromEntries(
      requests.map((request) => {
        const value = rtRecord(source[request.id]),
          route = value.route === null ? null : id(value.route),
          backend = value.backend === null ? null : id(value.backend);
        if (
          (route !== null &&
            !config.routes.some((item) => item.id === route)) ||
          (backend !== null &&
            !config.backends.some((item) => item.id === backend))
        )
          throw new RTError("reference");
        return [
          request.id,
          { route, backend, status: integer(value.status, 100, 599) },
        ];
      }),
    );
  }
  return {
    id: id(value.id),
    name: text(value.name),
    requests,
    healthEvents,
    expected,
  };
}
export function normalizeRTProject(raw: unknown): RTProject {
  const value = rtRecord(raw);
  if (value.version !== 1) throw new RTError("project");
  const config = normalizeRTConfig(value),
    cases = unique(
      list(value.cases, RT_LIMITS.cases, 1).map((item) =>
        normalizeRTCase(item, config),
      ),
    );
  const project: RTProject = {
    version: 1,
    name: text(value.name),
    ...config,
    cases,
  };
  if (getByteSize(JSON.stringify(project, null, 2)) > RT_LIMITS.bytes)
    throw new RTError("limit");
  return project;
}
export function parseRTJson(source: string): unknown {
  if (source.length > RT_LIMITS.bytes || getByteSize(source) > RT_LIMITS.bytes)
    throw new RTError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new RTError("project");
  }
}
export function parseRTProject(source: string) {
  return normalizeRTProject(parseRTJson(source));
}
export function serializeRTProject(project: RTProject) {
  return JSON.stringify(normalizeRTProject(project), null, 2);
}
export function rtFreshId(prefix: string, items: { id: string }[]) {
  let i = 1;
  while (items.some((item) => item.id === `${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
export function emptyRTProject(): RTProject {
  return {
    version: 1,
    name: "API traffic routing",
    health: { failureThreshold: 0, cooldownMs: 1000 },
    backends: [
      {
        id: "primary",
        name: "Primary API",
        url: "https://primary.example.test",
        weight: 1,
        capacity: 4,
        healthy: true,
      },
    ],
    pools: [
      {
        id: "api",
        name: "API pool",
        algorithm: "round-robin",
        members: ["primary"],
        key: { target: "header", name: "x-client-id" },
      },
    ],
    routes: [
      {
        id: "all",
        name: "Default route",
        enabled: true,
        methods: ["*"],
        path: "/{*rest}",
        filters: [],
        pool: "api",
        rewrite: null,
        setHeaders: {},
      },
    ],
    cases: [
      {
        id: "baseline",
        name: "Baseline traffic",
        healthEvents: [],
        expected: null,
        requests: [
          {
            id: "request-1",
            method: "GET",
            url: "https://client.example.test/items",
            headers: {},
            atMs: 0,
            outcome: { status: 200, durationMs: 25 },
            backendOutcomes: {},
          },
        ],
      },
    ],
  };
}
