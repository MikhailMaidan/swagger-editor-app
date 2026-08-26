"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type {
  SchemaAuditIssue,
  SchemaAuditIssueCode,
  SchemaAuditMetricKey,
  SchemaAuditReport,
  SchemaAuditSeverity,
} from "@/lib/schema-audit";
import { downloadSchemaAuditFile } from "@/lib/schema-audit-export";
import type { TranslationKey } from "@/lib/translations";

type AuditFilter = "all" | SchemaAuditSeverity;

const ISSUE_PREVIEW_LIMIT = 6;

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

const severityClasses: Record<SchemaAuditSeverity, string> = {
  error: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-800",
  warning: "bg-amber-100 text-amber-800",
};

function getScoreClasses(score: number) {
  if (score >= 80) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (score >= 50) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-red-100 text-red-700";
}

export function SchemaAuditPanel({
  onSelectEndpoint,
  report,
  schema,
}: {
  onSelectEndpoint: (method: string, path: string) => void;
  report: SchemaAuditReport;
  schema: { title: string; version: string };
}) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<AuditFilter>("all");
  const [exportStatus, setExportStatus] = useState<
    "error" | "idle" | "success"
  >("idle");
  const [showAll, setShowAll] = useState(false);
  const filteredIssues =
    activeFilter === "all"
      ? report.issues
      : report.issues.filter((issue) => issue.severity === activeFilter);
  const visibleIssues = showAll
    ? filteredIssues
    : filteredIssues.slice(0, ISSUE_PREVIEW_LIMIT);
  const filters: Array<{
    count: number;
    label: TranslationKey;
    value: AuditFilter;
  }> = [
    {
      count: report.issues.length,
      label: "workspace.auditFilterAll",
      value: "all",
    },
    {
      count: report.issueCounts.error,
      label: "workspace.auditFilterErrors",
      value: "error",
    },
    {
      count: report.issueCounts.warning,
      label: "workspace.auditFilterWarnings",
      value: "warning",
    },
    {
      count: report.issueCounts.info,
      label: "workspace.auditFilterInfo",
      value: "info",
    },
  ];

  function handleFilterChange(filter: AuditFilter) {
    setActiveFilter(filter);
    setShowAll(false);
  }

  function handleExport() {
    const downloaded = downloadSchemaAuditFile(report, schema);

    setExportStatus(downloaded ? "success" : "error");
  }

  function getIssueMessage(issue: SchemaAuditIssue) {
    return t(issueTranslationKeys[issue.code], {
      operationId: issue.operationId ?? "",
      parameter: issue.parameterName ?? "",
    });
  }

  return (
    <section
      aria-labelledby="schema-audit-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3
            className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
            id="schema-audit-title"
          >
            {t("workspace.auditTitle")}
          </h3>
          <span
            className={`rounded-md px-3 py-1 text-sm font-extrabold ${getScoreClasses(report.score)}`}
          >
            {t("workspace.auditScore", { score: String(report.score) })}
          </span>
        </div>
        <button
          className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
          type="button"
          onClick={handleExport}
        >
          {t("workspace.auditExport")}
        </button>
      </div>

      {exportStatus !== "idle" ? (
        <p
          className={`mt-2 text-sm font-semibold ${
            exportStatus === "error" ? "text-red-700" : "text-emerald-700"
          }`}
          role={exportStatus === "error" ? "alert" : "status"}
        >
          {t(
            exportStatus === "error"
              ? "workspace.auditExportError"
              : "workspace.auditExportSuccess",
          )}
        </p>
      ) : null}

      <div
        aria-label={t("workspace.auditCoverage")}
        className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {report.metrics.map((metric) => (
          <div key={metric.key}>
            <div className="flex items-center justify-between gap-3 text-xs font-bold">
              <span className="text-[color:var(--color-brand-navy)]">
                {t(metricTranslationKeys[metric.key])}
              </span>
              <span className="text-[color:var(--color-brand-muted)]">
                {t("workspace.auditCoverageValue", {
                  passed: String(metric.passed),
                  total: String(metric.total),
                })}
              </span>
            </div>
            <progress
              aria-label={t(metricTranslationKeys[metric.key])}
              className="mt-1 h-2 w-full accent-[color:var(--color-brand-purple)]"
              max="100"
              value={metric.percentage}
            />
          </div>
        ))}
      </div>

      <div
        aria-label={t("workspace.auditFilterLabel")}
        className="mt-5 flex flex-wrap gap-2"
        role="group"
      >
        {filters.map((filter) => (
          <button
            aria-pressed={activeFilter === filter.value}
            className={`h-9 rounded-md px-3 text-xs font-extrabold transition ${
              activeFilter === filter.value
                ? "bg-[color:var(--color-brand-navy)] text-white"
                : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            }`}
            key={filter.value}
            type="button"
            onClick={() => handleFilterChange(filter.value)}
          >
            {t(filter.label, { count: String(filter.count) })}
          </button>
        ))}
      </div>

      {filteredIssues.length === 0 ? (
        <p className="mt-4 text-sm font-bold text-emerald-700" role="status">
          {t("workspace.auditNoIssues")}
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[color:var(--color-brand-border)]">
            {visibleIssues.map((issue, index) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={`${issue.code}-${issue.method ?? "schema"}-${issue.path ?? "root"}-${issue.parameterName ?? issue.operationId ?? index}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-extrabold ${severityClasses[issue.severity]}`}
                    >
                      {t(severityTranslationKeys[issue.severity])}
                    </span>
                    {issue.method && issue.path ? (
                      <code className="break-all text-xs font-bold text-[color:var(--color-brand-muted)]">
                        {issue.method} {issue.path}
                      </code>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[color:var(--color-brand-navy)]">
                    {getIssueMessage(issue)}
                  </p>
                </div>
                {issue.method && issue.path ? (
                  <button
                    className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:border-[color:var(--color-brand-purple)] hover:bg-[color:var(--color-brand-soft)]"
                    type="button"
                    onClick={() =>
                      onSelectEndpoint(
                        issue.method as string,
                        issue.path as string,
                      )
                    }
                  >
                    {t("workspace.auditViewEndpoint")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {filteredIssues.length > ISSUE_PREVIEW_LIMIT ? (
            <button
              className="mt-2 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? t("workspace.auditShowLess")
                : t("workspace.auditShowAll", {
                    count: String(filteredIssues.length),
                  })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
