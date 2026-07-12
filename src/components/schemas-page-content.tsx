"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { formatEuropeanDateTime } from "@/lib/date-format";
import type { SavedSchemaRecord } from "@/lib/schema-storage";

function getSchemaSize(schemaText: string) {
  return new TextEncoder().encode(schemaText).length;
}

export function SchemasPageContent({
  initialSchemas,
}: {
  initialSchemas: SavedSchemaRecord[];
}) {
  const { language, t } = useI18n();

  return (
    <div className="w-full px-4 py-10 md:px-8 lg:px-10">
      <section className="mx-auto w-full max-w-[1600px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          {t("schemas.label")}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold text-[color:var(--color-brand-navy)]">
          {t("schemas.title")}
        </h1>
        <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
          {t("schemas.description")}
        </p>

        {initialSchemas.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-5">
            <p className="text-base font-semibold leading-7 text-[color:var(--color-brand-muted)]">
              {t("schemas.empty")}
            </p>
            <Link
              className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)]"
              href="/"
            >
              {t("common.openEditor")}
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {initialSchemas.map((schema) => (
              <article
                className="rounded-2xl border border-[color:var(--color-brand-border)] p-5"
                key={schema.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                      {schema.title}
                    </h2>
                    <p className="mt-2 font-medium text-[color:var(--color-brand-muted)]">
                      {t("schemas.version")} {schema.version}
                    </p>
                  </div>
                  <span className="rounded-2xl bg-[color:var(--color-brand-soft)] px-4 py-2 text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
                    {schema.format}
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 text-sm md:grid-cols-3">
                  <div>
                    <dt className="font-extrabold text-[color:var(--color-brand-navy)]">
                      {t("schemas.format")}
                    </dt>
                    <dd className="mt-1 font-medium uppercase text-[color:var(--color-brand-muted)]">
                      {schema.format}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-extrabold text-[color:var(--color-brand-navy)]">
                      {t("schemas.schemaSize")}
                    </dt>
                    <dd className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
                      {getSchemaSize(schema.schemaText)} B
                    </dd>
                  </div>
                  <div>
                    <dt className="font-extrabold text-[color:var(--color-brand-navy)]">
                      {t("schemas.updated")}
                    </dt>
                    <dd className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
                      {formatEuropeanDateTime(schema.updatedAt, language)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
