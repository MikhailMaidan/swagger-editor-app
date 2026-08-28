import { lookup } from "node:dns/promises";
import { MAX_SCHEMA_IMPORT_SIZE_BYTES } from "@/lib/schema-import";
import {
  isPrivateOrLocalHostname,
  isPublicHttpServerUrl,
} from "@/lib/server-url";

const REMOTE_SCHEMA_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([300, 301, 302, 303, 307, 308]);

type ImportErrorCode =
  "empty-schema" | "fetch-failed" | "http-error" | "invalid-url" | "too-large";

class SchemaImportRouteError extends Error {
  code: ImportErrorCode;
  remoteStatus: number | null;

  constructor(code: ImportErrorCode, remoteStatus: number | null = null) {
    super(code);
    this.code = code;
    this.remoteStatus = remoteStatus;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRemoteUrl(value: unknown) {
  if (typeof value !== "string") {
    throw new SchemaImportRouteError("invalid-url");
  }

  const normalizedUrl = value.trim();

  if (!isPublicHttpServerUrl(normalizedUrl)) {
    throw new SchemaImportRouteError("invalid-url");
  }

  const parsedUrl = new URL(normalizedUrl);

  if (parsedUrl.username || parsedUrl.password) {
    throw new SchemaImportRouteError("invalid-url");
  }

  parsedUrl.hash = "";
  return parsedUrl.toString();
}

function getRedirectUrl(response: Response, currentUrl: string) {
  const location = response.headers.get("location");

  if (!location) {
    throw new SchemaImportRouteError("fetch-failed");
  }

  try {
    return normalizeRemoteUrl(new URL(location, currentUrl).toString());
  } catch (error) {
    if (error instanceof SchemaImportRouteError) {
      throw error;
    }

    throw new SchemaImportRouteError("invalid-url");
  }
}

async function assertPublicRemoteAddress(url: string) {
  try {
    const addresses = await lookup(new URL(url).hostname, {
      all: true,
      verbatim: true,
    });

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateOrLocalHostname(address))
    ) {
      throw new SchemaImportRouteError("invalid-url");
    }
  } catch (error) {
    if (error instanceof SchemaImportRouteError) {
      throw error;
    }

    throw new SchemaImportRouteError("fetch-failed");
  }
}

async function fetchRemoteSchema(initialUrl: string) {
  let currentUrl = initialUrl;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    await assertPublicRemoteAddress(currentUrl);
    const response = await fetch(currentUrl, {
      cache: "no-store",
      headers: {
        Accept:
          "application/yaml, application/json, text/yaml, text/plain, */*",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REMOTE_SCHEMA_TIMEOUT_MS),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, sourceUrl: currentUrl };
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new SchemaImportRouteError("fetch-failed");
    }

    currentUrl = getRedirectUrl(response, currentUrl);
  }

  throw new SchemaImportRouteError("fetch-failed");
}

async function readBoundedResponseBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SCHEMA_IMPORT_SIZE_BYTES
  ) {
    throw new SchemaImportRouteError("too-large");
  }

  if (!response.body) {
    throw new SchemaImportRouteError("empty-schema");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteSize = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    byteSize += value.byteLength;

    if (byteSize > MAX_SCHEMA_IMPORT_SIZE_BYTES) {
      await reader.cancel();
      throw new SchemaImportRouteError("too-large");
    }

    chunks.push(value);
  }

  if (byteSize === 0) {
    throw new SchemaImportRouteError("empty-schema");
  }

  const body = new Uint8Array(byteSize);
  let offset = 0;

  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });

  const schemaText = new TextDecoder().decode(body);

  if (!schemaText.trim()) {
    throw new SchemaImportRouteError("empty-schema");
  }

  return { byteSize, schemaText };
}

function decodeFileName(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getRemoteFileName(response: Response, sourceUrl: string) {
  const contentDisposition = response.headers.get("content-disposition") || "";
  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  const pathName = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop();
  const candidate = decodeFileName(
    (
      encodedMatch?.[1] ||
      quotedMatch?.[1] ||
      pathName ||
      "remote-schema"
    ).trim(),
  );
  const sanitizedFileName = candidate
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .slice(0, 160)
    .trim();

  return sanitizedFileName || "remote-schema";
}

function getErrorResponse(error: unknown) {
  if (!(error instanceof SchemaImportRouteError)) {
    return Response.json({ error: "fetch-failed" }, { status: 502 });
  }

  const status =
    error.code === "invalid-url"
      ? 400
      : error.code === "too-large"
        ? 413
        : error.code === "empty-schema"
          ? 422
          : 502;

  return Response.json(
    {
      error: error.code,
      ...(error.remoteStatus === null ? {} : { status: error.remoteStatus }),
    },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      throw new SchemaImportRouteError("invalid-url");
    }

    const url = normalizeRemoteUrl(isRecord(payload) ? payload.url : null);
    const { response, sourceUrl } = await fetchRemoteSchema(url);

    if (!response.ok) {
      throw new SchemaImportRouteError("http-error", response.status);
    }

    const { byteSize, schemaText } = await readBoundedResponseBody(response);

    return Response.json(
      {
        byteSize,
        fileName: getRemoteFileName(response, sourceUrl),
        schemaText,
        sourceUrl,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return getErrorResponse(error);
  }
}
