import type { RequestHistoryRecord } from "./request-history";

export type RequestHistoryExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

export function createRequestHistoryExport(
  records: RequestHistoryRecord[],
  exportedAt = new Date(),
): RequestHistoryExport {
  const safeExportedAt = Number.isFinite(exportedAt.getTime())
    ? exportedAt
    : new Date(0);

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

export function downloadRequestHistoryFile(records: RequestHistoryRecord[]) {
  const { content, contentType, fileName } =
    createRequestHistoryExport(records);
  const objectUrl = URL.createObjectURL(
    new Blob([content], { type: contentType }),
  );
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;

  try {
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
