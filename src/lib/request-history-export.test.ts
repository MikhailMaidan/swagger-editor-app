import { describe, expect, it } from "vitest";
import type { RequestHistoryRecord } from "./request-history";
import {
  createRequestHistoryExport,
  createRequestHistoryRecordExport,
  downloadRequestHistoryFile,
} from "./request-history-export";

const record: RequestHistoryRecord = {
  createdAt: "2026-07-06T10:00:00.000Z",
  durationMs: 42,
  errorDetails: null,
  id: "request-1",
  method: "GET",
  path: "/users/{id}",
  requestSize: 0,
  responseSize: 24,
  status: 200,
  summary: "Get user",
  url: "/users/42",
};

describe("request history export", () => {
  it("creates a dated JSON export without changing the records", () => {
    const records: RequestHistoryRecord[] = [record];

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

  it("creates a single-record export with a safe descriptive filename", () => {
    const result = createRequestHistoryRecordExport(
      record,
      new Date("2026-08-18T12:30:00.000Z"),
    );

    expect(result.fileName).toBe("rsswag-get-users-id-2026-08-18.json");
    expect(JSON.parse(result.content)).toEqual({
      exportedAt: "2026-08-18T12:30:00.000Z",
      requestCount: 1,
      requests: [record],
    });
  });

  it("bounds single-record filenames and falls back for unsafe labels", () => {
    const result = createRequestHistoryRecordExport(
      {
        ...record,
        method: "",
        path: `/${"segment".repeat(20)}`,
      },
      new Date("invalid"),
    );
    const slug = result.fileName.replace(/^rsswag-|-1970-01-01\.json$/g, "");

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(result.fileName).toMatch(/^rsswag-[a-z0-9-]+-1970-01-01\.json$/);
    expect(
      createRequestHistoryRecordExport(
        { ...record, method: "", path: "///???///" },
        new Date("2026-08-18T12:30:00.000Z"),
      ).fileName,
    ).toBe("rsswag-request-2026-08-18.json");
  });

  it("returns failure instead of throwing when downloads are blocked", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new DOMException("Downloads blocked", "SecurityError");
    };

    try {
      expect(downloadRequestHistoryFile([record])).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
