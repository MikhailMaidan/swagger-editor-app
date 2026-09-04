import type {
  RequestCoverageReport,
  RequestCoverageWindow,
} from "./request-coverage";
import { downloadTextFile } from "./schema-download";

export type RequestCoverageExportSchema = {
  title: string;
  version: string;
};

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return slug || "openapi-schema";
}

function normalizeExportDate(exportedAt: Date) {
  return Number.isNaN(exportedAt.getTime())
    ? new Date(0).toISOString()
    : exportedAt.toISOString();
}

export function createRequestCoverageExport(
  report: RequestCoverageReport,
  schema: RequestCoverageExportSchema,
  window: RequestCoverageWindow,
  exportedAt = new Date(),
) {
  const exportedAtIso = normalizeExportDate(exportedAt);

  return {
    content: `${JSON.stringify(
      {
        exportedAt: exportedAtIso,
        report,
        schema,
        version: 1,
        window,
      },
      null,
      2,
    )}\n`,
    contentType: "application/json" as const,
    fileName: `rsswag-${slugifyTitle(schema.title)}-request-coverage-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadRequestCoverageFile(
  report: RequestCoverageReport,
  schema: RequestCoverageExportSchema,
  window: RequestCoverageWindow,
) {
  const exported = createRequestCoverageExport(report, schema, window);

  return downloadTextFile(
    exported.content,
    exported.fileName,
    exported.contentType,
  );
}
