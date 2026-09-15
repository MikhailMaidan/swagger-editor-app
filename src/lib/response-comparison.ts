import { getByteSize } from "./text-encoding";
import { truncateJsonPreview } from "./response-data-explorer";

export type ComparisonResponse = {
  body: string;
  headers: Record<string, string>;
  status: string;
  durationMs: number;
  source: "live" | "mock";
};

export type ResponseDifference = {
  area: "body" | "headers" | "status";
  kind: "added" | "removed" | "changed";
  path: string;
  before?: string;
  after?: string;
};

export type ResponseComparisonOptions = {
  ignoredBodyPaths: string[];
  ignoredHeaders: string[];
};

export type ResponseComparison = {
  differences: ResponseDifference[];
  bodyMode: "json" | "text" | "too-large";
  limited: boolean;
  durationDeltaMs: number | null;
  baseline: {
    status: string;
    source: "live" | "mock";
    durationMs: number | null;
    bodyBytes: number;
  };
  current: {
    status: string;
    source: "live" | "mock";
    durationMs: number | null;
    bodyBytes: number;
  };
  options: ResponseComparisonOptions;
};

export const MAX_COMPARISON_BODY_BYTES = 1024 * 1024;
const MAX_DIFFERENCES = 500;
const MAX_VISITS = 20_000;
const MAX_DEPTH = 60;
const MAX_VALUE_LENGTH = 1000;
export const DEFAULT_IGNORED_RESPONSE_HEADERS =
  "date, x-request-id, server-timing";

export function isComparisonPointer(value: string) {
  return (
    value.startsWith("/") && !/~(?![01])/.test(value) && value.length <= 512
  );
}

function escapePointer(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function typeOf(value: unknown) {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
}

function preview(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // Container changes show their shape rather than embedding an entire body.
  // Individual changed properties are compared separately when types match.
  if (Array.isArray(value)) return `[…] (${value.length})`;
  if (value !== null && typeof value === "object")
    return `{…} (${Object.keys(value).length})`;
  const text = JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH
    ? `${truncateJsonPreview(text, MAX_VALUE_LENGTH)}…`
    : text;
}

function measuredDuration(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function metadata(response: ComparisonResponse) {
  return {
    status: response.status,
    source: response.source,
    durationMs: measuredDuration(response.durationMs),
    bodyBytes: getByteSize(response.body),
  };
}

function normalizedHeaders(headers: Record<string, string>) {
  const result = new Map<string, string>();
  for (const [name, value] of Object.entries(headers)) {
    const key = name.trim().toLowerCase();
    result.set(
      key,
      result.has(key) ? `${result.get(key)}, ${value.trim()}` : value.trim(),
    );
  }
  return result;
}

function sensitiveHeader(name: string) {
  return /^(set-cookie|cookie|authorization|proxy-authorization|x-api-key|api-key)$/i.test(
    name,
  );
}

export function compareResponses(
  baseline: ComparisonResponse,
  current: ComparisonResponse,
  options: ResponseComparisonOptions = {
    ignoredBodyPaths: [],
    ignoredHeaders: [],
  },
): ResponseComparison {
  const normalizedOptions = {
    ignoredBodyPaths: [
      ...new Set(options.ignoredBodyPaths.filter(isComparisonPointer)),
    ].slice(0, 64),
    ignoredHeaders: [
      ...new Set(
        options.ignoredHeaders
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 64),
  };
  const report: ResponseComparison = {
    differences: [],
    bodyMode: "text",
    limited: false,
    baseline: metadata(baseline),
    current: metadata(current),
    durationDeltaMs: null,
    options: normalizedOptions,
  };
  if (
    report.baseline.durationMs !== null &&
    report.current.durationMs !== null
  ) {
    report.durationDeltaMs =
      report.current.durationMs - report.baseline.durationMs;
  }
  function add(difference: ResponseDifference) {
    if (report.differences.length >= MAX_DIFFERENCES) {
      report.limited = true;
      return;
    }
    report.differences.push(difference);
  }
  function difference(
    area: ResponseDifference["area"],
    path: string,
    before: unknown,
    after: unknown,
    hidden = false,
  ) {
    add({
      area,
      path,
      kind:
        before === undefined
          ? "added"
          : after === undefined
            ? "removed"
            : "changed",
      before:
        before === undefined
          ? undefined
          : hidden
            ? "[redacted]"
            : preview(before),
      after:
        after === undefined
          ? undefined
          : hidden
            ? "[redacted]"
            : preview(after),
    });
  }

  if (baseline.status !== current.status)
    difference("status", "/status", baseline.status, current.status);
  const beforeHeaders = normalizedHeaders(baseline.headers);
  const afterHeaders = normalizedHeaders(current.headers);
  const ignoredHeaders = new Set(normalizedOptions.ignoredHeaders);
  for (const name of [
    ...new Set([...beforeHeaders.keys(), ...afterHeaders.keys()]),
  ].sort()) {
    if (ignoredHeaders.has(name)) continue;
    const before = beforeHeaders.get(name);
    const after = afterHeaders.get(name);
    if (before !== after)
      difference(
        "headers",
        `/${escapePointer(name)}`,
        before,
        after,
        sensitiveHeader(name),
      );
  }

  if (
    Math.max(report.baseline.bodyBytes, report.current.bodyBytes) >
    MAX_COMPARISON_BODY_BYTES
  ) {
    report.bodyMode = "too-large";
    report.limited = true;
    return report;
  }

  let beforeBody: unknown;
  let afterBody: unknown;
  let unsafeNumber = false;
  const revive = (_key: string, value: unknown) => {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value)))
    )
      unsafeNumber = true;
    return value;
  };
  try {
    beforeBody = JSON.parse(baseline.body, revive);
    afterBody = JSON.parse(current.body, revive);
    // Comparing rounded large IDs could incorrectly report equality.
    if (unsafeNumber) {
      if (baseline.body !== current.body)
        difference("body", "", baseline.body, current.body);
      return report;
    }
    report.bodyMode = "json";
  } catch {
    if (baseline.body !== current.body)
      difference("body", "", baseline.body, current.body);
    return report;
  }

  if (baseline.body === current.body) return report;

  let visits = 0;
  function visit(before: unknown, after: unknown, path: string, depth: number) {
    if (
      normalizedOptions.ignoredBodyPaths.some(
        (ignored) => path === ignored || path.startsWith(`${ignored}/`),
      )
    )
      return;
    visits++;
    // The difference cap is enforced when a difference is added, so a
    // comparison with exactly MAX_DIFFERENCES entries is not marked limited
    // just because an unchanged node was visited afterwards.
    if (visits > MAX_VISITS || depth > MAX_DEPTH) {
      report.limited = true;
      return;
    }
    if (before === after) return;
    if (
      typeOf(before) !== typeOf(after) ||
      before === null ||
      typeof before !== "object"
    ) {
      difference("body", path, before, after);
      return;
    }
    const beforeObject = before as Record<string, unknown>;
    const afterObject = after as Record<string, unknown>;
    const keys = [
      ...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]),
    ];
    if (!Array.isArray(before)) keys.sort();
    for (const key of keys) {
      visit(
        Object.hasOwn(beforeObject, key) ? beforeObject[key] : undefined,
        Object.hasOwn(afterObject, key) ? afterObject[key] : undefined,
        `${path}/${escapePointer(key)}`,
        depth + 1,
      );
      if (report.limited) break;
    }
  }
  visit(beforeBody, afterBody, "", 0);
  return report;
}

export function serializeResponseComparison(
  report: ResponseComparison,
  endpoint: { method: string; path: string },
  includeValues = false,
) {
  return `${JSON.stringify(
    {
      version: 1,
      endpoint: { method: endpoint.method, path: endpoint.path },
      ...report,
      valuesIncluded: includeValues,
      differences: report.differences.map(({ before, after, ...difference }) =>
        includeValues ? { ...difference, before, after } : difference,
      ),
    },
    null,
    2,
  )}\n`;
}
