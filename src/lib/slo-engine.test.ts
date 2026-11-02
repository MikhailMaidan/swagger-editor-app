import { describe, expect, it } from "vitest";
import { createSloIndex, evaluateSloPoint, sloBurnAtLeast } from "./slo-engine";
import { createSloMonitor } from "./slo-monitor";
import {
  newSloObjective,
  type SloEvent,
  type SloObjective,
} from "./slo-project";
const p = (): SloObjective => ({
  ...newSloObjective(),
  windowMs: 1000,
  targetPpm: 900000,
  rules: [
    {
      id: "burn",
      name: "Burn",
      longMs: 1000,
      shortMs: 500,
      burnMilli: 2000,
      minLongUnits: 1,
      minShortUnits: 1,
      forMs: 100,
    },
  ],
});
const event = (
  id: string,
  atMs: number,
  status = 200,
  weight = 1,
  extra: Partial<SloEvent> = {},
): SloEvent => ({
  id,
  name: id,
  atMs,
  service: "test",
  route: "/items",
  method: "GET",
  status,
  latencyMs: 10,
  weight,
  excluded: false,
  ...extra,
});
const coverage = { fromMs: 0, toMs: 10000 };
describe("request-based SLO math and sampled alerting", () => {
  it("uses (start,end] completion windows, preserves equal timestamps and ignores future events", () => {
    const index = createSloIndex(p(), [
        event("lower", 1000, 500),
        event("inside", 1001),
        event("equal-a", 2000, 503),
        event("equal-b", 2000),
        event("future", 2001, 503),
      ]),
      w = index.window(2000, 1000, coverage);
    expect(w).toMatchObject({
      fromMs: 1000,
      toMs: 2000,
      total: 3,
      good: 2,
      bad: 1,
      events: 3,
      target: "missed",
    });
    expect(w.sliPercent).toBeCloseTo(200 / 3);
  });
  it("counts weighted request units rather than event rows or elapsed downtime", () => {
    const index = createSloIndex(p(), [
        event("good", 1900, 200, 9),
        event("bad", 1950, 500, 1),
      ]),
      w = index.window(2000, 1000, coverage);
    expect(w).toMatchObject({
      events: 2,
      total: 10,
      good: 9,
      bad: 1,
      allowedBad: 1,
      remainingBad: 0,
      target: "met",
      sliPercent: 90,
      burnRate: 1,
    });
    expect(sloBurnAtLeast(w, 900000, 1000)).toBe(true);
    expect(sloBurnAtLeast(w, 900000, 1001)).toBe(false);
  });
  it("distinguishes no-data, unknown and partial coverage from a met observed target", () => {
    const objective = p(),
      index = createSloIndex(objective, [event("one", 2000)]);
    expect(index.window(2000, 1000, null)).toMatchObject({
      target: "unknown",
      coverage: "unknown",
      sliPercent: 100,
    });
    expect(
      index.window(2000, 1000, { fromMs: 1500, toMs: 2000 }),
    ).toMatchObject({ target: "unknown", coverage: "partial" });
    objective.requireCoverage = false;
    expect(
      createSloIndex(objective, [event("one", 2000)]).window(2000, 1000, null),
    ).toMatchObject({ target: "met", coverage: "unknown" });
    expect(createSloIndex(p(), []).window(2000, 1000, coverage)).toMatchObject({
      target: "no-data",
      sliPercent: null,
      burnRate: null,
    });
  });
  it("classifies status/latency/combined modes, exact scopes and explicit exclusions", () => {
    const objective = p();
    objective.thresholdMs = 10;
    objective.scope = { service: "test", route: "/items", method: "GET" };
    const events = [
      event("good", 2000),
      event("bad-status", 2000, 503),
      event("slow", 2000, 200, 1, { latencyMs: 10.1 }),
      event("excluded", 2000, 503, 9, { excluded: true }),
      event("scope", 2000, 503, 99, { route: "/other" }),
    ];
    expect(
      createSloIndex(objective, events).window(2000, 1000, coverage).bad,
    ).toBe(1);
    objective.mode = "latency";
    expect(
      createSloIndex(objective, events).window(2000, 1000, coverage).bad,
    ).toBe(1);
    objective.mode = "combined";
    const index = createSloIndex(objective, events);
    expect(index.window(2000, 1000, coverage).bad).toBe(2);
    expect(index.info).toEqual({
      input: 5,
      eligible: 3,
      excluded: 1,
      unmatched: 1,
    });
  });
  it("handles 100% targets without NaN, false firing or an invented relative budget", () => {
    const objective = p();
    objective.targetPpm = 1000000;
    const good = createSloIndex(objective, [event("a", 2000)]).window(
      2000,
      1000,
      coverage,
    );
    expect(good).toMatchObject({
      target: "met",
      allowedBad: 0,
      remainingBad: 0,
      remainingPercent: null,
      burnRate: 0,
      infiniteBurn: false,
    });
    expect(sloBurnAtLeast(good, 1000000, 1)).toBe(false);
    const bad = createSloIndex(objective, [event("a", 2000, 500)]).window(
      2000,
      1000,
      coverage,
    );
    expect(bad).toMatchObject({
      target: "missed",
      remainingBad: -1,
      remainingPercent: null,
      burnRate: null,
      infiniteBurn: true,
    });
    expect(sloBurnAtLeast(bad, 1000000, 1000000000)).toBe(true);
  });
  it("compares large weighted burns exactly beyond floating cross-product precision", () => {
    const objective = p();
    objective.targetPpm = 999999;
    const data = Array.from({ length: 5000 }, (_, i) =>
      event(`e${i}`, 2000, i === 0 ? 500 : 200, 1000000),
    );
    const w = createSloIndex(objective, data).window(2000, 1000, coverage);
    expect(w.total).toBe(5000000000);
    expect(w.burnRate).toBe(200);
    expect(sloBurnAtLeast(w, 999999, 200000)).toBe(true);
    expect(sloBurnAtLeast(w, 999999, 200001)).toBe(false);
  });
  it("requires both burn windows and volume, then moves pending to firing at the sampled hold boundary", () => {
    const index = createSloIndex(p(), [event("bad", 1950, 500)]);
    let result = evaluateSloPoint(index, 2000, coverage);
    expect(result.point.rules[0]).toMatchObject({
      status: "pending",
      sinceMs: 2000,
    });
    result = evaluateSloPoint(index, 2099, coverage, result.holds);
    expect(result.point.rules[0].status).toBe("pending");
    result = evaluateSloPoint(index, 2100, coverage, result.holds);
    expect(result.point.rules[0].status).toBe("firing");
    result = evaluateSloPoint(index, 2500, coverage, result.holds);
    expect(result.point.rules[0]).toMatchObject({
      status: "no-data",
      sinceMs: null,
    });
    expect(result.holds.size).toBe(0);
    const limited = p();
    limited.rules[0].minShortUnits = 2;
    expect(
      evaluateSloPoint(
        createSloIndex(limited, [event("bad", 1950, 500)]),
        2000,
        coverage,
      ).point.rules[0].status,
    ).toBe("insufficient");
    const mixed = [
      event("old-good", 1100, 200, 99),
      event("recent-bad", 1950, 500),
    ];
    expect(
      evaluateSloPoint(createSloIndex(p(), mixed), 2000, coverage).point
        .rules[0].status,
    ).toBe("inactive");
  });
  it("resets holds on unknown coverage and keeps objective-window coverage distinct from alert windows", () => {
    const objective = p();
    objective.rules[0].longMs = 500;
    objective.rules[0].shortMs = 250;
    const index = createSloIndex(objective, [event("bad", 1950, 500)]),
      first = evaluateSloPoint(index, 2000, coverage);
    expect(
      evaluateSloPoint(index, 2050, null, first.holds).point.rules[0].status,
    ).toBe("unknown");
    const partial = evaluateSloPoint(index, 2000, { fromMs: 1500, toMs: 3000 });
    expect(partial.point.window.target).toBe("unknown");
    expect(partial.point.rules[0].status).toBe("pending");
  });
  it("matches an independent scan oracle across seeded window endpoints and input order", () => {
    let seed = 43;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const events = Array.from({ length: 300 }, (_, i) =>
      event(
        `e${i}`,
        1000 + (rand() % 2000),
        rand() % 3 === 0 ? 503 : 200,
        (rand() % 20) + 1,
      ),
    );
    const index = createSloIndex(p(), [...events].reverse());
    for (let now = 1500; now <= 3500; now += 37) {
      const selected = events.filter(
          (e) => e.atMs > now - 1000 && e.atMs <= now,
        ),
        total = selected.reduce((n, e) => n + e.weight, 0),
        bad = selected
          .filter((e) => e.status === 503)
          .reduce((n, e) => n + e.weight, 0);
      expect(index.window(now, 1000, coverage)).toMatchObject({
        total,
        bad,
        events: selected.length,
      });
    }
  });
  it("snapshots definitions and events and rejects invalid clocks/duplicate fixture IDs", () => {
    const objective = p(),
      e = event("one", 2000),
      index = createSloIndex(objective, [e]);
    objective.targetPpm = 1000000;
    e.status = 500;
    expect(index.window(2000, 1000, coverage).bad).toBe(0);
    expect(() => index.window(NaN, 1000, coverage)).toThrow("clock");
    expect(() =>
      createSloIndex(p(), [event("same", 2000), event("same", 2001)]),
    ).toThrow("duplicate");
  });
});
describe("bounded sampled SLO monitor", () => {
  it("keeps source/snapshot copies private, deduplicates retries and rejects late data atomically", () => {
    const monitor = createSloMonitor(p(), { assumeCompleteFromMs: 0 }),
      e = event("one", 2000, 500);
    expect(monitor.record(e)).toBe(true);
    e.status = 200;
    expect(monitor.record(event("one", 2000, 500))).toBe(false);
    const point = monitor.evaluate(2000);
    expect(point.window.bad).toBe(1);
    point.window.bad = 99;
    expect(monitor.snapshot().point!.window.bad).toBe(1);
    const before = monitor.snapshot();
    expect(() => monitor.record(event("one", 2000, 200))).toThrow("duplicate");
    expect(() => monitor.record(event("late", 1900))).toThrow("late");
    expect(() => monitor.evaluate(1999)).toThrow("clock");
    expect(monitor.snapshot()).toEqual(before);
  });
  it("evicts only samples outside every window and drops coverage on reset", () => {
    const monitor = createSloMonitor(p(), { assumeCompleteFromMs: 0 });
    monitor.record(event("old", 1000));
    monitor.record(event("current", 2000));
    monitor.evaluate(2000);
    expect(monitor.snapshot()).toMatchObject({ retained: 1, evicted: 1 });
    monitor.reset();
    expect(monitor.snapshot()).toMatchObject({
      retained: 0,
      evicted: 0,
      lastMs: null,
      point: null,
    });
    monitor.record(event("new", 3000));
    expect(monitor.evaluate(3000).window.target).toBe("unknown");
  });
  it("refuses full retention without evicting live samples", () => {
    const monitor = createSloMonitor(p());
    for (let i = 0; i < 5000; i++) monitor.record(event(`e${i}`, 2000));
    expect(() => monitor.record(event("overflow", 2001))).toThrow("limit");
    expect(monitor.snapshot().retained).toBe(5000);
  });
});
