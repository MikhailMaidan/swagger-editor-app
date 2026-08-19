import type { RequestHistoryRecord } from "./request-history";
import { isErrorStatus } from "./status-color";

export type RequestHistoryOutcomeFilter = "all" | "failed" | "successful";

export function filterRequestHistory(
  records: RequestHistoryRecord[],
  search: string,
  outcome: RequestHistoryOutcomeFilter = "all",
) {
  const normalizedSearch = search.trim().toLowerCase();

  return records.filter((record) => {
    const failed = isErrorStatus(record.status);
    const matchesOutcome =
      outcome === "all" || (outcome === "failed" ? failed : !failed);

    if (!matchesOutcome) {
      return false;
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
