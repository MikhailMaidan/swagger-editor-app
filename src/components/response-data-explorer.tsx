"use client";

import { memo, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { isCancelRequestShortcut } from "@/lib/keyboard-shortcut";
import { downloadTextFile } from "@/lib/schema-download";
import {
  createExplorerTable,
  explorerCell,
  exportExplorerCsv,
  filterExplorerRows,
  indexResponseJson,
  isExplorerPointer,
  previewJsonValue,
  searchExplorerNodes,
  truncateJsonPreview,
  type ExplorerIndex,
  type JsonValueType,
} from "@/lib/response-data-explorer";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const PAGE_SIZE = 25;

function ExplorerContent({
  index,
  endpoint,
}: {
  index: Extract<ExplorerIndex, { ok: true }>;
  endpoint: { method: string; path: string };
}) {
  const { t } = useI18n();
  const id = useId();
  const [pointer, setPointer] = useState("");
  const [inputPointer, setInputPointer] = useState("");
  const [pointerError, setPointerError] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<JsonValueType | "all">("all");
  const [page, setPage] = useState(0);
  const [view, setView] = useState("browse");
  const [rowQuery, setRowQuery] = useState("");
  const [rowPage, setRowPage] = useState(0);
  const [hiddenColumns, setHiddenColumns] = useState<(string | null)[]>([]);
  const exportGeneration = useRef(0);
  const [feedback, setFeedback] = useState<{
    context: string;
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const node = index.nodes.get(pointer)!;
  const selectedJson = useMemo(
    () => JSON.stringify(node.value, null, 2),
    [node],
  );
  const searching = Boolean(query.trim()) || type !== "all";
  const nodes = useMemo(
    () =>
      searching
        ? searchExplorerNodes(index, query, type)
        : node.children.map((child) => index.nodes.get(child)!),
    [index, node, query, type, searching],
  );
  const table = useMemo(() => createExplorerTable(node.value), [node]);
  const columns = table.ok
    ? table.columns.filter((column) => !hiddenColumns.includes(column))
    : [];
  const rows = useMemo(
    () =>
      table.ok
        ? filterExplorerRows(
            table,
            table.columns.filter((column) => !hiddenColumns.includes(column)),
            rowQuery,
          )
        : [],
    [table, hiddenColumns, rowQuery],
  );
  const context = JSON.stringify([pointer, view, rowQuery, hiddenColumns]);
  const currentFeedback = feedback?.context === context ? feedback : null;
  const ancestors = [];
  let ancestor = node;
  while (ancestor.parent !== null) {
    ancestor = index.nodes.get(ancestor.parent)!;
    ancestors.unshift(ancestor);
  }

  function navigate(next: string) {
    exportGeneration.current += 1;
    setPointer(next);
    setInputPointer(next);
    setPointerError(false);
    setQuery("");
    setType("all");
    setPage(0);
    setView("browse");
    setRowQuery("");
    setRowPage(0);
    setHiddenColumns([]);
    setFeedback(null);
  }
  async function copy(kind: "json" | "pointer") {
    const generation = ++exportGeneration.current;
    const success = await writeTextToClipboard(
      kind === "json" ? selectedJson : pointer,
    );
    if (generation !== exportGeneration.current) return;
    setFeedback({
      context,
      key: success ? "explorer.copySuccess" : "explorer.copyError",
      error: !success,
    });
  }
  function download(kind: "json" | "csv") {
    exportGeneration.current += 1;
    const slug = `${endpoint.method}-${endpoint.path}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 80)
      .replace(/^-+|-+$/g, "");
    const content =
      kind === "csv" && table.ok
        ? exportExplorerCsv(table, columns, rowQuery, t("explorer.value"))
        : selectedJson;
    const success = downloadTextFile(
      content,
      `rsswag-${slug || "endpoint"}-response-data.${kind}`,
      kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
    );
    setFeedback({
      context,
      key: success ? "explorer.downloadSuccess" : "explorer.downloadError",
      error: !success,
    });
  }

  return (
    <section aria-labelledby={id} className="mt-3">
      <h4 id={id} className="text-sm font-bold">
        {t("explorer.navigator")}
      </h4>
      <p className="mt-1 text-xs text-[color:var(--color-brand-muted)]">
        {t("explorer.description")}
      </p>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !isExplorerPointer(inputPointer) ||
            !index.nodes.has(inputPointer)
          )
            setPointerError(true);
          else navigate(inputPointer);
        }}
      >
        <label className="min-w-0 flex-1 text-xs font-bold">
          {t("explorer.pointer")}
          <input
            className={`${inputClass} font-mono`}
            value={inputPointer}
            aria-invalid={pointerError}
            onChange={(event) => {
              setInputPointer(event.target.value);
              setPointerError(false);
            }}
          />
        </label>
        <button type="submit" className={buttonClass}>
          {t("explorer.go")}
        </button>
      </form>
      {pointerError ? (
        <p role="alert" className="mt-2 text-xs">
          {t("explorer.pointerError")}
        </p>
      ) : null}
      <nav
        aria-label={t("explorer.breadcrumbs")}
        className="mt-3 flex flex-wrap items-center gap-2 text-xs"
      >
        {ancestors.map((entry) => (
          <button
            key={entry.pointer}
            type="button"
            className={buttonClass}
            onClick={() => navigate(entry.pointer)}
          >
            {entry.parent === null
              ? t("explorer.root")
              : JSON.stringify(entry.key)}
          </button>
        ))}
        <span aria-current="location" className="break-all font-mono">
          {pointer === "" ? t("explorer.root") : JSON.stringify(node.key)}
        </span>
      </nav>
      <p className="mt-2 text-xs" aria-live="polite">
        {t("explorer.selected", {
          type: node.type,
          children: String(node.children.length),
          total: String(index.nodes.size),
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => void copy("pointer")}
        >
          {t("explorer.copyPointer")}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void copy("json")}
        >
          {t("explorer.copyJson")}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => download("json")}
        >
          {t("explorer.downloadJson")}
        </button>
      </div>
      {node.type === "array" ? (
        <label className="mt-3 block max-w-xs text-xs font-bold">
          {t("explorer.view")}
          <select
            className={inputClass}
            value={view}
            onChange={(event) => setView(event.target.value)}
          >
            <option value="browse">{t("explorer.browse")}</option>
            <option value="table">{t("explorer.table")}</option>
          </select>
        </label>
      ) : null}
      {view === "table" && node.type === "array" ? (
        table.ok ? (
          <>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold">
                {t("explorer.columns")}
              </summary>
              <div className="mt-2 flex flex-wrap gap-3">
                {table.columns.map((column) => (
                  <label
                    key={JSON.stringify(column)}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={columns.includes(column)}
                      onChange={(event) => {
                        setHiddenColumns((current) =>
                          event.target.checked
                            ? current.filter((entry) => entry !== column)
                            : [...current, column],
                        );
                        setRowPage(0);
                      }}
                    />
                    {column === null
                      ? t("explorer.value")
                      : JSON.stringify(column)}
                  </label>
                ))}
              </div>
            </details>
            <label className="mt-3 block text-xs font-bold">
              {t("explorer.filterRows")}
              <input
                type="search"
                aria-keyshortcuts="Escape"
                title={t("common.clearSearchShortcut")}
                className={inputClass}
                value={rowQuery}
                onChange={(event) => {
                  setRowQuery(event.target.value);
                  setRowPage(0);
                }}
                onKeyDown={(event) => {
                  if (
                    rowQuery &&
                    !event.nativeEvent.isComposing &&
                    isCancelRequestShortcut(event)
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    setRowQuery("");
                    setRowPage(0);
                  }
                }}
              />
            </label>
            <p className="mt-2 text-xs">
              {t("explorer.rowCount", {
                count: String(rows.length),
                total: String(table.rows.length),
              })}
            </p>
            <div className="mt-2 overflow-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  {t("explorer.tableCaption")}
                </caption>
                <thead>
                  <tr>
                    <th className="p-2">#</th>
                    {columns.map((column) => (
                      <th key={JSON.stringify(column)} className="p-2">
                        {column === null
                          ? t("explorer.value")
                          : JSON.stringify(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice(rowPage * PAGE_SIZE, (rowPage + 1) * PAGE_SIZE)
                    .map(({ row, index: rowIndex }) => (
                      <tr
                        key={rowIndex}
                        className="border-t border-[color:var(--color-brand-border)]"
                      >
                        <td className="p-2">
                          <button
                            type="button"
                            className={buttonClass}
                            aria-label={t("explorer.exploreRow", {
                              number: String(rowIndex),
                            })}
                            onClick={() => navigate(pointer + "/" + rowIndex)}
                          >
                            {rowIndex}
                          </button>
                        </td>
                        {columns.map((column) => {
                          const value = explorerCell(row, column);
                          return (
                            <td
                              key={JSON.stringify(column)}
                              className="max-w-xs break-words p-2 font-mono"
                            >
                              {value === undefined
                                ? t("explorer.missing")
                                : previewJsonValue(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={rowPage}
              count={rows.length}
              onPage={setRowPage}
            />
            <button
              type="button"
              className={`${buttonClass} mt-2`}
              disabled={!columns.length}
              onClick={() => download("csv")}
            >
              {t("explorer.downloadCsv")}
            </button>
            <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
              {t("explorer.csvHelp")}
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs">{t(`explorer.${table.issue}`)}</p>
        )
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">
              {t("explorer.search")}
              <input
                type="search"
                aria-keyshortcuts="Escape"
                title={t("common.clearSearchShortcut")}
                className={inputClass}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                onKeyDown={(event) => {
                  if (
                    query &&
                    !event.nativeEvent.isComposing &&
                    isCancelRequestShortcut(event)
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery("");
                    setPage(0);
                  }
                }}
              />
            </label>
            <label className="text-xs font-bold">
              {t("explorer.typeFilter")}
              <select
                className={inputClass}
                value={type}
                onChange={(event) => {
                  setType(event.target.value as JsonValueType | "all");
                  setPage(0);
                }}
              >
                {[
                  "all",
                  "object",
                  "array",
                  "string",
                  "number",
                  "boolean",
                  "null",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value === "all" ? t("explorer.allTypes") : value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs">
            {t(searching ? "explorer.matches" : "explorer.children", {
              count: String(nodes.length),
            })}
          </p>
          <ul className="mt-2 space-y-1">
            {nodes
              .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
              .map((entry) => (
                <li key={entry.pointer}>
                  <button
                    type="button"
                    className={`${buttonClass} flex w-full flex-wrap justify-between gap-2 text-left`}
                    onClick={() => navigate(entry.pointer)}
                  >
                    <span className="break-all font-mono">
                      {searching
                        ? entry.pointer || t("explorer.root")
                        : JSON.stringify(entry.key)}
                    </span>
                    <span className="break-all font-mono font-normal">
                      {entry.type} · {previewJsonValue(entry.value)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <Pagination page={page} count={nodes.length} onPage={setPage} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold">
              {t("explorer.preview")}
            </summary>
            <pre
              aria-label={t("explorer.previewLabel")}
              className="mt-2 max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs"
            >
              {truncateJsonPreview(selectedJson, 8000)}
            </pre>
            {selectedJson.length > 8000 ? (
              <p className="mt-2 text-xs">{t("explorer.truncated")}</p>
            ) : null}
          </details>
        </>
      )}
      {currentFeedback ? (
        <p
          role={currentFeedback.error ? "alert" : undefined}
          aria-live="polite"
          className="mt-2 text-xs"
        >
          {t(currentFeedback.key)}
        </p>
      ) : null}
    </section>
  );
}

function Pagination({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  if (count <= PAGE_SIZE) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <button
        type="button"
        className={buttonClass}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        {t("explorer.previous")}
      </button>
      <span>
        {t("explorer.page", {
          page: String(page + 1),
          total: String(Math.ceil(count / PAGE_SIZE)),
        })}
      </span>
      <button
        type="button"
        className={buttonClass}
        disabled={(page + 1) * PAGE_SIZE >= count}
        onClick={() => onPage(page + 1)}
      >
        {t("explorer.next")}
      </button>
    </div>
  );
}

function ExplorerSession({
  body,
  endpoint,
}: {
  body: string;
  endpoint: { method: string; path: string };
}) {
  const { t } = useI18n();
  const index = useMemo(() => indexResponseJson(body), [body]);
  return index.ok ? (
    <ExplorerContent index={index} endpoint={endpoint} />
  ) : (
    <p className="mt-3 text-xs">{t(`explorer.${index.issue}`)}</p>
  );
}

export const ResponseDataExplorer = memo(function ResponseDataExplorer({
  body,
  endpoint,
}: {
  body: string | null;
  endpoint: { method: string; path: string };
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (body === null) return null;
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="mt-4 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("explorer.title")}
      </summary>
      {open ? (
        <ExplorerSession key={body} body={body} endpoint={endpoint} />
      ) : null}
    </details>
  );
});
