import { DEFAULT_SERVER_URL } from "@/lib/openapi";
import {
  buildCookieHeaderValue,
  buildRequestUrl,
  hasSendableRequestBody,
  hasUnresolvedPathParameters,
  resolvePathParameters,
} from "@/lib/request-url";
import { isPublicHttpServerUrl } from "@/lib/server-url";
import { getByteSize } from "@/lib/text-encoding";

const DEFAULT_SERVER_HOSTNAME = new URL(DEFAULT_SERVER_URL).hostname;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;

type RequestParameterLocation = "path" | "query" | "header" | "cookie";

type RequestParameter = {
  location: RequestParameterLocation;
  name: string;
  value: string;
};

type TryItOutPayload = {
  contentType?: string;
  method?: string;
  path?: string;
  requestParameters?: RequestParameter[];
  requestBody?: string;
  requestValues?: {
    label: string;
    value: string;
  }[];
  responseBody?: string;
  serverUrl?: string;
  status?: string;
  timeoutMs?: unknown;
};

type TryItOutResult = {
  body: string;
  durationMs: number;
  errorDetails: string | null;
  executedAt: string;
  headers: Record<string, string>;
  requestSize: number;
  responseSize: number;
  status: string;
  url: string;
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readRequestTimeoutMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return Math.min(
    MAX_REQUEST_TIMEOUT_MS,
    Math.max(MIN_REQUEST_TIMEOUT_MS, Math.round(value)),
  );
}

function isRequestParameterLocation(
  value: unknown,
): value is RequestParameterLocation {
  return (
    value === "path" ||
    value === "query" ||
    value === "header" ||
    value === "cookie"
  );
}

function readRequestValues(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const record = item as Record<string, unknown>;

      return {
        label: readString(record.label),
        value: readString(record.value),
      };
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

function readRequestParameters(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const record = item as Record<string, unknown>;

      if (!isRequestParameterLocation(record.location)) {
        return null;
      }

      const name = readString(record.name);
      const parameterValue = readString(record.value);

      if (!name || !parameterValue) {
        return null;
      }

      return {
        location: record.location,
        name,
        value: parameterValue,
      };
    })
    .filter((item): item is RequestParameter => Boolean(item));
}

function buildTargetUrl(
  serverUrl: string,
  path: string,
  requestParameters: RequestParameter[],
) {
  const normalizedPath = resolvePathParameters(path, requestParameters);

  if (hasUnresolvedPathParameters(normalizedPath)) {
    throw new Error("Missing path parameter value.");
  }

  return buildRequestUrl(serverUrl, path, requestParameters);
}

function buildRequestHeaders(
  requestParameters: RequestParameter[],
  hasRequestBody: boolean,
  contentType: string,
) {
  const headers = new Headers();

  if (hasRequestBody) {
    headers.set("Content-Type", contentType);
  }

  requestParameters
    .filter((parameter) => parameter.location === "header")
    .forEach((parameter) => {
      headers.set(parameter.name, parameter.value);
    });

  const cookieHeader = buildCookieHeaderValue(requestParameters);

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  return headers;
}

function collectResponseHeaders(headers: Headers) {
  const responseHeaders: Record<string, string> = {};

  headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return responseHeaders;
}

function createFallbackResult({
  method,
  path,
  requestBody,
  requestParameters,
  requestValues,
  responseBody,
  serverUrl,
  status,
}: {
  method: string;
  path: string;
  requestBody: string;
  requestParameters: RequestParameter[];
  requestValues: { label: string; value: string }[];
  responseBody: string;
  serverUrl: string;
  status: string;
}): TryItOutResult {
  const requestSnapshot = JSON.stringify({
    body: requestBody,
    method,
    path,
    values: requestValues,
  });
  const requestSize = getByteSize(requestSnapshot);

  return {
    body: responseBody,
    durationMs: 35 + Math.round(requestSize / 20),
    errorDetails: null,
    executedAt: new Date().toISOString(),
    headers: {
      "content-type": "application/json",
    },
    requestSize,
    responseSize: getByteSize(responseBody),
    status,
    url: buildRequestUrl(serverUrl, path, requestParameters),
  };
}

async function executeServerRequest({
  contentType,
  method,
  path,
  requestBody,
  requestParameters,
  serverUrl,
  timeoutMs,
}: {
  contentType: string;
  method: string;
  path: string;
  requestBody: string;
  requestParameters: RequestParameter[];
  serverUrl: string;
  timeoutMs: number;
}): Promise<TryItOutResult> {
  const normalizedMethod = method.toUpperCase();
  const hasRequestBody = hasSendableRequestBody(method, requestBody);
  const targetUrl = buildTargetUrl(serverUrl, path, requestParameters);
  const startedAt = Date.now();
  const response = await fetch(targetUrl, {
    body: hasRequestBody ? requestBody : undefined,
    cache: "no-store",
    headers: buildRequestHeaders(
      requestParameters,
      hasRequestBody,
      contentType,
    ),
    method: normalizedMethod,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  const requestSnapshot = JSON.stringify({
    body: hasRequestBody ? requestBody : "",
    method: normalizedMethod,
    targetUrl,
  });

  return {
    body,
    durationMs: Math.max(1, Date.now() - startedAt),
    errorDetails: response.ok
      ? null
      : `${response.status} ${response.statusText}`.trim(),
    executedAt: new Date().toISOString(),
    headers: collectResponseHeaders(response.headers),
    requestSize: getByteSize(requestSnapshot),
    responseSize: getByteSize(body),
    status: String(response.status),
    url: targetUrl,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to execute request.";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as TryItOutPayload;
    const contentType = readString(payload.contentType, "application/json");
    const method = readString(payload.method, "GET");
    const path = readString(payload.path, "/");
    const requestBody = readString(payload.requestBody);
    const requestParameters = readRequestParameters(payload.requestParameters);
    const requestValues = readRequestValues(payload.requestValues);
    const responseBody = readString(payload.responseBody, "{}");
    const serverUrl = readString(payload.serverUrl);
    const status = readString(payload.status, "200");
    const timeoutMs = readRequestTimeoutMs(payload.timeoutMs);
    const fallbackResult = createFallbackResult({
      method,
      path,
      requestBody,
      requestParameters,
      requestValues,
      responseBody,
      serverUrl,
      status,
    });

    if (
      isPublicHttpServerUrl(serverUrl) &&
      new URL(serverUrl).hostname !== DEFAULT_SERVER_HOSTNAME
    ) {
      try {
        const serverResult = await executeServerRequest({
          contentType,
          method,
          path,
          requestBody,
          requestParameters,
          serverUrl,
          timeoutMs,
        });

        return Response.json(serverResult);
      } catch (error) {
        const errorDetails = getErrorMessage(error);

        return Response.json({
          ...fallbackResult,
          body: JSON.stringify({ error: errorDetails }, null, 2),
          errorDetails,
          responseSize: getByteSize(errorDetails),
          status: "0",
        });
      }
    }

    return Response.json(fallbackResult);
  } catch {
    return Response.json(
      {
        error: "Invalid request payload.",
      },
      {
        status: 400,
      },
    );
  }
}
