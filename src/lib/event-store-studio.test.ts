import { describe, expect, it, vi } from "vitest";
import {
  demoEventStoreProject,
  runEventStoreScenarios,
  eventStoreReport,
  eventStoreCsv,
  previewEventPrefix,
  forkEventScenario,
  parseEventLog,
  serializeEventLog,
  replayEventStore,
  eventStoreExpectation,
} from "./event-store-studio";
import {
  emptyEventProject,
  normalizeEventProject,
  parseEventProject,
  serializeEventProject,
  MAX_EVENT_PROJECT,
} from "./event-store-model";
describe("event-sourcing projects, read models and regression replay", () => {
  it("passes ten meaningful scenarios including concurrency, upcasting, failed projections and rebuilds", async () => {
    const p = demoEventStoreProject(),
      runs = await runEventStoreScenarios(p);
    expect(runs).toHaveLength(10);
    expect(runs.every((r) => r.checked && r.passed)).toBe(true);
    expect(
      runs
        .find((r) => r.scenarioId === "closed")!
        .snapshot.projections.find((p) => p.id === "balances")!.rows,
    ).toEqual([]);
    expect(runs.find((r) => r.scenarioId === "poison")!.summary).toMatchObject({
      events: 3,
      errors: 1,
      lag: 2,
    });
    expect(runs.find((r) => r.scenarioId === "skip")!.summary).toMatchObject({
      events: 3,
      errors: 0,
      lag: 0,
      skipped: 1,
    });
    expect(
      runs.find((r) => r.scenarioId === "legacy")!.snapshot.events[1].version,
    ).toBe(1);
  });
  it("detects incorrect read-model fields instead of treating completed execution as a passing regression", async () => {
    const p = demoEventStoreProject();
    p.scenarios[0].expect!.views[0].value = 999;
    const run = (await runEventStoreScenarios(p, "happy"))[0];
    expect(run.checked).toBe(true);
    expect(run.passed).toBe(false);
    expect(run.viewChecks[0]).toMatchObject({
      passed: false,
      reason: "different",
    });
  });
  it("round trips source-only projects and event logs without trusting injected derived state", async () => {
    const p = demoEventStoreProject();
    expect(parseEventProject(serializeEventProject(p))).toEqual(p);
    expect(
      parseEventProject(
        JSON.stringify({
          ...p,
          results: ["private"],
          runtime: { rows: ["private"] },
        }),
      ),
    ).toEqual(p);
    const replay = await replayEventStore(p.definition, p.scenarios[0]),
      log = replay.store.exportLog();
    expect(parseEventLog(serializeEventLog(log))).toEqual(log);
    expect(
      parseEventLog(
        JSON.stringify({ ...log, events: ["forged"], projections: ["forged"] }),
      ),
    ).toEqual(log);
    expect(() => parseEventProject(" ".repeat(MAX_EVENT_PROJECT + 1))).toThrow(
      "limit",
    );
    p.scenarios = [];
    expect(normalizeEventProject(p).scenarios).toEqual([]);
  });
  it("previews and forks prefixes without modifying the source store and can continue the branch", async () => {
    const p = demoEventStoreProject(),
      replay = await replayEventStore(p.definition, p.scenarios[0]),
      before = replay.store.snapshot(),
      preview = await previewEventPrefix(
        p.definition,
        replay.store.exportLog(),
        2,
      );
    expect(preview.snapshot.events).toHaveLength(2);
    expect(
      preview.snapshot.projections.find((p) => p.id === "balances")!.rows[0]
        .fields.balanceCents,
    ).toBe(100);
    const fork = forkEventScenario(
        p.definition,
        replay.store.exportLog(),
        2,
        "fork",
      ),
      branch = await replayEventStore(p.definition, fork);
    expect(branch.snapshot.events).toHaveLength(2);
    expect(replay.store.snapshot()).toEqual(before);
    expect(eventStoreExpectation(branch.snapshot)).toMatchObject({
      events: 2,
      streams: 1,
      maxErrors: 0,
      maxLag: 0,
    });
  });
  it("snapshots asynchronous runs, supports unchecked cases and cancels without publishing partial output", async () => {
    const p = demoEventStoreProject(),
      promise = runEventStoreScenarios(p);
    p.scenarios = [];
    expect(await promise).toHaveLength(10);
    let cancelled = false;
    await expect(
      runEventStoreScenarios(
        demoEventStoreProject(),
        undefined,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    expect(
      (await runEventStoreScenarios(emptyEventProject()))[0],
    ).toMatchObject({ checked: false, passed: false });
  });
  it("exports value-free reports and formula-safe CSV without network or persistent writes", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    try {
      const runs = await runEventStoreScenarios(demoEventStoreProject());
      for (const details of [false, true]) {
        const report = eventStoreReport(runs, details);
        expect(report.runs[0].timeline !== undefined).toBe(details);
        expect(JSON.stringify(report)).not.toMatch(
          /account-a|Ada|VIP|"payload"|"fields"|"key"|"batches":\[/,
        );
      }
      runs[0].scenarioId = "-formula";
      expect(eventStoreCsv(runs[0])).toContain('"\'-formula"');
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      storage.mockRestore();
    }
  });
});
