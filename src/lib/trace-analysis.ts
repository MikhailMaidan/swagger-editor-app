import {
  ZERO_NS,
  readTraceData,
  traceMs,
  traceThreshold,
  normalizeTraceBudget,
  type TraceSpan,
  type TraceBudget,
  type TraceData,
} from "./trace-data";

export type TraceDiagnostic = {
  key: string;
  code:
    | "missing-parent"
    | "cycle"
    | "child-outside"
    | "event-outside"
    | "missing-link"
    | "dropped-data";
  error: boolean;
};
export type TraceSpanTiming = {
  span: TraceSpan;
  parent: string;
  depth: number;
  durationNs: string;
  selfNs: string | null;
};
export type TraceSummary = {
  traceId: string;
  startNs: string;
  endNs: string;
  elapsedNs: string;
  spanCount: number;
  errors: number;
  diagnostics: number;
  roots: number;
};
export type TraceService = {
  key: string;
  name: string;
  namespace: string;
  spans: number;
  errors: number;
  traces: number;
  maxNs: string;
  p95Ns: string;
  inclusiveNs: string;
  selfNs: string;
  unknownSelf: number;
};
export type TraceDependency = {
  from: string;
  to: string;
  calls: number;
  errors: number;
  totalNs: string;
  maxNs: string;
};
export type TraceAnalysis = {
  data: TraceData;
  timings: TraceSpanTiming[];
  traces: TraceSummary[];
  services: TraceService[];
  dependencies: TraceDependency[];
  diagnostics: TraceDiagnostic[];
};
const compareNs = (a: string, b: string) =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
export function traceUnion(intervals: [bigint, bigint][]): bigint {
  const sorted = intervals
    .filter(([a, b]) => b > a)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let sum = ZERO_NS,
    start = ZERO_NS,
    end = ZERO_NS,
    first = true;
  for (const [a, b] of sorted) {
    if (first) {
      start = a;
      end = b;
      first = false;
    } else if (a > end) {
      sum += end - start;
      start = a;
      end = b;
    } else if (b > end) end = b;
  }
  return first ? ZERO_NS : sum + end - start;
}
export function analyzeTraceData(input: TraceData | string): TraceAnalysis {
  const data = typeof input === "string" ? readTraceData(input) : input,
    byKey = new Map(data.spans.map((s) => [s.key, s])),
    diagnostics: TraceDiagnostic[] = [],
    parents = new Map<string, string>(),
    cycles = new Set<string>(),
    done = new Set<string>();
  for (const s of data.spans) {
    const parent = s.parentSpanId ? `${s.traceId}/${s.parentSpanId}` : "";
    parents.set(s.key, byKey.has(parent) ? parent : "");
    if (parent && !byKey.has(parent))
      diagnostics.push({ key: s.key, code: "missing-parent", error: false });
    if (s.dropped)
      diagnostics.push({ key: s.key, code: "dropped-data", error: false });
    if (
      s.events.some(
        (e) =>
          BigInt(e.timeNs) < BigInt(s.startNs) ||
          BigInt(e.timeNs) > BigInt(s.endNs),
      )
    )
      diagnostics.push({ key: s.key, code: "event-outside", error: false });
    if (s.links.some((l) => !byKey.has(`${l.traceId}/${l.spanId}`)))
      diagnostics.push({ key: s.key, code: "missing-link", error: false });
  }
  // Parent forests may contain adversarial cycles. Detect them iteratively, with no recursion.
  for (const s of data.spans) {
    const path: string[] = [],
      local = new Map<string, number>();
    let key = s.key;
    while (key && !done.has(key)) {
      const previous = local.get(key);
      if (previous !== undefined) {
        for (const member of path.slice(previous)) cycles.add(member);
        break;
      }
      local.set(key, path.length);
      path.push(key);
      key = parents.get(key) ?? "";
    }
    for (const key of path) done.add(key);
  }
  for (const key of cycles) {
    diagnostics.push({ key, code: "cycle", error: true });
    parents.set(key, "");
  }
  const children = new Map<string, TraceSpan[]>();
  for (const s of data.spans) {
    const parent = parents.get(s.key)!;
    if (parent) {
      const group = children.get(parent) ?? [];
      group.push(s);
      children.set(parent, group);
      const p = byKey.get(parent)!;
      if (
        BigInt(s.startNs) < BigInt(p.startNs) ||
        BigInt(s.endNs) > BigInt(p.endNs)
      )
        diagnostics.push({ key: s.key, code: "child-outside", error: false });
    }
  }
  const timings = data.spans.map((span): TraceSpanTiming => {
    const start = BigInt(span.startNs),
      end = BigInt(span.endNs),
      duration = end - start;
    const union = traceUnion(
      (children.get(span.key) ?? []).map((c) => [
        BigInt(c.startNs) < start ? start : BigInt(c.startNs),
        BigInt(c.endNs) > end ? end : BigInt(c.endNs),
      ]),
    );
    let depth = 0,
      parent = parents.get(span.key)!;
    while (parent) {
      depth++;
      parent = parents.get(parent) ?? "";
    }
    return {
      span,
      parent: parents.get(span.key)!,
      depth,
      durationNs: duration.toString(),
      selfNs: cycles.has(span.key) ? null : (duration - union).toString(),
    };
  });
  const traces: TraceSummary[] = [],
    services: TraceService[] = [],
    dependencies: TraceDependency[] = [];
  const grouped = new Map<string, TraceSpanTiming[]>(),
    serviceGroups = new Map<string, TraceSpanTiming[]>();
  for (const timing of timings) {
    const { span } = timing;
    grouped.set(span.traceId, [...(grouped.get(span.traceId) ?? []), timing]);
    serviceGroups.set(span.serviceKey, [
      ...(serviceGroups.get(span.serviceKey) ?? []),
      timing,
    ]);
  }
  for (const [traceId, entries] of grouped) {
    const startNs = entries.map((t) => t.span.startNs).sort(compareNs)[0],
      endNs = entries
        .map((t) => t.span.endNs)
        .sort(compareNs)
        .at(-1)!;
    const keys = new Set(entries.map((t) => t.span.key));
    traces.push({
      traceId,
      startNs,
      endNs,
      elapsedNs: (BigInt(endNs) - BigInt(startNs)).toString(),
      spanCount: entries.length,
      errors: entries.filter((t) => t.span.status === 2).length,
      diagnostics: diagnostics.filter((d) => keys.has(d.key)).length,
      roots: entries.filter((t) => !t.parent).length,
    });
  }
  for (const [key, entries] of serviceGroups) {
    const times = entries.map((t) => t.durationNs).sort(compareNs);
    services.push({
      key,
      name: entries[0].span.service,
      namespace: entries[0].span.namespace,
      spans: entries.length,
      errors: entries.filter((t) => t.span.status === 2).length,
      traces: new Set(entries.map((t) => t.span.traceId)).size,
      maxNs: times.at(-1)!,
      p95Ns: times[Math.max(0, Math.ceil(times.length * 0.95) - 1)],
      inclusiveNs: entries
        .reduce((n, t) => n + BigInt(t.durationNs), ZERO_NS)
        .toString(),
      selfNs: entries
        .reduce((n, t) => n + BigInt(t.selfNs ?? "0"), ZERO_NS)
        .toString(),
      unknownSelf: entries.filter((t) => t.selfNs === null).length,
    });
  }
  const edges = new Map<string, TraceDependency>();
  for (const timing of timings) {
    const parent = byKey.get(timing.parent);
    if (!parent || parent.serviceKey === timing.span.serviceKey) continue;
    const id = JSON.stringify([parent.serviceKey, timing.span.serviceKey]),
      edge = edges.get(id) ?? {
        from: parent.serviceKey,
        to: timing.span.serviceKey,
        calls: 0,
        errors: 0,
        totalNs: "0",
        maxNs: "0",
      };
    edge.calls++;
    if (timing.span.status === 2) edge.errors++;
    edge.totalNs = (
      BigInt(edge.totalNs) + BigInt(timing.durationNs)
    ).toString();
    if (BigInt(timing.durationNs) > BigInt(edge.maxNs))
      edge.maxNs = timing.durationNs;
    edges.set(id, edge);
  }
  dependencies.push(...edges.values());
  return { data, timings, traces, services, dependencies, diagnostics };
}
export type TraceBudgetResult = {
  id: string;
  name: string;
  metric: TraceBudget["metric"];
  max: string;
  matches: number;
  value: string | null;
  passed: boolean;
  issue: "none" | "coverage" | "unavailable" | "threshold";
};
export function evaluateTraceBudgets(
  analysis: TraceAnalysis,
  values: TraceBudget[],
): TraceBudgetResult[] {
  return values.map(normalizeTraceBudget).map((b) => {
    const matched = analysis.timings.filter(
        (t) =>
          (!b.serviceKey || b.serviceKey === t.span.serviceKey) &&
          (!b.operation || b.operation === t.span.name) &&
          (!b.traceId || b.traceId === t.span.traceId),
      ),
      keys = new Set(matched.map((t) => t.span.key));
    let value = ZERO_NS,
      unavailable = false;
    if (b.metric === "errors")
      value = BigInt(matched.filter((t) => t.span.status === 2).length);
    else if (b.metric === "diagnostics")
      value = BigInt(
        analysis.diagnostics.filter((d) => keys.has(d.key)).length,
      );
    else if (b.metric === "spans") value = BigInt(matched.length);
    else if (b.metric === "duration" || b.metric === "self")
      for (const t of matched) {
        const ns = b.metric === "self" ? t.selfNs : t.durationNs;
        if (ns === null) unavailable = true;
        else if (BigInt(ns) > value) value = BigInt(ns);
      }
    else {
      const windows = new Map<string, [bigint, bigint]>();
      for (const t of matched) {
        const window = windows.get(t.span.traceId) ?? [
          BigInt(t.span.startNs),
          BigInt(t.span.endNs),
        ];
        if (BigInt(t.span.startNs) < window[0])
          window[0] = BigInt(t.span.startNs);
        if (BigInt(t.span.endNs) > window[1]) window[1] = BigInt(t.span.endNs);
        windows.set(t.span.traceId, window);
      }
      for (const [a, z] of windows.values()) if (z - a > value) value = z - a;
    }
    const duration = ["elapsed", "duration", "self"].includes(b.metric),
      limit = traceThreshold(b.max, duration),
      issue =
        matched.length < b.minMatches
          ? "coverage"
          : unavailable
            ? "unavailable"
            : value > limit
              ? "threshold"
              : "none";
    return {
      id: b.id,
      name: b.name,
      metric: b.metric,
      max: b.max,
      matches: matched.length,
      value: unavailable ? null : duration ? traceMs(value) : value.toString(),
      passed: issue === "none",
      issue,
    };
  });
}
export function traceReport(
  analysis: TraceAnalysis,
  budgets: TraceBudgetResult[],
): string {
  return JSON.stringify(
    {
      kind: "rsswag-trace-report",
      version: 1,
      spans: analysis.timings.length,
      traces: analysis.traces.map((t, index) => ({
        index,
        elapsedMs: traceMs(t.elapsedNs),
        spans: t.spanCount,
        errors: t.errors,
        diagnostics: t.diagnostics,
        roots: t.roots,
      })),
      services: analysis.services.map((s) => ({
        name: s.name,
        namespace: s.namespace,
        spans: s.spans,
        errors: s.errors,
        traces: s.traces,
        maxMs: traceMs(s.maxNs),
        p95Ms: traceMs(s.p95Ns),
        inclusiveMs: traceMs(s.inclusiveNs),
        selfMs: traceMs(s.selfNs),
        unknownSelf: s.unknownSelf,
      })),
      dependencies: analysis.dependencies.map((d) => ({
        from: {
          name: analysis.services.find((s) => s.key === d.from)!.name,
          namespace: analysis.services.find((s) => s.key === d.from)!.namespace,
        },
        to: {
          name: analysis.services.find((s) => s.key === d.to)!.name,
          namespace: analysis.services.find((s) => s.key === d.to)!.namespace,
        },
        calls: d.calls,
        errors: d.errors,
        totalMs: traceMs(d.totalNs),
        maxMs: traceMs(d.maxNs),
      })),
      diagnostics: analysis.diagnostics.map((d) => ({
        spanIndex: analysis.data.spans.find((s) => s.key === d.key)!.index,
        code: d.code,
        error: d.error,
      })),
      budgets,
    },
    null,
    2,
  );
}
