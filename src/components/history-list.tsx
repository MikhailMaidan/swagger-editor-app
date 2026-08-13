"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getClientAuth } from "@/lib/client-auth";
import { formatEuropeanDateTime } from "@/lib/date-format";
import {
  clearRequestHistory,
  deleteAllServerHistory,
  deleteServerHistoryRecord,
  mergeRequestHistory,
  readRequestHistory,
  removeRequestHistoryRecord,
  RequestHistoryRecord,
} from "@/lib/request-history";
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

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setRecords(readSortedRequestHistory(initialRecords));
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [initialRecords]);

  async function handleDelete(record: RequestHistoryRecord) {
    if (!window.confirm(t("history.deleteConfirm", { summary: record.summary }))) {
      return;
    }

    setDeletingId(record.id);
    setErrorId(null);

    // The record can live in the guest-local list, the server/database, or
    // both (an authenticated user's older guest history isn't migrated), so
    // the local copy always gets removed; the server is only asked to
    // delete its copy when signed in, since a signed-out DELETE always
    // 401s and would otherwise be misreported as a failure.
    removeRequestHistoryRecord(record.id);
    const deleted = getClientAuth().isAuthenticated
      ? await deleteServerHistoryRecord(record.id)
      : true;

    if (deleted) {
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

    clearRequestHistory();
    const cleared = getClientAuth().isAuthenticated
      ? await deleteAllServerHistory()
      : true;

    if (cleared) {
      setRecords([]);
    } else {
      setClearAllError(true);
    }

    setIsClearingAll(false);
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
            {records.map((record) => (
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
            ))}
          </tbody>
        </table>
      </div>

      <HistoryLinks />
    </>
  );
}
