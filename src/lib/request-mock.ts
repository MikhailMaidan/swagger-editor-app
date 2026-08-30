import type { ResponseSummary } from "./openapi";

export type SchemaMockResponse = {
  body: string;
  headers: Record<string, string>;
  status: string;
};

function getRepresentativeStatus(status: string) {
  const normalizedStatus = status.trim();
  const statusRange = normalizedStatus.match(/^([1-5])xx$/i);

  if (statusRange) {
    return `${statusRange[1]}00`;
  }

  if (!normalizedStatus || normalizedStatus.toLowerCase() === "default") {
    return "200";
  }

  return normalizedStatus;
}

export function createSchemaMockResponse(
  response: ResponseSummary | undefined,
  fallbackBody: string,
): SchemaMockResponse {
  const contentType = response?.contentTypes[0] ?? "";

  return {
    body: response?.schema?.example || fallbackBody,
    headers: contentType ? { "content-type": contentType } : {},
    status: getRepresentativeStatus(response?.status ?? ""),
  };
}

export function waitForMockResponseDelay(
  delayMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  if (delayMs <= 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const handleAbort = () => finish(false);
    const timeoutId = window.setTimeout(() => finish(true), delayMs);

    function finish(completed: boolean) {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
      resolve(completed);
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}
