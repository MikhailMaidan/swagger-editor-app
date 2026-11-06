import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsistencyPanel } from "./consistency-panel";
import { consistencyTranslations } from "@/lib/consistency-translations";
import { demoLcProject } from "@/lib/consistency-demo";
import {
  emptyLcProject,
  MAX_LC_PROJECT,
  type LCProject,
} from "@/lib/consistency-model";
import { downloadTextFile } from "@/lib/schema-download";
import { setAppLanguage } from "./i18n-provider";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = consistencyTranslations.en;
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
  click("consistency.export");
  return JSON.parse(exported()) as LCProject;
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["consistency.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 10000 },
  );
}
async function job(key: Key) {
  click(key);
  await idle();
}
async function setup(demo = false) {
  const view = render(<ConsistencyPanel />);
  expand("consistency.title");
  await screen.findByRole("button", { name: en["consistency.demo"] });
  if (demo) click("consistency.demo");
  return view;
}
function applyProject(p: LCProject) {
  expand("consistency.source");
  change("consistency.source", JSON.stringify(p));
  click("consistency.apply");
}
function upload(
  source: string,
  options: { text?: () => Promise<string>; size?: number } = {},
) {
  const file = new File([source], "consistency.json");
  Object.defineProperty(file, "text", {
    value: options.text ?? (async () => source),
  });
  if (options.size !== undefined)
    Object.defineProperty(file, "size", { value: options.size });
  fireEvent.change(field("consistency.restore"), { target: { files: [file] } });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("API concurrency and consistency studio", () => {
  it("runs twelve regressions without network, storage or source changes and exports metadata reports", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    const initial = snapshot();
    await job("consistency.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "12/12 consistency expectations matched.",
    );
    click("consistency.report");
    expect(JSON.parse(exported()).runs).toHaveLength(12);
    expect(exported()).not.toMatch(/"input"\s*:|"output"\s*:|"client"\s*:/);
    expect(snapshot()).toEqual(initial);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects original operations, plays back witnesses and compares strict and weaker consistency", async () => {
    await setup(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect operation read" }),
    );
    expect(
      JSON.parse(
        (field("consistency.operationJson") as HTMLTextAreaElement).value,
      ).output,
    ).toBe(1);
    await job("consistency.run");
    const result = within(
      screen.getByRole("region", { name: en["consistency.analysis"] }),
    );
    expect(result.getByText("write → read")).toBeInTheDocument();
    fireEvent.change(result.getByLabelText(en["consistency.playback"]), {
      target: { value: "1" },
    });
    expect(result.getByText("2. read")).toBeInTheDocument();
    change("consistency.history", "stale");
    await job("consistency.compare");
    const comparison = within(
      screen.getByRole("region", { name: en["consistency.compare"] }),
    );
    expect(comparison.getByText(/linearizable: Violation/)).toBeInTheDocument();
    expect(comparison.getByText(/sequential: Compatible/)).toBeInTheDocument();
  });
  it("builds and edits operations atomically and retains undo/redo", async () => {
    await setup();
    change("consistency.method", "write");
    change("consistency.input", "1");
    click("consistency.addOperation");
    expect(snapshot().histories[0].operations[0]).toMatchObject({
      method: "write",
      input: 1,
      output: null,
      start: 0,
      end: 1,
    });
    change("consistency.method", "read");
    change("consistency.output", "1");
    click("consistency.addOperation");
    await job("consistency.run");
    expect(screen.getByRole("status")).toHaveTextContent("Compatible:");
    const initial = snapshot();
    const edited = {
      ...initial.histories[0].operations[1],
      client: initial.histories[0].operations[0].client,
      start: 0,
    };
    change("consistency.operationJson", JSON.stringify(edited));
    click("consistency.applyOperation");
    expect(screen.getByRole("alert")).toHaveTextContent("client-overlap");
    expect(snapshot()).toEqual(initial);
    click("consistency.deleteOperation");
    expect(snapshot().histories[0].operations).toHaveLength(1);
    click("consistency.undo");
    expect(snapshot().histories[0].operations).toHaveLength(2);
    click("consistency.redo");
    expect(snapshot().histories[0].operations).toHaveLength(1);
  });
  it("adds queue and counter models and permits history cloning without sharing edits", async () => {
    await setup();
    change("consistency.kind", "queue");
    change("consistency.initial", "[null]");
    click("consistency.addObject");
    expect(snapshot().objects[1]).toMatchObject({
      kind: "queue",
      initial: [null],
    });
    change("consistency.object", "object-1");
    change("consistency.method", "dequeue");
    click("consistency.addOperation");
    await job("consistency.run");
    expect(screen.getByRole("status")).toHaveTextContent("Compatible:");
    click("consistency.cloneHistory");
    expect(snapshot().histories).toHaveLength(2);
    click("consistency.deleteOperation");
    expect(snapshot().histories[0].operations).toHaveLength(1);
    expect(snapshot().histories[1].operations).toHaveLength(0);
    change("consistency.kind", "counter");
    change("consistency.initial", "5");
    click("consistency.addObject");
    expect(snapshot().objects[2]).toMatchObject({
      kind: "counter",
      initial: 5,
    });
  });
  it("distinguishes search limits from violations, blocks recording incomplete searches, and can raise the budget", async () => {
    await setup(true);
    change("consistency.budget", "1");
    click("consistency.applyBudget");
    await job("consistency.run");
    expect(screen.getByRole("status")).toHaveTextContent("Inconclusive:");
    expect(
      screen.getByRole("button", { name: en["consistency.record"] }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: en["consistency.prefix"] }),
    ).toBeDisabled();
    change("consistency.budget", "20000");
    click("consistency.applyBudget");
    await job("consistency.run");
    click("consistency.record");
    expect(snapshot().histories[0].expected).toBe("valid");
  });
  it("finds and saves an earlier failing event prefix without removing supporting writes", async () => {
    await setup(true);
    const p = demoLcProject();
    p.histories = [p.histories[1]];
    p.histories[0].operations.push({
      ...p.histories[0].operations[1],
      id: "later",
      client: "later",
      start: 5,
      end: 6,
      output: 1,
    });
    applyProject(p);
    await job("consistency.run");
    const before = snapshot();
    await job("consistency.prefix");
    expect(screen.getByRole("status")).toHaveTextContent("cutoff: 4");
    expect(snapshot()).toEqual(before);
    click("consistency.savePrefix");
    const saved = snapshot().histories[1];
    expect(saved.expected).toBe("invalid");
    expect(saved.operations.map((op) => op.id)).toEqual(["write", "read"]);
    expect(snapshot().histories[0]).toEqual(before.histories[0]);
  });
  it("imports operations and requires explicit consent before applying a partial HAR", async () => {
    await setup();
    const op = {
      id: "read",
      client: "a",
      objectId: "value",
      method: "read",
      start: 0,
      end: 1,
      input: null,
      output: 0,
    };
    change("consistency.importText", JSON.stringify(op));
    click("consistency.importOperations");
    expect(snapshot().histories[0].operations).toEqual([op]);
    change("consistency.format", "har");
    change(
      "consistency.importText",
      JSON.stringify({
        log: {
          entries: [
            {
              startedDateTime: "2026-01-01T00:00:00Z",
              time: 1,
              request: { method: "GET", url: "https://example.test/value" },
              response: { status: 200, content: { text: '{"value":0}' } },
            },
            {},
          ],
        },
      }),
    );
    click("consistency.inspectHar");
    expect(
      screen.getByText("Mapped operations: 1; skipped entries: 1."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: en["consistency.applyHar"] }),
    ).toBeDisabled();
    fireEvent.click(field("consistency.partial"));
    click("consistency.applyHar");
    expect(snapshot().histories[0].operations[0].id).toBe("capture-1");
  });
  it("protects dirty drafts and rejects invalid source without losing applied data", async () => {
    await setup(true);
    const before = snapshot();
    expand("consistency.source");
    change("consistency.source", "{");
    click("consistency.run");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["consistency.dirty"],
    );
    click("consistency.apply");
    expect(screen.getByRole("alert")).toHaveTextContent("json");
    click("consistency.discard");
    expect(snapshot()).toEqual(before);
    expand("consistency.objectJson");
    change("consistency.objectJson", "[]");
    click("consistency.applyObjects");
    expect(screen.getByRole("alert")).toHaveTextContent("project");
    expect(snapshot()).toEqual(before);
  });
  it("cancels analysis and late file imports, checks both file bounds, and ignores completion after unmount", async () => {
    const view = await setup(true),
      before = snapshot();
    click("consistency.runAll");
    click("consistency.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      en["consistency.cancelled"],
    );
    expect(
      screen.queryByRole("button", { name: en["consistency.report"] }),
    ).not.toBeInTheDocument();
    expect(snapshot()).toEqual(before);
    let finish!: (text: string) => void;
    upload("{}", {
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    click("consistency.cancel");
    await act(async () => finish(JSON.stringify(emptyLcProject())));
    expect(snapshot()).toEqual(before);
    upload("{}", { size: MAX_LC_PROJECT + 1 });
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent("limit");
    upload("{}", { text: async () => " ".repeat(MAX_LC_PROJECT + 1) });
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent("limit");
    upload("{}", {
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    view.unmount();
    await act(async () => finish(JSON.stringify(emptyLcProject())));
  });
  it("restores source-only projects, exports runtime/runner/SVG artifacts and reports blocked downloads", async () => {
    await setup();
    upload(JSON.stringify({ ...demoLcProject(), results: ["forged"] }));
    await idle();
    expect(snapshot()).toEqual(demoLcProject());
    click("consistency.sdk");
    expect(exported()).toContain("export async function analyzeConsistency");
    expect(exported()).not.toContain("Concurrent API correctness examples");
    click("consistency.runner");
    expect(exported()).toContain("process.exitCode");
    click("consistency.svg");
    expect(
      new DOMParser()
        .parseFromString(exported(), "image/svg+xml")
        .querySelector("parsererror"),
    ).toBeNull();
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("consistency.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["consistency.downloadError"],
    );
  });
  it("localizes the controls into Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByRole("button", {
        name: consistencyTranslations.ru["consistency.run"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(consistencyTranslations.ru["consistency.client"]),
    ).toBeInTheDocument();
    act(() => setAppLanguage("en"));
  });
});
