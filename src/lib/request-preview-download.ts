export type RequestPreviewFormat = "curl" | "fetch" | "http";

const formatMetadata: Record<
  RequestPreviewFormat,
  { contentType: string; extension: string }
> = {
  curl: {
    contentType: "text/x-shellscript;charset=utf-8",
    extension: "sh",
  },
  fetch: {
    contentType: "text/javascript;charset=utf-8",
    extension: "js",
  },
  http: {
    contentType: "text/plain;charset=utf-8",
    extension: "http",
  },
};

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
  const { contentType, extension } = formatMetadata[format];
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
