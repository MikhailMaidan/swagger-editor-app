"use client";

import { HistoryList } from "@/components/history-list";
import { useI18n } from "@/components/i18n-provider";
import type { RequestHistoryRecord } from "@/lib/request-history";

export function HistoryPageContent({
  initialRecords,
}: {
  initialRecords: RequestHistoryRecord[];
}) {
  const { t } = useI18n();

  return (
    <div className="w-full px-4 py-10 md:px-8 lg:px-10">
      <section className="mx-auto w-full max-w-[1600px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          {t("history.privateRoute")}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold text-[color:var(--color-brand-navy)]">
          {t("history.history")}
        </h1>
        <HistoryList initialRecords={initialRecords} />
      </section>
    </div>
  );
}
