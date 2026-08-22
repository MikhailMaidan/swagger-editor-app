"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { formatEuropeanDateTime } from "@/lib/date-format";
import {
  downloadSchemaCollectionFile,
  downloadSchemaFile,
} from "@/lib/schema-download";
import {
  createSavedSchemaRecord,
  deleteAllServerSchemaRecords,
  deleteServerSchemaRecord,
  mergeSavedSchemas,
  renameServerSchemaRecord,
  saveServerSchemaRecord,
  SavedSchemaRecord,
  stageSavedSchemaForEditor,
} from "@/lib/schema-storage";
import {
  filterSavedSchemas,
  SavedSchemaFormatFilter,
} from "@/lib/saved-schema-filter";
import { getTextStats } from "@/lib/text-stats";

type SchemaSort = "largest" | "newest" | "oldest" | "title";

function getSchemaTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function SchemasPageContent({
  initialSchemas,
}: {
  initialSchemas: SavedSchemaRecord[];
}) {
  const { language, t } = useI18n();
  const router = useRouter();
  const [schemas, setSchemas] = useState(initialSchemas);
  const [schemaFilter, setSchemaFilter] = useState("");
  const [schemaFormat, setSchemaFormat] =
    useState<SavedSchemaFormatFilter>("all");
  const [schemaSort, setSchemaSort] = useState<SchemaSort>("newest");
  const filteredSchemas = useMemo(
    () => filterSavedSchemas(schemas, schemaFilter, schemaFormat),
    [schemaFilter, schemaFormat, schemas],
  );
  const hasActiveFilters =
    Boolean(schemaFilter.trim()) || schemaFormat !== "all";
  // Scanning every schema's full text for its statistics isn't free, and
  // this list re-renders on every keystroke while renaming any one row -
  // caching by id means an edit to one schema's title doesn't rescan
  // every other unrelated schema's text on each render.
  const schemaTextStats = useMemo(
    () =>
      new Map(
        schemas.map((schema) => [schema.id, getTextStats(schema.schemaText)]),
      ),
    [schemas],
  );
  const displayedSchemas = useMemo(() => {
    const sortedSchemas = [...filteredSchemas];
    const compareTitles = (
      firstSchema: SavedSchemaRecord,
      secondSchema: SavedSchemaRecord,
    ) => firstSchema.title.localeCompare(secondSchema.title, language);

    sortedSchemas.sort((firstSchema, secondSchema) => {
      if (schemaSort === "title") {
        return compareTitles(firstSchema, secondSchema);
      }

      if (schemaSort === "largest") {
        return (
          (schemaTextStats.get(secondSchema.id)?.byteSize ?? 0) -
            (schemaTextStats.get(firstSchema.id)?.byteSize ?? 0) ||
          compareTitles(firstSchema, secondSchema)
        );
      }

      const difference =
        getSchemaTimestamp(firstSchema.updatedAt) -
        getSchemaTimestamp(secondSchema.updatedAt);

      return (
        (schemaSort === "oldest" ? difference : -difference) ||
        compareTitles(firstSchema, secondSchema)
      );
    });

    return sortedSchemas;
  }, [filteredSchemas, language, schemaSort, schemaTextStats]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [clearAllError, setClearAllError] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [renameErrorId, setRenameErrorId] = useState<string | null>(null);
  const [renameErrorMessage, setRenameErrorMessage] = useState("");
  const [openErrorId, setOpenErrorId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicateErrorId, setDuplicateErrorId] = useState<string | null>(null);
  const [previewSchemaIds, setPreviewSchemaIds] = useState<Set<string>>(
    new Set(),
  );

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
      setPreviewSchemaIds(new Set());
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
      setPreviewSchemaIds((currentIds) => {
        const nextIds = new Set(currentIds);

        nextIds.delete(schema.id);
        return nextIds;
      });
    } else {
      setErrorId(schema.id);
    }

    setDeletingId(null);
  }

  function handleDownload(schema: SavedSchemaRecord) {
    downloadSchemaFile(schema.schemaText, schema.title, schema.format);
  }

  function handleExportAll() {
    downloadSchemaCollectionFile(schemas);
  }

  function handleExportVisible() {
    downloadSchemaCollectionFile(displayedSchemas, "visible");
  }

  function handleResetFilters() {
    setSchemaFilter("");
    setSchemaFormat("all");
  }

  async function handleCopy(schema: SavedSchemaRecord) {
    setCopyingId(schema.id);
    setCopiedId(null);
    setCopyErrorId(null);

    const copied = await writeTextToClipboard(schema.schemaText);

    if (copied) {
      setCopiedId(schema.id);
    } else {
      setCopyErrorId(schema.id);
    }

    setCopyingId(null);
  }

  async function handleDuplicate(schema: SavedSchemaRecord) {
    if (duplicatingId !== null) {
      return;
    }

    const duplicate = createSavedSchemaRecord(schema.schemaText, {
      format: schema.format,
      title: t("schemas.duplicateTitle", { title: schema.title }),
      version: schema.version,
    });

    setDuplicatingId(schema.id);
    setDuplicateErrorId(null);

    if (await saveServerSchemaRecord(duplicate)) {
      setSchemas((currentSchemas) =>
        mergeSavedSchemas([...currentSchemas, duplicate]),
      );
    } else {
      setDuplicateErrorId(schema.id);
    }

    setDuplicatingId(null);
  }

  function handleOpenInEditor(schema: SavedSchemaRecord) {
    setOpenErrorId(null);

    if (!stageSavedSchemaForEditor(schema)) {
      setOpenErrorId(schema.id);
      return;
    }

    router.push("/");
  }

  function handleTogglePreview(id: string) {
    setPreviewSchemaIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(id)) {
        nextIds.delete(id);
      } else {
        nextIds.add(id);
      }

      return nextIds;
    });
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
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <label className="sr-only" htmlFor="saved-schema-filter">
                  {t("schemas.filterLabel")}
                </label>
                <input
                  className="h-11 min-w-[220px] flex-1 rounded-2xl border border-[color:var(--color-brand-border)] px-4 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                  id="saved-schema-filter"
                  placeholder={t("schemas.filterPlaceholder")}
                  type="search"
                  value={schemaFilter}
                  onChange={(event) => setSchemaFilter(event.target.value)}
                />
                <label className="sr-only" htmlFor="saved-schema-format">
                  {t("schemas.formatFilterLabel")}
                </label>
                <select
                  className="h-11 shrink-0 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                  id="saved-schema-format"
                  value={schemaFormat}
                  onChange={(event) =>
                    setSchemaFormat(
                      event.target.value as SavedSchemaFormatFilter,
                    )
                  }
                >
                  <option value="all">{t("schemas.allFormats")}</option>
                  <option value="yaml">YAML</option>
                  <option value="json">JSON</option>
                </select>
                <button
                  className="h-11 shrink-0 rounded-2xl border border-[color:var(--color-brand-border)] px-4 text-sm font-extrabold text-[color:var(--color-brand-muted)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasActiveFilters}
                  type="button"
                  onClick={handleResetFilters}
                >
                  {t("schemas.resetFilters")}
                </button>
                <label className="sr-only" htmlFor="saved-schema-sort">
                  {t("schemas.sortLabel")}
                </label>
                <select
                  className="h-11 shrink-0 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                  id="saved-schema-sort"
                  value={schemaSort}
                  onChange={(event) =>
                    setSchemaSort(event.target.value as SchemaSort)
                  }
                >
                  <option value="newest">{t("schemas.sortNewest")}</option>
                  <option value="oldest">{t("schemas.sortOldest")}</option>
                  <option value="title">{t("schemas.sortTitle")}</option>
                  <option value="largest">{t("schemas.sortLargest")}</option>
                </select>
                <span className="shrink-0 text-sm font-semibold text-[color:var(--color-brand-muted)]">
                  {t("schemas.filterSummary", {
                    total: String(schemas.length),
                    visible: String(filteredSchemas.length),
                  })}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <button
                  className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={displayedSchemas.length === 0}
                  type="button"
                  onClick={handleExportVisible}
                >
                  {t("schemas.exportVisible")}
                </button>
                <button
                  className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                  type="button"
                  onClick={handleExportAll}
                >
                  {t("schemas.exportAll")}
                </button>
                <button
                  className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-extrabold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isClearingAll}
                  type="button"
                  onClick={handleClearAll}
                >
                  {isClearingAll
                    ? t("schemas.clearing")
                    : t("schemas.clearAll")}
                </button>
              </div>
            </div>
            {clearAllError ? (
              <p
                className="mt-3 text-sm font-semibold text-red-600"
                role="alert"
              >
                {t("schemas.clearAllError")}
              </p>
            ) : null}
            {filteredSchemas.length === 0 ? (
              <p className="mt-4 border-t border-[color:var(--color-brand-border)] py-6 text-center text-sm font-semibold text-[color:var(--color-brand-muted)]">
                {t("schemas.noMatches")}
              </p>
            ) : (
              <div className="mt-4 grid gap-4">
                {displayedSchemas.map((schema) => (
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
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-2xl bg-[color:var(--color-brand-soft)] px-4 py-2 text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
                          {schema.format}
                        </span>
                        <button
                          aria-label={t("schemas.openEditorAriaLabel", {
                            title: schema.title,
                          })}
                          className="rounded-2xl bg-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[color:var(--color-brand-purple-dark)]"
                          type="button"
                          onClick={() => handleOpenInEditor(schema)}
                        >
                          {t("schemas.openEditor")}
                        </button>
                        <button
                          aria-controls={`schema-preview-${schema.id}`}
                          aria-expanded={previewSchemaIds.has(schema.id)}
                          aria-label={t(
                            previewSchemaIds.has(schema.id)
                              ? "schemas.hidePreviewAriaLabel"
                              : "schemas.previewAriaLabel",
                            { title: schema.title },
                          )}
                          className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                          type="button"
                          onClick={() => handleTogglePreview(schema.id)}
                        >
                          {t(
                            previewSchemaIds.has(schema.id)
                              ? "schemas.hidePreview"
                              : "schemas.preview",
                          )}
                        </button>
                        <button
                          aria-label={t("schemas.downloadAriaLabel", {
                            title: schema.title,
                          })}
                          className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                          type="button"
                          onClick={() => handleDownload(schema)}
                        >
                          {t("schemas.download")}
                        </button>
                        <button
                          aria-label={t("schemas.copyAriaLabel", {
                            title: schema.title,
                          })}
                          className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={copyingId !== null}
                          type="button"
                          onClick={() => handleCopy(schema)}
                        >
                          {copyingId === schema.id
                            ? t("schemas.copying")
                            : t("schemas.copy")}
                        </button>
                        <button
                          aria-label={t("schemas.duplicateAriaLabel", {
                            title: schema.title,
                          })}
                          className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={duplicatingId !== null}
                          type="button"
                          onClick={() => handleDuplicate(schema)}
                        >
                          {duplicatingId === schema.id
                            ? t("schemas.duplicating")
                            : t("schemas.duplicate")}
                        </button>
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

                    {openErrorId === schema.id ? (
                      <p
                        className="mt-3 text-sm font-semibold text-red-600"
                        role="alert"
                      >
                        {t("schemas.openEditorError")}
                      </p>
                    ) : null}

                    {copiedId === schema.id ? (
                      <p
                        className="mt-3 text-sm font-semibold text-emerald-700"
                        role="status"
                      >
                        {t("schemas.copied")}
                      </p>
                    ) : null}

                    {copyErrorId === schema.id ? (
                      <p
                        className="mt-3 text-sm font-semibold text-red-600"
                        role="alert"
                      >
                        {t("schemas.copyError")}
                      </p>
                    ) : null}

                    {duplicateErrorId === schema.id ? (
                      <p
                        className="mt-3 text-sm font-semibold text-red-600"
                        role="alert"
                      >
                        {t("schemas.duplicateError")}
                      </p>
                    ) : null}

                    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
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
                          {schemaTextStats.get(schema.id)?.byteSize ?? 0} B
                        </dd>
                      </div>
                      <div>
                        <dt className="font-extrabold text-[color:var(--color-brand-navy)]">
                          {t("schemas.lines")}
                        </dt>
                        <dd className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
                          {schemaTextStats.get(schema.id)?.lineCount ?? 1}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-extrabold text-[color:var(--color-brand-navy)]">
                          {t("schemas.characters")}
                        </dt>
                        <dd className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
                          {schemaTextStats.get(schema.id)?.characterCount ?? 0}
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
                    {previewSchemaIds.has(schema.id) ? (
                      <pre
                        aria-label={t("schemas.previewContentAriaLabel", {
                          title: schema.title,
                        })}
                        className="mt-5 max-h-96 w-full max-w-full overflow-auto border-t border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4 font-mono text-sm leading-6 text-[color:var(--color-brand-navy)]"
                        id={`schema-preview-${schema.id}`}
                        tabIndex={0}
                      >
                        {schema.schemaText}
                      </pre>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
