import type { EndpointSummary } from "./openapi";
import { downloadTextFile } from "./schema-download";

export type EndpointInventoryExport = {
  content: string;
  contentType: "text/csv;charset=utf-8";
  fileName: string;
};

const CSV_HEADERS = [
  "Schema title",
  "Schema version",
  "Method",
  "Path",
  "Summary",
  "Operation ID",
  "Tags",
  "Secured",
  "Security schemes",
  "Deprecated",
  "Parameter count",
  "Request body media types",
  "Responses",
];

function getSafeExportDate(exportedAt: Date) {
  return Number.isFinite(exportedAt.getTime()) ? exportedAt : new Date(0);
}

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return slug || "openapi-schema";
}

function escapeCsvCell(value: string | number | boolean) {
  const normalizedValue = String(value)
    .replaceAll("\0", "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  const spreadsheetSafeValue = /^[\s\u0000-\u001f]*[=+\-@]/u.test(
    normalizedValue,
  )
    ? `'${normalizedValue}`
    : normalizedValue;

  return `"${spreadsheetSafeValue.replaceAll('"', '""')}"`;
}

function formatResponses(endpoint: EndpointSummary) {
  return endpoint.responses
    .map((response) =>
      response.contentTypes.length > 0
        ? `${response.status} (${response.contentTypes.join(" | ")})`
        : response.status,
    )
    .join("; ");
}

export function createEndpointInventoryExport(
  endpoints: EndpointSummary[],
  schema: { title: string; version: string },
  exportedAt = new Date(),
): EndpointInventoryExport {
  const rows = endpoints.map((endpoint) => [
    schema.title,
    schema.version,
    endpoint.method,
    endpoint.path,
    endpoint.summary,
    endpoint.operationId,
    endpoint.tags.join("; "),
    endpoint.secured,
    endpoint.securityRequirements.join("; "),
    endpoint.deprecated,
    endpoint.parameters.length,
    endpoint.requestBodies
      .map((requestBody) => requestBody.contentType)
      .join("; "),
    formatResponses(endpoint),
  ]);
  const content = [CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
  const safeExportedAt = getSafeExportDate(exportedAt);

  return {
    content: `\uFEFF${content}\r\n`,
    contentType: "text/csv;charset=utf-8",
    fileName: `rsswag-${slugifyTitle(schema.title)}-endpoints-${safeExportedAt.toISOString().slice(0, 10)}.csv`,
  };
}

export function downloadEndpointInventoryFile(
  endpoints: EndpointSummary[],
  schema: { title: string; version: string },
) {
  try {
    const inventoryExport = createEndpointInventoryExport(endpoints, schema);

    return downloadTextFile(
      inventoryExport.content,
      inventoryExport.fileName,
      inventoryExport.contentType,
    );
  } catch {
    return false;
  }
}
