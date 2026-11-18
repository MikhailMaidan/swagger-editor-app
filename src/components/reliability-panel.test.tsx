import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReliabilityPanel } from "./reliability-panel";
import { reliabilityTranslations } from "@/lib/reliability-translations";
import { demoRLProject } from "@/lib/reliability-demo";
import {
  emptyRLProject,
  RL_LIMITS,
  type RLProject,
} from "@/lib/reliability-model";
import { downloadTextFile } from "@/lib/schema-download";
import { setAppLanguage } from "./i18n-provider";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = reliabilityTranslations.en;
type Key = keyof typeof en;
const click = (key: Key) =>
  fireEvent.click(screen.getByRole("button", { name: en[key] }));
const change = (key: Key, value: string) =>
  fireEvent.change(screen.getByLabelText(en[key]), { target: { value } });
function expand(key: Key) {
  const summary = screen.getByText(en[key], { selector: "summary" });
  if (!(summary.parentElement as HTMLDetailsElement).open)
    fireEvent.click(summary);
}
async function setup(demo = false) {
  const view = render(<ReliabilityPanel />);
  expand("rl.title");
  await screen.findByRole("button", { name: en["rl.demo"] });
  if (demo) click("rl.demo");
  return view;
}
async function job(key: Key = "rl.analyze") {
  click(key);
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: en["rl.cancel"] }),
    ).not.toBeInTheDocument(),
  );
}
function exported() {
  return vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
}
function snapshot() {
  click("rl.exportProject");
  return JSON.parse(exported()) as RLProject;
}
function report() {
  click("rl.exportReport");
  return JSON.parse(exported());
}
function apply(project: RLProject) {
  expand("rl.source");
  change("rl.source", JSON.stringify(project));
  click("rl.apply");
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("service reliability and failure-analysis studio", () => {
  it("analyzes shared-domain scenarios without requests, storage writes or model mutation", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    const before = snapshot();
    await job("rl.analyzeAll");
    const results = report();
    expect(results.cases).toHaveLength(5);
    expect(results.baseline.states).toBe(4096);
    expect(
      results.cases
        .find((c: { caseId: string }) => c.caseId === "regional-outage")
        .roots.find((r: { node: string }) => r.node === "service").availability,
    ).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects graph nodes by mouse/keyboard and repairs a manual outage", async () => {
    await setup();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Fail event Application" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Fail event Database" }),
    );
    const graphNode = screen.getByRole("button", {
      name: "Inspect dependency API service",
    });
    fireEvent.keyDown(graphNode, { key: "Enter" });
    const details = within(
      screen.getByRole("region", { name: en["rl.nodeDetails"] }),
    );
    expect(details.getByText("0/2 inputs healthy; requires 2.")).toBeVisible();
    await job("rl.findRepairs");
    expect(
      screen.getByRole("region", { name: en["rl.repairs"] }),
    ).toHaveTextContent("1 inclusion-minimal repair sets");
    fireEvent.click(
      screen.getByRole("button", { name: "Apply repair set 1 to graph" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Fail event Application" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Fail event Database" }),
    ).not.toBeChecked();
    expect(details.getByText("2/2 inputs healthy; requires 2.")).toBeVisible();
  });
  it("shows cut sets on the graph while preserving the probability analysis", async () => {
    await setup();
    await job();
    const original = report();
    fireEvent.click(
      screen.getByRole("button", { name: "Show failure combination 1" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Fail event Database" }),
    ).toBeChecked();
    expect(report()).toEqual(original);
    click("rl.captureOutage");
    const project = snapshot();
    expect(project.cases.at(-1)?.overrides).toEqual({ database: 0 });
    await job();
    expect(report().cases[0].roots[0].availability).toBe(0);
  });
  it("records scenario expectations and detects a changed probability", async () => {
    await setup();
    await job("rl.analyzeAll");
    click("rl.recordAll");
    const project = snapshot();
    expect(project.cases[0].expected).not.toBeNull();
    await job();
    expect(report().cases[0].matched).toBe(true);
    const node = project.nodes[0];
    if (node.kind === "event") node.probability = 0.5;
    apply(project);
    await job();
    expect(report().cases[0].matched).toBe(false);
  });
  it("authors nodes, protects dependencies and supports undo/redo", async () => {
    await setup();
    change("rl.nodeName", "Cache");
    change("rl.probability", "0.99");
    click("rl.addNode");
    const added = snapshot();
    expect(added.nodes.at(-1)?.name).toBe("Cache");
    change("rl.node", "app");
    click("rl.removeNode");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rl.error.reference"],
    );
    click("rl.undo");
    expect(snapshot().nodes).toHaveLength(3);
    click("rl.redo");
    expect(snapshot()).toEqual(added);
  });
  it("adds outputs with explicit expectation invalidation and allows independent scenario edits", async () => {
    await setup();
    await job();
    click("rl.record");
    change("rl.node", "app");
    click("rl.addOutput");
    const model = snapshot();
    expect(model.roots).toHaveLength(2);
    expect(model.cases[0].expected).toBeNull();
    click("rl.addCase");
    change("rl.caseName", "Database failure");
    change("rl.overrides", '{"database":0}');
    click("rl.applyCase");
    await job();
    expect(
      report().cases[0].roots.find(
        (r: { node: string }) => r.node === "service",
      ).availability,
    ).toBe(0);
    click("rl.showCase");
    expect(
      screen.getByRole("checkbox", { name: "Fail event Database" }),
    ).toBeChecked();
  });
  it("blocks stale source actions and applies malformed graph edits atomically", async () => {
    await setup();
    const before = snapshot(),
      count = vi.mocked(downloadTextFile).mock.calls.length;
    expand("rl.source");
    change("rl.source", "{");
    click("rl.analyze");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rl.dirty"]);
    click("rl.exportRunner");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(count);
    click("rl.apply");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rl.error.project"]);
    click("rl.discard");
    expect(snapshot()).toEqual(before);
    const cycle = emptyRLProject();
    cycle.nodes.push({
      id: "cycle",
      name: "Cycle",
      kind: "any",
      inputs: ["cycle"],
    });
    apply(cycle);
    expect(screen.getByRole("alert")).toHaveTextContent(en["rl.error.cycle"]);
    click("rl.discard");
    expect(snapshot()).toEqual(before);
  });
  it("cancels running analysis and delayed restores without replacing completed results", async () => {
    await setup();
    await job();
    const before = report();
    click("rl.analyze");
    click("rl.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole("status")).toHaveTextContent(en["rl.cancelled"]);
    expect(report()).toEqual(before);
    let resolve!: (text: string) => void;
    const file = new File(["{}"], "model.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    fireEvent.change(screen.getByLabelText(en["rl.restore"]), {
      target: { files: [file] },
    });
    click("rl.cancel");
    await act(async () => resolve(JSON.stringify(demoRLProject())));
    expect(snapshot()).toEqual(emptyRLProject());
    const large = new File(["{}"], "big.json"),
      read = vi.fn();
    Object.defineProperty(large, "size", { value: RL_LIMITS.bytes + 1 });
    Object.defineProperty(large, "text", { value: read });
    fireEvent.change(screen.getByLabelText(en["rl.restore"]), {
      target: { files: [large] },
    });
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["rl.error.limit"]);
  });
  it("copies only an OpenAPI operation label without changing the topology or editor", async () => {
    const getter = vi.fn().mockReturnValue("openapi: [");
    render(<ReliabilityPanel getSchemaText={getter} />);
    expand("rl.title");
    await screen.findByRole("button", { name: en["rl.demo"] });
    expand("rl.schema");
    click("rl.readSchema");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rl.error.schema"]);
    const original = snapshot();
    getter.mockReturnValue(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "API", version: "1" },
        paths: {
          "/orders": { get: { responses: { "200": { description: "OK" } } } },
        },
      }),
    );
    click("rl.readSchema");
    click("rl.useOperation");
    const project = snapshot();
    expect(project.roots[0].operation).toBe("GET /orders");
    expect(project.nodes).toEqual(original.nodes);
    expect(getter).toHaveBeenCalledTimes(2);
  });
  it("exports portable SVG/SDK files, retries failed downloads and switches language", async () => {
    await setup();
    click("rl.exportSvg");
    expect(exported()).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(exported()).toContain("API service");
    expect(exported()).not.toContain("onclick=");
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    click("rl.exportToolkit");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["rl.downloadFailed"],
    );
    click("rl.exportToolkit");
    expect(screen.getByRole("status")).toHaveTextContent(en["rl.downloaded"]);
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText(reliabilityTranslations.ru["rl.title"], {
        selector: "summary",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: reliabilityTranslations.ru["rl.analyze"],
      }),
    ).toBeVisible();
    expect(Object.keys(reliabilityTranslations.ru).sort()).toEqual(
      Object.keys(reliabilityTranslations.en).sort(),
    );
  });
});
