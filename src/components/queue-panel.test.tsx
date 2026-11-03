import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueuePanel } from "./queue-panel";
import { setAppLanguage } from "./i18n-provider";
import { queueTranslations } from "@/lib/queue-translations";
import { downloadTextFile } from "@/lib/schema-download";
import { emptyQueueProject, type QueueProject } from "@/lib/queue-project";
import { demoQueueProject } from "@/lib/queue-studio";
import { MAX_QUEUE_PROJECT, newQueueInput } from "@/lib/queue-model";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = queueTranslations.en;
type Key = keyof typeof en;
const field = (k: Key) => screen.getByLabelText(en[k]),
  button = (k: Key) => screen.getByRole("button", { name: en[k] }),
  click = (k: Key) => fireEvent.click(button(k)),
  change = (k: Key, value: string) =>
    fireEvent.change(field(k), { target: { value } }),
  exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function exportedProject() {
  click("queue.export");
  return JSON.parse(exported()) as QueueProject;
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["queue.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 7000 },
  );
}
async function job(k: Key) {
  click(k);
  await idle();
}
async function setup(demo = false) {
  const view = render(<QueuePanel />);
  fireEvent.click(screen.getByText(en["queue.title"], { selector: "summary" }));
  await screen.findByLabelText(en["queue.name"]);
  if (demo) click("queue.demo");
  return view;
}
const rows = () =>
  within(screen.getByRole("table", { name: en["queue.jobs"] })).getAllByRole(
    "row",
  );
function upload(
  source: string,
  traffic = false,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "queue.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(traffic ? "queue.ndjson" : "queue.import"), {
    target: { files: [file] },
  });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("background-job queue and worker studio", () => {
  it("runs ten offline regressions independently of the playground and exports privacy-preserving reports", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("queue.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "10/10 expectations passed; 10 scenarios",
    );
    expect(
      within(
        screen.getByRole("table", { name: en["queue.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(11);
    expect(rows()).toHaveLength(1);
    expect(field("queue.receipt")).toHaveValue("");
    click("queue.report");
    expect(JSON.parse(exported()).runs[0].timeline).toBeUndefined();
    fireEvent.click(field("queue.details"));
    click("queue.report");
    expect(JSON.parse(exported()).runs[0].timeline.length).toBeGreaterThan(0);
    expect(exported()).not.toMatch(
      /send-email|account-a|worker-a|replay:|"payload"|"receipt"|"jobs"/,
    );
    click("queue.csv");
    expect(exported()).toContain('"success"');
    expect(exported()).not.toContain("send-email");
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("rehearses lost leases, stale acknowledgements, redelivery and worker ownership", async () => {
    await setup();
    click("queue.enqueue");
    click("queue.poll");
    expect(field("queue.receipt")).toHaveValue("session-1:1");
    click("queue.advance");
    click("queue.ack");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["queue.reason.stale"],
    );
    change("queue.advanceMs", "100");
    click("queue.advance");
    change("queue.worker", "worker-b");
    click("queue.poll");
    expect(field("queue.receipt")).toHaveValue("session-1:2");
    change("queue.worker", "worker-a");
    click("queue.ack");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["queue.reason.stale"],
    );
    click("queue.currentLease");
    click("queue.ack");
    expect(rows()[1]).toHaveTextContent(en["queue.status.done"]);
    expect(rows()[1]).toHaveTextContent("2 / 2");
  });
  it("moves poison jobs to dead letters and redrives without reviving old receipts", async () => {
    await setup();
    change("queue.attempts", "1");
    click("queue.save");
    click("queue.enqueue");
    click("queue.poll");
    const first = (field("queue.receipt") as HTMLInputElement).value;
    click("queue.nack");
    expect(rows()[1]).toHaveTextContent(en["queue.status.dead"]);
    expect(button("queue.redrive")).toBeEnabled();
    click("queue.redrive");
    click("queue.poll");
    expect(field("queue.receipt")).not.toHaveValue(first);
    change("queue.receipt", first);
    click("queue.ack");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["queue.reason.stale"],
    );
    click("queue.currentLease");
    click("queue.ack");
    expect(rows()[1]).toHaveTextContent(en["queue.status.done"]);
  });
  it("records a playground run with relative receipts, replays its expectation and fences resets", async () => {
    await setup();
    click("queue.enqueue");
    click("queue.poll");
    click("queue.ack");
    click("queue.record");
    const p = exportedProject(),
      s = p.scenarios.at(-1)!;
    expect(s.steps[2]).toMatchObject({ receipt: "replay:1" });
    expect(s.expect?.counts.done).toBe(1);
    await job("queue.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1/1 expectations passed",
    );
    expect(rows()[1]).toHaveTextContent(en["queue.status.done"]);
    click("queue.reset");
    click("queue.enqueue");
    click("queue.poll");
    expect(field("queue.receipt")).toHaveValue("session-2:1");
    change("queue.receipt", "session-1:1");
    click("queue.ack");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["queue.reason.stale"],
    );
    expect(exportedProject().scenarios).toEqual(p.scenarios);
  });
  it("validates source drafts atomically, guards context changes and preserves playground state on scenario edits", async () => {
    await setup(true);
    click("queue.enqueue");
    const initial = exportedProject();
    change("queue.visibility", "0");
    click("queue.runAll");
    expect(screen.getByRole("alert")).toHaveTextContent(en["queue.pending"]);
    change("queue.scenario", "poison");
    expect(field("queue.scenario")).toHaveValue("success");
    const calls = vi.mocked(downloadTextFile).mock.calls.length;
    click("queue.export");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(calls);
    click("queue.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["queue.error.definition"],
    );
    click("queue.discard");
    expect(exportedProject()).toEqual(initial);
    expect(rows()).toHaveLength(2);
    change("queue.steps", "{");
    click("queue.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["queue.error.json"]);
    click("queue.discard");
    change("queue.scenarioName", "Renamed only");
    click("queue.save");
    expect(rows()).toHaveLength(2);
    change("queue.order", "fifo");
    click("queue.save");
    expect(rows()).toHaveLength(1);
  });
  it("keeps duplicate/case edits independent, supports empty libraries and distinguishes unchecked runs", async () => {
    await setup(true);
    click("queue.clone");
    change("queue.scenarioName", "Independent copy");
    click("queue.save");
    expect(exportedProject().scenarios[0].name).not.toBe("Independent copy");
    click("queue.delete");
    expect(exportedProject()).toEqual(demoQueueProject());
    click("queue.new");
    click("queue.delete");
    expect(exportedProject().scenarios).toEqual([]);
    expect(button("queue.runAll")).toBeDisabled();
    expect(screen.getByText(en["queue.empty"])).toBeInTheDocument();
    click("queue.add");
    await job("queue.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0/0 expectations passed",
    );
    expect(
      within(
        screen.getByRole("table", { name: en["queue.results"] }),
      ).getByText(en["queue.unchecked"]),
    ).toBeInTheDocument();
  });
  it("imports NDJSON as an unchecked scenario without executing jobs and retains work on invalid/oversized files", async () => {
    await setup();
    click("queue.enqueue");
    const input = newQueueInput("imported");
    upload(JSON.stringify(input), true);
    await idle();
    const p = exportedProject();
    expect(p.scenarios).toHaveLength(2);
    expect(p.scenarios[1].steps).toEqual([{ type: "enqueue", job: input }]);
    expect(rows()).toHaveLength(2);
    upload(JSON.stringify(input) + "\n{", true);
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent(en["queue.error.json"]);
    expect(exportedProject()).toEqual(p);
    const text = vi.fn(async () => "{}");
    upload("{}", false, text, MAX_QUEUE_PROJECT + 1);
    await idle();
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["queue.error.limit"],
    );
    expect(exportedProject()).toEqual(p);
  });
  it("appends bounded generated traffic and enforces the scenario library limit", async () => {
    await setup(true);
    fireEvent.click(
      screen.getByText(en["queue.generator"], { selector: "summary" }),
    );
    click("queue.generate");
    const p = exportedProject();
    expect(p.scenarios).toHaveLength(11);
    expect(p.scenarios.slice(0, 10)).toEqual(demoQueueProject().scenarios);
    expect(p.scenarios[10].steps).toHaveLength(39);
    expect(rows()).toHaveLength(1);
    change("queue.generatorSettings", "null");
    click("queue.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(en["queue.error.step"]);
    expect(exportedProject()).toEqual(p);
    change(
      "queue.generatorSettings",
      '{"count":1,"spacingMs":0,"groupCount":0}',
    );
    click("queue.generate");
    expect(button("queue.generate")).toBeDisabled();
    expect(button("queue.add")).toBeDisabled();
  });
  it("cancels runs and late imports without replacing complete results and ignores unmounted file reads", async () => {
    const view = await setup(true);
    await job("queue.runAll");
    click("queue.runAll");
    click("queue.cancel");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    expect(screen.getByRole("status")).toHaveTextContent(en["queue.cancelled"]);
    expect(
      screen.getByRole("table", { name: en["queue.results"] }),
    ).toBeInTheDocument();
    let resolve!: (s: string) => void;
    const delayed = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", false, () => delayed);
    click("queue.cancel");
    await act(async () => {
      resolve(JSON.stringify(emptyQueueProject()));
      await delayed;
    });
    expect(exportedProject()).toEqual(demoQueueProject());
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    upload("{}", false, () => pending);
    view.unmount();
    await act(async () => {
      resolve(JSON.stringify(emptyQueueProject()));
      await pending;
    });
  });
  it("inspects timeline bars by mouse, keyboard and slider without altering source or live jobs", async () => {
    await setup(true);
    await job("queue.runAll");
    const chart = within(
        screen.getByRole("group", { name: en["queue.chart"] }),
      ),
      cells = chart.getAllByRole("button");
    fireEvent.click(cells[1]);
    expect(field("queue.point")).toHaveValue("1");
    fireEvent.keyDown(cells[1], { key: "ArrowRight" });
    expect(field("queue.point")).toHaveValue("2");
    expect(cells[2]).toHaveFocus();
    fireEvent.change(field("queue.point"), { target: { value: "4" } });
    expect(
      JSON.parse(screen.getByLabelText(en["queue.pointDetails"]).textContent!)
        .summary.done,
    ).toBe(2);
    expect(rows()).toHaveLength(1);
    expect(exportedProject()).toEqual(demoQueueProject());
  });
  it("filters jobs, clears search with Escape, rejects invalid payloads atomically and retains work when collapsed", async () => {
    await setup();
    change("queue.payload", "{");
    click("queue.enqueue");
    expect(screen.getByRole("alert")).toHaveTextContent(en["queue.error.json"]);
    expect(rows()).toHaveLength(1);
    change("queue.payload", '{"secret":"private-data"}');
    click("queue.enqueue");
    change("queue.jobId", "second");
    change("queue.jobName", "Second task");
    click("queue.enqueue");
    change("queue.search", "Second");
    expect(rows()).toHaveLength(2);
    fireEvent.keyDown(field("queue.search"), { key: "Escape" });
    expect(rows()).toHaveLength(3);
    click("queue.poll");
    click("queue.ack");
    change("queue.filter", "done");
    expect(rows()).toHaveLength(2);
    const summary = screen.getByText(en["queue.title"], {
      selector: "summary",
    });
    fireEvent.click(summary);
    await waitFor(() =>
      expect(screen.queryByLabelText(en["queue.name"])).not.toBeInTheDocument(),
    );
    fireEvent.click(summary);
    await screen.findByLabelText(en["queue.name"]);
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).toHaveTextContent(en["queue.status.done"]);
  });
  it("downloads policy-only runtime and OpenAPI exports and reports blocked browser downloads", async () => {
    await setup();
    click("queue.enqueue");
    click("queue.toolkit");
    expect(exported()).toContain("export function createQueue");
    expect(exported()).not.toContain("send-email");
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![1]).toBe(
      "queue-toolkit.mjs",
    );
    click("queue.openapi");
    expect(JSON.parse(exported()).paths["/queue/commands"].post).toBeDefined();
    expect(exported()).not.toContain("send-email");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("queue.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["queue.error.download"],
    );
  });
  it("localizes controls, scheduling explanations and regression outcomes in Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    const ru = queueTranslations.ru;
    expect(
      screen.getByText(ru["queue.title"], { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ru["queue.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["queue.runAll"] }));
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: ru["queue.cancel"] }),
        ).not.toBeInTheDocument(),
      { timeout: 7000 },
    );
    expect(screen.getByRole("status")).toHaveTextContent("10/10");
    expect(
      screen.getByRole("table", { name: ru["queue.results"] }),
    ).toBeInTheDocument();
  });
});
