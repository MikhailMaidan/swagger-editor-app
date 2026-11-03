import { describe, expect, it, vi } from "vitest";
import {
  demoQueueProject,
  runQueueScenarios,
  queueRunReport,
  queueTimelineCsv,
  recordQueueScenario,
  importQueueNdjson,
  generateQueueScenario,
} from "./queue-studio";
import {
  emptyQueueProject,
  normalizeQueueProject,
  parseQueueProject,
  serializeQueueProject,
} from "./queue-project";
import { MAX_QUEUE_PROJECT, newQueueInput } from "./queue-model";
import { createJobQueue } from "./queue-engine";
describe("queue projects and regression replay", () => {
  it("imports NDJSON atomically and generates bounded deterministic enqueue traffic", () => {
    const job = newQueueInput(),
      source = JSON.stringify(job);
    expect(importQueueNdjson(source).steps).toEqual([{ type: "enqueue", job }]);
    expect(() => importQueueNdjson(source + "\n{")).toThrow("json");
    expect(() => importQueueNdjson(source + "\n" + source)).toThrow("step");
    expect(() => importQueueNdjson(" ".repeat(MAX_QUEUE_PROJECT + 1))).toThrow(
      "limit",
    );
    const settings = { count: 20, spacingMs: 100, groupCount: 3 };
    expect(generateQueueScenario(settings)).toEqual(
      generateQueueScenario(settings),
    );
    expect(generateQueueScenario(settings).steps).toHaveLength(39);
    expect(() => generateQueueScenario(null)).toThrow("step");
    expect(() =>
      generateQueueScenario({
        count: 100,
        spacingMs: 7776000000,
        groupCount: 0,
      }),
    ).toThrow("limit");
  });
  it("preserves intentionally stale foreign receipts when recording into a replay namespace", async () => {
    const p = emptyQueueProject(),
      q = createJobQueue(p.definition, "live"),
      steps = [
        { type: "enqueue" as const, job: newQueueInput() },
        { type: "poll" as const, worker: "worker", limit: 1 },
        {
          type: "ack" as const,
          job: "job-1",
          worker: "worker",
          receipt: "replay:1",
        },
      ];
    steps.forEach((s) => q.apply(s));
    p.scenarios = [
      recordQueueScenario(
        "stale",
        "Foreign stale receipt",
        steps,
        "live",
        q.snapshot(),
      ),
    ];
    expect(p.scenarios[0].steps[2]).toMatchObject({
      receipt: "foreign:replay:1",
    });
    const run = (await runQueueScenarios(p))[0];
    expect(run.passed).toBe(true);
    expect(run.summary.metrics.rejected).toBe(1);
    expect(run.summary.leased).toBe(1);
  });
  it("passes ten meaningful scenarios including recovery, poison jobs, groups and priority", async () => {
    const p = demoQueueProject(),
      runs = await runQueueScenarios(p);
    expect(runs).toHaveLength(10);
    expect(runs.every((r) => r.checked && r.passed)).toBe(true);
    expect(
      runs.find((r) => r.scenarioId === "recovery")!.summary.metrics.rejected,
    ).toBe(1);
    expect(
      runs.find((r) => r.scenarioId === "redrive")!.summary.metrics.redriven,
    ).toBe(1);
    p.definition.order = "fifo";
    expect((await runQueueScenarios(p, "priority"))[0].passed).toBe(false);
  });
  it("snapshots asynchronous input, supports empty/unchecked cases and cancels atomically", async () => {
    const p = demoQueueProject(),
      pending = runQueueScenarios(p);
    p.scenarios = [];
    expect(await pending).toHaveLength(10);
    let cancelled = false;
    await expect(
      runQueueScenarios(
        demoQueueProject(),
        undefined,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    expect((await runQueueScenarios(emptyQueueProject()))[0]).toMatchObject({
      checked: false,
      passed: false,
    });
  });
  it("round trips source-only projects and strips injected runtime/history/results", () => {
    const p = demoQueueProject();
    expect(parseQueueProject(serializeQueueProject(p))).toEqual(p);
    expect(
      parseQueueProject(
        JSON.stringify({ ...p, runtime: { payload: "private" }, results: [1] }),
      ),
    ).toEqual(p);
    expect(() => parseQueueProject(" ".repeat(MAX_QUEUE_PROJECT + 1))).toThrow(
      "limit",
    );
    p.scenarios = [];
    expect(normalizeQueueProject(p).scenarios).toEqual([]);
  });
  it("rejects malformed definitions, references, expectations, sparse arrays and duplicate IDs", () => {
    const base = emptyQueueProject();
    for (const change of [
      (p: typeof base) => {
        p.definition.maxBackoffMs = -1;
      },
      (p) => {
        p.definition.capacity = 101;
      },
      (p) => {
        p.scenarios[0].steps = [{ type: "advance", ms: -1 }];
      },
      (p) => {
        p.scenarios[0].expect = {
          counts: { done: 101 },
          maxRejected: 0,
          maxRetries: 0,
        };
      },
      (p) => {
        p.scenarios.push(p.scenarios[0]);
      },
      (p) => {
        p.scenarios = new Array(1);
      },
    ] as ((p: typeof base) => void)[]) {
      const p = structuredClone(base);
      change(p);
      expect(() => normalizeQueueProject(p)).toThrow();
    }
  });
  it("records receipts relative to an isolated replay instance while preserving intentionally stale tokens", async () => {
    const p = emptyQueueProject(),
      q = createJobQueue(p.definition, "live-7"),
      steps = [
        { type: "enqueue" as const, job: newQueueInput() },
        { type: "poll" as const, worker: "worker", limit: 1 },
        {
          type: "ack" as const,
          worker: "worker",
          job: "job-1",
          receipt: "live-7:1",
        },
      ];
    steps.forEach((s) => q.apply(s));
    p.scenarios = [
      recordQueueScenario("saved", "Saved run", steps, "live-7", q.snapshot()),
    ];
    expect(p.scenarios[0].steps[2]).toMatchObject({ receipt: "replay:1" });
    expect((await runQueueScenarios(p))[0].passed).toBe(true);
  });
  it("exports value-free summaries/timelines and formula-safe CSV without network or persistence", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    try {
      const runs = await runQueueScenarios(demoQueueProject());
      for (const details of [false, true]) {
        const report = queueRunReport(runs, details);
        expect(report.runs[0].timeline !== undefined).toBe(details);
        expect(JSON.stringify(report)).not.toMatch(
          /send-email|account-a|worker-a|replay:|"payload"|"receipt"|"jobs"/,
        );
      }
      runs[0].scenarioId = "-formula";
      expect(queueTimelineCsv(runs[0])).toContain('"\'-formula"');
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      storage.mockRestore();
    }
  });
});
