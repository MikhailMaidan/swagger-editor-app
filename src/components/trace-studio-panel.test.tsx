import { webcrypto } from "node:crypto";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TraceStudioPanel } from "./trace-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { traceTranslations } from "@/lib/trace-translations";
import { downloadTextFile } from "@/lib/schema-download";
import { MAX_TRACE_BYTES, serializeTraceProject } from "@/lib/trace-data";
import {
  DEMO_TRACE_A,
  DEMO_TRACE_B,
  demoTraceProject,
  emptyTraceProject,
} from "@/lib/trace-demo";
import { readTraceParent } from "@/lib/trace-context";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = traceTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]);
const button = (key: Key) => screen.getByRole("button", { name: en[key] });
const click = (key: Key) => fireEvent.click(button(key));
const change = (key: Key, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const value = (key: Key) => (field(key) as HTMLInputElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = false) {
  const view = render(<TraceStudioPanel />);
  fireEvent.click(screen.getByText(en["trace.title"], { selector: "summary" }));
  await screen.findByLabelText(en["trace.name"]);
  fireEvent.click(
    screen.getByText(en["trace.sourceSection"], { selector: "summary" }),
  );
  if (demo) click("trace.demo");
  return view;
}
function importFile(
  source: string,
  project = true,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "traces.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(project ? "trace.import" : "trace.importOtlp"), {
    target: { files: [file] },
  });
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("distributed trace studio", () => {
  it("opens on demand, analyzes twelve demo spans and passes seven budgets without network or storage writes", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    render(<TraceStudioPanel />);
    expect(screen.queryByLabelText(en["trace.name"])).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByText(en["trace.title"], { selector: "summary" }),
    );
    await screen.findByLabelText(en["trace.name"]);
    click("trace.demo");
    click("trace.run");
    expect(screen.getByRole("status")).toHaveTextContent("7/7");
    expect(
      screen.getByRole("region", { name: en["trace.overview"] }),
    ).toHaveTextContent(
      "12 spans; 3 observed traces; 5 services; 1 error spans; 1 diagnostics",
    );
    expect(
      within(
        screen.getByRole("table", { name: en["trace.waterfall"] }),
      ).getAllByRole("row"),
    ).toHaveLength(10);
    click("trace.report");
    const report = JSON.parse(exported());
    expect(report.budgets).toHaveLength(7);
    expect(report.budgets.every((r: { passed: boolean }) => r.passed)).toBe(
      true,
    );
    for (const secret of ["PRIVATE", "1700000000", DEMO_TRACE_A, DEMO_TRACE_B])
      expect(exported()).not.toContain(secret);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("shows precise exclusive timings, navigates parents and links across traces, and filters without changing the capture", async () => {
    await setup(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: en["trace.selectSpan"].replace("{name}", "createOrder"),
      }),
    );
    expect(JSON.parse(value("trace.details")).selfNs).toBe("85000000");
    click("trace.parent");
    expect(JSON.parse(value("trace.details")).span.name).toBe(
      "orders HTTP client",
    );
    change("trace.trace", DEMO_TRACE_B);
    fireEvent.click(
      screen.getByRole("button", {
        name: en["trace.selectSpan"].replace("{name}", "consume order event"),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: en["trace.link"].replace("{index}", "1"),
      }),
    );
    expect(field("trace.trace")).toHaveValue(DEMO_TRACE_A);
    expect(JSON.parse(value("trace.details")).span.name).toBe("createOrder");
    change("trace.search", "payment provider");
    expect(
      within(
        screen.getByRole("table", { name: en["trace.waterfall"] }),
      ).getAllByRole("row"),
    ).toHaveLength(2);
    change("trace.search", "");
    fireEvent.click(field("trace.errorsOnly"));
    expect(
      within(
        screen.getByRole("table", { name: en["trace.waterfall"] }),
      ).getAllByRole("row"),
    ).toHaveLength(2);
    click("trace.export");
    expect(JSON.parse(exported()).source).toBe(demoTraceProject().source);
  });
  it("retains invalid OTLP drafts, blocks saved actions and restores the previous source on discard", async () => {
    await setup(true);
    const previous = value("trace.source");
    change("trace.source", '{"resourceSpans":[]}');
    for (const key of [
      "trace.run",
      "trace.export",
      "trace.viewer",
      "trace.demo",
    ] as const)
      expect(button(key)).toBeDisabled();
    expect(field("trace.budget")).toBeDisabled();
    click("trace.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["trace.error.otlp"]);
    expect(field("trace.source")).toHaveValue('{"resourceSpans":[]}');
    expect(
      screen.getByRole("region", { name: en["trace.overview"] }),
    ).toHaveTextContent("12 spans");
    click("trace.discard");
    expect(value("trace.source")).toBe(previous);
    click("trace.run");
    expect(screen.getByRole("status")).toHaveTextContent("7/7");
  });
  it("edits exact nanosecond budget boundaries, diagnoses missing matches, and manages budget copies", async () => {
    await setup(true);
    change("trace.budgetMax", "399.999999");
    click("trace.save");
    click("trace.run");
    expect(screen.getByRole("status")).toHaveTextContent("6/7");
    expect(
      screen.getByRole("region", { name: en["trace.results"] }),
    ).toHaveTextContent("maximum exceeded");
    change("trace.budgetOperation", "missing-operation");
    click("trace.save");
    click("trace.run");
    expect(
      screen.getByRole("region", { name: en["trace.results"] }),
    ).toHaveTextContent("insufficient matching spans");
    click("trace.cloneBudget");
    expect(field("trace.budgetName")).toHaveValue("budget-1");
    click("trace.deleteBudget");
    click("trace.export");
    expect(JSON.parse(exported()).budgets).toHaveLength(7);
  });
  it("keeps malformed numeric budget edits visible after a failed save", async () => {
    await setup();
    change("trace.minMatches", "");
    click("trace.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["trace.error.project"],
    );
    expect(field("trace.minMatches")).toHaveValue("");
    click("trace.discard");
    expect(field("trace.minMatches")).toHaveValue("1");
    change("trace.budgetMax", "1e3");
    click("trace.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["trace.error.project"],
    );
  });
  it("imports OTLP into a draft without losing unknown metadata and adopts it only after saving", async () => {
    await setup();
    const p = demoTraceProject();
    await act(async () => importFile(p.source, false));
    expect(screen.getByRole("status")).toHaveTextContent(
      en["trace.sourceLoaded"],
    );
    expect(
      screen.getByRole("region", { name: en["trace.overview"] }),
    ).toHaveTextContent("1 spans");
    click("trace.save");
    expect(
      screen.getByRole("region", { name: en["trace.overview"] }),
    ).toHaveTextContent("12 spans");
    click("trace.exportOtlp");
    expect(exported()).toBe(p.source);
    click("trace.exportSlice");
    expect(JSON.parse(exported())["x-demo-metadata"]).toEqual({
      retained: true,
    });
  });
  it("rejects invalid projects atomically and ignores imported analysis results", async () => {
    await setup(true);
    click("trace.run");
    const previous = value("trace.name");
    await act(async () => importFile('{"kind":"wrong"}'));
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["trace.error.project"],
    );
    expect(value("trace.name")).toBe(previous);
    expect(
      screen.getByRole("region", { name: en["trace.results"] }),
    ).toBeInTheDocument();
    await act(async () =>
      importFile(
        JSON.stringify({
          ...emptyTraceProject(),
          results: [{ passed: true }],
          analysis: { valid: true },
        }),
      ),
    );
    expect(
      screen.queryByRole("region", { name: en["trace.results"] }),
    ).not.toBeInTheDocument();
    click("trace.export");
    expect(exported()).not.toContain('"results"');
    expect(exported()).not.toContain('"analysis"');
  });
  it("rejects oversized imports before reading and discards a delayed import after cancel or unmount", async () => {
    const view = await setup(),
      text = vi.fn(async () => "{}");
    await act(async () => importFile("{}", true, text, MAX_TRACE_BYTES + 1));
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["trace.error.limit"],
    );
    let finish!: (s: string) => void;
    importFile(
      "{}",
      true,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    expect(field("trace.name")).toBeDisabled();
    click("trace.cancel");
    await act(async () => finish(serializeTraceProject(demoTraceProject())));
    expect(field("trace.name")).toHaveValue(emptyTraceProject().name);
    importFile(
      "{}",
      true,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    view.unmount();
    await act(async () => finish(serializeTraceProject(demoTraceProject())));
  });
  it("generates outgoing context, moves vendor entries and exports only after a save", async () => {
    await setup(true);
    const parent = readTraceParent(value("trace.traceparent"));
    fireEvent.click(field("trace.sampled"));
    click("trace.childContext");
    const child = readTraceParent(value("trace.traceparent"));
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentId).not.toBe(parent.parentId);
    expect(child.sampled).toBe(false);
    expect(button("trace.exportContext")).toBeDisabled();
    change("trace.vendorKey", "newvendor");
    change("trace.vendorValue", "private-value");
    click("trace.updateVendor");
    expect(value("trace.tracestate")).toBe(
      "newvendor=private-value,demo=local",
    );
    click("trace.inspectContext");
    expect(JSON.parse(value("trace.contextResult")).issue).toBeNull();
    click("trace.save");
    click("trace.exportContext");
    expect(JSON.parse(exported())).toEqual({
      traceparent: value("trace.traceparent"),
      tracestate: "newvendor=private-value,demo=local",
    });
    click("trace.report");
    expect(exported()).not.toContain("private-value");
    click("trace.newContext");
    expect(readTraceParent(value("trace.traceparent")).traceId).not.toBe(
      parent.traceId,
    );
    expect(field("trace.tracestate")).toHaveValue("");
  });
  it("keeps valid parent context when tracestate is invalid, and clears it when using a selected span", async () => {
    await setup(true);
    change("trace.tracestate", "bad-value");
    click("trace.inspectContext");
    expect(JSON.parse(value("trace.contextResult"))).toMatchObject({
      issue: "state",
      parent: { traceId: DEMO_TRACE_A },
    });
    click("trace.childContext");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["trace.error.state"],
    );
    click("trace.useContext");
    expect(field("trace.tracestate")).toHaveValue("");
    expect(readTraceParent(value("trace.traceparent")).parentId).toBe(
      "0000000000000001",
    );
  });
  it("exports a full selected-trace HTML viewer despite active filters and reports blocked downloads", async () => {
    await setup(true);
    change("trace.search", "payment provider");
    click("trace.viewer");
    expect(exported()).toContain("POST /checkout");
    expect(exported()).toContain("createOrder");
    expect(exported()).not.toContain("PRIVATE");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("trace.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["trace.downloadFailed"],
    );
  });
  it("paginates large captures and resets the page when searching", async () => {
    await setup();
    const root = JSON.parse(emptyTraceProject().source),
      first = root.resourceSpans[0].scopeSpans[0].spans[0];
    root.resourceSpans[0].scopeSpans[0].spans = Array.from(
      { length: 105 },
      (_, i) => ({
        ...first,
        spanId: (i + 1).toString(16).padStart(16, "0"),
        name: `span-${i}`,
      }),
    );
    change("trace.source", JSON.stringify(root));
    click("trace.save");
    expect(
      within(
        screen.getByRole("table", { name: en["trace.waterfall"] }),
      ).getAllByRole("row"),
    ).toHaveLength(101);
    click("trace.next");
    expect(
      within(
        screen.getByRole("table", { name: en["trace.waterfall"] }),
      ).getAllByRole("row"),
    ).toHaveLength(6);
    change("trace.search", "span-104");
    expect(button("trace.previous")).toBeDisabled();
    expect(
      within(
        screen.getByRole("table", { name: en["trace.waterfall"] }),
      ).getAllByRole("row"),
    ).toHaveLength(2);
  });
  it("runs the same demo and budget workflow with Russian labels", async () => {
    act(() => setAppLanguage("ru"));
    render(<TraceStudioPanel />);
    const ru = traceTranslations.ru;
    fireEvent.click(
      screen.getByText(ru["trace.title"], { selector: "summary" }),
    );
    await screen.findByLabelText(ru["trace.name"]);
    fireEvent.click(screen.getByRole("button", { name: ru["trace.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["trace.run"] }));
    expect(screen.getByRole("status")).toHaveTextContent("7/7");
    expect(
      screen.getByRole("table", { name: ru["trace.waterfall"] }),
    ).toBeInTheDocument();
  });
});
