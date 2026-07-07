type TryItOutPayload = {
  method?: string;
  path?: string;
  requestBody?: string;
  requestValues?: {
    label: string;
    value: string;
  }[];
  responseBody?: string;
  status?: string;
};

function getByteSize(value: string) {
  return new TextEncoder().encode(value).length;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as TryItOutPayload;
    const method = readString(payload.method, "GET");
    const path = readString(payload.path, "/");
    const requestBody = readString(payload.requestBody);
    const requestValues = readRequestValues(payload.requestValues);
    const responseBody = readString(payload.responseBody, "{}");
    const status = readString(payload.status, "200");
    const requestSnapshot = JSON.stringify({
      body: requestBody,
      method,
      path,
      values: requestValues,
    });
    const requestSize = getByteSize(requestSnapshot);
    const responseSize = getByteSize(responseBody);

    return Response.json({
      body: responseBody,
      durationMs: 35 + Math.round(requestSize / 20),
      executedAt: new Date().toISOString(),
      requestSize,
      responseSize,
      status,
    });
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
