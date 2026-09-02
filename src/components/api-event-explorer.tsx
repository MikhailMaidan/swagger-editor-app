"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  createApiEventMarkdown,
  downloadApiEventFile,
} from "@/lib/api-event-export";
import type {
  ApiEventFindingCode,
  ApiEventIssueCode,
  ApiEventKind,
  ApiEventOperation,
  ApiEventReport,
} from "@/lib/api-events";
import type { TranslationKey } from "@/lib/translations";

type EventFilter = "all" | "callback" | "issues" | "webhook";

const OPERATION_PREVIEW_LIMIT = 6;

const kindTranslationKeys: Record<ApiEventKind, TranslationKey> = {
  callback: "workspace.eventKindCallback",
  webhook: "workspace.eventKindWebhook",
};

const kindClasses: Record<ApiEventKind, string> = {
  callback: "bg-sky-100 text-sky-800",
  webhook: "bg-emerald-100 text-emerald-800",
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

function matchesFilter(operation: ApiEventOperation, filter: EventFilter) {
  if (filter === "issues") {
    return operation.issueCodes.length > 0;
  }

  if (filter === "callback" || filter === "webhook") {
    return operation.kind === filter;
  }

  return true;
}

export function ApiEventExplorer({
  onSelectEndpoint,
  report,
  schema,
}: {
  onSelectEndpoint: (method: string, path: string) => void;
  report: ApiEventReport;
  schema: { title: string; version: string };
}) {
  const { language, t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<EventFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [actionStatus, setActionStatus] = useState<
    "copy-error" | "copy-success" | "export-error" | "export-success" | "idle"
  >("idle");
  const reviewCount = report.issueOperationCount + report.findings.length;
  const filters: Array<{
    count: number;
    label: TranslationKey;
    value: EventFilter;
  }> = [
    {
      count: report.totalOperationCount,
      label: "workspace.eventFilterAll",
      value: "all",
    },
    {
      count: report.callbackOperationCount,
      label: "workspace.eventFilterCallbacks",
      value: "callback",
    },
    {
      count: report.webhookOperationCount,
      label: "workspace.eventFilterWebhooks",
      value: "webhook",
    },
    {
      count: report.issueOperationCount,
      label: "workspace.eventFilterIssues",
      value: "issues",
    },
  ];
  const filteredOperations = report.operations.filter((operation) =>
    matchesFilter(operation, activeFilter),
  );
  const visibleOperations = showAll
    ? filteredOperations
    : filteredOperations.slice(0, OPERATION_PREVIEW_LIMIT);

  function handleFilterChange(filter: EventFilter) {
    setActiveFilter(filter);
    setShowAll(false);
  }

  async function handleCopy() {
    const copied = await writeTextToClipboard(
      createApiEventMarkdown(report, schema, language),
    );

    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  function handleExport() {
    const downloaded = downloadApiEventFile(report, schema);

    setActionStatus(downloaded ? "export-success" : "export-error");
  }

  function getIssueMessage(
    issue: ApiEventIssueCode,
    operation: ApiEventOperation,
  ) {
    return t(issueTranslationKeys[issue], {
      reference: operation.referenceIssues.join(", "),
    });
  }

  return (
    <section
      aria-labelledby="api-events-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="api-events-title"
            >
              {t("workspace.eventTitle")}
            </h3>
            <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-800">
              {t("workspace.eventDocumentedSummary", {
                documented: String(report.documentedOperationCount),
                total: String(report.totalOperationCount),
              })}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.eventSummary", {
              channels: String(report.channelCount),
              issues: String(reviewCount),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            type="button"
            onClick={handleCopy}
          >
            {t("workspace.eventCopy")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleExport}
          >
            {t("workspace.eventExport")}
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
              ? "workspace.eventCopyError"
              : actionStatus === "copy-success"
                ? "workspace.eventCopySuccess"
                : actionStatus === "export-error"
                  ? "workspace.eventExportError"
                  : "workspace.eventExportSuccess",
          )}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {[
          ["workspace.eventStatOperations", report.totalOperationCount],
          ["workspace.eventStatCallbacks", report.callbackOperationCount],
          ["workspace.eventStatWebhooks", report.webhookOperationCount],
          ["workspace.eventStatPayloads", report.payloadOperationCount],
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

      {report.findings.length > 0 ? (
        <div className="mt-5 border-y border-amber-200 bg-amber-50 px-3 py-3">
          <h4 className="text-sm font-extrabold text-amber-900">
            {t("workspace.eventFindingsTitle")}
          </h4>
          <ul className="mt-2 grid gap-1">
            {report.findings.map((finding, index) => (
              <li
                className="break-words text-xs font-semibold text-amber-900"
                key={`${finding.kind}-${finding.name}-${finding.expression}-${index}`}
              >
                {t(findingTranslationKeys[finding.code], {
                  name: finding.name,
                  reference: finding.reference,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        aria-label={t("workspace.eventFilterLabel")}
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

      {filteredOperations.length === 0 ? (
        <p
          className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.eventNoOperations")}
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-[color:var(--color-brand-border)]">
            {visibleOperations.map((operation) => (
              <li className="py-4" key={operation.key}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-extrabold ${kindClasses[operation.kind]}`}
                  >
                    {t(kindTranslationKeys[operation.kind])}
                  </span>
                  {operation.deprecated ? (
                    <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-800">
                      {t("workspace.eventDeprecated")}
                    </span>
                  ) : null}
                  <code className="break-all text-xs font-extrabold text-[color:var(--color-brand-navy)]">
                    {operation.method} {operation.name}
                  </code>
                </div>

                <p className="mt-2 break-words text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                  {operation.summary || operation.operationId || operation.name}
                </p>
                {operation.description &&
                operation.description !== operation.summary ? (
                  <p className="mt-1 break-words text-xs font-semibold text-[color:var(--color-brand-muted)]">
                    {operation.description}
                  </p>
                ) : null}

                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  {operation.expression ? (
                    <div className="min-w-0">
                      <p className="font-bold text-[color:var(--color-brand-muted)]">
                        {t("workspace.eventUrlExpression")}
                      </p>
                      <code className="mt-1 block break-all font-bold text-[color:var(--color-brand-navy)]">
                        {operation.expression}
                      </code>
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-bold text-[color:var(--color-brand-muted)]">
                      {t("workspace.eventSource")}
                    </p>
                    {operation.source ? (
                      <button
                        className="mt-1 max-w-full break-all text-left font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
                        type="button"
                        onClick={() =>
                          onSelectEndpoint(
                            operation.source?.method ?? "",
                            operation.source?.path ?? "",
                          )
                        }
                      >
                        {operation.source.method} {operation.source.path}
                      </button>
                    ) : (
                      <p className="mt-1 font-semibold text-[color:var(--color-brand-navy)]">
                        {t("workspace.eventIndependent")}
                      </p>
                    )}
                  </div>
                  {operation.operationId ? (
                    <div className="min-w-0">
                      <p className="font-bold text-[color:var(--color-brand-muted)]">
                        {t("workspace.eventOperationId")}
                      </p>
                      <code className="mt-1 block break-all font-bold text-[color:var(--color-brand-navy)]">
                        {operation.operationId}
                      </code>
                    </div>
                  ) : null}
                  {operation.securityRequirements.length > 0 ? (
                    <div className="min-w-0">
                      <p className="font-bold text-[color:var(--color-brand-muted)]">
                        {t("workspace.eventSecurity")}
                      </p>
                      <p className="mt-1 break-words font-semibold text-[color:var(--color-brand-navy)]">
                        {operation.securityRequirements.join(", ")}
                      </p>
                    </div>
                  ) : null}
                </div>

                {operation.payloads.length > 0 ? (
                  <div className="mt-4">
                    <h5 className="text-xs font-extrabold text-[color:var(--color-brand-navy)]">
                      {t("workspace.eventPayloads")}
                    </h5>
                    <div className="mt-2 grid gap-3">
                      {operation.payloads.map((payload) => (
                        <div
                          className="min-w-0 border-l-2 border-sky-200 pl-3"
                          key={payload.contentType}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="break-all text-xs font-extrabold text-[color:var(--color-brand-navy)]">
                              {payload.contentType}
                            </code>
                            <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">
                              {payload.schemaName || payload.schemaType}
                            </span>
                            <span className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                              {t(
                                payload.required
                                  ? "workspace.eventRequired"
                                  : "workspace.eventOptional",
                              )}
                            </span>
                          </div>
                          {payload.description ? (
                            <p className="mt-1 break-words text-xs font-semibold text-[color:var(--color-brand-muted)]">
                              {payload.description}
                            </p>
                          ) : null}
                          {payload.example ? (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-extrabold text-[color:var(--color-brand-purple)]">
                                {t("workspace.eventExample")}
                              </summary>
                              <pre className="mt-2 max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#17132f] p-3 text-xs leading-5 text-white">
                                <code className="block max-w-full whitespace-pre-wrap break-all">
                                  {payload.example}
                                </code>
                              </pre>
                            </details>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {operation.responses.length > 0 ? (
                  <div className="mt-4">
                    <h5 className="text-xs font-extrabold text-[color:var(--color-brand-navy)]">
                      {t("workspace.eventResponses")}
                    </h5>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {operation.responses.map((response) => (
                        <span
                          className="rounded-md border border-[color:var(--color-brand-border)] px-2 py-1 text-xs font-bold text-[color:var(--color-brand-navy)]"
                          key={response.status}
                          title={response.description}
                        >
                          {response.status}
                          {response.contentTypes.length > 0
                            ? ` · ${response.contentTypes.join(", ")}`
                            : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {operation.issueCodes.map((issue) => (
                  <p
                    className="mt-2 break-words text-xs font-semibold text-amber-800"
                    key={issue}
                  >
                    {getIssueMessage(issue, operation)}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {filteredOperations.length > OPERATION_PREVIEW_LIMIT ? (
            <button
              className="mt-2 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? t("workspace.eventShowLess")
                : t("workspace.eventShowAll", {
                    count: String(filteredOperations.length),
                  })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
