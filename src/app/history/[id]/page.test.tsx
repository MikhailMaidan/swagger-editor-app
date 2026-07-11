import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { SERVER_REQUEST_HISTORY_COOKIE } from "@/lib/request-history";
import HistoryDetailsPage from "./page";

describe("HistoryDetailsPage", () => {
  it("server-renders a saved request selected by id", async () => {
    const record = {
      createdAt: "2026-07-11T08:00:00.000Z",
      durationMs: 42,
      errorDetails: null,
      id: "history-1",
      method: "GET",
      path: "/users/{id}",
      requestSize: 80,
      responseSize: 120,
      status: 200,
      summary: "Get user",
      url: "https://api.example.com/users/42",
    };
    const values: Record<string, string> = {
      [AUTH_TOKEN_COOKIE]: createDemoToken("mikhail@example.com"),
      [SERVER_REQUEST_HISTORY_COOKIE]: JSON.stringify([record]),
    };

    globalThis.__COOKIE_MOCK__.mockResolvedValue({
      get: vi.fn((name: string) =>
        values[name] ? { value: values[name] } : undefined,
      ),
    });

    render(
      await HistoryDetailsPage({
        params: Promise.resolve({ id: "history-1" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Request Details" }),
    ).toBeVisible();
    expect(screen.getByText("https://api.example.com/users/42")).toBeVisible();
    expect(screen.getByText("No errors were recorded.")).toBeVisible();
  });
});
