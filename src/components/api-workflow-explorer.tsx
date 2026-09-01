"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  createApiWorkflowMermaid,
  downloadApiWorkflowFile,
} from "@/lib/openapi-workflow-export";
import type {
  ApiWorkflowIssueCode,
  ApiWorkflowLink,
  ApiWorkflowReport,
  ApiWorkflowResolution,
} from "@/lib/openapi-workflows";
import type { TranslationKey } from "@/lib/translations";

type WorkflowFilter = "all" | "cycles" | "problems" | "resolved";

const LINK_PREVIEW_LIMIT = 8;

const resolutionTranslationKeys: Record<ApiWorkflowResolution, TranslationKey> =
  {
    ambiguous: "workspace.workflowStatusAmbiguous",
    external: "workspace.workflowStatusExternal",
    resolved: "workspace.workflowStatusResolved",
    unresolved: "workspace.workflowStatusUnresolved",
  };

const resolutionClasses: Record<ApiWorkflowResolution, string> = {
  ambiguous: "bg-amber-100 text-amber-800",
  external: "bg-sky-100 text-sky-800",
  resolved: "bg-emerald-100 text-emerald-800",
  unresolved: "bg-red-100 text-red-700",
};

const issueTranslationKeys: Record<ApiWorkflowIssueCode, TranslationKey> = {
  "ambiguous-operation-id": "workspace.workflowIssueAmbiguousOperationId",
  "external-operation-ref": "workspace.workflowIssueExternalOperationRef",
  "invalid-operation-ref": "workspace.workflowIssueInvalidOperationRef",
  "missing-operation-id": "workspace.workflowIssueMissingOperationId",
  "missing-target": "workspace.workflowIssueMissingTarget",
  "multiple-targets": "workspace.workflowIssueMultipleTargets",
};

function matchesFilter(link: ApiWorkflowLink, filter: WorkflowFilter) {
  if (filter === "cycles") {
    return link.inCycle;
  }

  if (filter === "problems") {
    return link.issueCodes.length > 0;
  }

  if (filter === "resolved") {
    return link.resolution === "resolved";
  }

  return true;
}

export function ApiWorkflowExplorer({
  onSelectEndpoint,
  report,
  schema,
}: {
  onSelectEndpoint: (method: string, path: string) => void;
  report: ApiWorkflowReport;
  schema: { title: string; version: string };
}) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<WorkflowFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [actionStatus, setActionStatus] = useState<
    "copy-error" | "copy-success" | "export-error" | "export-success" | "idle"
  >("idle");
  const cycleLinkCount = report.links.filter((link) => link.inCycle).length;
  const filters: Array<{
    count: number;
    label: TranslationKey;
    value: WorkflowFilter;
  }> = [
    {
      count: report.totalLinkCount,
      label: "workspace.workflowFilterAll",
      value: "all",
    },
    {
      count: report.resolvedCount,
      label: "workspace.workflowFilterResolved",
      value: "resolved",
    },
    {
      count: report.problemCount,
      label: "workspace.workflowFilterProblems",
      value: "problems",
    },
    {
      count: cycleLinkCount,
      label: "workspace.workflowFilterCycles",
      value: "cycles",
    },
  ];
  const filteredLinks = report.links.filter((link) =>
    matchesFilter(link, activeFilter),
  );
  const visibleLinks = showAll
    ? filteredLinks
    : filteredLinks.slice(0, LINK_PREVIEW_LIMIT);

  function handleFilterChange(filter: WorkflowFilter) {
    setActiveFilter(filter);
    setShowAll(false);
  }

  async function handleCopyMermaid() {
    const copied = await writeTextToClipboard(createApiWorkflowMermaid(report));

    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  function handleExport() {
    const downloaded = downloadApiWorkflowFile(report, schema);

    setActionStatus(downloaded ? "export-success" : "export-error");
  }

  function getTargetText(link: ApiWorkflowLink) {
    if (link.target) {
      return `${link.target.method} ${link.target.path}`;
    }

    return link.targetLabel || t("workspace.workflowUnknownTarget");
  }

  return (
    <section
      aria-labelledby="api-workflow-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="api-workflow-title"
            >
              {t("workspace.workflowTitle")}
            </h3>
            <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-800">
              {t("workspace.workflowResolvedSummary", {
                resolved: String(report.resolvedCount),
                total: String(report.totalLinkCount),
              })}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.workflowSummary", {
              operations: String(report.connectedOperationCount),
              problems: String(report.problemCount),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            type="button"
            onClick={handleCopyMermaid}
          >
            {t("workspace.workflowCopyMermaid")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleExport}
          >
            {t("workspace.workflowExport")}
          </button>
        </div>
      </div>

      {actionStatus !== "idle" ? (
        <p
          className={`mt-2 text-sm font-semibold ${
            actionStatus.endsWith("error") ? "text-red-700" : "text-emerald-700"
          }`}
          role={actionStatus.endsWith("error") ? "alert" : "status"}
        >
          {t(
            actionStatus === "copy-error"
              ? "workspace.workflowCopyError"
              : actionStatus === "copy-success"
                ? "workspace.workflowCopySuccess"
                : actionStatus === "export-error"
                  ? "workspace.workflowExportError"
                  : "workspace.workflowExportSuccess",
          )}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {[
          ["workspace.workflowStatLinks", report.totalLinkCount],
          ["workspace.workflowStatOperations", report.connectedOperationCount],
          ["workspace.workflowStatProblems", report.problemCount],
          ["workspace.workflowStatCycles", report.cycleCount],
        ].map(([label, value]) => (
          <div className="min-w-0 bg-white p-3" key={label}>
            <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
              {t(label as TranslationKey)}
            </p>
            <p className="mt-1 text-xl font-extrabold text-[color:var(--color-brand-navy)]">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div
        aria-label={t("workspace.workflowFilterLabel")}
        className="mt-4 flex flex-wrap gap-2"
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

      {filteredLinks.length === 0 ? (
        <p
          className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.workflowNoLinks")}
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-[color:var(--color-brand-border)]">
            {visibleLinks.map((link) => (
              <li className="py-4" key={link.key}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-extrabold ${resolutionClasses[link.resolution]}`}
                  >
                    {t(resolutionTranslationKeys[link.resolution])}
                  </span>
                  {link.inCycle ? (
                    <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-800">
                      {t("workspace.workflowCycleBadge")}
                    </span>
                  ) : null}
                  <code className="break-all text-xs font-extrabold text-[color:var(--color-brand-navy)]">
                    {link.status} {link.name}
                  </code>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                      {t("workspace.workflowSource")}
                    </p>
                    <button
                      className="mt-1 max-w-full break-all text-left text-sm font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
                      type="button"
                      onClick={() =>
                        onSelectEndpoint(link.source.method, link.source.path)
                      }
                    >
                      {link.source.method} {link.source.path}
                    </button>
                  </div>
                  <span
                    aria-hidden="true"
                    className="hidden text-lg font-extrabold text-[color:var(--color-brand-muted)] md:block"
                  >
                    &gt;
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                      {t("workspace.workflowTarget")}
                    </p>
                    {link.target ? (
                      <button
                        className="mt-1 max-w-full break-all text-left text-sm font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
                        type="button"
                        onClick={() =>
                          onSelectEndpoint(
                            link.target?.method ?? "",
                            link.target?.path ?? "",
                          )
                        }
                      >
                        {getTargetText(link)}
                      </button>
                    ) : (
                      <code className="mt-1 block break-all text-sm font-bold text-[color:var(--color-brand-navy)]">
                        {getTargetText(link)}
                      </code>
                    )}
                  </div>
                </div>

                {link.description ? (
                  <p className="mt-2 break-words text-xs font-semibold text-[color:var(--color-brand-muted)]">
                    {link.description}
                  </p>
                ) : null}

                {link.parameters.length > 0 ||
                link.requestBodyExpression ||
                link.serverUrl ? (
                  <div className="mt-3 grid gap-1 text-xs">
                    {link.parameters.map((mapping) => (
                      <p className="min-w-0 break-words" key={mapping.name}>
                        <span className="font-bold text-[color:var(--color-brand-muted)]">
                          {t("workspace.workflowParameter")}: {mapping.name}{" "}
                          ={" "}
                        </span>
                        <code className="text-[color:var(--color-brand-navy)]">
                          {mapping.expression}
                        </code>
                      </p>
                    ))}
                    {link.requestBodyExpression ? (
                      <p className="min-w-0 break-words">
                        <span className="font-bold text-[color:var(--color-brand-muted)]">
                          {t("workspace.workflowRequestBody")}:{" "}
                        </span>
                        <code className="text-[color:var(--color-brand-navy)]">
                          {link.requestBodyExpression}
                        </code>
                      </p>
                    ) : null}
                    {link.serverUrl ? (
                      <p className="min-w-0 break-words">
                        <span className="font-bold text-[color:var(--color-brand-muted)]">
                          {t("workspace.workflowServer")}:{" "}
                        </span>
                        <code className="text-[color:var(--color-brand-navy)]">
                          {link.serverUrl}
                        </code>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {link.issueCodes.map((code) => (
                  <p
                    className="mt-2 break-words text-xs font-semibold text-amber-800"
                    key={code}
                  >
                    {t(issueTranslationKeys[code], {
                      target: link.targetLabel || link.name,
                    })}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {filteredLinks.length > LINK_PREVIEW_LIMIT ? (
            <button
              className="mt-2 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? t("workspace.workflowShowLess")
                : t("workspace.workflowShowAll", {
                    count: String(filteredLinks.length),
                  })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
