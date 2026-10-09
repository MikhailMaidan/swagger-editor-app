import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiTestMatrixPanel } from "./api-test-matrix-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  emptyMatrixProject,
  matrixBinding,
  parseMatrixProject,
  readMatrixDataset,
  serializeMatrixProject,
  type MatrixProject,
} from "@/lib/api-test-matrix";
import { createScenarioStep, serializeScenario } from "@/lib/api-scenario";
import { extractEndpoints } from "@/lib/openapi";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const documentApi = {
  openapi: "3.1.0",
  info: { title: "Matrix API", version: "1" },
  servers: [{ url: "https://example.test" }],
  paths: {
    "/users/{id}": {
      get: {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            example: 7,
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { id: { type: "integer" } },
                },
                example: { id: 7 },
              },
            },
          },
        },
      },
    },
  },
};
const api = JSON.stringify(documentApi);
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const file = (text: string, name = "matrix.json") => {
  const f = new File([text], name, {
    type: name.endsWith("csv") ? "text/csv" : "application/json",
  });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
async function setup() {
  const user = userEvent.setup();
  let editor = api;
  const view = render(<ApiTestMatrixPanel getSchemaText={() => editor} />);
  await user.click(screen.getByText("Data-driven workflow tests"));
  return {
    user,
    ...view,
    edit: (value: string) => {
      editor = value;
    },
    editor: () => editor,
  };
}
async function addStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Read endpoint choices from editor"));
  await user.click(button("Add endpoint workflow step"));
}
async function dataset(user: ReturnType<typeof userEvent.setup>, text: string) {
  change("Test-case dataset to load", text);
  await user.click(button("Replace cases with pasted dataset"));
}
function matrix(): MatrixProject {
  const endpoint = extractEndpoints(documentApi)[0],
    step = createScenarioStep(endpoint, "one");
  step.parameters = [{ name: "id", location: "path", value: "{{id}}" }];
  return {
    ...emptyMatrixProject(),
    scenario: {
      name: "Workflow",
      variableNames: ["id"],
      steps: [step],
      stopOnFailure: true,
    },
    cases: readMatrixDataset('[{"id":7},{"id":8}]', "json"),
    bindings: [
      {
        ...matrixBinding("one"),
        assertions: [
          {
            name: "Returned ID",
            target: "body",
            path: "/id",
            operator: "equals",
            expected: "",
            valueVariable: "id",
          },
        ],
      },
    ],
  };
}
async function restore(
  user: ReturnType<typeof userEvent.setup>,
  project = matrix(),
) {
  await user.upload(
    screen.getByLabelText(
      "Restore matrix project (replaces configuration and cases)",
    ),
    file(serializeMatrixProject(project)),
  );
  await screen.findByText(
    "Matrix project restored. Execution mode reset to Mock.",
  );
}
async function run(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Run enabled cases"));
  await screen.findByText("Matrix run completed. Review individual outcomes.");
}

describe("ApiTestMatrixPanel", () => {
  it("does not transfer a deleted case's failed-run identity to a new case", async () => {
    const { user } = await setup();
    await restore(user);
    await run(user);
    change("Case to configure", "case-2");
    await user.click(button("Remove selected case"));
    await user.click(button("Add or duplicate selected case"));
    expect(screen.getByLabelText("Case to configure")).toHaveValue("case-2");
    expect(button("Rerun prior failed/error cases only")).toBeDisabled();
  });
  it("clears an old preview when the current editor fails preflight", async () => {
    const { user, edit } = await setup();
    await addStep(user);
    await user.click(button("Validate and preview matrix batch"));
    expect(
      screen.getByText("Validated batch: 1 cases · up to 1 step attempts"),
    ).toBeInTheDocument();
    edit("openapi: [");
    await user.click(button("Validate and preview matrix batch"));
    expect(
      screen.queryByText("Validated batch: 1 cases · up to 1 step attempts"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "valid, bounded OpenAPI editor",
    );
  });
  it("builds, previews, runs and exports a batch without editor, network or automatic storage changes", async () => {
    const { user, editor } = await setup();
    const network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await addStep(user);
    await dataset(user, '[{"id":7},{"id":8}]');
    await user.click(button("Validate and preview matrix batch"));
    expect(
      screen.getByText("Validated batch: 2 cases · up to 2 step attempts"),
    ).toBeInTheDocument();
    await run(user);
    expect(
      screen.getByText(
        "Passed: 2 · failed: 0 · errors: 0 · cancelled: 0 · skipped: 0",
      ),
    ).toBeInTheDocument();
    await user.click(button("Download matrix JSON results"));
    expect(
      JSON.parse(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).results,
    ).toHaveLength(2);
    await user.click(button("Download JUnit XML results"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).toContain(
      "<testsuite",
    );
    await user.click(button("Download reusable API scenario"));
    expect(
      JSON.parse(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).kind,
    ).toBe("rsswag-api-scenario");
    await user.click(button("Download matrix project with data"));
    expect(
      parseMatrixProject(vi.mocked(downloadTextFile).mock.calls.at(-1)![0])
        .cases[1].values.id,
    ).toBe(8);
    expect(editor()).toBe(api);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("edits case expectations and reruns only previous failures after correction", async () => {
    const { user } = await setup();
    await restore(user);
    await run(user);
    expect(
      screen.getByText(
        "Passed: 1 · failed: 1 · errors: 0 · cancelled: 0 · skipped: 0",
      ),
    ).toBeInTheDocument();
    change("Case to configure", "case-2");
    change("Selected case variables (JSON object)", '{"id":7}');
    expect(button("Rerun prior failed/error cases only")).toBeDisabled();
    await user.click(button("Validate and save case variables"));
    expect(button("Rerun prior failed/error cases only")).toBeEnabled();
    await user.click(button("Rerun prior failed/error cases only"));
    await screen.findByText(
      "Passed: 1 · failed: 0 · errors: 0 · cancelled: 0 · skipped: 0",
    );
    await user.click(button("Download matrix JSON results"));
    expect(
      JSON.parse(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).results.map(
        (r: { key: string }) => r.key,
      ),
    ).toEqual(["case-2"]);
    expect(button("Rerun prior failed/error cases only")).toBeDisabled();
  });
  it("retains drafts across case changes and validates workflow/binding edits atomically", async () => {
    const { user } = await setup();
    await restore(user);
    change("Selected case variables (JSON object)", '{"id":19}');
    change("Case to configure", "case-2");
    change("Selected case variables (JSON object)", '{"id":20}');
    await user.click(button("Validate and save case variables"));
    expect(button("Run enabled cases")).toBeDisabled();
    change("Case to configure", "case-1");
    expect(
      screen.getByLabelText("Selected case variables (JSON object)"),
    ).toHaveValue('{"id":19}');
    await user.click(button("Discard case variable edits"));
    await user.click(
      screen.getByText("Edit workflow and expectation bindings"),
    );
    const original = (
      screen.getByLabelText(
        "Workflow JSON (ApiScenario object)",
      ) as HTMLTextAreaElement
    ).value;
    const modified = JSON.parse(original);
    modified.name = "Changed workflow";
    change("Workflow JSON (ApiScenario object)", JSON.stringify(modified));
    change("Per-step expectation bindings (JSON array)", "[invalid");
    await user.click(button("Validate and save workflow/bindings"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(button("Download matrix project with data")).toBeDisabled();
    await user.click(button("Discard workflow/binding edits"));
    expect(
      screen.getByLabelText("Workflow JSON (ApiScenario object)"),
    ).toHaveValue(original);
    expect(button("Run enabled cases")).toBeEnabled();
  });
  it("prevents partial runs and points directly to an invalid case", async () => {
    const { user } = await setup();
    await addStep(user);
    await dataset(user, '[{"id":7},{}]');
    await user.click(button("Validate and preview matrix batch"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "missing a template/assertion variable",
    );
    await user.click(button("Inspect invalid case case-2"));
    expect(screen.getByLabelText("Case to configure")).toHaveValue("case-2");
    expect(
      screen.getByLabelText("Selected case variables (JSON object)"),
    ).toHaveValue("{}");
  });
  it("imports CSV, duplicates and removes cases, and excludes disabled cases", async () => {
    const { user } = await setup();
    await addStep(user);
    await user.click(
      screen.getByLabelText("Infer canonical CSV numbers, booleans, and null"),
    );
    await user.upload(
      screen.getByLabelText("Import test cases (JSON/CSV; replaces cases)"),
      file("id,enabled\n7,true\n8,false", "cases.csv"),
    );
    await screen.findByText("Test-case dataset loaded.");
    expect(
      JSON.parse(
        (
          screen.getByLabelText(
            "Selected case variables (JSON object)",
          ) as HTMLTextAreaElement
        ).value,
      ),
    ).toEqual({ id: 7, enabled: true });
    await user.click(button("Add or duplicate selected case"));
    expect(screen.getByLabelText("Case to configure")).toHaveValue("case-3");
    await user.click(button("Remove selected case"));
    await user.click(button("Disable all cases"));
    expect(button("Run enabled cases")).toBeDisabled();
    await user.click(button("Enable all cases"));
    change("Case to configure", "case-2");
    await user.click(screen.getByLabelText("Include case in runs"));
    await run(user);
    expect(
      screen.getByText(
        "Passed: 1 · failed: 0 · errors: 0 · cancelled: 0 · skipped: 0",
      ),
    ).toBeInTheDocument();
  });
  it("preserves existing data on bad imports and clears retry identities when replacing cases", async () => {
    const { user } = await setup();
    await restore(user);
    await run(user);
    await dataset(user, '[{"nested":{}}]');
    expect(screen.getByRole("alert")).toHaveTextContent(
      "scalar case variables",
    );
    expect(button("Rerun prior failed/error cases only")).toBeEnabled();
    await dataset(user, '[{"id":7}]');
    expect(button("Rerun prior failed/error cases only")).toBeDisabled();
    await user.upload(
      screen.getByLabelText(
        "Restore matrix project (replaces configuration and cases)",
      ),
      file('{"kind":"wrong"}'),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("valid version 1"),
    );
    expect(
      screen.getByLabelText("Selected case variables (JSON object)"),
    ).toHaveValue(JSON.stringify({ id: 7 }, null, 2));
  });
  it("clears session credentials and resets mode when importing a scenario or matrix", async () => {
    const { user } = await setup();
    await restore(user);
    change("Matrix execution mode", "live");
    change(
      "Session-only shared headers (JSON string values)",
      '{"Authorization":"private-secret"}',
    );
    change(
      "Live server override (required for session headers)",
      "https://staging.test",
    );
    await user.click(
      screen.getByLabelText("Allow Live methods that may change server data"),
    );
    await user.upload(
      screen.getByLabelText(
        "Import API scenario as workflow (keeps cases, clears bindings)",
      ),
      file(serializeScenario(matrix().scenario), "scenario.json"),
    );
    await screen.findByText(
      "Scenario imported as workflow; data retained and bindings cleared.",
    );
    expect(screen.getByLabelText("Matrix execution mode")).toHaveValue("mock");
    change("Matrix execution mode", "live");
    expect(
      screen.getByLabelText("Session-only shared headers (JSON string values)"),
    ).toHaveValue("{}");
    expect(
      screen.getByLabelText(
        "Live server override (required for session headers)",
      ),
    ).toHaveValue("");
    expect(
      screen.getByLabelText("Allow Live methods that may change server data"),
    ).not.toBeChecked();
    await user.click(button("Download matrix project with data"));
    const saved = parseMatrixProject(
      vi.mocked(downloadTextFile).mock.calls.at(-1)![0],
    );
    expect(saved.cases).toHaveLength(2);
    expect(saved.bindings).toEqual([]);
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).not.toContain(
      "private-secret",
    );
    await restore(user);
    expect(screen.getByLabelText("Matrix execution mode")).toHaveValue("mock");
  });
  it("blocks controls while reading a file and safely preserves configuration until the read completes", async () => {
    const { user } = await setup();
    await addStep(user);
    let resolve!: (value: string) => void;
    const f = file("");
    Object.defineProperty(f, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import test cases (JSON/CSV; replaces cases)"),
      f,
    );
    expect(screen.getByText("Reading matrix file…")).toBeInTheDocument();
    expect(screen.getByLabelText("Matrix project name")).toBeDisabled();
    expect(button("Run enabled cases")).toBeDisabled();
    await act(async () => resolve('[{"id":9}]'));
    expect(screen.getByLabelText("Matrix project name")).toBeEnabled();
    expect(
      screen.getByLabelText("Selected case variables (JSON object)"),
    ).toHaveValue(JSON.stringify({ id: 9 }, null, 2));
  });
  it("cancels Live requests, keeps controls disabled during execution, and aborts on unmount", async () => {
    const { user, unmount } = await setup();
    await addStep(user);
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));
    change("Matrix execution mode", "live");
    await user.click(button("Run enabled cases"));
    await screen.findByRole("button", { name: "Cancel matrix run" });
    expect(screen.getByLabelText("Matrix project name")).toBeDisabled();
    const first = network.mock.calls[0][1]?.signal;
    await user.click(button("Cancel matrix run"));
    await screen.findByText(
      "Matrix run stopped; partial results are available.",
    );
    expect(first?.aborted).toBe(true);
    expect(screen.getByLabelText("Matrix project name")).toBeEnabled();
    await user.click(button("Run enabled cases"));
    await screen.findByRole("button", { name: "Cancel matrix run" });
    const second = network.mock.calls.at(-1)![1]?.signal;
    unmount();
    expect(second?.aborted).toBe(true);
  });
  it("uses the existing Live proxy and reports blocked download failures", async () => {
    const { user } = await setup();
    await addStep(user);
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "200",
          durationMs: 1,
          headers: { "content-type": "application/json" },
          body: '{"id":7}',
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    change("Matrix execution mode", "live");
    change(
      "Live server override (required for session headers)",
      "https://staging.test",
    );
    change(
      "Session-only shared headers (JSON string values)",
      '{"Authorization":"private-secret"}',
    );
    await run(user);
    expect(network.mock.calls[0][0]).toBe("/api/try-it-out");
    expect(JSON.parse(network.mock.calls[0][1]!.body as string)).toMatchObject({
      requireLive: true,
      serverUrl: "https://staging.test",
    });
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download matrix JSON results"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "download could not start",
    );
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).not.toContain(
      "private-secret",
    );
  });
  it("searches, filters, paginates results and retains project state after closing", async () => {
    const { user } = await setup();
    const p = matrix();
    p.bindings = [];
    p.cases = readMatrixDataset(
      JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ id: i }))),
      "json",
    );
    await restore(user, p);
    await run(user);
    expect(screen.getAllByRole("article")).toHaveLength(20);
    await user.click(button("Next matrix cases"));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    change("Search matrix case results", "case-2");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    await user.click(screen.getByLabelText("Search matrix case results"));
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Search matrix case results")).toHaveValue("");
    change("Filter case outcome", "failed");
    expect(screen.getByText("No matching case results.")).toBeInTheDocument();
    await user.click(screen.getByText("Data-driven workflow tests"));
    await user.click(screen.getByText("Data-driven workflow tests"));
    expect(
      screen.getByText("Enabled cases: 21/21 · workflow steps: 1"),
    ).toBeInTheDocument();
  });
  it("localizes the workbench in Russian", async () => {
    const { user } = await setup();
    await addStep(user);
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Проверки сценариев API по наборам данных"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Run enabled cases")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Matrix execution mode", { exact: true }),
    ).not.toBeInTheDocument();
  });
});
