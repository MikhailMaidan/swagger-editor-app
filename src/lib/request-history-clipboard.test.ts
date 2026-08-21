import { describe, expect, it } from "vitest";
import type { RequestHistoryRecord } from "./request-history";
import {
  serializeRequestHistoryRecord,
  serializeRequestHistoryRecords,
} from "./request-history-clipboard";

describe("request history clipboard", () => {
  it("serializes a request record as stable, readable JSON", () => {
    const record: RequestHistoryRecord = {
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
    };

    const serialized = serializeRequestHistoryRecord(record);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual({
      id: "history-1",
      method: "GET",
      path: "/users/{id}",
      url: "https://api.example.com/users/42",
      status: 404,
      summary: "Get user",
      durationMs: 42,
      requestSize: 80,
      responseSize: 120,
      errorDetails: "404 Not Found",
      createdAt: "2026-07-11T08:00:00.000Z",
    });
  });

  it("normalizes missing legacy size and error fields", () => {
    const record = {
      createdAt: "2026-07-11T08:00:00.000Z",
      durationMs: 42,
      id: "history-2",
      method: "GET",
      path: "/users",
      status: 200,
      summary: "List users",
      url: "/users",
    } as RequestHistoryRecord;

    expect(JSON.parse(serializeRequestHistoryRecord(record))).toMatchObject({
      errorDetails: null,
      requestSize: 0,
      responseSize: 0,
    });
  });

  it("serializes an ordered collection using the same normalized shape", () => {
    const firstRecord = {
      createdAt: "2026-07-11T08:00:00.000Z",
      durationMs: 42,
      id: "history-1",
      method: "GET",
      path: "/users",
      status: 200,
      summary: "List users",
      url: "/users",
    } as RequestHistoryRecord;
    const secondRecord = {
      ...firstRecord,
      id: "history-2",
      method: "POST",
      path: "/reports",
      url: "/reports",
    };
    const serialized = serializeRequestHistoryRecords([
      secondRecord,
      firstRecord,
    ]);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toMatchObject([
      { id: "history-2", requestSize: 0, responseSize: 0 },
      { id: "history-1", requestSize: 0, responseSize: 0 },
    ]);
  });
});
