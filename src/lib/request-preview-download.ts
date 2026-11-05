import {
  REQUEST_CODE_FORMATS,
  type RequestCodeFormat,
} from "./request-snippets";

// Every request code format, including the additional snippet languages,
// downloads with its own extension and content type.
export type RequestPreviewFormat = RequestCodeFormat;

const MAX_FILE_NAME_LENGTH = 200;

function slugifyEndpointPart(
  value: string,
  fallback: string,
  maxLength: number,
) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength)
      .replace(/-+$/g, "") || fallback
  );
}

export function getRequestPreviewDownloadMetadata(
  format: RequestPreviewFormat,
  method: string,
  path: string,
) {
  const { contentType, extension } = REQUEST_CODE_FORMATS[format];
  const normalizedMethod = slugifyEndpointPart(method, "request", 32);
  const prefix = `rsswag-${normalizedMethod}-`;
  const suffix = `.${extension}`;
  const normalizedPath = slugifyEndpointPart(
    path,
    "root",
    MAX_FILE_NAME_LENGTH - prefix.length - suffix.length,
  );

  return {
    contentType,
    fileName: `${prefix}${normalizedPath}${suffix}`,
  };
}

export function downloadRequestPreviewFile(
  content: string,
  format: RequestPreviewFormat,
  method: string,
  path: string,
) {
  const { contentType, fileName } = getRequestPreviewDownloadMetadata(
    format,
    method,
    path,
  );
  const objectUrl = URL.createObjectURL(
    new Blob([content], { type: contentType }),
  );
  try {
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    link.click();
  } finally {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Cleanup must not mask a download failure or turn success into an error.
    }
  }
}
