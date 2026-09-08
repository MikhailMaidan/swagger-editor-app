import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "@/lib/openapi";
import { EndpointCard } from "./endpoint-card";

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info: { title: Assertion API, version: '1' }
paths:
  /item:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { type: object }
              example: { name: Ada }
        '404':
          description: Missing
          content:
            application/json:
              schema: { type: object }
              example: { error: missing }
`);
if (!parsed.ok) throw new Error(parsed.error);
const endpoint = parsed.value.endpoints[0];

describe("endpoint response assertions", () => {
  it("checks actual mock responses and retains rules after clearing without requests or history writes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      render(
        <EndpointCard
          endpoint={endpoint}
          canSaveHistory={false}
          executionMode="mock"
          mockResponseDelayMs={0}
        />,
      );
      await user.click(screen.getByText("Response assertions"));
      await user.click(
        screen.getByRole("button", { name: "Add status check" }),
      );
      expect(screen.getByText(/Checks ready/)).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Generate Mock" }));
      expect(
        await screen.findByText(
          "1 passed · 0 failed · 0 errors · Mock response",
        ),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Clear response" }));
      expect(screen.getByLabelText("Expected value")).toHaveValue("200");
      await user.selectOptions(
        screen.getByLabelText("Mock response status"),
        "404",
      );
      await user.click(screen.getByRole("button", { name: "Generate Mock" }));
      expect(
        await screen.findByText(
          "0 passed · 1 failed · 0 errors · Mock response",
        ),
      ).toBeVisible();
      expect(screen.getByLabelText("Response body")).toHaveTextContent(
        "missing",
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.length).toBe(0);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("checks successive live responses alongside the existing response comparison", async () => {
    const user = userEvent.setup();
    const payload = {
      body: '{"name":"Ada"}',
      headers: { "content-type": "application/json" },
      status: "200",
      durationMs: 10,
      requestSize: 0,
      responseSize: 14,
      errorDetails: null,
      url: "https://example.test/item",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(payload))
      .mockResolvedValueOnce(
        Response.json({
          ...payload,
          status: "404",
          body: '{"error":"missing"}',
        }),
      );
    try {
      render(
        <EndpointCard
          endpoint={{ ...endpoint, serverUrl: "https://example.test" }}
          canSaveHistory={false}
          executionMode="live"
          mockResponseDelayMs={0}
        />,
      );
      await user.click(screen.getByText("Response assertions"));
      await user.click(
        screen.getByRole("button", { name: "Add status check" }),
      );
      await user.click(screen.getByRole("button", { name: "Try It Out" }));
      expect(
        await screen.findByText(
          "1 passed · 0 failed · 0 errors · Live response",
        ),
      ).toBeVisible();
      await user.click(
        screen.getByRole("button", { name: "Pin response baseline" }),
      );
      await user.click(screen.getByRole("button", { name: "Try It Out" }));
      expect(
        await screen.findByText(
          "0 passed · 1 failed · 0 errors · Live response",
        ),
      ).toBeVisible();
      const comparison = screen.getByRole("region", {
        name: "Response comparison",
      });
      expect(within(comparison).getByText("3 response changes")).toBeVisible();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/try-it-out");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
