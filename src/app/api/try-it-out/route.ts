type RequestParameterLocation = "path" | "query" | "header" | "cookie";

type RequestParameter = {
  location: RequestParameterLocation;
  name: string;
  value: string;
};

type TryItOutPayload = {
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

function getByteSize(value: string) {
  return new TextEncoder().encode(value).length;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
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

function isUsableServerUrl(serverUrl: string) {
  try {
    const parsedUrl = new URL(serverUrl);

    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function buildTargetUrl(
  serverUrl: string,
  path: string,
  requestParameters: RequestParameter[],
) {
  const normalizedServerUrl = serverUrl.endsWith("/")
    ? serverUrl.slice(0, -1)
    : serverUrl;
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;

  requestParameters
    .filter((parameter) => parameter.location === "path")
    .forEach((parameter) => {
      normalizedPath = normalizedPath.replaceAll(
        `{${parameter.name}}`,
        encodeURIComponent(parameter.value),
      );
    });

  if (normalizedPath.includes("{") || normalizedPath.includes("}")) {
    throw new Error("Missing path parameter value.");
  }

  const targetUrl = new URL(`${normalizedServerUrl}${normalizedPath}`);

  requestParameters
    .filter((parameter) => parameter.location === "query")
    .forEach((parameter) => {
      targetUrl.searchParams.set(parameter.name, parameter.value);
    });

  return targetUrl.toString();
}

function buildRequestHeaders(
  requestParameters: RequestParameter[],
  hasRequestBody: boolean,
) {
  const headers = new Headers();

  if (hasRequestBody) {
    headers.set("Content-Type", "application/json");
  }

  requestParameters
    .filter((parameter) => parameter.location === "header")
    .forEach((parameter) => {
      headers.set(parameter.name, parameter.value);
    });

  const cookieHeader = requestParameters
    .filter((parameter) => parameter.location === "cookie")
    .map(
      (parameter) => `${parameter.name}=${encodeURIComponent(parameter.value)}`,
    )
    .join("; ");

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
  requestValues,
  responseBody,
  serverUrl,
  status,
}: {
  method: string;
  path: string;
  requestBody: string;
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
    url: `${serverUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`,
  };
}

async function executeServerRequest({
  method,
  path,
  requestBody,
  requestParameters,
  serverUrl,
}: {
  method: string;
  path: string;
  requestBody: string;
  requestParameters: RequestParameter[];
  serverUrl: string;
}): Promise<TryItOutResult> {
  const normalizedMethod = method.toUpperCase();
  const hasRequestBody =
    Boolean(requestBody.trim()) &&
    normalizedMethod !== "GET" &&
    normalizedMethod !== "HEAD";
  const targetUrl = buildTargetUrl(serverUrl, path, requestParameters);
  const startedAt = Date.now();
  const response = await fetch(targetUrl, {
    body: hasRequestBody ? requestBody : undefined,
    cache: "no-store",
    headers: buildRequestHeaders(requestParameters, hasRequestBody),
    method: normalizedMethod,
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
    const method = readString(payload.method, "GET");
    const path = readString(payload.path, "/");
    const requestBody = readString(payload.requestBody);
    const requestParameters = readRequestParameters(payload.requestParameters);
    const requestValues = readRequestValues(payload.requestValues);
    const responseBody = readString(payload.responseBody, "{}");
    const serverUrl = readString(payload.serverUrl);
    const status = readString(payload.status, "200");
    const fallbackResult = createFallbackResult({
      method,
      path,
      requestBody,
      requestValues,
      responseBody,
      serverUrl,
      status,
    });

    if (
      isUsableServerUrl(serverUrl) &&
      !serverUrl.includes("api.example.com")
    ) {
      try {
        const serverResult = await executeServerRequest({
          method,
          path,
          requestBody,
          requestParameters,
          serverUrl,
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
