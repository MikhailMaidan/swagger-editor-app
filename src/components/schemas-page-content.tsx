"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatEuropeanDateTime } from "@/lib/date-format";
import {
  deleteAllServerSchemaRecords,
  deleteServerSchemaRecord,
  renameServerSchemaRecord,
  SavedSchemaRecord,
} from "@/lib/schema-storage";
import { getByteSize } from "@/lib/text-encoding";

export function SchemasPageContent({
  initialSchemas,
}: {
  initialSchemas: SavedSchemaRecord[];
}) {
  const { language, t } = useI18n();
  const [schemas, setSchemas] = useState(initialSchemas);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [clearAllError, setClearAllError] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [renameErrorId, setRenameErrorId] = useState<string | null>(null);
  const [renameErrorMessage, setRenameErrorMessage] = useState("");

  function handleStartRename(schema: SavedSchemaRecord) {
    setRenamingId(schema.id);
    setRenameValue(schema.title);
    setRenameErrorId(null);
  }

  function handleCancelRename() {
    setRenamingId(null);
    setRenameErrorId(null);
  }

  async function handleSaveRename(
    event: FormEvent<HTMLFormElement>,
    schema: SavedSchemaRecord,
  ) {
    event.preventDefault();

    const trimmedTitle = renameValue.trim();

    if (!trimmedTitle) {
      setRenameErrorId(schema.id);
      setRenameErrorMessage(t("schemas.renameTitleRequired"));
      return;
    }

    setIsSavingRename(true);
    setRenameErrorId(null);

    const renamed = await renameServerSchemaRecord(schema.id, trimmedTitle);

    if (renamed) {
      setSchemas((currentSchemas) =>
        currentSchemas.map((current) =>
          current.id === schema.id ? renamed : current,
        ),
      );
      setRenamingId(null);
    } else {
      setRenameErrorId(schema.id);
      setRenameErrorMessage(t("schemas.renameError"));
    }

    setIsSavingRename(false);
  }

  async function handleClearAll() {
    if (
      !window.confirm(
        t("schemas.clearAllConfirm", { count: String(schemas.length) }),
      )
    ) {
      return;
    }

    setIsClearingAll(true);
    setClearAllError(false);

    const cleared = await deleteAllServerSchemaRecords();

    if (cleared) {
      setSchemas([]);
    } else {
      setClearAllError(true);
    }

    setIsClearingAll(false);
  }

  async function handleDelete(schema: SavedSchemaRecord) {
    if (!window.confirm(t("schemas.deleteConfirm", { title: schema.title }))) {
      return;
    }

    setDeletingId(schema.id);
    setErrorId(null);

    const deleted = await deleteServerSchemaRecord(schema.id);

    if (deleted) {
      setSchemas((currentSchemas) =>
        currentSchemas.filter((current) => current.id !== schema.id),
      );
    } else {
      setErrorId(schema.id);
    }

    setDeletingId(null);
  }

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

        {schemas.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-5">
            <p className="text-base font-semibold leading-7 text-[color:var(--color-brand-muted)]">
              {t("schemas.empty")}
            </p>
            <Link
              className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition hover:translate-y-[-1px]"
              href="/"
            >
              {t("common.openEditor")}
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-end gap-4">
              <button
                className="shrink-0 rounded-2xl border border-red-200 px-4 py-2 text-sm font-extrabold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isClearingAll}
                type="button"
                onClick={handleClearAll}
              >
                {isClearingAll ? t("schemas.clearing") : t("schemas.clearAll")}
              </button>
            </div>
            {clearAllError ? (
              <p
                className="mt-3 text-sm font-semibold text-red-600"
                role="alert"
              >
                {t("schemas.clearAllError")}
              </p>
            ) : null}
            <div className="mt-4 grid gap-4">
              {schemas.map((schema) => (
                <article
                  className="rounded-2xl border border-[color:var(--color-brand-border)] p-5 transition-[border-color,box-shadow] duration-[var(--duration-header-fast)] ease-[var(--ease-header)] hover:border-[color:var(--color-brand-purple)] hover:shadow-[0_12px_26px_rgba(64,45,137,0.1)] motion-reduce:transition-none"
                  key={schema.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {renamingId === schema.id ? (
                      <form
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                        onSubmit={(event) => handleSaveRename(event, schema)}
                      >
                        <label
                          className="sr-only"
                          htmlFor={`rename-${schema.id}`}
                        >
                          {t("schemas.renameInputLabel")}
                        </label>
                        <input
                          autoFocus
                          className="h-11 min-w-0 flex-1 rounded-2xl border border-[color:var(--color-brand-border)] px-4 text-base font-medium outline-none focus:border-[color:var(--color-brand-purple)]"
                          id={`rename-${schema.id}`}
                          value={renameValue}
                          onChange={(event) =>
                            setRenameValue(event.target.value)
                          }
                        />
                        <button
                          className="rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 py-2 text-sm font-extrabold text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSavingRename}
                          type="submit"
                        >
                          {isSavingRename
                            ? t("schemas.renaming")
                            : t("schemas.renameSave")}
                        </button>
                        <button
                          className="rounded-2xl border border-[color:var(--color-brand-border)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-muted)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSavingRename}
                          type="button"
                          onClick={handleCancelRename}
                        >
                          {t("schemas.renameCancel")}
                        </button>
                      </form>
                    ) : (
                      <div>
                        <h2 className="text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                          {schema.title}
                        </h2>
                        <p className="mt-2 font-medium text-[color:var(--color-brand-muted)]">
                          {t("schemas.version")} {schema.version}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="rounded-2xl bg-[color:var(--color-brand-soft)] px-4 py-2 text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
                        {schema.format}
                      </span>
                      {renamingId === schema.id ? null : (
                        <button
                          aria-label={t("schemas.renameAriaLabel", {
                            title: schema.title,
                          })}
                          className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                          type="button"
                          onClick={() => handleStartRename(schema)}
                        >
                          {t("schemas.rename")}
                        </button>
                      )}
                      <button
                        aria-label={t("schemas.deleteAriaLabel", {
                          title: schema.title,
                        })}
                        className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-extrabold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={deletingId === schema.id}
                        type="button"
                        onClick={() => handleDelete(schema)}
                      >
                        {deletingId === schema.id
                          ? t("schemas.deleting")
                          : t("schemas.delete")}
                      </button>
                    </div>
                  </div>

                  {renameErrorId === schema.id ? (
                    <p
                      className="mt-3 text-sm font-semibold text-red-600"
                      role="alert"
                    >
                      {renameErrorMessage}
                    </p>
                  ) : null}

                  {errorId === schema.id ? (
                    <p
                      className="mt-3 text-sm font-semibold text-red-600"
                      role="alert"
                    >
                      {t("schemas.deleteError")}
                    </p>
                  ) : null}

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
                        {getByteSize(schema.schemaText)} B
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
          </>
        )}
      </section>
    </div>
  );
}
