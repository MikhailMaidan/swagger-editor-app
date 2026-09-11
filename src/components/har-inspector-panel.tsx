"use client";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  analyzeHarCapture,
  MAX_HAR_BYTES,
  parseHarCapture,
  serializeHarAnalysis,
  validHarPrefix,
  type HarCapture,
  type HarImportIssue,
} from "@/lib/har-inspector";
import type { EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const PAGE_SIZE = 25;

export const HarInspectorPanel = memo(function HarInspectorPanel({
  allEndpoints,
  visibleEndpoints,
  onSelectEndpoint,
}: {
  allEndpoints: EndpointSummary[];
  visibleEndpoints: EndpointSummary[];
  onSelectEndpoint: (method: string, path: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const generation = useRef(0);
  const [capture, setCapture] = useState<HarCapture | null>(null);
  const [input, setInput] = useState("");
  const [issue, setIssue] = useState<HarImportIssue | "read-error" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState("all");
  const [origin, setOrigin] = useState("");
  const [prefix, setPrefix] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("capture");
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState<{
    content: string;
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const endpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const invalidPrefix = !validHarPrefix(prefix);
  const analysis = useMemo(
    () =>
      capture && !invalidPrefix
        ? analyzeHarCapture(capture, endpoints, { origin, pathPrefix: prefix })
        : null,
    [capture, endpoints, origin, prefix, invalidPrefix],
  );
  const report = useMemo(
    () => (analysis && capture ? serializeHarAnalysis(analysis, capture) : ""),
    [analysis, capture],
  );
  const rows = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    const selected =
      analysis?.matches.filter((row) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "failed"
            ? row.failed
            : filter === "undocumented"
              ? row.undocumented
              : row.state === filter);
        if (!matchesFilter) return false;
        if (!terms.length) return true;
        const text =
          `${row.request.method} ${row.request.path} ${row.request.status} ${row.endpoint ?? ""}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      }) ?? [];
    if (sort === "slowest")
      selected.sort(
        (a, b) =>
          (b.request.durationMs ?? -1) - (a.request.durationMs ?? -1) ||
          a.request.index - b.request.index,
      );
    return selected;
  }, [analysis, query, filter, sort]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
  );
  const currentFeedback = feedback?.content === report ? feedback : null;

  function accept(text: string) {
    const parsed = parseHarCapture(text);
    if (!parsed.ok) {
      setIssue(parsed.issue);
      return;
    }
    setCapture(parsed.capture);
    setInput("");
    setIssue(null);
    setOrigin("");
    setFilter("all");
    setQuery("");
    setPage(0);
    setFeedback(null);
  }
  async function read(file: File) {
    const token = ++generation.current;
    setIssue(null);
    if (file.size > MAX_HAR_BYTES) {
      setIssue("too-large");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error());
        reader.onerror = () => reject(new Error());
        reader.onabort = () => reject(new Error());
        reader.readAsText(file);
      });
      if (token === generation.current) accept(text);
    } catch {
      if (token === generation.current) setIssue("read-error");
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function clear() {
    generation.current++;
    setCapture(null);
    setInput("");
    setIssue(null);
    setLoading(false);
    setFeedback(null);
    setOrigin("");
    setPage(0);
  }
  async function copy() {
    const success = await writeTextToClipboard(report);
    setFeedback({
      content: report,
      key: success ? "har.copySuccess" : "har.copyError",
      error: !success,
    });
  }
  function download() {
    const success = downloadTextFile(
      report,
      "rsswag-har-analysis.json",
      "application/json",
    );
    setFeedback({
      content: report,
      key: success ? "har.downloadSuccess" : "har.downloadError",
      error: !success,
    });
  }
  const ms = (value: number | null) =>
    value === null ? t("har.unknown") : `${value} ms`;

  return (
    <section
      aria-labelledby={id}
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <h3
        id={id}
        className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
      >
        {t("har.title")}
      </h3>
      <p className="mt-1 text-xs text-[color:var(--color-brand-muted)]">
        {t("har.description")}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold">
          {t("har.file")}
          <input
            type="file"
            accept=".har,.json,application/json"
            className={inputClass}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void read(file);
            }}
          />
        </label>
        <button
          type="button"
          className={buttonClass}
          disabled={!capture && !input && !loading && !issue}
          onClick={clear}
        >
          {t("har.clear")}
        </button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold">
          {t("har.paste")}
        </summary>
        <label className="mt-2 block text-xs font-bold">
          {t("har.json")}
          <textarea
            className={`${inputClass} font-mono`}
            rows={5}
            maxLength={MAX_HAR_BYTES}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={`${buttonClass} mt-2`}
          disabled={!input.trim()}
          onClick={() => {
            generation.current++;
            setLoading(false);
            accept(input);
          }}
        >
          {t("har.import")}
        </button>
      </details>
      {loading ? (
        <p className="mt-2 text-xs" aria-live="polite">
          {t("har.loading")}
        </p>
      ) : null}
      {issue ? (
        <p role="alert" className="mt-2 text-xs">
          {t(`har.${issue}`)}
        </p>
      ) : null}
      {capture ? (
        <>
          <p className="mt-3 text-xs font-semibold">
            {t("har.loaded", {
              accepted: String(capture.requests.length),
              skipped: String(capture.skipped),
            })}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold">
              {t("har.scope")}
              <select
                className={inputClass}
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">{t("har.allEndpoints")}</option>
                <option value="visible">{t("har.visibleEndpoints")}</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              {t("har.origin")}
              <select
                className={inputClass}
                value={origin}
                onChange={(event) => {
                  setOrigin(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">{t("har.allOrigins")}</option>
                {Array.from(
                  new Set(capture.requests.map((request) => request.origin)),
                )
                  .sort()
                  .map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs font-bold">
              {t("har.prefix")}
              <input
                className={`${inputClass} font-mono`}
                value={prefix}
                aria-invalid={invalidPrefix}
                maxLength={512}
                onChange={(event) => {
                  setPrefix(event.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
            {t("har.matchHelp")}
          </p>
          {invalidPrefix ? (
            <p role="alert" className="mt-2 text-xs">
              {t("har.invalidPrefix")}
            </p>
          ) : null}
        </>
      ) : null}
      {analysis ? (
        <>
          <p aria-live="polite" className="mt-3 text-xs font-bold">
            {t("har.summary", {
              total: String(analysis.summary.requests),
              matched: String(analysis.summary.matched),
              undocumented: String(analysis.summary.undocumented),
              failed: String(analysis.summary.failed),
            })}
          </p>
          <p className="mt-2 text-xs">
            {t("har.timing", {
              average: ms(analysis.summary.averageMs),
              p95: ms(analysis.summary.p95Ms),
              max: ms(analysis.summary.maxMs),
              count: String(analysis.summary.count),
            })}
          </p>
          <p className="mt-2 text-xs">
            {t("har.coverage", {
              observed: String(analysis.summary.observed),
              total: String(analysis.summary.operations),
              unmatched: String(analysis.summary.unmatched),
              ambiguous: String(analysis.summary.ambiguous),
            })}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold">
              {t("har.operations")}
            </summary>
            <div className="mt-2 max-h-72 overflow-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">{t("har.operations")}</caption>
                <thead>
                  <tr>
                    <th className="p-2">{t("har.endpoint")}</th>
                    <th className="p-2">{t("har.requests")}</th>
                    <th className="p-2">{t("har.failed")}</th>
                    <th className="p-2">{t("har.undocumented")}</th>
                    <th className="p-2">{t("har.status")}</th>
                    <th className="p-2">P95</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.operations.map((operation) => (
                    <tr
                      key={operation.key}
                      className="border-t border-[color:var(--color-brand-border)]"
                    >
                      <td className="p-2">
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() =>
                            onSelectEndpoint(operation.method, operation.path)
                          }
                        >
                          {operation.key}
                        </button>
                      </td>
                      <td className="p-2">{operation.requests}</td>
                      <td className="p-2">{operation.failed}</td>
                      <td className="p-2">{operation.undocumented}</td>
                      <td className="p-2">
                        {Object.entries(operation.statuses)
                          .map(([status, count]) => `${status} × ${count}`)
                          .join(", ") || "—"}
                      </td>
                      <td className="p-2">{ms(operation.timing.p95Ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold">
              {t("har.search")}
              <input
                type="search"
                className={inputClass}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="text-xs font-bold">
              {t("har.filter")}
              <select
                className={inputClass}
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(0);
                }}
              >
                {[
                  "all",
                  "matched",
                  "unmatched",
                  "ambiguous",
                  "undocumented",
                  "failed",
                ].map((value) => (
                  <option key={value} value={value}>
                    {t(`har.${value}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold">
              {t("har.sort")}
              <select
                className={inputClass}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(0);
                }}
              >
                <option value="capture">{t("har.captureOrder")}</option>
                <option value="slowest">{t("har.slowest")}</option>
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs">
            {t("har.rowCount", { count: String(rows.length) })}
          </p>
          <div className="mt-2 overflow-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{t("har.traffic")}</caption>
              <thead>
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">{t("har.request")}</th>
                  <th className="p-2">{t("har.status")}</th>
                  <th className="p-2">{t("har.duration")}</th>
                  <th className="p-2">{t("har.match")}</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map((row) => (
                    <tr
                      key={row.request.index}
                      className="border-t border-[color:var(--color-brand-border)]"
                    >
                      <td className="p-2">{row.request.index}</td>
                      <td className="max-w-sm break-all p-2 font-mono">
                        {row.request.method} {row.request.path}
                        <span className="block text-[color:var(--color-brand-muted)]">
                          {row.request.origin}
                        </span>
                      </td>
                      <td className="p-2">{row.request.status}</td>
                      <td className="p-2">{ms(row.request.durationMs)}</td>
                      <td className="p-2">
                        <span>{row.endpoint ?? t(`har.${row.state}`)}</span>
                        {row.undocumented ? (
                          <p>{t("har.undocumented")}</p>
                        ) : null}
                        {row.state === "ambiguous" ? (
                          <p className="font-mono">
                            {row.candidates.join(", ")}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {rows.length > PAGE_SIZE ? (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <button
                type="button"
                className={buttonClass}
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                {t("har.previous")}
              </button>
              <span>
                {t("har.page", {
                  current: String(currentPage + 1),
                  total: String(Math.ceil(rows.length / PAGE_SIZE)),
                })}
              </span>
              <button
                type="button"
                className={buttonClass}
                disabled={(currentPage + 1) * PAGE_SIZE >= rows.length}
                onClick={() => setPage(currentPage + 1)}
              >
                {t("har.next")}
              </button>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => void copy()}
            >
              {t("har.copy")}
            </button>
            <button type="button" className={buttonClass} onClick={download}>
              {t("har.download")}
            </button>
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
            {t("har.exportHelp")}
          </p>
          {currentFeedback ? (
            <p
              role={currentFeedback.error ? "alert" : undefined}
              aria-live="polite"
              className="mt-2 text-xs"
            >
              {t(currentFeedback.key)}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
});
