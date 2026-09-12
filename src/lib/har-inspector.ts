import type { EndpointSummary } from "./openapi";
import { findDocumentedResponse } from "./response-contract";
import { getByteSize } from "./text-encoding";

export const MAX_HAR_BYTES = 5 * 1024 * 1024;
export const MAX_HAR_ENTRIES = 5000;
export type HarRequest = {
  index: number;
  method: string;
  origin: string;
  path: string;
  status: number;
  durationMs: number | null;
};
export type HarCapture = {
  requests: HarRequest[];
  skipped: number;
  total: number;
};
export type HarImportIssue =
  "invalid-har" | "too-large" | "too-many" | "no-requests";
export type HarMatch = {
  request: HarRequest;
  state: "matched" | "unmatched" | "ambiguous";
  endpoint: string | null;
  candidates: string[];
  undocumented: boolean;
  failed: boolean;
};
export type HarTiming = {
  count: number;
  averageMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};
export type HarAnalysis = {
  matches: HarMatch[];
  summary: {
    requests: number;
    matched: number;
    unmatched: number;
    ambiguous: number;
    undocumented: number;
    failed: number;
    operations: number;
    observed: number;
  } & HarTiming;
  operations: {
    key: string;
    method: string;
    path: string;
    requests: number;
    failed: number;
    undocumented: number;
    statuses: Record<string, number>;
    timing: HarTiming;
  }[];
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseHarCapture(
  text: string,
): { ok: true; capture: HarCapture } | { ok: false; issue: HarImportIssue } {
  if (text.length > MAX_HAR_BYTES || getByteSize(text) > MAX_HAR_BYTES)
    return { ok: false, issue: "too-large" };
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, issue: "invalid-har" };
  }
  if (!record(data) || !record(data.log) || !Array.isArray(data.log.entries))
    return { ok: false, issue: "invalid-har" };
  if (data.log.entries.length > MAX_HAR_ENTRIES)
    return { ok: false, issue: "too-many" };
  const requests: HarRequest[] = [];
  data.log.entries.forEach((entry: unknown, index: number) => {
    if (!record(entry) || !record(entry.request) || !record(entry.response))
      return;
    const { method, url } = entry.request;
    const { status } = entry.response;
    if (
      typeof method !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(method) ||
      typeof url !== "string" ||
      url.length > 16384 ||
      typeof status !== "number" ||
      !Number.isInteger(status) ||
      (status !== 0 && (status < 100 || status > 599))
    )
      return;
    try {
      const parsed = new URL(url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.pathname.length > 4096
      )
        return;
      requests.push({
        index: index + 1,
        method: method.toUpperCase(),
        origin: parsed.origin,
        path: parsed.pathname,
        status,
        durationMs:
          typeof entry.time === "number" &&
          Number.isFinite(entry.time) &&
          entry.time >= 0 &&
          entry.time <= Number.MAX_SAFE_INTEGER
            ? entry.time
            : null,
      });
    } catch {
      /* Invalid URLs are counted as skipped entries. */
    }
  });
  return requests.length
    ? {
        ok: true,
        capture: {
          requests,
          skipped: data.log.entries.length - requests.length,
          total: data.log.entries.length,
        },
      }
    : { ok: false, issue: "no-requests" };
}

export function validHarPrefix(prefix: string) {
  return (
    prefix === "" ||
    (prefix.startsWith("/") &&
      prefix.length <= 512 &&
      !/[?#\\{}\s]/u.test(prefix))
  );
}

function timing(values: (number | null)[]): HarTiming {
  const sorted = values
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  return {
    count: sorted.length,
    averageMs: sorted.length
      ? Math.round(
          (sorted.reduce((sum, value) => sum + value, 0) / sorted.length) * 100,
        ) / 100
      : null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
    maxMs: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

function template(path: string) {
  if (!path.startsWith("/") || path.length > 4096 || /[?#\\]/.test(path))
    return null;
  const segments = path.split("/");
  // Whole-segment placeholders avoid unsafe or ambiguous regex construction.
  if (
    segments.some(
      (segment) => /[{}]/.test(segment) && !/^\{[^{}]+\}$/.test(segment),
    )
  )
    return null;
  const prepared = segments.map((segment) =>
    /^\{[^{}]+\}$/.test(segment) ? null : decodedSegment(segment),
  );
  return {
    segments: prepared,
    specificity: prepared.filter((segment) => segment !== null).length,
  };
}

function decodedSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function analyzeHarCapture(
  capture: HarCapture,
  endpoints: EndpointSummary[],
  options: { origin?: string; pathPrefix?: string } = {},
): HarAnalysis {
  const prefixInput = options.pathPrefix ?? "";
  if (!validHarPrefix(prefixInput)) throw new Error("invalid-prefix");
  const prefix = prefixInput.replace(/\/+$/, "");
  const unique = new Map(
    endpoints.map((endpoint) => [
      endpoint.method.toUpperCase() + " " + endpoint.path,
      endpoint,
    ]),
  );
  const definitions = Array.from(unique, ([key, endpoint]) => ({
    key,
    endpoint,
    template: template(endpoint.path),
  }));
  const requests = capture.requests.filter(
    (request) => !options.origin || request.origin === options.origin,
  );
  const cache = new Map<string, typeof definitions>();
  const matches = requests.map((request): HarMatch => {
    const eligible =
      !prefix ||
      request.path === prefix ||
      request.path.startsWith(prefix + "/");
    const path = eligible ? request.path.slice(prefix.length) || "/" : "";
    const key = request.method + " " + path;
    let candidates = cache.get(key);
    if (!candidates) {
      const parts = path.split("/").map(decodedSegment);
      candidates = eligible
        ? definitions.filter(
            (entry) =>
              entry.endpoint.method.toUpperCase() === request.method &&
              entry.template &&
              entry.template.segments.length === parts.length &&
              entry.template.segments.every((segment, index) =>
                segment === null
                  ? parts[index].length > 0
                  : segment === parts[index],
              ),
          )
        : [];
      const score = candidates.reduce(
        (max, entry) => Math.max(max, entry.template!.specificity),
        -1,
      );
      candidates = candidates.filter(
        (entry) => entry.template!.specificity === score,
      );
      cache.set(key, candidates);
    }
    const selected = candidates.length === 1 ? candidates[0] : null;
    return {
      request,
      state: selected
        ? "matched"
        : candidates.length
          ? "ambiguous"
          : "unmatched",
      endpoint: selected?.key ?? null,
      candidates: candidates.map((entry) => entry.key),
      failed: request.status === 0 || request.status >= 400,
      undocumented: Boolean(
        selected &&
        request.status !== 0 &&
        !findDocumentedResponse(
          selected.endpoint.responses,
          String(request.status),
        ),
      ),
    };
  });
  const rowsByEndpoint = new Map<string, HarMatch[]>();
  for (const match of matches) {
    if (match.endpoint === null) continue;
    const rows = rowsByEndpoint.get(match.endpoint);
    if (rows) rows.push(match);
    else rowsByEndpoint.set(match.endpoint, [match]);
  }
  const operations = definitions.map(({ key, endpoint }) => {
    const rows = rowsByEndpoint.get(key) ?? [];
    const statuses: Record<string, number> = {};
    let failed = 0;
    let undocumented = 0;
    for (const row of rows) {
      const status = String(row.request.status);
      statuses[status] = (statuses[status] ?? 0) + 1;
      if (row.failed) failed++;
      if (row.undocumented) undocumented++;
    }
    return {
      key,
      method: endpoint.method.toUpperCase(),
      path: endpoint.path,
      requests: rows.length,
      failed,
      undocumented,
      statuses,
      timing: timing(rows.map((row) => row.request.durationMs)),
    };
  });
  return {
    matches,
    operations,
    summary: {
      requests: matches.length,
      matched: matches.filter((row) => row.state === "matched").length,
      unmatched: matches.filter((row) => row.state === "unmatched").length,
      ambiguous: matches.filter((row) => row.state === "ambiguous").length,
      undocumented: matches.filter((row) => row.undocumented).length,
      failed: matches.filter((row) => row.failed).length,
      operations: operations.length,
      observed: operations.filter((operation) => operation.requests > 0).length,
      ...timing(matches.map((row) => row.request.durationMs)),
    },
  };
}

export function serializeHarAnalysis(
  analysis: HarAnalysis,
  capture: HarCapture,
) {
  // Only aggregates and schema operation templates leave the inspector.
  return JSON.stringify(
    {
      version: 1,
      kind: "rsswag-har-analysis",
      imported: {
        total: capture.total,
        accepted: capture.requests.length,
        skipped: capture.skipped,
      },
      summary: analysis.summary,
      operations: analysis.operations,
    },
    null,
    2,
  );
}
