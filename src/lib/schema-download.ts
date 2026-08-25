import type { SavedSchemaRecord } from "./schema-storage";

export type SchemaDownloadMetadata = {
  contentType: "application/json" | "application/yaml";
  fileName: string;
};

export type SchemaCollectionExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

export type SchemaCollectionExportScope = "all" | "visible";

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "openapi-schema";
}

export function getSchemaDownloadMetadata(
  title: string,
  format: string,
): SchemaDownloadMetadata {
  const extension = format.toLowerCase() === "json" ? "json" : "yaml";

  return {
    contentType: extension === "json" ? "application/json" : "application/yaml",
    fileName: `${slugifyTitle(title)}.${extension}`,
  };
}

export function createSchemaCollectionExport(
  schemas: SavedSchemaRecord[],
  exportedAt = new Date(),
  scope: SchemaCollectionExportScope = "all",
): SchemaCollectionExport {
  const exportedAtIso = exportedAt.toISOString();
  const scopeSuffix = scope === "visible" ? "-visible" : "";

  return {
    content: JSON.stringify(
      {
        exportedAt: exportedAtIso,
        schemas,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `openapi-schemas${scopeSuffix}-${exportedAtIso.slice(0, 10)}.json`,
  };
}

function downloadFile(content: string, fileName: string, contentType: string) {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }

  let objectUrl = "";

  try {
    objectUrl = URL.createObjectURL(new Blob([content], { type: contentType }));
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    link.click();

    return true;
  } catch {
    return false;
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // A failed cleanup should not turn a started download into an error.
      }
    }
  }
}

export function downloadSchemaFile(
  schemaText: string,
  title: string,
  format: string,
) {
  const { contentType, fileName } = getSchemaDownloadMetadata(title, format);

  return downloadFile(schemaText, fileName, contentType);
}

export function downloadSchemaCollectionFile(
  schemas: SavedSchemaRecord[],
  scope: SchemaCollectionExportScope = "all",
) {
  const { content, contentType, fileName } = createSchemaCollectionExport(
    schemas,
    new Date(),
    scope,
  );

  return downloadFile(content, fileName, contentType);
}
