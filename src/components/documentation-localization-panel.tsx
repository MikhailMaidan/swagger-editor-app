"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  addDocumentationLocale,
  createLocalizedDocumentation,
  emptyLocalizationProject,
  localizationProgressReport,
  localizationSummary,
  LocalizationError,
  MAX_LOCALIZATION_CATALOG_BYTES,
  MAX_LOCALIZATION_PROJECT_BYTES,
  MAX_LOCALIZATION_SOURCE_BYTES,
  mergeDocumentationCatalog,
  parseDocumentationCatalog,
  parseDocumentationCsv,
  parseLocalizationProject,
  readDocumentationSource,
  serializeDocumentationCatalog,
  serializeDocumentationCsv,
  serializeLocalizationProject,
  serializeLocalizedDocumentation,
  translationStatus,
  updateDocumentationTranslation,
  type DocumentationSection,
  type DocumentationSource,
  type LocalizedDocumentation,
  type LocalizationPolicy,
  type TranslationStatus,
} from "@/lib/documentation-localization";
import { createHtmlDocumentation } from "@/lib/html-documentation";
import { parseOpenApiSchema, type SchemaFormat } from "@/lib/openapi";
import { extractSchemaModels } from "@/lib/schema-models";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const statuses: TranslationStatus[] = ["missing", "draft", "stale", "reviewed"];
const sections: DocumentationSection[] = [
  "info",
  "operations",
  "schemas",
  "other",
];
type FileKind = "source" | "project" | "catalog";

export const DocumentationLocalizationPanel = memo(
  function DocumentationLocalizationPanel({
    getSchemaText,
    onApply,
  }: {
    getSchemaText: () => string;
    onApply: (text: string) => void;
  }) {
    const { t, language } = useI18n();
    const [open, setOpen] = useState(false);
    const [project, setProject] = useState(emptyLocalizationProject);
    const [source, setSource] = useState<DocumentationSource | null>(null);
    const [locale, setLocale] = useState("");
    const [newLocale, setNewLocale] = useState("ru");
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | TranslationStatus>("all");
    const [section, setSection] = useState<"all" | DocumentationSection>("all");
    const [selected, setSelected] = useState("");
    const [page, setPage] = useState(0);
    const [overwrite, setOverwrite] = useState(false);
    const [loading, setLoading] = useState(false);
    const [policy, setPolicy] = useState<LocalizationPolicy>("fallback");
    const [format, setFormat] = useState<SchemaFormat>("json");
    const [preview, setPreview] = useState<{
      result: LocalizedDocumentation;
      text: string | null;
      editor: string;
    } | null>(null);
    const [undo, setUndo] = useState<{ before: string; after: string } | null>(
      null,
    );
    const [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
      params?: Record<string, string>;
    } | null>(null);
    const generation = useRef(0);
    useEffect(
      () => () => {
        generation.current++;
      },
      [],
    );
    const catalog = project.locales.find((c) => c.locale === locale);
    const translations = useMemo(
      () =>
        new Map(catalog?.translations.map((row) => [row.pointer, row]) ?? []),
      [catalog],
    );
    const activePointers = useMemo(
      () => new Set(source?.entries.map((entry) => entry.pointer) ?? []),
      [source],
    );
    const orphaned = useMemo(
      () =>
        catalog?.translations.filter(
          (row) => !activePointers.has(row.pointer),
        ) ?? [],
      [catalog, activePointers],
    );
    const rows = useMemo(() => {
      const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
      return (source?.entries ?? []).filter(
        (entry) =>
          (filter === "all" ||
            translationStatus(entry, translations.get(entry.pointer)) ===
              filter) &&
          (section === "all" || entry.section === section) &&
          terms.every((term) =>
            `${entry.pointer} ${entry.source} ${translations.get(entry.pointer)?.text ?? ""}`
              .toLowerCase()
              .includes(term),
          ),
      );
    }, [source, translations, filter, section, search]);
    const entry =
      source?.entries.find((e) => e.pointer === selected) ?? rows[0];
    const translation = entry ? translations.get(entry.pointer) : undefined;
    const lastPage = Math.max(0, Math.ceil(rows.length / 20) - 1);
    const currentPage = Math.min(page, lastPage);
    const ready = Boolean(preview?.text && preview.result.ready);
    function invalidate() {
      setPreview(null);
      setFeedback(null);
    }
    function fail(error: unknown) {
      setFeedback({
        key:
          error instanceof LocalizationError
            ? `localeStudio.error.${error.code}`
            : "localeStudio.error.source",
        error: true,
      });
    }
    function setSourceText(text: string) {
      const next = readDocumentationSource(text);
      setSource(next);
      setProject((previous) => ({
        ...previous,
        source: text,
        name: previous.source
          ? previous.name
          : next.title.trim().slice(0, 120) || previous.name,
      }));
      setSelected(next.entries[0]?.pointer ?? "");
      setSearch("");
      setFilter("all");
      setSection("all");
      setPage(0);
      invalidate();
    }
    function capture() {
      try {
        setSourceText(getSchemaText());
        setFeedback({ key: "localeStudio.captured", error: false });
      } catch (error) {
        fail(error);
      }
    }
    function addLocale() {
      try {
        const next = addDocumentationLocale(project, newLocale);
        setProject(next);
        setLocale(next.locales.at(-1)!.locale);
        setPage(0);
        setSelected("");
        setSearch("");
        setFilter("all");
        setSection("all");
        invalidate();
      } catch (error) {
        fail(error);
      }
    }
    function editTranslation(text: string, reviewed = false) {
      if (!entry || !catalog) return;
      try {
        setProject(
          updateDocumentationTranslation(
            project,
            locale,
            entry,
            text,
            reviewed,
          ),
        );
        setSelected(entry.pointer);
        invalidate();
      } catch (error) {
        fail(error);
      }
    }
    function clearTranslation() {
      if (!entry) return;
      setProject({
        ...project,
        locales: project.locales.map((c) =>
          c.locale !== locale
            ? c
            : {
                ...c,
                translations: c.translations.filter(
                  (row) => row.pointer !== entry.pointer,
                ),
              },
        ),
      });
      invalidate();
    }
    async function read(file: File, kind: FileKind) {
      const token = ++generation.current;
      setLoading(true);
      setFeedback(null);
      try {
        const max =
          kind === "source"
            ? MAX_LOCALIZATION_SOURCE_BYTES
            : kind === "project"
              ? MAX_LOCALIZATION_PROJECT_BYTES
              : MAX_LOCALIZATION_CATALOG_BYTES;
        if (file.size > max) throw new LocalizationError("limit");
        const text = await file.text();
        if (generation.current !== token) return;
        if (kind === "source") {
          setSourceText(text);
          setFeedback({ key: "localeStudio.captured", error: false });
        } else if (kind === "project") {
          const restored = parseLocalizationProject(text);
          setProject(restored.project);
          setSource(restored.source);
          setLocale(restored.project.locales[0]?.locale ?? "");
          setSelected(restored.source.entries[0]?.pointer ?? "");
          setSearch("");
          setFilter("all");
          setSection("all");
          setPage(0);
          invalidate();
          setFeedback({ key: "localeStudio.restored", error: false });
        } else {
          const incoming = file.name.toLowerCase().endsWith(".csv")
            ? parseDocumentationCsv(text)
            : parseDocumentationCatalog(text);
          const merged = mergeDocumentationCatalog(
            project,
            incoming,
            overwrite,
          );
          setProject(merged.project);
          setLocale(incoming.locale);
          setPage(0);
          setSelected("");
          invalidate();
          setFeedback({
            key: "localeStudio.imported",
            error: false,
            params: {
              imported: String(merged.imported),
              kept: String(merged.kept),
            },
          });
        }
      } catch (error) {
        if (generation.current === token) fail(error);
      } finally {
        if (generation.current === token) setLoading(false);
      }
    }
    function buildPreview() {
      setPreview(null);
      setFeedback(null);
      if (!source || !catalog) return;
      try {
        const result = createLocalizedDocumentation(source, catalog, policy);
        const text = result.ready
          ? serializeLocalizedDocumentation(result, format)
          : null;
        setPreview({ result, text, editor: getSchemaText() });
        setFeedback({
          key: result.ready ? "localeStudio.ready" : "localeStudio.blocked",
          error: !result.ready,
        });
      } catch (error) {
        fail(error);
      }
    }
    function download(text: string, suffix: string, mime = "application/json") {
      const name =
        project.name
          .trim()
          .replace(/[^\p{L}\p{N}._-]+/gu, "-")
          .slice(0, 70) || "api-documentation";
      if (downloadTextFile(text, `${name}-${suffix}`, mime))
        setFeedback({ key: "localeStudio.downloaded", error: false });
      else setFeedback({ key: "localeStudio.error.download", error: true });
    }
    function exportFile(
      kind: "project" | "catalog" | "csv" | "progress" | "api" | "html",
    ) {
      try {
        if (kind === "project")
          download(
            serializeLocalizationProject(project),
            "localization-project.json",
          );
        else if (kind === "progress" && source)
          download(
            JSON.stringify(
              localizationProgressReport(project, source),
              null,
              2,
            ),
            "translation-progress.json",
          );
        else if (kind === "catalog" && catalog && source)
          download(
            serializeDocumentationCatalog(catalog, source),
            `${locale}-catalog.json`,
          );
        else if (kind === "csv" && catalog && source)
          download(
            serializeDocumentationCsv(catalog, source),
            `${locale}-catalog.csv`,
            "text/csv;charset=utf-8",
          );
        else if (kind === "api" && preview?.text)
          download(
            preview.text,
            `${locale}-openapi.${format}`,
            format === "yaml" ? "application/yaml" : "application/json",
          );
        else if (kind === "html" && preview?.text) {
          const parsed = parseOpenApiSchema(preview.text);
          if (!parsed.ok) throw new LocalizationError("result");
          const { value } = parsed;
          const build = createHtmlDocumentation(
            value.endpoints,
            extractSchemaModels(value.schema),
            value.securitySchemes,
            value,
            { language },
          );
          // The chrome uses the app language; API text uses the chosen locale.
          download(
            build.html.replace(
              `<html lang="${language}"`,
              `<html lang="${locale}"`,
            ),
            `${locale}-documentation.html`,
            "text/html;charset=utf-8",
          );
        }
      } catch (error) {
        fail(error);
      }
    }
    function apply() {
      if (!preview?.text) return;
      const current = getSchemaText();
      if (current !== preview.editor) {
        setFeedback({ key: "localeStudio.staleEditor", error: true });
        return;
      }
      if (current === preview.text) {
        setFeedback({ key: "localeStudio.unchanged", error: false });
        return;
      }
      onApply(preview.text);
      setUndo({ before: current, after: preview.text });
      setPreview({ ...preview, editor: preview.text });
      setFeedback({ key: "localeStudio.applied", error: false });
    }
    function undoApply() {
      if (!undo) return;
      if (getSchemaText() !== undo.after) {
        setFeedback({ key: "localeStudio.staleUndo", error: true });
        return;
      }
      onApply(undo.before);
      setUndo(null);
      setPreview(null);
      setFeedback({ key: "localeStudio.undone", error: false });
    }
    const fileInput = (kind: FileKind) => (
      <label className="block text-xs font-semibold">
        {t(`localeStudio.import.${kind}`)}
        <input
          type="file"
          accept={
            kind === "source"
              ? ".json,.yaml,.yml"
              : kind === "catalog"
                ? ".json,.csv"
                : ".json"
          }
          disabled={kind === "catalog" && !source}
          className={inputClass}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void read(file, kind);
          }}
        />
      </label>
    );
    return (
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4 shadow-sm"
      >
        <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
          {t("localeStudio.title")}
        </summary>
        {open && (
          <div className="mt-4 space-y-4 text-[color:var(--color-brand-navy)]">
            <p className="text-sm">{t("localeStudio.description")}</p>
            <p className="text-xs text-slate-600">{t("localeStudio.help")}</p>
            {loading && <p role="status">{t("localeStudio.loading")}</p>}
            {feedback && (
              <p
                role={feedback.error ? "alert" : "status"}
                className={
                  feedback.error
                    ? "text-sm text-red-700"
                    : "text-sm text-emerald-700"
                }
              >
                {t(feedback.key, feedback.params)}
              </p>
            )}
            <fieldset disabled={loading} className="min-w-0 space-y-4">
              <legend className="sr-only">{t("localeStudio.title")}</legend>
              <div className="grid gap-3 md:grid-cols-3">
                {fileInput("source")}
                {fileInput("project")}
                {fileInput("catalog")}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={buttonClass} onClick={capture}>
                  {t("localeStudio.capture")}
                </button>
                <label className="text-xs">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(event) => setOverwrite(event.target.checked)}
                  />{" "}
                  {t("localeStudio.overwrite")}
                </label>
              </div>
              <p className="text-xs text-slate-600">
                {t("localeStudio.importHelp")}
              </p>
              <label className="block text-xs font-semibold">
                {t("localeStudio.name")}
                <input
                  value={project.name}
                  maxLength={120}
                  className={inputClass}
                  onChange={(event) =>
                    setProject({ ...project, name: event.target.value })
                  }
                />
              </label>
              {source && (
                <>
                  <p className="text-sm">
                    {t("localeStudio.inventory", {
                      title: source.title,
                      count: String(source.entries.length),
                    })}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold">
                      {t("localeStudio.sourceDetails")}
                    </summary>
                    <textarea
                      readOnly
                      aria-label={t("localeStudio.sourceText")}
                      value={source.text}
                      rows={8}
                      className={`${inputClass} font-mono`}
                    />
                  </details>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold">
                      {t("localeStudio.newLocale")}
                      <input
                        value={newLocale}
                        maxLength={64}
                        className={inputClass}
                        placeholder="fr, ru, pt-BR, zh-Hant"
                        onChange={(event) => setNewLocale(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={addLocale}
                    >
                      {t("localeStudio.addLocale")}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    {t("localeStudio.localeHelp")}
                  </p>
                  {project.locales.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <caption className="mb-2 text-left font-bold">
                          {t("localeStudio.progress")}
                        </caption>
                        <thead>
                          <tr>
                            <th className="p-2">{t("localeStudio.locale")}</th>
                            <th className="p-2">
                              {t("localeStudio.coverage")}
                            </th>
                            {statuses
                              .filter((s) => s !== "reviewed")
                              .map((status) => (
                                <th className="p-2" key={status}>
                                  {t(`localeStudio.status.${status}`)}
                                </th>
                              ))}
                            <th className="p-2">
                              {t("localeStudio.orphaned")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {project.locales.map((c) => {
                            const summary = localizationSummary(source, c);
                            return (
                              <tr
                                key={c.locale}
                                className="border-t border-slate-200"
                              >
                                <td className="p-2">
                                  <button
                                    type="button"
                                    aria-pressed={c.locale === locale}
                                    className={buttonClass}
                                    onClick={() => {
                                      setLocale(c.locale);
                                      setPage(0);
                                      setSelected("");
                                      invalidate();
                                    }}
                                  >
                                    {c.locale}
                                  </button>
                                </td>
                                <td className="p-2">
                                  {summary.reviewed}/{summary.total}
                                </td>
                                {statuses
                                  .filter((s) => s !== "reviewed")
                                  .map((status) => (
                                    <td className="p-2" key={status}>
                                      {summary[status]}
                                    </td>
                                  ))}
                                <td className="p-2">{summary.orphaned}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {catalog && (
                    <>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="text-xs font-semibold">
                          {t("localeStudio.search")}
                          <input
                            type="search"
                            value={search}
                            className={inputClass}
                            onChange={(event) => {
                              setSearch(event.target.value);
                              setPage(0);
                              setSelected("");
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                setSearch("");
                                setPage(0);
                                setSelected("");
                              }
                            }}
                          />
                        </label>
                        <label className="text-xs font-semibold">
                          {t("localeStudio.filter")}
                          <select
                            value={filter}
                            className={inputClass}
                            onChange={(event) => {
                              setFilter(event.target.value as typeof filter);
                              setPage(0);
                              setSelected("");
                            }}
                          >
                            <option value="all">
                              {t("localeStudio.allStatuses")}
                            </option>
                            {statuses.map((status) => (
                              <option key={status} value={status}>
                                {t(`localeStudio.status.${status}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold">
                          {t("localeStudio.section")}
                          <select
                            value={section}
                            className={inputClass}
                            onChange={(event) => {
                              setSection(event.target.value as typeof section);
                              setPage(0);
                              setSelected("");
                            }}
                          >
                            <option value="all">
                              {t("localeStudio.allSections")}
                            </option>
                            {sections.map((s) => (
                              <option key={s} value={s}>
                                {t(`localeStudio.section.${s}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          {rows.length === 0 && (
                            <p className="text-xs">
                              {t("localeStudio.noEntries")}
                            </p>
                          )}
                          <ul
                            className="space-y-1"
                            aria-label={t("localeStudio.entries")}
                          >
                            {rows
                              .slice(currentPage * 20, currentPage * 20 + 20)
                              .map((e) => (
                                <li key={e.pointer}>
                                  <button
                                    type="button"
                                    aria-pressed={entry?.pointer === e.pointer}
                                    className={`${buttonClass} w-full break-all text-left`}
                                    onClick={() => setSelected(e.pointer)}
                                  >
                                    <span className="font-mono">
                                      {e.pointer}
                                    </span>
                                    <span className="ml-2 text-slate-500">
                                      {t(
                                        `localeStudio.status.${translationStatus(e, translations.get(e.pointer))}`,
                                      )}
                                    </span>
                                    <span className="mt-1 block truncate font-normal">
                                      {e.source.slice(0, 140)}
                                    </span>
                                  </button>
                                </li>
                              ))}
                          </ul>
                          {rows.length > 20 && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={currentPage === 0}
                                onClick={() => {
                                  setPage(currentPage - 1);
                                  setSelected(
                                    rows[(currentPage - 1) * 20]?.pointer ?? "",
                                  );
                                }}
                              >
                                {t("localeStudio.previous")}
                              </button>
                              <span className="text-xs">
                                {t("localeStudio.page", {
                                  page: String(currentPage + 1),
                                  total: String(lastPage + 1),
                                })}
                              </span>
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={currentPage === lastPage}
                                onClick={() => {
                                  setPage(currentPage + 1);
                                  setSelected(
                                    rows[(currentPage + 1) * 20]?.pointer ?? "",
                                  );
                                }}
                              >
                                {t("localeStudio.next")}
                              </button>
                            </div>
                          )}
                        </div>
                        {entry && (
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="break-all font-mono text-xs">
                              {entry.pointer}
                            </p>
                            <label className="block text-xs font-semibold">
                              {t("localeStudio.original")}
                              <textarea
                                readOnly
                                rows={5}
                                value={entry.source}
                                dir="auto"
                                className={inputClass}
                              />
                            </label>
                            {translation &&
                              translation.source !== entry.source && (
                                <label className="block text-xs font-semibold text-amber-800">
                                  {t("localeStudio.previousSource")}
                                  <textarea
                                    readOnly
                                    rows={4}
                                    value={translation.source}
                                    dir="auto"
                                    className={inputClass}
                                  />
                                </label>
                              )}
                            <label className="block text-xs font-semibold">
                              {t("localeStudio.translation", { locale })}
                              <textarea
                                rows={6}
                                value={translation?.text ?? ""}
                                dir="auto"
                                className={inputClass}
                                onChange={(event) =>
                                  editTranslation(event.target.value)
                                }
                              />
                            </label>
                            <p className="text-xs">
                              {t(
                                `localeStudio.status.${translationStatus(entry, translation)}`,
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={
                                  !translation?.text.trim() ||
                                  translationStatus(entry, translation) ===
                                    "reviewed"
                                }
                                onClick={() =>
                                  editTranslation(translation?.text ?? "", true)
                                }
                              >
                                {t("localeStudio.review")}
                              </button>
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={!translation?.reviewed}
                                onClick={() =>
                                  editTranslation(translation?.text ?? "")
                                }
                              >
                                {t("localeStudio.unreview")}
                              </button>
                              <button
                                type="button"
                                className={buttonClass}
                                onClick={() => editTranslation(entry.source)}
                              >
                                {t("localeStudio.copySource")}
                              </button>
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={!translation}
                                onClick={clearTranslation}
                              >
                                {t("localeStudio.clear")}
                              </button>
                            </div>
                            <p className="text-xs text-slate-600">
                              {t("localeStudio.reviewHelp")}
                            </p>
                          </div>
                        )}
                      </div>
                      {orphaned.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold">
                            {t("localeStudio.orphanDetails")}
                          </summary>
                          <p className="my-2 text-xs">
                            {t("localeStudio.orphanHelp")}
                          </p>
                          <ul className="space-y-1 text-xs">
                            {orphaned.slice(0, 30).map((row) => (
                              <li
                                key={row.pointer}
                                className="break-all font-mono"
                              >
                                {row.pointer}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => exportFile("catalog")}
                        >
                          {t("localeStudio.exportCatalog")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => exportFile("csv")}
                        >
                          {t("localeStudio.exportCsv")}
                        </button>
                      </div>
                      <p className="text-xs text-slate-600">
                        {t("localeStudio.catalogHelp")}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-xs font-semibold">
                          {t("localeStudio.policy")}
                          <select
                            value={policy}
                            className={inputClass}
                            onChange={(event) => {
                              setPolicy(
                                event.target.value as LocalizationPolicy,
                              );
                              invalidate();
                            }}
                          >
                            <option value="fallback">
                              {t("localeStudio.policy.fallback")}
                            </option>
                            <option value="strict">
                              {t("localeStudio.policy.strict")}
                            </option>
                          </select>
                        </label>
                        <label className="text-xs font-semibold">
                          {t("localeStudio.format")}
                          <select
                            value={format}
                            className={inputClass}
                            onChange={(event) => {
                              setFormat(event.target.value as SchemaFormat);
                              invalidate();
                            }}
                          >
                            <option value="json">JSON</option>
                            <option value="yaml">YAML</option>
                          </select>
                        </label>
                      </div>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={buildPreview}
                      >
                        {t("localeStudio.preview")}
                      </button>
                      <p className="text-xs text-slate-600">
                        {t("localeStudio.policyHelp")}
                      </p>
                      {preview && (
                        <div className="space-y-2">
                          <p className="text-xs">
                            {t("localeStudio.previewSummary", {
                              locale,
                              translated: String(preview.result.translated),
                              total: String(preview.result.summary.total),
                            })}
                          </p>
                          <textarea
                            readOnly
                            aria-label={t("localeStudio.previewText")}
                            rows={10}
                            value={(
                              preview.text ??
                              JSON.stringify(preview.result.document, null, 2)
                            ).slice(0, 16000)}
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                      )}
                      {!preview && (
                        <p className="text-xs">
                          {t("localeStudio.needsPreview")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={!ready}
                          onClick={() => exportFile("api")}
                        >
                          {t("localeStudio.exportApi")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={!ready}
                          onClick={() => exportFile("html")}
                        >
                          {t("localeStudio.exportHtml")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={!ready}
                          onClick={apply}
                        >
                          {t("localeStudio.apply")}
                        </button>
                      </div>
                      <p className="text-xs text-slate-600">
                        {t("localeStudio.htmlHelp")}
                      </p>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => exportFile("project")}
                    >
                      {t("localeStudio.exportProject")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => exportFile("progress")}
                    >
                      {t("localeStudio.exportProgress")}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    {t("localeStudio.exportHelp")}
                  </p>
                </>
              )}
              {undo && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={undoApply}
                >
                  {t("localeStudio.undo")}
                </button>
              )}
            </fieldset>
          </div>
        )}
      </details>
    );
  },
);
