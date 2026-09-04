import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EndpointSummary, ResponseSummary } from "@/lib/openapi";
import { downloadRequestCoverageFile } from "@/lib/request-coverage-export";
import {
  REQUEST_HISTORY_STORAGE_KEY,
  saveRequestHistoryRecord,
  type RequestHistoryRecord,
} from "@/lib/request-history";
import { RequestCoveragePanel } from "./request-coverage-panel";

vi.mock("@/lib/request-coverage-export", () => ({
  downloadRequestCoverageFile: vi.fn(),
}));

function response(status: string): ResponseSummary {
  return {
    contentTypes: [],
    description: `${status} response`,
    schema: null,
    status,
  };
}

function endpoint(
  method: string,
  path: string,
  statuses: string[],
): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method,
    operationId: `${method.toLowerCase()}Operation`,
    parameters: [],
    path,
    requestBodies: [],
    responses: statuses.map(response),
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: `${method} ${path} summary`,
    tags: [],
  };
}

function record(
  id: string,
  method: string,
  path: string,
  status: number,
  createdAt = "2026-09-04T10:00:00.000Z",
): RequestHistoryRecord {
  return {
    createdAt,
    durationMs: 24,
    errorDetails: null,
    id,
    method,
    path,
    requestSize: 0,
    responseSize: 12,
    status,
    summary: `${method} ${path}`,
    url: `https://api.example.com${path}`,
  };
}

const endpoints = [
  endpoint("GET", "/items", ["200", "404"]),
  endpoint("POST", "/items", ["201"]),
  endpoint("DELETE", "/items/{id}", ["204"]),
];

function renderPanel(onSelectEndpoint = vi.fn()) {
  return {
    onSelectEndpoint,
    ...render(
      <RequestCoveragePanel
        allEndpoints={endpoints}
        onSelectEndpoint={onSelectEndpoint}
        schema={{ title: "Catalog API", version: "1.0.0" }}
        visibleEndpoints={[endpoints[0]]}
      />,
    ),
  };
}

describe("RequestCoveragePanel", () => {
  beforeEach(() => {
    vi.mocked(downloadRequestCoverageFile).mockReset();
    vi.mocked(downloadRequestCoverageFile).mockReturnValue(true);
  });

  it("summarizes operation and documented-response coverage", async () => {
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([
        record("get-ok", "GET", "/items", 200),
        record("get-missing", "GET", "/items", 404, "2026-09-04T09:00:00.000Z"),
        record("post-undocumented", "POST", "/items", 202),
      ]),
    );
    renderPanel();

    const panel = screen
      .getByRole("heading", { name: "Request coverage" })
      .closest("section") as HTMLElement;

    expect(
      await within(panel).findByText("67% operations tested"),
    ).toBeVisible();
    expect(
      within(panel).getByText("Tested operations").nextElementSibling,
    ).toHaveTextContent("2/3");
    expect(
      within(panel).getByText("Observed responses").nextElementSibling,
    ).toHaveTextContent("2/4");
    expect(
      within(panel).getByText("Matched requests").nextElementSibling,
    ).toHaveTextContent("3");
    expect(
      within(panel).getByText("Coverage: POST /items summary"),
    ).toBeVisible();
    expect(
      within(panel).getByText("Coverage: DELETE /items/{id} summary"),
    ).toBeVisible();
    expect(
      within(panel).queryByText("Coverage: GET /items summary"),
    ).not.toBeInTheDocument();
  });

  it("updates from same-tab request events and navigates to an operation", async () => {
    const user = userEvent.setup();
    const { onSelectEndpoint } = renderPanel();

    expect(
      await screen.findByText(
        "No saved requests yet. Run an endpoint to begin measuring coverage.",
      ),
    ).toBeVisible();

    saveRequestHistoryRecord({
      durationMs: 18,
      method: "DELETE",
      path: "/items/{id}",
      status: 500,
      summary: "Delete item",
    });

    await waitFor(() =>
      expect(
        screen.getByText("Matched requests").nextElementSibling,
      ).toHaveTextContent("1"),
    );
    await user.click(screen.getByRole("button", { name: "Latest failed (1)" }));

    const row = screen
      .getByText("Coverage: DELETE /items/{id} summary")
      .closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("HTTP 500")).toBeVisible();
    await user.click(
      within(row as HTMLElement).getByRole("button", {
        name: "View endpoint",
      }),
    );
    expect(onSelectEndpoint).toHaveBeenCalledWith("DELETE", "/items/{id}");
  });

  it("changes scope and history window and exports the aggregate report", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([record("get-ok", "GET", "/items", 200)]),
    );
    renderPanel();

    await screen.findByText("33% operations tested");
    await user.selectOptions(
      screen.getByLabelText("Coverage scope"),
      "visible",
    );
    expect(screen.getByText("100% operations tested")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("History window"), "24h");
    await user.click(screen.getByRole("button", { name: "Export coverage" }));

    expect(downloadRequestCoverageFile).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointCoveragePercentage: expect.any(Number),
        operations: expect.any(Array),
      }),
      { title: "Catalog API", version: "1.0.0" },
      "24h",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Coverage export started.",
    );

    vi.mocked(downloadRequestCoverageFile).mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "Export coverage" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not export request coverage.",
    );
  });
});
