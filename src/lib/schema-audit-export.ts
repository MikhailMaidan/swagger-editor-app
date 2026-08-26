import type {
  SchemaAuditIssue,
  SchemaAuditIssueCode,
  SchemaAuditMetricKey,
  SchemaAuditReport,
  SchemaAuditSeverity,
} from "./schema-audit";
import { translate } from "./translations";
import type { Language, TranslationKey } from "./translations";

export type SchemaAuditExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

const metricTranslationKeys: Record<SchemaAuditMetricKey, TranslationKey> = {
  documentation: "workspace.auditMetricDocumentation",
  "error-responses": "workspace.auditMetricErrorResponses",
  "operation-ids": "workspace.auditMetricOperationIds",
  "path-parameters": "workspace.auditMetricPathParameters",
  "success-responses": "workspace.auditMetricSuccessResponses",
  tags: "workspace.auditMetricTags",
};

const issueTranslationKeys: Record<SchemaAuditIssueCode, TranslationKey> = {
  "duplicate-operation-id": "workspace.auditIssueDuplicateOperationId",
  "missing-documentation": "workspace.auditIssueMissingDocumentation",
  "missing-error-response": "workspace.auditIssueMissingErrorResponse",
  "missing-operation-id": "workspace.auditIssueMissingOperationId",
  "missing-path-parameter": "workspace.auditIssueMissingPathParameter",
  "missing-success-response": "workspace.auditIssueMissingSuccessResponse",
  "missing-tags": "workspace.auditIssueMissingTags",
  "no-endpoints": "workspace.auditIssueNoEndpoints",
};

const severityTranslationKeys: Record<SchemaAuditSeverity, TranslationKey> = {
  error: "workspace.auditSeverityError",
  info: "workspace.auditSeverityInfo",
  warning: "workspace.auditSeverityWarning",
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

function sanitizeMarkdownInline(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replaceAll("`", "'")
    .trim();
}

function getLocalizedIssueMessage(issue: SchemaAuditIssue, language: Language) {
  return translate(language, issueTranslationKeys[issue.code], {
    operationId: sanitizeMarkdownInline(issue.operationId ?? ""),
    parameter: sanitizeMarkdownInline(issue.parameterName ?? ""),
  });
}

export function createSchemaAuditMarkdown(
  report: SchemaAuditReport,
  schema: { title: string; version: string },
  language: Language = "en",
) {
  const lines = [
    `# ${translate(language, "workspace.auditMarkdownTitle", {
      title: sanitizeMarkdownInline(schema.title),
    })}`,
    "",
    translate(language, "workspace.auditMarkdownVersion", {
      version: sanitizeMarkdownInline(schema.version),
    }),
    translate(language, "workspace.auditMarkdownScore", {
      passed: String(report.passedChecks),
      score: String(report.score),
      total: String(report.totalChecks),
    }),
    "",
    `## ${translate(language, "workspace.auditMarkdownCoverage")}`,
    ...report.metrics.map(
      (metric) =>
        `- ${translate(language, metricTranslationKeys[metric.key])}: ${metric.passed}/${metric.total} (${metric.percentage}%)`,
    ),
    "",
    `## ${translate(language, "workspace.auditMarkdownFindings")}`,
  ];

  if (report.issues.length === 0) {
    lines.push(translate(language, "workspace.auditNoIssues"));
  } else {
    report.issues.forEach((issue) => {
      const endpoint =
        issue.method && issue.path
          ? ` \`${sanitizeMarkdownInline(issue.method)} ${sanitizeMarkdownInline(issue.path)}\``
          : "";

      lines.push(
        `- **${translate(language, severityTranslationKeys[issue.severity])}**${endpoint}: ${getLocalizedIssueMessage(issue, language)}`,
      );
    });
  }

  return `${lines.join("\n")}\n`;
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
