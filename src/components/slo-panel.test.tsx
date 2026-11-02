import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SloPanel } from "./slo-panel";
import { setAppLanguage } from "./i18n-provider";
import { sloTranslations } from "@/lib/slo-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  emptySloProject,
  MAX_SLO_PROJECT,
  type SloProject,
} from "@/lib/slo-project";
import { demoSloProject } from "@/lib/slo-studio";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = sloTranslations.en;
type Key = keyof typeof en;
const field = (k: Key) => screen.getByLabelText(en[k]),
  button = (k: Key) => screen.getByRole("button", { name: en[k] }),
  click = (k: Key) => fireEvent.click(button(k)),
  change = (k: Key, value: string) =>
    fireEvent.change(field(k), { target: { value } }),
  exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function exportedProject() {
  click("slo.export");
  return JSON.parse(exported()) as SloProject;
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["slo.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 7000 },
  );
}
async function job(k: Key) {
  click(k);
  await idle();
}
async function setup(demo = false, getSchemaText?: () => string) {
  const view = render(<SloPanel getSchemaText={getSchemaText} />);
  fireEvent.click(screen.getByText(en["slo.title"], { selector: "summary" }));
  await screen.findByLabelText(en["slo.name"]);
  if (demo) click("slo.demo");
  return view;
}
function upload(
  source: string,
  kind: Key = "slo.import",
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "traffic.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(kind), { target: { files: [file] } });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("API SLO and error-budget studio", () => {
  it("runs eighteen offline regressions, inspects chart points and exports value-free reports", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("slo.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "18/18 expectations passed; 18 comparisons",
    );
    expect(
      within(
        screen.getByRole("table", { name: en["slo.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(19);
    expect(
      screen.getByRole("img", { name: en["slo.chart"] }),
    ).toBeInTheDocument();
    change("slo.result", "availability/recovery");
    const timeline = within(
        screen.getByRole("group", { name: en["slo.alertTimeline"] }),
      ),
      cells = timeline.getAllByRole("button");
    fireEvent.click(cells[20]);
    expect(field("slo.point")).toHaveValue("20");
    expect(cells[20]).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(cells[20], { key: "ArrowRight" });
    expect(field("slo.point")).toHaveValue("21");
    expect(cells[21]).toHaveFocus();
    fireEvent.change(field("slo.point"), { target: { value: "60" } });
    expect(field("slo.targetStatus")).toHaveValue(en["slo.target.met"]);
    const incidents = within(
      screen.getByRole("table", { name: en["slo.incidents"] }),
    );
    fireEvent.click(incidents.getByRole("button"));
    expect(Number((field("slo.point") as HTMLInputElement).value)).toBeLessThan(
      60,
    );
    click("slo.report");
    expect(JSON.parse(exported()).runs[0].points).toBeUndefined();
    fireEvent.click(field("slo.details"));
    click("slo.report");
    expect(JSON.parse(exported()).runs[0].points).toHaveLength(61);
    expect(exported()).not.toMatch(
      /\/orders|"service"|"route"|"method"|event-1/,
    );
    click("slo.csv");
    expect(exported()).toContain('"availability","recovery"');
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![1]).toBe(
      "slo-csv.csv",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("keeps unknown telemetry distinct from observed-only outcomes and empty traffic", async () => {
    await setup(true);
    await job("slo.runAll");
    change("slo.result", "availability/unknown");
    expect(field("slo.targetStatus")).toHaveValue(en["slo.target.unknown"]);
    expect(field("slo.confidence")).toHaveValue(en["slo.confidence.unknown"]);
    change("slo.result", "capture-only/unknown");
    expect(field("slo.targetStatus")).toHaveValue(en["slo.target.missed"]);
    expect(field("slo.confidence")).toHaveValue(en["slo.confidence.unknown"]);
    change("slo.result", "availability/sparse");
    expect(field("slo.targetStatus")).toHaveValue(en["slo.target.no-data"]);
    expect(field("slo.sli")).toHaveValue("—");
    change("slo.search", "maintenance");
    expect(
      within(
        screen.getByRole("table", { name: en["slo.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(4);
    fireEvent.keyDown(field("slo.search"), { key: "Escape" });
    expect(field("slo.search")).toHaveValue("");
  });
  it("validates drafts atomically and guards selection, run and export until saved or discarded", async () => {
    await setup(true);
    const initial = exportedProject();
    change("slo.target", "100.0001");
    click("slo.runAll");
    expect(screen.getByRole("alert")).toHaveTextContent(en["slo.pending"]);
    const calls = vi.mocked(downloadTextFile).mock.calls.length;
    click("slo.export");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(calls);
    change("slo.objective", "latency");
    expect(field("slo.objective")).toHaveValue("availability");
    click("slo.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["slo.error.project"],
    );
    click("slo.discard");
    expect(exportedProject()).toEqual(initial);
    for (const [key, value] of [
      ["slo.rules", "[{}]"],
      ["slo.coverage", '{"fromMs":5,"toMs":1}'],
      ["slo.step", "0"],
      ["slo.events", "{"],
      ["slo.statuses", "[]"],
    ] as [Key, string][]) {
      change(key, value);
      click("slo.save");
      expect(screen.getByRole("alert")).toBeInTheDocument();
      click("slo.discard");
      expect(exportedProject()).toEqual(initial);
    }
    change("slo.target", "99.9999");
    click("slo.save");
    expect(exportedProject().objectives[0].targetPpm).toBe(999999);
  });
  it("clones and removes definitions with independent expectations and preserves empty case libraries", async () => {
    await setup(true);
    click("slo.cloneObjective");
    const cloned = exportedProject();
    expect(cloned.objectives).toHaveLength(4);
    expect(cloned.scenarios[0].expect[cloned.objectives[3].id]).toEqual(
      cloned.scenarios[0].expect.availability,
    );
    click("slo.deleteObjective");
    expect(exportedProject()).toEqual(demoSloProject());
    click("slo.cloneScenario");
    expect(exportedProject().scenarios).toHaveLength(7);
    change("slo.scenarioName", "Independent clone");
    click("slo.save");
    expect(exportedProject().scenarios[0].name).not.toBe("Independent clone");
    click("slo.new");
    click("slo.deleteScenario");
    expect(exportedProject().scenarios).toEqual([]);
    expect(button("slo.runAll")).toBeDisabled();
    expect(screen.getByText(en["slo.noScenarios"])).toBeInTheDocument();
    click("slo.addScenario");
    expect(exportedProject().scenarios).toHaveLength(1);
    await job("slo.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0/0 expectations passed; 1 comparisons",
    );
    click("slo.record");
    await job("slo.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1/1 expectations passed",
    );
  });
  it("appends deterministic generated traffic without altering existing cases and rejects invalid generator values", async () => {
    await setup(true);
    const initial = exportedProject();
    fireEvent.click(
      screen.getByText(en["slo.generator"], { selector: "summary" }),
    );
    click("slo.generate");
    const generated = exportedProject();
    expect(generated.scenarios.slice(0, 6)).toEqual(initial.scenarios);
    expect(generated.scenarios[6].events).toHaveLength(180);
    expect(
      generated.scenarios[6].events.filter((e) => e.status === 503),
    ).toHaveLength(30);
    expect(generated.scenarios[6].coverage).not.toBeNull();
    change("slo.generatorSettings", "null");
    click("slo.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(en["slo.error.event"]);
    expect(exportedProject()).toEqual(generated);
  });
  it("imports HAR completion metrics privately with unknown coverage, preserving existing traffic", async () => {
    await setup();
    const before = exportedProject();
    const entry = {
      startedDateTime: "2026-11-02T00:00:00Z",
      time: 12.5,
      request: {
        method: "get",
        url: "https://user:secret@private.test/orders?token=secret",
        headers: [{ name: "Authorization", value: "secret" }],
      },
      response: { status: 201, content: { text: "secret" } },
    };
    upload(JSON.stringify({ log: { entries: [entry, {}] } }), "slo.har");
    await idle();
    expect(screen.getByRole("status")).toHaveTextContent("1");
    const p = exportedProject();
    expect(p.scenarios[0]).toEqual(before.scenarios[0]);
    expect(p.scenarios[1].coverage).toBeNull();
    expect(p.scenarios[1].events[0].atMs).toBe(
      Date.parse(entry.startedDateTime) + 13,
    );
    expect(JSON.stringify(p)).not.toMatch(/secret|private.test|Authorization/);
  });
  it("imports NDJSON atomically, rejects oversized files before reading and drops injected project runtime", async () => {
    await setup();
    const before = exportedProject(),
      event = demoSloProject().scenarios[0].events[0];
    upload(JSON.stringify(event), "slo.ndjson");
    await idle();
    const imported = exportedProject();
    expect(imported.scenarios).toHaveLength(2);
    expect(imported.scenarios[1].coverage).toBeNull();
    upload(`${JSON.stringify(event)}\n{`, "slo.ndjson");
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent(en["slo.error.json"]);
    expect(exportedProject()).toEqual(imported);
    const text = vi.fn(async () => "{}");
    upload("{}", "slo.import", text, MAX_SLO_PROJECT + 1);
    await idle();
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["slo.error.limit"]);
    upload(
      JSON.stringify({ ...before, results: ["secret"], runtime: { hold: 1 } }),
    );
    await idle();
    expect(exportedProject()).toEqual(before);
  });
  it("cancels runs and delayed imports without replacing prior completed results", async () => {
    await setup(true);
    await job("slo.runAll");
    click("slo.runAll");
    click("slo.cancel");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByRole("status")).toHaveTextContent(en["slo.cancelled"]);
    expect(
      screen.getByRole("table", { name: en["slo.results"] }),
    ).toBeInTheDocument();
    let resolve!: (s: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", "slo.import", () => pending);
    click("slo.cancel");
    await act(async () => {
      resolve(JSON.stringify(emptySloProject()));
      await pending;
    });
    expect(exportedProject()).toEqual(demoSloProject());
    expect(
      screen.getByRole("table", { name: en["slo.results"] }),
    ).toBeInTheDocument();
  });
  it("ignores late file completion after unmount", async () => {
    const view = await setup();
    let resolve!: (s: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", "slo.import", () => pending);
    view.unmount();
    await act(async () => {
      resolve(JSON.stringify(demoSloProject()));
      await pending;
    });
    expect(vi.mocked(downloadTextFile)).not.toHaveBeenCalled();
  });
  it("reads OpenAPI route suggestions without changing scopes and handles invalid contracts", async () => {
    let source = DEFAULT_OPENAPI_SCHEMA;
    const getter = vi.fn(() => source);
    await setup(false, getter);
    const initial = exportedProject();
    click("slo.catalog");
    expect(screen.getByRole("status")).toHaveTextContent(
      "OpenAPI route labels",
    );
    expect(
      document.querySelector('datalist option[value="/users/{id}"]'),
    ).toBeInTheDocument();
    expect(exportedProject()).toEqual(initial);
    source = "openapi: [";
    click("slo.catalog");
    expect(screen.getByRole("alert")).toHaveTextContent(en["slo.error.schema"]);
    expect(exportedProject()).toEqual(initial);
  });
  it("exports the selected objective toolkit and alert rules and reports blocked downloads", async () => {
    await setup(true);
    change("slo.objective", "latency");
    click("slo.toolkit");
    expect(exported()).toContain('"id":"latency"');
    expect(exported()).not.toContain('"events":');
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![1]).toBe(
      "slo-toolkit.mjs",
    );
    click("slo.prometheus");
    expect(exported()).toContain('slo_id="latency"');
    expect(exported()).toContain("rsswag_slo_coverage_start_seconds");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("slo.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["slo.error.download"],
    );
  });
  it("localizes the complete workflow and results in Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    const ru = sloTranslations.ru;
    expect(
      screen.getByText(ru["slo.title"], { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ru["slo.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["slo.runAll"] }));
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: ru["slo.cancel"] }),
        ).not.toBeInTheDocument(),
      { timeout: 7000 },
    );
    expect(screen.getByRole("status")).toHaveTextContent("18/18");
    expect(screen.getByLabelText(ru["slo.confidence"])).toHaveValue(
      ru["slo.confidence.complete"],
    );
  });
});
