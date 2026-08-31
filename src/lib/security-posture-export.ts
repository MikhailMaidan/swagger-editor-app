import { downloadTextFile } from "./schema-download";
import type {
  SecurityFindingCode,
  SecurityFindingSeverity,
  SecurityPostureFinding,
  SecurityPostureReport,
} from "./security-posture";
import { translate } from "./translations";
import type { Language, TranslationKey } from "./translations";

export type SecurityPostureExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

const findingTranslationKeys: Record<SecurityFindingCode, TranslationKey> = {
  "incomplete-api-key": "workspace.securityFindingIncompleteApiKey",
  "incomplete-http": "workspace.securityFindingIncompleteHttp",
  "optional-authentication": "workspace.securityFindingOptional",
  "undefined-scheme": "workspace.securityFindingUndefined",
  "unsupported-scheme": "workspace.securityFindingUnsupported",
  "unused-scheme": "workspace.securityFindingUnused",
};

const severityTranslationKeys: Record<SecurityFindingSeverity, TranslationKey> =
  {
    error: "workspace.securitySeverityError",
    info: "workspace.securitySeverityInfo",
    warning: "workspace.securitySeverityWarning",
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

function getFindingMessage(
  finding: SecurityPostureFinding,
  language: Language,
) {
  return translate(language, findingTranslationKeys[finding.code], {
    scheme: sanitizeMarkdownInline(finding.schemeName ?? ""),
  });
}

export function createSecurityPostureMarkdown(
  report: SecurityPostureReport,
  schema: { title: string; version: string },
  language: Language = "en",
) {
  const lines = [
    `# ${translate(language, "workspace.securityMarkdownTitle", {
      title: sanitizeMarkdownInline(schema.title),
    })}`,
    "",
    translate(language, "workspace.securityMarkdownVersion", {
      version: sanitizeMarkdownInline(schema.version),
    }),
    translate(language, "workspace.securityMarkdownCoverage", {
      percentage: String(report.coveragePercentage),
      secured: String(report.securedCount),
      total: String(report.totalCount),
    }),
    "",
    `## ${translate(language, "workspace.securitySchemesTitle")}`,
  ];

  if (report.schemes.length === 0) {
    lines.push(translate(language, "workspace.securityNoSchemes"));
  } else {
    report.schemes.forEach((scheme) => {
      lines.push(
        `- \`${sanitizeMarkdownInline(scheme.name)}\`: ${translate(
          language,
          "workspace.securitySchemeUsage",
          {
            count: String(scheme.operationCount),
            type: sanitizeMarkdownInline(scheme.type),
          },
        )}`,
      );
    });
  }

  lines.push(
    "",
    `## ${translate(language, "workspace.securityFindingsTitle")}`,
  );

  if (report.findings.length === 0) {
    lines.push(translate(language, "workspace.securityNoFindings"));
  } else {
    report.findings.forEach((finding) => {
      const endpoint =
        finding.method && finding.path
          ? ` \`${sanitizeMarkdownInline(finding.method)} ${sanitizeMarkdownInline(finding.path)}\``
          : "";

      lines.push(
        `- **${translate(language, severityTranslationKeys[finding.severity])}**${endpoint}: ${getFindingMessage(finding, language)}`,
      );
    });
  }

  return `${lines.join("\n")}\n`;
}

export function createSecurityPostureExport(
  report: SecurityPostureReport,
  schema: { title: string; version: string },
  exportedAt = new Date(),
): SecurityPostureExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        exportedAt: exportedAtIso,
        schema,
        securityPosture: report,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-security-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadSecurityPostureFile(
  report: SecurityPostureReport,
  schema: { title: string; version: string },
) {
  const securityExport = createSecurityPostureExport(report, schema);

  return downloadTextFile(
    securityExport.content,
    securityExport.fileName,
    securityExport.contentType,
  );
}
