import { describe, expect, it, vi } from "vitest";
import {
  checkSyncMergeLaws,
  demoSyncProject,
  replaySyncSteps,
  runSyncScenarios,
  syncRunReport,
} from "./sync-studio";
import { createSyncLab, stepSyncLab, summarizeSyncLab } from "./sync-engine";
import {
  emptySyncProject,
  normalizeSyncProject,
  parseSyncProject,
  serializeSyncProject,
} from "./sync-project";
import { MAX_SYNC_PROJECT, type SyncStep } from "./sync-model";
describe("offline synchronization projects and regression scenarios", () => {
  it("passes nine independent demo expectations and exposes conflict/partition semantics", async () => {
    const p = demoSyncProject(),
      runs = await runSyncScenarios(p);
    expect(runs).toHaveLength(9);
    expect(runs.every((r) => r.checked && r.passed)).toBe(true);
    expect(runs.find((r) => r.scenarioId === "conflict")).toMatchObject({
      converged: true,
      conflicts: 3,
    });
    expect(runs.find((r) => r.scenarioId === "partition")).toMatchObject({
      converged: false,
    });
    expect(runs.find((r) => r.scenarioId === "healed")).toMatchObject({
      converged: true,
    });
    expect(runs.find((r) => r.scenarioId === "blocked")!.rejected).toBe(1);
    expect(runs.find((r) => r.scenarioId === "metadata")).toMatchObject({
      converged: false,
      viewsEqual: true,
    });
    expect(runs.every((r) => r.snapshot === null)).toBe(true);
    const selected = (await runSyncScenarios(p, "counter"))[0];
    expect(
      summarizeSyncLab(p.definition, selected.snapshot!).views.alpha.count,
    ).toEqual({ type: "counter", value: 6 });
  });
  it("retains selected snapshots, checks expectations and leaves unspecified cases unchecked", async () => {
    const p = demoSyncProject();
    p.scenarios[0].expect = null;
    expect((await runSyncScenarios(p, "counter"))[0]).toMatchObject({
      checked: false,
      passed: false,
    });
    p.scenarios[0].expect = {
      converged: false,
      maxConflicts: 0,
      maxRejected: 0,
    };
    expect((await runSyncScenarios(p, "counter"))[0].passed).toBe(false);
    const r = (await runSyncScenarios(p, "resolved"))[0];
    expect(
      summarizeSyncLab(p.definition, r.snapshot!).views.gamma.status,
    ).toMatchObject({ values: ["approved"] });
  });
  it("checks algebra and reports capacity as bounded instead of a passed law", async () => {
    const d = emptySyncProject().definition;
    let lab = createSyncLab(d);
    lab = stepSyncLab(d, lab, {
      type: "increment",
      actor: "alpha",
      field: "count",
      amount: 3,
    });
    expect(
      (await checkSyncMergeLaws(d, lab, ["alpha", "beta", "gamma"])).every(
        (c) => c.status === "passed",
      ),
    ).toBe(true);
    for (let i = 0; i < 40; i++) {
      lab = stepSyncLab(d, lab, {
        type: "add",
        actor: "alpha",
        field: "labels",
        value: `a${i}`,
      });
      lab = stepSyncLab(d, lab, {
        type: "add",
        actor: "beta",
        field: "labels",
        value: `b${i}`,
      });
    }
    const checks = await checkSyncMergeLaws(d, lab, ["alpha", "beta", "gamma"]);
    expect(checks[0].status).toBe("passed");
    expect(checks[1].status).toBe("bounded");
  });
  it("round trips complete playground recordings and ignores injected runtime or results", async () => {
    const p = demoSyncProject();
    p.playground = p.scenarios[4].steps;
    const restored = parseSyncProject(serializeSyncProject(p));
    expect(restored).toEqual(p);
    expect(
      parseSyncProject(
        JSON.stringify({
          ...p,
          results: ["secret"],
          runtime: { state: "injected" },
        }),
      ),
    ).toEqual(p);
    expect(await replaySyncSteps(p.definition, p.playground)).toEqual(
      await replaySyncSteps(restored.definition, restored.playground),
    );
  });
  it("refuses invalid definitions, step types, actor references, sparse arrays and project limits", () => {
    const p = emptySyncProject();
    for (const modify of [
      (v: typeof p) => {
        v.definition.actors = [];
      },
      (v) => {
        v.definition.actors.push(v.definition.actors[0]);
      },
      (v) => {
        v.definition.links.push(v.definition.links[0]);
      },
      (v) => {
        v.playground = [
          { type: "increment", actor: "missing", field: "count", amount: 1 },
        ];
      },
      (v) => {
        v.playground = [
          { type: "increment", actor: "alpha", field: "status", amount: 1 },
        ];
      },
      (v) => {
        v.playground = new Array(1);
      },
      (v) => {
        v.playground = Array(301).fill({ type: "round" });
      },
      (v) => {
        v.scenarios.push(v.scenarios[0]);
      },
    ] as ((v: typeof p) => void)[]) {
      const v = structuredClone(p);
      modify(v);
      expect(() => normalizeSyncProject(v)).toThrow();
    }
    expect(() => parseSyncProject(" ".repeat(MAX_SYNC_PROJECT + 1))).toThrow(
      "limit",
    );
    p.scenarios = [];
    expect(normalizeSyncProject(p).scenarios).toEqual([]);
  });
  it("snapshots runs and cancels replay, suite and law checks atomically", async () => {
    const p = demoSyncProject(),
      promise = runSyncScenarios(p, "counter");
    p.scenarios[0].steps = [];
    expect((await promise)[0].steps).toBe(4);
    let cancelled = false;
    await expect(
      runSyncScenarios(
        demoSyncProject(),
        undefined,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    cancelled = false;
    const steps = Array(30).fill({ type: "round" }) as SyncStep[];
    await expect(
      replaySyncSteps(
        p.definition,
        steps,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    await expect(
      checkSyncMergeLaws(
        p.definition,
        createSyncLab(p.definition),
        ["alpha", "beta", "gamma"],
        () => true,
      ),
    ).rejects.toThrow("cancelled");
  });
  it("does not use network or persistence and omits private values/identities from reports", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    try {
      const p = demoSyncProject(),
        runs = await runSyncScenarios(p, "resolved");
      for (const details of [false, true]) {
        const report = syncRunReport(runs, details),
          text = JSON.stringify(report);
        expect(text).not.toMatch(
          /approved|alpha|beta|gamma|"snapshot"|"fields"|"state"|"value"/,
        );
        expect(report.runs[0].journal !== undefined).toBe(details);
      }
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      storage.mockRestore();
    }
  });
});
