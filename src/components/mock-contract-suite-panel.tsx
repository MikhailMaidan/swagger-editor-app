"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  createMockContractSuite,
  type MockContractSuiteCaseResult,
  type MockContractSuiteReport,
} from "@/lib/mock-contract-suite";
import { downloadMockContractSuiteFile } from "@/lib/mock-contract-suite-export";
import type { EndpointSummary } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";

type SuiteFilter = "all" | MockContractSuiteCaseResult;
type SuiteScope = "all" | "visible";
type ExportStatus = "error" | "idle" | "success";

const CASE_PREVIEW_LIMIT = 8;

const resultClasses: Record<MockContractSuiteCaseResult, string> = {
  fail: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-800",
  pass: "bg-emerald-100 text-emerald-800",
};

const resultTranslationKeys: Record<
  MockContractSuiteCaseResult,
  TranslationKey
> = {
  fail: "workspace.mockSuiteResultFailed",
  partial: "workspace.mockSuiteResultPartial",
  pass: "workspace.mockSuiteResultPassed",
};

const bodySourceTranslationKeys = {
  documented: "workspace.mockSuiteBodyDocumented",
  generated: "workspace.mockSuiteBodyGenerated",
  none: "workspace.mockSuiteBodyNone",
} satisfies Record<string, TranslationKey>;

export function MockContractSuitePanel({
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
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<SuiteFilter>("all");
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [report, setReport] = useState<MockContractSuiteReport | null>(null);
  const [scope, setScope] = useState<SuiteScope>("visible");
  const [showAll, setShowAll] = useState(false);
  const sourceEndpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const filteredCases = (report?.cases ?? []).filter(
    (item) => activeFilter === "all" || item.result === activeFilter,
  );
  const visibleCases = showAll
    ? filteredCases
    : filteredCases.slice(0, CASE_PREVIEW_LIMIT);
  const filters: Array<{
    count: number;
    label: TranslationKey;
    value: SuiteFilter;
  }> = [
    {
      count: report?.totalCount ?? 0,
      label: "workspace.mockSuiteFilterAll",
      value: "all",
    },
    {
      count: report?.passedCount ?? 0,
      label: "workspace.mockSuiteFilterPassed",
      value: "pass",
    },
    {
      count: report?.partialCount ?? 0,
      label: "workspace.mockSuiteFilterPartial",
      value: "partial",
    },
    {
      count: report?.failedCount ?? 0,
      label: "workspace.mockSuiteFilterFailed",
      value: "fail",
    },
  ];

  function handleRun() {
    if (sourceEndpoints.length === 0) {
      return;
    }

    setReport(createMockContractSuite(sourceEndpoints));
    setActiveFilter("all");
    setExportStatus("idle");
    setShowAll(false);
  }

  function handleFilterChange(filter: SuiteFilter) {
    setActiveFilter(filter);
    setShowAll(false);
  }

  function handleExport() {
    if (!report) {
      return;
    }

    setExportStatus(
      downloadMockContractSuiteFile(report, schema) ? "success" : "error",
    );
  }

  return (
    <section
      aria-labelledby="mock-contract-suite-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3
          className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
          id="mock-contract-suite-title"
        >
          {t("workspace.mockSuiteTitle")}
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
            {t("workspace.mockSuiteScope")}
            <select
              aria-label={t("workspace.mockSuiteScope")}
              className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              value={scope}
              onChange={(event) => setScope(event.target.value as SuiteScope)}
            >
              <option value="visible">
                {t("workspace.mockSuiteScopeVisible", {
                  count: String(visibleEndpoints.length),
                })}
              </option>
              <option value="all">
                {t("workspace.mockSuiteScopeAll", {
                  count: String(allEndpoints.length),
                })}
              </option>
            </select>
          </label>
          <button
            className="h-9 rounded-md bg-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-white transition hover:bg-[#4a23d7] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={sourceEndpoints.length === 0}
            type="button"
            onClick={handleRun}
          >
            {t("workspace.mockSuiteRun")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!report}
            type="button"
            onClick={handleExport}
          >
            {t("workspace.mockSuiteExport")}
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
              ? "workspace.mockSuiteExportError"
              : "workspace.mockSuiteExportSuccess",
          )}
        </p>
      ) : null}

      {report ? (
        <>
          <div
            aria-label={t("workspace.mockSuiteResults")}
            className="mt-4 grid grid-cols-2 border-y border-[color:var(--color-brand-border)] sm:grid-cols-4"
          >
            {[
              ["workspace.mockSuiteTotal", report.totalCount],
              ["workspace.mockSuitePassed", report.passedCount],
              ["workspace.mockSuitePartial", report.partialCount],
              ["workspace.mockSuiteFailed", report.failedCount],
            ].map(([label, count], index) => (
              <div
                className={`border-[color:var(--color-brand-border)] px-3 py-3 ${
                  index % 2 === 1 ? "border-l" : ""
                } ${index >= 2 ? "border-t sm:border-t-0" : ""} ${
                  index > 0 ? "sm:border-l" : ""
                }`}
                key={label}
              >
                <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                  {t(label as TranslationKey)}
                </p>
                <p className="mt-1 text-xl font-extrabold text-[color:var(--color-brand-navy)]">
                  {count}
                </p>
              </div>
            ))}
          </div>

          <div
            aria-label={t("workspace.mockSuiteFilterLabel")}
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

          {filteredCases.length === 0 ? (
            <p
              className="mt-4 text-sm font-bold text-[color:var(--color-brand-muted)]"
              role="status"
            >
              {t("workspace.mockSuiteNoFilteredResults")}
            </p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-[color:var(--color-brand-border)]">
                {visibleCases.map((item) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-extrabold ${resultClasses[item.result]}`}
                        >
                          {t(resultTranslationKeys[item.result])}
                        </span>
                        <code className="break-all text-xs font-bold text-[color:var(--color-brand-navy)]">
                          {item.method} {item.path}
                        </code>
                        <span className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                          {t("workspace.mockSuiteResponse", {
                            status: item.documentedStatus || item.actualStatus,
                          })}
                        </span>
                        {item.contentType ? (
                          <code className="break-all text-xs text-[color:var(--color-brand-muted)]">
                            {item.contentType}
                          </code>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                        {t("workspace.mockSuiteChecks", {
                          failed: String(item.report.failedCount),
                          passed: String(item.report.passedCount),
                          skipped: String(item.skippedCount),
                        })}{" "}
                        {t(bodySourceTranslationKeys[item.bodySource])}
                      </p>
                    </div>
                    <button
                      className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:border-[color:var(--color-brand-purple)] hover:bg-[color:var(--color-brand-soft)]"
                      type="button"
                      onClick={() => onSelectEndpoint(item.method, item.path)}
                    >
                      {t("workspace.auditViewEndpoint")}
                    </button>
                  </li>
                ))}
              </ul>
              {filteredCases.length > CASE_PREVIEW_LIMIT ? (
                <button
                  className="mt-2 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
                  type="button"
                  onClick={() => setShowAll((current) => !current)}
                >
                  {showAll
                    ? t("workspace.auditShowLess")
                    : t("workspace.auditShowAll", {
                        count: String(filteredCases.length),
                      })}
                </button>
              ) : null}
            </>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm font-bold text-[color:var(--color-brand-muted)]">
          {t(
            sourceEndpoints.length > 0
              ? "workspace.mockSuiteEmpty"
              : "workspace.mockSuiteNoEndpoints",
          )}
        </p>
      )}
    </section>
  );
}
