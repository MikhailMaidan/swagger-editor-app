import type { RequestHistoryRecord } from "./request-history";
import { isErrorStatus } from "./status-color";

export type RequestHistoryOutcomeFilter = "all" | "failed" | "successful";
export type RequestHistoryAgeFilter = "all" | "24-hours" | "7-days" | "30-days";
export type RequestHistoryDurationFilter =
  "all" | "under-100" | "100-to-499" | "500-plus";

const AGE_FILTER_DURATION_MS: Record<
  Exclude<RequestHistoryAgeFilter, "all">,
  number
> = {
  "24-hours": 24 * 60 * 60 * 1000,
  "7-days": 7 * 24 * 60 * 60 * 1000,
  "30-days": 30 * 24 * 60 * 60 * 1000,
};

export function getRequestHistoryMethods(records: RequestHistoryRecord[]) {
  return Array.from(
    new Set(
      records
        .map((record) => record.method.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).sort((firstMethod, secondMethod) =>
    firstMethod.localeCompare(secondMethod),
  );
}

export function filterRequestHistoryByMethod(
  records: RequestHistoryRecord[],
  method = "all",
) {
  const normalizedMethod = method.trim().toUpperCase();

  if (!normalizedMethod || normalizedMethod === "ALL") {
    return records;
  }

  return records.filter(
    (record) => record.method.trim().toUpperCase() === normalizedMethod,
  );
}

export function filterRequestHistoryByDuration(
  records: RequestHistoryRecord[],
  duration: RequestHistoryDurationFilter = "all",
) {
  if (duration === "all") {
    return records;
  }

  return records.filter((record) => {
    const durationMs = record.durationMs;

    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return false;
    }

    if (duration === "under-100") {
      return durationMs < 100;
    }

    if (duration === "100-to-499") {
      return durationMs >= 100 && durationMs < 500;
    }

    return durationMs >= 500;
  });
}

export function filterRequestHistory(
  records: RequestHistoryRecord[],
  search: string,
  outcome: RequestHistoryOutcomeFilter = "all",
  age: RequestHistoryAgeFilter = "all",
  now = Date.now(),
) {
  const searchTerms = search.toLowerCase().split(/\s+/).filter(Boolean);

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

    if (searchTerms.length === 0) return true;

    const searchableText = [
      record.method,
      record.path,
      record.url,
      record.summary,
      record.status,
      record.errorDetails || "",
    ]
      .join(" ")
      .toLowerCase();

    return searchTerms.every((term) => searchableText.includes(term));
  });
}
