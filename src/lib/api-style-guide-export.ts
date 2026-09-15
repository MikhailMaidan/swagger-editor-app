import {
  serializeStyleGuideConfig,
  STYLE_GUIDE_CONVENTION_KEYS,
  type StyleGuideConfig,
  type StyleGuideConventionKey,
  type StyleRuleCategory,
  type StyleRuleId,
  type StyleSeverity,
} from "./api-style-guide-config";
import type { StyleGuideReport, StyleViolation } from "./api-style-guide";
import { downloadTextFile } from "./schema-download";
import { translate } from "./translations";
import type { Language, TranslationKey } from "./translations";

type Translator = (
  key: TranslationKey,
  params?: Record<string, string>,
) => string;

export const styleRuleTitleKeys: Record<StyleRuleId, TranslationKey> = {
  "enum-value-casing": "workspace.styleRuleEnumValueCasingTitle",
  "error-schema-consistency": "workspace.styleRuleErrorSchemaConsistencyTitle",
  "info-metadata": "workspace.styleRuleInfoMetadataTitle",
  "operation-id-casing": "workspace.styleRuleOperationIdCasingTitle",
  "page-size-name": "workspace.styleRulePageSizeNameTitle",
  "pagination-style": "workspace.styleRulePaginationStyleTitle",
  "parameter-casing": "workspace.styleRuleParameterCasingTitle",
  "parameter-description": "workspace.styleRuleParameterDescriptionTitle",
  "path-ambiguous": "workspace.styleRulePathAmbiguousTitle",
  "path-casing": "workspace.styleRulePathCasingTitle",
  "path-file-extension": "workspace.styleRulePathFileExtensionTitle",
  "path-trailing-slash": "workspace.styleRulePathTrailingSlashTitle",
  "path-verbs": "workspace.styleRulePathVerbsTitle",
  "post-create-status": "workspace.styleRulePostCreateStatusTitle",
  "property-casing": "workspace.styleRulePropertyCasingTitle",
  "property-type": "workspace.styleRulePropertyTypeTitle",
  "request-body-on-safe-method":
    "workspace.styleRuleRequestBodyOnSafeMethodTitle",
  "reserved-header-parameter":
    "workspace.styleRuleReservedHeaderParameterTitle",
  "schema-name-casing": "workspace.styleRuleSchemaNameCasingTitle",
  "server-https": "workspace.styleRuleServerHttpsTitle",
  "summary-style": "workspace.styleRuleSummaryStyleTitle",
  "tag-declared": "workspace.styleRuleTagDeclaredTitle",
  "tag-description": "workspace.styleRuleTagDescriptionTitle",
};

export const styleRuleMessageKeys: Record<StyleRuleId, TranslationKey> = {
  "enum-value-casing": "workspace.styleRuleEnumValueCasingMessage",
  "error-schema-consistency":
    "workspace.styleRuleErrorSchemaConsistencyMessage",
  "info-metadata": "workspace.styleRuleInfoMetadataMessage",
  "operation-id-casing": "workspace.styleRuleOperationIdCasingMessage",
  "page-size-name": "workspace.styleRulePageSizeNameMessage",
  "pagination-style": "workspace.styleRulePaginationStyleMessage",
  "parameter-casing": "workspace.styleRuleParameterCasingMessage",
  "parameter-description": "workspace.styleRuleParameterDescriptionMessage",
  "path-ambiguous": "workspace.styleRulePathAmbiguousMessage",
  "path-casing": "workspace.styleRulePathCasingMessage",
  "path-file-extension": "workspace.styleRulePathFileExtensionMessage",
  "path-trailing-slash": "workspace.styleRulePathTrailingSlashMessage",
  "path-verbs": "workspace.styleRulePathVerbsMessage",
  "post-create-status": "workspace.styleRulePostCreateStatusMessage",
  "property-casing": "workspace.styleRulePropertyCasingMessage",
  "property-type": "workspace.styleRulePropertyTypeMessage",
  "request-body-on-safe-method":
    "workspace.styleRuleRequestBodyOnSafeMethodMessage",
  "reserved-header-parameter":
    "workspace.styleRuleReservedHeaderParameterMessage",
  "schema-name-casing": "workspace.styleRuleSchemaNameCasingMessage",
  "server-https": "workspace.styleRuleServerHttpsMessage",
  "summary-style": "workspace.styleRuleSummaryStyleMessage",
  "tag-declared": "workspace.styleRuleTagDeclaredMessage",
  "tag-description": "workspace.styleRuleTagDescriptionMessage",
};

export const styleCategoryKeys: Record<StyleRuleCategory, TranslationKey> = {
  document: "workspace.styleCategoryDocument",
  operations: "workspace.styleCategoryOperations",
  parameters: "workspace.styleCategoryParameters",
  paths: "workspace.styleCategoryPaths",
  responses: "workspace.styleCategoryResponses",
  schemas: "workspace.styleCategorySchemas",
};

export const styleSeverityKeys: Record<StyleSeverity, TranslationKey> = {
  error: "workspace.styleSeverityError",
  info: "workspace.styleSeverityInfo",
  warning: "workspace.styleSeverityWarning",
};

export const styleConventionKeys: Record<
  StyleGuideConventionKey,
  TranslationKey
> = {
  operationIdCase: "workspace.styleConventionOperationIdCase",
  parameterCase: "workspace.styleConventionParameterCase",
  pathCase: "workspace.styleConventionPathCase",
  propertyCase: "workspace.styleConventionPropertyCase",
};

export function formatStyleViolation(violation: StyleViolation, t: Translator) {
  return t(styleRuleMessageKeys[violation.ruleId], violation.params);
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

export function createStyleGuideMarkdown(
  report: StyleGuideReport,
  config: StyleGuideConfig,
  schema: { title: string; version: string },
  language: Language = "en",
) {
  const t: Translator = (key, params) => translate(language, key, params);
  const lines = [
    `# ${t("workspace.styleMarkdownTitle", {
      title: sanitizeMarkdownInline(schema.title),
    })}`,
    "",
    t("workspace.styleMarkdownVersion", {
      version: sanitizeMarkdownInline(schema.version),
    }),
    t("workspace.styleMarkdownSummary", {
      enabled: String(report.enabledRuleCount),
      errors: String(report.counts.error),
      notes: String(report.counts.info),
      passing: String(report.passingRuleCount),
      score: String(report.score),
      warnings: String(report.counts.warning),
    }),
    "",
    `## ${t("workspace.styleMarkdownConventions")}`,
    ...STYLE_GUIDE_CONVENTION_KEYS.map(
      (key) => `- ${t(styleConventionKeys[key])}: \`${config[key]}\``,
    ),
    "",
    `## ${t("workspace.styleMarkdownRules")}`,
  ];

  for (const rule of report.rules) {
    const state = !rule.enabled
      ? t("workspace.styleRuleDisabled")
      : rule.violationCount > 0
        ? t("workspace.styleRuleFindings", {
            count: String(rule.violationCount),
          })
        : rule.checkedCount === 0
          ? t("workspace.styleRuleNotApplicable")
          : t("workspace.styleRulePassing");

    lines.push(
      `- ${!rule.enabled ? "○" : rule.violationCount === 0 ? "✓" : "✗"} ${t(
        styleRuleTitleKeys[rule.id],
      )} (${t(styleSeverityKeys[rule.severity])}): ${state}`,
    );
  }

  lines.push("", `## ${t("workspace.styleMarkdownFindings")}`);

  if (report.violations.length === 0) {
    lines.push(t("workspace.styleNoFindings"));
  }

  for (const violation of report.violations) {
    const endpoint = violation.method
      ? ` \`${sanitizeMarkdownInline(violation.method)} ${sanitizeMarkdownInline(violation.path)}\``
      : "";
    const suggestion = violation.params.suggestion
      ? ` ${t("workspace.styleSuggestion", {
          suggestion: `\`${sanitizeMarkdownInline(violation.params.suggestion)}\``,
        })}`
      : "";

    lines.push(
      `- **${t(styleSeverityKeys[violation.severity])}** ${t(
        styleRuleTitleKeys[violation.ruleId],
      )}${endpoint}: ${sanitizeMarkdownInline(
        formatStyleViolation(violation, t),
      )}${suggestion} — \`${sanitizeMarkdownInline(violation.pointer)}\``,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function createStyleGuideExport(
  report: StyleGuideReport,
  config: StyleGuideConfig,
  schema: { title: string; version: string },
  exportedAt = new Date(),
) {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        config: JSON.parse(serializeStyleGuideConfig(config)),
        exportedAt: exportedAtIso,
        schema,
        styleGuide: report,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json" as const,
    fileName: `rsswag-${slugifyTitle(schema.title)}-style-guide-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadStyleGuideReport(
  report: StyleGuideReport,
  config: StyleGuideConfig,
  schema: { title: string; version: string },
) {
  const styleExport = createStyleGuideExport(report, config, schema);

  return downloadTextFile(
    styleExport.content,
    styleExport.fileName,
    styleExport.contentType,
  );
}

export function downloadStyleGuideRuleset(config: StyleGuideConfig) {
  return downloadTextFile(
    serializeStyleGuideConfig(config),
    "rsswag-style-guide.json",
    "application/json",
  );
}
