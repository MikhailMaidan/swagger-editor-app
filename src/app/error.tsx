"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const { t } = useI18n();

  return (
    <div className="w-full px-4 py-10 md:px-8 lg:px-10">
      <section className="mx-auto w-full max-w-[1600px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          {t("error.label")}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold text-[color:var(--color-brand-navy)]">
          {t("error.title")}
        </h1>
        <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
          {t("error.description")}
        </p>

        {error.digest ? (
          <p className="mt-4 rounded-2xl bg-[color:var(--color-brand-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--color-brand-muted)]">
            {t("error.errorId", { digest: error.digest })}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)]"
            type="button"
            onClick={reset}
          >
            {t("error.tryAgain")}
          </button>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)]"
            href="/"
          >
            {t("common.goHome")}
          </Link>
        </div>
      </section>
    </div>
  );
}
