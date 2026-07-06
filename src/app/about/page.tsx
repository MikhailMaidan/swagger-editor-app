"use client";

import { useI18n } from "@/components/i18n-provider";

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className="w-full px-4 py-10 md:px-8 lg:px-10">
      <section className="mx-auto w-full max-w-[1600px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          {t("about.label")}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold text-[color:var(--color-brand-navy)]">
          {t("about.title")}
        </h1>
        <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
          {t("about.description")}
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-5">
            <h2 className="text-lg font-extrabold text-[color:var(--color-brand-navy)]">
              {t("about.courseTitle")}
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
              {t("about.courseTextBefore")}
              <a
                className="font-extrabold text-[color:var(--color-brand-purple)]"
                href="https://rs.school/"
                rel="noreferrer"
                target="_blank"
              >
                {t("about.schoolLink")}
              </a>
              {t("about.courseTextAfter")}
            </p>
          </article>

          <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-5">
            <h2 className="text-lg font-extrabold text-[color:var(--color-brand-navy)]">
              {t("about.teamTitle")}
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
              <span className="block font-extrabold text-[color:var(--color-brand-navy)]">
                Mikhail Maidan
              </span>
              {t("about.roleLabel")} {t("about.roleText")}
              <br />
              {t("about.githubLabel")}{" "}
              <a
                className="font-extrabold text-[color:var(--color-brand-purple)]"
                href="https://github.com/MikhailMaidan"
                rel="noreferrer"
                target="_blank"
              >
                MikhailMaidan
              </a>
            </p>
          </article>

          <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-5">
            <h2 className="text-lg font-extrabold text-[color:var(--color-brand-navy)]">
              {t("about.stackTitle")}
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
              {t("about.stackText")}
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
