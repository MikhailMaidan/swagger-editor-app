import {
  REQUEST_CODE_FORMATS,
  type RequestCodeFormat,
} from "./request-snippets";

// Every request code format, including the additional snippet languages,
// downloads with its own extension and content type.
export type RequestPreviewFormat = RequestCodeFormat;

function slugifyEndpointPart(value: string, fallback: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

export function getRequestPreviewDownloadMetadata(
  format: RequestPreviewFormat,
  method: string,
  path: string,
) {
  const { contentType, extension } = REQUEST_CODE_FORMATS[format];
  const normalizedMethod = slugifyEndpointPart(method, "request");
  const normalizedPath = slugifyEndpointPart(path, "root");

  return {
    contentType,
    fileName: `rsswag-${normalizedMethod}-${normalizedPath}.${extension}`,
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
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;

  try {
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
