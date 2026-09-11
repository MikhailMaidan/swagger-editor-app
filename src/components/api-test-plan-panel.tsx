"use client";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  createApiTestPlan,
  importPlanProgress,
  MAX_PLAN_BYTES,
  MAX_PLAN_NOTE,
  PLAN_STATUSES,
  planSummary,
  serializeTestPlan,
  testPlanMarkdown,
  type PlanProgress,
  type PlanStatus,
} from "@/lib/api-test-plan";
import { writeTextToClipboard } from "@/lib/clipboard";
import type { EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import type { TranslationKey } from "@/lib/translations";

const button =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:opacity-50";
const input =
  "mt-1 w-full rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const PAGE_SIZE = 20;

export const ApiTestPlanPanel = memo(function ApiTestPlanPanel({
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
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expectation, setExpectation] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState("");
  const [progress, setProgress] = useState<PlanProgress>({});
  const [undo, setUndo] = useState<PlanProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    key: TranslationKey;
    error?: boolean;
    params?: Record<string, string>;
  } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const endpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const needsPlan = open || loading;
  const plan = useMemo(
    () => createApiTestPlan(needsPlan ? endpoints : []),
    [needsPlan, endpoints],
  );
  const cases = plan.cases;
  const snapshot = useRef({ cases, progress });
  useEffect(() => {
    snapshot.current = { cases, progress };
  }, [cases, progress]);
  const summary = planSummary(cases, progress);
  const rows = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    return cases.filter(
      (test) =>
        (status === "all" ||
          (progress[test.id]?.status ?? "pending") === status) &&
        (expectation === "all" || expectation === test.expectation) &&
        terms.every((term) =>
          `${test.method} ${test.path} ${test.location} ${test.name} ${test.value ?? ""}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [cases, query, status, expectation, progress]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
  );
  const pageRows = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const current = cases.find((test) => test.id === selected) ?? pageRows[0];
  const markdown = () =>
    testPlanMarkdown(cases, progress, {
      title: t("plan.title"),
      columns: [
        t("plan.endpoint"),
        t("plan.scenario"),
        t("plan.target"),
        t("plan.value"),
        t("plan.expectation"),
        t("plan.result"),
        t("plan.notes"),
      ],
      kind: (kind) => t(`plan.kind.${kind}`),
      status: (value) => t(`plan.${value}`),
      expectation: (value) => t(`plan.${value}`),
    });
  function changeResult(result: { status: PlanStatus; note: string }) {
    if (!current) return;
    setSelected(current.id);
    generation.current++;
    setLoading(false);
    setProgress((previous) => ({
      ...previous,
      [current.id]: { ...result, note: result.note.slice(0, MAX_PLAN_NOTE) },
    }));
    setMessage(null);
  }
  async function read(file: File) {
    const token = ++generation.current;
    setMessage(null);
    if (file.size > MAX_PLAN_BYTES) {
      setMessage({ key: "plan.too-large", error: true });
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
        reader.onerror = reader.onabort = () => reject(new Error());
        reader.readAsText(file);
      });
      if (token !== generation.current) return;
      const imported = importPlanProgress(text, snapshot.current.cases);
      if (!imported.ok) {
        setMessage({ key: `plan.${imported.issue}`, error: true });
        return;
      }
      setUndo(snapshot.current.progress);
      setProgress((previous) => ({ ...previous, ...imported.progress }));
      setMessage({
        key: "plan.restored",
        params: {
          restored: String(imported.restored),
          ignored: String(imported.ignored),
        },
      });
    } catch {
      if (token === generation.current)
        setMessage({ key: "plan.readError", error: true });
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function reset() {
    generation.current++;
    setLoading(false);
    setUndo(progress);
    setProgress({});
    setMessage({ key: "plan.resetDone" });
  }
  async function copy() {
    const ok = await writeTextToClipboard(markdown());
    setMessage({ key: ok ? "plan.copySuccess" : "plan.copyError", error: !ok });
  }
  function download(format: "json" | "md") {
    const content =
      format === "json" ? serializeTestPlan(cases, progress) : markdown();
    if (format === "json" && getByteSize(content) > MAX_PLAN_BYTES) {
      setMessage({ key: "plan.exportTooLarge", error: true });
      return;
    }
    const ok = downloadTextFile(
      content,
      `rsswag-api-test-plan.${format}`,
      format === "json" ? "application/json" : "text/markdown;charset=utf-8",
    );
    setMessage({
      key: ok ? "plan.downloadSuccess" : "plan.downloadError",
      error: !ok,
    });
  }
  return (
    <section
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
      aria-labelledby={id}
    >
      <h3
        id={id}
        className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={() => setOpen(!open)}
        >
          {t("plan.title")}
        </button>
      </h3>
      <p className="mt-1 text-xs text-[color:var(--color-brand-muted)]">
        {t("plan.description")}
      </p>
      {open ? (
        <div id={`${id}-content`}>
          <p className="mt-2 text-xs">{t("plan.help")}</p>
          {plan.truncated || plan.skipped ? (
            <p role="status" className="mt-2 text-xs">
              {t("plan.limits", { skipped: String(plan.skipped) })}
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">
              {t("plan.scope")}
              <select
                className={input}
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value);
                  setPage(0);
                  setSelected("");
                }}
              >
                <option value="all">{t("plan.allEndpoints")}</option>
                <option value="visible">{t("plan.visibleEndpoints")}</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              {t("plan.search")}
              <input
                type="search"
                className={input}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                  setSelected("");
                }}
              />
            </label>
            <label className="text-xs font-bold">
              {t("plan.resultFilter")}
              <select
                className={input}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(0);
                  setSelected("");
                }}
              >
                <option value="all">{t("plan.allResults")}</option>
                {PLAN_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`plan.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold">
              {t("plan.expectationFilter")}
              <select
                className={input}
                value={expectation}
                onChange={(event) => {
                  setExpectation(event.target.value);
                  setPage(0);
                  setSelected("");
                }}
              >
                <option value="all">{t("plan.allExpectations")}</option>
                {(["accept", "reject", "review"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`plan.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs font-bold" aria-live="polite">
            {t(
              "plan.summary",
              Object.fromEntries(
                Object.entries(summary).map(([key, value]) => [
                  key,
                  String(value),
                ]),
              ),
            )}
          </p>
          <p className="mt-2 text-xs">
            {t("plan.count", { count: String(rows.length) })}
          </p>
          <div className="mt-2 overflow-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{t("plan.cases")}</caption>
              <thead>
                <tr>
                  <th className="p-2">{t("plan.endpoint")}</th>
                  <th className="p-2">{t("plan.scenario")}</th>
                  <th className="p-2">{t("plan.result")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((test) => (
                  <tr
                    key={test.id}
                    className="border-t border-[color:var(--color-brand-border)]"
                  >
                    <td className="max-w-xs break-all p-2 font-mono">
                      {test.method} {test.path}
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        className={button}
                        aria-pressed={current?.id === test.id}
                        onClick={() => setSelected(test.id)}
                      >
                        {t(`plan.kind.${test.kind}`)} · {test.location}{" "}
                        {test.name}
                      </button>
                    </td>
                    <td className="p-2">
                      {t(`plan.${progress[test.id]?.status ?? "pending"}`)}
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
                className={button}
                disabled={!currentPage}
                onClick={() => {
                  setPage(currentPage - 1);
                  setSelected("");
                }}
              >
                {t("plan.previous")}
              </button>
              <span>
                {t("plan.page", {
                  page: String(currentPage + 1),
                  total: String(Math.ceil(rows.length / PAGE_SIZE)),
                })}
              </span>
              <button
                type="button"
                className={button}
                disabled={(currentPage + 1) * PAGE_SIZE >= rows.length}
                onClick={() => {
                  setPage(currentPage + 1);
                  setSelected("");
                }}
              >
                {t("plan.next")}
              </button>
            </div>
          ) : null}
          {current ? (
            <div
              className="mt-3 rounded-lg border border-[color:var(--color-brand-border)] p-3"
              role="group"
              aria-label={t("plan.selected")}
            >
              <p className="break-all text-xs font-bold">
                {current.method} {current.path} ·{" "}
                {t(`plan.kind.${current.kind}`)}
              </p>
              <p className="mt-2 break-all text-xs">
                {t("plan.target")}: {current.location} {current.name}
              </p>
              <p className="mt-2 text-xs">
                {t("plan.expectation")}: {t(`plan.${current.expectation}`)}
              </p>
              {current.value !== null ? (
                <pre
                  className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-xs"
                  aria-label={t("plan.value")}
                >
                  {JSON.stringify(current.value)}
                </pre>
              ) : null}
              <button
                type="button"
                className={`${button} mt-2`}
                onClick={() => onSelectEndpoint(current.method, current.path)}
              >
                {t("plan.openEndpoint")}
              </button>
              <label className="mt-3 block text-xs font-bold">
                {t("plan.result")}
                <select
                  className={input}
                  value={progress[current.id]?.status ?? "pending"}
                  onChange={(event) =>
                    changeResult({
                      status: event.target.value as PlanStatus,
                      note: progress[current.id]?.note ?? "",
                    })
                  }
                >
                  {PLAN_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {t(`plan.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 block text-xs font-bold">
                {t("plan.notes")}
                <textarea
                  className={input}
                  rows={3}
                  maxLength={MAX_PLAN_NOTE}
                  value={progress[current.id]?.note ?? ""}
                  onChange={(event) =>
                    changeResult({
                      status: progress[current.id]?.status ?? "pending",
                      note: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          ) : (
            <p className="mt-3 text-xs">{t("plan.empty")}</p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <button
              type="button"
              className={button}
              disabled={!cases.length}
              onClick={() => void copy()}
            >
              {t("plan.copy")}
            </button>
            <button
              type="button"
              className={button}
              disabled={!cases.length}
              onClick={() => download("json")}
            >
              {t("plan.json")}
            </button>
            <button
              type="button"
              className={button}
              disabled={!cases.length}
              onClick={() => download("md")}
            >
              {t("plan.markdown")}
            </button>
            <label className="text-xs font-bold">
              {t("plan.import")}
              <input
                type="file"
                accept=".json,application/json"
                className={input}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void read(file);
                }}
              />
            </label>
            <button
              type="button"
              className={button}
              disabled={!Object.keys(progress).length && !loading}
              onClick={reset}
            >
              {t("plan.reset")}
            </button>
            {undo ? (
              <button
                type="button"
                className={button}
                onClick={() => {
                  generation.current++;
                  setLoading(false);
                  setProgress(undo);
                  setUndo(null);
                  setMessage(null);
                }}
              >
                {t("plan.undo")}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
            {t("plan.exportHelp")}
          </p>
          {loading ? (
            <p className="mt-2 text-xs" role="status">
              {t("plan.loading")}
            </p>
          ) : null}
          {message ? (
            <p
              className="mt-2 text-xs"
              role={message.error ? "alert" : "status"}
            >
              {t(message.key, message.params)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
