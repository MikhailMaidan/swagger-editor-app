const mediaTypeExtensions: Record<string, string> = {
  "application/json": "json",
  "application/ndjson": "ndjson",
  "application/x-ndjson": "ndjson",
  "application/x-yaml": "yaml",
  "application/xml": "xml",
  "application/yaml": "yaml",
  "text/csv": "csv",
  "text/html": "html",
  "text/json": "json",
  "text/plain": "txt",
  "text/x-yaml": "yaml",
  "text/xml": "xml",
  "text/yaml": "yaml",
};

function getResponseContentType(headers: Record<string, string>) {
  return (
    Object.entries(headers).find(
      ([header]) => header.toLowerCase() === "content-type",
    )?.[1] || "text/plain;charset=utf-8"
  );
}

function getResponseFileExtension(contentType: string) {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();

  if (mediaType.endsWith("+json")) {
    return "json";
  }

  if (mediaType.endsWith("+xml")) {
    return "xml";
  }

  if (mediaType.endsWith("+yaml")) {
    return "yaml";
  }

  return Object.hasOwn(mediaTypeExtensions, mediaType)
    ? mediaTypeExtensions[mediaType]
    : "txt";
}

export function getResponseDownloadMetadata(
  headers: Record<string, string>,
  status: string,
) {
  const contentType = getResponseContentType(headers);
  const normalizedStatus =
    status
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "unknown";

  return {
    contentType,
    fileName: `rsswag-response-${normalizedStatus}.${getResponseFileExtension(contentType)}`,
  };
}
