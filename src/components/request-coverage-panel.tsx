"use client";

import { memo, useMemo, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { EndpointSummary } from "@/lib/openapi";
import {
  createRequestCoverageReport,
  filterRequestCoverageRecords,
  type RequestCoverageState,
  type RequestCoverageWindow,
} from "@/lib/request-coverage";
import { downloadRequestCoverageFile } from "@/lib/request-coverage-export";
import {
  parseRequestHistory,
  REQUEST_HISTORY_CHANGED_EVENT,
  REQUEST_HISTORY_STORAGE_KEY,
} from "@/lib/request-history";
import type { TranslationKey } from "@/lib/translations";

type CoverageScope = "all" | "visible";
type CoverageFilter = "all" | "attention" | RequestCoverageState;
type ExportStatus = "error" | "idle" | "success";

const OPERATION_PREVIEW_LIMIT = 8;
const EMPTY_HISTORY_SNAPSHOT = "";

const methodClasses: Record<string, string> = {
  DELETE: "bg-red-100 text-red-700",
  GET: "bg-emerald-100 text-emerald-800",
  HEAD: "bg-teal-100 text-teal-800",
  OPTIONS: "bg-slate-100 text-slate-700",
  PATCH: "bg-amber-100 text-amber-800",
  POST: "bg-sky-100 text-sky-800",
  PUT: "bg-violet-100 text-violet-800",
  TRACE: "bg-pink-100 text-pink-800",
};

const stateClasses: Record<RequestCoverageState, string> = {
  covered: "bg-emerald-100 text-emerald-800",
  failing: "bg-red-100 text-red-700",
  undocumented: "bg-amber-100 text-amber-800",
  untested: "bg-slate-100 text-slate-700",
};

const stateTranslationKeys: Record<RequestCoverageState, TranslationKey> = {
  covered: "workspace.coverageStateCovered",
  failing: "workspace.coverageStateFailing",
  undocumented: "workspace.coverageStateUndocumented",
  untested: "workspace.coverageStateUntested",
};

function matchesFilter(state: RequestCoverageState, filter: CoverageFilter) {
  if (filter === "all") return true;
  if (filter === "attention") return state !== "covered";
  return state === filter;
}

function readHistorySnapshot() {
  try {
    return window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY) ?? "";
  } catch {
    return EMPTY_HISTORY_SNAPSHOT;
  }
}

function readServerHistorySnapshot() {
  return EMPTY_HISTORY_SNAPSHOT;
}

function subscribeToHistory(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (!event.key || event.key === REQUEST_HISTORY_STORAGE_KEY) {
      onStoreChange();
    }
  }

  window.addEventListener(REQUEST_HISTORY_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(REQUEST_HISTORY_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export const RequestCoveragePanel = memo(function RequestCoveragePanel({
  allEndpoints,
  onSelectEndpoint,
  schema,
  visibleEndpoints,
}: {
  allEndpoints: EndpointSummary[];
  onSelectEndpoint: (method: string, path: string) => void;
  schema: { title: string; version: string };
  visibleEndpoints: EndpointSummary[];
}) {
  const { language, t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<CoverageFilter>("attention");
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [scope, setScope] = useState<CoverageScope>("all");
  const [showAll, setShowAll] = useState(false);
  const [historyWindow, setHistoryWindow] =
    useState<RequestCoverageWindow>("all");

  const historySnapshot = useSyncExternalStore(
    subscribeToHistory,
    readHistorySnapshot,
    readServerHistorySnapshot,
  );
  const history = useMemo(() => {
    void refreshRevision;
    return parseRequestHistory(historySnapshot);
  }, [historySnapshot, refreshRevision]);

  const sourceEndpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const recentHistory = useMemo(
    () => filterRequestCoverageRecords(history, historyWindow),
    [history, historyWindow],
  );
  const report = useMemo(
    () => createRequestCoverageReport(sourceEndpoints, recentHistory),
    [recentHistory, sourceEndpoints],
  );
  const attentionCount =
    report.failingOperationCount +
    report.undocumentedOperationCount +
    report.untestedOperationCount;
  const filters: Array<{
    count: number;
    label: TranslationKey;
    value: CoverageFilter;
  }> = [
    {
      count: report.operationCount,
      label: "workspace.coverageFilterAll",
      value: "all",
    },
    {
      count: attentionCount,
      label: "workspace.coverageFilterAttention",
      value: "attention",
    },
    {
      count: report.untestedOperationCount,
      label: "workspace.coverageFilterUntested",
      value: "untested",
    },
    {
      count: report.failingOperationCount,
      label: "workspace.coverageFilterFailing",
      value: "failing",
    },
    {
      count: report.undocumentedOperationCount,
      label: "workspace.coverageFilterUndocumented",
      value: "undocumented",
    },
    {
      count: report.coveredOperationCount,
      label: "workspace.coverageFilterCovered",
      value: "covered",
    },
  ];
  const filteredOperations = report.operations.filter((operation) =>
    matchesFilter(operation.state, activeFilter),
  );
  const displayedOperations = showAll
    ? filteredOperations
    : filteredOperations.slice(0, OPERATION_PREVIEW_LIMIT);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [language],
  );

  function resetView() {
    setShowAll(false);
    setExportStatus("idle");
  }

  function handleExport() {
    setExportStatus(
      downloadRequestCoverageFile(report, schema, historyWindow)
        ? "success"
        : "error",
    );
  }

  function formatLatestDate(value: string | null) {
    if (!value) return t("workspace.coverageNeverRun");

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? t("workspace.coverageUnknownDate")
      : dateFormatter.format(date);
  }

  return (
    <section
      aria-labelledby="request-coverage-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="request-coverage-title"
            >
              {t("workspace.coverageTitle")}
            </h3>
            <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-800">
              {t("workspace.coverageBadge", {
                percentage: String(report.endpointCoveragePercentage),
              })}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.coverageSummary", {
              matched: String(report.requestCount),
              saved: String(recentHistory.length),
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
            {t("workspace.coverageScope")}
            <select
              aria-label={t("workspace.coverageScope")}
              className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as CoverageScope);
                resetView();
              }}
            >
              <option value="all">
                {t("workspace.coverageScopeAll", {
                  count: String(allEndpoints.length),
                })}
              </option>
              <option value="visible">
                {t("workspace.coverageScopeVisible", {
                  count: String(visibleEndpoints.length),
                })}
              </option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
            {t("workspace.coverageWindow")}
            <select
              aria-label={t("workspace.coverageWindow")}
              className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              value={historyWindow}
              onChange={(event) => {
                setHistoryWindow(event.target.value as RequestCoverageWindow);
                resetView();
              }}
            >
              <option value="all">{t("workspace.coverageWindowAll")}</option>
              <option value="24h">{t("workspace.coverageWindowDay")}</option>
              <option value="7d">{t("workspace.coverageWindowWeek")}</option>
            </select>
          </label>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            type="button"
            onClick={() => setRefreshRevision((current) => current + 1)}
          >
            {t("workspace.coverageRefresh")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleExport}
          >
            {t("workspace.coverageExport")}
          </button>
        </div>
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
              ? "workspace.coverageExportError"
              : "workspace.coverageExportSuccess",
          )}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {[
          [
            "workspace.coverageStatOperations",
            `${report.testedOperationCount}/${report.operationCount}`,
          ],
          [
            "workspace.coverageStatResponses",
            `${report.testedStatusVariantCount}/${report.statusVariantCount}`,
          ],
          ["workspace.coverageStatRequests", report.requestCount],
          ["workspace.coverageStatFailures", report.failedRequestCount],
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

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-[color:var(--color-brand-muted)]">
            <span>{t("workspace.coverageOperationProgress")}</span>
            <span>{report.endpointCoveragePercentage}%</span>
          </div>
          <div
            aria-label={t("workspace.coverageOperationProgress")}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={report.endpointCoveragePercentage}
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
          >
            <div
              className="h-full bg-emerald-600 transition-[width]"
              style={{ width: `${report.endpointCoveragePercentage}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-[color:var(--color-brand-muted)]">
            <span>{t("workspace.coverageResponseProgress")}</span>
            <span>{report.responseCoveragePercentage}%</span>
          </div>
          <div
            aria-label={t("workspace.coverageResponseProgress")}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={report.responseCoveragePercentage}
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
          >
            <div
              className="h-full bg-sky-600 transition-[width]"
              style={{ width: `${report.responseCoveragePercentage}%` }}
            />
          </div>
        </div>
      </div>

      <div
        aria-label={t("workspace.coverageFilterLabel")}
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
            onClick={() => {
              setActiveFilter(filter.value);
              setShowAll(false);
            }}
          >
            {t(filter.label, { count: String(filter.count) })}
          </button>
        ))}
      </div>

      {history.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
          {t("workspace.coverageNoHistory")}
        </p>
      ) : null}

      {filteredOperations.length === 0 ? (
        <p
          className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.coverageNoFilteredOperations")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[color:var(--color-brand-border)] border-y border-[color:var(--color-brand-border)]">
          {displayedOperations.map((operation) => (
            <li className="py-3" key={`${operation.method}:${operation.path}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code
                      className={`break-all rounded-md px-2 py-1 text-xs font-extrabold ${
                        methodClasses[operation.method] ??
                        "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {operation.method} {operation.path}
                    </code>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-extrabold ${stateClasses[operation.state]}`}
                    >
                      {t(stateTranslationKeys[operation.state])}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm font-bold text-[color:var(--color-brand-navy)]">
                    {t("workspace.coverageOperationSummary", {
                      summary: operation.summary,
                    })}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                    {t("workspace.coverageOperationDetails", {
                      attempts: String(operation.attempts),
                      duration: String(operation.averageDurationMs),
                      latest: formatLatestDate(operation.latestCreatedAt),
                    })}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                      {t("workspace.coverageObservedStatuses")}
                    </span>
                    {operation.observedStatuses.length === 0 ? (
                      <span className="text-xs font-semibold text-[color:var(--color-brand-muted)]">
                        {t("workspace.none")}
                      </span>
                    ) : (
                      operation.observedStatuses.map((status) => (
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-extrabold ${
                            operation.undocumentedStatuses.includes(status)
                              ? "bg-amber-100 text-amber-800"
                              : status >= 400 || status === 0
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                          key={status}
                        >
                          {status === 0
                            ? t("workspace.coverageTransportError")
                            : `HTTP ${status}`}
                        </span>
                      ))
                    )}
                    <span className="text-xs font-semibold text-[color:var(--color-brand-muted)]">
                      {t("workspace.coverageDocumentedResponses", {
                        observed: String(
                          operation.observedDocumentedResponses.length,
                        ),
                        total: String(operation.documentedResponseCount),
                      })}
                    </span>
                  </div>
                </div>
                <button
                  className="h-9 shrink-0 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                  type="button"
                  onClick={() =>
                    onSelectEndpoint(operation.method, operation.path)
                  }
                >
                  {t("workspace.coverageViewEndpoint")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {filteredOperations.length > OPERATION_PREVIEW_LIMIT ? (
        <button
          className="mt-3 h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
          type="button"
          onClick={() => setShowAll((current) => !current)}
        >
          {t(
            showAll
              ? "workspace.coverageShowLess"
              : "workspace.coverageShowAll",
            { count: String(filteredOperations.length) },
          )}
        </button>
      ) : null}
    </section>
  );
});
