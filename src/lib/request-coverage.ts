import type { EndpointSummary } from "./openapi";
import type { RequestHistoryRecord } from "./request-history";

export type RequestCoverageWindow = "24h" | "7d" | "all";
export type RequestCoverageState =
  "covered" | "failing" | "undocumented" | "untested";

export type RequestCoverageOperation = {
  attempts: number;
  averageDurationMs: number;
  documentedResponseCount: number;
  failedAttempts: number;
  latestCreatedAt: string | null;
  latestStatus: number | null;
  method: string;
  observedDocumentedResponses: string[];
  observedStatuses: number[];
  operationId: string;
  path: string;
  state: RequestCoverageState;
  successfulAttempts: number;
  summary: string;
  undocumentedStatuses: number[];
};

export type RequestCoverageReport = {
  coveredOperationCount: number;
  endpointCoveragePercentage: number;
  failedRequestCount: number;
  failingOperationCount: number;
  ignoredRequestCount: number;
  operationCount: number;
  operations: RequestCoverageOperation[];
  requestCount: number;
  responseCoveragePercentage: number;
  statusVariantCount: number;
  testedOperationCount: number;
  testedStatusVariantCount: number;
  undocumentedOperationCount: number;
  untestedOperationCount: number;
};

const WINDOW_DURATION_MS: Record<
  Exclude<RequestCoverageWindow, "all">,
  number
> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
};

const STATE_ORDER: Record<RequestCoverageState, number> = {
  failing: 0,
  undocumented: 1,
  untested: 2,
  covered: 3,
};

function getOperationKey(method: string, path: string) {
  return `${method.trim().toUpperCase()}\u0000${path}`;
}

function getTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isSuccessfulStatus(status: number) {
  return status >= 200 && status < 400;
}

function findDocumentedResponse(endpoint: EndpointSummary, status: number) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    return null;
  }

  const exactStatus = String(status);
  const exactResponse = endpoint.responses.find(
    (response) => response.status.trim() === exactStatus,
  );

  if (exactResponse) {
    return exactResponse.status;
  }

  const statusClass = `${exactStatus[0]}xx`;
  const rangeResponse = endpoint.responses.find(
    (response) => response.status.trim().toLowerCase() === statusClass,
  );

  if (rangeResponse) {
    return rangeResponse.status;
  }

  return (
    endpoint.responses.find(
      (response) => response.status.trim().toLowerCase() === "default",
    )?.status ?? null
  );
}

function uniqueSortedStatuses(statuses: number[]) {
  return Array.from(new Set(statuses)).sort((first, second) => first - second);
}

export function filterRequestCoverageRecords(
  records: RequestHistoryRecord[],
  window: RequestCoverageWindow,
  now = new Date(),
) {
  if (window === "all") {
    return [...records];
  }

  const nowTimestamp = now.getTime();
  const cutoff = nowTimestamp - WINDOW_DURATION_MS[window];

  if (!Number.isFinite(nowTimestamp)) {
    return [];
  }

  return records.filter((record) => {
    const timestamp = Date.parse(record.createdAt);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= cutoff &&
      timestamp <= nowTimestamp
    );
  });
}

export function createRequestCoverageReport(
  endpoints: EndpointSummary[],
  records: RequestHistoryRecord[],
): RequestCoverageReport {
  const endpointsByKey = new Map(
    endpoints.map((endpoint) => [
      getOperationKey(endpoint.method, endpoint.path),
      endpoint,
    ]),
  );
  const recordsByKey = new Map<string, RequestHistoryRecord[]>();
  let ignoredRequestCount = 0;

  records.forEach((record) => {
    const key = getOperationKey(record.method, record.path);

    if (!endpointsByKey.has(key)) {
      ignoredRequestCount += 1;
      return;
    }

    const operationRecords = recordsByKey.get(key) ?? [];
    operationRecords.push(record);
    recordsByKey.set(key, operationRecords);
  });

  const operations = endpoints.map<RequestCoverageOperation>((endpoint) => {
    const operationRecords = [
      ...(recordsByKey.get(getOperationKey(endpoint.method, endpoint.path)) ??
        []),
    ].sort(
      (first, second) =>
        getTimestamp(second.createdAt) - getTimestamp(first.createdAt),
    );
    const observedStatuses = uniqueSortedStatuses(
      operationRecords.map((record) => record.status),
    );
    const documentedResponses = new Set<string>();
    const undocumentedStatuses: number[] = [];

    observedStatuses.forEach((status) => {
      const response = findDocumentedResponse(endpoint, status);

      if (response) {
        documentedResponses.add(response);
      } else {
        undocumentedStatuses.push(status);
      }
    });

    const failedAttempts = operationRecords.filter(
      (record) => !isSuccessfulStatus(record.status),
    ).length;
    const latestRecord = operationRecords[0];
    const state: RequestCoverageState = !latestRecord
      ? "untested"
      : !isSuccessfulStatus(latestRecord.status)
        ? "failing"
        : undocumentedStatuses.length > 0
          ? "undocumented"
          : "covered";
    const durations = operationRecords
      .map((record) => record.durationMs)
      .filter((duration) => Number.isFinite(duration) && duration >= 0);

    return {
      attempts: operationRecords.length,
      averageDurationMs:
        durations.length === 0
          ? 0
          : Math.round(
              durations.reduce((total, duration) => total + duration, 0) /
                durations.length,
            ),
      documentedResponseCount: endpoint.responses.length,
      failedAttempts,
      latestCreatedAt: latestRecord?.createdAt ?? null,
      latestStatus: latestRecord?.status ?? null,
      method: endpoint.method,
      observedDocumentedResponses: Array.from(documentedResponses),
      observedStatuses,
      operationId: endpoint.operationId,
      path: endpoint.path,
      state,
      successfulAttempts: operationRecords.length - failedAttempts,
      summary: endpoint.summary,
      undocumentedStatuses,
    };
  });

  operations.sort(
    (first, second) =>
      STATE_ORDER[first.state] - STATE_ORDER[second.state] ||
      getTimestamp(second.latestCreatedAt ?? "") -
        getTimestamp(first.latestCreatedAt ?? "") ||
      first.path.localeCompare(second.path) ||
      first.method.localeCompare(second.method),
  );

  const testedOperationCount = operations.filter(
    (operation) => operation.attempts > 0,
  ).length;
  const statusVariantCount = operations.reduce(
    (total, operation) => total + operation.documentedResponseCount,
    0,
  );
  const testedStatusVariantCount = operations.reduce(
    (total, operation) => total + operation.observedDocumentedResponses.length,
    0,
  );

  return {
    coveredOperationCount: operations.filter(
      (operation) => operation.state === "covered",
    ).length,
    endpointCoveragePercentage:
      operations.length === 0
        ? 0
        : Math.round((testedOperationCount / operations.length) * 100),
    failedRequestCount: operations.reduce(
      (total, operation) => total + operation.failedAttempts,
      0,
    ),
    failingOperationCount: operations.filter(
      (operation) => operation.state === "failing",
    ).length,
    ignoredRequestCount,
    operationCount: operations.length,
    operations,
    requestCount: operations.reduce(
      (total, operation) => total + operation.attempts,
      0,
    ),
    responseCoveragePercentage:
      statusVariantCount === 0
        ? 0
        : Math.round((testedStatusVariantCount / statusVariantCount) * 100),
    statusVariantCount,
    testedOperationCount,
    testedStatusVariantCount,
    undocumentedOperationCount: operations.filter(
      (operation) => operation.state === "undocumented",
    ).length,
    untestedOperationCount: operations.filter(
      (operation) => operation.state === "untested",
    ).length,
  };
}
