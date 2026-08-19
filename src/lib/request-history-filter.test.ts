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
});
