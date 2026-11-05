import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SagaPanel } from "./saga-panel";
import { sagaTranslations } from "@/lib/saga-translations";
import { downloadTextFile } from "@/lib/schema-download";
import { demoSagaProject } from "@/lib/saga-studio";
import { MAX_SAGA_PROJECT, type SagaProject } from "@/lib/saga-model";
import { setAppLanguage } from "./i18n-provider";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = sagaTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]),
  button = (key: Key) => screen.getByRole("button", { name: en[key] }),
  click = (key: Key) => fireEvent.click(button(key)),
  change = (key: Key, value: string) =>
    fireEvent.change(field(key), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const exportedProject = () => {
  click("saga.export");
  return JSON.parse(exported()) as SagaProject;
};
const privateSnapshot = () => {
  click("saga.snapshot");
  return JSON.parse(exported());
};
async function setup(demo = false) {
  const view = render(<SagaPanel />);
  fireEvent.click(screen.getByText(en["saga.title"], { selector: "summary" }));
  await screen.findByRole("button", { name: en["saga.demo"] });
  if (demo) click("saga.demo");
  return view;
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["saga.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 8000 },
  );
}
async function job(key: Key) {
  click(key);
  await idle();
}
function upload(
  source: string,
  options: { text?: () => Promise<string>; size?: number } = {},
) {
  const file = new File([source], "saga.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    value: options.text ?? (async () => source),
  });
  if (options.size !== undefined)
    Object.defineProperty(file, "size", { value: options.size });
  fireEvent.change(field("saga.import"), { target: { files: [file] } });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("API saga and compensation studio", () => {
  it("runs nine local regressions independently of the playground and exports value-free reports", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    const initial = exportedProject();
    await job("saga.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "9/9 saga expectations passed.",
    );
    expect(privateSnapshot().status).toBe("ready");
    click("saga.report");
    expect(JSON.parse(exported()).runs).toHaveLength(9);
    expect(JSON.parse(exported()).runs[0].journal).toBeUndefined();
    fireEvent.click(field("saga.detailReport"));
    click("saga.report");
    expect(JSON.parse(exported()).runs[0].journal.length).toBeGreaterThan(1);
    expect(exported()).not.toMatch(
      /demo-customer|confirmed-payment|"input"|"output"\s*:/,
    );
    click("saga.csv");
    expect(exported()).toContain('"happy"');
    expect(exportedProject()).toEqual(initial);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("starts parallel steps, advances exact time, drains aborted calls and compensates them", async () => {
    await setup(true);
    click("saga.start");
    click("saga.next");
    expect(privateSnapshot().steps[1].forward).toBe("running");
    change("saga.to", "120");
    click("saga.advance");
    expect(privateSnapshot().clock).toBe(120);
    click("saga.abort");
    expect(privateSnapshot().status).toBe("draining");
    click("saga.run");
    const s = privateSnapshot();
    expect(s.status).toBe("rolled-back");
    expect(s.steps[3].forward).toBe("cancelled");
    expect(s.metrics.compensations).toBe(3);
    expect(
      screen.getByRole("img", { name: en["saga.graph"] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: en["saga.timeline"] }),
    ).toBeInTheDocument();
  });
  it("requires explicit reconciliation and confirmed output before undoing an uncertain forward write", async () => {
    await setup(true);
    change("saga.case", "timeout");
    click("saga.run");
    expect(privateSnapshot().status).toBe("blocked");
    expect(button("saga.committed")).toBeDisabled();
    change("saga.step", "payment");
    expect(button("saga.committed")).toBeEnabled();
    change("saga.confirmedOutput", "{");
    click("saga.committed");
    expect(screen.getByRole("alert")).toHaveTextContent("json");
    expect(privateSnapshot().status).toBe("blocked");
    change("saga.confirmedOutput", '{"id":"confirmed-test"}');
    click("saga.committed");
    click("saga.run");
    const s = privateSnapshot();
    expect(s.status).toBe("rolled-back");
    expect(s.steps[2].compensationInput).toEqual({ id: "confirmed-test" });
    expect(button("saga.committed")).toBeDisabled();
  });
  it("recovers failed and uncertain compensations through distinct manual controls", async () => {
    await setup(true);
    change("saga.case", "recovery");
    click("saga.run");
    change("saga.step", "payment");
    expect(privateSnapshot().status).toBe("attention");
    click("saga.retryUndo");
    click("saga.run");
    expect(privateSnapshot().status).toBe("rolled-back");
    change("saga.case", "unknown-undo");
    click("saga.run");
    change("saga.phase", "compensation");
    expect(button("saga.committed")).toBeEnabled();
    click("saga.committed");
    click("saga.run");
    expect(privateSnapshot().status).toBe("rolled-back");
  });
  it("records the playground as a replayable checked case and manages scenario copies", async () => {
    await setup();
    click("saga.run");
    const original = privateSnapshot();
    click("saga.record");
    const p = exportedProject();
    expect(p.scenarios).toHaveLength(2);
    expect(p.scenarios[1].expect).toMatchObject({
      status: "succeeded",
      outputs: [],
    });
    expect(privateSnapshot()).toEqual(original);
    await job("saga.runSelected");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1/1 saga expectations passed.",
    );
    click("saga.cloneCase");
    expect(exportedProject().scenarios).toHaveLength(3);
    click("saga.deleteCase");
    expect(exportedProject().scenarios).toHaveLength(2);
    click("saga.newCase");
    expect(exportedProject().scenarios.at(-1)!.expect).toBe(null);
  });
  it("preserves unstaged builder edits when reselecting the current step and resets them when switching steps", async () => {
    await setup(true);
    fireEvent.click(
      screen.getByText(en["saga.builder"], { selector: "summary" }),
    );
    change("saga.stepName", "Unstaged order name");
    change("saga.bindings", '{"customer":{"from":"literal","value":"draft"}}');
    const steps = within(screen.getByRole("group", { name: en["saga.steps"] }));
    fireEvent.click(steps.getByRole("button", { name: "order: Create order" }));
    expect(field("saga.stepName")).toHaveValue("Unstaged order name");
    expect(field("saga.bindings")).toHaveValue(
      '{"customer":{"from":"literal","value":"draft"}}',
    );
    expect(exportedProject().definition.steps[0].name).toBe("Create order");

    change("saga.step", "payment");
    expect(field("saga.stepName")).toHaveValue("Authorize payment");
    fireEvent.click(
      screen.getByText(en["saga.builder"], { selector: "summary" }),
    );
    change("saga.timeout", "777");
    fireEvent.click(
      steps.getByRole("button", { name: "payment: Authorize payment" }),
    );
    expect(field("saga.timeout")).toHaveValue("777");
    click("saga.stage");
    click("saga.save");
    expect(exportedProject().definition.steps[2].forward.timeoutMs).toBe(777);
  });
  it("stages builder edits atomically, aligns fixtures, clears stale checks, and protects pending source", async () => {
    await setup(true);
    fireEvent.click(
      screen.getByText(en["saga.builder"], { selector: "summary" }),
    );
    change("saga.stepName", "Updated order");
    click("saga.stage");
    expect(button("saga.run")).toBeDisabled();
    expect(button("saga.export")).toBeDisabled();
    click("saga.save");
    const p = exportedProject();
    expect(p.definition.steps[0].name).toBe("Updated order");
    expect(p.scenarios.every((s) => s.expect === null)).toBe(true);
    click("saga.addStep");
    click("saga.save");
    const withStep = exportedProject();
    expect(withStep.definition.steps).toHaveLength(5);
    expect(withStep.scenarios.every((s) => s.fixtures.length === 5)).toBe(true);
    change("saga.step", "step-1");
    click("saga.removeStep");
    click("saga.save");
    expect(exportedProject().definition.steps).toHaveLength(4);
  });
  it("rejects cycles and malformed source while retaining existing projects and results", async () => {
    await setup(true);
    const initial = exportedProject();
    change("saga.source", "{");
    click("saga.save");
    expect(screen.getByRole("alert")).toHaveTextContent("json");
    expect(button("saga.runAll")).toBeDisabled();
    click("saga.discard");
    expect(exportedProject()).toEqual(initial);
    change("saga.step", "order");
    fireEvent.click(
      screen.getByText(en["saga.builder"], { selector: "summary" }),
    );
    change("saga.dependencies", "ship");
    click("saga.stage");
    expect(screen.getByRole("alert")).toHaveTextContent("reference");
    expect(exportedProject()).toEqual(initial);
  });
  it("compares concurrency and deadlines without mutating the saved source or playground", async () => {
    await setup(true);
    const initial = exportedProject();
    fireEvent.click(
      screen.getByText(en["saga.compare"], { selector: "summary" }),
    );
    change("saga.deadline", "50");
    await job("saga.compareRun");
    const table = screen.getByRole("table", { name: en["saga.comparison"] });
    expect(within(table).getAllByRole("row")).toHaveLength(10);
    expect(table).toHaveTextContent("Needs reconciliation");
    expect(table).toHaveTextContent("command");
    expect(exportedProject()).toEqual(initial);
    expect(privateSnapshot().status).toBe("ready");
  });
  it("replays stored recovery commands, selects graph steps and inspects the value-free journal", async () => {
    await setup(true);
    change("saga.case", "recover");
    await job("saga.loadCase");
    expect(privateSnapshot().status).toBe("rolled-back");
    fireEvent.click(
      within(screen.getByRole("group", { name: en["saga.steps"] })).getByRole(
        "button",
        { name: "payment: Authorize payment" },
      ),
    );
    expect(field("saga.step")).toHaveValue("payment");
    fireEvent.click(
      screen.getByText(en["saga.journal"], { selector: "summary" }),
    );
    change("saga.point", "1");
    expect(JSON.parse(field("saga.pointDetails").textContent!).seq).toBe(1);
    expect(field("saga.pointDetails")).not.toHaveTextContent("demo-customer");
    click("saga.sdk");
    expect(exported()).toContain("createConfiguredSaga");
    click("saga.runner");
    expect(exported()).toContain("process.exitCode");
  });
  it("restores only source data, rejects oversized imports and reports failed downloads", async () => {
    await setup();
    const p = demoSagaProject();
    upload(JSON.stringify({ ...p, results: ["forged"] }));
    await idle();
    expect(exportedProject()).toEqual(p);
    upload("{}", { size: MAX_SAGA_PROJECT + 1 });
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent("limit");
    expect(exportedProject()).toEqual(p);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("saga.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["saga.downloadFailed"],
    );
  });
  it("cancels long suites and ignores late imports and unmount completions", async () => {
    await setup(true);
    click("saga.runAll");
    click("saga.cancel");
    expect(screen.getByRole("status")).toHaveTextContent(en["saga.cancelled"]);
    expect(button("saga.report")).toBeDisabled();
    let finish!: (value: string) => void;
    upload("{}", {
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    click("saga.cancel");
    await act(async () => finish(JSON.stringify(demoSagaProject())));
    expect(screen.getByRole("status")).toHaveTextContent(en["saga.cancelled"]);
  });
  it("localizes the new workflow and preserves tab-only execution in Russian", async () => {
    act(() => setAppLanguage("ru"));
    const ru = sagaTranslations.ru;
    render(<SagaPanel />);
    fireEvent.click(
      screen.getByText(ru["saga.title"], { selector: "summary" }),
    );
    await screen.findByRole("button", { name: ru["saga.demo"] });
    expect(screen.getByText(ru["saga.help"])).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: ru["saga.graph"] }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ru["saga.run"] })).toBeEnabled();
  });
});
