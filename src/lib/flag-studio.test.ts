import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  demoFlagProject,
  runFlagCases,
  planFlagRollout,
  compareFlagDefinitions,
  flagRunReport,
  flagRunsCsv,
  importFlagNdjson,
} from "./flag-studio";
import {
  emptyFlagProject,
  parseFlagProject,
  serializeFlagProject,
  normalizeFlagProject,
  flagPercentToPpm,
  MAX_FLAG_PROJECT,
} from "./flag-model";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("rollout regression cases, cohort planning and configuration comparisons", () => {
  it("passes thirty-two independently specified targeting/schedule/type expectations", async () => {
    const rows = await runFlagCases(demoFlagProject());
    expect(rows).toHaveLength(32);
    expect(rows.every((r) => r.checked && r.passed)).toBe(true);
    expect(
      rows.find((r) => r.caseId === "enterprise" && r.flagId === "checkout")!
        .outcome.reason,
    ).toBe("allocated");
    expect(
      rows.find((r) => r.caseId === "staff" && r.flagId === "theme")!.outcome
        .variantId,
    ).toBe("fresh");
  });
  it("grows percentage-only cohorts monotonically without reassigning existing variants", async () => {
    const p = demoFlagProject(),
      plan = await planFlagRollout(
        p.definition,
        { ...p.planner, count: 120 },
        "theme",
      );
    expect(plan.stages[0].served).toBe(0);
    expect(plan.stages.at(-1)!.served).toBe(120);
    expect(plan.stages.every((s) => s.exited === 0 && s.reassigned === 0)).toBe(
      true,
    );
    expect(plan.stages.reduce((n, s) => n + s.entered, 0)).toBe(120);
    for (const s of plan.stages)
      expect(s.counts.reduce((n, c) => n + c.count, 0)).toBe(120);
    expect(plan).toEqual(
      await planFlagRollout(
        p.definition,
        { ...p.planner, count: 120 },
        "theme",
      ),
    );
  });
  it("makes targeted rules and prerequisite/schedule gates visible even at zero/full planner percentages", async () => {
    const p = demoFlagProject();
    const staff = await planFlagRollout(
      p.definition,
      { ...p.planner, count: 5, attributes: { staff: true } },
      "checkout",
    );
    expect(staff.stages.every((s) => s.served === 5)).toBe(true);
    const stopped = await planFlagRollout(
      p.definition,
      { ...p.planner, count: 5, nowMs: 10000 },
      "checkout",
    );
    expect(stopped.stages.every((s) => s.served === 0)).toBe(true);
  });
  it("compares admission, assignments, values and reasons without retaining private values", async () => {
    const p = demoFlagProject(),
      rows = await compareFlagDefinitions(
        p.definition,
        p.candidate!,
        p.cases,
        "checkout",
      );
    expect(rows.some((r) => r.assignmentChanged)).toBe(true);
    const candidate = structuredClone(p.definition);
    candidate.flags[0].variants[0].value = false;
    const values = await compareFlagDefinitions(
      p.definition,
      candidate,
      p.cases,
      "foundation",
    );
    expect(values.some((r) => r.valueChanged && !r.assignmentChanged)).toBe(
      true,
    );
    expect(JSON.stringify(values)).not.toMatch(/"value":|"attributes"|"key"/);
  });
  it("snapshots asynchronous runs and cancels each operation without partial publication", async () => {
    const p = demoFlagProject(),
      promise = runFlagCases(p);
    p.cases = [];
    expect(await promise).toHaveLength(32);
    let cancelled = false;
    await expect(
      runFlagCases(
        demoFlagProject(),
        undefined,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    const d = demoFlagProject();
    await expect(
      planFlagRollout(d.definition, d.planner, "theme", () => true),
    ).rejects.toThrow("cancelled");
    await expect(
      compareFlagDefinitions(
        d.definition,
        d.candidate!,
        d.cases,
        "checkout",
        () => true,
      ),
    ).rejects.toThrow("cancelled");
    expect((await runFlagCases(emptyFlagProject()))[0].checked).toBe(false);
  });
  it("round trips source-only projects, preserves empty libraries and rejects invalid planner/expectation bounds", () => {
    const p = demoFlagProject();
    expect(parseFlagProject(serializeFlagProject(p))).toEqual(p);
    expect(
      parseFlagProject(
        JSON.stringify({
          ...p,
          results: ["private"],
          runtime: { keys: ["secret"] },
        }),
      ),
    ).toEqual(p);
    expect(() => parseFlagProject(" ".repeat(MAX_FLAG_PROJECT + 1))).toThrow(
      "limit",
    );
    p.cases = [];
    expect(normalizeFlagProject(p).cases).toEqual([]);
    for (const stages of [[0, 0], [1000000, 0], [], [1000001]])
      expect(() =>
        normalizeFlagProject({ ...p, planner: { ...p.planner, stages } }),
      ).toThrow();
  });
  it("imports context NDJSON atomically, rejects duplicate IDs and parses exact percent syntax", () => {
    const row = {
      id: "one",
      name: "One",
      key: "subject",
      attributes: { plan: "pro" },
      nowMs: 2000,
    };
    expect(importFlagNdjson(JSON.stringify(row))[0]).toEqual({
      id: row.id,
      name: row.name,
      context: { key: row.key, attributes: row.attributes, nowMs: row.nowMs },
      expect: {},
    });
    expect(() => importFlagNdjson(JSON.stringify(row) + "\n{")).toThrow("json");
    expect(() =>
      importFlagNdjson([row, row].map((v) => JSON.stringify(v)).join("\n")),
    ).toThrow("context");
    expect(() => importFlagNdjson("")).toThrow("context");
    expect(flagPercentToPpm("99.9999")).toBe(999999);
    expect(flagPercentToPpm("0")).toBe(0);
    expect(flagPercentToPpm("100")).toBe(1000000);
    for (const value of ["100.0001", "1e2", "-1", ".5"])
      expect(() => flagPercentToPpm(value)).toThrow();
  });
  it("exports compact value-free metrics and spreadsheet-safe CSV without network/persistence", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    const rows = await runFlagCases(demoFlagProject()),
      report = flagRunReport(rows);
    expect(report.passed).toBe(32);
    expect(JSON.stringify(report)).not.toMatch(
      /"attributes"|"key"|"value"|enterprise-2|"rate"/,
    );
    rows[0].caseId = "-formula";
    expect(flagRunsCsv(rows)).toContain('"\'-formula"');
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
});
