import { describe, expect, it } from "vitest";
import type { RequestHistoryRecord } from "./request-history";
import { createRequestHistoryStats } from "./request-history-stats";

function createRecord(
  status: number,
  durationMs: number,
): RequestHistoryRecord {
  return {
    createdAt: "2026-08-18T10:00:00.000Z",
    durationMs,
    errorDetails: null,
    id: `${status}-${durationMs}`,
    method: "GET",
    path: "/stats",
    requestSize: 0,
    responseSize: 0,
    status,
    summary: "Stats request",
    url: "/stats",
  };
}

describe("request history statistics", () => {
  it("summarizes successful, failed, and average request duration", () => {
    expect(
      createRequestHistoryStats([
        createRecord(200, 10),
        createRecord(302, 20),
        createRecord(404, 30),
        createRecord(0, 40),
      ]),
    ).toEqual({
      averageDurationMs: 25,
      failed: 2,
      successful: 2,
      total: 4,
    });
  });

  it("returns zeroed metrics for an empty history", () => {
    expect(createRequestHistoryStats([])).toEqual({
      averageDurationMs: 0,
      failed: 0,
      successful: 0,
      total: 0,
    });
  });
});
