"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatEuropeanDateTime } from "@/lib/date-format";
import type { EndpointParameter } from "@/lib/openapi";
import type {
  SchemaChangeDetail,
  SchemaChangeDetailCode,
  SchemaChangeReport,
  SchemaEndpointChangeKind,
} from "@/lib/schema-change";
import { downloadSchemaChangeFile } from "@/lib/schema-change-export";
import type { SchemaComparisonBaseline } from "@/lib/schema-comparison-baseline";
import type { TranslationKey } from "@/lib/translations";

type ChangeFilter = "added" | "all" | "breaking" | "modified" | "removed";

const CHANGE_PREVIEW_LIMIT = 8;
const DETAIL_PREVIEW_LIMIT = 4;

const detailTranslationKeys: Record<SchemaChangeDetailCode, TranslationKey> = {
  deprecated: "workspace.changeDetailDeprecated",
  "documentation-changed": "workspace.changeDetailDocumentationChanged",
  "operation-id-added": "workspace.changeDetailOperationIdAdded",
  "operation-id-changed": "workspace.changeDetailOperationIdChanged",
  "operation-id-removed": "workspace.changeDetailOperationIdRemoved",
  "optional-parameter-added": "workspace.changeDetailOptionalParameterAdded",
  "parameter-became-optional": "workspace.changeDetailParameterBecameOptional",
  "parameter-became-required": "workspace.changeDetailParameterBecameRequired",
  "parameter-removed": "workspace.changeDetailParameterRemoved",
  "request-body-added": "workspace.changeDetailRequestBodyAdded",
  "request-body-became-optional":
    "workspace.changeDetailRequestBodyBecameOptional",
  "request-body-became-required":
    "workspace.changeDetailRequestBodyBecameRequired",
  "request-body-removed": "workspace.changeDetailRequestBodyRemoved",
  "required-parameter-added": "workspace.changeDetailRequiredParameterAdded",
  "response-added": "workspace.changeDetailResponseAdded",
  "response-removed": "workspace.changeDetailResponseRemoved",
  "security-added": "workspace.changeDetailSecurityAdded",
  "security-removed": "workspace.changeDetailSecurityRemoved",
  "tags-changed": "workspace.changeDetailTagsChanged",
  undeprecated: "workspace.changeDetailUndeprecated",
};

const locationTranslationKeys: Record<
  EndpointParameter["location"],
  TranslationKey
> = {
  cookie: "workspace.cookie",
  header: "workspace.header",
  path: "workspace.path",
  query: "workspace.query",
};

const kindTranslationKeys: Record<SchemaEndpointChangeKind, TranslationKey> = {
  added: "workspace.changeAddedLabel",
  modified: "workspace.changeModifiedLabel",
  removed: "workspace.changeRemovedLabel",
};

const kindClasses: Record<SchemaEndpointChangeKind, string> = {
  added: "bg-emerald-100 text-emerald-800",
  modified: "bg-amber-100 text-amber-800",
  removed: "bg-red-100 text-red-700",
};

export function SchemaChangePanel({
  baseline,
  captureError,
  current,
  onClearBaseline,
  onSetBaseline,
  report,
  storageError,
}: {
  baseline: SchemaComparisonBaseline | null;
  captureError: boolean;
  current: { title: string; version: string };
  onClearBaseline: () => void;
  onSetBaseline: () => void;
  report: SchemaChangeReport | null;
  storageError: boolean;
}) {
  const { language, t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<ChangeFilter>("all");
  const [exportStatus, setExportStatus] = useState<
    "error" | "idle" | "success"
  >("idle");
  const [showAll, setShowAll] = useState(false);
  const changes = report?.changes ?? [];
  const filteredChanges = changes.filter((change) => {
    if (activeFilter === "all") {
      return true;
    }

    if (activeFilter === "breaking") {
      return change.impact === "breaking";
    }

    return change.kind === activeFilter;
  });
  const visibleChanges = showAll
    ? filteredChanges
    : filteredChanges.slice(0, CHANGE_PREVIEW_LIMIT);
  const filters: Array<{
    count: number;
    label: TranslationKey;
    value: ChangeFilter;
  }> = [
    {
      count: changes.length,
      label: "workspace.changeFilterAll",
      value: "all",
    },
    {
      count: report?.breakingCount ?? 0,
      label: "workspace.changeFilterBreaking",
      value: "breaking",
    },
    {
      count: report?.addedCount ?? 0,
      label: "workspace.changeFilterAdded",
      value: "added",
    },
    {
      count: report?.removedCount ?? 0,
      label: "workspace.changeFilterRemoved",
      value: "removed",
    },
    {
      count: report?.modifiedCount ?? 0,
      label: "workspace.changeFilterModified",
      value: "modified",
    },
  ];

  function handleFilterChange(filter: ChangeFilter) {
    setActiveFilter(filter);
    setShowAll(false);
  }

  function handleSetBaseline() {
    setActiveFilter("all");
    setExportStatus("idle");
    setShowAll(false);
    onSetBaseline();
  }

  function handleClearBaseline() {
    setActiveFilter("all");
    setExportStatus("idle");
    setShowAll(false);
    onClearBaseline();
  }

  function handleExport() {
    if (!baseline || !report) {
      setExportStatus("error");
      return;
    }

    setExportStatus(
      downloadSchemaChangeFile(report, baseline, current) ? "success" : "error",
    );
  }

  function getDetailMessage(detail: SchemaChangeDetail) {
    return t(detailTranslationKeys[detail.code], {
      contentType: detail.contentType ?? "",
      current: detail.current ?? "",
      location: detail.location
        ? t(locationTranslationKeys[detail.location]).toLowerCase()
        : "",
      name: detail.name ?? "",
      previous: detail.previous ?? "",
      status: detail.status ?? "",
    });
  }

  return (
    <section
      aria-labelledby="schema-change-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
            id="schema-change-title"
          >
            {t("workspace.changeTitle")}
          </h3>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {baseline
              ? t("workspace.changeBaseline", {
                  date: formatEuropeanDateTime(baseline.capturedAt, language),
                  title: baseline.title,
                  version: baseline.version,
                })
              : t("workspace.changeNoBaseline")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleSetBaseline}
          >
            {t(
              baseline
                ? "workspace.changeUpdateBaseline"
                : "workspace.changeSetBaseline",
            )}
          </button>
          {baseline ? (
            <>
              <button
                className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="button"
                onClick={handleExport}
              >
                {t("workspace.changeExport")}
              </button>
              <button
                className="h-9 rounded-md border border-red-200 px-3 text-xs font-extrabold text-red-700 transition hover:bg-red-50"
                type="button"
                onClick={handleClearBaseline}
              >
                {t("workspace.changeClearBaseline")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {storageError ? (
        <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
          {t("workspace.changeStorageError")}
        </p>
      ) : null}
      {captureError ? (
        <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
          {t("workspace.changeInvalidBaseline")}
        </p>
      ) : null}
      {exportStatus !== "idle" ? (
        <p
          className={`mt-2 text-sm font-semibold ${
            exportStatus === "error" ? "text-red-700" : "text-emerald-700"
          }`}
          role={exportStatus === "error" ? "alert" : "status"}
        >
          {t(
            exportStatus === "error"
              ? "workspace.changeExportError"
              : "workspace.changeExportSuccess",
          )}
        </p>
      ) : null}

      {baseline && report ? (
        <>
          <div
            aria-label={t("workspace.changeTitle")}
            className="mt-4 grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-5"
          >
            {[
              {
                label: "workspace.changeBreakingLabel" as const,
                value: report.breakingCount,
              },
              {
                label: "workspace.changeAddedLabel" as const,
                value: report.addedCount,
              },
              {
                label: "workspace.changeRemovedLabel" as const,
                value: report.removedCount,
              },
              {
                label: "workspace.changeModifiedLabel" as const,
                value: report.modifiedCount,
              },
              {
                label: "workspace.changeUnchangedLabel" as const,
                value: report.unchangedCount,
              },
            ].map((metric) => (
              <div
                className="border-l-2 border-[color:var(--color-brand-border)] pl-3"
                key={metric.label}
              >
                <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                  {t(metric.label)}
                </p>
                <p className="mt-1 text-xl font-extrabold text-[color:var(--color-brand-navy)]">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          <div
            aria-label={t("workspace.changeFilterLabel")}
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

          {filteredChanges.length === 0 ? (
            <p
              className={`mt-4 text-sm font-bold ${
                changes.length === 0
                  ? "text-emerald-700"
                  : "text-[color:var(--color-brand-muted)]"
              }`}
              role="status"
            >
              {t(
                changes.length === 0
                  ? "workspace.changeNoChanges"
                  : "workspace.changeNoFilteredChanges",
              )}
            </p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-[color:var(--color-brand-border)]">
                {visibleChanges.map((change) => (
                  <li
                    className="py-3"
                    key={`${change.kind}-${change.method}-${change.path}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-extrabold ${kindClasses[change.kind]}`}
                      >
                        {t(kindTranslationKeys[change.kind])}
                      </span>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-extrabold ${
                          change.impact === "breaking"
                            ? "bg-red-100 text-red-700"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {t(
                          change.impact === "breaking"
                            ? "workspace.changeImpactBreaking"
                            : "workspace.changeImpactNonBreaking",
                        )}
                      </span>
                      <code className="break-all text-xs font-bold text-[color:var(--color-brand-muted)]">
                        {change.method} {change.path}
                      </code>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[color:var(--color-brand-navy)]">
                      {t(
                        change.kind === "added"
                          ? "workspace.changeEndpointAdded"
                          : change.kind === "removed"
                            ? "workspace.changeEndpointRemoved"
                            : "workspace.changeEndpointModified",
                        { count: String(change.details.length) },
                      )}
                    </p>
                    {change.details.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                        {change.details
                          .slice(0, DETAIL_PREVIEW_LIMIT)
                          .map((detail, detailIndex) => (
                            <li
                              className={
                                detail.impact === "breaking"
                                  ? "text-red-700"
                                  : undefined
                              }
                              key={`${detail.code}-${detail.name ?? detail.status ?? detail.contentType ?? detailIndex}`}
                            >
                              {getDetailMessage(detail)}
                            </li>
                          ))}
                        {change.details.length > DETAIL_PREVIEW_LIMIT ? (
                          <li>
                            {t("workspace.changeMoreDetails", {
                              count: String(
                                change.details.length - DETAIL_PREVIEW_LIMIT,
                              ),
                            })}
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
              {filteredChanges.length > CHANGE_PREVIEW_LIMIT ? (
                <button
                  className="mt-2 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
                  type="button"
                  onClick={() => setShowAll((currentValue) => !currentValue)}
                >
                  {showAll
                    ? t("workspace.changeShowLess")
                    : t("workspace.changeShowAll", {
                        count: String(filteredChanges.length),
                      })}
                </button>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
