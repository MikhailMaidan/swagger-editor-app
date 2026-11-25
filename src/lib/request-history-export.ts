import type { RequestHistoryRecord } from "./request-history";
import { downloadTextFile } from "./schema-download";

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
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/[\uD800-\uDBFF]$/u, "")
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
  return downloadTextFile(content, fileName, contentType);
}

export function downloadRequestHistoryFile(records: RequestHistoryRecord[]) {
  return downloadRequestHistoryExport(createRequestHistoryExport(records));
}

export function downloadRequestHistoryRecordFile(record: RequestHistoryRecord) {
  return downloadRequestHistoryExport(createRequestHistoryRecordExport(record));
}
