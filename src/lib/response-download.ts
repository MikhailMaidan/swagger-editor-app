const mediaTypeExtensions: Record<string, string> = {
  "application/json": "json",
  "application/xml": "xml",
  "text/csv": "csv",
  "text/html": "html",
  "text/plain": "txt",
  "text/xml": "xml",
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

  return mediaTypeExtensions[mediaType] || "txt";
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
      .replace(/^-|-$/g, "") || "unknown";

  return {
    contentType,
    fileName: `rsswag-response-${normalizedStatus}.${getResponseFileExtension(contentType)}`,
  };
}
