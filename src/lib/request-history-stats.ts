import type { RequestHistoryRecord } from "./request-history";
import { isErrorStatus } from "./status-color";

export type RequestHistoryStats = {
  averageDurationMs: number;
  failed: number;
  successRatePercent: number;
  successful: number;
  total: number;
};

export function createRequestHistoryStats(
  records: RequestHistoryRecord[],
): RequestHistoryStats {
  let failed = 0;
  let measuredDurationCount = 0;
  let totalDurationMs = 0;

  records.forEach((record) => {
    if (isErrorStatus(record.status)) {
      failed += 1;
    }

    if (Number.isFinite(record.durationMs) && record.durationMs >= 0) {
      measuredDurationCount += 1;
      totalDurationMs += record.durationMs;
    }
  });

  const successful = records.length - failed;

  return {
    averageDurationMs:
      measuredDurationCount === 0
        ? 0
        : Math.round(totalDurationMs / measuredDurationCount),
    failed,
    successRatePercent:
      records.length === 0
        ? 0
        : Math.round((successful / records.length) * 100),
    successful,
    total: records.length,
  };
}
