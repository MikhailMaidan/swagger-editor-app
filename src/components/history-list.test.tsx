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
      "/api-reference",
    );
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
          status: 200,
          summary: "Old request",
        },
        {
          createdAt: "2026-07-06T09:00:00.000Z",
          durationMs: 38,
          id: "new-request",
          method: "POST",
          path: "/users/{id}",
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
    expect(within(rows[2]).getByText("GET")).toBeVisible();
    expect(within(rows[2]).getByText("Old request")).toBeVisible();
    expect(within(rows[2]).getByText("45 ms")).toBeVisible();
  });
});
