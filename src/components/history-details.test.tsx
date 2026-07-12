import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryDetails } from "./history-details";

describe("HistoryDetails", () => {
  it("shows every required server analytics field", () => {
    render(
      <HistoryDetails
        record={{
          createdAt: "2026-07-11T08:00:00.000Z",
          durationMs: 42,
          errorDetails: "404 Not Found",
          id: "history-1",
          method: "GET",
          path: "/users/{id}",
          requestSize: 80,
          responseSize: 120,
          status: 404,
          summary: "Get user",
          url: "https://api.example.com/users/42",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Request Details" }),
    ).toBeVisible();
    expect(screen.getByText("https://api.example.com/users/42")).toBeVisible();
    expect(screen.getByText("404 Not Found")).toBeVisible();
    expect(screen.getByText("42 ms")).toBeVisible();
    expect(screen.getByText("80 B")).toBeVisible();
    expect(screen.getByText("120 B")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to History" }),
    ).toHaveAttribute("href", "/history");
  });

  it("shows a friendly message for a missing record", () => {
    render(<HistoryDetails record={null} />);

    expect(
      screen.getByText("This history record is not available."),
    ).toBeVisible();
  });
});
