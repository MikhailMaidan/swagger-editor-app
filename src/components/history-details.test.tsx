import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getEndpointEditorHref } from "@/lib/endpoint-link";
import type { RequestHistoryRecord } from "@/lib/request-history";
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
    expect(
      screen.getByRole("link", { name: "Open endpoint in editor" }),
    ).toHaveAttribute("href", getEndpointEditorHref("GET", "/users/{id}"));
  });

  it("shows 0 B instead of literal 'null B' when sizes are missing from the record", () => {
    render(
      <HistoryDetails
        record={
          {
            createdAt: "2026-07-11T08:00:00.000Z",
            durationMs: 42,
            errorDetails: null,
            id: "history-2",
            method: "GET",
            path: "/users/{id}",
            requestSize: null,
            responseSize: undefined,
            status: 200,
            summary: "Get user",
            url: "https://api.example.com/users/42",
          } as unknown as RequestHistoryRecord
        }
      />,
    );

    expect(screen.getAllByText("0 B")).toHaveLength(2);
    expect(screen.queryByText(/null B|undefined B/)).not.toBeInTheDocument();
  });

  it("color-codes the status badge red for an error status and green for success", () => {
    const { rerender } = render(
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

    expect(screen.getByText("404").className).toContain("text-red-700");

    rerender(
      <HistoryDetails
        record={{
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
        }}
      />,
    );

    expect(screen.getByText("200").className).toContain("text-emerald-700");
  });

  it("copies request details as JSON and reports clipboard failures", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Clipboard unavailable"));
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
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

      const copyButton = screen.getByRole("button", {
        name: "Copy request details",
      });

      await user.click(copyButton);

      expect(JSON.parse(writeText.mock.calls[0][0] as string)).toMatchObject({
        id: "history-1",
        method: "GET",
        status: 404,
        url: "https://api.example.com/users/42",
      });
      expect(screen.getByRole("status")).toHaveTextContent(
        "Request details copied.",
      );

      await user.click(copyButton);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not copy request details.",
      );
      expect(
        screen.queryByText("Request details copied."),
      ).not.toBeInTheDocument();
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  it("downloads the current request as a JSON history export", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:history-record");
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
        <HistoryDetails
          record={{
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
          }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Download JSON" }));

      const downloadAnchor = anchors.find((anchor) => anchor.download);

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(downloadAnchor?.download).toMatch(
        /^rsswag-get-users-id-\d{4}-\d{2}-\d{2}\.json$/,
      );
      expect(downloadAnchor?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:history-record");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("shows a friendly message for a missing record", () => {
    render(<HistoryDetails record={null} />);

    expect(
      screen.getByText("This history record is not available."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copy request details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download JSON" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open endpoint in editor" }),
    ).not.toBeInTheDocument();
  });
});
