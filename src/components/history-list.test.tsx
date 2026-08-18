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

    const serverRow = screen.getByText("Server record").closest("tr");

    expect(serverRow).not.toBeNull();
    expect(within(serverRow as HTMLTableRowElement).getByText("52 ms")).toBeVisible();
    expect(screen.getByText("/server")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View details for Server record" }),
    ).toHaveAttribute("href", "/history/server-record");
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

  it("summarizes visible request outcomes and average duration", () => {
    render(
      <HistoryList
        initialRecords={[
          {
            createdAt: "2026-07-06T10:00:00.000Z",
            durationMs: 52,
            errorDetails: null,
            id: "ok-record",
            method: "GET",
            path: "/ok",
            requestSize: 100,
            responseSize: 140,
            status: 200,
            summary: "Successful request",
            url: "/ok",
          },
          {
            createdAt: "2026-07-06T09:00:00.000Z",
            durationMs: 12,
            errorDetails: "network error",
            id: "failed-record",
            method: "GET",
            path: "/failed",
            requestSize: 40,
            responseSize: 0,
            status: 0,
            summary: "Failed request",
            url: "/failed",
          },
        ]}
      />,
    );

    const stats = screen.getByLabelText("Visible request statistics");

    expect(within(stats).getByText("Total requests").parentElement).toHaveTextContent(
      "2",
    );
    expect(within(stats).getByText("Successful").parentElement).toHaveTextContent(
      "1",
    );
    expect(within(stats).getByText("Failed").parentElement).toHaveTextContent(
      "1",
    );
    expect(within(stats).getByText("Average duration").parentElement).toHaveTextContent(
      "32 ms",
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
        "Review previously executed requests and their details.",
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

  it("sorts visible history by age, duration, and failures", async () => {
    const user = userEvent.setup();

    render(
      <HistoryList
        initialRecords={[
          {
            createdAt: "2026-07-06T10:00:00.000Z",
            durationMs: 90,
            errorDetails: null,
            id: "newest-record",
            method: "GET",
            path: "/newest",
            requestSize: 100,
            responseSize: 140,
            status: 200,
            summary: "Newest request",
            url: "/newest",
          },
          {
            createdAt: "2026-07-06T09:00:00.000Z",
            durationMs: 40,
            errorDetails: "Server error",
            id: "failed-record",
            method: "POST",
            path: "/failed",
            requestSize: 90,
            responseSize: 0,
            status: 500,
            summary: "Failed request",
            url: "/failed",
          },
          {
            createdAt: "2026-07-06T08:00:00.000Z",
            durationMs: 30,
            errorDetails: null,
            id: "oldest-record",
            method: "GET",
            path: "/oldest",
            requestSize: 80,
            responseSize: 120,
            status: 200,
            summary: "Oldest request",
            url: "/oldest",
          },
        ]}
      />,
    );

    const sort = screen.getByLabelText("Sort request history");

    expect(within(screen.getAllByRole("row")[1]).getByText("Newest request")).toBeVisible();

    await user.selectOptions(sort, "oldest");
    expect(within(screen.getAllByRole("row")[1]).getByText("Oldest request")).toBeVisible();

    await user.selectOptions(sort, "slowest");
    expect(within(screen.getAllByRole("row")[1]).getByText("Newest request")).toBeVisible();

    await user.selectOptions(sort, "failures");
    expect(within(screen.getAllByRole("row")[1]).getByText("Failed request")).toBeVisible();
  });

  it("exports the currently filtered and sorted history as JSON", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:request-history");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);

        if (tagName === "a") {
          element.click = vi.fn();
          anchors.push(element as HTMLAnchorElement);
        }

        return element;
      });

    try {
      render(
        <HistoryList
          initialRecords={[
            {
              createdAt: "2026-07-06T10:00:00.000Z",
              durationMs: 20,
              errorDetails: null,
              id: "newest-get",
              method: "GET",
              path: "/newest",
              requestSize: 10,
              responseSize: 20,
              status: 200,
              summary: "Newest GET",
              url: "/newest",
            },
            {
              createdAt: "2026-07-06T09:00:00.000Z",
              durationMs: 30,
              errorDetails: null,
              id: "post-record",
              method: "POST",
              path: "/post",
              requestSize: 30,
              responseSize: 40,
              status: 201,
              summary: "Create record",
              url: "/post",
            },
            {
              createdAt: "2026-07-06T08:00:00.000Z",
              durationMs: 40,
              errorDetails: null,
              id: "oldest-get",
              method: "GET",
              path: "/oldest",
              requestSize: 50,
              responseSize: 60,
              status: 200,
              summary: "Oldest GET",
              url: "/oldest",
            },
          ]}
        />,
      );

      const filter = screen.getByLabelText("Filter request history");
      const sort = screen.getByLabelText("Sort request history");
      const exportButton = screen.getByRole("button", {
        name: "Export visible request history",
      });

      await user.type(filter, "GET");
      await user.selectOptions(sort, "oldest");
      await user.click(exportButton);

      const exportBlob = createObjectURL.mock.calls[0][0] as Blob;
      const exportContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener("load", () => resolve(String(reader.result)));
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsText(exportBlob);
      });
      const exportedHistory = JSON.parse(exportContent) as {
        requestCount: number;
        requests: Array<{ id: string }>;
      };

      expect(exportBlob.type).toBe("application/json");
      expect(exportedHistory.requestCount).toBe(2);
      expect(exportedHistory.requests.map((record) => record.id)).toEqual([
        "oldest-get",
        "newest-get",
      ]);
      const downloadAnchor = anchors.find((anchor) => anchor.download);

      expect(downloadAnchor?.download).toMatch(
        /^rsswag-request-history-\d{4}-\d{2}-\d{2}\.json$/,
      );
      expect(downloadAnchor?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:request-history");

      await user.clear(filter);
      await user.type(filter, "missing");

      expect(exportButton).toBeDisabled();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("filters request history by method, URL, summary, and status", async () => {
    const user = userEvent.setup();

    render(
      <HistoryList
        initialRecords={[
          {
            createdAt: "2026-07-06T10:00:00.000Z",
            durationMs: 52,
            errorDetails: null,
            id: "get-record",
            method: "GET",
            path: "/users",
            requestSize: 100,
            responseSize: 140,
            status: 200,
            summary: "List users",
            url: "/users?page=1",
          },
          {
            createdAt: "2026-07-06T09:00:00.000Z",
            durationMs: 30,
            errorDetails: null,
            id: "post-record",
            method: "POST",
            path: "/accounts",
            requestSize: 90,
            responseSize: 130,
            status: 201,
            summary: "Create account",
            url: "/accounts",
          },
        ]}
      />,
    );

    const filter = screen.getByLabelText("Filter request history");

    expect(screen.getByText("Showing 2 of 2 requests")).toBeVisible();

    await user.type(filter, "POST");

    expect(screen.getByText("Create account")).toBeVisible();
    expect(screen.queryByText("List users")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 2 requests")).toBeVisible();

    await user.clear(filter);
    await user.type(filter, "missing");

    expect(
      screen.getByText("No history records match your search."),
    ).toBeVisible();
    expect(screen.getByText("Showing 0 of 2 requests")).toBeVisible();
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

  it("keeps the local copy of a record when its server-side delete fails", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([{ ...localRecord, id: "server-record" }]),
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
      await screen.findByRole("alert");

      expect(
        JSON.parse(
          window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY) || "[]",
        ),
      ).toHaveLength(1);
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

  it("keeps local history when an authenticated clear-all request fails", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify([localRecord]),
    );

    try {
      render(
        <HistoryList
          initialRecords={[
            { ...localRecord, errorDetails: null, url: localRecord.path },
          ]}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Clear all" }));
      await screen.findByRole("alert");

      expect(
        JSON.parse(
          window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY) || "[]",
        ),
      ).toHaveLength(1);
      expect(screen.getByText("Local request")).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });
});
