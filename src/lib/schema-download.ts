export type SchemaDownloadMetadata = {
  contentType: "application/json" | "application/yaml";
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
    contentType:
      extension === "json" ? "application/json" : "application/yaml",
    fileName: `${slugifyTitle(title)}.${extension}`,
  };
}

export function downloadSchemaFile(
  schemaText: string,
  title: string,
  format: string,
) {
  const { contentType, fileName } = getSchemaDownloadMetadata(title, format);
  const objectUrl = URL.createObjectURL(
    new Blob([schemaText], { type: contentType }),
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
