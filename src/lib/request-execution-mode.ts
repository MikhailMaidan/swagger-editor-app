export const REQUEST_EXECUTION_MODE_STORAGE_KEY =
  "rsswagger-request-execution-mode";

export type RequestExecutionMode = "live" | "mock";

export const DEFAULT_REQUEST_EXECUTION_MODE: RequestExecutionMode = "live";

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
