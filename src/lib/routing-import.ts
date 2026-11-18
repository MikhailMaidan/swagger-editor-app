import {
  normalizeRTCase,
  normalizeRTConfig,
  parseRTJson,
  rtRecord,
  rtFreshId,
  RTError,
  type RTConfig,
  type RTCase,
  type RTRoute,
} from "./routing-model";
import type { EndpointSummary } from "./openapi";

export function importRTHar(
  source: string,
  config: RTConfig,
  cases: RTCase[],
): RTCase {
  const raw = rtRecord(parseRTJson(source)),
    log = rtRecord(raw.log);
  if (!Array.isArray(log.entries) || !log.entries.length)
    throw new RTError("traffic");
  if (log.entries.length > 200) throw new RTError("limit");
  const rows = log.entries.map((raw, index) => {
    const entry = rtRecord(raw),
      request = rtRecord(entry.request),
      response = rtRecord(entry.response);
    if (
      typeof entry.startedDateTime !== "string" ||
      !/(?:Z|[+-]\d{2}:\d{2})$/i.test(entry.startedDateTime)
    )
      throw new RTError("traffic");
    const at = Date.parse(entry.startedDateTime);
    if (
      !Number.isFinite(at) ||
      typeof entry.time !== "number" ||
      !Number.isFinite(entry.time) ||
      entry.time < 0 ||
      entry.time > 600000
    )
      throw new RTError("traffic");
    const rawHeaders = request.headers ?? [];
    if (!Array.isArray(rawHeaders)) throw new RTError("traffic");
    const headers = rawHeaders.map((raw) => {
      const header = rtRecord(raw);
      if (typeof header.name !== "string" || typeof header.value !== "string")
        throw new RTError("traffic");
      return [header.name, header.value] as const;
    });
    if (
      new Set(headers.map(([name]) => name.toLowerCase())).size !==
      headers.length
    )
      throw new RTError("duplicate");
    return {
      at,
      request: {
        id: `har-${index + 1}`,
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(headers),
        atMs: 0,
        outcome: { status: response.status, durationMs: Math.ceil(entry.time) },
        backendOutcomes: {},
      },
    };
  });
  const first = Math.min(...rows.map((row) => row.at));
  return normalizeRTCase(
    {
      id: rtFreshId("capture", cases),
      name: "Imported HAR traffic",
      requests: rows.map((row) => ({ ...row.request, atMs: row.at - first })),
      healthEvents: [],
      expected: null,
    },
    normalizeRTConfig(config),
  );
}
export function routeFromRTOperation(
  endpoint: EndpointSummary,
  pool: string,
  routes: RTRoute[],
): RTRoute {
  return {
    id: rtFreshId("route", routes),
    name: `${endpoint.method} ${endpoint.path}`.slice(0, 160),
    enabled: true,
    methods: [endpoint.method.toUpperCase()],
    path: endpoint.path,
    filters: [],
    pool,
    rewrite: null,
    setHeaders: {},
  };
}
