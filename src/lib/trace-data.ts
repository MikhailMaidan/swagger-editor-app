import type { JsonValue } from "./api-transform";
import { getByteSize } from "./text-encoding";

export const MAX_TRACE_BYTES = 2 * 1024 * 1024;
export const MAX_TRACE_SPANS = 1000;
export const MAX_TRACE_BUDGETS = 30;
export const ZERO_NS = BigInt(0);
export const NS_PER_MS = BigInt(1000000);
const UINT64 = BigInt("18446744073709551615");
export type TraceIssue =
  | "json"
  | "limit"
  | "otlp"
  | "id"
  | "time"
  | "attributes"
  | "project"
  | "context"
  | "state"
  | "crypto"
  | "cancelled";
export class TraceError extends Error {
  constructor(public code: TraceIssue) {
    super(code);
    this.name = "TraceError";
  }
}
export const traceObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const traceText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const traceInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const traceOwn = (v: object, key: string) => Object.hasOwn(v, key);
export function traceJson(source: string): JsonValue {
  if (!traceText(source, MAX_TRACE_BYTES)) throw new TraceError("limit");
  try {
    const value: unknown = JSON.parse(source.replace(/^\uFEFF/, ""));
    let nodes = 0;
    const visit = (v: unknown, depth: number): JsonValue => {
      if (++nodes > 100000 || depth > 64) throw new TraceError("limit");
      if (
        v === null ||
        typeof v === "string" ||
        typeof v === "boolean" ||
        (typeof v === "number" && Number.isFinite(v))
      )
        return v;
      if (Array.isArray(v)) return v.map((child) => visit(child, depth + 1));
      if (traceObject(v))
        return Object.fromEntries(
          Object.entries(v).map(([key, child]) => [
            key,
            visit(child, depth + 1),
          ]),
        );
      throw new TraceError("json");
    };
    return visit(value, 0);
  } catch (error) {
    throw error instanceof TraceError ? error : new TraceError("json");
  }
}
export function traceHex(
  value: unknown,
  length: number,
  optional = false,
): string {
  if (
    optional &&
    (value === undefined || value === "" || value === "0".repeat(length))
  )
    return "";
  if (
    typeof value !== "string" ||
    value.length !== length ||
    !/^[a-f0-9]+$/i.test(value) ||
    /^0+$/.test(value)
  )
    throw new TraceError("id");
  return value.toLowerCase();
}
export function traceNs(value: unknown): string {
  if (traceInt(value, 0, Number.MAX_SAFE_INTEGER)) return String(value);
  if (
    typeof value !== "string" ||
    !/^\d{1,20}$/.test(value) ||
    BigInt(value) > UINT64
  )
    throw new TraceError("time");
  return BigInt(value).toString();
}
export function traceMs(ns: string | bigint): string {
  const value = typeof ns === "bigint" ? ns : BigInt(ns),
    sign = value < ZERO_NS ? "-" : "",
    absolute = value < ZERO_NS ? -value : value;
  const fraction = (absolute % NS_PER_MS)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return (
    sign + (absolute / NS_PER_MS).toString() + (fraction ? `.${fraction}` : "")
  );
}
export function traceThreshold(source: unknown, duration: boolean): bigint {
  if (
    typeof source !== "string" ||
    !/^(0|[1-9]\d{0,7})(?:\.\d{1,6})?$/.test(source)
  )
    throw new TraceError("project");
  const [whole, fraction = ""] = source.split(".");
  if (!duration && (fraction || Number(whole) > MAX_TRACE_SPANS))
    throw new TraceError("project");
  if (duration && Number(source) > 86400000) throw new TraceError("project");
  return duration
    ? BigInt(whole) * NS_PER_MS + BigInt(fraction.padEnd(6, "0"))
    : BigInt(whole);
}
export type TraceAttributes = { key: string; value: JsonValue }[];
export type TraceEvent = {
  name: string;
  timeNs: string;
  attributes: TraceAttributes;
};
export type TraceLink = {
  traceId: string;
  spanId: string;
  attributes: TraceAttributes;
};
export type TraceSpan = {
  key: string;
  index: number;
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  service: string;
  namespace: string;
  serviceKey: string;
  scope: string;
  startNs: string;
  endNs: string;
  kind: number;
  status: number;
  message: string;
  flags: number;
  attributes: TraceAttributes;
  resource: TraceAttributes;
  events: TraceEvent[];
  links: TraceLink[];
  dropped: boolean;
};
export type TraceData = { spans: TraceSpan[] };
const list = (v: unknown, max: number): unknown[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) throw new TraceError("limit");
  return v;
};
const optionalString = (v: unknown, max = 512) => {
  if (v === undefined) return "";
  if (!traceText(v, max)) throw new TraceError("otlp");
  return v;
};
function dropped(v: unknown): boolean {
  if (v === undefined) return false;
  if (!traceInt(v, 0, 4294967295)) throw new TraceError("otlp");
  return v > 0;
}
function attributes(
  value: unknown,
  budget: { nodes: number },
  depth = 0,
): TraceAttributes {
  const keys = new Set<string>();
  return list(value, 64).map((item) => {
    if (
      !traceObject(item) ||
      !traceText(item.key, 256) ||
      !item.key ||
      keys.has(item.key)
    )
      throw new TraceError("attributes");
    keys.add(item.key);
    return {
      key: item.key,
      value: anyValue(item.value ?? {}, budget, depth + 1),
    };
  });
}
function anyValue(
  input: unknown,
  budget: { nodes: number },
  depth: number,
): JsonValue {
  if (++budget.nodes > 12000 || depth > 12) throw new TraceError("limit");
  if (!traceObject(input)) throw new TraceError("attributes");
  const keys = [
    "stringValue",
    "boolValue",
    "intValue",
    "doubleValue",
    "arrayValue",
    "kvlistValue",
    "bytesValue",
  ].filter((k) => traceOwn(input, k));
  if (!keys.length) return {};
  if (keys.length !== 1) throw new TraceError("attributes");
  const key = keys[0],
    value = input[key];
  if (key === "stringValue" && traceText(value, 8192))
    return { stringValue: value };
  if (key === "boolValue" && typeof value === "boolean")
    return { boolValue: value };
  if (key === "intValue") {
    if (
      (typeof value === "string" && /^-?\d{1,19}$/.test(value)) ||
      (typeof value === "number" && Number.isSafeInteger(value))
    ) {
      const integer = BigInt(value);
      if (
        integer >= BigInt("-9223372036854775808") &&
        integer <= BigInt("9223372036854775807")
      )
        return { intValue: integer.toString() };
    }
  }
  if (
    key === "doubleValue" &&
    ((typeof value === "number" && Number.isFinite(value)) ||
      value === "NaN" ||
      value === "Infinity" ||
      value === "-Infinity")
  )
    return { doubleValue: value as JsonValue };
  if (
    key === "bytesValue" &&
    traceText(value, 8192) &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    try {
      if (btoa(atob(value)) === value) return { bytesValue: value };
    } catch {}
  }
  if (key === "arrayValue" && traceObject(value))
    return {
      arrayValue: {
        values: list(value.values, 100).map((v) =>
          anyValue(v, budget, depth + 1),
        ),
      },
    };
  if (key === "kvlistValue" && traceObject(value))
    return {
      kvlistValue: { values: attributes(value.values, budget, depth + 1) },
    };
  throw new TraceError("attributes");
}
export function readTraceData(source: string): TraceData {
  const root = traceJson(source);
  if (!traceObject(root) || !Array.isArray(root.resourceSpans))
    throw new TraceError("otlp");
  const spans: TraceSpan[] = [],
    identities = new Set<string>(),
    budget = { nodes: 0 };
  for (const group of list(root.resourceSpans, 100)) {
    if (
      !traceObject(group) ||
      (group.resource !== undefined && !traceObject(group.resource))
    )
      throw new TraceError("otlp");
    const resource = traceObject(group.resource) ? group.resource : {},
      resourceAttrs = attributes(resource.attributes, budget);
    const attrString = (key: string) => {
      const v = resourceAttrs.find((a) => a.key === key)?.value;
      return traceObject(v) && typeof v.stringValue === "string"
        ? v.stringValue
        : "";
    };
    const service = attrString("service.name") || "unknown_service",
      namespace = attrString("service.namespace"),
      serviceKey = JSON.stringify([namespace, service]);
    const resourceDropped = dropped(resource.droppedAttributesCount);
    for (const collection of list(group.scopeSpans, 100)) {
      if (
        !traceObject(collection) ||
        (collection.scope !== undefined && !traceObject(collection.scope))
      )
        throw new TraceError("otlp");
      const scope = traceObject(collection.scope) ? collection.scope : {};
      attributes(scope.attributes, budget);
      const scopeDropped = dropped(scope.droppedAttributesCount);
      for (const input of list(collection.spans, MAX_TRACE_SPANS)) {
        if (spans.length >= MAX_TRACE_SPANS) throw new TraceError("limit");
        if (
          !traceObject(input) ||
          !traceText(input.name, 512) ||
          !input.name ||
          (input.kind !== undefined && !traceInt(input.kind, 0, 5)) ||
          (input.flags !== undefined &&
            !traceInt(input.flags, 0, 4294967295)) ||
          (input.status !== undefined && !traceObject(input.status))
        )
          throw new TraceError("otlp");
        const traceId = traceHex(input.traceId, 32),
          spanId = traceHex(input.spanId, 16),
          parentSpanId = traceHex(input.parentSpanId, 16, true),
          key = `${traceId}/${spanId}`;
        if (identities.has(key)) throw new TraceError("id");
        identities.add(key);
        const startNs = traceNs(input.startTimeUnixNano),
          endNs = traceNs(input.endTimeUnixNano);
        if (BigInt(endNs) < BigInt(startNs)) throw new TraceError("time");
        const status = traceObject(input.status) ? input.status : {};
        if (status.code !== undefined && !traceInt(status.code, 0, 2))
          throw new TraceError("otlp");
        let hasDropped = resourceDropped || scopeDropped;
        // Evaluate every counter even when another counter already signals loss.
        for (const v of [
          input.droppedAttributesCount,
          input.droppedEventsCount,
          input.droppedLinksCount,
        ])
          if (dropped(v)) hasDropped = true;
        const events = list(input.events, 50).map((e) => {
          if (!traceObject(e) || !traceText(e.name, 512))
            throw new TraceError("otlp");
          if (dropped(e.droppedAttributesCount)) hasDropped = true;
          return {
            name: e.name,
            timeNs: traceNs(e.timeUnixNano ?? "0"),
            attributes: attributes(e.attributes, budget),
          };
        });
        const links = list(input.links, 50).map((l) => {
          if (!traceObject(l)) throw new TraceError("otlp");
          if (dropped(l.droppedAttributesCount)) hasDropped = true;
          return {
            traceId: traceHex(l.traceId, 32),
            spanId: traceHex(l.spanId, 16),
            attributes: attributes(l.attributes, budget),
          };
        });
        spans.push({
          key,
          index: spans.length,
          traceId,
          spanId,
          parentSpanId,
          name: input.name,
          service,
          namespace,
          serviceKey,
          scope: optionalString(scope.name),
          startNs,
          endNs,
          kind: (input.kind ?? 0) as number,
          status: (status.code ?? 0) as number,
          message: optionalString(status.message, 8192),
          flags: (input.flags ?? 0) as number,
          attributes: attributes(input.attributes, budget),
          resource: resourceAttrs,
          events,
          links,
          dropped: hasDropped,
        });
      }
    }
  }
  if (!spans.length) throw new TraceError("otlp");
  return { spans };
}

export type TraceMetric =
  "elapsed" | "duration" | "self" | "errors" | "diagnostics" | "spans";
export const TRACE_METRICS: TraceMetric[] = [
  "elapsed",
  "duration",
  "self",
  "errors",
  "diagnostics",
  "spans",
];
export type TraceBudget = {
  id: string;
  name: string;
  serviceKey: string;
  operation: string;
  traceId: string;
  metric: TraceMetric;
  max: string;
  minMatches: number;
};
export type TraceProject = {
  kind: "rsswag-trace-project";
  version: 1;
  name: string;
  source: string;
  budgets: TraceBudget[];
  context: { traceparent: string; tracestate: string };
};
export const newTraceBudget = (id = "budget-1"): TraceBudget => ({
  id,
  name: id,
  serviceKey: "",
  operation: "",
  traceId: "",
  metric: "duration",
  max: "500",
  minMatches: 1,
});
export function normalizeTraceBudget(v: unknown): TraceBudget {
  if (
    !traceObject(v) ||
    !traceText(v.id, 80) ||
    !/^[a-z0-9_-]+$/i.test(v.id) ||
    !traceText(v.name, 120) ||
    !v.name.trim() ||
    !traceText(v.serviceKey, 20000) ||
    !traceText(v.operation, 512) ||
    !traceText(v.traceId, 32) ||
    !TRACE_METRICS.includes(v.metric as TraceMetric) ||
    !traceInt(v.minMatches, 0, MAX_TRACE_SPANS)
  )
    throw new TraceError("project");
  if (v.traceId) traceHex(v.traceId, 32);
  traceThreshold(
    v.max,
    ["elapsed", "duration", "self"].includes(v.metric as string),
  );
  return {
    id: v.id,
    name: v.name,
    serviceKey: v.serviceKey,
    operation: v.operation,
    traceId: v.traceId.toLowerCase(),
    metric: v.metric as TraceMetric,
    max: v.max as string,
    minMatches: v.minMatches,
  };
}
export function normalizeTraceProject(v: unknown): TraceProject {
  if (
    !traceObject(v) ||
    v.kind !== "rsswag-trace-project" ||
    v.version !== 1 ||
    !traceText(v.name, 120) ||
    !v.name.trim() ||
    typeof v.source !== "string" ||
    !Array.isArray(v.budgets) ||
    v.budgets.length > MAX_TRACE_BUDGETS ||
    !traceObject(v.context) ||
    !traceText(v.context.traceparent, 1024) ||
    !traceText(v.context.tracestate, 1024)
  )
    throw new TraceError("project");
  readTraceData(v.source);
  const budgets = v.budgets.map(normalizeTraceBudget);
  if (new Set(budgets.map((b) => b.id)).size !== budgets.length)
    throw new TraceError("project");
  const p: TraceProject = {
    kind: v.kind,
    version: 1,
    name: v.name,
    source: v.source,
    budgets,
    context: {
      traceparent: v.context.traceparent,
      tracestate: v.context.tracestate,
    },
  };
  if (getByteSize(JSON.stringify(p)) > MAX_TRACE_BYTES)
    throw new TraceError("limit");
  return p;
}
export const parseTraceProject = (source: string) =>
  normalizeTraceProject(traceJson(source));
export function serializeTraceProject(value: TraceProject): string {
  const p = normalizeTraceProject(value),
    source = JSON.stringify(p, null, 2);
  return getByteSize(source) <= MAX_TRACE_BYTES ? source : JSON.stringify(p);
}
