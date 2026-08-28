import { isPublicHttpServerUrl } from "./server-url";

export const MAX_SCHEMA_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;

export type RemoteSchemaImportErrorCode =
  | "empty-schema"
  | "fetch-failed"
  | "http-error"
  | "invalid-response"
  | "invalid-url"
  | "too-large";

export type RemoteSchemaImportResult = {
  byteSize: number;
  fileName: string;
  schemaText: string;
  sourceUrl: string;
};

export class RemoteSchemaImportError extends Error {
  code: RemoteSchemaImportErrorCode;
  status: number | null;

  constructor(code: RemoteSchemaImportErrorCode, status: number | null = null) {
    super(code);
    this.name = "RemoteSchemaImportError";
    this.code = code;
    this.status = status;
  }
}

export type SchemaImportDetails = {
  byteSize: number;
  fileName: string;
};

export function getSchemaImportDetails(file: {
  name: string;
  size: number;
}): SchemaImportDetails {
  const fileName = file.name.trim();
  const byteSize = Number.isFinite(file.size)
    ? Math.max(0, Math.trunc(file.size))
    : 0;

  return {
    byteSize,
    fileName: fileName || "schema",
  };
}

export function shouldConfirmSchemaImport(fileSize: number) {
  return Number.isFinite(fileSize) && fileSize > MAX_SCHEMA_IMPORT_SIZE_BYTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRemoteSchemaImportErrorCode(
  value: unknown,
): value is RemoteSchemaImportErrorCode {
  return (
    value === "empty-schema" ||
    value === "fetch-failed" ||
    value === "http-error" ||
    value === "invalid-response" ||
    value === "invalid-url" ||
    value === "too-large"
  );
}

export async function importSchemaFromUrl(url: string, signal?: AbortSignal) {
  const normalizedUrl = url.trim();

  if (!isPublicHttpServerUrl(normalizedUrl)) {
    throw new RemoteSchemaImportError("invalid-url");
  }

  let response: Response;

  try {
    response = await fetch("/api/schema-import", {
      body: JSON.stringify({ url: normalizedUrl }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    throw new RemoteSchemaImportError("fetch-failed");
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new RemoteSchemaImportError("invalid-response");
  }

  if (!response.ok) {
    const errorCode =
      isRecord(payload) && isRemoteSchemaImportErrorCode(payload.error)
        ? payload.error
        : "fetch-failed";
    const status =
      isRecord(payload) &&
      typeof payload.status === "number" &&
      Number.isFinite(payload.status)
        ? payload.status
        : null;

    throw new RemoteSchemaImportError(errorCode, status);
  }

  if (!isRecord(payload)) {
    throw new RemoteSchemaImportError("invalid-response");
  }

  const { byteSize, fileName, schemaText, sourceUrl } = payload;

  if (
    typeof byteSize !== "number" ||
    !Number.isFinite(byteSize) ||
    byteSize < 0 ||
    byteSize > MAX_SCHEMA_IMPORT_SIZE_BYTES ||
    typeof fileName !== "string" ||
    !fileName.trim() ||
    typeof schemaText !== "string" ||
    !schemaText.trim() ||
    typeof sourceUrl !== "string" ||
    !isPublicHttpServerUrl(sourceUrl)
  ) {
    throw new RemoteSchemaImportError("invalid-response");
  }

  return {
    byteSize: Math.trunc(byteSize),
    fileName: fileName.trim(),
    schemaText,
    sourceUrl,
  } satisfies RemoteSchemaImportResult;
}
