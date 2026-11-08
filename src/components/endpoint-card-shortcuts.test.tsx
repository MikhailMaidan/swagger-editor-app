import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OPENAPI_SCHEMA, parseOpenApiSchema } from "@/lib/openapi";
import { EndpointCard } from "./endpoint-card";

describe("endpoint shortcuts during text composition", () => {
  it("runs a request only after composition finishes", async () => {
    const parsed = parseOpenApiSchema(DEFAULT_OPENAPI_SCHEMA);
    if (!parsed.ok) throw new Error(parsed.error);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        body: '{"id":"42"}',
        durationMs: 1,
        errorDetails: null,
        headers: { "content-type": "application/json" },
        requestSize: 0,
        responseSize: 11,
        status: "200",
        url: "https://example.test/users/42",
      }),
    );
    try {
      render(
        <EndpointCard
          endpoint={parsed.value.endpoints[0]}
          canSaveHistory={false}
          executionMode="live"
          mockResponseDelayMs={0}
        />,
      );
      const input = screen.getByLabelText("Path parameter id");
      fireEvent.change(input, { target: { value: "42" } });
      expect(
        fireEvent.keyDown(input, {
          key: "Enter",
          ctrlKey: true,
          isComposing: true,
        }),
      ).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        fireEvent.keyDown(input, {
          key: "Enter",
          ctrlKey: true,
          isComposing: false,
        }),
      ).toBe(false);
      await screen.findByLabelText("Response body");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
