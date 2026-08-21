import { describe, expect, it } from "vitest";
import type { RequestHistoryRecord } from "./request-history";
import { filterRequestHistory } from "./request-history-filter";

const records: RequestHistoryRecord[] = [
  {
    createdAt: "2026-07-06T10:00:00.000Z",
    durationMs: 20,
    errorDetails: null,
    id: "successful",
    method: "GET",
    path: "/users",
    requestSize: 10,
    responseSize: 20,
    status: 200,
    summary: "List users",
    url: "/users?page=1",
  },
  {
    createdAt: "2026-07-06T09:00:00.000Z",
    durationMs: 50,
    errorDetails: "Gateway timeout while contacting upstream",
    id: "failed",
    method: "POST",
    path: "/reports",
    requestSize: 30,
    responseSize: 0,
    status: 504,
    summary: "Create report",
    url: "/reports",
  },
  {
    createdAt: "2026-07-06T08:00:00.000Z",
    durationMs: 12,
    errorDetails: null,
    id: "redirect",
    method: "GET",
    path: "/legacy",
    requestSize: 0,
    responseSize: 0,
    status: 302,
    summary: "Legacy route",
    url: "/legacy",
  },
];

describe("request history filters", () => {
  it("searches method, URL, summary, status, and error details", () => {
    expect(filterRequestHistory(records, "POST").map(({ id }) => id)).toEqual([
      "failed",
    ]);
    expect(filterRequestHistory(records, "page=1").map(({ id }) => id)).toEqual(
      ["successful"],
    );
    expect(
      filterRequestHistory(records, "timeout").map(({ id }) => id),
    ).toEqual(["failed"]);
    expect(filterRequestHistory(records, "302").map(({ id }) => id)).toEqual([
      "redirect",
    ]);
  });

  it("filters successful or failed outcomes using shared status rules", () => {
    expect(
      filterRequestHistory(records, "", "successful").map(({ id }) => id),
    ).toEqual(["successful", "redirect"]);
    expect(
      filterRequestHistory(records, "", "failed").map(({ id }) => id),
    ).toEqual(["failed"]);
    expect(
      filterRequestHistory(records, "users", "failed").map(({ id }) => id),
    ).toEqual([]);
    expect(records).toHaveLength(3);
  });

  it("filters records by rolling age windows and keeps boundary records", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const agedRecords: RequestHistoryRecord[] = [
      {
        ...records[0],
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        id: "recent",
      },
      {
        ...records[0],
        createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
        id: "week-boundary",
      },
      {
        ...records[0],
        createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
        id: "this-month",
      },
      {
        ...records[0],
        createdAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
        id: "older",
      },
      { ...records[0], createdAt: "invalid", id: "invalid" },
    ];

    expect(
      filterRequestHistory(agedRecords, "", "all", "24-hours", now).map(
        ({ id }) => id,
      ),
    ).toEqual(["recent"]);
    expect(
      filterRequestHistory(agedRecords, "", "all", "7-days", now).map(
        ({ id }) => id,
      ),
    ).toEqual(["recent", "week-boundary"]);
    expect(
      filterRequestHistory(agedRecords, "", "all", "30-days", now).map(
        ({ id }) => id,
      ),
    ).toEqual(["recent", "week-boundary", "this-month"]);
    expect(filterRequestHistory(agedRecords, "")).toHaveLength(5);
  });
});
