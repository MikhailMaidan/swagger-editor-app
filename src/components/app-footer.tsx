"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

export function AppFooter() {
  const { t } = useI18n();

  return (
    <footer className="px-4 pb-8 pt-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 border-t border-[color:var(--color-brand-border)] pt-6 text-sm font-semibold text-[color:var(--color-brand-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>{t("footer.workspace")}</p>
        <nav
          className="flex items-center gap-5"
          aria-label={t("footer.navigation")}
        >
          <Link
            href="/"
            className="transition hover:text-[color:var(--color-brand-purple)]"
          >
            {t("nav.home")}
          </Link>
          <Link
            href="/about"
            className="transition hover:text-[color:var(--color-brand-purple)]"
          >
            {t("nav.about")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
