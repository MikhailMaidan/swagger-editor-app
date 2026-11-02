import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SyncPanel } from "./sync-panel";
import { setAppLanguage } from "./i18n-provider";
import { syncTranslations } from "@/lib/sync-translations";
import { downloadTextFile } from "@/lib/schema-download";
import { emptySyncProject } from "@/lib/sync-project";
import { MAX_SYNC_PROJECT } from "@/lib/sync-model";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = syncTranslations.en;
type Key = keyof typeof en;
const field = (k: Key) => screen.getByLabelText(en[k]),
  button = (k: Key) => screen.getByRole("button", { name: en[k] }),
  click = (k: Key) => fireEvent.click(button(k)),
  change = (k: Key, value: string) =>
    fireEvent.change(field(k), { target: { value } }),
  exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const exportedProject = () => {
  click("sync.export");
  return JSON.parse(exported()) as ReturnType<typeof emptySyncProject>;
};
const replica = (name: string, id: string) =>
  within(screen.getByRole("region", { name: `Replica ${name} (${id})` }));
async function job(k: Key) {
  click(k);
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["sync.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 7000 },
  );
}
async function setup(demo = false) {
  const view = render(<SyncPanel />);
  fireEvent.click(screen.getByText(en["sync.title"], { selector: "summary" }));
  await screen.findByLabelText(en["sync.name"]);
  if (demo) await job("sync.demo");
  return view;
}
function upload(
  source: string,
  wire = false,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "sync.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(wire ? "sync.wireImport" : "sync.import"), {
    target: { files: [file] },
  });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("local-first synchronization studio", () => {
  it("runs nine offline regressions, retains summary-only suites and exports reports without private state", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("sync.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("9/9");
    expect(
      within(
        screen.getByRole("table", { name: en["sync.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(10);
    expect(screen.getByText(en["sync.retention"])).toBeInTheDocument();
    click("sync.report");
    expect(JSON.parse(exported()).runs[0].journal).toBeUndefined();
    fireEvent.click(field("sync.details"));
    click("sync.report");
    expect(JSON.parse(exported()).runs[0].journal).toHaveLength(4);
    expect(exported()).not.toMatch(
      /"alpha"|"beta"|"fields"|"snapshot"|approved/,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("edits independent counter components and converges after a network round", async () => {
    await setup();
    change("sync.amount", "3");
    click("sync.apply");
    expect(
      replica("Laptop", "alpha").getByText("3", { selector: "pre" }),
    ).toBeInTheDocument();
    expect(
      replica("Phone", "beta").getByText("0", { selector: "pre" }),
    ).toBeInTheDocument();
    change("sync.actor", "beta");
    change("sync.amount", "5");
    click("sync.apply");
    click("sync.round");
    for (const [name, id] of [
      ["Laptop", "alpha"],
      ["Phone", "beta"],
      ["Server", "gamma"],
    ])
      expect(
        replica(name, id).getByText("8", { selector: "pre" }),
      ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: en["sync.topology"] }),
    ).toBeInTheDocument();
    const p = exportedProject();
    expect(p.playground.map((s) => s.type)).toEqual([
      "increment",
      "increment",
      "round",
    ]);
  });
  it("keeps concurrent register conflicts explicit and resolves them after observation", async () => {
    await setup();
    change("sync.field", "status");
    change("sync.value", '"draft"');
    click("sync.apply");
    change("sync.actor", "beta");
    change("sync.value", '"review"');
    click("sync.apply");
    click("sync.round");
    expect(screen.getAllByText(en["sync.conflict"])).toHaveLength(3);
    change("sync.actor", "gamma");
    change("sync.value", '"approved"');
    click("sync.apply");
    click("sync.round");
    expect(screen.queryByText(en["sync.conflict"])).not.toBeInTheDocument();
    expect(
      replica("Laptop", "alpha").getByText(/approved/),
    ).toBeInTheDocument();
    click("sync.report");
    expect(exported()).not.toContain("approved");
  });
  it("queues frozen snapshots, retains blocked delivery and supports duplication/drop", async () => {
    await setup();
    change("sync.amount", "2");
    click("sync.apply");
    click("sync.send");
    change("sync.amount", "3");
    click("sync.apply");
    click("sync.duplicate");
    const link = screen.getByLabelText("Enable Laptop → Phone");
    fireEvent.click(link);
    click("sync.deliver");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["sync.status.blocked"],
    );
    expect(field("sync.message")).toHaveValue("message-1");
    fireEvent.click(link);
    click("sync.deliver");
    expect(
      replica("Phone", "beta").getByText("2", { selector: "pre" }),
    ).toBeInTheDocument();
    click("sync.drop");
    expect(screen.getByText(en["sync.noMessages"])).toBeInTheDocument();
    expect(button("sync.deliver")).toBeDisabled();
    expect(
      replica("Laptop", "alpha").getByText("5", { selector: "pre" }),
    ).toBeInTheDocument();
  });
  it("records a playground scenario and replays its portable project without trusting injected runtime", async () => {
    await setup();
    change("sync.amount", "4");
    click("sync.apply");
    click("sync.round");
    change("sync.recordName", "Recorded counts");
    click("sync.record");
    await job("sync.run");
    expect(screen.getByRole("status")).toHaveTextContent("1/1");
    expect(screen.getByLabelText(en["sync.resultViews"])).toHaveTextContent(
      '"value": 4',
    );
    const p = exportedProject();
    click("sync.reset");
    expect(
      replica("Laptop", "alpha").getByText("0", { selector: "pre" }),
    ).toBeInTheDocument();
    upload(
      JSON.stringify({
        ...p,
        runtime: { state: "injected" },
        results: ["fake"],
      }),
    );
    await screen.findByText(en["sync.loaded"]);
    expect(
      replica("Laptop", "alpha").getByText("4", { selector: "pre" }),
    ).toBeInTheDocument();
    expect(exportedProject().playground).toHaveLength(2);
  });
  it("validates snapshot imports atomically and records legitimate merges", async () => {
    await setup();
    change("sync.amount", "7");
    click("sync.apply");
    click("sync.wireExport");
    const wire = exported();
    change("sync.actor", "beta");
    upload(wire, true);
    await screen.findByText(/Action result: Applied/);
    expect(
      replica("Phone", "beta").getByText("7", { selector: "pre" }),
    ).toBeInTheDocument();
    const bad = JSON.parse(wire);
    bad.schema = "foreign";
    upload(JSON.stringify(bad), true);
    await screen.findByRole("alert");
    expect(
      replica("Phone", "beta").getByText("7", { selector: "pre" }),
    ).toBeInTheDocument();
    expect(exportedProject().playground).toHaveLength(2);
  });
  it("preserves invalid definition/scenario drafts and blocks saved selections and actions", async () => {
    await setup(true);
    change("sync.actors", "[");
    click("sync.runAll");
    expect(screen.getByRole("alert")).toHaveTextContent(en["sync.pending"]);
    change("sync.scenario", "conflict");
    expect(field("sync.scenario")).toHaveValue("counter");
    await job("sync.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["sync.error.json"]);
    expect(field("sync.actors")).toHaveValue("[");
    click("sync.discard");
    change(
      "sync.steps",
      JSON.stringify([
        { type: "increment", actor: "missing", field: "count", amount: 1 },
      ]),
    );
    await job("sync.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["sync.error.step"]);
    click("sync.discard");
    expect(exportedProject().scenarios).toHaveLength(9);
  });
  it("checks selected merge laws and clears old proof results when inputs change", async () => {
    await setup();
    await job("sync.checkLaws");
    expect(screen.getAllByText(/Passed on these snapshots/)).toHaveLength(3);
    change("sync.lawB", "gamma");
    expect(
      screen.queryByText(/Passed on these snapshots/),
    ).not.toBeInTheDocument();
    await job("sync.checkLaws");
    click("sync.apply");
    expect(
      screen.queryByText(/Passed on these snapshots/),
    ).not.toBeInTheDocument();
    change("sync.search", "increment");
    expect(
      within(
        screen.getByRole("table", { name: en["sync.timeline"] }),
      ).getAllByRole("row"),
    ).toHaveLength(2);
    fireEvent.keyDown(field("sync.search"), { key: "Escape" });
    expect(field("sync.search")).toHaveValue("");
  });
  it("authors definitions and scenarios without deleting the playground recording or unrelated cases", async () => {
    await setup();
    click("sync.apply");
    const actors = emptySyncProject().definition.actors;
    actors[0].name = "Renamed laptop";
    change("sync.actors", JSON.stringify(actors));
    await job("sync.save");
    expect(
      replica("Renamed laptop", "alpha").getByText("1", { selector: "pre" }),
    ).toBeInTheDocument();
    click("sync.cloneScenario");
    expect(exportedProject().scenarios).toHaveLength(2);
    click("sync.deleteScenario");
    expect(exportedProject().scenarios).toHaveLength(1);
    click("sync.deleteScenario");
    expect(screen.getByText(en["sync.noScenarios"])).toBeInTheDocument();
    expect(button("sync.runAll")).toBeDisabled();
    click("sync.addScenario");
    expect(button("sync.run")).toBeEnabled();
    expect(exportedProject().playground).toHaveLength(1);
  });
  it("loads a retained scenario only by an explicit playground replacement action", async () => {
    await setup(true);
    change("sync.scenario", "resolved");
    await job("sync.run");
    expect(screen.getByLabelText(en["sync.resultViews"])).toHaveTextContent(
      "approved",
    );
    expect(
      replica("Laptop", "alpha").queryByText(/approved/),
    ).not.toBeInTheDocument();
    await job("sync.loadResult");
    expect(
      replica("Laptop", "alpha").getByText(/approved/),
    ).toBeInTheDocument();
    expect(exportedProject().scenarios).toHaveLength(9);
  });
  it("retains prior work on invalid/oversized imports and ignores cancelled or late file reads", async () => {
    const view = await setup(true);
    await job("sync.runAll");
    upload("{");
    await screen.findByRole("alert");
    expect(
      screen.getByRole("table", { name: en["sync.results"] }),
    ).toBeInTheDocument();
    const reader = vi.fn(async () => "{}");
    upload("{}", false, reader, MAX_SYNC_PROJECT + 1);
    await screen.findByText(en["sync.error.limit"]);
    expect(reader).not.toHaveBeenCalled();
    click("sync.runAll");
    click("sync.cancel");
    expect(screen.getByRole("status")).toHaveTextContent(en["sync.cancelled"]);
    let resolve!: (s: string) => void;
    upload(
      "{}",
      false,
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    click("sync.cancel");
    await act(async () => resolve(JSON.stringify(emptySyncProject())));
    expect(field("sync.name")).toHaveValue(
      "Offline clients and convergent API state",
    );
    upload(
      "{}",
      false,
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    view.unmount();
    await act(async () => resolve(JSON.stringify(emptySyncProject())));
  });
  it("exports payload-free code and OpenAPI, recovers downloads and localizes Russian regressions", async () => {
    const view = await setup(true);
    click("sync.toolkit");
    expect(exported()).toContain("synchronizeReplica");
    expect(exported()).not.toContain("approved");
    click("sync.openapi");
    expect(JSON.parse(exported()).openapi).toBe("3.1.0");
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    click("sync.toolkit");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["sync.error.download"],
    );
    click("sync.toolkit");
    expect(screen.getByRole("status")).toHaveTextContent(en["sync.downloaded"]);
    view.unmount();
    act(() => setAppLanguage("ru"));
    const ru = syncTranslations.ru;
    render(<SyncPanel />);
    fireEvent.click(
      screen.getByText(ru["sync.title"], { selector: "summary" }),
    );
    await screen.findByLabelText(ru["sync.name"]);
    fireEvent.click(screen.getByRole("button", { name: ru["sync.demo"] }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: ru["sync.cancel"] }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: ru["sync.runAll"] }));
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: ru["sync.cancel"] }),
        ).not.toBeInTheDocument(),
      { timeout: 7000 },
    );
    expect(screen.getByRole("status")).toHaveTextContent("9/9");
    expect(
      screen.getByRole("table", { name: ru["sync.results"] }),
    ).toBeInTheDocument();
  });
});
