"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  mergeRequestHistory,
  readRequestHistory,
  RequestHistoryRecord,
} from "@/lib/request-history";

const EMPTY_HISTORY: RequestHistoryRecord[] = [];

function formatDate(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale);
}

function readSortedRequestHistory(initialRecords: RequestHistoryRecord[]) {
  return mergeRequestHistory([...initialRecords, ...readRequestHistory()]);
}

function HistoryLinks() {
  const { t } = useI18n();

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)]"
        href="/"
      >
        {t("common.openEditor")}
      </Link>
      <Link
        className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)]"
        href="/api-reference"
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

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setRecords(readSortedRequestHistory(initialRecords));
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [initialRecords]);

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
      <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
        {t("history.recent")}
      </p>

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
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                className="border-t border-[color:var(--color-brand-border)] text-[color:var(--color-brand-muted)]"
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
                <td className="px-4 py-4 font-bold">{record.status}</td>
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
                  {formatDate(
                    record.createdAt,
                    language === "ru" ? "ru-RU" : "en-US",
                  )}
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
