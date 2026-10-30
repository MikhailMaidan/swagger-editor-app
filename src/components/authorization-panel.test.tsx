import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationPanel } from "./authorization-panel";
import { setAppLanguage } from "./i18n-provider";
import { authzTranslations } from "@/lib/authz-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_AUTHZ_BYTES,
  emptyAuthzProject,
  newAuthzCase,
  serializeAuthzProject,
} from "@/lib/authz-project";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = authzTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]);
const button = (key: Key) => screen.getByRole("button", { name: en[key] });
const click = (key: Key) => fireEvent.click(button(key));
const change = (key: Key, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const value = (key: Key) => (field(key) as HTMLInputElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = false) {
  const view = render(
    <AuthorizationPanel getSchemaText={() => DEFAULT_OPENAPI_SCHEMA} />,
  );
  fireEvent.click(screen.getByText(en["authz.title"], { selector: "summary" }));
  await screen.findByLabelText(en["authz.name"]);
  if (demo) click("authz.demo");
  return view;
}
async function job(key: "authz.runAll" | "authz.runCase") {
  click(key);
  await waitFor(
    () =>
      expect(
        screen.queryByText(en["authz.busy"], { exact: false }),
      ).not.toBeInTheDocument(),
    { timeout: 5000 },
  );
}
function file(source: string, text?: () => Promise<string>, size?: number) {
  const input = new File([source], "access.json", { type: "application/json" });
  Object.defineProperty(input, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(input, "size", { value: size });
  fireEvent.change(field("authz.import"), { target: { files: [input] } });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("authorization policy studio", () => {
  it("runs 36 demo expectations offline and exports aggregate/detail reports without attributes or action labels", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("authz.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("36/36");
    expect(
      within(
        screen.getByRole("table", { name: en["authz.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(4);
    click("authz.report");
    expect(JSON.parse(exported()).policies[0].rows).toBeUndefined();
    fireEvent.click(field("authz.includeDetails"));
    click("authz.report");
    expect(JSON.parse(exported()).policies[0].rows).toHaveLength(12);
    for (const secret of ["tenant-a", "document-a", "alice", "documents:read"])
      expect(exported()).not.toContain(secret);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects explicit denies and filters policy differences, decisions and case search", async () => {
    await setup(true);
    await job("authz.runAll");
    change("authz.result", "owner");
    fireEvent.click(
      screen.getByRole("button", {
        name: en["authz.inspect"].replace("{name}", "suspended-owner"),
      }),
    );
    expect(JSON.parse(value("authz.inspection")).decision).toMatchObject({
      reason: "explicit-deny",
      matchedAllow: ["owner-write"],
    });
    fireEvent.click(field("authz.changedOnly"));
    expect(
      within(
        screen.getByRole("table", { name: en["authz.caseRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(5);
    change("authz.filter", "allow");
    expect(
      within(
        screen.getByRole("table", { name: en["authz.caseRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(2);
    change("authz.search", "missing");
    expect(
      within(
        screen.getByRole("table", { name: en["authz.caseRows"] }),
      ).getAllByRole("row"),
    ).toHaveLength(1);
    change("authz.result", "roles");
    expect(field("authz.search")).toHaveValue("");
    expect(field("authz.changedOnly")).not.toBeChecked();
  });
  it("protects invalid drafts and saved selections until save/discard", async () => {
    await setup();
    change("authz.conditions", "[");
    for (const key of [
      "authz.demo",
      "authz.new",
      "authz.export",
      "authz.exportGuard",
      "authz.runAll",
    ] as const)
      expect(button(key)).toBeDisabled();
    expect(field("authz.policy")).toBeDisabled();
    expect(field("authz.case")).toBeDisabled();
    click("authz.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["authz.error.json"]);
    expect(field("authz.conditions")).toHaveValue("[");
    click("authz.discard");
    expect(JSON.parse(value("authz.conditions"))).toHaveLength(1);
    change("authz.expect", '{"policy-1":"deny"}');
    click("authz.save");
    await job("authz.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("0/1");
    expect(
      screen.getByRole("table", { name: en["authz.results"] }),
    ).toHaveTextContent("1/1");
  });
  it("builds typed conditions and retains invalid pointer/literal edits without corrupting the rule", async () => {
    await setup();
    fireEvent.click(
      screen.getByText(en["authz.builder"], { selector: "summary" }),
    );
    click("authz.appendRole");
    expect(JSON.parse(value("authz.conditions"))).toHaveLength(2);
    change("authz.operator", "greaterOrEqual");
    change("authz.leftSource", "literal");
    change("authz.leftValue", "2");
    change("authz.rightValue", "1");
    click("authz.appendCondition");
    expect(JSON.parse(value("authz.conditions"))[2]).toMatchObject({
      operator: "greaterOrEqual",
      left: { source: "literal", value: 2 },
    });
    change("authz.leftSource", "subject");
    change("authz.leftValue", "/invalid~2");
    click("authz.appendCondition");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["authz.error.pointer"],
    );
    expect(JSON.parse(value("authz.conditions"))).toHaveLength(3);
    click("authz.save");
    await job("authz.runCase");
    expect(screen.getByRole("status")).toHaveTextContent("unchecked: 1");
    change("authz.mode", "any");
    change("authz.conditions", "[]");
    click("authz.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["authz.error.project"],
    );
  });
  it("supports policy/rule CRUD, copies expectations on policy duplication and removes only deleted expectations", async () => {
    await setup();
    change("authz.expect", '{"policy-1":"allow"}');
    click("authz.save");
    click("authz.clonePolicy");
    expect(field("authz.policy")).toHaveValue("policy-2");
    expect(JSON.parse(value("authz.expect"))).toEqual({
      "policy-1": "allow",
      "policy-2": "allow",
    });
    click("authz.setBaseline");
    click("authz.export");
    expect(JSON.parse(exported()).policies[0].id).toBe("policy-2");
    click("authz.cloneRule");
    expect(field("authz.rule")).toHaveValue("rule-2");
    click("authz.deleteRule");
    click("authz.deleteRule");
    expect(screen.getByText(en["authz.noRules"])).toBeInTheDocument();
    await job("authz.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("1/2");
    click("authz.addRule");
    expect(field("authz.rule")).toHaveValue("rule-1");
    click("authz.deletePolicy");
    expect(JSON.parse(value("authz.expect"))).toEqual({ "policy-1": "allow" });
    expect(button("authz.deletePolicy")).toBeDisabled();
  });
  it("supports case CRUD down to an empty project and recovers without losing policies", async () => {
    await setup();
    click("authz.cloneCase");
    expect(field("authz.case")).toHaveValue("case-2");
    click("authz.deleteCase");
    click("authz.deleteCase");
    expect(screen.getByText(en["authz.noCases"])).toBeInTheDocument();
    expect(button("authz.runAll")).toBeDisabled();
    click("authz.export");
    expect(JSON.parse(exported()).cases).toEqual([]);
    click("authz.addCase");
    expect(field("authz.case")).toHaveValue("case-1");
    await job("authz.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("unchecked: 1");
  });
  it("appends Cartesian cases atomically and fills OpenAPI actions without editing the source", async () => {
    await setup();
    fireEvent.click(
      screen.getByText(en["authz.generator"], { selector: "summary" }),
    );
    click("authz.generate");
    expect(screen.getByRole("status")).toHaveTextContent("Generated 4");
    click("authz.export");
    expect(JSON.parse(exported()).cases).toHaveLength(5);
    click("authz.schemaActions");
    expect(JSON.parse(value("authz.matrixActions"))).toEqual(
      expect.arrayContaining(["GET /users/{id}", "POST /users/{id}"]),
    );
    change("authz.subjects", JSON.stringify(Array(201).fill(null)));
    click("authz.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["authz.error.limit"],
    );
    click("authz.export");
    expect(JSON.parse(exported()).cases).toHaveLength(5);
  });
  it("imports projects atomically, drops runtime/results and keeps saved work on malformed or large input", async () => {
    await setup();
    const p = emptyAuthzProject();
    p.name = "Imported access";
    file(
      JSON.stringify({ ...p, results: [{ secret: "ignored" }], runtime: {} }),
    );
    await waitFor(() => expect(field("authz.name")).toHaveValue(p.name));
    click("authz.export");
    expect(JSON.parse(exported())).toEqual(p);
    file("{");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        en["authz.error.json"],
      ),
    );
    file("{}", undefined, MAX_AUTHZ_BYTES + 1);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        en["authz.error.limit"],
      ),
    );
    expect(field("authz.name")).toHaveValue(p.name);
  });
  it("cancels comparisons without partial results and ignores late imports after unmount", async () => {
    const view = await setup(true);
    click("authz.runAll");
    click("authz.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(
      screen.queryByRole("table", { name: en["authz.results"] }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(en["authz.cancelled"]);
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    file("{}", () => pending);
    view.unmount();
    await act(async () => {
      resolve(serializeAuthzProject(emptyAuthzProject()));
      await pending;
    });
  });
  it("exports only the selected saved guard policy and reports blocked downloads", async () => {
    await setup(true);
    change("authz.policy", "tenant");
    click("authz.exportGuard");
    expect(exported()).toContain("createAuthorizationGuard");
    expect(exported()).toContain('"id": "tenant"');
    expect(exported()).not.toContain("document-a");
    expect(exported()).not.toContain("owner-write");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("authz.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["authz.error.download"],
    );
  });
  it("paginates large result sets and resets page bounds on filtering", async () => {
    await setup();
    const p = emptyAuthzProject();
    p.cases = Array.from({ length: 105 }, (_, i) => newAuthzCase(`c-${i}`));
    file(serializeAuthzProject(p));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(en["authz.loaded"]),
    );
    await job("authz.runAll");
    const rows = () =>
      within(
        screen.getByRole("table", { name: en["authz.caseRows"] }),
      ).getAllByRole("row");
    expect(rows()).toHaveLength(101);
    click("authz.next");
    expect(rows()).toHaveLength(6);
    change("authz.search", "c-104");
    expect(rows()).toHaveLength(2);
    expect(button("authz.previous")).toBeDisabled();
  });
  it("renders and runs the studio in Russian", async () => {
    setAppLanguage("ru");
    const ru = authzTranslations.ru;
    render(<AuthorizationPanel />);
    fireEvent.click(
      screen.getByText(ru["authz.title"], { selector: "summary" }),
    );
    await screen.findByRole("button", { name: ru["authz.demo"] });
    fireEvent.click(screen.getByRole("button", { name: ru["authz.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["authz.runAll"] }));
    await waitFor(
      () => expect(screen.getByRole("status")).toHaveTextContent("36/36"),
      { timeout: 5000 },
    );
    setAppLanguage("en");
  });
});
