import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MutationPanel } from "./mutation-panel";
import { setAppLanguage } from "./i18n-provider";
import { mutationTranslations } from "@/lib/mutation-translations";
import { demoMTProject } from "@/lib/mutation-demo";
import {
  emptyMTProject,
  MT_LIMITS,
  type MTProject,
} from "@/lib/mutation-model";
import { downloadTextFile } from "@/lib/schema-download";
import { serializeResponseAssertions } from "@/lib/response-assertions";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = mutationTranslations.en;
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
async function setup(demo = true) {
  const view = render(<MutationPanel />);
  expand("mt.title");
  await screen.findByRole("button", { name: en["mt.demo"] });
  if (demo) click("mt.demo");
  return view;
}
async function job(key: Key = "mt.run") {
  click(key);
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: en["mt.cancel"] }),
    ).not.toBeInTheDocument(),
  );
}
function exported() {
  return vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
}
function snapshot() {
  click("mt.exportProject");
  return JSON.parse(exported()) as MTProject;
}
function report() {
  click("mt.exportReport");
  return JSON.parse(exported());
}
function apply(project: MTProject) {
  expand("mt.source");
  change("mt.source", JSON.stringify(project));
  click("mt.apply");
}
function inspectFirst() {
  fireEvent.click(
    screen.getAllByRole("button", { name: /^Inspect mutant / })[0],
  );
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("API response mutation-testing studio", () => {
  it("compares weak and strict checks without requests, storage writes or project changes", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup();
    const before = snapshot();
    await job("mt.runAll");
    const results = report();
    expect(results.runs).toHaveLength(2);
    expect(results.runs[0].survived).toBeGreaterThan(0);
    expect(results.runs[1].score).toBe(100);
    expect(exported()).not.toMatch(
      /"replacement"\s*:|"expected"\s*:|"body"\s*:/,
    );
    change("mt.fixture", "strict");
    expect(screen.getByTestId("mt-score-summary")).toHaveTextContent(
      "Score 100%",
    );
    expect(snapshot()).toEqual(before);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects survivors, proposes a detecting check and improves the selected fault's result", async () => {
    await setup();
    await job();
    const before = report().runs[0],
      key = before.mutants.find(
        (m: { outcome: string }) => m.outcome === "survived",
      ).key;
    inspectFirst();
    const inspector = within(
      screen.getByRole("region", { name: en["mt.inspector"] }),
    );
    expect(
      inspector.getByRole("region", { name: en["mt.original"] }),
    ).toHaveTextContent('"name":"Ada"');
    click("mt.suggest");
    expect(screen.getByText(en["mt.suggestionHelp"])).toBeVisible();
    click("mt.addSuggestion");
    expect(snapshot().fixtures[0].checks.length).toBe(4);
    await job();
    expect(
      report().runs[0].mutants.find((m: { key: string }) => m.key === key)
        .outcome,
    ).toBe("killed");
  });
  it("requires waiver reasons, excludes the selected mutation, and can remove its waiver", async () => {
    await setup();
    await job();
    inspectFirst();
    click("mt.waive");
    expect(screen.getByRole("alert")).toHaveTextContent(en["mt.error.project"]);
    change("mt.waiverReason", "ID omission is accepted in this fixture");
    click("mt.waive");
    expect(snapshot().waivers).toHaveLength(1);
    await job();
    expect(report().runs[0].waived).toBe(1);
    change("mt.filter", "waived");
    inspectFirst();
    click("mt.unwaive");
    expect(snapshot().waivers).toEqual([]);
  });
  it("records all fixture budgets and detects a later weakened assertion set", async () => {
    await setup();
    await job("mt.runAll");
    click("mt.recordAll");
    const project = snapshot();
    expect(project.fixtures.every((f) => f.expectation !== null)).toBe(true);
    await job("mt.runAll");
    expect(report().runs.every((r: { matched: boolean }) => r.matched)).toBe(
      true,
    );
    project.fixtures[1].checks.find((c) => c.id === "body")!.enabled = false;
    apply(project);
    await job("mt.runAll");
    expect(
      report().runs.find((r: { fixtureId: string }) => r.fixtureId === "strict")
        .matched,
    ).toBe(false);
  });
  it("previews check reduction and disables redundant rules without deleting them", async () => {
    await setup();
    const project = demoMTProject();
    project.fixtures[1].checks.push({
      ...project.fixtures[1].checks[0],
      id: "redundant",
      pinned: false,
    });
    apply(project);
    change("mt.fixture", "strict");
    await job();
    click("mt.reduce");
    expect(screen.getByText(en["mt.reductionHelp"])).toBeVisible();
    click("mt.applyReduction");
    const check = snapshot().fixtures[1].checks.find(
      (c) => c.id === "redundant",
    );
    expect(check).toBeDefined();
    expect(check!.enabled).toBe(false);
    expect(
      snapshot().fixtures[1].checks.find((c) => c.id === "status")?.enabled,
    ).toBe(true);
    await job();
    expect(report().runs[0].score).toBe(100);
  });
  it("blocks invalid baselines and preserves results when an edited source cannot be applied", async () => {
    await setup();
    change("mt.status", "500");
    click("mt.applyFixture");
    await job();
    expect(screen.getByTestId("mt-score-summary")).toHaveTextContent(
      en["mt.blocked"],
    );
    const before = snapshot();
    expand("mt.source");
    change("mt.source", "{");
    click("mt.run");
    expect(screen.getByRole("alert")).toHaveTextContent(en["mt.dirty"]);
    const calls = vi.mocked(downloadTextFile).mock.calls.length;
    click("mt.exportRunner");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(calls);
    click("mt.apply");
    expect(screen.getByRole("alert")).toHaveTextContent(en["mt.error.project"]);
    click("mt.discard");
    expect(snapshot()).toEqual(before);
  });
  it("shows inconclusive evaluation errors and scope/truncation diagnostics", async () => {
    await setup();
    const project = demoMTProject();
    project.operators = ["invalid-json"];
    apply(project);
    change("mt.fixture", "strict");
    await job();
    expect(screen.getByTestId("mt-score-summary")).toHaveTextContent(
      "1 inconclusive",
    );
    change("mt.filter", "inconclusive");
    inspectFirst();
    expect(
      screen.getByRole("region", { name: en["mt.inspector"] }),
    ).toHaveTextContent("unreadable-body");
    project.operators = ["field-remove"];
    project.maxMutants = 1;
    apply(project);
    await job();
    expect(screen.getByText(en["mt.truncated"])).toBeVisible();
    project.fixtures[1].scope = "/missing";
    apply(project);
    await job();
    expect(screen.getByText(en["mt.diagnostic.scope-missing"])).toBeVisible();
  });
  it("imports existing assertion sets, authors new checks and supports undo/redo", async () => {
    await setup(false);
    expand("mt.checkImport");
    change(
      "mt.checkImportText",
      serializeResponseAssertions(
        emptyMTProject().fixtures[0].checks.map((c) => c.rule),
      ),
    );
    click("mt.importChecks");
    expect(snapshot().fixtures[0].checks).toHaveLength(2);
    change("mt.checkName", "ID is present");
    click("mt.addCheck");
    expect(snapshot().fixtures[0].checks).toHaveLength(3);
    click("mt.undo");
    expect(snapshot().fixtures[0].checks).toHaveLength(2);
    click("mt.redo");
    expect(snapshot().fixtures[0].checks).toHaveLength(3);
    click("mt.exportChecks");
    expect(JSON.parse(exported()).kind).toBe("rsswag-response-assertions");
  });
  it("cancels in-flight work and a delayed file restore while retaining previous data", async () => {
    await setup();
    await job();
    const score = screen.getByTestId("mt-score-summary").textContent;
    click("mt.run");
    click("mt.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole("status")).toHaveTextContent(en["mt.cancelled"]);
    expect(screen.getByTestId("mt-score-summary").textContent).toBe(score);
    let resolve!: (text: string) => void;
    const file = new File(["{}"], "project.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    fireEvent.change(screen.getByLabelText(en["mt.restore"]), {
      target: { files: [file] },
    });
    click("mt.cancel");
    await act(async () => resolve(JSON.stringify(emptyMTProject())));
    expect(snapshot()).toEqual(demoMTProject());
    const large = new File(["{}"], "big.json"),
      read = vi.fn();
    Object.defineProperty(large, "size", { value: MT_LIMITS.bytes + 1 });
    Object.defineProperty(large, "text", { value: read });
    fireEvent.change(screen.getByLabelText(en["mt.restore"]), {
      target: { files: [large] },
    });
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["mt.error.limit"]);
  });
  it("imports a documented OpenAPI response without calling its endpoint", async () => {
    const schema = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "API", version: "1" },
      paths: {
        "/users": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { type: "object" },
                    example: { id: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });
    const getSchemaText = vi.fn().mockReturnValue("openapi: [");
    render(<MutationPanel getSchemaText={getSchemaText} />);
    expand("mt.title");
    await screen.findByRole("button", { name: en["mt.demo"] });
    expand("mt.schema");
    click("mt.readSchema");
    expect(screen.getByRole("alert")).toHaveTextContent(en["mt.error.schema"]);
    getSchemaText.mockReturnValue(schema);
    click("mt.readSchema");
    click("mt.importResponse");
    const project = snapshot();
    expect(project.fixtures).toHaveLength(2);
    expect(project.fixtures[1].response.body).toContain('"id": 1');
    expect(getSchemaText).toHaveBeenCalledTimes(2);
  });
  it("filters mutants by check, clears search with Escape, retries downloads and switches language", async () => {
    await setup();
    await job();
    fireEvent.click(
      screen.getByRole("button", { name: "Show failures for check status" }),
    );
    expect(screen.getByLabelText(en["mt.checkFilter"])).toHaveValue("status");
    change("mt.search", "no-such-mutant");
    expect(screen.getByText(en["mt.noMutants"])).toBeVisible();
    fireEvent.keyDown(screen.getByLabelText(en["mt.search"]), {
      key: "Escape",
    });
    expect(screen.getByLabelText(en["mt.search"])).toHaveValue("");
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    click("mt.exportToolkit");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["mt.downloadFailed"],
    );
    click("mt.exportToolkit");
    expect(screen.getByRole("status")).toHaveTextContent(en["mt.downloaded"]);
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText(mutationTranslations.ru["mt.title"], {
        selector: "summary",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: mutationTranslations.ru["mt.run"] }),
    ).toBeVisible();
    expect(Object.keys(mutationTranslations.ru).sort()).toEqual(
      Object.keys(mutationTranslations.en).sort(),
    );
  });
});
