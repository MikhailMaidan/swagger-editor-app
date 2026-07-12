"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { formatEuropeanDateTime } from "@/lib/date-format";
import type { RequestHistoryRecord } from "@/lib/request-history";

export function HistoryDetails({
  record,
}: {
  record: RequestHistoryRecord | null;
}) {
  const { language, t } = useI18n();

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
            <Detail label={t("history.status")} value={String(record.status)} />
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
              value={`${record.requestSize} B`}
            />
            <Detail
              label={t("history.responseSize")}
              value={`${record.responseSize} B`}
            />
            <Detail
              label={t("history.errorDetails")}
              value={record.errorDetails || t("history.noErrors")}
            />
          </dl>
        )}

        <Link
          className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)]"
          href="/history"
        >
          {t("history.backToHistory")}
        </Link>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
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
