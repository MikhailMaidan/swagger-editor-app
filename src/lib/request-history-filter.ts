import type { RequestHistoryRecord } from "./request-history";
import { isErrorStatus } from "./status-color";

export type RequestHistoryOutcomeFilter = "all" | "failed" | "successful";
export type RequestHistoryAgeFilter = "all" | "24-hours" | "7-days" | "30-days";

const AGE_FILTER_DURATION_MS: Record<
  Exclude<RequestHistoryAgeFilter, "all">,
  number
> = {
  "24-hours": 24 * 60 * 60 * 1000,
  "7-days": 7 * 24 * 60 * 60 * 1000,
  "30-days": 30 * 24 * 60 * 60 * 1000,
};

export function filterRequestHistory(
  records: RequestHistoryRecord[],
  search: string,
  outcome: RequestHistoryOutcomeFilter = "all",
  age: RequestHistoryAgeFilter = "all",
  now = Date.now(),
) {
  const normalizedSearch = search.trim().toLowerCase();

  return records.filter((record) => {
    const failed = isErrorStatus(record.status);
    const matchesOutcome =
      outcome === "all" || (outcome === "failed" ? failed : !failed);

    if (!matchesOutcome) {
      return false;
    }

    if (age !== "all") {
      const createdAt = Date.parse(record.createdAt);

      if (
        !Number.isFinite(createdAt) ||
        createdAt < now - AGE_FILTER_DURATION_MS[age]
      ) {
        return false;
      }
    }

    return (
      !normalizedSearch ||
      record.method.toLowerCase().includes(normalizedSearch) ||
      record.path.toLowerCase().includes(normalizedSearch) ||
      record.url.toLowerCase().includes(normalizedSearch) ||
      record.summary.toLowerCase().includes(normalizedSearch) ||
      String(record.status).includes(normalizedSearch) ||
      (record.errorDetails || "").toLowerCase().includes(normalizedSearch)
    );
  });
}
