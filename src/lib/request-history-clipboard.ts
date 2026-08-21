import type { RequestHistoryRecord } from "./request-history";

function createSerializableRequestHistoryRecord(record: RequestHistoryRecord) {
  return {
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
  };
}

export function serializeRequestHistoryRecord(record: RequestHistoryRecord) {
  return `${JSON.stringify(createSerializableRequestHistoryRecord(record), null, 2)}\n`;
}

export function serializeRequestHistoryRecords(
  records: RequestHistoryRecord[],
) {
  return `${JSON.stringify(
    records.map(createSerializableRequestHistoryRecord),
    null,
    2,
  )}\n`;
}
