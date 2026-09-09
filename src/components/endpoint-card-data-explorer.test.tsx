import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "@/lib/openapi";
import { EndpointCard } from "./endpoint-card";

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info: { title: Explorer API, version: '1' }
paths:
  /items:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { type: array }
              example: [{ name: Ada }]
`);
if (!parsed.ok) throw new Error(parsed.error);
const endpoint = parsed.value.endpoints[0];

describe("endpoint response data exploration", () => {
  it("explores actual mock response tables while retaining raw responses and assertions", async () => {
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
        screen.queryByText("Response data explorer"),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Generate Mock" }));
      await user.click(await screen.findByText("Response data explorer"));
      await user.selectOptions(
        await screen.findByLabelText("Array display"),
        "table",
      );
      expect(
        within(
          screen.getByRole("table", { name: "Response array data" }),
        ).getByText('"Ada"'),
      ).toBeVisible();
      expect(screen.getByLabelText("Response body")).toHaveTextContent("Ada");
      await user.click(screen.getByText("Response assertions"));
      await user.click(
        screen.getByRole("button", { name: "Add status check" }),
      );
      expect(
        screen.getByText("1 passed · 0 failed · 0 errors · Mock response"),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Clear response" }));
      expect(
        screen.queryByText("Response data explorer"),
      ).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.length).toBe(0);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("updates exploration for successive live responses while preserving response comparison", async () => {
    const user = userEvent.setup();
    const payload = {
      body: '[{"name":"Ada"}]',
      headers: { "content-type": "application/json" },
      status: "200",
      durationMs: 10,
      requestSize: 0,
      responseSize: 16,
      errorDetails: null,
      url: "https://example.test/items",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(payload))
      .mockResolvedValueOnce(
        Response.json({ ...payload, body: '[{"name":"Grace"}]' }),
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
      await user.click(await screen.findByText("Response data explorer"));
      await user.click(await screen.findByRole("button", { name: /^"0"/ }));
      expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue("/0");
      await user.click(
        screen.getByRole("button", { name: "Pin response baseline" }),
      );
      await user.click(screen.getByRole("button", { name: "Try It Out" }));
      expect(await screen.findByText("1 response changes")).toBeVisible();
      expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue("");
      expect(screen.getByLabelText("Response body")).toHaveTextContent("Grace");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
