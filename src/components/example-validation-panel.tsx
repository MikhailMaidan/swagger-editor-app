"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  getExampleConformancePercentage,
  type ExampleValidationEntry,
  type ExampleValidationKind,
  type ExampleValidationReport,
  type ExampleValidationStatus,
} from "@/lib/example-validation";
import {
  createExampleValidationMarkdown,
  downloadExampleValidationFile,
  exampleKindTranslationKeys,
  exampleSkipReasonTranslationKeys,
  exampleStatusTranslationKeys,
  formatExampleIssue,
  getExampleDisplayName,
} from "@/lib/example-validation-export";
import { isCancelRequestShortcut } from "@/lib/keyboard-shortcut";
import type { TranslationKey } from "@/lib/translations";

type StatusFilter = "all" | ExampleValidationStatus;
type KindFilter = "all" | ExampleValidationKind;
type ActionStatus =
  | "copy-error"
  | "copy-success"
  | "export-error"
  | "export-success"
  | "idle"
  | "reveal-error";

const ENTRY_PREVIEW_LIMIT = 8;

const statusPriority: Record<ExampleValidationStatus, number> = {
  invalid: 0,
  warning: 1,
  skipped: 2,
  valid: 3,
};

const statusClasses: Record<ExampleValidationStatus, string> = {
  invalid: "bg-red-100 text-red-700",
  skipped: "bg-slate-100 text-slate-600",
  valid: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
};

const statusAccentClasses: Record<ExampleValidationStatus, string> = {
  invalid: "border-l-red-400",
  skipped: "border-l-slate-300",
  valid: "border-l-emerald-400",
  warning: "border-l-amber-400",
};

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

const kindFilterTranslationKeys: Record<ExampleValidationKind, TranslationKey> =
  {
    header: "workspace.examplesKindHeader",
    parameter: "workspace.examplesKindParameter",
    "request-body": "workspace.examplesKindRequestBody",
    response: "workspace.examplesKindResponse",
    schema: "workspace.examplesKindSchema",
  };

function getConformanceClasses(report: ExampleValidationReport) {
  if (report.invalidCount > 0) {
    return "bg-red-100 text-red-700";
  }

  return report.warningCount > 0
    ? "bg-amber-100 text-amber-800"
    : "bg-emerald-100 text-emerald-800";
}

function matchesSearch(entry: ExampleValidationEntry, terms: string[]) {
  if (terms.length === 0) {
    return true;
  }

  const haystack = [
    entry.method,
    entry.path,
    entry.label,
    entry.exampleName,
    entry.mediaType,
    entry.pointer,
  ]
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

export function ExampleValidationPanel({
  onRevealExample,
  onSelectEndpoint,
  report,
  schema,
}: {
  onRevealExample: (pointer: string) => boolean;
  onSelectEndpoint: (method: string, path: string) => void;
  report: ExampleValidationReport;
  schema: { title: string; version: string };
}) {
  const { language, t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const conformancePercentage = getExampleConformancePercentage(report);
  const kindOptions = useMemo(
    () =>
      (
        Object.keys(kindFilterTranslationKeys) as ExampleValidationKind[]
      ).filter((kind) => report.entries.some((entry) => entry.kind === kind)),
    [report.entries],
  );
  const filteredEntries = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return report.entries
      .filter(
        (entry) =>
          (statusFilter === "all" || entry.status === statusFilter) &&
          (kindFilter === "all" || entry.kind === kindFilter) &&
          matchesSearch(entry, terms),
      )
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          statusPriority[left.entry.status] -
            statusPriority[right.entry.status] || left.index - right.index,
      )
      .map(({ entry }) => entry);
  }, [kindFilter, query, report.entries, statusFilter]);
  const visibleEntries = showAll
    ? filteredEntries
    : filteredEntries.slice(0, ENTRY_PREVIEW_LIMIT);
  const statusFilters: Array<{
    count: number;
    label: TranslationKey;
    value: StatusFilter;
  }> = [
    {
      count: report.totalCount,
      label: "workspace.examplesFilterAll",
      value: "all",
    },
    {
      count: report.invalidCount,
      label: "workspace.examplesFilterInvalid",
      value: "invalid",
    },
    {
      count: report.warningCount,
      label: "workspace.examplesFilterWarning",
      value: "warning",
    },
    {
      count: report.validCount,
      label: "workspace.examplesFilterValid",
      value: "valid",
    },
    {
      count: report.skippedCount,
      label: "workspace.examplesFilterSkipped",
      value: "skipped",
    },
  ];
  const breakdown: Array<{
    className: string;
    count: number;
    label: TranslationKey;
    status: ExampleValidationStatus;
  }> = [
    {
      className: "bg-emerald-500",
      count: report.validCount,
      label: "workspace.examplesStatValid",
      status: "valid",
    },
    {
      className: "bg-amber-400",
      count: report.warningCount,
      label: "workspace.examplesStatWarning",
      status: "warning",
    },
    {
      className: "bg-red-500",
      count: report.invalidCount,
      label: "workspace.examplesStatInvalid",
      status: "invalid",
    },
    {
      className: "bg-slate-300",
      count: report.skippedCount,
      label: "workspace.examplesStatSkipped",
      status: "skipped",
    },
  ];

  function resetPaging() {
    setShowAll(false);
  }

  async function handleCopy() {
    const copied = await writeTextToClipboard(
      createExampleValidationMarkdown(report, schema, language),
    );

    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  function handleExport() {
    const downloaded = downloadExampleValidationFile(report, schema);

    setActionStatus(downloaded ? "export-success" : "export-error");
  }

  function handleReveal(entry: ExampleValidationEntry) {
    const revealed = onRevealExample(entry.pointer);

    setActionStatus(revealed ? "idle" : "reveal-error");
  }

  return (
    <section
      aria-labelledby="example-validation-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="example-validation-title"
            >
              {t("workspace.examplesTitle")}
            </h3>
            <span
              className={`rounded-md px-3 py-1 text-sm font-extrabold ${getConformanceClasses(report)}`}
            >
              {t("workspace.examplesConformance", {
                percentage: String(conformancePercentage),
              })}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-[color:var(--color-brand-muted)]">
            {t("workspace.examplesDescription")}
          </p>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.examplesSummary", {
              invalid: String(report.invalidCount),
              skipped: String(report.skippedCount),
              total: String(report.totalCount),
              warnings: String(report.warningCount),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            type="button"
            onClick={handleCopy}
          >
            {t("workspace.examplesCopy")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleExport}
          >
            {t("workspace.examplesExport")}
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
              ? "workspace.examplesCopyError"
              : actionStatus === "copy-success"
                ? "workspace.examplesCopySuccess"
                : actionStatus === "export-error"
                  ? "workspace.examplesExportError"
                  : actionStatus === "export-success"
                    ? "workspace.examplesExportSuccess"
                    : "workspace.examplesRevealError",
          )}
        </p>
      ) : null}

      {report.truncated ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {t("workspace.examplesTruncated")}
        </p>
      ) : null}

      <div
        aria-label={t("workspace.examplesProgressLabel", {
          invalid: String(report.invalidCount),
          skipped: String(report.skippedCount),
          valid: String(report.validCount),
          warnings: String(report.warningCount),
        })}
        className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-brand-soft)]"
        role="img"
      >
        {breakdown.map((segment) =>
          segment.count > 0 && report.totalCount > 0 ? (
            <span
              className={`h-full transition-[width] duration-300 ${segment.className}`}
              key={segment.status}
              style={{
                width: `${(segment.count / report.totalCount) * 100}%`,
              }}
            />
          ) : null,
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {breakdown.map((segment) => (
          <button
            aria-pressed={statusFilter === segment.status}
            className={`min-w-0 p-3 text-left transition ${
              statusFilter === segment.status
                ? "bg-[color:var(--color-brand-soft)]"
                : "bg-white hover:bg-[#fbfaff]"
            }`}
            key={segment.status}
            type="button"
            onClick={() => {
              setStatusFilter((current) =>
                current === segment.status ? "all" : segment.status,
              );
              resetPaging();
            }}
          >
            <span className="flex items-center gap-2 text-xs font-bold text-[color:var(--color-brand-muted)]">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${segment.className}`}
              />
              {t(segment.label)}
            </span>
            <span className="mt-1 block text-xl font-extrabold text-[color:var(--color-brand-navy)]">
              {segment.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div
          aria-label={t("workspace.examplesStatusFilterLabel")}
          className="flex flex-1 flex-wrap gap-2"
          role="group"
        >
          {statusFilters.map((filter) => (
            <button
              aria-pressed={statusFilter === filter.value}
              className={`h-9 rounded-md px-3 text-xs font-extrabold transition ${
                statusFilter === filter.value
                  ? "bg-[color:var(--color-brand-navy)] text-white"
                  : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              }`}
              key={filter.value}
              type="button"
              onClick={() => {
                setStatusFilter(filter.value);
                resetPaging();
              }}
            >
              {t(filter.label, { count: String(filter.count) })}
            </button>
          ))}
        </div>
        {kindOptions.length > 1 ? (
          <label className="grid min-w-[11rem] gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
            {t("workspace.examplesKindFilterLabel")}
            <select
              className="h-9 min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              value={kindFilter}
              onChange={(event) => {
                setKindFilter(event.target.value as KindFilter);
                resetPaging();
              }}
            >
              <option value="all">{t("workspace.examplesKindAll")}</option>
              {kindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {t(kindFilterTranslationKeys[kind])}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <input
        aria-label={t("workspace.examplesSearchLabel")}
        className="mt-3 h-10 w-full rounded-lg border border-[color:var(--color-brand-border)] bg-[#fbfaff] px-3 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
        placeholder={t("workspace.examplesSearchPlaceholder")}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          resetPaging();
        }}
        onKeyDown={(event) => {
          if (
            query &&
            !event.nativeEvent.isComposing &&
            isCancelRequestShortcut(event)
          ) {
            event.preventDefault();
            event.stopPropagation();
            setQuery("");
            resetPaging();
          }
        }}
      />

      {report.invalidCount === 0 &&
      report.warningCount === 0 &&
      report.validCount > 0 ? (
        <p className="mt-3 text-sm font-bold text-emerald-700">
          {t("workspace.examplesAllClear")}
        </p>
      ) : null}

      {filteredEntries.length === 0 ? (
        <p
          className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.examplesNoMatches")}
        </p>
      ) : (
        <>
          <ul className="mt-3 grid gap-2">
            {visibleEntries.map((entry) => {
              const displayName = getExampleDisplayName(entry, t);

              return (
                <li
                  className={`rounded-lg border border-l-4 border-[color:var(--color-brand-border)] bg-white p-3 ${statusAccentClasses[entry.status]}`}
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-extrabold ${statusClasses[entry.status]}`}
                        >
                          {t(exampleStatusTranslationKeys[entry.status])}
                        </span>
                        <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-extrabold text-violet-800">
                          {t(exampleKindTranslationKeys[entry.kind])}
                        </span>
                        {entry.method ? (
                          <code
                            className={`break-all rounded-md px-2 py-1 text-xs font-extrabold ${
                              methodClasses[entry.method] ??
                              "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {entry.method} {entry.path}
                          </code>
                        ) : null}
                      </div>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
                        <code className="break-all">{entry.label}</code>
                        <span className="rounded-full bg-[color:var(--color-brand-soft)] px-2 py-0.5 text-xs font-extrabold text-[color:var(--color-brand-purple)]">
                          {displayName}
                        </span>
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-[color:var(--color-brand-muted)]">
                        {entry.pointer}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        aria-label={t("workspace.examplesRevealAriaLabel", {
                          location: entry.label,
                          name: displayName,
                        })}
                        className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                        type="button"
                        onClick={() => handleReveal(entry)}
                      >
                        {t("workspace.examplesRevealInEditor")}
                      </button>
                      {entry.method ? (
                        <button
                          aria-label={t(
                            "workspace.examplesOpenEndpointAriaLabel",
                            { method: entry.method, path: entry.path },
                          )}
                          className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:border-[color:var(--color-brand-purple)] hover:bg-[color:var(--color-brand-soft)]"
                          type="button"
                          onClick={() =>
                            onSelectEndpoint(entry.method, entry.path)
                          }
                        >
                          {t("workspace.examplesOpenEndpoint")}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {entry.skipReason ? (
                    <p className="mt-2 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                      {t(exampleSkipReasonTranslationKeys[entry.skipReason])}
                    </p>
                  ) : null}

                  {entry.issues.length > 0 ? (
                    <ul className="mt-2 grid gap-1">
                      {entry.issues.map((issue, index) => (
                        <li
                          className={`flex flex-wrap items-baseline gap-2 text-xs font-semibold ${
                            issue.severity === "error"
                              ? "text-red-700"
                              : "text-amber-800"
                          }`}
                          key={`${issue.keyword}-${issue.instancePath}-${index}`}
                        >
                          <code className="rounded bg-[color:var(--color-brand-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--color-brand-navy)]">
                            {issue.instancePath || t("workspace.examplesRoot")}
                          </code>
                          <span className="min-w-0 break-words">
                            {formatExampleIssue(issue, t)}
                          </span>
                        </li>
                      ))}
                      {entry.hiddenIssueCount > 0 ? (
                        <li className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                          {t("workspace.examplesHiddenIssues", {
                            count: String(entry.hiddenIssueCount),
                          })}
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {filteredEntries.length > ENTRY_PREVIEW_LIMIT ? (
            <button
              className="mt-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? t("workspace.examplesShowLess")
                : t("workspace.examplesShowAll", {
                    count: String(filteredEntries.length),
                  })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
