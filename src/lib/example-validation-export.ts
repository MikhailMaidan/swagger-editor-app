import type {
  ExampleValidationEntry,
  ExampleValidationIssue,
  ExampleValidationKeyword,
  ExampleValidationKind,
  ExampleValidationReport,
  ExampleValidationSkipReason,
  ExampleValidationStatus,
} from "./example-validation";
import { getExampleConformancePercentage } from "./example-validation";
import { downloadTextFile } from "./schema-download";
import { translate } from "./translations";
import type { Language, TranslationKey } from "./translations";

export type ExampleValidationExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

type Translator = (
  key: TranslationKey,
  params?: Record<string, string>,
) => string;

export const exampleIssueTranslationKeys: Record<
  ExampleValidationKeyword,
  TranslationKey
> = {
  additionalProperties: "workspace.examplesIssueAdditionalProperties",
  anyOf: "workspace.examplesIssueAnyOf",
  const: "workspace.examplesIssueConst",
  enum: "workspace.examplesIssueEnum",
  format: "workspace.examplesIssueFormat",
  maxItems: "workspace.examplesIssueMaxItems",
  maxLength: "workspace.examplesIssueMaxLength",
  maxProperties: "workspace.examplesIssueMaxProperties",
  maximum: "workspace.examplesIssueMaximum",
  minItems: "workspace.examplesIssueMinItems",
  minLength: "workspace.examplesIssueMinLength",
  minProperties: "workspace.examplesIssueMinProperties",
  minimum: "workspace.examplesIssueMinimum",
  multipleOf: "workspace.examplesIssueMultipleOf",
  not: "workspace.examplesIssueNot",
  oneOf: "workspace.examplesIssueOneOf",
  oneOfMultiple: "workspace.examplesIssueOneOfMultiple",
  pattern: "workspace.examplesIssuePattern",
  readOnly: "workspace.examplesIssueReadOnly",
  required: "workspace.examplesIssueRequired",
  serialized: "workspace.examplesIssueSerialized",
  type: "workspace.examplesIssueType",
  uniqueItems: "workspace.examplesIssueUniqueItems",
  writeOnly: "workspace.examplesIssueWriteOnly",
};

export const exampleSkipReasonTranslationKeys: Record<
  ExampleValidationSkipReason,
  TranslationKey
> = {
  "external-value": "workspace.examplesSkipExternalValue",
  limit: "workspace.examplesSkipLimit",
  "media-type": "workspace.examplesSkipMediaType",
  "missing-schema": "workspace.examplesSkipMissingSchema",
  "unresolved-reference": "workspace.examplesSkipUnresolvedReference",
};

export const exampleKindTranslationKeys: Record<
  ExampleValidationKind,
  TranslationKey
> = {
  header: "workspace.examplesBadgeHeader",
  parameter: "workspace.examplesBadgeParameter",
  "request-body": "workspace.examplesBadgeRequestBody",
  response: "workspace.examplesBadgeResponse",
  schema: "workspace.examplesBadgeSchema",
};

export const exampleStatusTranslationKeys: Record<
  ExampleValidationStatus,
  TranslationKey
> = {
  invalid: "workspace.examplesStatusInvalid",
  skipped: "workspace.examplesStatusSkipped",
  valid: "workspace.examplesStatusValid",
  warning: "workspace.examplesStatusWarning",
};

export function formatExampleIssue(
  issue: ExampleValidationIssue,
  t: Translator,
) {
  return t(exampleIssueTranslationKeys[issue.keyword], issue.params);
}

export function getExampleDisplayName(
  entry: Pick<ExampleValidationEntry, "exampleName">,
  t: Translator,
) {
  return entry.exampleName || t("workspace.examplesDefaultName");
}

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

export function createExampleValidationMarkdown(
  report: ExampleValidationReport,
  schema: { title: string; version: string },
  language: Language = "en",
) {
  const t: Translator = (key, params) => translate(language, key, params);
  const lines = [
    `# ${t("workspace.examplesMarkdownTitle", {
      title: sanitizeMarkdownInline(schema.title),
    })}`,
    "",
    t("workspace.examplesMarkdownVersion", {
      version: sanitizeMarkdownInline(schema.version),
    }),
    t("workspace.examplesMarkdownSummary", {
      invalid: String(report.invalidCount),
      percentage: String(getExampleConformancePercentage(report)),
      skipped: String(report.skippedCount),
      total: String(report.totalCount),
      valid: String(report.validCount),
      warnings: String(report.warningCount),
    }),
    "",
    `## ${t("workspace.examplesMarkdownFindings")}`,
  ];
  const findings = report.entries.filter(
    (entry) => entry.status === "invalid" || entry.status === "warning",
  );

  if (findings.length === 0) {
    lines.push(t("workspace.examplesMarkdownNoFindings"));
  }

  for (const entry of findings) {
    const endpoint = entry.method
      ? ` \`${sanitizeMarkdownInline(entry.method)} ${sanitizeMarkdownInline(entry.path)}\``
      : "";

    lines.push(
      `- **${t(exampleStatusTranslationKeys[entry.status])}**${endpoint} ${t(
        exampleKindTranslationKeys[entry.kind],
      )} \`${sanitizeMarkdownInline(entry.label)}\` (${sanitizeMarkdownInline(
        getExampleDisplayName(entry, t),
      )}) — \`${sanitizeMarkdownInline(entry.pointer)}\``,
    );

    for (const issue of entry.issues) {
      lines.push(
        `  - \`${sanitizeMarkdownInline(issue.instancePath || "/")}\`: ${sanitizeMarkdownInline(
          formatExampleIssue(issue, t),
        )}`,
      );
    }

    if (entry.hiddenIssueCount > 0) {
      lines.push(
        `  - ${t("workspace.examplesHiddenIssues", {
          count: String(entry.hiddenIssueCount),
        })}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function createExampleValidationExport(
  report: ExampleValidationReport,
  schema: { title: string; version: string },
  exportedAt = new Date(),
): ExampleValidationExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        conformancePercentage: getExampleConformancePercentage(report),
        exampleValidation: report,
        exportedAt: exportedAtIso,
        schema,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-examples-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadExampleValidationFile(
  report: ExampleValidationReport,
  schema: { title: string; version: string },
) {
  const exampleExport = createExampleValidationExport(report, schema);

  return downloadTextFile(
    exampleExport.content,
    exampleExport.fileName,
    exampleExport.contentType,
  );
}
