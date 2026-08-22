"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getClientAuth } from "@/lib/client-auth";
import { writeTextToClipboard } from "@/lib/clipboard";
import { formatEuropeanDateTime } from "@/lib/date-format";
import {
  clearRequestHistory,
  deleteAllServerHistory,
  deleteServerHistoryRecord,
  mergeRequestHistory,
  readRequestHistory,
  removeRequestHistoryRecord,
  RequestHistoryRecord,
  RequestHistorySort,
  sortRequestHistory,
} from "@/lib/request-history";
import { downloadRequestHistoryFile } from "@/lib/request-history-export";
import {
  filterRequestHistory,
  filterRequestHistoryByDuration,
  filterRequestHistoryByMethod,
  getRequestHistoryMethods,
  RequestHistoryAgeFilter,
  RequestHistoryDurationFilter,
  RequestHistoryOutcomeFilter,
} from "@/lib/request-history-filter";
import { serializeRequestHistoryRecords } from "@/lib/request-history-clipboard";
import { createRequestHistoryStats } from "@/lib/request-history-stats";
import { getStatusColorClasses } from "@/lib/status-color";

const EMPTY_HISTORY: RequestHistoryRecord[] = [];

function readSortedRequestHistory(initialRecords: RequestHistoryRecord[]) {
  return mergeRequestHistory([...initialRecords, ...readRequestHistory()]);
}

function HistoryLinks() {
  const { t } = useI18n();

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition hover:translate-y-[-1px]"
        href="/"
      >
        {t("common.openEditor")}
      </Link>
      <Link
        className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
        href="/#api-viewer"
      >
        {t("nav.apiReference")}
      </Link>
    </div>
  );
}

export function HistoryList({
  initialRecords = EMPTY_HISTORY,
}: {
  initialRecords?: RequestHistoryRecord[];
}) {
  const { language, t } = useI18n();
  const [records, setRecords] = useState<RequestHistoryRecord[]>(() =>
    mergeRequestHistory(initialRecords),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [clearAllError, setClearAllError] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");
  const [historyOutcome, setHistoryOutcome] =
    useState<RequestHistoryOutcomeFilter>("all");
  const [historyMethod, setHistoryMethod] = useState("all");
  const [historyAge, setHistoryAge] = useState<RequestHistoryAgeFilter>("all");
  const [historyDuration, setHistoryDuration] =
    useState<RequestHistoryDurationFilter>("all");
  const [historySort, setHistorySort] = useState<RequestHistorySort>("newest");
  const [isCopyingVisible, setIsCopyingVisible] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<{
    kind: "copied" | "error";
    text: string;
  } | null>(null);
  const historyMethods = useMemo(
    () => getRequestHistoryMethods(records),
    [records],
  );
  const searchedRecords = useMemo(
    () =>
      filterRequestHistory(records, historyFilter, historyOutcome, historyAge),
    [historyAge, historyFilter, historyOutcome, records],
  );
  const methodFilteredRecords = useMemo(
    () => filterRequestHistoryByMethod(searchedRecords, historyMethod),
    [historyMethod, searchedRecords],
  );
  const filteredRecords = useMemo(
    () =>
      filterRequestHistoryByDuration(methodFilteredRecords, historyDuration),
    [historyDuration, methodFilteredRecords],
  );
  const sortedRecords = useMemo(
    () => sortRequestHistory(filteredRecords, historySort),
    [filteredRecords, historySort],
  );
  const visibleHistoryText = useMemo(
    () => serializeRequestHistoryRecords(sortedRecords),
    [sortedRecords],
  );
  const historyStats = useMemo(
    () => createRequestHistoryStats(filteredRecords),
    [filteredRecords],
  );
  const hasActiveFilters =
    Boolean(historyFilter.trim()) ||
    historyOutcome !== "all" ||
    historyMethod !== "all" ||
    historyAge !== "all" ||
    historyDuration !== "all";

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setRecords(readSortedRequestHistory(initialRecords));
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [initialRecords]);

  async function handleDelete(record: RequestHistoryRecord) {
    if (
      !window.confirm(t("history.deleteConfirm", { summary: record.summary }))
    ) {
      return;
    }

    setDeletingId(record.id);
    setErrorId(null);

    // The server is only asked to delete its copy when signed in, since a
    // signed-out DELETE always 401s and would otherwise be misreported as a
    // failure. The local copy is removed only once that outcome is known -
    // removing it first would wipe the user's only remaining copy of the
    // record if the server delete then failed.
    const deleted = getClientAuth().isAuthenticated
      ? await deleteServerHistoryRecord(record.id)
      : true;

    if (deleted) {
      removeRequestHistoryRecord(record.id);
      setRecords((currentRecords) =>
        currentRecords.filter((current) => current.id !== record.id),
      );
    } else {
      setErrorId(record.id);
    }

    setDeletingId(null);
  }

  async function handleClearAll() {
    if (
      !window.confirm(
        t("history.clearAllConfirm", { count: String(records.length) }),
      )
    ) {
      return;
    }

    setIsClearingAll(true);
    setClearAllError(false);

    const cleared = getClientAuth().isAuthenticated
      ? await deleteAllServerHistory()
      : true;

    if (cleared) {
      clearRequestHistory();
      setRecords([]);
    } else {
      setClearAllError(true);
    }

    setIsClearingAll(false);
  }

  function handleResetFilters() {
    setHistoryFilter("");
    setHistoryOutcome("all");
    setHistoryMethod("all");
    setHistoryAge("all");
    setHistoryDuration("all");
  }

  async function handleCopyVisible() {
    if (sortedRecords.length === 0 || isCopyingVisible) {
      return;
    }

    const text = visibleHistoryText;

    setIsCopyingVisible(true);
    const copied = await writeTextToClipboard(text);
    setCopyFeedback({ kind: copied ? "copied" : "error", text });
    setIsCopyingVisible(false);
  }

  if (records.length === 0) {
    return (
      <>
        <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
          {t("history.empty")}
        </p>
        <HistoryLinks />
      </>
    );
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
          {t("history.recent")}
        </p>
        <button
          className="shrink-0 rounded-2xl border border-red-200 px-4 py-2 text-sm font-extrabold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isClearingAll}
          type="button"
          onClick={handleClearAll}
        >
          {isClearingAll ? t("history.clearing") : t("history.clearAll")}
        </button>
      </div>
      {clearAllError ? (
        <p className="mt-3 text-sm font-semibold text-red-600" role="alert">
          {t("history.clearAllError")}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="request-history-filter">
          {t("history.filterLabel")}
        </label>
        <input
          className="h-11 min-w-[240px] flex-1 rounded-2xl border border-[color:var(--color-brand-border)] px-4 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
          id="request-history-filter"
          placeholder={t("history.filterPlaceholder")}
          type="search"
          value={historyFilter}
          onChange={(event) => setHistoryFilter(event.target.value)}
        />
        <div
          aria-label={t("history.outcomeFilterLabel")}
          className="inline-flex h-11 shrink-0 items-center rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-1"
          role="group"
        >
          {(
            [
              ["all", t("history.allOutcomes")],
              ["successful", t("history.successfulRequests")],
              ["failed", t("history.failedRequests")],
            ] as const
          ).map(([outcome, label]) => (
            <button
              aria-pressed={historyOutcome === outcome}
              className={`h-8 rounded-xl px-3 text-sm font-bold transition ${
                historyOutcome === outcome
                  ? "bg-[color:var(--color-brand-purple)] text-white"
                  : "text-[color:var(--color-brand-muted)] hover:bg-[color:var(--color-brand-soft)]"
              }`}
              key={outcome}
              type="button"
              onClick={() => setHistoryOutcome(outcome)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="request-history-method">
          {t("history.methodFilterLabel")}
        </label>
        <select
          className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
          id="request-history-method"
          value={historyMethod}
          onChange={(event) => setHistoryMethod(event.target.value)}
        >
          <option value="all">{t("history.allMethods")}</option>
          {historyMethods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="request-history-age">
          {t("history.ageFilterLabel")}
        </label>
        <select
          className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
          id="request-history-age"
          value={historyAge}
          onChange={(event) =>
            setHistoryAge(event.target.value as RequestHistoryAgeFilter)
          }
        >
          <option value="all">{t("history.allTime")}</option>
          <option value="24-hours">{t("history.last24Hours")}</option>
          <option value="7-days">{t("history.last7Days")}</option>
          <option value="30-days">{t("history.last30Days")}</option>
        </select>
        <label className="sr-only" htmlFor="request-history-duration">
          {t("history.durationFilterLabel")}
        </label>
        <select
          className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
          id="request-history-duration"
          value={historyDuration}
          onChange={(event) =>
            setHistoryDuration(
              event.target.value as RequestHistoryDurationFilter,
            )
          }
        >
          <option value="all">{t("history.allDurations")}</option>
          <option value="under-100">{t("history.durationUnder100")}</option>
          <option value="100-to-499">{t("history.duration100To499")}</option>
          <option value="500-plus">{t("history.duration500Plus")}</option>
        </select>
        <button
          className="h-11 shrink-0 rounded-2xl border border-[color:var(--color-brand-border)] px-4 text-sm font-extrabold text-[color:var(--color-brand-muted)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasActiveFilters}
          type="button"
          onClick={handleResetFilters}
        >
          {t("history.resetFilters")}
        </button>
        <label className="sr-only" htmlFor="request-history-sort">
          {t("history.sortLabel")}
        </label>
        <select
          className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
          id="request-history-sort"
          value={historySort}
          onChange={(event) =>
            setHistorySort(event.target.value as RequestHistorySort)
          }
        >
          <option value="newest">{t("history.sortNewest")}</option>
          <option value="oldest">{t("history.sortOldest")}</option>
          <option value="slowest">{t("history.sortSlowest")}</option>
          <option value="failures">{t("history.sortFailures")}</option>
        </select>
        <button
          className="h-11 shrink-0 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={sortedRecords.length === 0 || isCopyingVisible}
          type="button"
          onClick={handleCopyVisible}
        >
          {isCopyingVisible
            ? t("history.copyingVisible")
            : t("history.copyVisible")}
        </button>
        <button
          aria-label={t("history.exportAriaLabel")}
          className="h-11 shrink-0 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={sortedRecords.length === 0}
          type="button"
          onClick={() => downloadRequestHistoryFile(sortedRecords)}
        >
          {t("history.exportVisible")}
        </button>
        <span className="shrink-0 text-sm font-semibold text-[color:var(--color-brand-muted)]">
          {t("history.filterSummary", {
            total: String(records.length),
            visible: String(filteredRecords.length),
          })}
        </span>
      </div>

      {copyFeedback?.text === visibleHistoryText ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            copyFeedback.kind === "error" ? "text-red-600" : "text-emerald-700"
          }`}
          role={copyFeedback.kind === "error" ? "alert" : "status"}
        >
          {copyFeedback.kind === "error"
            ? t("history.copyVisibleError")
            : t("history.copyVisibleSuccess")}
        </p>
      ) : null}

      <dl
        aria-label={t("history.statsLabel")}
        className="mt-5 grid border-y border-[color:var(--color-brand-border)] sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="px-4 py-4">
          <dt className="text-sm font-semibold text-[color:var(--color-brand-muted)]">
            {t("history.totalRequests")}
          </dt>
          <dd className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
            {historyStats.total}
          </dd>
        </div>
        <div className="px-4 py-4">
          <dt className="text-sm font-semibold text-[color:var(--color-brand-muted)]">
            {t("history.successfulRequests")}
          </dt>
          <dd className="mt-1 text-2xl font-extrabold text-emerald-700">
            {historyStats.successful}
          </dd>
        </div>
        <div className="px-4 py-4">
          <dt className="text-sm font-semibold text-[color:var(--color-brand-muted)]">
            {t("history.failedRequests")}
          </dt>
          <dd className="mt-1 text-2xl font-extrabold text-red-700">
            {historyStats.failed}
          </dd>
        </div>
        <div className="px-4 py-4">
          <dt className="text-sm font-semibold text-[color:var(--color-brand-muted)]">
            {t("history.averageDuration")}
          </dt>
          <dd className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-purple)]">
            {t("history.averageDurationValue", {
              duration: String(historyStats.averageDurationMs),
            })}
          </dd>
        </div>
      </dl>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-[color:var(--color-brand-border)]">
        <table className="w-full min-w-[940px] border-collapse text-left text-sm">
          <thead className="bg-[#fbfaff] text-[color:var(--color-brand-navy)]">
            <tr>
              <th className="px-4 py-3 font-extrabold">
                {t("history.method")}
              </th>
              <th className="px-4 py-3 font-extrabold">
                {t("history.endpoint")}
              </th>
              <th className="px-4 py-3 font-extrabold">
                {t("history.summary")}
              </th>
              <th className="px-4 py-3 font-extrabold">
                {t("history.status")}
              </th>
              <th className="px-4 py-3 font-extrabold">
                {t("history.duration")}
              </th>
              <th className="px-4 py-3 font-extrabold">
                {t("history.requestSize")}
              </th>
              <th className="px-4 py-3 font-extrabold">
                {t("history.responseSize")}
              </th>
              <th className="px-4 py-3 font-extrabold">
                {t("history.timestamp")}
              </th>
              <th className="px-4 py-3 font-extrabold" />
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr className="border-t border-[color:var(--color-brand-border)]">
                <td
                  className="px-4 py-8 text-center font-semibold text-[color:var(--color-brand-muted)]"
                  colSpan={9}
                >
                  {t("history.noMatches")}
                </td>
              </tr>
            ) : (
              sortedRecords.map((record) => (
                <tr
                  className="border-t border-[color:var(--color-brand-border)] text-[color:var(--color-brand-muted)] transition-colors hover:bg-[color:var(--color-brand-soft)]/60 motion-reduce:transition-none"
                  key={record.id}
                >
                  <td className="px-4 py-4 font-extrabold text-[color:var(--color-brand-purple)]">
                    {record.method}
                  </td>
                  <td className="px-4 py-4 font-mono font-bold text-[color:var(--color-brand-navy)]">
                    <Link
                      aria-label={t("history.viewDetails", {
                        summary: record.summary,
                      })}
                      className="text-[color:var(--color-brand-purple)] underline decoration-2 underline-offset-4"
                      href={`/history/${encodeURIComponent(record.id)}`}
                    >
                      {record.url}
                    </Link>
                  </td>
                  <td className="px-4 py-4 font-medium">{record.summary}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-xl px-3 py-1 font-extrabold ${getStatusColorClasses(record.status)}`}
                    >
                      {record.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {record.durationMs} ms
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {record.requestSize ?? 0} B
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {record.responseSize ?? 0} B
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {formatEuropeanDateTime(record.createdAt, language)}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      aria-label={t("history.deleteAriaLabel", {
                        summary: record.summary,
                      })}
                      className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-extrabold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deletingId === record.id}
                      type="button"
                      onClick={() => handleDelete(record)}
                    >
                      {deletingId === record.id
                        ? t("history.deleting")
                        : t("history.delete")}
                    </button>
                    {errorId === record.id ? (
                      <p
                        className="mt-2 text-sm font-semibold text-red-600"
                        role="alert"
                      >
                        {t("history.deleteError")}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <HistoryLinks />
    </>
  );
}
