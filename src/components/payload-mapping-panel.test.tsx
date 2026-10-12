import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayloadMappingPanel } from "./payload-mapping-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import {
  demoMappingProject,
  MAX_MAPPING_PAYLOAD_BYTES,
  parseMappingProject,
  serializeMappingProject,
} from "@/lib/payload-mapping";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const value = (label: string) =>
  (screen.getByLabelText(label) as HTMLTextAreaElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function file(text: string, name = "mapping.json") {
  const f = new File([text], name, { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
}
async function setup(demo = true) {
  const user = userEvent.setup(),
    get = vi.fn(() => DEFAULT_OPENAPI_SCHEMA),
    view = render(<PayloadMappingPanel getSchemaText={get} />);
  await user.click(
    screen.getByText("Payload mapping studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load customer mapping demo"));
  return { user, get, ...view };
}
const output = () =>
  JSON.parse(value("Mapping output (first 16,000 characters)"));

describe("PayloadMappingPanel", () => {
  it("runs customer adapters, previews stages, exports projects/recipes/code/reports and never fetches, writes storage, or changes the editor", async () => {
    const { user, get } = await setup(),
      network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await user.click(button("Run payload mapping"));
    expect(output().payload.customers[0]).toEqual({
      id: 7,
      name: "Ada",
      enabled: true,
      country: "UK",
    });
    change("Inspect mapping stage output", "normalize");
    expect(output()).toHaveProperty("customers");
    expect(output()).not.toHaveProperty("payload");
    await user.click(button("Download selected output"));
    expect(JSON.parse(exported()).customers).toHaveLength(2);
    await user.click(button("Download value-free mapping report"));
    expect(exported()).not.toContain("Ada");
    expect(exported()).not.toContain('"output"');
    expect(JSON.parse(exported()).stages).toHaveLength(2);
    await user.click(button("Download mapping recipe"));
    expect(JSON.parse(exported()).kind).toBe("rsswag-payload-mapping");
    expect(exported()).not.toContain('display_name": " Ada');
    await user.click(button("Download JavaScript mapper"));
    expect(exported()).toContain("export function mapPayload");
    expect(exported()).not.toContain("import ");
    await user.click(button("Download mapping project"));
    expect(parseMappingProject(exported()).recipe.stages).toHaveLength(2);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it("creates mappings with form controls and reports collisions and conversion errors without losing drafts", async () => {
    const { user } = await setup(false);
    await user.click(button("Add mapping rule"));
    change("Source pointer / array pattern", "/name");
    change("Target pointer / array pattern", "/displayName");
    change("Mapping conversion", "upper");
    change("Mapping input JSON", '{"name":"Ada","keep":1}');
    await user.click(button("Run payload mapping"));
    expect(output()).toEqual({ displayName: "ADA" });
    change("Stage starting shape", "input");
    await user.click(button("Run payload mapping"));
    expect(output()).toEqual({ name: "Ada", keep: 1, displayName: "ADA" });
    await user.click(button("Add mapping rule"));
    change("Source pointer / array pattern", "/keep");
    change("Target pointer / array pattern", "/displayName");
    await user.click(button("Run payload mapping"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "overlapping target paths",
    );
    expect(
      screen.queryByLabelText("Mapping output (first 16,000 characters)"),
    ).not.toBeInTheDocument();
    change("Target pointer / array pattern", "/count");
    change("Mapping conversion", "boolean");
    await user.click(button("Run payload mapping"));
    expect(output().count).toBe(true);
    change("Mapping input JSON", '{"name":"Ada","keep":2}');
    await user.click(button("Run payload mapping"));
    expect(screen.getByRole("alert")).toHaveTextContent("cannot be converted");
    expect(screen.getByLabelText("Target pointer / array pattern")).toHaveValue(
      "/count",
    );
  });
  it("edits array defaults and constants, disables stages/rules, and changes stage/rule order explicitly", async () => {
    const { user } = await setup();
    await user.click(
      within(screen.getByLabelText("Mapping rules")).getByRole("button", {
        name: /country/,
      }),
    );
    change("Constant / default value (JSON)", '"not supplied"');
    await user.click(button("Run payload mapping"));
    expect(output().payload.customers[1].country).toBe("not supplied");
    await user.click(screen.getByLabelText("Enable mapping rule"));
    await user.click(button("Run payload mapping"));
    expect(output().payload.customers[0]).not.toHaveProperty("country");
    change("Selected mapping stage", "envelope");
    await user.click(screen.getByLabelText("Enable mapping stage"));
    await user.click(button("Run payload mapping"));
    expect(output()).toHaveProperty("customers");
    await user.click(screen.getByLabelText("Enable mapping stage"));
    await user.click(button("Move stage earlier"));
    await user.click(button("Run payload mapping"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "required source value",
    );
    await user.click(button("Move stage later"));
    await user.click(button("Move rule later"));
    await user.click(button("Run payload mapping"));
    expect(output()).toHaveProperty("version", "v2");
  });
  it("adds/removes stages and rules, filters rules, and clears search with Escape", async () => {
    const { user } = await setup();
    change("Search mapping rules", "display_name");
    expect(
      within(screen.getByLabelText("Mapping rules")).getAllByRole("button"),
    ).toHaveLength(1);
    await user.click(screen.getByLabelText("Search mapping rules"));
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Search mapping rules")).toHaveValue("");
    await user.click(button("Add mapping rule"));
    change("Target pointer / array pattern", "/extra");
    expect(screen.getByLabelText("Target pointer / array pattern")).toHaveValue(
      "/extra",
    );
    await user.click(button("Remove mapping rule"));
    expect(screen.getByText("2/12 stages, 7/200 rules.")).toBeInTheDocument();
    await user.click(button("Add mapping stage"));
    change("Mapping stage name", "Extra");
    expect(screen.getByLabelText("Mapping stage name")).toHaveValue("Extra");
    await user.click(button("Remove mapping stage"));
    expect(screen.getByText("2/12 stages, 7/200 rules.")).toBeInTheDocument();
  });
  it("captures optional OpenAPI schemas only explicitly and retains the last contract after invalid edits", async () => {
    const { user, get } = await setup();
    await user.click(button("Capture editor OpenAPI for mapping"));
    expect(get).toHaveBeenCalledTimes(1);
    expect(
      screen.getByLabelText("Mapping OpenAPI snapshot source"),
    ).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    const inputSelect = screen.getByLabelText(
      "Mapping input schema",
    ) as HTMLSelectElement;
    expect(inputSelect.options.length).toBeGreaterThan(1);
    const snapshot = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Destination", version: "1" },
      paths: {},
      components: { schemas: { Destination: { type: "array" } } },
    });
    change("Mapping OpenAPI snapshot source", snapshot);
    await user.click(button("Load mapping OpenAPI snapshot"));
    change("Mapping output schema", "/components/schemas/Destination");
    await user.click(button("Run payload mapping"));
    expect(
      screen.getByText("Output contract: Contract issues"),
    ).toBeInTheDocument();
    change("Mapping OpenAPI snapshot source", "openapi: [");
    expect(button("Run payload mapping")).toBeDisabled();
    expect(button("Download mapping project")).toBeDisabled();
    await user.click(button("Load mapping OpenAPI snapshot"));
    expect(screen.getByRole("alert")).toHaveTextContent("valid local OpenAPI");
    change("Mapping OpenAPI snapshot source", snapshot);
    expect(button("Run payload mapping")).toBeEnabled();
    expect(button("Download mapping project")).toBeEnabled();
    await user.click(button("Run payload mapping"));
    expect(output()).toHaveProperty("version");
    await user.click(button("Clear mapping contract bindings"));
    expect(screen.getByLabelText("Mapping output schema")).toHaveValue("");
  });
  it("runs independent regression cases, detects expected-output mismatches, and exports reports without payloads", async () => {
    const { user } = await setup();
    await user.click(button("Run all mapping cases"));
    expect(
      screen.getByText("1 passed, 0 failed, 0 partial."),
    ).toBeInTheDocument();
    change("Expected mapped output JSON", "{}");
    expect(
      screen.queryByText("1 passed, 0 failed, 0 partial."),
    ).not.toBeInTheDocument();
    await user.click(button("Run all mapping cases"));
    expect(
      screen.getByText("0 passed, 1 failed, 0 partial."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Mapping case output (first 16,000 characters)"),
    ).toBeInTheDocument();
    await user.click(button("Download value-free case report"));
    expect(JSON.parse(exported()).cases[0].expected).toBe("mismatch");
    expect(exported()).not.toContain("Ada");
    expect(exported()).not.toContain('"output"');
    await user.click(button("Load saved case input"));
    await user.click(button("Run payload mapping"));
    await user.click(button("Use current output as case expectation"));
    await user.click(button("Run all mapping cases"));
    expect(
      screen.getByText("1 passed, 0 failed, 0 partial."),
    ).toBeInTheDocument();
  });
  it("saves, loads, edits, removes and restores cases and requires fresh results after restore", async () => {
    const { user } = await setup();
    await user.click(button("Run payload mapping"));
    change("New mapping case name", "Saved");
    await user.click(button("Save current input as mapping case"));
    expect(screen.getByText("2/30 saved mapping cases.")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Compare expected mapped output"),
    ).toBeChecked();
    change("Saved mapping case name", "Renamed");
    change("Saved case input JSON", '{"users":[]}');
    await user.click(button("Load saved case input"));
    expect(screen.getByLabelText("Mapping input JSON")).toHaveValue(
      '{"users":[]}',
    );
    await user.click(button("Download mapping project"));
    const text = exported();
    await user.click(button("Remove mapping case"));
    expect(screen.getByText("1/30 saved mapping cases.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mapping input JSON")).toHaveValue(
      '{"users":[]}',
    );
    await user.upload(
      screen.getByLabelText("Restore mapping project (JSON)"),
      file(text),
    );
    expect(
      await screen.findByText(
        "Mapping project restored; run it again to generate results.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("2/30 saved mapping cases.")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Mapping output (first 16,000 characters)"),
    ).not.toBeInTheDocument();
    await user.click(button("Run payload mapping"));
    expect(output().payload.customers).toEqual([]);
  });
  it("imports recipes and inputs independently while retaining project examples and contracts", async () => {
    const { user } = await setup();
    const p = demoMappingProject();
    p.recipe.name = "Imported";
    p.recipe.stages[1].enabled = false;
    await user.upload(
      screen.getByLabelText("Import mapping recipe (JSON)"),
      file(JSON.stringify(p.recipe)),
    );
    expect(
      await screen.findByText(
        "Mapping recipe imported; current examples and contract are retained.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1/30 saved mapping cases.")).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Import mapping input (JSON)"),
      file('{"users":[]}'),
    );
    expect(
      await screen.findByText("Mapping input imported."),
    ).toBeInTheDocument();
    await user.click(button("Run payload mapping"));
    expect(output()).toEqual({ customers: [], count: 0 });
  });
  it("keeps source, recipes and results when closed and reopened", async () => {
    const { user } = await setup();
    await user.click(button("Run payload mapping"));
    const before = value("Mapping output (first 16,000 characters)");
    await user.click(
      screen.getByText("Payload mapping studio", { selector: "summary" }),
    );
    await user.click(
      screen.getByText("Payload mapping studio", { selector: "summary" }),
    );
    expect(
      screen.getByLabelText("Mapping output (first 16,000 characters)"),
    ).toHaveValue(before);
  });
  it("shows download/import failures without replacing valid work and checks real file sizes", async () => {
    const { user } = await setup();
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download mapping project"));
    expect(screen.getByRole("alert")).toHaveTextContent("Download was blocked");
    await user.upload(
      screen.getByLabelText("Restore mapping project (JSON)"),
      file("{}"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid mapping project",
    );
    expect(screen.getByLabelText("Mapping recipe name")).toHaveValue(
      "Customer adapter",
    );
    const large = file("{}");
    Object.defineProperty(large, "size", {
      value: MAX_MAPPING_PAYLOAD_BYTES + 1,
    });
    await user.upload(
      screen.getByLabelText("Import mapping input (JSON)"),
      large,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "limit was exceeded",
    );
    expect(screen.getByText("1/30 saved mapping cases.")).toBeInTheDocument();
  });
  it("disables editing during asynchronous imports and ignores late results after unmount", async () => {
    const { user, unmount } = await setup();
    const slow = file("");
    let resolve!: (text: string) => void;
    Object.defineProperty(slow, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Restore mapping project (JSON)"),
      slow,
    );
    expect(screen.getByText("Reading mapping file…")).toBeInTheDocument();
    expect(button("Load customer mapping demo")).toBeDisabled();
    expect(screen.getByLabelText("Mapping input JSON")).toBeDisabled();
    unmount();
    await act(async () =>
      resolve(serializeMappingProject(demoMappingProject())),
    );
    expect(downloadTextFile).not.toHaveBeenCalled();
  });
  it("localizes controls, execution, case results and exports into Russian", async () => {
    act(() => setAppLanguage("ru"));
    const user = userEvent.setup();
    render(<PayloadMappingPanel getSchemaText={() => ""} />);
    await user.click(
      screen.getByText("Студия преобразования данных", { selector: "summary" }),
    );
    await user.click(button("Загрузить демо преобразования клиентов"));
    await user.click(button("Запустить преобразование данных"));
    expect(
      screen.getByLabelText(
        "Результат преобразования (первые 16 000 символов)",
      ),
    ).toBeInTheDocument();
    await user.click(button("Запустить все примеры"));
    expect(
      screen.getByText("Пройдено: 1, ошибок: 0, частичных: 0."),
    ).toBeInTheDocument();
    await user.click(button("Скачать проект преобразования"));
    expect(parseMappingProject(exported()).recipe.name).toBe(
      "Customer adapter",
    );
  });
});
