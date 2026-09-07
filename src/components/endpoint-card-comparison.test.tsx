import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "@/lib/openapi";
import { EndpointCard } from "./endpoint-card";

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info: { title: Compare API, version: '1' }
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

describe("endpoint response comparison", () => {
  it("compares actual mock runs across response clearing and status selection without network or history writes", async () => {
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
      expect(
        screen.queryByRole("region", { name: "Response comparison" }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Generate Mock" }));
      await user.click(
        await screen.findByRole("button", { name: "Pin response baseline" }),
      );
      await user.click(screen.getByRole("button", { name: "Clear response" }));
      expect(screen.getByText(/Baseline retained/)).toBeVisible();
      await user.selectOptions(
        screen.getByLabelText("Mock response status"),
        "404",
      );
      await user.click(screen.getByRole("button", { name: "Generate Mock" }));
      const comparison = await screen.findByRole("region", {
        name: "Response comparison",
      });
      expect(within(comparison).getByText("3 response changes")).toBeVisible();
      const table = within(comparison).getByRole("table");
      expect(within(table).getByText("/status")).toBeVisible();
      expect(within(table).getByText("/name")).toBeVisible();
      expect(within(table).getByText("/error")).toBeVisible();
      expect(screen.getByLabelText("Response body")).toHaveTextContent(
        "missing",
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.length).toBe(0);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("compares successive live responses without changing request execution", async () => {
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
        Response.json({ ...payload, body: '{"name":"Grace"}', durationMs: 20 }),
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
      await user.click(screen.getByRole("button", { name: "Try It Out" }));
      await user.click(
        await screen.findByRole("button", { name: "Pin response baseline" }),
      );
      await user.click(screen.getByRole("button", { name: "Try It Out" }));
      expect(await screen.findByText("1 response changes")).toBeVisible();
      expect(screen.getByLabelText("Response body")).toHaveTextContent("Grace");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/try-it-out");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
