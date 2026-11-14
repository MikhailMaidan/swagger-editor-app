import { describe, expect, it } from "vitest";
import {
  parseRequestHistory,
  type RequestHistoryRecord,
} from "./request-history";
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
  it.each([
    {
      durations: [Number.MAX_VALUE, Number.MAX_VALUE],
      ratio: Number.MAX_VALUE / 1e308,
    },
    { durations: [1e308, 1e308, 0], ratio: 2 / 3 },
  ])(
    "keeps the average finite when the duration sum overflows: $durations",
    ({ durations, ratio }) => {
      const records = parseRequestHistory(
        JSON.stringify(
          durations.map((duration) => createRecord(200, duration)),
        ),
      );
      const stats = createRequestHistoryStats(records);

      expect(Number.isFinite(stats.averageDurationMs)).toBe(true);
      expect(stats.averageDurationMs / 1e308).toBeCloseTo(ratio, 12);
      expect(stats.total).toBe(durations.length);
      expect(stats.successful).toBe(durations.length);
    },
  );

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
      successRatePercent: 50,
      successful: 2,
      total: 4,
    });
  });

  it("returns zeroed metrics for an empty history", () => {
    expect(createRequestHistoryStats([])).toEqual({
      averageDurationMs: 0,
      failed: 0,
      successRatePercent: 0,
      successful: 0,
      total: 0,
    });
  });

  it("keeps imported invalid statuses without counting them as successful requests", () => {
    const records = parseRequestHistory(
      JSON.stringify([
        createRecord(200, 10),
        createRecord(-1, 20),
        createRecord(99, 30),
        createRecord(200.5, 40),
      ]),
    );

    expect(records.map(({ status }) => status)).toEqual([200, -1, 99, 200.5]);
    expect(createRequestHistoryStats(records)).toEqual({
      averageDurationMs: 25,
      failed: 3,
      successRatePercent: 25,
      successful: 1,
      total: 4,
    });
  });

  it("excludes invalid durations from the average without losing outcomes", () => {
    expect(
      createRequestHistoryStats([
        createRecord(200, 10),
        createRecord(500, Number.NaN),
        createRecord(204, -1),
      ]),
    ).toEqual({
      averageDurationMs: 10,
      failed: 1,
      successRatePercent: 67,
      successful: 2,
      total: 3,
    });
  });
});
