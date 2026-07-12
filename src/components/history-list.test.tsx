import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REQUEST_HISTORY_STORAGE_KEY } from "@/lib/request-history";
import { HistoryList } from "./history-list";

describe("HistoryList", () => {
  it("shows an empty state with editor and viewer links", () => {
    render(<HistoryList />);

    expect(screen.getByText(/not executed any requests yet/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Editor" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "API Reference" })).toHaveAttribute(
      "href",
      "/#api-viewer",
    );
  });

  it("renders server-provided request records immediately", () => {
    render(
      <HistoryList
        initialRecords={[
          {
            createdAt: "2026-07-06T10:00:00.000Z",
            durationMs: 52,
            errorDetails: null,
            id: "server-record",
            method: "GET",
            path: "/server",
            requestSize: 100,
            responseSize: 140,
            status: 200,
            summary: "Server record",
            url: "/server",
          },
        ]}
      />,
    );

    expect(screen.getByText("Server record")).toBeVisible();
    expect(screen.getByText("/server")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View details for Server record" }),
    ).toHaveAttribute("href", "/history/server-record");
    expect(screen.getByText("52 ms")).toBeVisible();
  });

  it("renders saved requests newest first", async () => {
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          createdAt: "2026-07-06T08:00:00.000Z",
          durationMs: 45,
          id: "old-request",
          method: "GET",
          path: "/users/{id}",
          requestSize: 84,
          responseSize: 120,
          status: 200,
          summary: "Old request",
        },
        {
          createdAt: "2026-07-06T09:00:00.000Z",
          durationMs: 38,
          id: "new-request",
          method: "POST",
          path: "/users/{id}",
          requestSize: 96,
          responseSize: 144,
          status: 201,
          summary: "New request",
        },
      ]),
    );

    render(<HistoryList />);

    expect(
      await screen.findByText(
        "Recent executed requests are shown newest first.",
      ),
    ).toBeVisible();

    const rows = screen.getAllByRole("row");

    expect(within(rows[1]).getByText("POST")).toBeVisible();
    expect(within(rows[1]).getByText("New request")).toBeVisible();
    expect(within(rows[1]).getByText("38 ms")).toBeVisible();
    expect(within(rows[1]).getByText("96 B")).toBeVisible();
    expect(within(rows[1]).getByText("144 B")).toBeVisible();
    expect(within(rows[2]).getByText("GET")).toBeVisible();
    expect(within(rows[2]).getByText("Old request")).toBeVisible();
    expect(within(rows[2]).getByText("45 ms")).toBeVisible();
  });
});
