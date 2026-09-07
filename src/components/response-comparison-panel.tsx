"use client";

import { memo, useId, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  compareResponses,
  DEFAULT_IGNORED_RESPONSE_HEADERS,
  isComparisonPointer,
  serializeResponseComparison,
  type ComparisonResponse,
  type ResponseDifference,
} from "@/lib/response-comparison";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 font-mono text-xs text-[color:var(--color-brand-navy)]";
const areaLabels: Record<ResponseDifference["area"], TranslationKey> = {
  body: "comparison.body",
  headers: "comparison.headers",
  status: "comparison.status",
};
const kindLabels: Record<ResponseDifference["kind"], TranslationKey> = {
  added: "comparison.added",
  removed: "comparison.removed",
  changed: "comparison.changed",
};

export const ResponseComparisonPanel = memo(function ResponseComparisonPanel({
  response,
  endpoint,
}: {
  response: ComparisonResponse | null;
  endpoint: { method: string; path: string };
}) {
  const { t } = useI18n();
  const id = useId();
  const [baseline, setBaseline] = useState<ComparisonResponse | null>(null);
  const [ignoredPaths, setIgnoredPaths] = useState("");
  const [ignoredHeaders, setIgnoredHeaders] = useState(
    DEFAULT_IGNORED_RESPONSE_HEADERS,
  );
  const [area, setArea] = useState("all");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [includeValues, setIncludeValues] = useState(false);
  const [feedback, setFeedback] = useState<{
    content: string;
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const paths = useMemo(
    () =>
      ignoredPaths
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter(Boolean),
    [ignoredPaths],
  );
  const headers = useMemo(
    () =>
      ignoredHeaders
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    [ignoredHeaders],
  );
  const invalidOptions =
    paths.length > 64 ||
    headers.length > 64 ||
    paths.some((path) => !isComparisonPointer(path));
  const report = useMemo(
    () =>
      baseline && response && !invalidOptions
        ? compareResponses(baseline, response, {
            ignoredBodyPaths: paths,
            ignoredHeaders: headers,
          })
        : null,
    [baseline, response, invalidOptions, paths, headers],
  );
  const reportJson = useMemo(
    () =>
      report
        ? serializeResponseComparison(report, endpoint, includeValues)
        : "",
    [report, endpoint, includeValues],
  );
  const differences =
    report?.differences.filter(
      (difference) =>
        (area === "all" || difference.area === area) &&
        (kind === "all" || difference.kind === kind) &&
        difference.path.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];
  const currentFeedback = feedback?.content === reportJson ? feedback : null;

  function pin() {
    if (!response) return;
    // Copy only response fields. Request bodies, parameters, and URLs are not
    // retained by this workbench, even if the caller supplies a richer object.
    setBaseline({
      body: response.body,
      headers: { ...response.headers },
      status: response.status,
      source: response.source,
      durationMs: response.durationMs,
    });
    setFeedback(null);
  }

  async function copy() {
    if (!reportJson) return;
    const success = await writeTextToClipboard(reportJson);
    setFeedback({
      content: reportJson,
      key: success ? "comparison.copySuccess" : "comparison.copyError",
      error: !success,
    });
  }

  function download() {
    if (!reportJson) return;
    const slug = `${endpoint.method}-${endpoint.path}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 80)
      .replace(/^-+|-+$/g, "");
    const success = downloadTextFile(
      reportJson,
      `rsswag-${slug || "endpoint"}-response-comparison.json`,
      "application/json",
    );
    setFeedback({
      content: reportJson,
      key: success ? "comparison.downloadSuccess" : "comparison.downloadError",
      error: !success,
    });
  }

  if (!response && !baseline) return null;

  return (
    <section
      aria-labelledby={id}
      className="mt-4 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4
            id={id}
            className="text-base font-extrabold text-[color:var(--color-brand-navy)]"
          >
            {t("comparison.title")}
          </h4>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("comparison.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            type="button"
            disabled={!response}
            onClick={pin}
          >
            {t(baseline ? "comparison.replace" : "comparison.pin")}
          </button>
          {baseline && (
            <button
              className={buttonClass}
              type="button"
              onClick={() => {
                setBaseline(null);
                setFeedback(null);
              }}
            >
              {t("comparison.clear")}
            </button>
          )}
        </div>
      </div>
      {baseline && (
        <>
          <p className="mt-3 text-xs font-bold text-[color:var(--color-brand-navy)]">
            {t("comparison.baselineSummary", {
              status: baseline.status,
              source: t(
                baseline.source === "mock"
                  ? "comparison.mock"
                  : "comparison.live",
              ),
            })}
          </p>
          {!response && (
            <p className="mt-2 text-sm text-[color:var(--color-brand-muted)]">
              {t("comparison.awaiting")}
            </p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
              {t("comparison.options")}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                {t("comparison.ignorePaths")}
                <textarea
                  className={inputClass}
                  rows={3}
                  value={ignoredPaths}
                  placeholder="/timestamp"
                  onChange={(event) => setIgnoredPaths(event.target.value)}
                  spellCheck={false}
                  aria-invalid={invalidOptions}
                />
              </label>
              <label className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                {t("comparison.ignoreHeaders")}
                <input
                  className={inputClass}
                  value={ignoredHeaders}
                  onChange={(event) => setIgnoredHeaders(event.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
              {t("comparison.ignoreHelp")}
            </p>
          </details>
          {invalidOptions && (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {t("comparison.invalidOptions")}
            </p>
          )}
          {report && (
            <>
              <p
                className="mt-3 text-sm font-extrabold text-[color:var(--color-brand-navy)]"
                aria-live="polite"
              >
                {t(
                  report.limited
                    ? "comparison.partial"
                    : report.differences.length
                      ? "comparison.differenceCount"
                      : "comparison.identical",
                  { count: String(report.differences.length) },
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                <span>
                  {t("comparison.bodyMode", {
                    mode: t(
                      report.bodyMode === "json"
                        ? "comparison.jsonMode"
                        : report.bodyMode === "text"
                          ? "comparison.textMode"
                          : "comparison.largeMode",
                    ),
                  })}
                </span>
                <span>
                  {t("comparison.latency", {
                    before:
                      report.baseline.durationMs === null
                        ? "—"
                        : String(report.baseline.durationMs),
                    after:
                      report.current.durationMs === null
                        ? "—"
                        : String(report.current.durationMs),
                    delta:
                      report.durationDeltaMs === null
                        ? "—"
                        : `${report.durationDeltaMs > 0 ? "+" : ""}${report.durationDeltaMs}`,
                  })}
                </span>
                <span>
                  {t("comparison.size", {
                    before: String(report.baseline.bodyBytes),
                    after: String(report.current.bodyBytes),
                  })}
                </span>
              </div>
              {baseline.source !== response?.source && (
                <p className="mt-2 text-xs text-amber-800">
                  {t("comparison.mixedModes")}
                </p>
              )}
              {report.bodyMode === "text" && (
                <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
                  {t("comparison.textHelp")}
                </p>
              )}
              {report.limited && (
                <p className="mt-2 text-xs text-amber-800">
                  {t("comparison.limitHelp")}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                  {t("comparison.areaFilter")}
                  <select
                    className={inputClass}
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                  >
                    <option value="all">{t("comparison.allAreas")}</option>
                    {Object.entries(areaLabels).map(([value, key]) => (
                      <option value={value} key={value}>
                        {t(key)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                  {t("comparison.kindFilter")}
                  <select
                    className={inputClass}
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    <option value="all">{t("comparison.allKinds")}</option>
                    {Object.entries(kindLabels).map(([value, key]) => (
                      <option value={value} key={value}>
                        {t(key)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 flex-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
                  {t("comparison.search")}
                  <input
                    className={inputClass}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              {differences.length > 0 ? (
                <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-[color:var(--color-brand-border)]">
                  <table className="w-full text-left text-xs">
                    <caption className="sr-only">
                      {t("comparison.table")}
                    </caption>
                    <thead className="bg-white text-[color:var(--color-brand-navy)]">
                      <tr>
                        {[
                          "comparison.areaFilter",
                          "comparison.kindFilter",
                          "comparison.path",
                          "comparison.before",
                          "comparison.after",
                        ].map((key) => (
                          <th className="p-2" scope="col" key={key}>
                            {t(key as TranslationKey)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {differences.map((difference) => (
                        <tr
                          className="border-t border-[color:var(--color-brand-border)] align-top"
                          key={`${difference.area}:${difference.path}`}
                        >
                          <td className="p-2">
                            {t(areaLabels[difference.area])}
                          </td>
                          <td className="p-2 font-bold">
                            {t(kindLabels[difference.kind])}
                          </td>
                          <td className="max-w-64 break-all p-2 font-mono">
                            {difference.path || t("comparison.root")}
                          </td>
                          <td className="max-w-72 whitespace-pre-wrap break-all p-2 font-mono">
                            {difference.before ?? "—"}
                          </td>
                          <td className="max-w-72 whitespace-pre-wrap break-all p-2 font-mono">
                            {difference.after ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                report.differences.length > 0 && (
                  <p className="mt-3 text-xs text-[color:var(--color-brand-muted)]">
                    {t("comparison.noMatches")}
                  </p>
                )
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button className={buttonClass} type="button" onClick={copy}>
                  {t("comparison.copy")}
                </button>
                <button
                  className={buttonClass}
                  type="button"
                  onClick={download}
                >
                  {t("comparison.download")}
                </button>
                <label className="flex items-center gap-2 text-xs font-bold text-[color:var(--color-brand-muted)]">
                  <input
                    type="checkbox"
                    checked={includeValues}
                    onChange={(event) => setIncludeValues(event.target.checked)}
                  />
                  {t("comparison.includeValues")}
                </label>
              </div>
              <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
                {t("comparison.exportHelp")}
              </p>
              {currentFeedback && (
                <p
                  className={`mt-2 text-xs font-bold ${currentFeedback.error ? "text-red-700" : "text-emerald-700"}`}
                  role={currentFeedback.error ? "alert" : "status"}
                >
                  {t(currentFeedback.key)}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
});
