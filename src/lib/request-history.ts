export const REQUEST_HISTORY_STORAGE_KEY = "rsswagger-request-history";

export type RequestHistoryRecord = {
  id: string;
  method: string;
  path: string;
  status: number;
  summary: string;
  durationMs: number;
  createdAt: string;
};

function createId() {
  return `${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

export function readRequestHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  const rawHistory = window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY);

  if (!rawHistory) {
    return [];
  }

  try {
    return JSON.parse(rawHistory) as RequestHistoryRecord[];
  } catch {
    return [];
  }
}

export function saveRequestHistoryRecord(
  record: Omit<RequestHistoryRecord, "id" | "createdAt">,
) {
  if (typeof window === "undefined") {
    return null;
  }

  const newRecord: RequestHistoryRecord = {
    ...record,
    createdAt: new Date().toISOString(),
    id: createId(),
  };
  const nextHistory = [newRecord, ...readRequestHistory()].slice(0, 20);

  window.localStorage.setItem(
    REQUEST_HISTORY_STORAGE_KEY,
    JSON.stringify(nextHistory),
  );

  return newRecord;
}

export function clearRequestHistory() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(REQUEST_HISTORY_STORAGE_KEY);
}
