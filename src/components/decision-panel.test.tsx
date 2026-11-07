import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "./decision-panel";
import { decisionTranslations } from "@/lib/decision-translations";
import { demoDtProject } from "@/lib/decision-demo";
import {
  emptyDtProject,
  MAX_DT_PROJECT,
  type DTProject,
} from "@/lib/decision-model";
import { downloadTextFile } from "@/lib/schema-download";
import { setAppLanguage } from "./i18n-provider";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = decisionTranslations.en;
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
  click("decision.export");
  return JSON.parse(exported()) as DTProject;
}
async function idle() {
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["decision.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 15000 },
  );
}
async function job(key: Key) {
  click(key);
  await idle();
}
async function setup(demo = false) {
  const view = render(<DecisionPanel />);
  expand("decision.title");
  await screen.findByRole("button", { name: en["decision.demo"] });
  if (demo) click("decision.demo");
  return view;
}
function applyProject(p: DTProject) {
  expand("decision.source");
  change("decision.source", JSON.stringify(p));
  click("decision.apply");
}
function upload(
  source: string,
  options: { text?: () => Promise<string>; size?: number } = {},
) {
  const file = new File([source], "decisions.json");
  Object.defineProperty(file, "text", {
    value: options.text ?? (async () => source),
  });
  if (options.size !== undefined)
    Object.defineProperty(file, "size", { value: options.size });
  fireEvent.change(field("decision.restore"), { target: { files: [file] } });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("decision-table automation studio", () => {
  it("runs twelve regressions without network, storage or source changes and exports value-free reports", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    const before = snapshot();
    await job("decision.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "12/12 decision expectations matched.",
    );
    click("decision.report");
    expect(JSON.parse(exported()).runs).toHaveLength(12);
    expect(exported()).not.toMatch(/"context"\s*:|"output"\s*:|"value"\s*:/);
    expect(snapshot()).toEqual(before);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("explains root and dependency matches and navigates the decision graph", async () => {
    await setup(true);
    await job("decision.run");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Decision shipping: Matched;",
    );
    const explanation = within(
      screen.getByRole("region", { name: en["decision.explanation"] }),
    );
    expect(
      explanation.getByText("eu-standard", { selector: "td" }),
    ).toBeInTheDocument();
    fireEvent.change(explanation.getByLabelText(en["decision.traceDecision"]), {
      target: { value: "membership" },
    });
    expect(
      explanation.getByText('"standard"', { selector: "pre" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect decision membership" }),
    );
    expect(field("decision.table")).toHaveValue("membership");
    expect(
      screen.queryByRole("region", { name: en["decision.explanation"] }),
    ).not.toBeInTheDocument();
  });
  it("authors rows and columns, rejects cyclic references atomically and preserves rule meaning when columns are added", async () => {
    await setup();
    change(
      "decision.when",
      '[{"op":"range","min":0,"max":100,"minInclusive":true,"maxInclusive":true}]',
    );
    change("decision.outputExpr", '{"op":"literal","value":"small"}');
    click("decision.addRule");
    await job("decision.run");
    expect(
      within(
        screen.getByRole("region", { name: en["decision.explanation"] }),
      ).getByText('"small"'),
    ).toBeInTheDocument();
    expand("decision.columns");
    click("decision.addColumn");
    const before = snapshot();
    expect(before.decisions[0].columns).toHaveLength(2);
    expect(before.decisions[0].rules[0].when[1]).toEqual({ op: "any" });
    change("decision.columnSource", "decision:decision");
    click("decision.addColumn");
    expect(screen.getByRole("alert")).toHaveTextContent("reference");
    expect(snapshot()).toEqual(before);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove column column-1" }),
    );
    expect(snapshot().decisions[0].rules[0].when).toHaveLength(1);
  });
  it("supports first-hit row ordering, clone isolation and reversible edits", async () => {
    await setup(true);
    change("decision.table", "membership");
    const before = snapshot();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule loyal" }));
    click("decision.down");
    expect(
      snapshot()
        .decisions[0].rules.slice(0, 2)
        .map((r) => r.id),
    ).toEqual(["known", "loyal"]);
    change("decision.context", '{"member":true}');
    await job("decision.run");
    expect(
      within(
        screen.getByRole("region", { name: en["decision.explanation"] }),
      ).getByText('"standard"'),
    ).toBeInTheDocument();
    click("decision.undo");
    expect(snapshot()).toEqual(before);
    click("decision.redo");
    expect(snapshot().decisions[0].rules[0].id).toBe("known");
    click("decision.cloneTable");
    click("decision.deleteRule");
    expect(snapshot().decisions[0].rules).toHaveLength(4);
    expect(snapshot().decisions.at(-1)!.rules).toHaveLength(3);
  });
  it("shows exact catalog coverage and reports counts without leaking sample contexts", async () => {
    await setup(true);
    const before = snapshot();
    await job("decision.analyze");
    const coverage = within(
      screen.getByRole("region", { name: en["decision.coverage"] }),
    );
    expect(coverage.getByText(en["decision.complete"])).toBeInTheDocument();
    expect(
      coverage.getByText("Checked 48/48 catalog contexts; overlaps: 0."),
    ).toBeInTheDocument();
    expect(coverage.getByText("No match: 16")).toBeInTheDocument();
    click("decision.coverageReport");
    expect(JSON.parse(exported())).toMatchObject({
      checked: 48,
      complete: true,
      overlaps: 0,
    });
    expect(exported()).not.toContain('"context"');
    fireEvent.click(
      coverage.getAllByRole("button", { name: /Load coverage example/ })[0],
    );
    expect(
      JSON.parse((field("decision.context") as HTMLTextAreaElement).value)
        .region,
    ).toBe("APAC");
    expect(snapshot()).toEqual(before);
  });
  it("finds and adopts a catalog optimum without changing source and exports metadata only", async () => {
    await setup(true);
    const before = snapshot();
    await job("decision.search");
    const counter = within(
      screen.getByRole("region", { name: en["decision.counter"] }),
    );
    expect(
      counter.getByText("Proven catalog optimum · Change cost: 1"),
    ).toBeInTheDocument();
    click("decision.counterReport");
    expect(JSON.parse(exported()).best).toEqual({
      cost: 1,
      changedInputs: ["subtotal"],
      status: "matched",
    });
    expect(exported()).not.toMatch(/"context"\s*:|"value"\s*:|"output"\s*:/);
    click("decision.adopt");
    expect(
      JSON.parse((field("decision.context") as HTMLTextAreaElement).value)
        .subtotal,
    ).toBe(100);
    expect(snapshot()).toEqual(before);
    await job("decision.run");
    expect(
      within(
        screen.getByRole("region", { name: en["decision.explanation"] }),
      ).getByText("0", { selector: "pre" }),
    ).toBeInTheDocument();
  });
  it("records the actual evaluated context even after the draft changes and supports exact output expectations", async () => {
    await setup(true);
    await job("decision.run");
    change("decision.context", '{"region":"EU","subtotal":999,"member":true}');
    fireEvent.click(field("decision.exact"));
    click("decision.record");
    const saved = snapshot().cases.at(-1)!;
    expect(saved.context.subtotal).toBe(50);
    expect(saved.expect).toMatchObject({
      status: "matched",
      output: 10,
      selected: ["eu-standard"],
    });
    await job("decision.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "13/13 decision expectations matched.",
    );
    expand("decision.caseJson");
    const edited = { ...saved, expect: { status: "matched", output: 999 } };
    change("decision.caseJson", JSON.stringify(edited));
    click("decision.applyCase");
    await job("decision.runAll");
    expect(screen.getByRole("status")).toHaveTextContent(
      "12/13 decision expectations matched.",
    );
  });
  it("imports contexts as unchecked cases and rejects invalid definitions and dirty project drafts without data loss", async () => {
    await setup(true);
    const before = snapshot();
    change("decision.importText", '{"region":"EU","subtotal":42}');
    click("decision.importContexts");
    expect(snapshot().cases.at(-1)).toMatchObject({
      context: { region: "EU", subtotal: 42 },
      expect: null,
    });
    const imported = snapshot();
    change("decision.importText", '{"region":"EU"}');
    click("decision.importContexts");
    expect(screen.getByRole("alert")).toHaveTextContent("context");
    expect(snapshot()).toEqual(imported);
    expand("decision.source");
    change("decision.source", "{");
    click("decision.run");
    expect(screen.getByRole("alert")).toHaveTextContent(en["decision.dirty"]);
    click("decision.apply");
    expect(screen.getByRole("alert")).toHaveTextContent("json");
    click("decision.discard");
    expect(snapshot()).toEqual(imported);
    applyProject(before);
    expect(snapshot()).toEqual(before);
    expand("decision.inputJson");
    change("decision.inputJson", "[]");
    click("decision.applyInputs");
    expect(screen.getByRole("alert")).toHaveTextContent("reference");
    expect(snapshot()).toEqual(before);
  });
  it("adds typed inputs and permits only atomic policy/fallback changes", async () => {
    await setup();
    change("decision.inputType", "boolean");
    click("decision.addInput");
    expect(snapshot().inputs[1]).toMatchObject({
      type: "boolean",
      catalog: [
        { present: true, value: false },
        { present: true, value: true },
      ],
    });
    expand("decision.fallback");
    change("decision.fallback", '{"op":"literal","value":"fallback"}');
    click("decision.applyFallback");
    await job("decision.run");
    expect(screen.getByRole("status")).toHaveTextContent("Fallback");
    click("decision.newTable");
    expect(snapshot().decisions).toHaveLength(2);
    click("decision.deleteTable");
    expect(snapshot().decisions).toHaveLength(1);
  });
  it("cancels catalog work and late imports, enforces declared and actual file sizes, and ignores unmount completion", async () => {
    const view = await setup(true),
      before = snapshot();
    click("decision.analyze");
    click("decision.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      en["decision.cancelled"],
    );
    expect(
      screen.queryByRole("button", { name: en["decision.coverageReport"] }),
    ).not.toBeInTheDocument();
    expect(snapshot()).toEqual(before);
    let finish!: (text: string) => void;
    upload("{}", {
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    click("decision.cancel");
    await act(async () => finish(JSON.stringify(emptyDtProject())));
    expect(snapshot()).toEqual(before);
    upload("{}", { size: MAX_DT_PROJECT + 1 });
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent("limit");
    upload("{}", { text: async () => " ".repeat(MAX_DT_PROJECT + 1) });
    await idle();
    expect(screen.getByRole("alert")).toHaveTextContent("limit");
    upload("{}", {
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    view.unmount();
    await act(async () => finish(JSON.stringify(emptyDtProject())));
  });
  it("restores source-only projects with usable initial context, exports portable artifacts and reports blocked downloads", async () => {
    await setup();
    upload(JSON.stringify({ ...demoDtProject(), result: "forged" }));
    await idle();
    expect(snapshot()).toEqual(demoDtProject());
    await job("decision.run");
    expect(screen.getByRole("status")).toHaveTextContent("Matched");
    click("decision.sdk");
    expect(exported()).toContain("export function createDecisionEvaluator");
    expect(exported()).not.toContain("Shipping decision automation");
    click("decision.service");
    expect(exported()).toContain("export const handler");
    click("decision.contract");
    expect(JSON.parse(exported()).openapi).toBe("3.1.0");
    click("decision.runner");
    expect(exported()).toContain("process.exitCode");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("decision.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["decision.downloadError"],
    );
  });
  it("localizes decision controls into Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByRole("button", {
        name: decisionTranslations.ru["decision.run"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(decisionTranslations.ru["decision.context"]),
    ).toBeInTheDocument();
    act(() => setAppLanguage("en"));
  });
});
