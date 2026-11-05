import { describe, expect, it, vi } from "vitest";
import {
  demoSloProject,
  generateSloTraffic,
  importSloHar,
  importSloNdjson,
  runSloMatrix,
  sloRunReport,
  sloTimelineCsv,
  sloTimelineTimes,
} from "./slo-studio";
import {
  MAX_SLO_PROJECT,
  emptySloProject,
  normalizeSloProject,
  parseSloProject,
  serializeSloProject,
  sloPercentToPpm,
} from "./slo-project";
describe("SLO traffic, portable projects and regression replay", () => {
  it("passes eighteen demo expectations with real burn incidents and separate telemetry confidence", async () => {
    const rows = await runSloMatrix(demoSloProject());
    expect(rows).toHaveLength(18);
    expect(rows.every((r) => r.checked && r.passed)).toBe(true);
    const find = (s: string, o = "availability") =>
      rows.find((r) => r.scenarioId === s && r.objectiveId === o)!;
    expect(find("recovery").firingPoints).toBeGreaterThan(0);
    expect(find("recovery").incidents).toHaveLength(1);
    expect(find("recovery").incidents[0].toMs).not.toBeNull();
    expect(find("ongoing").incidents[0].toMs).toBeNull();
    expect(find("unknown").target).toBe("unknown");
    expect(find("unknown", "capture-only").target).toBe("missed");
    expect(find("maintenance").info.excluded).toBe(31);
    expect(find("sparse").target).toBe("no-data");
  });
  it("includes an unaligned final point without exceeding its timeline bound", () => {
    expect(sloTimelineTimes({ fromMs: 100, toMs: 111, stepMs: 5 })).toEqual([
      100, 105, 110, 111,
    ]);
    expect(() =>
      sloTimelineTimes({ fromMs: 100, toMs: 200, stepMs: 0 }),
    ).toThrow("limit");
    expect(() => sloTimelineTimes({ fromMs: 0, toMs: 240, stepMs: 1 })).toThrow(
      "limit",
    );
  });
  it("snapshots asynchronous runs, cancels without partial publication and distinguishes unchecked cases", async () => {
    const p = demoSloProject(),
      promise = runSloMatrix(p, "healthy");
    p.scenarios[0].events = [];
    expect((await promise)[0].points.at(-1)!.window.total).toBeGreaterThan(0);
    let cancelled = false;
    await expect(
      runSloMatrix(
        demoSloProject(),
        undefined,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    const blank = emptySloProject();
    expect((await runSloMatrix(blank))[0]).toMatchObject({
      checked: false,
      passed: false,
      target: "no-data",
    });
  });
  it("round trips source definitions while discarding injected results/runtime", () => {
    const p = demoSloProject();
    expect(parseSloProject(serializeSloProject(p))).toEqual(p);
    expect(
      parseSloProject(
        JSON.stringify({
          ...p,
          results: ["secret"],
          runtime: { point: "private" },
        }),
      ),
    ).toEqual(p);
    expect(() => parseSloProject(" ".repeat(MAX_SLO_PROJECT + 1))).toThrow(
      "limit",
    );
  });
  it("rejects malformed objective/rule/timeline/expectation references and preserves an empty scenario library", () => {
    const base = emptySloProject();
    for (const modify of [
      (p: typeof base) => {
        p.objectives = [];
      },
      (p) => {
        p.objectives[0].targetPpm = 0;
      },
      (p) => {
        p.objectives[0].rules[0].shortMs = p.objectives[0].rules[0].longMs + 1;
      },
      (p) => {
        p.scenarios[0].timeline.stepMs = 0;
      },
      (p) => {
        p.scenarios[0].expect = {
          missing: { target: "met", maxFiringPoints: 0, maxIncidents: 0 },
        };
      },
      (p) => {
        p.scenarios = new Array(1);
      },
      (p) => {
        p.scenarios.push(p.scenarios[0]);
      },
    ] as ((p: typeof base) => void)[]) {
      const p = structuredClone(base);
      modify(p);
      expect(() => normalizeSloProject(p)).toThrow();
    }
    base.scenarios = [];
    expect(normalizeSloProject(base).scenarios).toEqual([]);
  });
  it("converts percent targets using exact decimal syntax", () => {
    expect(sloPercentToPpm("99.9")).toBe(999000);
    expect(sloPercentToPpm("100.0000")).toBe(1000000);
    expect(sloPercentToPpm("0.0001")).toBe(1);
    for (const s of ["100.0001", "99.99999", "NaN", "0", "1e2"])
      expect(() => sloPercentToPpm(s)).toThrow();
  });
  it("generates deterministic complete traffic with a bounded failure interval", () => {
    const options = {
        count: 20,
        startMs: 100000,
        spacingMs: 1000,
        badFrom: 5,
        badCount: 4,
        goodLatencyMs: 10,
        badLatencyMs: 500,
        badStatus: 503,
        service: "test",
        route: "/items",
        method: "GET",
        weight: 3,
      },
      s = generateSloTraffic(options);
    expect(s.events.filter((e) => e.status === 503)).toHaveLength(4);
    expect(s.coverage).toEqual({ fromMs: 100000, toMs: 119000 });
    expect(s).toEqual(generateSloTraffic(options));
    expect(() => generateSloTraffic(null as unknown as typeof options)).toThrow(
      "event",
    );
    expect(() => generateSloTraffic({ ...options, badCount: 20 })).toThrow(
      "event",
    );
  });
  it("imports only HAR completion metrics, discards credentials/queries/bodies and never asserts capture coverage", () => {
    const entry = {
      startedDateTime: "2026-11-02T00:00:00.000Z",
      time: 1.5,
      request: {
        method: "get",
        url: "https://user:secret@private.test/items?token=secret",
        headers: [{ name: "Authorization", value: "secret" }],
      },
      response: { status: 503, content: { text: "secret" } },
    };
    const result = importSloHar(
      JSON.stringify({ log: { entries: [entry, {}] } }),
    );
    expect(result.skipped).toBe(1);
    for (const startedDateTime of [
      "2026-02-30T00:00:00Z",
      "2026-11-02T24:00:00Z",
      "2026-11-02T00:60:00Z",
      "not-a-date",
    ]) {
      expect(() =>
        importSloHar(
          JSON.stringify({ log: { entries: [{ ...entry, startedDateTime }] } }),
        ),
      ).toThrow("har");
    }
    expect(result.scenario.coverage).toBeNull();
    expect(result.scenario.events[0]).toMatchObject({
      route: "/items",
      method: "GET",
      status: 503,
      latencyMs: 1.5,
      atMs: Date.parse(entry.startedDateTime) + 2,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret|private\.test|Authorization/,
    );
    expect(() => importSloHar("{}")).toThrow("har");
  });
  it("imports NDJSON atomically with duplicate/size checks", () => {
    const s = generateSloTraffic({
        count: 2,
        startMs: 100000,
        spacingMs: 1000,
        badFrom: 0,
        badCount: 0,
        goodLatencyMs: 10,
        badLatencyMs: 100,
        badStatus: 503,
        service: "a",
        route: "/",
        method: "GET",
        weight: 1,
      }),
      source = s.events.map((e) => JSON.stringify(e)).join("\n");
    expect(importSloNdjson(source).events).toEqual(s.events);
    expect(importSloNdjson(source).coverage).toBeNull();
    expect(() => importSloNdjson(source + "\n{")).toThrow("json");
    expect(() =>
      importSloNdjson(source + "\n" + JSON.stringify(s.events[0])),
    ).toThrow("duplicate");
  });
  it("exports value-free metrics and spreadsheet-safe timeline CSV without network or storage writes", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    try {
      const runs = await runSloMatrix(demoSloProject(), "ongoing");
      for (const details of [false, true]) {
        const report = sloRunReport(runs, details),
          source = JSON.stringify(report);
        expect(source).not.toMatch(
          /\/orders|"service"|"route"|"method"|event-1|Completion/,
        );
        expect(report.runs[0].points !== undefined).toBe(details);
      }
      runs[0].objectiveId = "-formula";
      expect(sloTimelineCsv(runs[0])).toContain('"\'-formula"');
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      storage.mockRestore();
    }
  });
  it("keeps negative numbers numeric in the timeline CSV once the budget is overspent", async () => {
    const [run] = await runSloMatrix(demoSloProject(), "ongoing");
    run.points[0].window.remainingBad = -25;
    run.points[0].window.remainingPercent = -12.5;
    run.objectiveId = "=formula";
    const firstRow = sloTimelineCsv(run).split("\r\n")[1];
    expect(firstRow).toContain('"-25"');
    expect(firstRow).toContain('"-12.5"');
    expect(firstRow).not.toContain("'-");
    // String cells are still guarded against formula injection.
    expect(firstRow).toContain('"\'=formula"');
  });
});
