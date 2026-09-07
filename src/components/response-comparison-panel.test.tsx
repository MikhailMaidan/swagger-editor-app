import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_COMPARISON_BODY_BYTES,
  type ComparisonResponse,
} from "@/lib/response-comparison";
import { ResponseComparisonPanel } from "./response-comparison-panel";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const endpoint = { method: "GET", path: "/users/{id}" };
const before: ComparisonResponse = {
  body: '{"name":"Ada","timestamp":1,"old":true}',
  headers: {
    "Content-Type": "application/json",
    Date: "yesterday",
    "X-Version": "1",
  },
  status: "200",
  durationMs: 10,
  source: "live",
};
const after: ComparisonResponse = {
  body: '{"name":"Grace","timestamp":2,"new":true}',
  headers: {
    "content-type": "application/json",
    date: "today",
    "x-version": "2",
  },
  status: "201",
  durationMs: 30,
  source: "live",
};

function panel(response: ComparisonResponse | null) {
  return <ResponseComparisonPanel response={response} endpoint={endpoint} />;
}
async function compare() {
  const user = userEvent.setup();
  const view = render(panel(before));
  await user.click(
    screen.getByRole("button", { name: "Pin response baseline" }),
  );
  view.rerender(panel(after));
  return { user, ...view };
}

describe("ResponseComparisonPanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  });

  it("appears only after a response and pins a baseline without persistent storage", async () => {
    const user = userEvent.setup();
    const view = render(panel(null));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    view.rerender(panel(before));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Pin response baseline" }),
    );
    expect(
      screen.getByText("No response changes under the current settings."),
    ).toBeVisible();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("shows structural differences, status, header, timing, and byte size changes", async () => {
    await compare();
    expect(screen.getByText("6 response changes")).toBeVisible();
    const table = screen.getByRole("table", { name: "Response differences" });
    expect(within(table).getByText("/name")).toBeVisible();
    expect(within(table).getByText('"Ada"')).toBeVisible();
    expect(within(table).getByText('"Grace"')).toBeVisible();
    expect(within(table).getByText("/status")).toBeVisible();
    expect(within(table).getByText("/x-version")).toBeVisible();
    expect(within(table).queryByText("/date")).not.toBeInTheDocument();
    expect(screen.getByText("Latency: 10 → 30 ms (Δ +20 ms)")).toBeVisible();
    expect(screen.getByText(/Body size:/)).toBeVisible();
  });

  it("filters by area, change kind, and path while exporting all detected changes", async () => {
    const { user } = await compare();
    await user.selectOptions(screen.getByLabelText("Change area"), "body");
    await user.selectOptions(screen.getByLabelText("Change type"), "added");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      2,
    );
    expect(screen.getByText("/new")).toBeVisible();
    await user.type(screen.getByLabelText("Search changed paths"), "missing");
    expect(screen.getByText("No changes match these filters.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Copy comparison report" }),
    );
    const report = JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]);
    expect(report.differences).toHaveLength(6);
    expect(report.valuesIncluded).toBe(false);
    expect(
      report.differences.every(
        (entry: object) =>
          !Object.hasOwn(entry, "before") && !Object.hasOwn(entry, "after"),
      ),
    ).toBe(true);
  });

  it("applies ignored paths and headers and blocks invalid ignore settings", async () => {
    const { user } = await compare();
    await user.click(screen.getByText("Comparison settings"));
    const paths = screen.getByLabelText("Ignored JSON paths (one per line)");
    fireEvent.change(paths, {
      target: { value: "/timestamp\n/name\n/old\n/new" },
    });
    fireEvent.change(
      screen.getByLabelText("Ignored response headers (comma-separated)"),
      { target: { value: "date, X-Version" } },
    );
    expect(screen.getByText("1 response changes")).toBeVisible();
    fireEvent.change(paths, { target: { value: "timestamp" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Each path must start with /",
    );
    expect(
      screen.queryByRole("button", { name: "Copy comparison report" }),
    ).not.toBeInTheDocument();
    fireEvent.change(paths, { target: { value: "" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy comparison report" }),
    ).toBeEnabled();
  });

  it("retains the baseline when the current response is cleared, then compares the next response", async () => {
    const { rerender } = await compare();
    rerender(panel(null));
    expect(screen.getByText(/Baseline retained/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use current as baseline" }),
    ).toBeDisabled();
    rerender(panel(after));
    expect(screen.getByText("6 response changes")).toBeVisible();
  });

  it("can replace or clear the baseline and does not mutate response headers", async () => {
    const { user, rerender } = await compare();
    await user.click(
      screen.getByRole("button", { name: "Use current as baseline" }),
    );
    expect(
      screen.getByText("No response changes under the current settings."),
    ).toBeVisible();
    const mutable = { ...after, headers: { ...after.headers } };
    rerender(panel(mutable));
    await user.click(
      screen.getByRole("button", { name: "Use current as baseline" }),
    );
    mutable.headers["x-version"] = "3";
    rerender(panel({ ...mutable }));
    expect(screen.getByText("1 response changes")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Clear response baseline" }),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pin response baseline" }),
    ).toBeVisible();
    rerender(panel(null));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("downloads reports with optional value previews and clears stale feedback when options change", async () => {
    const { user } = await compare();
    await user.click(
      screen.getByRole("button", { name: "Download comparison report" }),
    );
    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.any(String),
      "rsswag-get-users-id-response-comparison.json",
      "application/json",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Response comparison download started.",
    );
    await user.click(screen.getByLabelText("Include value previews in report"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Copy comparison report" }),
    );
    expect(vi.mocked(writeTextToClipboard).mock.calls[0][0]).toContain("Ada");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Response comparison copied.",
    );
  });

  it("reports failed exports and allows retry", async () => {
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    const { user } = await compare();
    await user.click(
      screen.getByRole("button", { name: "Copy comparison report" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not copy");
    await user.click(
      screen.getByRole("button", { name: "Download comparison report" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not download");
    await user.click(
      screen.getByRole("button", { name: "Download comparison report" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("download started");
  });

  it("does not display feedback for an outdated pending clipboard operation", async () => {
    let resolve!: (value: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { user, rerender } = await compare();
    await user.click(
      screen.getByRole("button", { name: "Copy comparison report" }),
    );
    rerender(panel({ ...after, status: "500" }));
    await act(async () => resolve(true));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains mixed modes, text comparisons, unavailable timing, and size limits", async () => {
    const { rerender } = await compare();
    rerender(
      panel({ ...after, body: "plain text", source: "mock", durationMs: -1 }),
    );
    expect(
      screen.getByText(/includes both a Mock response and a Live response/),
    ).toBeVisible();
    expect(screen.getByText(/Bodies are compared as text/)).toBeVisible();
    expect(screen.getByText("Latency: 10 → — ms (Δ — ms)")).toBeVisible();
    rerender(
      panel({ ...after, body: "a".repeat(MAX_COMPARISON_BODY_BYTES + 1) }),
    );
    expect(screen.getByText(/Partial comparison:/)).toBeVisible();
    expect(
      screen.getByText(/A partial comparison cannot establish/),
    ).toBeVisible();
  });

  it("localizes the workbench and its actions in Russian", async () => {
    window.localStorage.setItem("rsswagger-language", "ru");
    const user = userEvent.setup();
    render(panel(before));
    expect(
      screen.getByRole("heading", { name: "Сравнение ответов" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Закрепить базовый ответ" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Копировать отчёт сравнения" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Сравнение ответов скопировано.",
    );
  });
});
