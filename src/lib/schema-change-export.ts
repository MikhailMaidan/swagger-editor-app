import type { SchemaChangeReport } from "./schema-change";
import type { SchemaComparisonBaseline } from "./schema-comparison-baseline";

export type SchemaChangeExport = {
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

export function createSchemaChangeExport(
  report: SchemaChangeReport,
  baseline: SchemaComparisonBaseline,
  current: { title: string; version: string },
  exportedAt = new Date(),
): SchemaChangeExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        baseline: {
          capturedAt: baseline.capturedAt,
          endpointCount: baseline.endpoints.length,
          title: baseline.title,
          version: baseline.version,
        },
        current,
        exportedAt: exportedAtIso,
        report,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(current.title)}-changes-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadSchemaChangeFile(
  report: SchemaChangeReport,
  baseline: SchemaComparisonBaseline,
  current: { title: string; version: string },
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
    const changeExport = createSchemaChangeExport(report, baseline, current);

    objectUrl = URL.createObjectURL(
      new Blob([changeExport.content], { type: changeExport.contentType }),
    );
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = changeExport.fileName;
    link.click();

    return true;
  } catch {
    return false;
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Cleanup failures should not change a completed download result.
      }
    }
  }
}
