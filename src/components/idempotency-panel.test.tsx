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
import { IdempotencyPanel } from "./idempotency-panel";
import { setAppLanguage } from "./i18n-provider";
import { idempotencyTranslations } from "@/lib/idempotency-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_IDEM_BYTES,
  emptyIdemProject,
  newIdemRequest,
  serializeIdemProject,
} from "@/lib/idempotency-project";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = idempotencyTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]),
  button = (key: Key) => screen.getByRole("button", { name: en[key] }),
  click = (key: Key) => fireEvent.click(button(key)),
  change = (key: Key, value: string) =>
    fireEvent.change(field(key), { target: { value } }),
  value = (key: Key) => (field(key) as HTMLInputElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(demo = false) {
  const view = render(<IdempotencyPanel />);
  fireEvent.click(screen.getByText(en["idem.title"], { selector: "summary" }));
  await screen.findByLabelText(en["idem.name"]);
  if (demo) click("idem.demo");
  return view;
}
async function job(key: "idem.runAll" | "idem.compare") {
  click(key);
  await waitFor(
    () =>
      expect(
        screen.queryByText(en["idem.busy"], { exact: false }),
      ).not.toBeInTheDocument(),
    { timeout: 7000 },
  );
}
function file(source: string, text?: () => Promise<string>, size?: number) {
  const f = new File([source], "idempotency.json", {
    type: "application/json",
  });
  Object.defineProperty(f, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(f, "size", { value: size });
  fireEvent.change(field("idem.import"), { target: { files: [f] } });
}
describe("idempotency and duplicate-write studio", () => {
  it("runs all twenty demo comparisons offline and exports summary/detail reports without captured values", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("idem.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("20/20");
    expect(
      within(
        screen.getByRole("table", { name: en["idem.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(21);
    click("idem.report");
    expect(JSON.parse(exported()).comparisons[0].rows).toBeUndefined();
    fireEvent.click(field("idem.includeRows"));
    click("idem.report");
    expect(JSON.parse(exported()).comparisons[0].rows).toHaveLength(5);
    for (const secret of [
      "client-a",
      "client-b",
      "/orders",
      "application/json",
      '"book"',
      "order-created",
    ])
      expect(exported()).not.toContain(secret);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects joined original responses, filters outcomes and resets searches on comparison changes", async () => {
    await setup(true);
    await job("idem.compare");
    change("idem.result", "duplicate-orders/wait");
    const label = en["idem.inspect"]
      .replace("{name}", "while-pending")
      .replace("{outcome}", en["idem.outcome.joined"]);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(JSON.parse(value("idem.inspection"))).toMatchObject({
      outcome: "joined",
      completedAt: 100,
      response: { sourceId: "first", status: 201 },
    });
    change("idem.outcomeFilter", "conflict");
    expect(
      within(screen.getByRole("table", { name: en["idem.rows"] })).getAllByRole(
        "row",
      ),
    ).toHaveLength(2);
    change("idem.search", "missing");
    expect(
      within(screen.getByRole("table", { name: en["idem.rows"] })).getAllByRole(
        "row",
      ),
    ).toHaveLength(1);
    change("idem.result", "duplicate-orders/reject");
    expect(field("idem.search")).toHaveValue("");
    expect(field("idem.outcomeFilter")).toHaveValue("");
  });
  it("protects invalid numeric/JSON drafts and saved selections until save or discard", async () => {
    await setup();
    change("idem.ttlMs", "");
    for (const key of [
      "idem.demo",
      "idem.new",
      "idem.export",
      "idem.exportMiddleware",
      "idem.runAll",
    ] as const)
      expect(button(key)).toBeDisabled();
    expect(field("idem.policy")).toBeDisabled();
    expect(field("idem.scenario")).toBeDisabled();
    click("idem.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["idem.error.project"],
    );
    expect(field("idem.ttlMs")).toHaveValue("");
    click("idem.discard");
    expect(field("idem.ttlMs")).toHaveValue("1000");
    change("idem.requests", "[");
    click("idem.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["idem.error.json"]);
    click("idem.discard");
    await job("idem.compare");
    expect(screen.getByRole("status")).toHaveTextContent("1/1");
  });
  it("saves wait/scope/missing/error settings and honors zero execution budgets", async () => {
    await setup();
    change("idem.inFlight", "wait");
    change("idem.scope", "client");
    change("idem.missingKey", "bypass");
    fireEvent.click(field("idem.cacheErrors"));
    change("idem.maxExecutions", "0");
    click("idem.save");
    click("idem.export");
    expect(JSON.parse(exported()).policies[0]).toMatchObject({
      inFlight: "wait",
      scope: "client",
      missingKey: "bypass",
      cacheErrors: true,
    });
    await job("idem.compare");
    expect(screen.getByRole("status")).toHaveTextContent("0/1");
  });
  it("supports policy/scenario CRUD, copies expectations and removes only deleted policy expectations", async () => {
    await setup();
    const requests = JSON.parse(value("idem.requests"));
    requests[0].expect = { "policy-1": "executed" };
    change("idem.requests", JSON.stringify(requests));
    click("idem.save");
    click("idem.clonePolicy");
    expect(field("idem.policy")).toHaveValue("policy-2");
    expect(JSON.parse(value("idem.requests"))[0].expect).toEqual({
      "policy-1": "executed",
      "policy-2": "executed",
    });
    click("idem.deletePolicy");
    expect(JSON.parse(value("idem.requests"))[0].expect).toEqual({
      "policy-1": "executed",
    });
    expect(button("idem.deletePolicy")).toBeDisabled();
    click("idem.addPolicy");
    click("idem.cloneScenario");
    expect(field("idem.scenario")).toHaveValue("scenario-2");
    click("idem.deleteScenario");
    expect(button("idem.deleteScenario")).toBeDisabled();
    click("idem.addScenario");
    expect(field("idem.scenario")).toHaveValue("scenario-2");
  });
  it("generates a repeated-key traffic draft without modifying saved traffic before save", async () => {
    await setup();
    fireEvent.click(
      screen.getByText(en["idem.generator"], { selector: "summary" }),
    );
    change("idem.count", "6");
    change("idem.keys", "1");
    change("idem.spacing", "10");
    click("idem.generate");
    expect(JSON.parse(value("idem.requests"))).toHaveLength(6);
    expect(button("idem.export")).toBeDisabled();
    click("idem.save");
    await job("idem.compare");
    expect(JSON.parse(value("idem.states"))).toHaveLength(1);
    change("idem.count", "201");
    click("idem.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(en["idem.error.limit"]);
    expect(JSON.parse(value("idem.requests"))).toHaveLength(6);
  });
  it("imports atomically, discards supplied results and retains work after malformed/oversized input", async () => {
    await setup();
    const p = emptyIdemProject();
    p.name = "Imported writes";
    file(JSON.stringify({ ...p, results: [{}], state: { secret: "ignore" } }));
    await waitFor(() => expect(field("idem.name")).toHaveValue(p.name));
    click("idem.export");
    expect(JSON.parse(exported())).toEqual(p);
    file("{");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        en["idem.error.json"],
      ),
    );
    file("{}", undefined, MAX_IDEM_BYTES + 1);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        en["idem.error.limit"],
      ),
    );
    expect(field("idem.name")).toHaveValue(p.name);
  });
  it("supports empty schedules and refuses unknown expectation policies without replacing saved work", async () => {
    await setup();
    change("idem.requests", "[]");
    click("idem.save");
    await job("idem.compare");
    expect(screen.getByRole("status")).toHaveTextContent("1/1");
    expect(JSON.parse(value("idem.states"))).toEqual([]);
    const q = newIdemRequest();
    q.expect.unknown = "executed";
    change("idem.requests", JSON.stringify([q]));
    click("idem.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["idem.error.project"],
    );
    click("idem.discard");
    expect(field("idem.requests")).toHaveValue("[]");
  });
  it("cancels work without publishing partial results and ignores file completions after unmount", async () => {
    const view = await setup(true);
    click("idem.runAll");
    click("idem.cancel");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(
      screen.queryByRole("table", { name: en["idem.results"] }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(en["idem.cancelled"]);
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    file("{}", () => pending);
    view.unmount();
    await act(async () => {
      resolve(serializeIdemProject(emptyIdemProject()));
      await pending;
    });
  });
  it("exports the selected saved policy without fixtures and reports blocked downloads", async () => {
    await setup(true);
    change("idem.policy", "wait");
    click("idem.exportMiddleware");
    expect(exported()).toContain("createIdempotencyMiddleware");
    expect(exported()).toContain('"id": "wait"');
    expect(exported()).not.toContain("order-created");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("idem.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["idem.error.download"],
    );
  });
  it("paginates both outcomes and timelines and resets page bounds on filtering", async () => {
    await setup();
    const p = emptyIdemProject();
    p.scenarios[0].requests = Array.from({ length: 105 }, (_, i) => ({
      ...newIdemRequest(`q-${i}`),
      atMs: i * 10,
    }));
    file(serializeIdemProject(p));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(en["idem.loaded"]),
    );
    await job("idem.compare");
    const rows = () =>
      within(screen.getByRole("table", { name: en["idem.rows"] })).getAllByRole(
        "row",
      );
    expect(rows()).toHaveLength(101);
    click("idem.next");
    expect(rows()).toHaveLength(6);
    change("idem.search", "q-104");
    expect(rows()).toHaveLength(2);
    expect(button("idem.previous")).toBeDisabled();
  });
  it("renders and runs in Russian", async () => {
    setAppLanguage("ru");
    const ru = idempotencyTranslations.ru;
    render(<IdempotencyPanel />);
    fireEvent.click(
      screen.getByText(ru["idem.title"], { selector: "summary" }),
    );
    await screen.findByRole("button", { name: ru["idem.demo"] });
    fireEvent.click(screen.getByRole("button", { name: ru["idem.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["idem.runAll"] }));
    await waitFor(
      () => expect(screen.getByRole("status")).toHaveTextContent("20/20"),
      { timeout: 7000 },
    );
    setAppLanguage("en");
  });
});
