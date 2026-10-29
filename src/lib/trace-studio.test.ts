import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TRACE_BYTES,
  MAX_TRACE_SPANS,
  TraceError,
  newTraceBudget,
  normalizeTraceProject,
  parseTraceProject,
  readTraceData,
  serializeTraceProject,
  traceMs,
  traceThreshold,
} from "./trace-data";
import {
  analyzeTraceData,
  evaluateTraceBudgets,
  traceReport,
  traceUnion,
} from "./trace-analysis";
import {
  DEMO_TRACE_A,
  DEMO_TRACE_B,
  demoTraceProject,
  emptyTraceProject,
} from "./trace-demo";
import {
  childTraceContext,
  inspectTraceContext,
  newTraceContext,
  readTraceParent,
  readTraceState,
  updateTraceState,
} from "./trace-context";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const root = () => JSON.parse(emptyTraceProject().source);
const setSpans = (spans: Record<string, unknown>[]) => {
  const r = root();
  r.resourceSpans[0].scopeSpans[0].spans = spans;
  return JSON.stringify(r);
};
const span = (
  id = 1,
  parent = 0,
  start = "1700000000000000123",
  end = "1700000000100000123",
) => ({
  traceId: DEMO_TRACE_A,
  spanId: id.toString(16).padStart(16, "0"),
  ...(parent ? { parentSpanId: parent.toString(16).padStart(16, "0") } : {}),
  name: `operation-${id}`,
  startTimeUnixNano: start,
  endTimeUnixNano: end,
});
describe("bounded OTLP JSON imports", () => {
  it("imports all demo resources, scopes, typed attributes, events and links with exact nanosecond precision", () => {
    const p = demoTraceProject(),
      data = readTraceData(p.source);
    expect(data.spans).toHaveLength(12);
    expect(data.spans[0].startNs).toBe("1700000000000000123");
    expect(
      data.spans.find((s) => s.name === "insert order")!.attributes[1].value,
    ).toEqual({ intValue: "9223372036854775807" });
    expect(
      data.spans.find((s) => s.name === "consume order event")!.links[0]
        .traceId,
    ).toBe(DEMO_TRACE_A);
  });
  it("accepts case-insensitive OTLP IDs and safe numeric timestamps and rejects numeric precision loss", () => {
    const s = span();
    s.traceId = "ABCDEF".repeat(5) + "AB";
    expect(
      readTraceData(
        setSpans([{ ...s, startTimeUnixNano: 0, endTimeUnixNano: 10 }]),
      ).spans[0],
    ).toMatchObject({
      traceId: s.traceId.toLowerCase(),
      startNs: "0",
      endNs: "10",
    });
    expect(() =>
      readTraceData(
        setSpans([{ ...s, startTimeUnixNano: 1700000000000000000 }]),
      ),
    ).toThrow("time");
  });
  it.each(["0".repeat(32), "a".repeat(31), "g".repeat(32)])(
    "rejects invalid trace ID %s",
    (id) => {
      expect(() =>
        readTraceData(setSpans([{ ...span(), traceId: id }])),
      ).toThrow("id");
    },
  );
  it("rejects duplicate composite span IDs, reversed time ranges and out-of-uint64 timestamps", () => {
    expect(() => readTraceData(setSpans([span(), span()]))).toThrow("id");
    expect(() => readTraceData(setSpans([span(1, 0, "10", "9")]))).toThrow(
      "time",
    );
    expect(() =>
      readTraceData(setSpans([span(1, 0, "0", "18446744073709551616")])),
    ).toThrow("time");
    expect(
      readTraceData(setSpans([span(1, 0, "0", "18446744073709551615")]))
        .spans[0].endNs,
    ).toBe("18446744073709551615");
  });
  it("allows equal span IDs in different traces and unknown root metadata without following URLs", () => {
    expect(
      readTraceData(
        setSpans([
          span(),
          {
            ...span(),
            traceId: DEMO_TRACE_B,
            schemaUrl: "https://private.example/schema",
          },
        ]),
      ).spans,
    ).toHaveLength(2);
  });
  it("validates AnyValue oneofs and preserves nested typed values without coercing int64s", () => {
    const values = [
      { stringValue: "a" },
      { boolValue: false },
      { intValue: "-9223372036854775808" },
      { doubleValue: 1e25 },
      { doubleValue: "NaN" },
      { bytesValue: "AP8=" },
      {},
      { arrayValue: { values: [{ intValue: 1 }] } },
      {
        kvlistValue: {
          values: [{ key: "__proto__", value: { stringValue: "safe data" } }],
        },
      },
    ];
    const s = {
      ...span(),
      attributes: values.map((value, i) => ({ key: `v${i}`, value })),
    };
    expect(readTraceData(setSpans([s])).spans[0].attributes).toHaveLength(
      values.length,
    );
    for (const value of [
      { stringValue: "a", boolValue: true },
      { intValue: "9223372036854775808" },
      { bytesValue: "AB==" },
      { boolValue: "false" },
    ])
      expect(() =>
        readTraceData(
          setSpans([{ ...span(), attributes: [{ key: "v", value }] }]),
        ),
      ).toThrow("attributes");
  });
  it("rejects ambiguous attribute keys, string enum names and malformed known counters", () => {
    expect(() =>
      readTraceData(
        setSpans([
          {
            ...span(),
            attributes: [
              { key: "a", value: {} },
              { key: "a", value: {} },
            ],
          },
        ]),
      ),
    ).toThrow("attributes");
    expect(() =>
      readTraceData(setSpans([{ ...span(), kind: "SPAN_KIND_SERVER" }])),
    ).toThrow("otlp");
    expect(() =>
      readTraceData(
        setSpans([{ ...span(), droppedEventsCount: 1, droppedLinksCount: -1 }]),
      ),
    ).toThrow("otlp");
  });
  it("bounds import bytes, span counts and JSON nesting", () => {
    expect(() => readTraceData(" ".repeat(MAX_TRACE_BYTES + 1))).toThrow(
      "limit",
    );
    expect(() =>
      readTraceData(
        setSpans(
          Array.from({ length: MAX_TRACE_SPANS + 1 }, (_, i) => span(i + 1)),
        ),
      ),
    ).toThrow("limit");
    expect(() => readTraceData("[".repeat(66) + "0" + "]".repeat(66))).toThrow(
      "limit",
    );
  });
});
describe("trace topology and timing attribution", () => {
  it("unions overlapping child intervals rather than double-counting nested latency", () => {
    const a = analyzeTraceData(demoTraceProject().source);
    expect(a.traces).toHaveLength(3);
    expect(a.services).toHaveLength(5);
    expect(
      traceMs(a.timings.find((t) => t.span.name === "POST /checkout")!.selfNs!),
    ).toBe("70");
    expect(
      traceMs(a.timings.find((t) => t.span.name === "createOrder")!.selfNs!),
    ).toBe("85");
    expect(a.dependencies).toHaveLength(3);
    expect(a.diagnostics.map((d) => d.code)).toEqual(["missing-parent"]);
    expect(
      traceUnion([
        [BigInt(1), BigInt(4)],
        [BigInt(3), BigInt(6)],
        [BigInt(6), BigInt(9)],
      ]),
    ).toBe(BigInt(8));
  });
  it("clips out-of-parent children and handles zero duration and precise one-nanosecond intervals", () => {
    const a = analyzeTraceData(
      setSpans([
        span(1, 0, "10", "20"),
        span(2, 1, "0", "15"),
        span(3, 1, "19", "30"),
        span(4, 1, "16", "16"),
      ]),
    );
    expect(a.timings[0].selfNs).toBe("4");
    expect(
      a.diagnostics.filter((d) => d.code === "child-outside"),
    ).toHaveLength(2);
    expect(traceMs("1")).toBe("0.000001");
    expect(traceMs("1000001")).toBe("1.000001");
  });
  it("detects cycles iteratively and marks their exclusive times unavailable", () => {
    const a = analyzeTraceData(setSpans([span(1, 2), span(2, 1), span(3, 2)]));
    expect(a.diagnostics.filter((d) => d.code === "cycle")).toHaveLength(2);
    expect(a.timings.map((t) => t.selfNs === null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(a.timings[2].depth).toBe(1);
    const b = { ...newTraceBudget(), metric: "self" as const };
    expect(evaluateTraceBudgets(a, [b])[0]).toMatchObject({
      passed: false,
      issue: "unavailable",
      value: null,
    });
  });
  it("keeps cross-trace links distinct from parent/dependency edges and reports missing link/event/loss metadata", () => {
    const s = {
      ...span(1, 999),
      events: [{ name: "outside", timeUnixNano: "1" }],
      links: [{ traceId: DEMO_TRACE_B, spanId: "bbbbbbbbbbbbbbbb" }],
      droppedAttributesCount: 1,
    };
    const a = analyzeTraceData(setSpans([s]));
    expect(a.dependencies).toHaveLength(0);
    expect(a.diagnostics.map((d) => d.code).sort()).toEqual(
      [
        "missing-parent",
        "missing-link",
        "event-outside",
        "dropped-data",
      ].sort(),
    );
  });
  it("handles a maximum-length parent chain without recursive stack growth", () => {
    const a = analyzeTraceData(
      setSpans(Array.from({ length: 1000 }, (_, i) => span(i + 1, i))),
    );
    expect(a.timings.at(-1)!.depth).toBe(999);
    expect(a.timings[0].selfNs).toBe("0");
  });
});
describe("latency regression budgets and portable projects", () => {
  it("passes all seven demo budgets with inclusive thresholds and exact decimal milliseconds", () => {
    const p = demoTraceProject(),
      result = evaluateTraceBudgets(analyzeTraceData(p.source), p.budgets);
    expect(result).toHaveLength(7);
    expect(result.every((r) => r.passed)).toBe(true);
    expect(traceThreshold("0.000001", true)).toBe(BigInt(1));
    p.budgets[0].max = "399.999999";
    expect(
      evaluateTraceBudgets(analyzeTraceData(p.source), p.budgets)[0].passed,
    ).toBe(false);
  });
  it("requires matching coverage, applies exact AND selectors, and treats zero limits as real constraints", () => {
    const p = demoTraceProject(),
      a = analyzeTraceData(p.source),
      budget = { ...newTraceBudget(), operation: "does not exist", max: "0" };
    expect(evaluateTraceBudgets(a, [budget])[0]).toMatchObject({
      matches: 0,
      passed: false,
      issue: "coverage",
    });
    budget.minMatches = 0;
    expect(evaluateTraceBudgets(a, [budget])[0].passed).toBe(true);
    expect(
      evaluateTraceBudgets(a, [
        { ...newTraceBudget(), metric: "errors", max: "0" },
      ])[0].passed,
    ).toBe(false);
    expect(
      evaluateTraceBudgets(a, [
        {
          ...newTraceBudget(),
          serviceKey: a.services[0].key,
          operation: "insert order",
          metric: "spans",
          max: "10",
        },
      ])[0].matches,
    ).toBe(0);
  });
  it("retains exact OTLP source/unknown metadata while excluding untrusted imported results", () => {
    const p = demoTraceProject(),
      imported = parseTraceProject(
        JSON.stringify({ ...p, analysis: { passed: true } }),
      );
    expect(imported).toEqual(p);
    expect(parseTraceProject(serializeTraceProject(p)).source).toBe(p.source);
    expect(serializeTraceProject(imported)).not.toContain('"analysis"');
  });
  it("reports only relative timings and verdict metadata without raw IDs, attributes, events, status messages or absolute timestamps", () => {
    const p = demoTraceProject(),
      a = analyzeTraceData(p.source),
      report = traceReport(a, evaluateTraceBudgets(a, p.budgets));
    for (const secret of [
      "PRIVATE",
      "private.example",
      "1700000000",
      DEMO_TRACE_A,
      DEMO_TRACE_B,
      "exception",
      "9223372036854775807",
    ])
      expect(report).not.toContain(secret);
    expect(JSON.parse(report).services).toHaveLength(5);
  });
  it("rejects coerced project shapes, duplicate budgets and invalid exact duration/count thresholds", () => {
    const p = emptyTraceProject();
    expect(() => normalizeTraceProject({ ...p, version: "1" })).toThrow(
      "project",
    );
    expect(() =>
      normalizeTraceProject({ ...p, budgets: [p.budgets[0], p.budgets[0]] }),
    ).toThrow("project");
    for (const v of ["1e3", "-1", "0.0000001", "86400001", "NaN"])
      expect(() => traceThreshold(v, true)).toThrow("project");
    expect(() => traceThreshold("1.1", false)).toThrow("project");
  });
  it("retains namespace identity in dependency reports when service names are equal", () => {
    const r = root(),
      group = r.resourceSpans[0];
    group.resource.attributes = [
      { key: "service.name", value: { stringValue: "same" } },
      { key: "service.namespace", value: { stringValue: "one" } },
    ];
    group.scopeSpans[0].spans = [span(1)];
    r.resourceSpans.push({
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "same" } },
          { key: "service.namespace", value: { stringValue: "two" } },
        ],
      },
      scopeSpans: [{ spans: [span(2, 1)] }],
    });
    const a = analyzeTraceData(JSON.stringify(r)),
      report = JSON.parse(traceReport(a, []));
    expect(a.services).toHaveLength(2);
    expect(report.dependencies[0]).toMatchObject({
      from: { name: "same", namespace: "one" },
      to: { name: "same", namespace: "two" },
    });
  });
  it("round-trips projects near the byte limit with compact serialization and rejects oversized edits", () => {
    const p = emptyTraceProject(),
      r = root();
    r["x-padding"] = "";
    p.source = JSON.stringify(r);
    const size = new TextEncoder().encode(JSON.stringify(p)).length;
    r["x-padding"] = "x".repeat(MAX_TRACE_BYTES - 64 - size);
    p.source = JSON.stringify(r);
    const source = serializeTraceProject(p);
    expect(source).toBe(JSON.stringify(p));
    expect(parseTraceProject(source)).toEqual(p);
    expect(() =>
      normalizeTraceProject({ ...p, name: "x".repeat(120) }),
    ).toThrow("limit");
    expect(p.name).toBe(emptyTraceProject().name);
  });
});
describe("W3C version-00 trace context", () => {
  const parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-03";
  it("parses the sampled bit by mask and creates a new child span context preserving the trace", () => {
    expect(readTraceParent(parent)).toMatchObject({
      sampled: true,
      flags: "03",
    });
    const child = childTraceContext(parent, "vendor=value", false);
    expect(readTraceParent(child.traceparent)).toMatchObject({
      traceId: readTraceParent(parent).traceId,
      flags: "00",
      sampled: false,
    });
    expect(readTraceParent(child.traceparent).parentId).not.toBe(
      readTraceParent(parent).parentId,
    );
    expect(child.tracestate).toBe("vendor=value");
  });
  it.each(["ff", "01", "0A"])(
    "rejects unsupported traceparent version %s without attempting tracestate",
    (version) => {
      const parsed = inspectTraceContext(
        version + parent.slice(2),
        "not-valid",
      );
      expect(parsed).toEqual({ parent: null, state: [], issue: "context" });
    },
  );
  it("rejects uppercase/zero IDs and keeps valid parent context even when tracestate fails", () => {
    expect(() => readTraceParent(parent.toUpperCase())).toThrow("context");
    expect(() =>
      readTraceParent(
        parent.replace("4bf92f3577b34da6a3ce929d0e0e4736", "0".repeat(32)),
      ),
    ).toThrow("id");
    expect(inspectTraceContext(parent, "bad")).toMatchObject({
      issue: "state",
      parent: { sampled: true },
      state: [],
    });
  });
  it("validates unique vendor/tenant keys and bounded ASCII values", () => {
    expect(readTraceState("vendor=value,123@system=tenant")).toHaveLength(2);
    for (const value of [
      "vendor=a,vendor=b",
      "UPPER=x",
      "vendor=a=b",
      "vendor=",
      "vendor=é",
      Array(33)
        .fill(0)
        .map((_, i) => `v${i}=x`)
        .join(","),
    ])
      expect(() => readTraceState(value)).toThrow("state");
  });
  it("moves an updated vendor to the front and evicts whole rightmost entries at bounds", () => {
    expect(updateTraceState("a=one,b=two", "b", "new")).toEqual({
      value: "b=new,a=one",
      removed: 0,
    });
    const initial = Array.from({ length: 32 }, (_, i) => `v${i}=x`).join(","),
      updated = updateTraceState(initial, "new", "value");
    expect(updated.removed).toBe(1);
    expect(updated.value).not.toContain("v31=");
    expect(() => updateTraceState("", "a,b", "x")).toThrow("state");
  });
  it("generates nonzero IDs and bounds repeated RNG failures", () => {
    expect(readTraceParent(newTraceContext().traceparent).sampled).toBe(true);
    vi.spyOn(webcrypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint8Array).fill(0);
      return array;
    });
    expect(() => newTraceContext()).toThrow(TraceError);
    expect(webcrypto.getRandomValues).toHaveBeenCalledTimes(4);
  });
});
