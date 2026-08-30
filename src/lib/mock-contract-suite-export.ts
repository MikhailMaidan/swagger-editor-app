import type { MockContractSuiteReport } from "./mock-contract-suite";

export type MockContractSuiteSchema = {
  title: string;
  version: string;
};

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "openapi-schema";
}

function normalizeExportDate(exportedAt: Date) {
  return Number.isNaN(exportedAt.getTime())
    ? new Date(0).toISOString()
    : exportedAt.toISOString();
}

export function createMockContractSuiteExport(
  report: MockContractSuiteReport,
  schema: MockContractSuiteSchema,
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
      },
      null,
      2,
    )}\n`,
    contentType: "application/json" as const,
    fileName: `rsswag-${slugifyTitle(schema.title)}-mock-contracts-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadMockContractSuiteFile(
  report: MockContractSuiteReport,
  schema: MockContractSuiteSchema,
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
    const suiteExport = createMockContractSuiteExport(report, schema);

    objectUrl = URL.createObjectURL(
      new Blob([suiteExport.content], { type: suiteExport.contentType }),
    );
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = suiteExport.fileName;
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
