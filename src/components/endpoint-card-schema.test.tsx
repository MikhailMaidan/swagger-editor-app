import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "@/lib/openapi";
import { EndpointCard } from "./endpoint-card";

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info: { title: Schema Builder API, version: '1' }
servers: [{ url: 'https://example.test' }]
paths:
  /item:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { type: object }
              example: { id: 1, name: Ada }
`);
if (!parsed.ok) throw new Error(parsed.error);
const endpoint = parsed.value.endpoints[0];

describe("endpoint response schema builder", () => {
  it.each(["mock", "live"] as const)(
    "captures %s responses without extra requests or history writes",
    async (executionMode) => {
      const user = userEvent.setup();
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({
          body: '{"id":1,"name":"Ada"}',
          headers: { "content-type": "application/json" },
          status: "200",
          durationMs: 10,
          requestSize: 0,
          responseSize: 21,
          errorDetails: null,
          url: "https://example.test/item",
        }),
      );
      try {
        render(
          <EndpointCard
            endpoint={endpoint}
            canSaveHistory={false}
            executionMode={executionMode}
            mockResponseDelayMs={0}
          />,
        );
        await user.click(screen.getByText("Response schema builder"));
        expect(
          await screen.findByRole("button", {
            name: "Capture current response",
          }),
        ).toBeDisabled();
        await user.click(
          screen.getByRole("button", {
            name: executionMode === "mock" ? "Generate Mock" : "Try It Out",
          }),
        );
        await screen.findByLabelText("Response body");
        await user.click(
          screen.getByRole("button", { name: "Capture current response" }),
        );
        const schema = JSON.parse(
          screen.getByLabelText("Inferred schema preview").textContent!,
        );
        expect(schema.properties).toEqual({
          id: { type: "integer" },
          name: { type: "string" },
        });
        expect(screen.getByText("Response comparison")).toBeInTheDocument();
        await user.click(
          screen.getByRole("button", { name: "Clear response" }),
        );
        expect(screen.getByText("Captured examples: 1/10")).toBeVisible();
        expect(
          screen.getByRole("button", { name: "Capture current response" }),
        ).toBeDisabled();
        expect(screen.getByText("Response assertions")).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(
          executionMode === "live" ? 1 : 0,
        );
        expect(window.localStorage.length).toBe(0);
      } finally {
        fetchMock.mockRestore();
      }
    },
  );
});
