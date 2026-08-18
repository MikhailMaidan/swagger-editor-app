import { describe, expect, it } from "vitest";
import type { RequestHistoryRecord } from "./request-history";
import { createRequestHistoryExport } from "./request-history-export";

describe("request history export", () => {
  it("creates a dated JSON export without changing the records", () => {
    const records: RequestHistoryRecord[] = [
      {
        createdAt: "2026-07-06T10:00:00.000Z",
        durationMs: 42,
        errorDetails: null,
        id: "request-1",
        method: "GET",
        path: "/users",
        requestSize: 0,
        responseSize: 24,
        status: 200,
        summary: "List users",
        url: "/users?page=1",
      },
    ];

    const result = createRequestHistoryExport(
      records,
      new Date("2026-08-18T12:30:00.000Z"),
    );

    expect(result.contentType).toBe("application/json");
    expect(result.fileName).toBe("rsswag-request-history-2026-08-18.json");
    expect(JSON.parse(result.content)).toEqual({
      exportedAt: "2026-08-18T12:30:00.000Z",
      requestCount: 1,
      requests: records,
    });
    expect(records).toHaveLength(1);
  });

  it("uses a stable fallback date when given an invalid export time", () => {
    const result = createRequestHistoryExport([], new Date("invalid"));

    expect(result.fileName).toBe("rsswag-request-history-1970-01-01.json");
    expect(JSON.parse(result.content)).toMatchObject({
      exportedAt: "1970-01-01T00:00:00.000Z",
      requestCount: 0,
      requests: [],
    });
  });
});
