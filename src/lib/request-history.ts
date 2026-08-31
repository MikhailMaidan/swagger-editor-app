import { isErrorStatus } from "./status-color";

export const REQUEST_HISTORY_STORAGE_KEY = "rsswagger-request-history";
export const SERVER_REQUEST_HISTORY_COOKIE = "rsswagger-server-history";
export const MAX_REQUEST_HISTORY_RECORDS = 20;

export type RequestHistorySort =
  "failures" | "fastest" | "newest" | "oldest" | "slowest";

export type RequestHistoryRecord = {
  id: string;
  method: string;
  path: string;
  url: string;
  status: number;
  summary: string;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  errorDetails: string | null;
  createdAt: string;
};

export type RequestHistoryDraft = Omit<
  RequestHistoryRecord,
  "id" | "createdAt" | "errorDetails" | "requestSize" | "responseSize" | "url"
> &
  Partial<
    Pick<
      RequestHistoryRecord,
      "errorDetails" | "requestSize" | "responseSize" | "url"
    >
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

function normalizeRequestHistoryRecord(
  record: RequestHistoryRecord,
): RequestHistoryRecord {
  return {
    ...record,
    errorDetails:
      typeof record.errorDetails === "string" ? record.errorDetails : null,
    requestSize:
      typeof record.requestSize === "number" ? record.requestSize : 0,
    responseSize:
      typeof record.responseSize === "number" ? record.responseSize : 0,
    url: typeof record.url === "string" ? record.url : record.path,
  };
}

export function parseRequestHistory(value?: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);

    return Array.isArray(parsedValue)
      ? parsedValue
          .filter(isRequestHistoryRecord)
          .map(normalizeRequestHistoryRecord)
      : [];
  } catch {
    return [];
  }
}

function getHistoryTimestamp(record: RequestHistoryRecord) {
  const timestamp = Date.parse(record.createdAt);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewestFirst(
  firstRecord: RequestHistoryRecord,
  secondRecord: RequestHistoryRecord,
) {
  return (
    getHistoryTimestamp(secondRecord) - getHistoryTimestamp(firstRecord) ||
    firstRecord.id.localeCompare(secondRecord.id)
  );
}

function compareDuration(
  firstRecord: RequestHistoryRecord,
  secondRecord: RequestHistoryRecord,
  direction: "fastest" | "slowest",
) {
  const firstDuration =
    Number.isFinite(firstRecord.durationMs) && firstRecord.durationMs >= 0
      ? firstRecord.durationMs
      : null;
  const secondDuration =
    Number.isFinite(secondRecord.durationMs) && secondRecord.durationMs >= 0
      ? secondRecord.durationMs
      : null;

  if (firstDuration === null || secondDuration === null) {
    if (firstDuration === secondDuration) {
      return compareNewestFirst(firstRecord, secondRecord);
    }

    return firstDuration === null ? 1 : -1;
  }

  return (
    (direction === "fastest"
      ? firstDuration - secondDuration
      : secondDuration - firstDuration) ||
    compareNewestFirst(firstRecord, secondRecord)
  );
}

export function sortRequestHistory(
  records: RequestHistoryRecord[],
  sort: RequestHistorySort = "newest",
) {
  return [...records].sort((firstRecord, secondRecord) => {
    if (sort === "oldest") {
      return compareNewestFirst(secondRecord, firstRecord);
    }

    if (sort === "fastest" || sort === "slowest") {
      return compareDuration(firstRecord, secondRecord, sort);
    }

    if (sort === "failures") {
      return (
        Number(isErrorStatus(secondRecord.status)) -
          Number(isErrorStatus(firstRecord.status)) ||
        compareNewestFirst(firstRecord, secondRecord)
      );
    }

    return compareNewestFirst(firstRecord, secondRecord);
  });
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

  try {
    const rawHistory = window.localStorage.getItem(
      REQUEST_HISTORY_STORAGE_KEY,
    );

    if (!rawHistory) {
      return [];
    }

    return parseRequestHistory(rawHistory);
  } catch {
    return [];
  }
}

export function saveRequestHistoryRecord(record: RequestHistoryDraft) {
  if (typeof window === "undefined") {
    return null;
  }

  const newRecord: RequestHistoryRecord = {
    ...record,
    createdAt: new Date().toISOString(),
    errorDetails: record.errorDetails || null,
    id: createId(),
    requestSize: record.requestSize || 0,
    responseSize: record.responseSize || 0,
    status: Number.isFinite(record.status) ? record.status : 0,
    url: record.url || record.path,
  };
  const nextHistory = mergeRequestHistory([newRecord, ...readRequestHistory()]);

  try {
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify(nextHistory),
    );
  } catch {
    // A blocked or full store shouldn't be treated as the request itself
    // having failed - the caller already skips history entirely on a null
    // return, so the executed request and its result still display fine.
    return null;
  }

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

  try {
    window.localStorage.removeItem(REQUEST_HISTORY_STORAGE_KEY);
  } catch {
    // Sign-out remains usable when browser storage is blocked.
  }
}

export function removeRequestHistoryRecord(id: string) {
  if (typeof window === "undefined") {
    return;
  }

  const remainingHistory = readRequestHistory().filter(
    (record) => record.id !== id,
  );

  try {
    window.localStorage.setItem(
      REQUEST_HISTORY_STORAGE_KEY,
      JSON.stringify(remainingHistory),
    );
  } catch {
    // The server-side delete (if any) still succeeds independently; a
    // blocked local store just means this device's cache goes stale.
  }
}

export async function deleteServerHistoryRecord(id: string) {
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteAllServerHistory() {
  try {
    const response = await fetch("/api/history", {
      method: "DELETE",
    });

    return response.ok;
  } catch {
    return false;
  }
}
