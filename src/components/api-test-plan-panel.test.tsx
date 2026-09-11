import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApiTestPlan,
  MAX_PLAN_BYTES,
  serializeTestPlan,
} from "@/lib/api-test-plan";
import { writeTextToClipboard } from "@/lib/clipboard";
import type { EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { ApiTestPlanPanel } from "./api-test-plan-panel";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const endpoint: EndpointSummary = {
  method: "GET",
  path: "/users/{id}",
  operationId: "",
  deprecated: false,
  secured: false,
  securityRequirements: [],
  serverUrl: "",
  summary: "",
  description: "",
  tags: [],
  parameters: [
    {
      location: "path",
      name: "id",
      type: "integer",
      required: true,
      minimum: 1,
      maximum: 10,
      description: "",
      example: "",
    },
  ],
  requestBodies: [],
  responses: [
    { status: "200", description: "", contentTypes: [], schema: null },
  ],
};
const props = {
  allEndpoints: [endpoint],
  visibleEndpoints: [] as EndpointSummary[],
  onSelectEndpoint: vi.fn(),
};
async function setup() {
  const user = userEvent.setup();
  const view = render(<ApiTestPlanPanel {...props} />);
  await user.click(
    screen.getByRole("button", { name: "API test-plan workbench" }),
  );
  return { user, ...view };
}
const group = () =>
  within(screen.getByRole("group", { name: "Selected test case" }));
describe("ApiTestPlanPanel", () => {
  it.each([false, true])(
    "finishes imports while collapsed and checks the latest schema (changed: %s)",
    async (changed) => {
      let finish = () => {};
      const { cases } = createApiTestPlan([endpoint]);
      vi.stubGlobal(
        "FileReader",
        class {
          result = serializeTestPlan(cases.slice(0, 1), {
            [cases[0].id]: { status: "passed", note: "Imported while hidden" },
          });
          onload = () => {};
          readAsText() {
            finish = () => this.onload();
          }
        },
      );
      const { user, rerender } = await setup();
      await user.upload(
        screen.getByLabelText("Restore test-plan JSON"),
        new File([""], "plan.json"),
      );
      await user.click(
        screen.getByRole("button", { name: "API test-plan workbench" }),
      );
      expect(
        screen.queryByRole("table", { name: "API test cases" }),
      ).not.toBeInTheDocument();
      if (changed)
        rerender(
          <ApiTestPlanPanel
            {...props}
            allEndpoints={[{ ...endpoint, parameters: [] }]}
          />,
        );
      await act(async () => finish());
      await user.click(
        screen.getByRole("button", { name: "API test-plan workbench" }),
      );
      expect(group().getByLabelText("QA result")).toHaveValue(
        changed ? "pending" : "passed",
      );
      expect(group().getByLabelText("QA notes")).toHaveValue(
        changed ? "" : "Imported while hidden",
      );
      expect(
        screen.getByText(
          changed
            ? "Restored 0 matching cases · Ignored 1 unknown or changed cases"
            : "Restored 1 matching cases · Ignored 0 unknown or changed cases",
        ),
      ).toBeInTheDocument();
    },
  );
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
    props.onSelectEndpoint.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("generates cases on demand, records results locally, navigates endpoints and preserves progress across closing", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<ApiTestPlanPanel {...props} />);
    expect(
      screen.queryByRole("table", { name: "API test cases" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "API test-plan workbench" }),
    );
    expect(screen.getByText(/6 cases · 6 pending/)).toBeInTheDocument();
    await user.selectOptions(group().getByLabelText("QA result"), "passed");
    fireEvent.change(group().getByLabelText("QA notes"), {
      target: { value: "Checked on staging" },
    });
    expect(
      screen.getByText(/6 cases · 5 pending · 1 passed/),
    ).toBeInTheDocument();
    await user.click(
      group().getByRole("button", { name: "Open test-case endpoint" }),
    );
    expect(props.onSelectEndpoint).toHaveBeenCalledWith("GET", "/users/{id}");
    await user.click(
      screen.getByRole("button", { name: "API test-plan workbench" }),
    );
    await user.click(
      screen.getByRole("button", { name: "API test-plan workbench" }),
    );
    expect(group().getByLabelText("QA notes")).toHaveValue(
      "Checked on staging",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it("filters and searches cases without narrowing scoped exports", async () => {
    const { user, rerender } = await setup();
    await user.selectOptions(
      screen.getByLabelText("Filter test intent"),
      "reject",
    );
    expect(screen.getByText("3 matching test cases")).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Search test-plan endpoints, inputs, or values"),
      { target: { value: "GET users 11" } },
    );
    expect(screen.getByText("1 matching test cases")).toBeInTheDocument();
    await user.selectOptions(group().getByLabelText("QA result"), "failed");
    await user.selectOptions(
      screen.getByLabelText("Filter QA results"),
      "failed",
    );
    await user.click(
      screen.getByRole("button", { name: "Download test plan JSON" }),
    );
    const report = JSON.parse(vi.mocked(downloadTextFile).mock.calls[0][0]);
    expect(report.cases).toHaveLength(6);
    expect(report.summary.failed).toBe(1);
    await user.click(
      screen.getByRole("button", { name: "Copy test plan as Markdown" }),
    );
    expect(writeTextToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("Go above the maximum"),
    );
    await user.selectOptions(
      screen.getByLabelText("Test-plan endpoint scope"),
      "visible",
    );
    expect(
      screen.getByRole("button", { name: "Download test plan JSON" }),
    ).toBeDisabled();
    rerender(<ApiTestPlanPanel {...props} visibleEndpoints={[endpoint]} />);
    expect(screen.getByText("1 matching test cases")).toBeInTheDocument();
  });

  it("refreshes changed constraints while preserving results across temporary empty schemas", async () => {
    const { user, rerender } = await setup();
    await user.selectOptions(group().getByLabelText("QA result"), "passed");
    rerender(<ApiTestPlanPanel {...props} allEndpoints={[]} />);
    expect(screen.getByText("No cases match this view.")).toBeInTheDocument();
    rerender(<ApiTestPlanPanel {...props} />);
    expect(group().getByLabelText("QA result")).toHaveValue("passed");
    rerender(
      <ApiTestPlanPanel
        {...props}
        allEndpoints={[{ ...endpoint, parameters: [] }]}
      />,
    );
    expect(group().getByLabelText("QA result")).toHaveValue("pending");
  });

  it("merges imported matching progress, rejects invalid files, and supports undo and reset", async () => {
    const { user } = await setup();
    const { cases } = createApiTestPlan([endpoint]);
    const content = serializeTestPlan(cases.slice(0, 1), {
      [cases[0].id]: { status: "blocked", note: "Need access" },
    });
    await user.upload(
      screen.getByLabelText("Restore test-plan JSON"),
      new File([content], "plan.json", { type: "application/json" }),
    );
    expect(
      await screen.findByText(
        "Restored 1 matching cases · Ignored 0 unknown or changed cases",
      ),
    ).toBeInTheDocument();
    expect(group().getByLabelText("QA result")).toHaveValue("blocked");
    await user.click(
      screen.getByRole("button", { name: "Undo progress import or reset" }),
    );
    expect(group().getByLabelText("QA result")).toHaveValue("pending");
    await user.selectOptions(group().getByLabelText("QA result"), "passed");
    await user.upload(
      screen.getByLabelText("Restore test-plan JSON"),
      new File(["{}"], "bad.json"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid test-plan JSON",
    );
    expect(group().getByLabelText("QA result")).toHaveValue("passed");
    await user.click(screen.getByRole("button", { name: "Reset QA results" }));
    expect(group().getByLabelText("QA result")).toHaveValue("pending");
    await user.click(
      screen.getByRole("button", { name: "Undo progress import or reset" }),
    );
    expect(group().getByLabelText("QA result")).toHaveValue("passed");
  });

  it("handles oversized and unreadable files and ignores pending imports after reset", async () => {
    const readers: {
      result: string;
      onload: () => void;
      onerror: () => void;
    }[] = [];
    const { cases } = createApiTestPlan([endpoint]);
    vi.stubGlobal(
      "FileReader",
      class {
        result = serializeTestPlan(cases, {
          [cases[0].id]: { status: "failed", note: "" },
        });
        onload = () => {};
        onerror = () => {};
        readAsText() {
          readers.push(this);
        }
      },
    );
    const { user } = await setup();
    const huge = new File([""], "huge.json");
    Object.defineProperty(huge, "size", { value: MAX_PLAN_BYTES + 1 });
    await user.upload(screen.getByLabelText("Restore test-plan JSON"), huge);
    expect(screen.getByRole("alert")).toHaveTextContent("limited to 16 MiB");
    await user.upload(
      screen.getByLabelText("Restore test-plan JSON"),
      new File([""], "plan.json"),
    );
    await user.click(screen.getByRole("button", { name: "Reset QA results" }));
    await act(async () => {
      readers[0].onload();
    });
    expect(group().getByLabelText("QA result")).toHaveValue("pending");
    await user.upload(
      screen.getByLabelText("Restore test-plan JSON"),
      new File([""], "plan.json"),
    );
    await act(async () => {
      readers[1].onerror();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not read");
  });

  it("paginates and selects case details", async () => {
    const user = userEvent.setup();
    render(
      <ApiTestPlanPanel
        {...props}
        allEndpoints={Array.from({ length: 5 }, (_, i) => ({
          ...endpoint,
          path: `/users/${i}`,
        }))}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "API test-plan workbench" }),
    );
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Next test-plan page" }),
    );
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Previous test-plan page" }),
    );
    const table = within(screen.getByRole("table", { name: "API test cases" }));
    await user.click(
      table.getAllByRole("button", { name: /Go above the maximum/ })[0],
    );
    expect(
      group().getByLabelText("Suggested value or pattern"),
    ).toHaveTextContent('"11"');
  });

  it("reports copy and download failures and exports Markdown", async () => {
    const { user } = await setup();
    vi.mocked(writeTextToClipboard).mockResolvedValue(false);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(
      screen.getByRole("button", { name: "Copy test plan as Markdown" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not copy");
    await user.click(
      screen.getByRole("button", { name: "Download test plan Markdown" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not download");
    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.stringContaining("# API test-plan workbench"),
      "rsswag-api-test-plan.md",
      "text/markdown;charset=utf-8",
    );
  });

  it("localizes the workbench and exported Markdown in Russian", async () => {
    window.localStorage.setItem("rsswagger-language", "ru");
    const user = userEvent.setup();
    render(<ApiTestPlanPanel {...props} />);
    await user.click(
      screen.getByRole("button", { name: "План тестирования API" }),
    );
    expect(screen.getByText(/Тестов: 6 · Ожидают: 6/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Копировать план как Markdown" }),
    );
    expect(writeTextToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("Документированный успешный сценарий"),
    );
  });

  it("keeps the edited case selected when its result no longer matches the table filter", async () => {
    const { user } = await setup();
    await user.selectOptions(
      screen.getByLabelText("Filter QA results"),
      "pending",
    );
    await user.selectOptions(group().getByLabelText("QA result"), "passed");
    expect(screen.getByText("5 matching test cases")).toBeInTheDocument();
    expect(group().getByLabelText("QA result")).toHaveValue("passed");
    fireEvent.change(group().getByLabelText("QA notes"), {
      target: { value: "Notes for the completed happy path" },
    });
    await user.click(
      screen.getByRole("button", { name: "Download test plan JSON" }),
    );
    const report = JSON.parse(vi.mocked(downloadTextFile).mock.calls[0][0]);
    expect(report.cases[0]).toMatchObject({
      kind: "happy",
      status: "passed",
      note: "Notes for the completed happy path",
    });
    expect(report.cases[1].note).toBe("");
  });

  it("can plan visible operations beyond the global case limit", async () => {
    const user = userEvent.setup();
    const endpoints = Array.from({ length: 180 }, (_, i) => ({
      ...endpoint,
      path: `/users/${i}`,
    }));
    render(
      <ApiTestPlanPanel
        {...props}
        allEndpoints={endpoints}
        visibleEndpoints={[endpoints[179]]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "API test-plan workbench" }),
    );
    expect(screen.getByText(/Plan limited to 1,000 cases/)).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Test-plan endpoint scope"),
      "visible",
    );
    expect(screen.getByText(/6 cases · 6 pending/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Plan limited to 1,000 cases/),
    ).not.toBeInTheDocument();
    expect(group().getByText(/GET \/users\/179/)).toBeInTheDocument();
  });

  it("validates a pending import against the latest schema instead of restoring stale cases", async () => {
    let finish = () => {};
    const { cases } = createApiTestPlan([endpoint]);
    vi.stubGlobal(
      "FileReader",
      class {
        result = serializeTestPlan(cases, {
          [cases[0].id]: { status: "passed", note: "old schema" },
        });
        onload = () => {};
        readAsText() {
          finish = () => this.onload();
        }
      },
    );
    const { user, rerender } = await setup();
    await user.upload(
      screen.getByLabelText("Restore test-plan JSON"),
      new File([""], "plan.json"),
    );
    rerender(
      <ApiTestPlanPanel
        {...props}
        allEndpoints={[{ ...endpoint, parameters: [] }]}
      />,
    );
    await act(async () => finish());
    expect(
      screen.getByText(
        "Restored 0 matching cases · Ignored 6 unknown or changed cases",
      ),
    ).toBeInTheDocument();
    expect(group().getByLabelText("QA result")).toHaveValue("pending");
  });
});
