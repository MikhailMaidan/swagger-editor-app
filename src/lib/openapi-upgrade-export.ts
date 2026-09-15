import type { SchemaFormat } from "./openapi";
import type {
  OpenApiUpgradeChangeCode,
  OpenApiUpgradeEndpointParity,
  OpenApiUpgradeResult,
  OpenApiUpgradeSource,
  OpenApiUpgradeWarning,
  OpenApiUpgradeWarningCode,
} from "./openapi-upgrade";
import { downloadTextFile } from "./schema-download";
import { translate } from "./translations";
import type { Language, TranslationKey } from "./translations";

type Translator = (
  key: TranslationKey,
  params?: Record<string, string>,
) => string;

export const upgradeChangeKeys: Record<
  OpenApiUpgradeChangeCode,
  TranslationKey
> = {
  bounds: "workspace.upgradeChangeBounds",
  "file-types": "workspace.upgradeChangeFileTypes",
  "form-data": "workspace.upgradeChangeFormData",
  nullable: "workspace.upgradeChangeNullable",
  parameters: "workspace.upgradeChangeParameters",
  references: "workspace.upgradeChangeReferences",
  "request-bodies": "workspace.upgradeChangeRequestBodies",
  responses: "workspace.upgradeChangeResponses",
  "schema-examples": "workspace.upgradeChangeSchemaExamples",
  schemas: "workspace.upgradeChangeSchemas",
  "security-schemes": "workspace.upgradeChangeSecuritySchemes",
  "serialization-styles": "workspace.upgradeChangeSerializationStyles",
  servers: "workspace.upgradeChangeServers",
  version: "workspace.upgradeChangeVersion",
  webhooks: "workspace.upgradeChangeWebhooks",
};

export const upgradeWarningKeys: Record<
  OpenApiUpgradeWarningCode,
  TranslationKey
> = {
  "body-and-form-data": "workspace.upgradeWarningBodyAndFormData",
  "external-reference": "workspace.upgradeWarningExternalReference",
  "form-data-media-type": "workspace.upgradeWarningFormDataMediaType",
  "missing-response-description":
    "workspace.upgradeWarningMissingResponseDescription",
  "nullable-composition": "workspace.upgradeWarningNullableComposition",
  "operation-schemes": "workspace.upgradeWarningOperationSchemes",
  "unresolved-reference": "workspace.upgradeWarningUnresolvedReference",
  "unsupported-collection-format":
    "workspace.upgradeWarningUnsupportedCollectionFormat",
  "unsupported-oauth-flow": "workspace.upgradeWarningUnsupportedOauthFlow",
  "websocket-scheme": "workspace.upgradeWarningWebsocketScheme",
};

export const upgradeSourceKeys: Record<OpenApiUpgradeSource, TranslationKey> = {
  "openapi-3.0": "workspace.upgradeSourceOpenApi30",
  "swagger-2.0": "workspace.upgradeSourceSwagger2",
};

export function formatUpgradeChange(
  change: { code: OpenApiUpgradeChangeCode; count: number },
  target: string,
  t: Translator,
) {
  return t(upgradeChangeKeys[change.code], {
    count: String(change.count),
    target,
  });
}

export function formatUpgradeWarning(
  warning: OpenApiUpgradeWarning,
  t: Translator,
) {
  return t(upgradeWarningKeys[warning.code], warning.params);
}

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "openapi-schema";
}

function sanitizeMarkdownInline(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replaceAll("`", "'")
    .trim();
}

export function createUpgradeNotesMarkdown(
  result: OpenApiUpgradeResult,
  parity: OpenApiUpgradeEndpointParity,
  schema: { title: string; version: string },
  language: Language = "en",
) {
  const t: Translator = (key, params) => translate(language, key, params);
  const lines = [
    `# ${t("workspace.upgradeMarkdownTitle", {
      title: sanitizeMarkdownInline(schema.title),
    })}`,
    "",
    t("workspace.upgradePath", {
      source: t(upgradeSourceKeys[result.source]),
      target: result.target,
    }),
    parity.missing.length === 0
      ? t("workspace.upgradeParityOk", { count: String(parity.sourceCount) })
      : t("workspace.upgradeParityMissing", {
          count: String(parity.missing.length),
          endpoints: parity.missing.join(", "),
        }),
    "",
    `## ${t("workspace.upgradeChangesTitle")}`,
  ];

  if (result.changes.length === 0) {
    lines.push(t("workspace.upgradeNoChanges"));
  }

  for (const change of result.changes) {
    lines.push(`- ${formatUpgradeChange(change, result.target, t)}`);
  }

  lines.push("", `## ${t("workspace.upgradeWarningsTitle")}`);

  if (result.warnings.length === 0) {
    lines.push(t("workspace.upgradeNoWarnings"));
  }

  for (const warning of result.warnings) {
    const location = warning.pointer
      ? ` (\`${sanitizeMarkdownInline(warning.pointer)}\`)`
      : "";

    lines.push(
      `- ${sanitizeMarkdownInline(formatUpgradeWarning(warning, t))}${location}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function getUpgradedDocumentFile(
  title: string,
  target: string,
  format: SchemaFormat,
) {
  return {
    contentType: format === "json" ? "application/json" : "application/yaml",
    fileName: `${slugifyTitle(title)}-openapi-${target}.${format === "json" ? "json" : "yaml"}`,
  };
}

export function downloadUpgradedDocument(
  content: string,
  title: string,
  target: string,
  format: SchemaFormat,
) {
  const file = getUpgradedDocumentFile(title, target, format);

  return downloadTextFile(content, file.fileName, file.contentType);
}
