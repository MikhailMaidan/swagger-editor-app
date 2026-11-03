import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlagPanel } from "./flag-panel";
import { setAppLanguage } from "./i18n-provider";
import { flagTranslations } from "@/lib/flag-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  emptyFlagProject,
  MAX_FLAG_PROJECT,
  type FlagProject,
  newFeatureFlag,
  type FlagJson,
} from "@/lib/flag-model";
import { demoFlagProject } from "@/lib/flag-studio";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = flagTranslations.en;
type Key = keyof typeof en;
const field = (k: Key) => screen.getByLabelText(en[k]),
  button = (k: Key) => screen.getByRole("button", { name: en[k] }),
  click = (k: Key) => fireEvent.click(button(k)),
  change = (k: Key, value: string) =>
    fireEvent.change(field(k), { target: { value } }),
  exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function exportedProject() {
  click("flag.export");
  return JSON.parse(exported()) as FlagProject;
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["flag.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 8000 },
  );
}
async function job(k: Key) {
  click(k);
  await idle();
}
async function setup(demo = false) {
  const view = render(<FlagPanel />);
  fireEvent.click(screen.getByText(en["flag.title"], { selector: "summary" }));
  await screen.findByLabelText(en["flag.name"]);
  if (demo) click("flag.demo");
  return view;
}
function upload(
  source: string,
  traffic = false,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "flags.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(traffic ? "flag.ndjson" : "flag.import"), {
    target: { files: [file] },
  });
}
const table = () =>
  within(screen.getByRole("table", { name: en["flag.results"] }));
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("feature flags and progressive-rollout studio", () => {
  it("keeps valid dense candidate definitions editable when pretty formatting exceeds the project source limit", async () => {
    await setup();
    let value: FlagJson = Array(470).fill(0);
    for (let i = 0; i < 10; i++) value = [value];
    const p = emptyFlagProject();
    p.candidate = {
      salt: "dense",
      segments: [],
      flags: Array.from({ length: 16 }, (_, i) => ({
        ...newFeatureFlag(`dense-${i}`),
        kind: "json",
        offValue: null,
        variants: Array.from({ length: 8 }, (_, j) => ({
          id: `variant-${j}`,
          name: `Variant ${j}`,
          weightPpm: j === 0 ? 1000000 : 0,
          value,
        })),
      })),
    };
    expect(JSON.stringify(p.candidate, null, 2).length).toBeGreaterThan(
      MAX_FLAG_PROJECT,
    );
    upload(JSON.stringify(p));
    await idle();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    change("flag.name", "Dense candidate saved");
    click("flag.save");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const exported = exportedProject();
    expect(exported.name).toBe("Dense candidate saved");
    expect(exported.candidate!.flags).toHaveLength(16);
    expect(exported.candidate!.flags[0].variants[0].value).toEqual(value);
  });
  it("runs thirty-two offline regressions, exports compact value-free reports and preserves source", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    const initial = exportedProject();
    await job("flag.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "32/32 expectations passed; 32 decisions",
    );
    expect(table().getAllByRole("row")).toHaveLength(33);
    expect(field("flag.value")).toHaveValue("true");
    click("flag.report");
    expect(JSON.parse(exported()).selectedTrace).toBeNull();
    fireEvent.click(field("flag.includeTrace"));
    click("flag.report");
    expect(JSON.parse(exported()).selectedTrace.flagId).toBe("foundation");
    expect(exported()).not.toMatch(
      /"attributes"|"key"|"value"|enterprise-2|"rate"/,
    );
    click("flag.csv");
    expect(exported()).toContain('"staff","foundation"');
    expect(exportedProject()).toEqual(initial);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects ordered-rule/prerequisite decisions and records an inspected expectation", async () => {
    await setup(true);
    await job("flag.runAll");
    fireEvent.click(
      table().getByRole("button", { name: "staff / Checkout gradual rollout" }),
    );
    await idle();
    expect(field("flag.reason")).toHaveValue(en["flag.reason.rule"]);
    expect(field("flag.served")).toHaveValue("true");
    expect(field("flag.variant")).toHaveValue("on");
    fireEvent.click(
      screen.getByText(en["flag.trace"], { selector: "summary" }),
    );
    expect(
      JSON.parse(screen.getByLabelText(en["flag.trace"]).textContent!).rules[0]
        .status,
    ).toBe("matched");
    click("flag.record");
    expect(screen.getByRole("status")).toHaveTextContent(en["flag.recorded"]);
    expect(
      screen.queryByRole("table", { name: en["flag.results"] }),
    ).not.toBeInTheDocument();
    await job("flag.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("32/32");
    fireEvent.click(
      table().getByRole("button", {
        name: "blocked / Checkout gradual rollout",
      }),
    );
    await idle();
    expect(field("flag.reason")).toHaveValue(en["flag.reason.prerequisite"]);
    expect(field("flag.served")).toHaveValue("false");
  });
  it("analyzes stable cohorts and inspects subject/stage cells using keyboard and explicit evaluation", async () => {
    await setup(true);
    change("flag.selected", "theme");
    const settings = { ...demoFlagProject().planner, count: 12 };
    change("flag.plannerSettings", JSON.stringify(settings));
    click("flag.save");
    const initial = exportedProject();
    await job("flag.plan");
    expect(screen.getByRole("status")).toHaveTextContent(
      "12 subjects across 5 rollout stages",
    );
    const chart = within(
        screen.getByRole("group", { name: en["flag.cohortChart"] }),
      ),
      cells = chart.getAllByRole("button");
    expect(cells).toHaveLength(60);
    fireEvent.click(cells[50]);
    expect(field("flag.stage")).toHaveValue("4");
    expect(field("flag.subject")).toHaveValue("2");
    fireEvent.keyDown(cells[50], { key: "ArrowRight" });
    expect(field("flag.subject")).toHaveValue("3");
    expect(cells[51]).toHaveFocus();
    await job("flag.inspectCohort");
    expect(field("flag.served")).toHaveValue("true");
    expect(["classic", "fresh"]).toContain(
      (field("flag.variant") as HTMLInputElement).value,
    );
    expect(button("flag.record")).toBeDisabled();
    click("flag.planReport");
    const report = JSON.parse(exported());
    expect(
      report.stages.every(
        (s: { exited: number; reassigned: number }) =>
          s.exited === 0 && s.reassigned === 0,
      ),
    ).toBe(true);
    expect(exported()).not.toMatch(/"attributes"|"key"|"value"/);
    expect(exportedProject()).toEqual(initial);
  });
  it("compares baseline and candidate admission changes without leaking contexts or configured values", async () => {
    await setup(true);
    const initial = exportedProject();
    await job("flag.compare");
    expect(screen.getByRole("status")).toHaveTextContent(
      "8 contexts; 3 decisions changed",
    );
    expect(
      within(
        screen.getByRole("table", { name: en["flag.comparison"] }),
      ).getAllByRole("row"),
    ).toHaveLength(9);
    click("flag.compareReport");
    expect(
      JSON.parse(exported()).rows.filter(
        (r: { assignmentChanged: boolean }) => r.assignmentChanged,
      ),
    ).toHaveLength(3);
    expect(exported()).not.toMatch(/"attributes"|"key"|"value"|"rate"/);
    expect(exportedProject()).toEqual(initial);
    click("flag.copyCandidate");
    await job("flag.compare");
    expect(screen.getByRole("status")).toHaveTextContent("0 decisions changed");
    click("flag.clearCandidate");
    expect(button("flag.compare")).toBeDisabled();
    expect(exportedProject().candidate).toBeNull();
  });
  it("validates drafts atomically and guards selection/evaluation/export until saved or discarded", async () => {
    await setup(true);
    const initial = exportedProject();
    change("flag.percent", "100.0001");
    click("flag.runAll");
    expect(screen.getByRole("alert")).toHaveTextContent(en["flag.pending"]);
    change("flag.selected", "theme");
    expect(field("flag.selected")).toHaveValue("checkout");
    const calls = vi.mocked(downloadTextFile).mock.calls.length;
    click("flag.export");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(calls);
    click("flag.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["flag.error.definition"],
    );
    click("flag.discard");
    expect(exportedProject()).toEqual(initial);
    for (const [key, value] of [
      ["flag.attributes", "[]"],
      ["flag.variants", "[]"],
      ["flag.prerequisites", '[{"flagId":"checkout","variantId":"on"}]'],
      ["flag.offValue", '"wrong"'],
      ["flag.plannerSettings", '{"count":0}'],
      ["flag.candidate", "{"],
    ] as [Key, string][]) {
      change(key, value);
      click("flag.save");
      expect(screen.getByRole("alert")).toBeInTheDocument();
      click("flag.discard");
      expect(exportedProject()).toEqual(initial);
    }
    change("flag.percent", "99.9999");
    click("flag.save");
    expect(
      exportedProject().definition.flags.find((f) => f.id === "checkout")!
        .rolloutPpm,
    ).toBe(999999);
  });
  it("protects prerequisite flags from deletion and creates unchecked independent duplicate flags", async () => {
    await setup(true);
    change("flag.selected", "foundation");
    expect(button("flag.deleteFlag")).toBeDisabled();
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Select feature flag Checkout gradual rollout (checkout)",
      }),
      { key: "Enter" },
    );
    expect(field("flag.selected")).toHaveValue("checkout");
    click("flag.cloneFlag");
    const p = exportedProject();
    expect(p.definition.flags).toHaveLength(5);
    expect(p.cases.every((c) => !(p.definition.flags[4].id in c.expect))).toBe(
      true,
    );
    await job("flag.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "32/32 expectations passed; 40 decisions",
    );
    click("flag.deleteFlag");
    expect(exportedProject()).toEqual(demoFlagProject());
    change("flag.selected", "checkout");
    click("flag.clearExpectations");
    await job("flag.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "24/24 expectations passed; 32 decisions",
    );
  });
  it("clones contexts independently, supports an empty case library and distinguishes unchecked cases", async () => {
    await setup(true);
    click("flag.cloneCase");
    change("flag.caseName", "Independent context");
    click("flag.save");
    const p = exportedProject();
    expect(p.cases[0].name).toBe("staff");
    expect(p.cases.at(-1)!.context.key).toBe(p.cases[0].context.key);
    click("flag.deleteCase");
    expect(exportedProject()).toEqual(demoFlagProject());
    click("flag.new");
    click("flag.deleteCase");
    expect(exportedProject().cases).toEqual([]);
    expect(button("flag.runAll")).toBeDisabled();
    expect(screen.getByText(en["flag.noCases"])).toBeInTheDocument();
    click("flag.addCase");
    await job("flag.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0/0 expectations passed; 1 decisions",
    );
    expect(table().getByText(en["flag.unchecked"])).toBeInTheDocument();
  });
  it("imports NDJSON contexts atomically, preserves saved work and rejects oversized files before reading", async () => {
    await setup();
    const row = {
      id: "imported",
      name: "Imported context",
      key: "private-subject",
      attributes: { secret: "private-attribute" },
      nowMs: 2000,
    };
    upload(JSON.stringify(row), true);
    await idle();
    const p = exportedProject();
    expect(p.cases).toHaveLength(2);
    expect(p.cases[1].expect).toEqual({});
    expect(p.cases[1].context.key).toBe("private-subject");
    upload(JSON.stringify(row) + "\n{", true);
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent(en["flag.error.json"]);
    expect(exportedProject()).toEqual(p);
    const text = vi.fn(async () => "{}");
    upload("{}", false, text, MAX_FLAG_PROJECT + 1);
    await idle();
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["flag.error.limit"]);
    upload(
      JSON.stringify({
        ...p,
        results: ["private-result"],
        runtime: { rows: ["private-result"] },
      }),
    );
    await idle();
    expect(exportedProject()).toEqual(p);
  });
  it("generates unchecked cohort contexts, paginates decisions and keeps filters/search independent of source", async () => {
    await setup();
    change("flag.percent", "0");
    change(
      "flag.plannerSettings",
      JSON.stringify({ ...emptyFlagProject().planner, count: 60 }),
    );
    click("flag.save");
    click("flag.generate");
    const p = exportedProject();
    expect(p.cases).toHaveLength(61);
    await job("flag.runAll");
    expect(table().getAllByRole("row")).toHaveLength(51);
    click("flag.next");
    expect(table().getAllByRole("row")).toHaveLength(12);
    change("flag.filter", "served");
    expect(table().getAllByRole("row")).toHaveLength(1);
    change("flag.filter", "off");
    expect(table().getAllByRole("row")).toHaveLength(51);
    change("flag.search", "subject 60");
    expect(table().getAllByRole("row")).toHaveLength(2);
    fireEvent.keyDown(field("flag.search"), { key: "Escape" });
    expect(field("flag.search")).toHaveValue("");
    expect(exportedProject()).toEqual(p);
  });
  it("refuses an oversized generated library without losing existing cases", async () => {
    await setup();
    change(
      "flag.plannerSettings",
      JSON.stringify({ ...emptyFlagProject().planner, count: 200 }),
    );
    click("flag.save");
    const p = exportedProject();
    click("flag.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(en["flag.error.limit"]);
    expect(exportedProject()).toEqual(p);
  });
  it("cancels asynchronous work and late imports without replacing prior complete results", async () => {
    const view = await setup(true);
    await job("flag.runAll");
    click("flag.runAll");
    click("flag.cancel");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    expect(screen.getByRole("status")).toHaveTextContent(en["flag.cancelled"]);
    expect(table().getAllByRole("row")).toHaveLength(33);
    let resolve!: (s: string) => void;
    const delayed = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", false, () => delayed);
    click("flag.cancel");
    await act(async () => {
      resolve(JSON.stringify(emptyFlagProject()));
      await delayed;
    });
    expect(exportedProject()).toEqual(demoFlagProject());
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", false, () => pending);
    view.unmount();
    await act(async () => {
      resolve(JSON.stringify(emptyFlagProject()));
      await pending;
    });
  });
  it("retains results when collapsed and exports the standalone SDK with no context fixtures", async () => {
    await setup(true);
    await job("flag.runAll");
    click("flag.toolkit");
    expect(exported()).toContain("export function createFlagClient");
    expect(exported()).not.toMatch(/enterprise-2|staff-1|case-1/);
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![1]).toBe(
      "flags-toolkit.mjs",
    );
    const summary = screen.getByText(en["flag.title"], { selector: "summary" });
    fireEvent.click(summary);
    await waitFor(() =>
      expect(screen.queryByLabelText(en["flag.name"])).not.toBeInTheDocument(),
    );
    fireEvent.click(summary);
    await screen.findByLabelText(en["flag.name"]);
    expect(table().getAllByRole("row")).toHaveLength(33);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("flag.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["flag.error.download"],
    );
  });
  it("localizes targeting, cohort controls and regression outcomes in Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    const ru = flagTranslations.ru;
    expect(
      screen.getByText(ru["flag.title"], { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ru["flag.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["flag.runAll"] }));
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: ru["flag.cancel"] }),
        ).not.toBeInTheDocument(),
      { timeout: 8000 },
    );
    expect(screen.getByRole("status")).toHaveTextContent("32/32");
    expect(
      screen.getByRole("table", { name: ru["flag.results"] }),
    ).toBeInTheDocument();
  });
});
