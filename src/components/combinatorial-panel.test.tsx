import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CombinatorialPanel } from "./combinatorial-panel";
import { setAppLanguage } from "./i18n-provider";
import { combinatorialTranslations } from "@/lib/combinatorial-translations";
import { demoCTProject } from "@/lib/combinatorial-demo";
import {
  emptyCTProject,
  CT_LIMITS,
  type CTProject,
} from "@/lib/combinatorial-model";
import { downloadTextFile } from "@/lib/schema-download";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = combinatorialTranslations.en;
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
  const view = render(<CombinatorialPanel />);
  expand("ct.title");
  await screen.findByRole("button", { name: en["ct.demo"] });
  if (demo) click("ct.demo");
  return view;
}
async function job(key: Key) {
  click(key);
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: en["ct.cancel"] }),
    ).not.toBeInTheDocument(),
  );
}
function exported() {
  return vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
}
function snapshot() {
  click("ct.exportProject");
  return JSON.parse(exported()) as CTProject;
}
function apply(project: CTProject) {
  expand("ct.source");
  change("ct.source", JSON.stringify(project));
  click("ct.apply");
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("combinatorial test-design studio", () => {
  it("generates complete constrained coverage without network, storage writes or project mutation", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup();
    const before = snapshot();
    await job("ct.generate");
    expect(screen.getByTestId("ct-coverage-summary")).toHaveTextContent(
      "(100%)",
    );
    expect(screen.getByTestId("ct-coverage-summary")).toHaveTextContent(
      "0 selected tests violate constraints",
    );
    expect(snapshot()).toEqual(before);
    click("ct.exportReport");
    expect(JSON.parse(exported()).complete).toBe(true);
    expect(exported()).not.toMatch(/"value"\s*:|"label"\s*:/);
    click("ct.exportSuite");
    expect(JSON.parse(exported()).rows[0]).toEqual(before.rows[0]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("audits selection gaps and extends the selected tests without discarding them", async () => {
    await setup();
    await job("ct.generate");
    const checkbox = screen
      .getAllByRole("checkbox", { name: /^Include case / })
      .find((el) => !(el as HTMLInputElement).disabled)!;
    fireEvent.click(checkbox);
    expect(screen.getByTestId("ct-coverage-summary")).not.toHaveTextContent(
      "(100%)",
    );
    click("ct.exportSuite");
    const retained = JSON.parse(exported()).rows;
    await job("ct.repair");
    expect(screen.getByTestId("ct-coverage-summary")).toHaveTextContent(
      "(100%)",
    );
    click("ct.exportSuite");
    expect(JSON.parse(exported()).rows.slice(0, retained.length)).toEqual(
      retained,
    );
    fireEvent.change(screen.getByLabelText(en["ct.filter"]), {
      target: { value: "covered" },
    });
    const interactions = within(
      screen.getByRole("region", { name: en["ct.interactions"] }),
    );
    const caseButton = interactions
      .getAllByRole("button")
      .find((el) => el.textContent === "smoke")!;
    fireEvent.click(caseButton);
    expect(
      screen.getByRole("region", { name: en["ct.caseDetails"] }),
    ).toHaveTextContent('"id": "smoke"');
  });
  it("pins cases, explicitly adopts generated rows, and supports undo/redo", async () => {
    await setup();
    await job("ct.generate");
    expect(
      screen.getByRole("checkbox", { name: "Include case smoke" }),
    ).toBeDisabled();
    const pin = screen
      .getAllByRole("checkbox", { name: /^Pin case / })
      .find((el) => !(el as HTMLInputElement).checked)!;
    fireEvent.click(pin);
    const id = pin.getAttribute("aria-label")!.replace("Pin case ", "");
    expect(
      screen.getByRole("checkbox", { name: `Include case ${id}` }),
    ).toBeDisabled();
    await job("ct.generate");
    expect(
      screen.getByRole("checkbox", { name: `Pin case ${id}` }),
    ).toBeChecked();
    click("ct.adopt");
    const saved = snapshot();
    expect(saved.rows.length).toBeGreaterThan(1);
    expect(saved.rows.find((r) => r.id === id)?.pinned).toBe(true);
    click("ct.undo");
    expect(snapshot().rows).toEqual(demoCTProject().rows);
    click("ct.redo");
    expect(snapshot()).toEqual(saved);
  });
  it("guards pending source edits and retains the committed project after invalid apply", async () => {
    await setup();
    const before = snapshot(),
      calls = vi.mocked(downloadTextFile).mock.calls.length;
    expand("ct.source");
    change("ct.source", "{");
    click("ct.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(en["ct.dirty"]);
    click("ct.exportProject");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(calls);
    click("ct.apply");
    expect(screen.getByRole("alert")).toHaveTextContent(en["ct.error.project"]);
    click("ct.discard");
    expect(snapshot()).toEqual(before);
  });
  it("authors new choices and constraints and protects referenced variables", async () => {
    await setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove input variable plan" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["ct.error.reference"],
    );
    change("ct.values", "[1,1]");
    click("ct.addVariable");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["ct.error.duplicate"],
    );
    change("ct.values", "[0,1]");
    change("ct.variableName", "Retry mode");
    click("ct.addVariable");
    const withVariable = snapshot();
    expect(withVariable.variables.at(-1)?.name).toBe("Retry mode");
    expect(
      withVariable.rows[0].choices[withVariable.variables.at(-1)!.id],
    ).toBe("value-1");
    change("ct.constraintName", "New forbidden pair");
    click("ct.addConstraint");
    expect(snapshot().constraints.at(-1)?.name).toBe("New forbidden pair");
  });
  it("imports assignment CSV and retains its pinned test during generation", async () => {
    await setup(false);
    expand("ct.rowsImport");
    change("ct.rowsFormat", "csv");
    change(
      "ct.rowsText",
      "case_id,pinned,choice:a,choice:b,choice:c\nexisting,true,true,false,true\n",
    );
    click("ct.importRows");
    await job("ct.generate");
    expect(
      screen.getByRole("checkbox", { name: "Include case existing" }),
    ).toBeDisabled();
    click("ct.exportCsv");
    expect(exported()).toContain("existing,true,true,false,true");
    click("ct.exportNdjson");
    expect(exported()).toContain('"values":{"a":true,"b":false,"c":true}');
  });
  it("reports invalid pinned tests and preserves audit results when generation fails", async () => {
    await setup();
    const p = demoCTProject();
    p.rows[0].choices.plan = "enterprise";
    apply(p);
    await job("ct.analyze");
    expect(screen.getByTestId("ct-coverage-summary")).toHaveTextContent(
      "1 selected tests violate constraints",
    );
    await job("ct.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["ct.error.invalid-row"],
    );
    expect(screen.getByTestId("ct-coverage-summary")).toHaveTextContent(
      "1 selected tests violate constraints",
    );
  });
  it("cancels new work without clearing a completed suite", async () => {
    await setup();
    await job("ct.generate");
    const summary = screen.getByTestId("ct-coverage-summary").textContent;
    click("ct.generate");
    click("ct.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole("status")).toHaveTextContent(en["ct.cancelled"]);
    expect(screen.getByTestId("ct-coverage-summary").textContent).toBe(summary);
  });
  it("ignores a cancelled asynchronous restore and rejects oversized files before reading", async () => {
    await setup();
    let resolve!: (value: string) => void;
    const file = new File(["{}"], "project.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    fireEvent.change(screen.getByLabelText(en["ct.restore"]), {
      target: { files: [file] },
    });
    click("ct.cancel");
    await act(async () => resolve(JSON.stringify(emptyCTProject())));
    expect(snapshot()).toEqual(demoCTProject());
    const big = new File(["{}"], "big.json"),
      read = vi.fn();
    Object.defineProperty(big, "size", { value: CT_LIMITS.bytes + 1 });
    Object.defineProperty(big, "text", { value: read });
    fireEvent.change(screen.getByLabelText(en["ct.restore"]), {
      target: { files: [big] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(en["ct.error.limit"]);
    expect(read).not.toHaveBeenCalled();
  });
  it("imports an operation snapshot without changing the editor and handles invalid schemas", async () => {
    const getSchemaText = vi.fn().mockReturnValue("openapi: [");
    render(<CombinatorialPanel getSchemaText={getSchemaText} />);
    expand("ct.title");
    await screen.findByRole("button", { name: en["ct.demo"] });
    expand("ct.schema");
    click("ct.readSchema");
    expect(screen.getByRole("alert")).toHaveTextContent(en["ct.error.schema"]);
    getSchemaText.mockReturnValue(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Catalog", version: "1" },
        paths: {
          "/flags": {
            get: {
              parameters: [
                { name: "enabled", in: "query", schema: { type: "boolean" } },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    click("ct.readSchema");
    click("ct.importOperation");
    const imported = snapshot();
    expect(imported.strength).toBe(1);
    expect(imported.variables).toHaveLength(1);
    expect(imported.variables[0].choices).toHaveLength(3);
    expect(getSchemaText).toHaveBeenCalledTimes(2);
  });
  it("supports download recovery and switches all studio labels to Russian", async () => {
    await setup();
    await job("ct.generate");
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    click("ct.exportVerifier");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["ct.downloadFailed"],
    );
    click("ct.exportVerifier");
    expect(screen.getByRole("status")).toHaveTextContent(en["ct.downloaded"]);
    expect(exported()).toContain("const manifest");
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText(combinatorialTranslations.ru["ct.title"], {
        selector: "summary",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: combinatorialTranslations.ru["ct.generate"],
      }),
    ).toBeVisible();
    expect(Object.keys(combinatorialTranslations.ru).sort()).toEqual(
      Object.keys(combinatorialTranslations.en).sort(),
    );
  });
});
