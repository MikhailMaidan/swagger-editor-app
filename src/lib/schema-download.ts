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
): SchemaCollectionExport {
  const exportedAtIso = exportedAt.toISOString();

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
    fileName: `openapi-schemas-${exportedAtIso.slice(0, 10)}.json`,
  };
}

function downloadFile(content: string, fileName: string, contentType: string) {
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

export function downloadSchemaFile(
  schemaText: string,
  title: string,
  format: string,
) {
  const { contentType, fileName } = getSchemaDownloadMetadata(title, format);

  downloadFile(schemaText, fileName, contentType);
}

export function downloadSchemaCollectionFile(schemas: SavedSchemaRecord[]) {
  const { content, contentType, fileName } =
    createSchemaCollectionExport(schemas);

  downloadFile(content, fileName, contentType);
}
