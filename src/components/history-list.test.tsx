import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { REQUEST_HISTORY_STORAGE_KEY } from "@/lib/request-history";
import { HistoryList } from "./history-list";

const localRecord = {
  createdAt: "2026-07-06T09:00:00.000Z",
  durationMs: 38,
  id: "local-record",
  method: "POST",
  path: "/users/{id}",
  requestSize: 96,
  responseSize: 144,
  status: 201,
  summary: "Local request",
};

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

  it("color-codes the status badge by success or failure", () => {
    render(
      <HistoryList
        initialRecords={[
          {
            createdAt: "2026-07-06T10:00:00.000Z",
            durationMs: 52,
            errorDetails: null,
            id: "ok-record",
            method: "GET",
            path: "/server",
            requestSize: 100,
            responseSize: 140,
            status: 200,
            summary: "Successful request",
            url: "/server",
          },
          {
            createdAt: "2026-07-06T09:00:00.000Z",
            durationMs: 12,
            errorDetails: "network error",
            id: "failed-record",
            method: "GET",
            path: "/server",
            requestSize: 40,
            responseSize: 0,
            status: 0,
            summary: "Failed request",
            url: "/server",
          },
        ]}
      />,
    );

    expect(screen.getByText("200").className).toContain("text-emerald-700");
    expect(screen.getByText("0").className).toContain("text-red-700");
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

  it("gives each row's delete button a distinguishing accessible name", () => {
    render(
      <HistoryList
        initialRecords={[
          {
            createdAt: "2026-07-06T10:00:00.000Z",
            durationMs: 52,
            errorDetails: null,
            id: "first-record",
            method: "GET",
            path: "/first",
            requestSize: 100,
            responseSize: 140,
            status: 200,
            summary: "First request",
            url: "/first",
          },
          {
            createdAt: "2026-07-06T09:00:00.000Z",
            durationMs: 30,
            errorDetails: null,
            id: "second-record",
            method: "GET",
            path: "/second",
            requestSize: 90,
            responseSize: 130,
            status: 200,
            summary: "Second request",
            url: "/second",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Delete First request" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete Second request" }),
    ).toBeVisible();
  });

  it("removes a guest's locally-saved record without calling the server route", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([localRecord]),
    );

    try {
      render(<HistoryList />);

      await user.click(
        await screen.findByRole("button", { name: "Delete Local request" }),
      );

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete "Local request"? This cannot be undone.',
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Local request")).not.toBeInTheDocument();
      expect(
        JSON.parse(
          window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY) || "[]",
        ),
      ).toEqual([]);
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("removes a signed-in user's record after a successful server delete", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
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

      await user.click(
        screen.getByRole("button", { name: "Delete Server record" }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/history/server-record",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(
        await screen.findByText(/not executed any requests yet/i),
      ).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("does not delete anything when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([localRecord]),
    );

    try {
      render(<HistoryList />);

      await user.click(
        await screen.findByRole("button", { name: "Delete Local request" }),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText("Local request")).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("shows an error and keeps the record when a signed-in user's server delete fails", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
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

      await user.click(
        screen.getByRole("button", { name: "Delete Server record" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not delete this record. Try again.",
      );
      expect(screen.getByText("Server record")).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("clears every guest record at once without calling the server route", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([
        localRecord,
        { ...localRecord, id: "another-local-record", summary: "Another" },
      ]),
    );

    try {
      render(<HistoryList />);

      await user.click(
        await screen.findByRole("button", { name: "Clear all" }),
      );

      expect(confirmSpy).toHaveBeenCalledWith(
        "Delete all 2 history records? This cannot be undone.",
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText(/not executed any requests yet/i)).toBeVisible();
      expect(
        JSON.parse(
          window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY) || "[]",
        ),
      ).toEqual([]);
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("does not clear anything when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([localRecord]),
    );

    try {
      render(<HistoryList />);

      await user.click(
        await screen.findByRole("button", { name: "Clear all" }),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText("Local request")).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("clears a signed-in user's history via the server route and shows an error if it fails", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
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

      await user.click(screen.getByRole("button", { name: "Clear all" }));

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/history",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not clear history. Try again.",
      );
      expect(screen.getByText("Server record")).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });
});
