import type { RequestHistoryRecord } from "./request-history";
import { isErrorStatus } from "./status-color";

export type RequestHistoryStats = {
  averageDurationMs: number;
  failed: number;
  successful: number;
  total: number;
};

export function createRequestHistoryStats(
  records: RequestHistoryRecord[],
): RequestHistoryStats {
  let failed = 0;
  let totalDurationMs = 0;

  records.forEach((record) => {
    if (isErrorStatus(record.status)) {
      failed += 1;
    }

    totalDurationMs +=
      Number.isFinite(record.durationMs) && record.durationMs >= 0
        ? record.durationMs
        : 0;
  });

  return {
    averageDurationMs:
      records.length === 0 ? 0 : Math.round(totalDurationMs / records.length),
    failed,
    successful: records.length - failed,
    total: records.length,
  };
}
