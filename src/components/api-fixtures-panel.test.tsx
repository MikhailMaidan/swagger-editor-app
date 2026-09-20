import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiFixturesPanel } from "./api-fixtures-panel";
import { setAppLanguage } from "./i18n-provider";
import {
  MAX_FIXTURE_BYTES,
  serializeFixtureRecipe,
  type FixtureRecipe,
} from "@/lib/api-fixtures";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const schema = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Shop fixtures", version: "1" },
  paths: {},
  components: {
    schemas: {
      User: {
        type: "object",
        required: ["id", "name"],
        properties: { id: { type: "integer" }, name: { type: "string" } },
      },
      Order: {
        type: "object",
        required: ["id", "userId"],
        properties: { id: { type: "integer" }, userId: { type: "integer" } },
      },
    },
  },
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
const plan = (): FixtureRecipe => ({
  seed: "imported",
  includeOptional: true,
  datasets: [
    {
      id: "users",
      name: "users",
      source: "/components/schemas/User",
      count: 3,
      direction: "none",
      rules: [
        {
          field: "id",
          kind: "sequence",
          start: 1,
          step: 1,
          asString: false,
          prefix: "",
        },
      ],
    },
  ],
});
async function setup(getSchemaText = vi.fn(() => schema)) {
  const user = userEvent.setup();
  const view = render(<ApiFixturesPanel getSchemaText={getSchemaText} />);
  await user.click(screen.getByText("API fixture studio"));
  await screen.findByLabelText("Generation seed");
  return { user, getSchemaText, ...view };
}
async function captureAndAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Use current editor as fixture source"));
  await user.click(button("Add fixture dataset"));
}
async function importPlan(
  user: ReturnType<typeof userEvent.setup>,
  value: string | FixtureRecipe,
) {
  const field = screen.getByLabelText("Fixture recipe JSON");
  if (!field.closest("details")!.open)
    await user.click(screen.getByText("Fixture recipe import and export"));
  change(
    "Fixture recipe JSON",
    typeof value === "string" ? value : serializeFixtureRecipe(value),
  );
  await user.click(button("Import fixture recipe"));
}
beforeEach(() => {
  vi.mocked(downloadTextFile).mockReturnValue(true);
  vi.mocked(writeTextToClipboard).mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("API fixture studio", () => {
  it("disables conflicting result actions while a recipe file is loading", async () => {
    const { user } = await setup();
    await captureAndAdd(user);
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    await user.click(screen.getByText("Fixture recipe import and export"));
    let resolve!: (text: string) => void;
    const file = new File(["{}"], "recipe.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    fireEvent.change(screen.getByLabelText("Import fixture recipe file"), {
      target: { files: [file] },
    });
    expect(button("Download fixture data")).toBeDisabled();
    expect(button("Copy fixture data")).toBeDisabled();
    expect(screen.getByLabelText("Dataset to export")).toBeDisabled();
    expect(screen.getByLabelText("Fixture export format")).toBeDisabled();
    await user.click(button("Download fixture data"));
    expect(downloadTextFile).not.toHaveBeenCalled();
    await act(async () => {
      resolve(serializeFixtureRecipe(plan()));
    });
    expect(screen.getByLabelText("Generation seed")).toHaveValue("imported");
    expect(button("Generate fixtures")).toBeEnabled();
  });
  it("keeps dangling references explicit when a deleted parent is replaced", async () => {
    const { user } = await setup();
    await captureAndAdd(user);
    await user.click(button("Add fixture dataset"));
    await user.click(button("Add field rule"));
    change("Override type", "reference");
    change("Dataset to edit", "dataset-1");
    await user.click(button("Remove dataset"));
    await user.click(button("Add fixture dataset"));
    expect(screen.getByLabelText("Dataset to edit")).toHaveValue("dataset-3");
    await user.click(button("Generate fixtures"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "referenced dataset or field is missing",
    );
  });
  it("captures lazily, generates sequences, pages rows, and exports reproducible data", async () => {
    const { user, getSchemaText } = await setup();
    expect(getSchemaText).not.toHaveBeenCalled();
    await captureAndAdd(user);
    expect(getSchemaText).toHaveBeenCalledTimes(1);
    change("Dataset name", "users");
    change("Rows to generate", "12");
    await user.click(button("Add field rule"));
    change("Sequence start", "100");
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    expect(
      screen.getByText("users: 12 rows · 0 invalid · 0 need review"),
    ).toBeInTheDocument();
    expect(
      JSON.parse(screen.getByLabelText("Fixture data preview").textContent!)[0]
        .id,
    ).toBe(100);
    await user.click(button("Next fixture rows"));
    expect(
      JSON.parse(screen.getByLabelText("Fixture data preview").textContent!)[0]
        .id,
    ).toBe(110);
    await user.click(button("Download fixture data"));
    const [data, filename] = vi.mocked(downloadTextFile).mock.calls.at(-1)!;
    expect(filename).toBe("rsswag-users.json");
    expect(JSON.parse(data)).toHaveLength(12);
    await user.click(button("Copy fixture data"));
    expect(writeTextToClipboard).toHaveBeenLastCalledWith(data);
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    await user.click(button("Download fixture data"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).toBe(data);
    expect(getSchemaText).toHaveBeenCalledTimes(1);
  });
  it("configures linked datasets, exports NDJSON/CSV/all JSON, and round trips recipes", async () => {
    const { user } = await setup();
    await captureAndAdd(user);
    change("Dataset name", "users");
    change("Rows to generate", "2");
    await user.click(button("Add field rule"));
    change("Schema for new dataset", "/components/schemas/Order");
    await user.click(button("Add fixture dataset"));
    change("Dataset name", "orders");
    change("Rows to generate", "3");
    await user.click(button("Add field rule"));
    change("Target field", "userId");
    change("Override type", "reference");
    expect(screen.getByLabelText("Referenced dataset")).toHaveValue(
      "dataset-1",
    );
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    change("Dataset to export", "dataset-2");
    change("Fixture export format", "ndjson");
    await user.click(button("Download fixture data"));
    expect(
      vi
        .mocked(downloadTextFile)
        .mock.calls.at(-1)![0]
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row).userId),
    ).toEqual([1, 2, 1]);
    change("Fixture export format", "csv");
    await user.click(button("Download fixture data"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![1]).toBe(
      "rsswag-orders.csv",
    );
    change("Dataset to export", "");
    expect(screen.getByLabelText("Fixture export format")).toBeDisabled();
    await user.click(button("Download fixture data"));
    expect(
      Object.keys(
        JSON.parse(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]),
      ),
    ).toEqual(["users", "orders"]);
    await user.click(button("Download fixture recipe"));
    const recipeText = vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
    expect(JSON.parse(recipeText).recipe.datasets[1].rules[0]).toMatchObject({
      kind: "reference",
      datasetId: "dataset-1",
    });
    await importPlan(user, recipeText);
    expect(
      screen.queryByRole("region", { name: "Generated fixture datasets" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Datasets: 2/10 · Rows: 5/2000"),
    ).toBeInTheDocument();
  });
  it("keeps invalid constant drafts visible, validates overrides, and invalidates stale results", async () => {
    const { user } = await setup();
    await captureAndAdd(user);
    await user.click(button("Add field rule"));
    change("Override type", "constant");
    change("Constant value (JSON)", "{");
    await user.click(button("Generate fixtures"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid recipe",
    );
    expect(screen.getByLabelText("Constant value (JSON)")).toHaveValue("{");
    change("Constant value (JSON)", '"wrong type"');
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    expect(
      screen.getByText("dataset_1: 10 rows · 10 invalid · 0 need review"),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Fixture diagnostics (10)"));
    expect(
      screen.getAllByText(/The generated value failed a schema check\./),
    ).toHaveLength(10);
    change("Generation seed", "next");
    expect(
      screen.queryByRole("region", { name: "Generated fixture datasets" }),
    ).not.toBeInTheDocument();
  });
  it("retains snapshots and recipes through close/reopen and failed recaptures", async () => {
    const getSchemaText = vi.fn(() => schema);
    const { user } = await setup(getSchemaText);
    await captureAndAdd(user);
    change("Dataset name", "retained");
    await user.click(screen.getByText("API fixture studio"));
    await user.click(screen.getByText("API fixture studio"));
    expect(await screen.findByLabelText("Dataset name")).toHaveValue(
      "retained",
    );
    getSchemaText.mockReturnValue("openapi: [");
    await user.click(button("Use current editor as fixture source"));
    expect(await screen.findByRole("alert")).toHaveTextContent("valid OpenAPI");
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    expect(
      screen.getByText("retained: 10 rows · 0 invalid · 0 need review"),
    ).toBeInTheDocument();
  });
  it("imports before capture, preserves data on malformed import, and rejects missing schemas", async () => {
    const { user } = await setup();
    await importPlan(user, plan());
    expect(screen.getByLabelText("Generation seed")).toHaveValue("imported");
    expect(button("Generate fixtures")).toBeDisabled();
    await user.click(button("Use current editor as fixture source"));
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    await importPlan(user, "{}");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid recipe");
    expect(
      screen.getByRole("region", { name: "Generated fixture datasets" }),
    ).toBeInTheDocument();
    const missing = plan();
    missing.datasets[0].source = "/components/schemas/Missing";
    await importPlan(user, missing);
    await user.click(button("Generate fixtures"));
    expect(
      screen
        .getAllByRole("alert")
        .some((entry) =>
          entry.textContent?.includes("missing from the captured source"),
        ),
    ).toBe(true);
  });
  it("cancels a running generation and can generate again", async () => {
    const { user } = await setup();
    await captureAndAdd(user);
    change("Rows to generate", "500");
    fireEvent.click(button("Generate fixtures"));
    expect(button("Add fixture dataset")).toBeDisabled();
    fireEvent.click(button("Cancel fixture operation"));
    await screen.findByText("Fixture operation cancelled.");
    expect(
      screen.queryByRole("region", { name: "Generated fixture datasets" }),
    ).not.toBeInTheDocument();
    change("Rows to generate", "2");
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    expect(
      screen.getByText("dataset_1: 2 rows · 0 invalid · 0 need review"),
    ).toBeInTheDocument();
  });
  it("handles oversized files, import cancellation, and successful file imports", async () => {
    const { user } = await setup();
    await user.click(screen.getByText("Fixture recipe import and export"));
    const huge = new File(["{}"], "huge.json");
    Object.defineProperty(huge, "size", { value: MAX_FIXTURE_BYTES + 1 });
    fireEvent.change(screen.getByLabelText("Import fixture recipe file"), {
      target: { files: [huge] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "exceeds a fixture limit",
    );
    let resolve!: (text: string) => void;
    const pending = new File(["{}"], "pending.json");
    Object.defineProperty(pending, "text", {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    fireEvent.change(screen.getByLabelText("Import fixture recipe file"), {
      target: { files: [pending] },
    });
    fireEvent.click(button("Cancel fixture operation"));
    await act(async () => {
      resolve(serializeFixtureRecipe(plan()));
    });
    expect(screen.getByLabelText("Generation seed")).toHaveValue("rsswag");
    const file = new File(["{}"], "recipe.json");
    Object.defineProperty(file, "text", {
      value: async () => serializeFixtureRecipe(plan()),
    });
    fireEvent.change(screen.getByLabelText("Import fixture recipe file"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Generation seed")).toHaveValue("imported"),
    );
    expect(button("Use current editor as fixture source")).toBeEnabled();
  });
  it("ignores stale clipboard feedback after recipe changes and reports export failures", async () => {
    const { user } = await setup();
    await captureAndAdd(user);
    await user.click(button("Generate fixtures"));
    await screen.findByRole("region", { name: "Generated fixture datasets" });
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download fixture data"));
    expect(screen.getByRole("alert")).toHaveTextContent("Export failed");
    let resolve!: (ok: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(button("Copy fixture data"));
    change("Generation seed", "new-seed");
    await act(async () => {
      resolve(true);
    });
    expect(screen.queryByText("Fixture data copied.")).not.toBeInTheDocument();
  });
  it("localizes the studio and diagnostics in Russian", async () => {
    act(() => setAppLanguage("ru"));
    const user = userEvent.setup();
    render(<ApiFixturesPanel getSchemaText={() => schema} />);
    await user.click(screen.getByText("Студия тестовых данных API"));
    await user.click(
      await screen.findByRole("button", {
        name: "Использовать текущую схему редактора",
      }),
    );
    await user.click(button("Добавить набор данных"));
    await user.click(button("Создать тестовые данные"));
    await screen.findByRole("region", { name: "Созданные наборы данных" });
    expect(
      screen.getByText(
        "dataset_1: строк — 10 · с ошибками — 0 · требуют проверки — 0",
      ),
    ).toBeInTheDocument();
  });
});
