"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  MAX_MIGRATION_BYTES,
  MigrationError,
  buildPostmanMigration,
  parseMigrationCollection,
  parseMigrationEnvironment,
  parseMigrationOverrides,
  serializePostmanMigration,
  type MigrationCollection,
  type MigrationResult,
} from "@/lib/postman-migration";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { truncateJsonPreview } from "@/lib/response-data-explorer";
import type { SchemaFormat } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
type Feedback = { key: TranslationKey; error: boolean };

export const PostmanMigrationPanel = memo(function PostmanMigrationPanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [collection, setCollection] = useState<MigrationCollection | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [environment, setEnvironment] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState("{}");
  const [selected, setSelected] = useState<string[]>([]);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [fallback, setFallback] = useState("");
  const [examples, setExamples] = useState(false);
  const [required, setRequired] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{
    draft: MigrationResult;
    source: string;
  } | null>(null);
  const [format, setFormat] = useState<SchemaFormat>("yaml");
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const importGeneration = useRef(0),
    exportGeneration = useRef(0);
  useEffect(
    () => () => {
      importGeneration.current++;
      exportGeneration.current++;
    },
    [],
  );
  const matches = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (
      collection?.requests.filter((r) =>
        terms.every((term) =>
          `${r.method} ${r.name} ${r.folders.join(" ")}`
            .toLowerCase()
            .includes(term),
        ),
      ) ?? []
    );
  }, [collection, search]);
  const lastPage = Math.max(0, Math.ceil(matches.length / 25) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = matches.slice(currentPage * 25, (currentPage + 1) * 25);
  const output = useMemo(() => {
    if (!result?.draft.canExport) return null;
    try {
      return {
        text: serializePostmanMigration(result.draft, format),
        error: false,
      };
    } catch {
      return { text: "", error: true };
    }
  }, [result, format]);
  function clearFeedback() {
    exportGeneration.current++;
    setFeedback(null);
  }
  function invalidate() {
    clearFeedback();
    setResult(null);
  }
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof MigrationError
          ? `migration.error.${error.code}`
          : "migration.error.read",
      error: true,
    });
  }
  function accept(text: string, kind: "collection" | "environment") {
    try {
      if (kind === "collection") {
        const next = parseMigrationCollection(text);
        setCollection(next);
        setTitle(next.name.slice(0, 200));
        setVersion("1.0.0");
        setSelected(next.requests.map((r) => r.id));
        setPaths({});
        setSearch("");
        setPage(0);
        setEnvironment({});
        setOverrides("{}");
        setFallback("");
        setExamples(false);
        setRequired(false);
        setInput("");
      } else setEnvironment(parseMigrationEnvironment(text));
      invalidate();
      setFeedback({ key: "migration.imported", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, kind: "collection" | "environment") {
    clearFeedback();
    const token = ++importGeneration.current;
    setLoading(true);
    try {
      if (file.size > MAX_MIGRATION_BYTES) throw new MigrationError("limit");
      const text = await file.text();
      if (token === importGeneration.current) accept(text, kind);
    } catch (error) {
      if (token === importGeneration.current) fail(error);
    } finally {
      if (token === importGeneration.current) setLoading(false);
    }
  }
  function generate() {
    invalidate();
    if (!collection) return;
    try {
      const draft = buildPostmanMigration(collection, {
        title,
        version,
        selectedIds: selected,
        paths,
        environment,
        overrides: parseMigrationOverrides(overrides),
        fallbackServer: fallback.trim(),
        includeExamples: examples,
        requireObserved: required,
      });
      setResult({ draft, source: getSchemaText() });
    } catch (error) {
      fail(error);
    }
  }
  async function exportDocument(copy: boolean) {
    if (!output || output.error || loading) return;
    clearFeedback();
    const token = exportGeneration.current;
    const ok = copy
      ? await writeTextToClipboard(output.text)
      : downloadTextFile(
          output.text,
          `postman-api.${format}`,
          format === "json" ? "application/json" : "application/yaml",
        );
    if (token === exportGeneration.current)
      setFeedback({
        key: ok
          ? copy
            ? "migration.copied"
            : "migration.downloaded"
          : copy
            ? "migration.error.copy"
            : "migration.error.download",
        error: !ok,
      });
  }
  function apply() {
    clearFeedback();
    if (!result || !output || output.error || loading) return;
    if (getSchemaText() !== result.source) {
      setFeedback({ key: "migration.error.stale", error: true });
      return;
    }
    setUndo({ before: result.source, after: output.text });
    onApply(output.text);
    setFeedback({ key: "migration.applied", error: false });
  }
  function restore() {
    clearFeedback();
    if (!undo || loading) return;
    if (getSchemaText() !== undo.after) {
      setFeedback({ key: "migration.error.undo", error: true });
      return;
    }
    onApply(undo.before);
    setUndo(null);
    setFeedback({ key: "migration.undone", error: false });
  }
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("migration.title")}
      </summary>
      {open && (
        <div className="space-y-4 border-t border-[color:var(--color-brand-border)] p-5 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("migration.description")}</p>
          <p className="text-xs text-slate-600">{t("migration.privacy")}</p>
          <label className="block text-xs font-bold">
            {t("migration.file")}
            <input
              className={inputClass}
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void read(file, "collection");
              }}
            />
          </label>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer font-bold">
              {t("migration.pasteHeading")}
            </summary>
            <label className="mt-3 block text-xs font-bold">
              {t("migration.paste")}
              <textarea
                className={`${inputClass} font-mono`}
                rows={5}
                disabled={loading}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className={`${buttonClass} mt-2`}
              disabled={loading || !input.trim()}
              onClick={() => {
                clearFeedback();
                accept(input, "collection");
              }}
            >
              {t("migration.import")}
            </button>
          </details>
          {loading && <p role="status">{t("migration.loading")}</p>}
          <fieldset disabled={loading} className="min-w-0 space-y-4">
            {collection && (
              <>
                <p className="break-all font-bold">
                  {collection.name} ·{" "}
                  {t("migration.selected", {
                    count: String(selected.length),
                    total: String(collection.requests.length),
                  })}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-bold">
                    {t("migration.apiTitle")}
                    <input
                      className={inputClass}
                      value={title}
                      maxLength={200}
                      onChange={(e) => {
                        invalidate();
                        setTitle(e.target.value);
                      }}
                    />
                  </label>
                  <label className="text-xs font-bold">
                    {t("migration.version")}
                    <input
                      className={inputClass}
                      value={version}
                      maxLength={80}
                      onChange={(e) => {
                        invalidate();
                        setVersion(e.target.value);
                      }}
                    />
                  </label>
                </div>
                <details className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer font-bold">
                    {t("migration.variablesHeading")}
                  </summary>
                  <p className="text-xs text-slate-600">
                    {t("migration.variablesHelp")}
                  </p>
                  <label className="block text-xs font-bold">
                    {t("migration.environment")}
                    <input
                      className={inputClass}
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void read(file, "environment");
                      }}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {t("migration.environmentCount", {
                        count: String(Object.keys(environment).length),
                      })}
                    </span>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        invalidate();
                        setEnvironment({});
                      }}
                    >
                      {t("migration.clearEnvironment")}
                    </button>
                  </div>
                  <label className="block text-xs font-bold">
                    {t("migration.overrides")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={4}
                      value={overrides}
                      spellCheck={false}
                      onChange={(e) => {
                        invalidate();
                        setOverrides(e.target.value);
                      }}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {t("migration.fallback")}
                    <input
                      className={inputClass}
                      value={fallback}
                      placeholder="https://api.example.com"
                      onChange={(e) => {
                        invalidate();
                        setFallback(e.target.value);
                      }}
                    />
                  </label>
                </details>
                <div className="space-y-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={examples}
                      onChange={(e) => {
                        invalidate();
                        setExamples(e.target.checked);
                      }}
                    />
                    {t("migration.examples")}
                  </label>
                  <p className="text-xs text-slate-600">
                    {t("migration.examplesHelp")}
                  </p>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={required}
                      onChange={(e) => {
                        invalidate();
                        setRequired(e.target.checked);
                      }}
                    />
                    {t("migration.required")}
                  </label>
                </div>
                <label className="block text-xs font-bold">
                  {t("migration.search")}
                  <input
                    className={inputClass}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearch("");
                        setPage(0);
                      }
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!matches.length}
                    onClick={() => {
                      invalidate();
                      setSelected([
                        ...new Set([...selected, ...matches.map((r) => r.id)]),
                      ]);
                    }}
                  >
                    {t("migration.selectFiltered")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!matches.length}
                    onClick={() => {
                      invalidate();
                      const ids = new Set(matches.map((r) => r.id));
                      setSelected(selected.filter((id) => !ids.has(id)));
                    }}
                  >
                    {t("migration.deselectFiltered")}
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  {t("migration.pathHelp")}
                </p>
                <ul className="space-y-2">
                  {visible.map((r) => (
                    <li
                      key={r.id}
                      className="space-y-2 rounded-lg border border-slate-200 p-3"
                    >
                      <label className="flex items-start gap-2 break-all font-bold">
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          aria-label={t("migration.selectRequest", {
                            name: r.name,
                            id: r.id,
                          })}
                          onChange={(e) => {
                            invalidate();
                            setSelected(
                              e.target.checked
                                ? [...selected, r.id]
                                : selected.filter((id) => id !== r.id),
                            );
                          }}
                        />
                        <span>
                          {r.method} · {r.name}
                        </span>
                      </label>
                      {r.folders.length > 0 && (
                        <p className="break-all text-xs text-slate-600">
                          {r.folders.join(" / ")}
                        </p>
                      )}
                      <label className="block text-xs">
                        {t("migration.pathOverride", {
                          name: r.name,
                          id: r.id,
                        })}
                        <input
                          className={inputClass}
                          value={paths[r.id] ?? ""}
                          placeholder="/users/{id}"
                          onChange={(e) => {
                            invalidate();
                            setPaths({ ...paths, [r.id]: e.target.value });
                          }}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                {!matches.length && <p>{t("migration.noMatches")}</p>}
                {lastPage > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {t("migration.previous")}
                    </button>
                    <span>
                      {t("migration.page", {
                        page: String(currentPage + 1),
                        total: String(lastPage + 1),
                      })}
                    </span>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={currentPage === lastPage}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {t("migration.next")}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!selected.length}
                  onClick={generate}
                >
                  {t("migration.generate")}
                </button>
              </>
            )}
            {result && (
              <section
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                aria-label={t("migration.result")}
              >
                <p className="font-bold">
                  {t("migration.summary", {
                    requests: String(result.draft.requests),
                    operations: String(result.draft.operations.length),
                  })}
                </p>
                <p className="text-xs">{t("migration.review")}</p>
                <details>
                  <summary className="cursor-pointer font-bold">
                    {t("migration.operations")}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {result.draft.operations.map((op) => (
                      <li
                        key={`${op.method} ${op.path}`}
                        className="break-all font-mono"
                      >
                        {op.method} {op.path} · {op.requestCount}
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="font-bold">
                  {t("migration.diagnostics", {
                    count: String(result.draft.diagnosticCount),
                    shown: String(result.draft.diagnostics.length),
                  })}
                </p>
                <ul className="max-h-80 space-y-2 overflow-auto text-xs">
                  {result.draft.diagnostics.map((d) => (
                    <li
                      key={`${d.requestId} ${d.code}`}
                      className={
                        d.severity === "error"
                          ? "text-red-700"
                          : "text-amber-800"
                      }
                    >
                      <strong>
                        {t(`migration.severity.${d.severity}`)} ·{" "}
                        {
                          collection?.requests.find((r) => r.id === d.requestId)
                            ?.name
                        }{" "}
                        ({d.requestId})
                      </strong>
                      <p>{t(`migration.diagnostic.${d.code}`)}</p>
                    </li>
                  ))}
                </ul>
                {!result.draft.canExport && (
                  <p role="alert" className="text-red-700">
                    {t("migration.blocked")}
                  </p>
                )}
                {output?.error && (
                  <p role="alert" className="text-red-700">
                    {t("migration.error.output")}
                  </p>
                )}
                {output && !output.error && (
                  <>
                    <label className="block text-xs font-bold">
                      {t("migration.format")}
                      <select
                        className={inputClass}
                        value={format}
                        onChange={(e) => {
                          clearFeedback();
                          setFormat(e.target.value as SchemaFormat);
                        }}
                      >
                        <option value="yaml">YAML</option>
                        <option value="json">JSON</option>
                      </select>
                    </label>
                    <details>
                      <summary className="cursor-pointer font-bold">
                        {t("migration.preview")}
                      </summary>
                      <pre
                        className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-3 text-xs"
                        aria-label={t("migration.preview")}
                      >
                        {truncateJsonPreview(output.text, 12000)}
                      </pre>
                    </details>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => void exportDocument(true)}
                      >
                        {t("migration.copy")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => void exportDocument(false)}
                      >
                        {t("migration.download")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={apply}
                      >
                        {t("migration.apply")}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">
                      {t("migration.applyHelp")}
                    </p>
                  </>
                )}
              </section>
            )}
            {undo && (
              <button type="button" className={buttonClass} onClick={restore}>
                {t("migration.undo")}
              </button>
            )}
          </fieldset>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-green-800"}
            >
              {t(feedback.key)}
            </p>
          )}
        </div>
      )}
    </details>
  );
});
