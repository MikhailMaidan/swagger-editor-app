export const REQUEST_HISTORY_STORAGE_KEY = "rsswagger-request-history";
export const SERVER_REQUEST_HISTORY_COOKIE = "rsswagger-server-history";
export const MAX_REQUEST_HISTORY_RECORDS = 20;

export type RequestHistoryRecord = {
  id: string;
  method: string;
  path: string;
  status: number;
  summary: string;
  durationMs: number;
  requestSize?: number;
  responseSize?: number;
  createdAt: string;
};

export type RequestHistoryDraft = Omit<
  RequestHistoryRecord,
  "id" | "createdAt"
>;

function createId() {
  return `${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

export function isRequestHistoryRecord(
  value: unknown,
): value is RequestHistoryRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.method === "string" &&
    typeof record.path === "string" &&
    typeof record.status === "number" &&
    typeof record.summary === "string" &&
    typeof record.durationMs === "number" &&
    typeof record.createdAt === "string"
  );
}

export function parseRequestHistory(value?: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);

    return Array.isArray(parsedValue)
      ? parsedValue.filter(isRequestHistoryRecord)
      : [];
  } catch {
    return [];
  }
}

export function sortRequestHistory(records: RequestHistoryRecord[]) {
  return [...records].sort(
    (firstRecord, secondRecord) =>
      new Date(secondRecord.createdAt).getTime() -
      new Date(firstRecord.createdAt).getTime(),
  );
}

export function mergeRequestHistory(records: RequestHistoryRecord[]) {
  const recordsById = new Map<string, RequestHistoryRecord>();

  records.forEach((record) => {
    recordsById.set(record.id, record);
  });

  return sortRequestHistory(Array.from(recordsById.values())).slice(
    0,
    MAX_REQUEST_HISTORY_RECORDS,
  );
}

export function readRequestHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  const rawHistory = window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY);

  if (!rawHistory) {
    return [];
  }

  return parseRequestHistory(rawHistory);
}

export function saveRequestHistoryRecord(record: RequestHistoryDraft) {
  if (typeof window === "undefined") {
    return null;
  }

  const newRecord: RequestHistoryRecord = {
    ...record,
    createdAt: new Date().toISOString(),
    id: createId(),
  };
  const nextHistory = mergeRequestHistory([newRecord, ...readRequestHistory()]);

  window.localStorage.setItem(
    REQUEST_HISTORY_STORAGE_KEY,
    JSON.stringify(nextHistory),
  );

  return newRecord;
}

export async function saveServerRequestHistoryRecord(
  record: RequestHistoryRecord,
) {
  try {
    await fetch("/api/history", {
      body: JSON.stringify(record),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    // Local history is still available if the server sync fails.
  }
}

export function clearRequestHistory() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(REQUEST_HISTORY_STORAGE_KEY);
}
