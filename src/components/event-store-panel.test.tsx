import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventStorePanel } from "./event-store-panel";
import { setAppLanguage } from "./i18n-provider";
import { eventStoreTranslations } from "@/lib/event-store-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  emptyEventProject,
  MAX_EVENT_PROJECT,
  MAX_EVENT_LOG,
  type EventStoreProject,
} from "@/lib/event-store-model";
import { demoEventStoreProject } from "@/lib/event-store-studio";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = eventStoreTranslations.en;
type Key = keyof typeof en;
const field = (k: Key) => screen.getByLabelText(en[k]),
  button = (k: Key) => screen.getByRole("button", { name: en[k] }),
  click = (k: Key) => fireEvent.click(button(k)),
  change = (k: Key, value: string) =>
    fireEvent.change(field(k), { target: { value } }),
  exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function exportedProject() {
  click("eventStore.export");
  return JSON.parse(exported()) as EventStoreProject;
}
function exportedLog() {
  click("eventStore.exportLog");
  return JSON.parse(exported());
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["eventStore.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 8000 },
  );
}
async function job(k: Key) {
  click(k);
  await idle();
}
async function setup(demo = false) {
  const view = render(<EventStorePanel />);
  fireEvent.click(
    screen.getByText(en["eventStore.title"], { selector: "summary" }),
  );
  await screen.findByLabelText(en["eventStore.name"]);
  if (demo) click("eventStore.demo");
  return view;
}
function upload(
  source: string,
  log = false,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "events.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(log ? "eventStore.importLog" : "eventStore.import"), {
    target: { files: [file] },
  });
}
const events = () =>
    within(screen.getByRole("table", { name: en["eventStore.events"] })),
  rows = () =>
    within(screen.getByRole("table", { name: en["eventStore.rows"] }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("event-sourced API and projection studio", () => {
  it("runs ten offline regressions independently of the playground and exports value-free metrics", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    const initial = exportedProject();
    await job("eventStore.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "10/10 expectations passed; 10 scenarios",
    );
    expect(
      within(
        screen.getByRole("table", { name: en["eventStore.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(11);
    expect(events().getAllByRole("row")).toHaveLength(1);
    click("eventStore.report");
    expect(JSON.parse(exported()).runs[0].timeline).toBeUndefined();
    fireEvent.click(field("eventStore.details"));
    click("eventStore.report");
    expect(JSON.parse(exported()).runs[0].timeline).toHaveLength(3);
    expect(exported()).not.toMatch(
      /account-a|Ada|VIP|"payload"|"fields"|"key"|"batches":\[/,
    );
    click("eventStore.csv");
    expect(exported()).toContain('"happy"');
    expect(exportedProject()).toEqual(initial);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("rehearses stale writers, exact append retries and explicit read-model catch-up", async () => {
    await setup();
    click("eventStore.append");
    click("eventStore.append");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["eventStore.reason.duplicate"],
    );
    expect(events().getAllByRole("row")).toHaveLength(2);
    expect(rows().getAllByRole("row")).toHaveLength(1);
    change("eventStore.eventId", "event-2");
    click("eventStore.append");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.reason.revision"],
    );
    click("eventStore.currentRevision");
    expect(field("eventStore.expected")).toHaveValue("1");
    click("eventStore.append");
    click("eventStore.project");
    expect(rows().getAllByRole("row")).toHaveLength(2);
    expect(rows().getAllByRole("row")[1]).toHaveTextContent('"total":2');
    click("eventStore.project");
    expect(rows().getAllByRole("row")[1]).toHaveTextContent('"total":2');
  });
  it("validates whole append batches atomically and preserves raw legacy versions beside their upcast values", async () => {
    await setup();
    fireEvent.click(
      screen.getByText(en["eventStore.batch"], { selector: "summary" }),
    );
    change(
      "eventStore.batch",
      JSON.stringify([
        { id: "good", type: "Changed", version: 1, payload: { value: 1 } },
        { id: "bad", type: "Changed", version: 1, payload: { value: "wrong" } },
      ]),
    );
    click("eventStore.appendBatch");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.reason.contract"],
    );
    expect(events().getAllByRole("row")).toHaveLength(1);
    click("eventStore.demo");
    change("eventStore.scenario", "legacy");
    await job("eventStore.load");
    const raw = JSON.parse(
        (field("eventStore.raw") as HTMLTextAreaElement).value,
      ),
      up = JSON.parse(
        (field("eventStore.upcasted") as HTMLTextAreaElement).value,
      );
    expect(raw).toMatchObject({
      version: 1,
      payload: { account: "account-a", cents: 100 },
    });
    expect(raw.payload).not.toHaveProperty("deltaCents");
    expect(up).toMatchObject({
      version: 2,
      payload: { accountId: "account-a", deltaCents: 100, currency: "EUR" },
    });
    expect(exportedLog().batches[0].events[1].version).toBe(1);
  });
  it("shows projection failure, explicit skip recovery and the same failure after rebuild", async () => {
    await setup(true);
    change("eventStore.scenario", "poison");
    await job("eventStore.load");
    expect(button("eventStore.skip")).toBeEnabled();
    expect(rows().getAllByRole("row")[1]).toHaveTextContent('"balanceCents":0');
    expect(events().getAllByRole("row")).toHaveLength(4);
    click("eventStore.skip");
    click("eventStore.project");
    expect(rows().getAllByRole("row")[1]).toHaveTextContent(
      '"balanceCents":200',
    );
    expect(button("eventStore.skip")).toBeDisabled();
    click("eventStore.rebuild");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.reason.projection-error"],
    );
    expect(rows().getAllByRole("row")[1]).toHaveTextContent('"balanceCents":0');
    expect(button("eventStore.skip")).toBeEnabled();
    expect(events().getAllByRole("row")).toHaveLength(4);
    change("eventStore.selectedProjection", "totals");
    expect(rows().getAllByRole("row")[1]).toHaveTextContent('"deltaTotal":100');
  });
  it("previews and forks an event prefix without changing the original, then continues and records the branch", async () => {
    await setup(true);
    await job("eventStore.load");
    const original = exportedLog();
    change("eventStore.position", "2");
    await job("eventStore.preview");
    expect(screen.getByRole("status")).toHaveTextContent("position 2");
    expect(
      JSON.parse(
        screen.getByLabelText(en["eventStore.prefixDetails"]).textContent!,
      )[0].rows[0].fields.balanceCents,
    ).toBe(100);
    expect(exportedLog()).toEqual(original);
    click("eventStore.fork");
    const forked = exportedProject();
    expect(forked.scenarios).toHaveLength(11);
    expect(forked.scenarios.at(-1)!.baseLog!.batches[0].events).toHaveLength(2);
    expect(forked.scenarios.at(-1)!.expect).toBeNull();
    expect(exportedLog()).toEqual(original);
    await job("eventStore.load");
    expect(events().getAllByRole("row")).toHaveLength(3);
    change("eventStore.eventId", "branch-credit");
    change("eventStore.eventType", "BalanceChanged");
    change("eventStore.eventVersion", "2");
    change(
      "eventStore.payload",
      '{"accountId":"account-a","deltaCents":25,"currency":"EUR"}',
    );
    click("eventStore.currentRevision");
    click("eventStore.append");
    click("eventStore.project");
    expect(rows().getAllByRole("row")[1]).toHaveTextContent(
      '"balanceCents":125',
    );
    click("eventStore.record");
    expect(exportedProject().scenarios).toHaveLength(12);
    await job("eventStore.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1/1 expectations passed",
    );
    expect(exportedProject().scenarios[0]).toEqual(
      demoEventStoreProject().scenarios[0],
    );
  });
  it("imports verified log sources with empty projections and preserves the playground on invalid or oversized captures", async () => {
    await setup();
    click("eventStore.append");
    click("eventStore.project");
    const log = exportedLog();
    click("eventStore.reset");
    upload(
      JSON.stringify({ ...log, events: ["forged"], projections: ["forged"] }),
      true,
    );
    await idle();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 events; projections are empty",
    );
    expect(rows().getAllByRole("row")).toHaveLength(1);
    click("eventStore.project");
    expect(rows().getAllByRole("row")[1]).toHaveTextContent('"total":1');
    const before = exportedLog(),
      invalid = structuredClone(log);
    invalid.batches[0].expectedRevision = 2;
    upload(JSON.stringify(invalid), true);
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.error.log"],
    );
    expect(exportedLog()).toEqual(before);
    const text = vi.fn(async () => "{}");
    upload("{}", true, text, MAX_EVENT_LOG + 1);
    await idle();
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.error.limit"],
    );
  });
  it("validates source edits atomically and guards context, execution and export until save/discard", async () => {
    await setup(true);
    await job("eventStore.load");
    const original = exportedProject(),
      log = exportedLog();
    change("eventStore.capacity", "0");
    click("eventStore.runAll");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.pending"],
    );
    change("eventStore.scenario", "poison");
    expect(field("eventStore.scenario")).toHaveValue("happy");
    const calls = vi.mocked(downloadTextFile).mock.calls.length;
    click("eventStore.export");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(calls);
    click("eventStore.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.error.definition"],
    );
    click("eventStore.discard");
    expect(exportedProject()).toEqual(original);
    expect(exportedLog()).toEqual(log);
    for (const [key, value] of [
      ["eventStore.types", "[]"],
      ["eventStore.commands", "{"],
      ["eventStore.expect", '{"events":-1}'],
    ] as [Key, string][]) {
      change(key, value);
      click("eventStore.save");
      expect(screen.getByRole("alert")).toBeInTheDocument();
      click("eventStore.discard");
      expect(exportedProject()).toEqual(original);
    }
    change("eventStore.scenarioName", "Renamed scenario");
    click("eventStore.save");
    expect(exportedLog()).toEqual(log);
    change("eventStore.definitionName", "New interpretation");
    click("eventStore.save");
    expect(events().getAllByRole("row")).toHaveLength(1);
  });
  it("clones source cases independently, supports an empty library and records a new checked playground", async () => {
    await setup(true);
    click("eventStore.clone");
    change("eventStore.scenarioName", "Independent copy");
    click("eventStore.save");
    expect(exportedProject().scenarios[0].name).not.toBe("Independent copy");
    click("eventStore.delete");
    expect(exportedProject()).toEqual(demoEventStoreProject());
    click("eventStore.new");
    click("eventStore.delete");
    expect(exportedProject().scenarios).toEqual([]);
    expect(button("eventStore.runAll")).toBeDisabled();
    click("eventStore.add");
    await job("eventStore.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0/0 expectations passed",
    );
    click("eventStore.append");
    click("eventStore.project");
    click("eventStore.record");
    await job("eventStore.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1/1 expectations passed",
    );
    click("eventStore.clearExpectations");
    await job("eventStore.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0/0 expectations passed",
    );
  });
  it("filters events by stream/name, clears search with Escape and exports explicitly private read models", async () => {
    await setup(true);
    change("eventStore.scenario", "streams");
    await job("eventStore.load");
    const p = exportedProject();
    change("eventStore.filterStream", "account-b");
    expect(events().getAllByRole("row")).toHaveLength(3);
    change("eventStore.search", "credit");
    expect(events().getAllByRole("row")).toHaveLength(2);
    fireEvent.keyDown(field("eventStore.search"), { key: "Escape" });
    expect(events().getAllByRole("row")).toHaveLength(3);
    change("eventStore.filterStream", "");
    expect(events().getAllByRole("row")).toHaveLength(5);
    fireEvent.click(events().getByRole("button", { name: "2" }));
    expect(
      JSON.parse((field("eventStore.raw") as HTMLTextAreaElement).value).stream,
    ).toBe("account-b");
    change("eventStore.selectedRow", "1");
    fireEvent.click(
      screen.getByText(en["eventStore.rowDetails"], { selector: "summary" }),
    );
    expect(
      JSON.parse(
        screen.getByLabelText(en["eventStore.rowDetails"]).textContent!,
      ).fields.balanceCents,
    ).toBe(75);
    click("eventStore.viewExport");
    expect(exported()).toContain("Lin");
    expect(exportedProject()).toEqual(p);
  });
  it("inspects lag through timeline buttons, keyboard and slider without changing source or live state", async () => {
    await setup(true);
    await job("eventStore.runAll");
    const region = within(
        screen.getByRole("region", { name: en["eventStore.results"] }),
      ),
      chart = within(
        region.getByRole("group", { name: en["eventStore.timeline"] }),
      ),
      cells = chart.getAllByRole("button");
    fireEvent.click(cells[0]);
    expect(field("eventStore.point")).toHaveValue("0");
    expect(
      JSON.parse(
        screen.getByLabelText(en["eventStore.pointDetails"]).textContent!,
      ).summary.lag,
    ).toBe(8);
    fireEvent.keyDown(cells[0], { key: "ArrowRight" });
    expect(field("eventStore.point")).toHaveValue("1");
    expect(cells[1]).toHaveFocus();
    change("eventStore.point", "2");
    expect(
      JSON.parse(
        screen.getByLabelText(en["eventStore.pointDetails"]).textContent!,
      ).summary.lag,
    ).toBe(0);
    expect(events().getAllByRole("row")).toHaveLength(1);
    expect(exportedProject()).toEqual(demoEventStoreProject());
  });
  it("cancels runs and delayed file reads without replacing complete results or the source project", async () => {
    const view = await setup(true);
    await job("eventStore.runAll");
    click("eventStore.runAll");
    click("eventStore.cancel");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      en["eventStore.cancelled"],
    );
    expect(
      screen.getByRole("table", { name: en["eventStore.results"] }),
    ).toBeInTheDocument();
    let resolve!: (s: string) => void;
    const delayed = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", false, () => delayed);
    click("eventStore.cancel");
    await act(async () => {
      resolve(JSON.stringify(emptyEventProject()));
      await delayed;
    });
    expect(exportedProject()).toEqual(demoEventStoreProject());
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", false, () => pending);
    view.unmount();
    await act(async () => {
      resolve(JSON.stringify(emptyEventProject()));
      await pending;
    });
  });
  it("retains work on project import failures, strips derived results, and ignores oversized source before reading", async () => {
    await setup(true);
    const p = exportedProject();
    upload("{");
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.error.json"],
    );
    expect(exportedProject()).toEqual(p);
    const text = vi.fn(async () => "{}");
    upload("{}", false, text, MAX_EVENT_PROJECT + 1);
    await idle();
    expect(text).not.toHaveBeenCalled();
    upload(
      JSON.stringify({
        ...p,
        results: ["private"],
        runtime: { rows: ["private"] },
      }),
    );
    await idle();
    expect(exportedProject()).toEqual(p);
  });
  it("exports source-free SDK/OpenAPI artifacts and retains results when collapsed", async () => {
    await setup(true);
    await job("eventStore.runAll");
    click("eventStore.toolkit");
    expect(exported()).toContain("export function createEventStore");
    expect(exported()).not.toMatch(/account-a|Ada|VIP/);
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![1]).toBe(
      "event-store-toolkit.mjs",
    );
    click("eventStore.openapi");
    expect(
      JSON.parse(exported()).paths["/event-store/commands"].post,
    ).toBeDefined();
    const summary = screen.getByText(en["eventStore.title"], {
      selector: "summary",
    });
    fireEvent.click(summary);
    await waitFor(() =>
      expect(
        screen.queryByLabelText(en["eventStore.name"]),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(summary);
    await screen.findByLabelText(en["eventStore.name"]);
    expect(
      screen.getByRole("table", { name: en["eventStore.results"] }),
    ).toBeInTheDocument();
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("eventStore.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["eventStore.error.download"],
    );
  });
  it("localizes event sourcing, projection controls and regression results in Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    const ru = eventStoreTranslations.ru;
    expect(
      screen.getByText(ru["eventStore.title"], { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: ru["eventStore.demo"] }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: ru["eventStore.runAll"] }),
    );
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: ru["eventStore.cancel"] }),
        ).not.toBeInTheDocument(),
      { timeout: 8000 },
    );
    expect(screen.getByRole("status")).toHaveTextContent("10/10");
    expect(
      screen.getByRole("table", { name: ru["eventStore.results"] }),
    ).toBeInTheDocument();
  });
});
