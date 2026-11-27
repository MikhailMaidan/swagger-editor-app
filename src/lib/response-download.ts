import { isJsonMediaType } from "./request-body";

const STRUCTURED_TEXT_MEDIA_TYPE_PATTERN =
  /^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+\+(xml|yaml)$/;

const mediaTypeExtensions: Record<string, string> = {
  "application/javascript": "js",
  "application/json": "json",
  "application/ndjson": "ndjson",
  "application/x-ndjson": "ndjson",
  "application/x-yaml": "yaml",
  "application/xml": "xml",
  "application/yaml": "yaml",
  "image/svg+xml": "svg",
  "text/calendar": "ics",
  "text/css": "css",
  "text/csv": "csv",
  "text/html": "html",
  "text/javascript": "js",
  "text/json": "json",
  "text/markdown": "md",
  "text/plain": "txt",
  "text/tab-separated-values": "tsv",
  "text/vcard": "vcf",
  "text/x-vcard": "vcf",
  "text/x-yaml": "yaml",
  "text/xml": "xml",
  "text/yaml": "yaml",
};

function getResponseContentType(headers: Record<string, string>) {
  const contentType = Object.entries(headers).find(
    ([header]) => header.trim().toLowerCase() === "content-type",
  )?.[1];
  return contentType?.trim() ? contentType : "text/plain;charset=utf-8";
}

function getResponseFileExtension(contentType: string) {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();

  if (mediaType.includes("*")) {
    return "txt";
  }

  // Prefer known formats before the generic JSON/XML/YAML suffix fallbacks.
  if (Object.hasOwn(mediaTypeExtensions, mediaType)) {
    return mediaTypeExtensions[mediaType];
  }

  if (isJsonMediaType(mediaType)) {
    return "json";
  }

  const structuredExtension = mediaType.match(
    STRUCTURED_TEXT_MEDIA_TYPE_PATTERN,
  )?.[1];

  if (structuredExtension) {
    return structuredExtension;
  }

  return "txt";
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
