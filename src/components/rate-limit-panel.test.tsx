import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitPanel } from "./rate-limit-panel";
import { setAppLanguage } from "./i18n-provider";
import { rateTranslations } from "@/lib/rate-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_RATE_BYTES,
  emptyRateProject,
  serializeRateProject,
} from "@/lib/rate-project";
import { demoRateProject } from "@/lib/rate-studio";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = rateTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]);
const button = (key: Key) => screen.getByRole("button", { name: en[key] });
const click = (key: Key) => fireEvent.click(button(key));
const change = (key: Key, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const value = (key: Key) => (field(key) as HTMLInputElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function job(key: Key) {
  click(key);
  await waitFor(
    () =>
      expect(
        screen.queryByText(en["rate.busy"], { exact: false }),
      ).not.toBeInTheDocument(),
    { timeout: 5000 },
  );
}
async function setup(demo = false) {
  const view = render(<RateLimitPanel />);
  fireEvent.click(screen.getByText(en["rate.title"], { selector: "summary" }));
  await screen.findByLabelText(en["rate.name"]);
  if (demo) click("rate.demo");
  return view;
}
function importFile(
  source: string,
  har = false,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "quotas.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(har ? "rate.importHar" : "rate.import"), {
    target: { files: [file] },
  });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("rate-limit and quota studio", () => {
  it("runs all sixteen demo comparisons without traffic/storage writes and exports reports without identity labels", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("rate.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("16/16");
    expect(
      within(
        screen.getByRole("table", { name: en["rate.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(17);
    click("rate.report");
    const report = JSON.parse(exported());
    expect(report.simulations).toHaveLength(16);
    expect(report.simulations[0].rows).toBeUndefined();
    for (const raw of ["client-a", "client-b", "/orders"])
      expect(exported()).not.toContain(raw);
    fireEvent.click(field("rate.includeRows"));
    click("rate.report");
    expect(JSON.parse(exported()).simulations[0].rows).toHaveLength(7);
    expect(exported()).not.toContain("client-a");
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("compares a single scenario, inspects a refusal and filters request outcomes", async () => {
    await setup(true);
    await job("rate.compare");
    expect(screen.getByRole("status")).toHaveTextContent("4/4");
    const label = en["rate.event"]
      .replace("{name}", "after-1")
      .replace("{time}", "1000")
      .replace("{outcome}", en["rate.outcome.limited"]);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(JSON.parse(value("rate.selectedRequest")).decision).toMatchObject({
      outcome: "limited",
      retryAfterMs: 900,
      rules: [{ charged: false, remaining: 0 }],
    });
    change("rate.outcomeFilter", "limited");
    expect(
      within(
        screen.getByRole("table", { name: en["rate.requestRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(3);
    change("rate.rowSearch", "missing");
    expect(
      within(
        screen.getByRole("table", { name: en["rate.requestRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(1);
    change("rate.result", "boundary/fixed");
    expect(field("rate.rowSearch")).toHaveValue("");
    expect(field("rate.outcomeFilter")).toHaveValue("");
  });
  it("retains invalid numeric edits, protects saved selections and restores the saved rule on discard", async () => {
    await setup(true);
    change("rate.limit", "");
    for (const key of [
      "rate.compare",
      "rate.runAll",
      "rate.export",
      "rate.demo",
      "rate.exportMiddleware",
    ] as const)
      expect(button(key)).toBeDisabled();
    expect(field("rate.policy")).toBeDisabled();
    expect(field("rate.scenario")).toBeDisabled();
    click("rate.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rate.error.project"],
    );
    expect(field("rate.limit")).toHaveValue("");
    click("rate.discard");
    expect(field("rate.limit")).toHaveValue("3");
    await job("rate.compare");
    expect(screen.getByRole("status")).toHaveTextContent("4/4");
  });
  it("saves algorithm/scope/refill edits and exposes unmatched admissions as a coverage-budget failure", async () => {
    await setup();
    change("rate.algorithm", "fixed");
    change("rate.scope", "route");
    change("rate.window", "500");
    change("rate.refillTokens", "2");
    change("rate.matchRoute", "/different");
    click("rate.save");
    await job("rate.compare");
    expect(screen.getByRole("status")).toHaveTextContent("0/1");
    expect(JSON.parse(value("rate.selectedRequest")).decision.outcome).toBe(
      "unmatched",
    );
    change("rate.budget.maxUnmatched", "1");
    click("rate.save");
    await job("rate.compare");
    expect(screen.getByRole("status")).toHaveTextContent("1/1");
    click("rate.export");
    expect(JSON.parse(exported()).policies[0].rules[0]).toMatchObject({
      algorithm: "fixed",
      scope: "route",
      refillTokens: 2,
      windowMs: 500,
    });
  });
  it("generates weighted round-robin traffic into the draft without replacing other edits", async () => {
    await setup();
    fireEvent.click(
      screen.getByText(en["rate.generator"], { selector: "summary" }),
    );
    change("rate.count", "5");
    change("rate.spacing", "50");
    change("rate.clients", "2");
    change("rate.cost", "2");
    change("rate.route", "/generated");
    change("rate.scenarioName", "Keep this name");
    click("rate.generate");
    const requests = JSON.parse(value("rate.requests"));
    expect(requests.map((r: { atMs: number }) => r.atMs)).toEqual([
      0, 50, 100, 150, 200,
    ]);
    expect(requests[1]).toMatchObject({
      client: "client-2",
      cost: 2,
      route: "/generated",
      expect: {},
    });
    expect(field("rate.scenarioName")).toHaveValue("Keep this name");
    expect(button("rate.compare")).toBeDisabled();
    click("rate.save");
    await job("rate.compare");
    expect(
      within(
        screen.getByRole("table", { name: en["rate.requestRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(6);
  });
  it("preserves malformed traffic drafts and diagnoses changed expectations", async () => {
    await setup();
    change("rate.requests", "[");
    click("rate.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rate.error.json"]);
    expect(field("rate.requests")).toHaveValue("[");
    click("rate.discard");
    const requests = JSON.parse(value("rate.requests"));
    requests[0].expect = { "policy-1": "limited" };
    change("rate.requests", JSON.stringify(requests));
    click("rate.save");
    await job("rate.compare");
    expect(screen.getByRole("status")).toHaveTextContent("0/1");
    expect(JSON.parse(value("rate.selectedRequest")).passed).toBe(false);
  });
  it("manages rules, policies and scenarios and removes expectations only for a deleted policy", async () => {
    await setup(true);
    click("rate.cloneRule");
    expect(field("rate.ruleName")).toHaveValue("rule-1");
    click("rate.deleteRule");
    click("rate.deletePolicy");
    click("rate.export");
    const p = JSON.parse(exported());
    expect(p.policies).toHaveLength(3);
    expect(
      p.scenarios.every((s: { requests: { expect: object }[] }) =>
        s.requests.every((r) => !Object.hasOwn(r.expect, "token")),
      ),
    ).toBe(true);
    click("rate.clonePolicy");
    click("rate.addPolicy");
    expect(button("rate.addPolicy")).toBeDisabled();
    click("rate.deletePolicy");
    click("rate.cloneScenario");
    click("rate.addScenario");
    click("rate.deleteScenario");
    click("rate.export");
    expect(JSON.parse(exported()).scenarios).toHaveLength(5);
  });
  it("keeps zero retry budgets active and treats empty as explicitly unchecked", async () => {
    await setup(true);
    change("rate.budget.maxRetryMs", "0");
    click("rate.save");
    await job("rate.compare");
    expect(screen.getByRole("status")).toHaveTextContent("1/4");
    change("rate.budget.maxRetryMs", "");
    click("rate.save");
    await job("rate.compare");
    expect(screen.getByRole("status")).toHaveTextContent("4/4");
  });
  it("imports projects atomically, clears untrusted runtime results and retains invalid input feedback", async () => {
    await setup(true);
    await job("rate.compare");
    const previous = value("rate.name");
    await act(async () => importFile('{"kind":"wrong"}'));
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rate.error.project"],
    );
    expect(field("rate.name")).toHaveValue(previous);
    expect(
      screen.getByRole("region", { name: en["rate.results"] }),
    ).toBeInTheDocument();
    await act(async () =>
      importFile(
        JSON.stringify({
          ...emptyRateProject(),
          state: { private: "ignore" },
          results: [{ passed: true }],
        }),
      ),
    );
    expect(
      screen.queryByRole("region", { name: en["rate.results"] }),
    ).not.toBeInTheDocument();
    click("rate.export");
    expect(exported()).not.toContain('"state"');
    expect(exported()).not.toContain('"results"');
  });
  it("imports timestamped HAR paths into a new scenario without retaining request values", async () => {
    await setup();
    const capture = {
      log: {
        entries: [
          {
            startedDateTime: "2026-01-01T00:00:00Z",
            request: {
              method: "POST",
              url: "https://private.example/orders?secret=PRIVATE",
              headers: [{ name: "Cookie", value: "PRIVATE" }],
            },
          },
          { request: { url: "bad" } },
        ],
      },
    };
    await act(async () => importFile(JSON.stringify(capture), true));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Imported 1 HAR arrivals; skipped 1",
    );
    expect(JSON.parse(value("rate.requests"))[0]).toMatchObject({
      method: "POST",
      route: "/orders",
      client: "har-client",
      cost: 1,
    });
    click("rate.export");
    expect(exported()).not.toContain("PRIVATE");
    expect(exported()).not.toContain("private.example");
    expect(exported()).not.toContain("2026-01");
  });
  it("cancels in-progress matrices and ignores file reads completing after cancellation or unmount", async () => {
    const view = await setup(true);
    click("rate.runAll");
    expect(field("rate.name")).toBeDisabled();
    click("rate.cancel");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(
      screen.queryByRole("region", { name: en["rate.results"] }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rate.error.cancelled"],
    );
    let finish!: (s: string) => void;
    importFile(
      "{}",
      false,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    click("rate.cancel");
    await act(async () => finish(serializeRateProject(emptyRateProject())));
    expect(field("rate.name")).toHaveValue(demoRateProject().name);
    importFile(
      "{}",
      false,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    view.unmount();
    await act(async () => finish(serializeRateProject(emptyRateProject())));
  });
  it("rejects oversized files before reading and reports blocked middleware downloads", async () => {
    await setup();
    const read = vi.fn(async () => "{}");
    await act(async () => importFile("{}", false, read, MAX_RATE_BYTES + 1));
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["rate.error.limit"]);
    click("rate.exportMiddleware");
    expect(exported()).toContain("createRateLimitMiddleware");
    expect(exported()).not.toContain('"client-a"');
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("rate.exportMiddleware");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rate.downloadFailed"],
    );
  });
  it("paginates a generated capture and resets the page when filtering", async () => {
    await setup();
    fireEvent.click(
      screen.getByText(en["rate.generator"], { selector: "summary" }),
    );
    change("rate.count", "105");
    click("rate.generate");
    click("rate.save");
    await job("rate.compare");
    expect(
      within(
        screen.getByRole("table", { name: en["rate.requestRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(101);
    click("rate.next");
    expect(
      within(
        screen.getByRole("table", { name: en["rate.requestRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(6);
    change("rate.rowSearch", "generated-105");
    expect(button("rate.previous")).toBeDisabled();
    expect(
      within(
        screen.getByRole("table", { name: en["rate.requestRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(2);
  });
  it("runs the same comparison workflow in Russian", async () => {
    act(() => setAppLanguage("ru"));
    render(<RateLimitPanel />);
    const ru = rateTranslations.ru;
    fireEvent.click(
      screen.getByText(ru["rate.title"], { selector: "summary" }),
    );
    await screen.findByLabelText(ru["rate.name"]);
    fireEvent.click(screen.getByRole("button", { name: ru["rate.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["rate.runAll"] }));
    await waitFor(
      () =>
        expect(
          screen.queryByText(ru["rate.busy"], { exact: false }),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getByRole("status")).toHaveTextContent("16/16");
    expect(
      screen.getByRole("table", { name: ru["rate.results"] }),
    ).toBeInTheDocument();
  });
});
