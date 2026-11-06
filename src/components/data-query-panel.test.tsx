import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataQueryPanel } from "./data-query-panel";
import { dataQueryTranslations } from "@/lib/data-query-translations";
import { demoDqProject } from "@/lib/data-query-demo";
import {
  emptyDqProject,
  MAX_DQ_PROJECT,
  type DQProject,
} from "@/lib/data-query-model";
import { downloadTextFile } from "@/lib/schema-download";
import { setAppLanguage } from "./i18n-provider";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = dataQueryTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]);
const click = (key: Key) =>
  fireEvent.click(screen.getByRole("button", { name: en[key] }));
const change = (key: Key, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const expand = (key: Key) => {
  const summary = screen.getByText(en[key], { selector: "summary" });
  if (!(summary.parentElement as HTMLDetailsElement).open)
    fireEvent.click(summary);
};
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function snapshot() {
  click("dataQuery.exportProject");
  return JSON.parse(exported()) as DQProject;
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["dataQuery.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 10000 },
  );
}
async function job(key: Key) {
  click(key);
  await idle();
}
async function setup(demo = false) {
  const view = render(<DataQueryPanel />);
  expand("dataQuery.title");
  await screen.findByRole("button", { name: en["dataQuery.demo"] });
  if (demo) click("dataQuery.demo");
  return view;
}
function applyProject(p: DQProject) {
  expand("dataQuery.source");
  change("dataQuery.source", JSON.stringify(p));
  click("dataQuery.apply");
}
function upload(
  source: string,
  options: { text?: () => Promise<string>; size?: number } = {},
) {
  const f = new File([source], "project.json");
  Object.defineProperty(f, "text", {
    value: options.text ?? (async () => source),
  });
  if (options.size !== undefined)
    Object.defineProperty(f, "size", { value: options.size });
  fireEvent.change(field("dataQuery.importProject"), {
    target: { files: [f] },
  });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("API data federation studio", () => {
  it("runs ten isolated cases, exports reports without data and never touches network or storage", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    const initial = snapshot();
    await job("dataQuery.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "10/10 data query expectations passed.",
    );
    click("dataQuery.report");
    expect(JSON.parse(exported()).runs).toHaveLength(10);
    expect(exported()).not.toMatch(
      /"Ada"|"Grace"|"parameters"|"rows"\s*:\s*\[/,
    );
    expect(snapshot()).toEqual(initial);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects aggregate lineage, searches without filtering exports and clears search with Escape", async () => {
    await setup(true);
    await job("dataQuery.run");
    const result = within(
      screen.getByRole("region", { name: en["dataQuery.result"] }),
    );
    fireEvent.click(result.getByRole("button", { name: "Inspect row 0" }));
    expect(result.getByText("orders[0]")).toBeInTheDocument();
    expect(result.getByText("customers[0]")).toBeInTheDocument();
    fireEvent.change(result.getByLabelText(en["dataQuery.search"]), {
      target: { value: "Ada" },
    });
    expect(result.getByText(/1 matching rows/)).toBeInTheDocument();
    click("dataQuery.json");
    expect(JSON.parse(exported())).toHaveLength(5);
    fireEvent.keyDown(result.getByLabelText(en["dataQuery.search"]), {
      key: "Escape",
    });
    expect(result.getByText(/5 matching rows/)).toBeInTheDocument();
  });
  it("imports nested JSON, appends CSV atomically and rejects deletion of referenced tables", async () => {
    await setup();
    change("dataQuery.text", '{"data":[{"id":1,"name":"Ada"}]}');
    change("dataQuery.pointer", "/data");
    click("dataQuery.import");
    expect(snapshot().datasets[1].rows).toEqual([{ id: 1, name: "Ada" }]);
    change("dataQuery.format", "csv");
    change("dataQuery.pointer", "");
    change("dataQuery.target", "append");
    change("dataQuery.text", "id,name\n2,Lin");
    click("dataQuery.import");
    expect(snapshot().datasets[1].rows).toEqual([
      { id: 1, name: "Ada" },
      { id: "2", name: "Lin" },
    ]);
    const initial = snapshot();
    change("dataQuery.text", "id,name\n3");
    click("dataQuery.import");
    expect(screen.getByRole("alert")).toHaveTextContent("import");
    expect(snapshot()).toEqual(initial);
    change("dataQuery.dataset", "records");
    click("dataQuery.deleteTable");
    expect(screen.getByRole("alert")).toHaveTextContent("reference");
    expect(snapshot()).toEqual(initial);
  });
  it("extracts selected HAR JSON responses and wraps primitive array values", async () => {
    await setup();
    change("dataQuery.format", "har");
    change(
      "dataQuery.text",
      JSON.stringify({
        log: {
          entries: [
            {
              request: { method: "GET", url: "https://example.test/items" },
              response: {
                status: 200,
                content: {
                  mimeType: "application/json",
                  text: '{"data":[1,null,"x"]}',
                },
              },
            },
          ],
        },
      }),
    );
    click("dataQuery.inspectHar");
    expect(
      screen.getByText("JSON responses: 1; skipped: 0."),
    ).toBeInTheDocument();
    change("dataQuery.pointer", "/data");
    change("dataQuery.mode", "values");
    click("dataQuery.import");
    expect(snapshot().datasets[1].rows).toEqual([
      { value: 1 },
      { value: null },
      { value: "x" },
    ]);
  });
  it("builds ordered stages, applies advanced definitions and restores source edits with undo/redo", async () => {
    await setup();
    const p = emptyDqProject();
    p.datasets[0].rows = [{ id: 1 }, { id: 2 }];
    applyProject(p);
    change("dataQuery.path", "/row/id");
    change("dataQuery.literal", "2");
    click("dataQuery.addStep");
    await job("dataQuery.run");
    click("dataQuery.json");
    expect(JSON.parse(exported())).toEqual([{ row: { id: 2 } }]);
    change("dataQuery.step", "select");
    change(
      "dataQuery.columns",
      '[{"name":"id","value":{"op":"get","pointer":"/row/id"}}]',
    );
    click("dataQuery.addStep");
    expect(snapshot().queries[0].steps.map((s) => s.op)).toEqual([
      "filter",
      "select",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "2. select" }));
    click("dataQuery.up");
    expect(snapshot().queries[0].steps.map((s) => s.op)).toEqual([
      "select",
      "filter",
    ]);
    click("dataQuery.undo");
    expect(snapshot().queries[0].steps.map((s) => s.op)).toEqual([
      "filter",
      "select",
    ]);
    click("dataQuery.redo");
    expect(snapshot().queries[0].steps.map((s) => s.op)).toEqual([
      "select",
      "filter",
    ]);
    click("dataQuery.removeStep");
    expand("dataQuery.definition");
    const q = snapshot().queries[0];
    q.steps = [{ op: "slice", offset: 0, limit: 1 }];
    change("dataQuery.definition", JSON.stringify(q));
    click("dataQuery.applyQuery");
    expect(snapshot().queries[0].steps).toEqual(q.steps);
  });
  it("blocks operations for unapplied drafts and preserves the project on invalid JSON or cyclic dependencies", async () => {
    await setup(true);
    const initial = snapshot();
    expand("dataQuery.source");
    change("dataQuery.source", "{");
    click("dataQuery.run");
    expect(screen.getByRole("alert")).toHaveTextContent(en["dataQuery.dirty"]);
    click("dataQuery.apply");
    expect(screen.getByRole("alert")).toHaveTextContent("json");
    click("dataQuery.discard");
    expect(snapshot()).toEqual(initial);
    const p = demoDqProject();
    p.queries[0].from = { kind: "query", id: "revenue" };
    applyProject(p);
    expect(screen.getByRole("alert")).toHaveTextContent("reference");
    click("dataQuery.discard");
    expect(snapshot()).toEqual(initial);
  });
  it("records the parameters that produced a result, opts into exact values and materializes tables", async () => {
    await setup(true);
    change("dataQuery.bindings", '{"status":"pending"}');
    await job("dataQuery.run");
    change("dataQuery.bindings", '{"status":"paid"}');
    fireEvent.click(field("dataQuery.exact"));
    click("dataQuery.record");
    const recorded = snapshot().scenarios.at(-1)!;
    expect(recorded.parameters).toEqual({ status: "pending" });
    expect(recorded.expect?.exact).toEqual([
      { customerId: "c1", customer: "Ada", orders: 1, total: 50 },
    ]);
    await job("dataQuery.runCase");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1/1 data query expectations passed.",
    );
    await job("dataQuery.run");
    change("dataQuery.name", "Revenue snapshot");
    click("dataQuery.materialize");
    expect(snapshot().datasets.at(-1)).toMatchObject({
      name: "Revenue snapshot",
      rows: expect.any(Array),
    });
    expect(snapshot().datasets.at(-1)!.rows).toHaveLength(5);
  });
  it("compares candidate data without changing source and rejects duplicate identities", async () => {
    await setup(true);
    const p = snapshot();
    const rows = p.datasets[0].rows.map((r, i) =>
      i === 0 ? { ...r, name: "Grace" } : r,
    );
    change("dataQuery.overrides", JSON.stringify([{ id: "customers", rows }]));
    await job("dataQuery.compareRun");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Added: 0; removed: 0; changed: 1; unchanged: 4.",
    );
    expect(snapshot()).toEqual(p);
    change("dataQuery.identity", "/orders");
    await job("dataQuery.compareRun");
    expect(screen.getByRole("alert")).toHaveTextContent("comparison-key");
    expect(snapshot()).toEqual(p);
  });
  it("cancels work and late imports without publishing results or losing source", async () => {
    const view = await setup(true),
      initial = snapshot();
    click("dataQuery.runAll");
    click("dataQuery.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      en["dataQuery.cancelled"],
    );
    expect(
      screen.queryByRole("button", { name: en["dataQuery.report"] }),
    ).not.toBeInTheDocument();
    expect(snapshot()).toEqual(initial);
    let finish!: (text: string) => void;
    upload("{}", {
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    click("dataQuery.cancel");
    await act(async () => {
      finish(JSON.stringify(emptyDqProject()));
    });
    expect(snapshot()).toEqual(initial);
    upload("{}", { size: MAX_DQ_PROJECT + 1 });
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent("limit");
    upload("{}", {
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    view.unmount();
    await act(async () => {
      finish(JSON.stringify(emptyDqProject()));
    });
  });
  it("restores only source, exports executable artifacts and surfaces download failures", async () => {
    await setup();
    upload(JSON.stringify({ ...demoDqProject(), result: { forged: true } }));
    await idle();
    expect(snapshot()).toEqual(demoDqProject());
    click("dataQuery.sdk");
    expect(exported()).toContain("export async function queryData");
    expect(exported()).not.toContain('"Ada"');
    click("dataQuery.runner");
    expect(exported()).toContain("process.exitCode");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("dataQuery.exportProject");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["dataQuery.downloadError"],
    );
  });
  it("localizes the studio controls into Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    const ru = dataQueryTranslations.ru;
    expect(
      screen.getByRole("button", { name: ru["dataQuery.run"] }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(ru["dataQuery.text"])).toBeInTheDocument();
    act(() => setAppLanguage("en"));
  });
});
