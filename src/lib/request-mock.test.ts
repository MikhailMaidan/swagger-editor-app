import { describe, expect, it, vi } from "vitest";
import type { ResponseSummary } from "./openapi";
import {
  createSchemaMockResponse,
  waitForMockResponseDelay,
} from "./request-mock";

function createResponse(
  overrides: Partial<ResponseSummary> = {},
): ResponseSummary {
  return {
    contentTypes: ["application/json"],
    description: "OK",
    schema: {
      example: '{"id":7}',
      exampleName: "",
      properties: ["id"],
      type: "object",
    },
    status: "200",
    ...overrides,
  };
}

describe("schema mock responses", () => {
  it("uses the documented example, status, and media type", () => {
    expect(createSchemaMockResponse(createResponse(), "fallback")).toEqual({
      body: '{"id":7}',
      headers: { "content-type": "application/json" },
      status: "200",
    });
  });

  it("normalizes status ranges and default responses", () => {
    expect(
      createSchemaMockResponse(createResponse({ status: "2XX" }), "fallback")
        .status,
    ).toBe("200");
    expect(
      createSchemaMockResponse(
        createResponse({ status: "default" }),
        "fallback",
      ).status,
    ).toBe("200");
  });

  it("falls back safely when response details are missing", () => {
    expect(createSchemaMockResponse(undefined, "No example")).toEqual({
      body: "No example",
      headers: {},
      status: "200",
    });
    expect(
      createSchemaMockResponse(
        createResponse({ contentTypes: [], schema: null, status: "204" }),
        "No content",
      ),
    ).toEqual({ body: "No content", headers: {}, status: "204" });
  });

  it("completes simulated latency and stops immediately when aborted", async () => {
    vi.useFakeTimers();

    try {
      const completedController = new AbortController();
      const completed = waitForMockResponseDelay(
        500,
        completedController.signal,
      );

      await vi.advanceTimersByTimeAsync(500);
      await expect(completed).resolves.toBe(true);

      const cancelledController = new AbortController();
      const cancelled = waitForMockResponseDelay(
        5_000,
        cancelledController.signal,
      );

      cancelledController.abort();
      await expect(cancelled).resolves.toBe(false);
      await expect(
        waitForMockResponseDelay(0, new AbortController().signal),
      ).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
