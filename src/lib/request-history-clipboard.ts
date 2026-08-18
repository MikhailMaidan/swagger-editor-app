import type { RequestHistoryRecord } from "./request-history";

export function serializeRequestHistoryRecord(record: RequestHistoryRecord) {
  return `${JSON.stringify(
    {
      id: record.id,
      method: record.method,
      path: record.path,
      url: record.url,
      status: record.status,
      summary: record.summary,
      durationMs: record.durationMs,
      requestSize: record.requestSize ?? 0,
      responseSize: record.responseSize ?? 0,
      errorDetails: record.errorDetails ?? null,
      createdAt: record.createdAt,
    },
    null,
    2,
  )}\n`;
}
