import type { RequestHistoryRecord } from "./request-history";

export type RequestHistoryExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

function getSafeExportedAt(exportedAt: Date) {
  return Number.isFinite(exportedAt.getTime()) ? exportedAt : new Date(0);
}

function getRequestSlug(record: RequestHistoryRecord) {
  const slug = `${record.method}-${record.path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return slug || "request";
}

export function createRequestHistoryExport(
  records: RequestHistoryRecord[],
  exportedAt = new Date(),
): RequestHistoryExport {
  const safeExportedAt = getSafeExportedAt(exportedAt);

  return {
    content: `${JSON.stringify(
      {
        exportedAt: safeExportedAt.toISOString(),
        requestCount: records.length,
        requests: records,
      },
      null,
      2,
    )}\n`,
    contentType: "application/json",
    fileName: `rsswag-request-history-${safeExportedAt.toISOString().slice(0, 10)}.json`,
  };
}

export function createRequestHistoryRecordExport(
  record: RequestHistoryRecord,
  exportedAt = new Date(),
): RequestHistoryExport {
  const safeExportedAt = getSafeExportedAt(exportedAt);
  const exportData = createRequestHistoryExport([record], safeExportedAt);

  return {
    ...exportData,
    fileName: `rsswag-${getRequestSlug(record)}-${safeExportedAt.toISOString().slice(0, 10)}.json`,
  };
}

function downloadRequestHistoryExport({
  content,
  contentType,
  fileName,
}: RequestHistoryExport) {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }

  let objectUrl = "";

  try {
    objectUrl = URL.createObjectURL(new Blob([content], { type: contentType }));
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    link.click();

    return true;
  } catch {
    return false;
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Cleanup failure does not mean the browser failed to start a download.
      }
    }
  }
}

export function downloadRequestHistoryFile(records: RequestHistoryRecord[]) {
  return downloadRequestHistoryExport(createRequestHistoryExport(records));
}

export function downloadRequestHistoryRecordFile(record: RequestHistoryRecord) {
  return downloadRequestHistoryExport(createRequestHistoryRecordExport(record));
}
