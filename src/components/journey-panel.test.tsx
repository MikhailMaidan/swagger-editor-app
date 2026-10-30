import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyPanel } from "./journey-panel";
import { setAppLanguage } from "./i18n-provider";
import { journeyTranslations } from "@/lib/journey-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_JOURNEY_BYTES,
  emptyJourneyProject,
  serializeJourneyProject,
} from "@/lib/journey-project";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = journeyTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]),
  button = (key: Key) => screen.getByRole("button", { name: en[key] }),
  click = (key: Key) => fireEvent.click(button(key)),
  change = (key: Key, value: string) =>
    fireEvent.change(field(key), { target: { value } }),
  value = (key: Key) => (field(key) as HTMLInputElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = false) {
  const view = render(
    <JourneyPanel getSchemaText={() => DEFAULT_OPENAPI_SCHEMA} />,
  );
  fireEvent.click(
    screen.getByText(en["journey.title"], { selector: "summary" }),
  );
  await screen.findByLabelText(en["journey.name"]);
  if (demo) click("journey.demo");
  return view;
}
async function job(
  key:
    | "journey.runAll"
    | "journey.runTrace"
    | "journey.compare"
    | "journey.generate",
) {
  click(key);
  await waitFor(
    () =>
      expect(
        screen.queryByText(en["journey.busy"], { exact: false }),
      ).not.toBeInTheDocument(),
    { timeout: 7000 },
  );
}
function file(
  source: string,
  har = false,
  text?: () => Promise<string>,
  size?: number,
) {
  const f = new File([source], "journey.json", { type: "application/json" });
  Object.defineProperty(f, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(f, "size", { value: size });
  fireEvent.change(field(har ? "journey.importHar" : "journey.import"), {
    target: { files: [f] },
  });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("API journey and state-machine studio", () => {
  it("runs thirty demo expectations offline and exports reports without action labels", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("journey.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("30/30");
    expect(
      within(
        screen.getByRole("table", { name: en["journey.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(31);
    click("journey.report");
    expect(JSON.parse(exported()).runs[0].observations).toBeUndefined();
    fireEvent.click(field("journey.includeDetails"));
    click("journey.report");
    expect(JSON.parse(exported()).runs[0].observations).toHaveLength(3);
    expect(exported()).not.toContain("POST /orders");
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("selects graph nodes/edges by keyboard and protects pending drafts from graph selection", async () => {
    await setup();
    const state = screen.getByRole("button", {
      name: en["journey.selectState"].replace("{name}", "Order created"),
    });
    fireEvent.keyDown(state, { key: "Enter" });
    expect(field("journey.state")).toHaveValue("state-2");
    change("journey.stateName", "Ready");
    const initial = screen.getByRole("button", {
      name: en["journey.selectState"].replace("{name}", "state-1"),
    });
    expect(initial).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(initial);
    expect(field("journey.state")).toHaveValue("state-2");
    click("journey.save");
    expect(
      screen.getByRole("button", {
        name: en["journey.selectState"].replace("{name}", "Ready"),
      }),
    ).toHaveAttribute("aria-pressed", "true");
    const edge = screen.getByRole("button", {
      name: en["journey.selectTransition"].replace("{name}", "transition-1"),
    });
    fireEvent.keyDown(edge, { key: " " });
    expect(field("journey.transition")).toHaveValue("transition-1");
  });
  it("preserves invalid JSON/status drafts and blocks saved selections until save/discard", async () => {
    await setup();
    change("journey.statuses", "201, nope");
    for (const key of [
      "journey.demo",
      "journey.export",
      "journey.exportMonitor",
      "journey.runAll",
      "journey.compare",
    ] as const)
      expect(button(key)).toBeDisabled();
    expect(field("journey.model")).toBeDisabled();
    click("journey.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["journey.error.project"],
    );
    expect(field("journey.statuses")).toHaveValue("201, nope");
    click("journey.discard");
    expect(field("journey.statuses")).toHaveValue("201");
    change("journey.steps", "[");
    click("journey.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["journey.error.json"],
    );
    click("journey.discard");
    await job("journey.runTrace");
    expect(JSON.parse(value("journey.inspection")).outcome).toBe("accepted");
  });
  it("retains references when a state is deleted, blocks invalid graph exports and supports repair", async () => {
    await setup();
    change("journey.state", "state-2");
    click("journey.deleteState");
    expect(field("journey.to")).toHaveValue("state-2");
    expect(button("journey.exportMonitor")).toBeDisabled();
    expect(button("journey.generate")).toBeDisabled();
    click("journey.export");
    expect(JSON.parse(exported()).models[0].transitions[0].to).toBe("state-2");
    await job("journey.runTrace");
    expect(screen.getByRole("status")).toHaveTextContent("0/1");
    expect(JSON.parse(value("journey.inspection")).outcome).toBe("invalid");
    change("journey.to", "state-1");
    click("journey.save");
    expect(button("journey.exportMonitor")).toBeEnabled();
    expect(button("journey.deleteState")).toBeDisabled();
    await job("journey.runTrace");
    expect(JSON.parse(value("journey.inspection")).outcome).toBe("incomplete");
  });
  it("authors disabled transitions, detects overlap on enable and reads OpenAPI labels without applying them", async () => {
    await setup();
    click("journey.cloneTransition");
    expect(field("journey.enabled")).not.toBeChecked();
    fireEvent.click(field("journey.enabled"));
    click("journey.save");
    expect(button("journey.exportMonitor")).toBeDisabled();
    change("journey.statuses", "202");
    click("journey.save");
    expect(button("journey.exportMonitor")).toBeEnabled();
    click("journey.loadActions");
    change("journey.catalog", "GET /users/{id}");
    expect(field("journey.action")).toHaveValue("GET /users/{id}");
    click("journey.discard");
    click("journey.deleteTransition");
    click("journey.deleteTransition");
    expect(screen.getByText(en["journey.noTransitions"])).toBeInTheDocument();
    click("journey.addTransition");
    expect(field("journey.enabled")).not.toBeChecked();
  });
  it("supports model/state/trace CRUD and copies or removes only the appropriate expectations", async () => {
    await setup();
    change("journey.expect", '{"model-1":"accepted"}');
    click("journey.save");
    click("journey.cloneModel");
    expect(field("journey.model")).toHaveValue("model-2");
    expect(JSON.parse(value("journey.expect"))).toEqual({
      "model-1": "accepted",
      "model-2": "accepted",
    });
    click("journey.addState");
    expect(field("journey.state")).toHaveValue("state-3");
    click("journey.deleteState");
    click("journey.deleteModel");
    expect(JSON.parse(value("journey.expect"))).toEqual({
      "model-1": "accepted",
    });
    expect(button("journey.deleteModel")).toBeDisabled();
    click("journey.addModel");
    click("journey.cloneTrace");
    expect(field("journey.trace")).toHaveValue("trace-2");
    click("journey.deleteTrace");
    click("journey.deleteTrace");
    expect(screen.getByText(en["journey.noTraces"])).toBeInTheDocument();
    expect(button("journey.runAll")).toBeDisabled();
    click("journey.addTrace");
    expect(field("journey.trace")).toHaveValue("trace-1");
  });
  it("finds an expansion, saves its shortest counterexample and reruns it against every model", async () => {
    await setup(true);
    await job("journey.compare");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["journey.classification.expanded"],
    );
    expect(button("journey.saveForward")).toBeDisabled();
    click("journey.saveReverse");
    expect(JSON.parse(value("journey.steps"))).toHaveLength(3);
    expect(JSON.parse(value("journey.expect"))).toEqual({
      baseline: "rejected",
      expanded: "accepted",
    });
    await job("journey.runTrace");
    expect(screen.getByRole("status")).toHaveTextContent("3/3");
    click("journey.report");
    expect(JSON.parse(exported()).comparison.classification).toBe("expanded");
    expect(exported()).not.toContain("POST /orders");
  });
  it("reports search exhaustion as inconclusive and refuses invalid comparison budgets", async () => {
    await setup(true);
    change("journey.maxPairs", "1");
    await job("journey.compare");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["journey.classification.inconclusive"],
    );
    expect(button("journey.saveReverse")).toBeDisabled();
    change("journey.maxPairs", "0");
    await job("journey.compare");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["journey.error.limit"],
    );
  });
  it("saves an empty completion counterexample without treating it as an absent witness", async () => {
    await setup();
    const p = emptyJourneyProject();
    p.models[0].states[0].terminal = true;
    p.models.push({
      ...p.models[0],
      id: "other",
      states: p.models[0].states.map((s) =>
        s.id === "state-1" ? { ...s, terminal: false } : s,
      ),
    });
    file(serializeJourneyProject(p));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        en["journey.loaded"],
      ),
    );
    change("journey.candidate", "other");
    await job("journey.compare");
    expect(button("journey.saveForward")).toBeEnabled();
    click("journey.saveForward");
    expect(JSON.parse(value("journey.steps"))).toEqual([]);
    expect(JSON.parse(value("journey.expect"))).toEqual({
      "model-1": "accepted",
      other: "incomplete",
    });
  });
  it("generates partial/complete coverage suites and saves multiple independent cases without losing the suite", async () => {
    await setup(true);
    change("journey.suiteMode", "states");
    change("journey.maxCases", "1");
    await job("journey.generate");
    expect(screen.getByRole("status")).toHaveTextContent(en["journey.partial"]);
    change("journey.suiteMode", "events");
    change("journey.maxCases", "120");
    await job("journey.generate");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["journey.complete"],
    );
    click("journey.saveCase");
    expect(field("journey.trace")).toHaveValue("trace-1");
    change("journey.generatedCase", "1");
    click("journey.saveCase");
    expect(field("journey.trace")).toHaveValue("trace-2");
    click("journey.exportSuite");
    expect(JSON.parse(exported()).complete).toBe(true);
    expect(JSON.parse(exported()).mode).toBe("events");
    click("journey.export");
    expect(JSON.parse(exported()).traces).toHaveLength(12);
  });
  it("imports HAR as a trace, retains unknown actions and removes captured values", async () => {
    await setup();
    const raw = JSON.stringify({
      log: {
        entries: [
          {
            request: {
              method: "POST",
              url: "https://private.example/orders?token=secret",
              postData: { text: "private-body" },
            },
            response: { status: 201 },
          },
          {
            request: { method: "GET", url: "https://private.example/unknown" },
            response: { status: 404 },
          },
          {},
        ],
      },
    });
    file(raw, true);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Imported 2"),
    );
    expect(JSON.parse(value("journey.steps"))[1].action).toBe("GET /unknown");
    click("journey.export");
    for (const secret of ["private.example", "token=secret", "private-body"])
      expect(exported()).not.toContain(secret);
    await job("journey.runTrace");
    expect(JSON.parse(value("journey.inspection"))).toMatchObject({
      outcome: "rejected",
      failedAt: 1,
    });
  });
  it("imports projects atomically, discards runtime data and retains work after malformed/oversized files", async () => {
    await setup();
    const p = emptyJourneyProject();
    p.name = "Imported journey";
    file(JSON.stringify({ ...p, runtime: { state: "secret" }, results: [{}] }));
    await waitFor(() => expect(field("journey.name")).toHaveValue(p.name));
    click("journey.export");
    expect(JSON.parse(exported())).toEqual(p);
    file("{");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        en["journey.error.json"],
      ),
    );
    file("{}", false, undefined, MAX_JOURNEY_BYTES + 1);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        en["journey.error.limit"],
      ),
    );
    expect(field("journey.name")).toHaveValue(p.name);
  });
  it("cancels regression work without publishing partial results and ignores late file reads after unmount", async () => {
    const view = await setup(true);
    click("journey.runAll");
    click("journey.cancel");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(
      screen.queryByRole("table", { name: en["journey.results"] }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      en["journey.cancelled"],
    );
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    file("{}", false, () => pending);
    view.unmount();
    await act(async () => {
      resolve(serializeJourneyProject(emptyJourneyProject()));
      await pending;
    });
  });
  it("exports only the selected model graph/monitor and reports blocked downloads", async () => {
    await setup(true);
    change("journey.model", "expanded");
    click("journey.exportMonitor");
    expect(exported()).toContain("createJourneyMonitor");
    expect(exported()).toContain('"id": "expanded"');
    expect(exported()).not.toContain("fulfilled");
    click("journey.exportSvg");
    expect(exported()).toContain("<svg");
    expect(exported()).toContain("Allow cancellation after payment");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("journey.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["journey.error.download"],
    );
  });
  it("renders and checks the full demo in Russian", async () => {
    setAppLanguage("ru");
    const ru = journeyTranslations.ru;
    render(<JourneyPanel />);
    fireEvent.click(
      screen.getByText(ru["journey.title"], { selector: "summary" }),
    );
    await screen.findByRole("button", { name: ru["journey.demo"] });
    fireEvent.click(screen.getByRole("button", { name: ru["journey.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["journey.runAll"] }));
    await waitFor(
      () => expect(screen.getByRole("status")).toHaveTextContent("30/30"),
      { timeout: 7000 },
    );
    setAppLanguage("en");
  });
});
