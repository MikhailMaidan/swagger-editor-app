import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { generateSloPrometheus, generateSloToolkit } from "./slo-export";
import { classifySloEvent, type SloPoint } from "./slo-engine";
import { createSloMonitor } from "./slo-monitor";
import { demoSloProject, runSloMatrix, sloTimelineTimes } from "./slo-studio";
import {
  newSloObjective,
  type SloCoverage,
  type SloEvent,
  type SloObjective,
} from "./slo-project";

type Monitor = ReturnType<typeof createSloMonitor>;
async function artifact(policy = newSloObjective()) {
  const source = generateSloToolkit(policy);
  const exports = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )) as {
    classifyEvent: (e: unknown) => string;
    evaluateTimeline: (
      events: unknown,
      settings: {
        fromMs: number;
        toMs: number;
        stepMs: number;
        coverage?: SloCoverage;
      },
    ) => SloPoint[];
    createSloMonitor: (options?: {
      assumeCompleteFromMs?: number | null;
    }) => Monitor;
  };
  return { source, ...exports };
}
const sample = (id = "event-1", atMs = 100000): SloEvent => ({
  id,
  name: "Completion",
  atMs,
  service: "store",
  route: "/orders",
  method: "GET",
  status: 200,
  latencyMs: 40,
  weight: 1,
  excluded: false,
});

describe("standalone SLO monitoring and Prometheus exports", () => {
  it("executes native ESM with exact replay and monitor parity for eighteen comparisons", async () => {
    const project = demoSloProject(),
      runs = await runSloMatrix(project);
    for (const p of project.objectives) {
      const e = await artifact(p);
      for (const c of project.scenarios) {
        const expected = runs.find(
          (r) => r.objectiveId === p.id && r.scenarioId === c.id,
        )!.points;
        expect(
          e.evaluateTimeline([...c.events].reverse(), {
            ...c.timeline,
            coverage: c.coverage,
          }),
        ).toEqual(expected);
        const monitor = e.createSloMonitor({
          assumeCompleteFromMs: c.coverage?.fromMs,
        });
        c.events.forEach((event) => monitor.record(event));
        expect(
          sloTimelineTimes(c.timeline).map((t) => monitor.evaluate(t)),
        ).toEqual(expected);
      }
    }
  });
  it("matches classification for all modes, scopes, exclusions and fractional latency", async () => {
    const p = newSloObjective();
    p.scope = { service: "store", route: "/orders", method: "GET" };
    p.thresholdMs = 40;
    const events = [
      sample(),
      { ...sample("slow"), latencyMs: 40.01 },
      { ...sample("error"), status: 503 },
      { ...sample("excluded"), excluded: true },
      { ...sample("scope"), method: "POST" },
    ];
    for (const mode of ["availability", "latency", "combined"] as const) {
      p.mode = mode;
      const e = await artifact(p);
      expect(events.map(e.classifyEvent)).toEqual(
        events.map((v) => classifySloEvent(p, v)),
      );
    }
  });
  it("preserves exact weighted burn decisions and finite zero-budget/no-data output", async () => {
    const p = newSloObjective();
    p.targetPpm = 1000000;
    p.requireCoverage = false;
    const e = await artifact(p),
      events = [
        { ...sample(), status: 503, weight: 1000000 },
        sample("good", 99000),
      ];
    const points = e.evaluateTimeline(events, {
      fromMs: 100000,
      toMs: 104000,
      stepMs: 2000,
    });
    expect(points[0].window).toMatchObject({
      target: "missed",
      remainingPercent: null,
      burnRate: null,
      infiniteBurn: true,
    });
    expect(points.at(-1)!.rules[0].status).toBe("firing");
    const empty = e.evaluateTimeline([], {
      fromMs: 100000,
      toMs: 100000,
      stepMs: 1,
    })[0];
    expect(empty.window).toMatchObject({
      target: "no-data",
      burnRate: null,
      infiniteBurn: false,
    });
    expect(JSON.stringify(points)).not.toMatch(/NaN|Infinity/);
  });
  it("enforces monitor clock, retry, capacity, defensive copies, eviction and coverage reset", async () => {
    const policy = newSloObjective(),
      e = await artifact(policy),
      core = createSloMonitor(policy, { assumeCompleteFromMs: 0 }),
      out = e.createSloMonitor({ assumeCompleteFromMs: 0 }),
      input = sample();
    for (const m of [core, out]) {
      expect(m.record(input)).toBe(true);
      expect(m.record({ ...input })).toBe(false);
      expect(() => m.record({ ...input, status: 503 })).toThrow("duplicate");
    }
    input.status = 503;
    expect(out.evaluate(100000)).toEqual(core.evaluate(100000));
    const leaked = out.snapshot();
    leaked.point!.window.total = 999;
    expect(out.snapshot()).toEqual(core.snapshot());
    for (const m of [core, out]) {
      expect(() => m.evaluate(99999)).toThrow("clock");
      expect(() => m.record(sample("late", 100000))).toThrow("late");
      m.evaluate(160000);
      expect(m.snapshot().retained).toBe(0);
      expect(m.snapshot().evicted).toBe(1);
      m.reset();
      m.record(sample());
      expect(m.evaluate(100000).window.target).toBe("unknown");
      m.reset();
      for (let i = 0; i < 5000; i++) m.record(sample(`e-${i}`, i));
      expect(() => m.record(sample("overflow"))).toThrow("limit");
      expect(m.snapshot().retained).toBe(5000);
      expect(() => m.reset(-1)).toThrow("clock");
      expect(m.snapshot().retained).toBe(5000);
    }
  });
  it("rejects malformed timelines, duplicate events and sparse captures without I/O", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const e = await artifact();
      expect(() =>
        e.evaluateTimeline([], { fromMs: 0, toMs: 10, stepMs: 0 }),
      ).toThrow("limit");
      expect(() =>
        e.evaluateTimeline([sample(), sample()], {
          fromMs: 0,
          toMs: 0,
          stepMs: 1,
        }),
      ).toThrow("duplicate");
      expect(() => e.classifyEvent({ ...sample(), weight: 0 })).toThrow(
        "event",
      );
      expect(() =>
        e.evaluateTimeline(new Array(1), { fromMs: 0, toMs: 0, stepMs: 1 }),
      ).toThrow("event");
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("escapes policy metadata and exports no capture fixtures or browser dependencies", async () => {
    const p = newSloObjective();
    p.name = "</script>\u2028\u2029";
    const e = await artifact(p);
    expect(e.source).not.toContain("</script>");
    expect(e.source).not.toContain("\u2028");
    expect(e.source).not.toMatch(
      /localStorage|document\.|fetch\(|XMLHttpRequest|recovery|ongoing/,
    );
    expect(e.createSloMonitor().evaluate(100000).rules[0].name).toBe(
      p.rules[0].name,
    );
  });
  it("generates parsed paired-window alert YAML with weighted volume, hold and required coverage gates", () => {
    const p = newSloObjective(),
      source = generateSloPrometheus(p),
      yaml = YAML.parse(source),
      r = yaml.groups[0].rules[0];
    expect(yaml.groups[0].name).toBe(`rsswag-slo-${p.id}`);
    expect(r.alert).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    expect(r.for).toBe("4000ms");
    expect(r.labels.slo_id).toBe(p.id);
    for (const term of [
      "[30000ms]",
      "[10000ms]",
      ">= 5",
      ">= 2",
      "rsswag_slo_coverage_start_seconds",
      ">= 30",
      ">= 0.02",
    ])
      expect(r.expr).toContain(term);
    expect(source).toContain("increase extrapolates");
    expect(source).not.toContain("/orders");
    p.requireCoverage = false;
    expect(
      YAML.parse(generateSloPrometheus(p)).groups[0].rules[0].expr,
    ).not.toContain("coverage_start");
  });
  it("uses a positive bad count for perfect targets, stable unique names and an empty optional rule set", () => {
    const p: SloObjective = newSloObjective();
    p.targetPpm = 1000000;
    p.rules.push({ ...p.rules[0], id: "fast_burn" });
    p.rules[0].id = "fast-burn";
    const rules = YAML.parse(generateSloPrometheus(p)).groups[0].rules;
    expect(new Set(rules.map((r: { alert: string }) => r.alert)).size).toBe(2);
    expect(rules[0].expr).toContain('result="bad"');
    expect(rules[0].expr).toContain("> 0)");
    expect(rules[0].expr).not.toContain("/ sum(");
    p.rules = [];
    expect(YAML.parse(generateSloPrometheus(p)).groups[0].rules).toEqual([]);
  });
});
