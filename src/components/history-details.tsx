"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatEuropeanDateTime } from "@/lib/date-format";
import type { RequestHistoryRecord } from "@/lib/request-history";
import { serializeRequestHistoryRecord } from "@/lib/request-history-clipboard";
import { getStatusColorClasses } from "@/lib/status-color";

export function HistoryDetails({
  record,
}: {
  record: RequestHistoryRecord | null;
}) {
  const { language, t } = useI18n();
  const [copyStatus, setCopyStatus] = useState<"copied" | "error" | "idle">(
    "idle",
  );

  async function handleCopyDetails() {
    setCopyStatus("idle");

    if (!record || !navigator.clipboard) {
      setCopyStatus("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(
        serializeRequestHistoryRecord(record),
      );
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="w-full px-4 py-10 md:px-8 lg:px-10">
      <section className="mx-auto w-full max-w-[1600px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          {t("history.analytics")}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold text-[color:var(--color-brand-navy)]">
          {t("history.detailsTitle")}
        </h1>

        {!record ? (
          <p className="mt-5 text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
            {t("history.notFound")}
          </p>
        ) : (
          <dl className="mt-8 grid gap-4 md:grid-cols-2">
            <Detail label={t("history.method")} value={record.method} />
            <Detail
              label={t("history.status")}
              value={
                <span
                  className={`rounded-xl px-3 py-1 ${getStatusColorClasses(record.status)}`}
                >
                  {record.status}
                </span>
              }
            />
            <Detail label={t("history.endpoint")} value={record.url} />
            <Detail label={t("history.summary")} value={record.summary} />
            <Detail
              label={t("history.duration")}
              value={`${record.durationMs} ms`}
            />
            <Detail
              label={t("history.timestamp")}
              value={formatEuropeanDateTime(record.createdAt, language)}
            />
            <Detail
              label={t("history.requestSize")}
              value={`${record.requestSize ?? 0} B`}
            />
            <Detail
              label={t("history.responseSize")}
              value={`${record.responseSize ?? 0} B`}
            />
            <Detail
              label={t("history.errorDetails")}
              value={record.errorDetails || t("history.noErrors")}
            />
          </dl>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {record ? (
            <button
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-white transition hover:bg-[color:var(--color-brand-purple-dark)]"
              type="button"
              onClick={handleCopyDetails}
            >
              {t("history.copyDetails")}
            </button>
          ) : null}
          <Link
            className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)]"
            href="/history"
          >
            {t("history.backToHistory")}
          </Link>
        </div>
        {copyStatus !== "idle" ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              copyStatus === "error" ? "text-red-600" : "text-emerald-700"
            }`}
            role={copyStatus === "error" ? "alert" : "status"}
          >
            {copyStatus === "error"
              ? t("history.copyDetailsError")
              : t("history.detailsCopied")}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-5">
      <dt className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {label}
      </dt>
      <dd className="mt-2 break-words font-mono text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
        {value}
      </dd>
    </div>
  );
}
