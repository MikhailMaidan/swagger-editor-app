import type { SchemaAuditReport } from "./schema-audit";

export type SchemaAuditExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "openapi-schema";
}

function getExportDate(exportedAt: Date) {
  return Number.isNaN(exportedAt.getTime())
    ? new Date(0).toISOString()
    : exportedAt.toISOString();
}

export function createSchemaAuditExport(
  report: SchemaAuditReport,
  schema: { title: string; version: string },
  exportedAt = new Date(),
): SchemaAuditExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        audit: report,
        exportedAt: exportedAtIso,
        schema,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-audit-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadSchemaAuditFile(
  report: SchemaAuditReport,
  schema: { title: string; version: string },
) {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }

  let objectUrl = "";

  try {
    const auditExport = createSchemaAuditExport(report, schema);

    objectUrl = URL.createObjectURL(
      new Blob([auditExport.content], { type: auditExport.contentType }),
    );
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = auditExport.fileName;
    link.click();

    return true;
  } catch {
    return false;
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Cleanup failures should not change the completed action result.
      }
    }
  }
}
