export const REQUEST_EXECUTION_MODE_STORAGE_KEY =
  "rsswagger-request-execution-mode";
export const MOCK_RESPONSE_DELAY_STORAGE_KEY = "rsswagger-mock-response-delay";

export type RequestExecutionMode = "live" | "mock";
export type MockResponseDelayMs = 0 | 500 | 2_000 | 5_000;

export const DEFAULT_REQUEST_EXECUTION_MODE: RequestExecutionMode = "live";
export const DEFAULT_MOCK_RESPONSE_DELAY_MS: MockResponseDelayMs = 0;
export const MOCK_RESPONSE_DELAY_OPTIONS_MS: MockResponseDelayMs[] = [
  0, 500, 2_000, 5_000,
];

function isRequestExecutionMode(
  value: string | null,
): value is RequestExecutionMode {
  return value === "live" || value === "mock";
}

export function readRequestExecutionMode(): RequestExecutionMode {
  if (typeof window === "undefined") {
    return DEFAULT_REQUEST_EXECUTION_MODE;
  }

  try {
    const storedMode = window.localStorage.getItem(
      REQUEST_EXECUTION_MODE_STORAGE_KEY,
    );

    return isRequestExecutionMode(storedMode)
      ? storedMode
      : DEFAULT_REQUEST_EXECUTION_MODE;
  } catch {
    return DEFAULT_REQUEST_EXECUTION_MODE;
  }
}

export function saveRequestExecutionMode(mode: RequestExecutionMode) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (mode === DEFAULT_REQUEST_EXECUTION_MODE) {
      window.localStorage.removeItem(REQUEST_EXECUTION_MODE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(REQUEST_EXECUTION_MODE_STORAGE_KEY, mode);
    }

    return true;
  } catch {
    // The selected mode remains available for the current session.
    return false;
  }
}

function isMockResponseDelay(value: number): value is MockResponseDelayMs {
  return MOCK_RESPONSE_DELAY_OPTIONS_MS.includes(value as MockResponseDelayMs);
}

export function readMockResponseDelay(): MockResponseDelayMs {
  if (typeof window === "undefined") {
    return DEFAULT_MOCK_RESPONSE_DELAY_MS;
  }

  try {
    const storedDelay = Number(
      window.localStorage.getItem(MOCK_RESPONSE_DELAY_STORAGE_KEY),
    );

    return isMockResponseDelay(storedDelay)
      ? storedDelay
      : DEFAULT_MOCK_RESPONSE_DELAY_MS;
  } catch {
    return DEFAULT_MOCK_RESPONSE_DELAY_MS;
  }
}

export function saveMockResponseDelay(delayMs: MockResponseDelayMs) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (delayMs === DEFAULT_MOCK_RESPONSE_DELAY_MS) {
      window.localStorage.removeItem(MOCK_RESPONSE_DELAY_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        MOCK_RESPONSE_DELAY_STORAGE_KEY,
        String(delayMs),
      );
    }

    return true;
  } catch {
    // The selected delay remains available for the current session.
    return false;
  }
}
