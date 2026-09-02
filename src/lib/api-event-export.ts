import type {
  ApiEventFinding,
  ApiEventFindingCode,
  ApiEventIssueCode,
  ApiEventKind,
  ApiEventOperation,
  ApiEventReport,
} from "./api-events";
import { downloadTextFile } from "./schema-download";
import { translate } from "./translations";
import type { Language, TranslationKey } from "./translations";

export type ApiEventExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

const kindTranslationKeys: Record<ApiEventKind, TranslationKey> = {
  callback: "workspace.eventKindCallback",
  webhook: "workspace.eventKindWebhook",
};

const issueTranslationKeys: Record<ApiEventIssueCode, TranslationKey> = {
  "external-reference": "workspace.eventIssueExternalReference",
  "missing-documentation": "workspace.eventIssueMissingDocumentation",
  "missing-operation-id": "workspace.eventIssueMissingOperationId",
  "missing-responses": "workspace.eventIssueMissingResponses",
  "unresolved-reference": "workspace.eventIssueUnresolvedReference",
};

const findingTranslationKeys: Record<ApiEventFindingCode, TranslationKey> = {
  "empty-channel": "workspace.eventFindingEmptyChannel",
  "external-reference": "workspace.eventFindingExternalReference",
  "unresolved-reference": "workspace.eventFindingUnresolvedReference",
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

function getReferenceForOperation(operation: ApiEventOperation) {
  return sanitizeMarkdownInline(operation.referenceIssues.join(", "));
}

function getIssueMessage(
  issue: ApiEventIssueCode,
  operation: ApiEventOperation,
  language: Language,
) {
  return translate(language, issueTranslationKeys[issue], {
    reference: getReferenceForOperation(operation),
  });
}

function getFindingMessage(finding: ApiEventFinding, language: Language) {
  return translate(language, findingTranslationKeys[finding.code], {
    name: sanitizeMarkdownInline(finding.name),
    reference: sanitizeMarkdownInline(finding.reference),
  });
}

export function createApiEventMarkdown(
  report: ApiEventReport,
  schema: { title: string; version: string },
  language: Language = "en",
) {
  const lines = [
    `# ${translate(language, "workspace.eventMarkdownTitle", {
      title: sanitizeMarkdownInline(schema.title),
    })}`,
    "",
    translate(language, "workspace.eventMarkdownVersion", {
      version: sanitizeMarkdownInline(schema.version),
    }),
    translate(language, "workspace.eventMarkdownSummary", {
      callbacks: String(report.callbackOperationCount),
      channels: String(report.channelCount),
      operations: String(report.totalOperationCount),
      webhooks: String(report.webhookOperationCount),
    }),
    "",
    `## ${translate(language, "workspace.eventOperationsTitle")}`,
  ];

  if (report.operations.length === 0) {
    lines.push(translate(language, "workspace.eventNoOperations"));
  } else {
    report.operations.forEach((operation) => {
      const kind = translate(language, kindTranslationKeys[operation.kind]);
      const endpoint = operation.expression || operation.name;
      const title =
        operation.summary || operation.operationId || operation.name;

      lines.push(
        "",
        `### ${kind}: ${sanitizeMarkdownInline(title)}`,
        `- \`${operation.method} ${sanitizeMarkdownInline(endpoint)}\``,
      );

      if (operation.source) {
        lines.push(
          `- ${translate(language, "workspace.eventSource")}: \`${operation.source.method} ${sanitizeMarkdownInline(operation.source.path)}\``,
        );
      } else {
        lines.push(
          `- ${translate(language, "workspace.eventSource")}: ${translate(language, "workspace.eventIndependent")}`,
        );
      }

      if (operation.payloads.length > 0) {
        lines.push(
          `- ${translate(language, "workspace.eventPayloads")}: ${operation.payloads
            .map((payload) =>
              [payload.contentType, payload.schemaName || payload.schemaType]
                .filter(Boolean)
                .map(sanitizeMarkdownInline)
                .join(" / "),
            )
            .join(", ")}`,
        );
      }

      if (operation.responses.length > 0) {
        lines.push(
          `- ${translate(language, "workspace.eventResponses")}: ${operation.responses
            .map((response) => sanitizeMarkdownInline(response.status))
            .join(", ")}`,
        );
      }

      operation.issueCodes.forEach((issue) => {
        lines.push(`- ${getIssueMessage(issue, operation, language)}`);
      });
    });
  }

  lines.push("", `## ${translate(language, "workspace.eventFindingsTitle")}`);

  if (report.findings.length === 0) {
    lines.push(translate(language, "workspace.eventNoFindings"));
  } else {
    report.findings.forEach((finding) => {
      lines.push(`- ${getFindingMessage(finding, language)}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

export function createApiEventExport(
  report: ApiEventReport,
  schema: { title: string; version: string },
  exportedAt = new Date(),
): ApiEventExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        eventContracts: report,
        exportedAt: exportedAtIso,
        schema,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-events-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadApiEventFile(
  report: ApiEventReport,
  schema: { title: string; version: string },
) {
  const eventExport = createApiEventExport(report, schema);

  return downloadTextFile(
    eventExport.content,
    eventExport.fileName,
    eventExport.contentType,
  );
}
