"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_TRACE_BYTES,
  MAX_TRACE_BUDGETS,
  TRACE_METRICS,
  TraceError,
  newTraceBudget,
  normalizeTraceProject,
  parseTraceProject,
  readTraceData,
  serializeTraceProject,
  traceMs,
  type TraceBudget,
  type TraceProject,
} from "@/lib/trace-data";
import {
  analyzeTraceData,
  evaluateTraceBudgets,
  traceReport,
  type TraceBudgetResult,
  type TraceSpanTiming,
} from "@/lib/trace-analysis";
import {
  childTraceContext,
  inspectTraceContext,
  newTraceContext,
  readTraceParent,
  updateTraceState,
} from "@/lib/trace-context";
import { demoTraceProject, emptyTraceProject } from "@/lib/trace-demo";
import { sliceTraceSource, traceViewerHtml } from "@/lib/trace-export";
import type { TranslationKey } from "@/lib/translations";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const integer = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
function nextId(values: string[]) {
  let n = 1;
  while (values.includes(`budget-${n}`)) n++;
  return `budget-${n}`;
}
function drafts(p: TraceProject, id: string) {
  const b = p.budgets.find((b) => b.id === id);
  return {
    name: p.name,
    source: p.source,
    traceparent: p.context.traceparent,
    tracestate: p.context.tracestate,
    budget: b ? { ...b, minMatches: String(b.minMatches) } : null,
  };
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea
          className={`${inputClass} font-mono`}
          rows={7}
          spellCheck={false}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          autoComplete="off"
          spellCheck={false}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  disabled = false,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      <select
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
const chronological = (a: TraceSpanTiming, b: TraceSpanTiming) =>
  BigInt(a.span.startNs) < BigInt(b.span.startNs)
    ? -1
    : BigInt(a.span.startNs) > BigInt(b.span.startNs)
      ? 1
      : a.span.index - b.span.index;
const serviceLabel = (service: { name: string; namespace: string }) =>
  [service.namespace, service.name].filter(Boolean).join(" / ");

export const TraceStudioPanel = memo(function TraceStudioPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyTraceProject),
    [budgetId, setBudgetId] = useState("budget-1"),
    [draft, setDraft] = useState(() => drafts(emptyTraceProject(), "budget-1"));
  const [traceId, setTraceId] = useState(""),
    [spanKey, setSpanKey] = useState(""),
    [search, setSearch] = useState(""),
    [service, setService] = useState(""),
    [errorsOnly, setErrorsOnly] = useState(false),
    [page, setPage] = useState(0);
  const [sampled, setSampled] = useState(true),
    [vendorKey, setVendorKey] = useState(""),
    [vendorValue, setVendorValue] = useState(""),
    [contextInspection, setContextInspection] = useState<ReturnType<
      typeof inspectTraceContext
    > | null>(null);
  const [results, setResults] = useState<TraceBudgetResult[] | null>(null),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
      values?: Record<string, string>;
    } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const analysis = useMemo(
    () => (open ? analyzeTraceData(project.source) : null),
    [open, project.source],
  );
  const selectedTrace =
    analysis?.traces.find((tr) => tr.traceId === traceId) ??
    analysis?.traces[0];
  const selected =
    analysis?.timings.find((timing) => timing.span.key === spanKey) ??
    analysis?.timings.find(
      (timing) => timing.span.traceId === selectedTrace?.traceId,
    );
  const pending = json(draft) !== json(drafts(project, budgetId)),
    locked = busy || pending;
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows = (analysis?.timings ?? [])
    .filter(
      (timing) =>
        timing.span.traceId === selectedTrace?.traceId &&
        (!service || timing.span.serviceKey === service) &&
        (!errorsOnly || timing.span.status === 2) &&
        terms.every((term) =>
          [
            timing.span.name,
            timing.span.service,
            timing.span.namespace,
            timing.span.scope,
            timing.span.traceId,
            timing.span.spanId,
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        ),
    )
    .sort(chronological);
  const pages = Math.max(1, Math.ceil(rows.length / 100)),
    currentPage = Math.min(page, pages - 1),
    visible = rows.slice(currentPage * 100, currentPage * 100 + 100);
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, values, error: false });
  const fail = (e: unknown) =>
    setFeedback({
      key: `trace.error.${e instanceof TraceError ? e.code : "project"}`,
      error: true,
    });
  function perform(action: () => void) {
    try {
      action();
    } catch (e) {
      fail(e);
    }
  }
  function install(value: TraceProject, id = value.budgets[0]?.id ?? "") {
    const p = normalizeTraceProject(value);
    setProject(p);
    setBudgetId(id);
    setDraft(drafts(p, id));
    setTraceId("");
    setSpanKey("");
    setSearch("");
    setService("");
    setErrorsOnly(false);
    setPage(0);
    setResults(null);
    setContextInspection(null);
  }
  function save() {
    perform(() => {
      const p = normalizeTraceProject({
        ...project,
        name: draft.name,
        source: draft.source,
        context: {
          traceparent: draft.traceparent,
          tracestate: draft.tracestate,
        },
        budgets: project.budgets.map((b) =>
          b.id === budgetId && draft.budget
            ? { ...draft.budget, minMatches: integer(draft.budget.minMatches) }
            : b,
        ),
      });
      install(p, budgetId);
      notify("trace.saved");
    });
  }
  function download(source: string, file: string, mime = "application/json") {
    try {
      const ok = downloadTextFile(source, file, mime);
      setFeedback({
        key: ok ? "trace.downloaded" : "trace.downloadFailed",
        error: !ok,
      });
    } catch {
      setFeedback({ key: "trace.downloadFailed", error: true });
    }
  }
  async function importFile(file: File | undefined, projectFile: boolean) {
    if (!file || locked) return;
    if (file.size > MAX_TRACE_BYTES) {
      fail(new TraceError("limit"));
      return;
    }
    const ticket = ++generation.current;
    setBusy(true);
    setFeedback(null);
    try {
      const source = await file.text();
      if (ticket !== generation.current) return;
      if (projectFile) {
        install(parseTraceProject(source));
        notify("trace.loaded");
      } else {
        readTraceData(source);
        setDraft((d) => ({ ...d, source }));
        notify("trace.sourceLoaded");
      }
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  function focusSpan(key: string) {
    if (!analysis) return;
    const timing = analysis.timings.find((timing) => timing.span.key === key);
    if (!timing) return;
    const all = analysis.timings
      .filter((t) => t.span.traceId === timing.span.traceId)
      .sort(chronological);
    setTraceId(timing.span.traceId);
    setSpanKey(key);
    setSearch("");
    setService("");
    setErrorsOnly(false);
    setPage(Math.floor(all.findIndex((t) => t.span.key === key) / 100));
  }
  function evaluate() {
    if (!analysis || locked) return;
    perform(() => {
      const checked = evaluateTraceBudgets(analysis, project.budgets);
      setResults(checked);
      notify("trace.completed", {
        passed: String(checked.filter((r) => r.passed).length),
        total: String(checked.length),
      });
    });
  }
  function addBudget(clone: boolean) {
    if (locked || project.budgets.length >= MAX_TRACE_BUDGETS) return;
    perform(() => {
      const id = nextId(project.budgets.map((b) => b.id)),
        original = project.budgets.find((b) => b.id === budgetId),
        b =
          clone && original
            ? { ...original, id, name: id }
            : newTraceBudget(id);
      install({ ...project, budgets: [...project.budgets, b] }, id);
      setFeedback(null);
    });
  }
  function writeContext(context: { traceparent: string; tracestate: string }) {
    setDraft((d) => ({ ...d, ...context }));
    setContextInspection(null);
    notify("trace.contextUpdated");
  }
  const services = analysis?.services ?? [];
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("trace.title")}
      </summary>
      {open && analysis && selectedTrace && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("trace.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("trace.scopeTitle")}
            </summary>
            {["scope", "timingHelp", "privacy", "limits"].map((k) => (
              <p key={k}>{t(`trace.${k}` as TranslationKey)}</p>
            ))}
          </details>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={
                feedback.error
                  ? "text-sm text-red-700"
                  : "text-sm text-purple-800"
              }
            >
              {t(feedback.key, feedback.values)}
            </p>
          )}
          {pending && (
            <p className="text-xs text-amber-800">{t("trace.pending")}</p>
          )}
          {busy && <p role="status">{t("trace.busy")}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(demoTraceProject());
                  notify("trace.loaded");
                })
              }
            >
              {t("trace.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(emptyTraceProject());
                  notify("trace.loaded");
                })
              }
            >
              {t("trace.new")}
            </button>
            <label className={buttonClass}>
              {t("trace.import")}
              <input
                className="mt-1 block max-w-56 text-xs"
                type="file"
                accept=".json,application/json"
                disabled={locked}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void importFile(file, true);
                }}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() =>
                  download(
                    serializeTraceProject(project),
                    "distributed-trace-project.json",
                  ),
                )
              }
            >
              {t("trace.export")}
            </button>
          </div>
          <fieldset disabled={busy} className="space-y-5">
            <Field
              label={t("trace.name")}
              value={draft.name}
              onChange={(name) => setDraft((d) => ({ ...d, name }))}
            />
            <details className="space-y-3 rounded-xl border p-3">
              <summary className="cursor-pointer font-bold">
                {t("trace.sourceSection")}
              </summary>
              <Field
                label={t("trace.source")}
                value={draft.source}
                multiline
                onChange={(source) => setDraft((d) => ({ ...d, source }))}
              />
              <div className="flex flex-wrap gap-2">
                <label className={buttonClass}>
                  {t("trace.importOtlp")}
                  <input
                    className="mt-1 block max-w-56 text-xs"
                    type="file"
                    accept=".json,application/json"
                    disabled={locked}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void importFile(file, false);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() => download(project.source, "traces.otlp.json")}
                >
                  {t("trace.exportOtlp")}
                </button>
              </div>
            </details>
            <section
              aria-label={t("trace.overview")}
              className="space-y-2 rounded-xl border p-3"
            >
              <h4 className="font-bold">{t("trace.overview")}</h4>
              <p className="text-sm">
                {t("trace.stats", {
                  spans: String(analysis.timings.length),
                  traces: String(analysis.traces.length),
                  services: String(services.length),
                  errors: String(
                    analysis.timings.filter((t) => t.span.status === 2).length,
                  ),
                  diagnostics: String(analysis.diagnostics.length),
                })}
              </p>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("trace.waterfall")}</h4>
              <Select
                label={t("trace.trace")}
                value={selectedTrace.traceId}
                onChange={(id) => {
                  setTraceId(id);
                  setSpanKey(
                    analysis.timings.find((t) => t.span.traceId === id)?.span
                      .key ?? "",
                  );
                  setPage(0);
                }}
              >
                {analysis.traces.map((tr, i) => (
                  <option key={tr.traceId} value={tr.traceId}>
                    {t("trace.traceOption", {
                      index: String(i + 1),
                      id: tr.traceId,
                      count: String(tr.spanCount),
                    })}
                  </option>
                ))}
              </Select>
              <p className="text-xs">
                {t("trace.summary", {
                  elapsed: traceMs(selectedTrace.elapsedNs),
                  spans: String(selectedTrace.spanCount),
                  errors: String(selectedTrace.errors),
                  roots: String(selectedTrace.roots),
                })}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label={t("trace.search")}
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    setPage(0);
                  }}
                />
                <Select
                  label={t("trace.serviceFilter")}
                  value={service}
                  onChange={(v) => {
                    setService(v);
                    setPage(0);
                  }}
                >
                  <option value="">{t("trace.allServices")}</option>
                  {services.map((s) => (
                    <option key={s.key} value={s.key}>
                      {serviceLabel(s)}
                    </option>
                  ))}
                </Select>
              </div>
              <Check
                label={t("trace.errorsOnly")}
                checked={errorsOnly}
                onChange={(v) => {
                  setErrorsOnly(v);
                  setPage(0);
                }}
              />
              <p className="text-xs">
                {t("trace.shown", {
                  shown: String(visible.length),
                  total: String(rows.length),
                  page: String(currentPage + 1),
                  pages: String(pages),
                })}
              </p>
              <div className="overflow-x-auto">
                <table
                  aria-label={t("trace.waterfall")}
                  className="w-full text-left text-xs"
                >
                  <thead>
                    <tr>
                      {[
                        "operation",
                        "timeline",
                        "duration",
                        "self",
                        "status",
                      ].map((k) => (
                        <th key={k} className="p-2">
                          {t(`trace.${k}` as TranslationKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((timing) => {
                      const span = timing.span,
                        range = BigInt(selectedTrace.elapsedNs) || BigInt(1),
                        offset =
                          BigInt(span.startNs) - BigInt(selectedTrace.startNs),
                        start = Number((offset * BigInt(10000)) / range) / 100,
                        width =
                          Number(
                            (BigInt(timing.durationNs) * BigInt(10000)) / range,
                          ) / 100;
                      return (
                        <tr
                          key={span.key}
                          className={`border-t ${selected?.span.key === span.key ? "bg-purple-50" : ""}`}
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-left font-semibold text-purple-800"
                              style={{
                                paddingLeft: Math.min(20, timing.depth) * 8,
                              }}
                              aria-label={t("trace.selectSpan", {
                                name: span.name,
                              })}
                              onClick={() => setSpanKey(span.key)}
                            >
                              {span.name}
                            </button>
                            <p className="text-slate-500">
                              {[span.namespace, span.service]
                                .filter(Boolean)
                                .join(" / ")}
                            </p>
                          </td>
                          <td className="min-w-56 p-2">
                            <div
                              role="img"
                              aria-label={t("trace.bar", {
                                name: span.name,
                                offset: traceMs(offset),
                                duration: traceMs(timing.durationNs),
                              })}
                              className="relative h-5 overflow-hidden rounded bg-slate-100"
                            >
                              <div
                                className={`absolute top-0 h-5 min-w-0.5 rounded ${span.status === 2 ? "bg-red-500" : "bg-purple-500"}`}
                                style={{
                                  left: `${Math.min(99.8, start)}%`,
                                  width: `${width}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="p-2 font-mono">
                            {traceMs(timing.durationNs)}
                          </td>
                          <td className="p-2 font-mono">
                            {timing.selfNs === null
                              ? t("trace.unavailable")
                              : traceMs(timing.selfNs)}
                          </td>
                          <td className="p-2">
                            {t(`trace.status.${span.status}` as TranslationKey)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {t("trace.previous")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={currentPage >= pages - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("trace.next")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    perform(() =>
                      download(
                        sliceTraceSource(project.source, selectedTrace.traceId),
                        "selected-trace.otlp.json",
                      ),
                    )
                  }
                >
                  {t("trace.exportSlice")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    perform(() =>
                      download(
                        traceViewerHtml(analysis, selectedTrace.traceId),
                        "trace-waterfall.html",
                        "text/html",
                      ),
                    )
                  }
                >
                  {t("trace.viewer")}
                </button>
              </div>
              <p className="text-xs text-slate-600">{t("trace.viewerHelp")}</p>
            </section>
            {selected && (
              <section className="space-y-3 rounded-xl border p-3">
                <h4 className="font-bold">{t("trace.detailsSection")}</h4>
                <Field
                  label={t("trace.details")}
                  value={json(selected)}
                  multiline
                  readOnly
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!selected.parent}
                    onClick={() => focusSpan(selected.parent)}
                  >
                    {t("trace.parent")}
                  </button>
                  {selected.span.links.map((link, i) => {
                    const key = `${link.traceId}/${link.spanId}`;
                    return (
                      <button
                        type="button"
                        className={buttonClass}
                        key={i}
                        disabled={
                          !analysis.timings.some((t) => t.span.key === key)
                        }
                        onClick={() => focusSpan(key)}
                      >
                        {t("trace.link", { index: String(i + 1) })}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={locked}
                    onClick={() =>
                      download(json(selected), "selected-span.json")
                    }
                  >
                    {t("trace.exportSpan")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      writeContext({
                        traceparent: `00-${selected.span.traceId}-${selected.span.spanId}-${selected.span.flags & 1 ? "01" : "00"}`,
                        tracestate: "",
                      });
                      setSampled(!!(selected.span.flags & 1));
                    }}
                  >
                    {t("trace.useContext")}
                  </button>
                </div>
              </section>
            )}
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("trace.services")}</h4>
              <div className="overflow-x-auto">
                <table
                  aria-label={t("trace.services")}
                  className="w-full text-left text-xs"
                >
                  <thead>
                    <tr>
                      {[
                        "service",
                        "spans",
                        "errors",
                        "p95",
                        "inclusive",
                        "selfTotal",
                      ].map((k) => (
                        <th className="p-2" key={k}>
                          {t(`trace.${k}` as TranslationKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.key} className="border-t">
                        <td className="p-2">{serviceLabel(s)}</td>
                        <td className="p-2">{s.spans}</td>
                        <td className="p-2">{s.errors}</td>
                        <td className="p-2">{traceMs(s.p95Ns)}</td>
                        <td className="p-2">{traceMs(s.inclusiveNs)}</td>
                        <td className="p-2">
                          {traceMs(s.selfNs)}
                          {s.unknownSelf > 0
                            ? ` (+ ${s.unknownSelf} ${t("trace.unavailable")})`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("trace.dependencies")}</h4>
              <p className="text-xs text-slate-600">
                {t("trace.dependencyHelp")}
              </p>
              {analysis.dependencies.length ? (
                <div className="overflow-x-auto">
                  <table
                    aria-label={t("trace.dependencies")}
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr>
                        {["from", "to", "calls", "errors", "max"].map((k) => (
                          <th key={k} className="p-2">
                            {t(`trace.${k}` as TranslationKey)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.dependencies.map((d, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">
                            {serviceLabel(
                              services.find((s) => s.key === d.from)!,
                            )}
                          </td>
                          <td className="p-2">
                            {serviceLabel(
                              services.find((s) => s.key === d.to)!,
                            )}
                          </td>
                          <td className="p-2">{d.calls}</td>
                          <td className="p-2">{d.errors}</td>
                          <td className="p-2">{traceMs(d.maxNs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs">{t("trace.noDependencies")}</p>
              )}
            </section>
            {!!analysis.diagnostics.length && (
              <section className="space-y-2 rounded-xl border p-3">
                <h4 className="font-bold">{t("trace.diagnostics")}</h4>
                <ul className="list-inside list-disc text-xs">
                  {analysis.diagnostics.map((d, i) => {
                    const span = analysis.data.spans.find(
                      (s) => s.key === d.key,
                    )!;
                    return (
                      <li
                        key={i}
                        className={d.error ? "text-red-700" : "text-amber-800"}
                      >
                        <button
                          type="button"
                          className="text-left underline"
                          onClick={() => focusSpan(d.key)}
                        >
                          {t("trace.diagnosticRow", {
                            index: String(span.index),
                            name: span.name,
                            reason: t(`trace.diagnostic.${d.code}`),
                          })}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("trace.budgets")}</h4>
              <p className="text-xs text-slate-600">{t("trace.budgetHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.budgets.length >= MAX_TRACE_BUDGETS
                  }
                  onClick={() => addBudget(false)}
                >
                  {t("trace.addBudget")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    !draft.budget ||
                    project.budgets.length >= MAX_TRACE_BUDGETS
                  }
                  onClick={() => addBudget(true)}
                >
                  {t("trace.cloneBudget")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || !draft.budget}
                  onClick={() =>
                    perform(() => {
                      install({
                        ...project,
                        budgets: project.budgets.filter(
                          (b) => b.id !== budgetId,
                        ),
                      });
                      setFeedback(null);
                    })
                  }
                >
                  {t("trace.deleteBudget")}
                </button>
              </div>
              {draft.budget ? (
                <>
                  <Select
                    label={t("trace.budget")}
                    value={budgetId}
                    disabled={locked}
                    onChange={(id) => {
                      setBudgetId(id);
                      setDraft(drafts(project, id));
                    }}
                  >
                    {project.budgets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                  {(
                    [
                      "name",
                      "operation",
                      "traceId",
                      "max",
                      "minMatches",
                    ] as const
                  ).map((k) => (
                    <Field
                      key={k}
                      label={t(
                        (
                          {
                            name: "trace.budgetName",
                            operation: "trace.budgetOperation",
                            traceId: "trace.budgetTrace",
                            max: "trace.budgetMax",
                            minMatches: "trace.minMatches",
                          } as const
                        )[k],
                      )}
                      value={draft.budget![k]}
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          budget: d.budget ? { ...d.budget, [k]: v } : null,
                        }))
                      }
                    />
                  ))}
                  <Select
                    label={t("trace.budgetService")}
                    value={draft.budget.serviceKey}
                    onChange={(serviceKey) =>
                      setDraft((d) => ({
                        ...d,
                        budget: d.budget ? { ...d.budget, serviceKey } : null,
                      }))
                    }
                  >
                    <option value="">{t("trace.allServices")}</option>
                    {draft.budget.serviceKey &&
                      !services.some(
                        (s) => s.key === draft.budget!.serviceKey,
                      ) && (
                        <option value={draft.budget.serviceKey}>
                          {t("trace.missingService")}
                        </option>
                      )}
                    {services.map((s) => (
                      <option key={s.key} value={s.key}>
                        {serviceLabel(s)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label={t("trace.metric")}
                    value={draft.budget.metric}
                    onChange={(metric) =>
                      setDraft((d) => ({
                        ...d,
                        budget: d.budget
                          ? {
                              ...d.budget,
                              metric: metric as TraceBudget["metric"],
                            }
                          : null,
                      }))
                    }
                  >
                    {TRACE_METRICS.map((m) => (
                      <option key={m} value={m}>
                        {t(`trace.metric.${m}`)}
                      </option>
                    ))}
                  </Select>
                </>
              ) : (
                <p className="text-xs">{t("trace.noBudgets")}</p>
              )}
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("trace.contextSection")}</h4>
              <p className="text-xs text-slate-600">{t("trace.contextHelp")}</p>
              <Field
                label={t("trace.traceparent")}
                value={draft.traceparent}
                onChange={(traceparent) => {
                  setDraft((d) => ({ ...d, traceparent }));
                  setContextInspection(null);
                }}
              />
              <Field
                label={t("trace.tracestate")}
                value={draft.tracestate}
                onChange={(tracestate) => {
                  setDraft((d) => ({ ...d, tracestate }));
                  setContextInspection(null);
                }}
              />
              <Check
                label={t("trace.sampled")}
                checked={sampled}
                onChange={setSampled}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() =>
                    perform(() => writeContext(newTraceContext(sampled)))
                  }
                >
                  {t("trace.newContext")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() =>
                    perform(() =>
                      writeContext(
                        childTraceContext(
                          draft.traceparent,
                          draft.tracestate,
                          sampled,
                        ),
                      ),
                    )
                  }
                >
                  {t("trace.childContext")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    setContextInspection(
                      inspectTraceContext(draft.traceparent, draft.tracestate),
                    );
                    notify("trace.contextInspected");
                  }}
                >
                  {t("trace.inspectContext")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    perform(() => {
                      readTraceParent(project.context.traceparent);
                      const inspected = inspectTraceContext(
                        project.context.traceparent,
                        project.context.tracestate,
                      );
                      if (inspected.issue)
                        throw new TraceError(inspected.issue);
                      download(
                        json(project.context),
                        "trace-context-headers.json",
                      );
                    })
                  }
                >
                  {t("trace.exportContext")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label={t("trace.vendorKey")}
                  value={vendorKey}
                  onChange={setVendorKey}
                />
                <Field
                  label={t("trace.vendorValue")}
                  value={vendorValue}
                  onChange={setVendorValue}
                />
              </div>
              <button
                type="button"
                className={buttonClass}
                onClick={() =>
                  perform(() => {
                    const result = updateTraceState(
                      draft.tracestate,
                      vendorKey,
                      vendorValue,
                    );
                    setDraft((d) => ({ ...d, tracestate: result.value }));
                    setContextInspection(null);
                    notify("trace.vendorUpdated", {
                      count: String(result.removed),
                    });
                  })
                }
              >
                {t("trace.updateVendor")}
              </button>
              {contextInspection && (
                <Field
                  label={t("trace.contextResult")}
                  value={json(contextInspection)}
                  multiline
                  readOnly
                />
              )}
            </section>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            {busy && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  fail(new TraceError("cancelled"));
                }}
              >
                {t("trace.cancel")}
              </button>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !pending}
              onClick={save}
            >
              {t("trace.save")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !pending}
              onClick={() => {
                setDraft(drafts(project, budgetId));
                setContextInspection(null);
                setFeedback(null);
              }}
            >
              {t("trace.discard")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !project.budgets.length}
              onClick={evaluate}
            >
              {t("trace.run")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() =>
                  download(
                    traceReport(
                      analysis,
                      evaluateTraceBudgets(analysis, project.budgets),
                    ),
                    "trace-analysis-report.json",
                  ),
                )
              }
            >
              {t("trace.report")}
            </button>
          </div>
          {results && (
            <section
              aria-label={t("trace.results")}
              className="space-y-2 rounded-xl border p-3"
            >
              <h4 className="font-bold">{t("trace.results")}</h4>
              <ul className="space-y-1 text-xs">
                {results.map((r) => (
                  <li
                    key={r.id}
                    className={r.passed ? "text-green-800" : "text-red-700"}
                  >
                    {t("trace.resultRow", {
                      name: r.name,
                      state: t(r.passed ? "trace.passed" : "trace.failed"),
                      value: r.value ?? t("trace.unavailable"),
                      max: r.max,
                      matches: String(r.matches),
                      reason: t(`trace.reason.${r.issue}`),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
