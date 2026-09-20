"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  benchmarkBudgets,
  benchmarkMetrics,
  BenchmarkError,
  compareBenchmarkReports,
  createBenchmarkCase,
  createBenchmarkPlan,
  exportBenchmarkCsv,
  MAX_BENCHMARK_BYTES,
  MAX_BENCHMARK_CASES,
  parseBenchmarkHeaders,
  parseBenchmarkPlan,
  parseBenchmarkReport,
  runApiBenchmark,
  serializeBenchmarkPlan,
  serializeBenchmarkReport,
  type BenchmarkCase,
  type BenchmarkPlan,
  type BenchmarkProgress,
  type BenchmarkReport,
  type BenchmarkSettings,
} from "@/lib/api-benchmark";
import type { CurlParameter, EndpointSummary } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const key = (entry: { method: string; path: string }) =>
  `${entry.method.toUpperCase()} ${entry.path}`;
const display = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const signed = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${display(value)}`;
const numericSettings: {
  key: keyof BenchmarkSettings;
  min: number;
  max: number;
  step?: string;
}[] = [
  { key: "requests", min: 1, max: 200 },
  { key: "warmup", min: 0, max: 20 },
  { key: "concurrency", min: 1, max: 5 },
  { key: "ratePerSecond", min: 1, max: 10 },
  { key: "timeoutMs", min: 1000, max: 30000 },
  { key: "maxRunMs", min: 1000, max: 120000 },
  { key: "stopAfterErrors", min: 0, max: 200 },
];
type Feedback = { key: TranslationKey; error: boolean; index?: number | null };

function BenchmarkResults({
  report,
  baseline,
  busy,
  onPin,
  onExport,
}: {
  report: BenchmarkReport;
  baseline: BenchmarkReport | null;
  busy: boolean;
  onPin: () => void;
  onExport: (format: "json" | "csv" | "copy") => void;
}) {
  const { t } = useI18n();
  const [caseId, setCaseId] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [warmup, setWarmup] = useState(false);
  const [page, setPage] = useState(0);
  const metrics = useMemo(() => benchmarkMetrics(report), [report]);
  const budgets = useMemo(() => benchmarkBudgets(report), [report]);
  const comparison = useMemo(
    () => (baseline ? compareBenchmarkReports(baseline, report) : null),
    [baseline, report],
  );
  const baselineMetrics = useMemo(
    () => (baseline ? benchmarkMetrics(baseline) : null),
    [baseline],
  );
  const measured = report.samples.filter(
    (sample) => sample.phase === "measured" && sample.outcome !== "cancelled",
  );
  const maxDuration = Math.max(
    1,
    ...measured.map((sample) => sample.durationMs),
  );
  const points = measured.map((sample, index) => ({
    x: 24 + (index / Math.max(1, measured.length - 1)) * 590,
    y: 142 - (sample.durationMs / maxDuration) * 120,
    sample,
  }));
  const filtered = report.samples.filter(
    (sample) =>
      (warmup || sample.phase === "measured") &&
      (!caseId || sample.caseId === caseId) &&
      (outcome === "all" || sample.outcome === outcome),
  );
  const rows = filtered.slice(page * 20, page * 20 + 20);
  return (
    <section
      className="space-y-4 rounded-xl border border-[color:var(--color-brand-border)] p-4"
      aria-label={t("benchmark.results")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">
          {t("benchmark.results")}: {report.planName}
        </h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
          {t(`benchmark.stop.${report.stopReason}`)}
        </span>
      </div>
      <p className="text-xs">
        {t("benchmark.runSummary", {
          mode: t(`benchmark.mode.${report.mode}`),
          started: report.startedAt,
          elapsed: display(report.elapsedMs),
          window: display(report.measurementMs),
          peak: String(report.peakConcurrency),
        })}
      </p>
      {report.mode === "mock" && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          {t("benchmark.mockResults")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["completed", `${metrics.completed}/${report.settings.requests}`],
            ["errorRate", `${display(metrics.errorPercent)}%`],
            ["throughput", `${display(metrics.throughput)}/s`],
            ["p95", `${display(metrics.p95Ms)} ms`],
          ] as const
        ).map(([name, value]) => (
          <div key={name} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-600">
              {t(`benchmark.metric.${name}`)}
            </p>
            <p className="mt-1 text-xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs">
        {t("benchmark.countSummary", {
          success: String(metrics.succeeded),
          failed: String(metrics.failed),
          cancelled: String(metrics.cancelled),
          warmup: String(
            report.samples.filter((sample) => sample.phase === "warmup").length,
          ),
          warmupErrors: String(
            report.samples.filter(
              (sample) =>
                sample.phase === "warmup" &&
                ["failed", "error"].includes(sample.outcome),
            ).length,
          ),
        })}
      </p>
      <p className="text-xs text-slate-600">{t("benchmark.metricsHelp")}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {(
          [
            "minMs",
            "meanMs",
            "p50Ms",
            "p90Ms",
            "p95Ms",
            "p99Ms",
            "maxMs",
          ] as const
        ).map((name) => (
          <p key={name}>
            <span className="font-bold">{t(`benchmark.stat.${name}`)}</span>:{" "}
            {display(metrics[name])} ms
          </p>
        ))}
      </div>
      {!!points.length && (
        <figure className="rounded-xl bg-slate-50 p-3">
          <figcaption className="text-xs font-bold">
            {t("benchmark.chart")}
          </figcaption>
          <svg
            viewBox="0 0 640 170"
            role="img"
            aria-label={t("benchmark.chart")}
            className="mt-2 max-h-64 w-full"
          >
            <text x="4" y="12" fontSize="10" fill="#475569">
              {display(maxDuration)} ms
            </text>
            <path d="M24 20 V142 H620" fill="none" stroke="#94a3b8" />
            <polyline
              points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
              stroke="#7c3aed"
              strokeWidth="2"
              fill="none"
            />
            {points.map(({ x, y, sample }) => (
              <circle
                key={sample.sequence}
                cx={x}
                cy={y}
                r="3"
                fill={sample.outcome === "success" ? "#7c3aed" : "#be123c"}
              >
                <title>
                  {sample.sequence}: {sample.method} {sample.path},{" "}
                  {display(sample.durationMs)} ms,{" "}
                  {sample.status ??
                    t(`benchmark.error.${sample.error ?? "network"}`)}
                </title>
              </circle>
            ))}
            <text x="24" y="159" fontSize="10" fill="#475569">
              #{measured[0].sequence}
            </text>
            <text x="590" y="159" fontSize="10" fill="#475569">
              #{measured.at(-1)!.sequence}
            </text>
          </svg>
          <p className="text-xs text-slate-600">{t("benchmark.chartHelp")}</p>
        </figure>
      )}
      <div>
        <h4 className="font-bold">{t("benchmark.budgets")}</h4>
        <ul className="mt-2 space-y-2 text-xs">
          {budgets.map((budget) => (
            <li
              key={budget.metric}
              className={
                budget.outcome === "failed"
                  ? "text-rose-700"
                  : budget.outcome === "passed"
                    ? "text-emerald-800"
                    : "text-slate-600"
              }
            >
              {t(`benchmark.budget.${budget.metric}`)}: {display(budget.actual)}{" "}
              {budget.metric === "throughput" ? "≥" : "≤"}{" "}
              {display(budget.limit)} —{" "}
              <strong>{t(`benchmark.budget.${budget.outcome}`)}</strong>
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full text-left text-xs"
          aria-label={t("benchmark.perCase")}
        >
          <thead>
            <tr>
              {["operation", "completed", "errorRate", "p95", "throughput"].map(
                (name) => (
                  <th key={name} className="border-b p-2">
                    {t(`benchmark.metric.${name}` as TranslationKey)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {report.cases.map((entry) => {
              const item = benchmarkMetrics(report, entry.id);
              return (
                <tr key={entry.id}>
                  <th className="p-2 font-normal">
                    <span className="block font-bold">
                      {entry.name || key(entry)}
                    </span>
                    <code>{key(entry)}</code>
                  </th>
                  <td className="p-2">{item.completed}</td>
                  <td className="p-2">{display(item.errorPercent)}%</td>
                  <td className="p-2">{display(item.p95Ms)} ms</td>
                  <td className="p-2">{display(item.throughput)}/s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {comparison && baselineMetrics && baseline && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <h4 className="font-bold">
            {t("benchmark.comparison")}: {baseline.planName}
          </h4>
          <p className="text-xs">{baseline.startedAt}</p>
          {!comparison.compatible && (
            <p role="status" className="text-xs text-amber-900">
              {t("benchmark.incompatible")}
            </p>
          )}
          <p className="text-xs text-slate-600">
            {t("benchmark.comparisonHelp")}
          </p>
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-xs"
              aria-label={t("benchmark.comparison")}
            >
              <thead>
                <tr>
                  <th className="p-2">{t("benchmark.metricLabel")}</th>
                  <th className="p-2">{t("benchmark.baseline")}</th>
                  <th className="p-2">{t("benchmark.current")}</th>
                  <th className="p-2">{t("benchmark.delta")}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    [
                      "p95",
                      baselineMetrics.p95Ms,
                      metrics.p95Ms,
                      comparison.p95DeltaMs,
                    ],
                    [
                      "mean",
                      baselineMetrics.meanMs,
                      metrics.meanMs,
                      comparison.meanDeltaMs,
                    ],
                    [
                      "errorRate",
                      baselineMetrics.errorPercent,
                      metrics.errorPercent,
                      comparison.errorDeltaPoints,
                    ],
                    [
                      "throughput",
                      baselineMetrics.throughput,
                      metrics.throughput,
                      comparison.throughputDelta,
                    ],
                  ] as const
                ).map(([name, before, after, delta]) => (
                  <tr key={name}>
                    <th className="p-2">{t(`benchmark.metric.${name}`)}</th>
                    <td className="p-2">{display(before)}</td>
                    <td className="p-2">{display(after)}</td>
                    <td className="p-2">{signed(delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <fieldset disabled={busy} className="flex flex-wrap gap-2">
        <legend className="sr-only">{t("benchmark.reportActions")}</legend>
        <button type="button" className={buttonClass} onClick={onPin}>
          {t("benchmark.pin")}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onExport("json")}
        >
          {t("benchmark.downloadJson")}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onExport("csv")}
        >
          {t("benchmark.downloadCsv")}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onExport("copy")}
        >
          {t("benchmark.copyReport")}
        </button>
      </fieldset>
      <details>
        <summary className="cursor-pointer font-bold">
          {t("benchmark.samples")}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label>
            {t("benchmark.sampleCase")}
            <select
              className={inputClass}
              value={caseId}
              onChange={(event) => {
                setCaseId(event.target.value);
                setPage(0);
              }}
            >
              <option value="">{t("benchmark.allCases")}</option>
              {report.cases.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name || key(entry)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("benchmark.sampleOutcome")}
            <select
              className={inputClass}
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
                setPage(0);
              }}
            >
              {["all", "success", "failed", "error", "cancelled"].map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`benchmark.outcome.${value}` as TranslationKey)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={warmup}
              onChange={(event) => {
                setWarmup(event.target.checked);
                setPage(0);
              }}
            />
            {t("benchmark.showWarmup")}
          </label>
        </div>
        <p className="my-3 text-xs">
          {t("benchmark.sampleCount", { count: String(filtered.length) })}
        </p>
        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-xs"
            aria-label={t("benchmark.samples")}
          >
            <thead>
              <tr>
                {[
                  "number",
                  "phase",
                  "operation",
                  "status",
                  "duration",
                  "proxy",
                  "outcome",
                ].map((name) => (
                  <th key={name} className="border-b p-2">
                    {t(`benchmark.column.${name}` as TranslationKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((sample) => (
                <tr key={sample.sequence}>
                  <td className="p-2">{sample.sequence}</td>
                  <td className="p-2">
                    {t(`benchmark.phase.${sample.phase}`)}
                  </td>
                  <td className="break-all p-2 font-mono">{key(sample)}</td>
                  <td className="p-2">{sample.status ?? "—"}</td>
                  <td className="p-2">{display(sample.durationMs)}</td>
                  <td className="p-2">{display(sample.proxyDurationMs)}</td>
                  <td className="p-2">
                    {t(`benchmark.outcome.${sample.outcome}`)}
                    {sample.error && (
                      <span className="block">
                        {t(`benchmark.error.${sample.error}`)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            {t("benchmark.previous")}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={(page + 1) * 20 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            {t("benchmark.next")}
          </button>
        </div>
      </details>
    </section>
  );
}

export const ApiBenchmarkPanel = memo(function ApiBenchmarkPanel({
  allEndpoints,
  visibleEndpoints,
  onSelectEndpoint,
}: {
  allEndpoints: EndpointSummary[];
  visibleEndpoints: EndpointSummary[];
  onSelectEndpoint: (method: string, path: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<BenchmarkPlan>(createBenchmarkPlan);
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [headers, setHeaders] = useState("{}");
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState<"run" | "import" | null>(null);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [baseline, setBaseline] = useState<BenchmarkReport | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [input, setInput] = useState("");
  const [importKind, setImportKind] = useState<"plan" | "baseline">("plan");
  const generation = useRef(0),
    exports = useRef(0),
    counter = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      exports.current++;
      controller.current?.abort();
    },
    [],
  );
  const endpoints = useMemo(
    () => allEndpoints.filter((entry) => /^(GET|HEAD)$/i.test(entry.method)),
    [allEndpoints],
  );
  const choices = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return endpoints.filter((entry) =>
      terms.every((term) =>
        `${key(entry)} ${entry.summary}`.toLowerCase().includes(term),
      ),
    );
  }, [endpoints, search]);
  const chosen = choices.find((entry) => key(entry) === choice) ?? choices[0];
  const entry = plan.cases.find((entry) => entry.id === selected);
  const endpoint = entry
    ? endpoints.find((endpoint) => key(endpoint) === key(entry))
    : undefined;
  const missing = plan.cases.some(
    (entry) => !endpoints.some((endpoint) => key(endpoint) === key(entry)),
  );
  function clearFeedback() {
    exports.current++;
    setFeedback(null);
  }
  function invalidate() {
    generation.current++;
    clearFeedback();
    setReport(null);
    setProgress(null);
  }
  function edit(patch: Partial<BenchmarkPlan>) {
    invalidate();
    setPlan((current) => ({ ...current, ...patch }));
  }
  function editCase(patch: Partial<BenchmarkCase>) {
    if (entry)
      edit({
        cases: plan.cases.map((item) =>
          item.id === entry.id ? { ...item, ...patch } : item,
        ),
      });
  }
  function fail(error: unknown) {
    setFeedback(
      error instanceof BenchmarkError
        ? {
            key: `benchmark.error.${error.code}`,
            index: error.caseIndex,
            error: true,
          }
        : { key: "benchmark.error.read", error: true },
    );
  }
  function nextId() {
    let id: string;
    do {
      id = `benchmark-${++counter.current}`;
    } while (plan.cases.some((entry) => entry.id === id));
    return id;
  }
  function add() {
    if (!chosen || plan.cases.length >= MAX_BENCHMARK_CASES) return;
    const next = createBenchmarkCase(chosen, nextId());
    edit({ cases: [...plan.cases, next] });
    setSelected(next.id);
  }
  function addVisible() {
    const included = new Set(plan.cases.map(key));
    const cases = [...plan.cases];
    for (const endpoint of visibleEndpoints) {
      if (cases.length >= MAX_BENCHMARK_CASES) break;
      if (!/^(GET|HEAD)$/i.test(endpoint.method) || included.has(key(endpoint)))
        continue;
      cases.push(createBenchmarkCase(endpoint, nextId()));
      included.add(key(endpoint));
    }
    edit({ cases });
    setSelected(cases.at(-1)?.id ?? "");
  }
  function move(direction: number) {
    const index = plan.cases.findIndex((item) => item.id === selected);
    if (
      index < 0 ||
      index + direction < 0 ||
      index + direction >= plan.cases.length
    )
      return;
    const cases = [...plan.cases];
    [cases[index], cases[index + direction]] = [
      cases[index + direction],
      cases[index],
    ];
    edit({ cases });
  }
  async function run() {
    invalidate();
    const version = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy("run");
    try {
      const next = await runApiBenchmark(plan, allEndpoints, {
        mode,
        signal: abort.signal,
        headers: mode === "live" ? parseBenchmarkHeaders(headers) : undefined,
        onProgress: (next) => {
          if (version === generation.current) setProgress(next);
        },
      });
      if (version === generation.current) {
        setReport(next);
        setFeedback({ key: "benchmark.finished", error: false });
      }
    } catch (error) {
      if (version === generation.current) fail(error);
    } finally {
      if (version === generation.current) {
        setBusy(null);
        controller.current = null;
      }
    }
  }
  function stop() {
    if (busy === "run") controller.current?.abort();
    else {
      generation.current++;
      setBusy(null);
      setFeedback({ key: "benchmark.importCancelled", error: false });
    }
  }
  function accept(text: string, kind: typeof importKind) {
    if (kind === "baseline") {
      const next = parseBenchmarkReport(text);
      clearFeedback();
      setBaseline(next);
      setFeedback({ key: "benchmark.baselineImported", error: false });
    } else {
      const next = parseBenchmarkPlan(text);
      invalidate();
      setPlan(next);
      setSelected(next.cases[0]?.id ?? "");
      setHeaders("{}");
      setMode("mock");
      setFeedback({ key: "benchmark.planImported", error: false });
    }
    setInput("");
  }
  async function importFile(file: File) {
    clearFeedback();
    const version = ++generation.current;
    const kind = importKind;
    setBusy("import");
    try {
      if (file.size > MAX_BENCHMARK_BYTES) throw new BenchmarkError("limit");
      const text = await file.text();
      if (version === generation.current) {
        accept(text, kind);
        setBusy(null);
      }
    } catch (error) {
      if (version === generation.current) {
        fail(error);
        setBusy(null);
      }
    }
  }
  function downloadPlan() {
    clearFeedback();
    try {
      const ok = downloadTextFile(
        serializeBenchmarkPlan(plan),
        "rsswag-benchmark-plan.json",
        "application/json",
      );
      setFeedback({
        key: ok ? "benchmark.downloaded" : "benchmark.error.export",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  async function exportReport(format: "json" | "csv" | "copy") {
    if (!report) return;
    clearFeedback();
    const version = exports.current;
    try {
      const text =
        format === "csv"
          ? exportBenchmarkCsv(report)
          : serializeBenchmarkReport(report);
      const ok =
        format === "copy"
          ? await writeTextToClipboard(text)
          : downloadTextFile(
              text,
              `rsswag-benchmark-report.${format}`,
              format === "csv" ? "text/csv;charset=utf-8" : "application/json",
            );
      if (version === exports.current)
        setFeedback({
          key: ok
            ? format === "copy"
              ? "benchmark.copied"
              : "benchmark.downloaded"
            : "benchmark.error.export",
          error: !ok,
        });
    } catch (error) {
      if (version === exports.current) fail(error);
    }
  }
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("benchmark.title")}
        {busy === "run" && (
          <span className="ml-3 text-xs font-normal">
            {t("benchmark.running")}
          </span>
        )}
      </summary>
      {open && (
        <div className="space-y-4 border-t border-[color:var(--color-brand-border)] p-5 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("benchmark.description")}</p>
          <p className="text-xs text-slate-600">{t("benchmark.privacy")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-rose-700" : "text-emerald-800"}
            >
              {t(feedback.key, {
                index:
                  feedback.index === null || feedback.index === undefined
                    ? "—"
                    : String(feedback.index + 1),
              })}
            </p>
          )}
          {busy && (
            <div className="space-y-2 rounded-xl bg-violet-50 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <p role="status" className="text-xs">
                  {busy === "import"
                    ? t("benchmark.loading")
                    : t("benchmark.progress", {
                        phase: t(
                          `benchmark.phase.${progress?.phase ?? "warmup"}`,
                        ),
                        done: String(progress?.samples.length ?? 0),
                        total: String(plan.requests + plan.warmup),
                        active: String(progress?.active ?? 0),
                      })}
                </p>
                <button type="button" className={buttonClass} onClick={stop}>
                  {t(
                    busy === "run"
                      ? "benchmark.stop"
                      : "benchmark.cancelImport",
                  )}
                </button>
              </div>
              {busy === "run" && (
                <progress
                  className="w-full accent-violet-600"
                  aria-label={t("benchmark.progressLabel")}
                  value={progress?.samples.length ?? 0}
                  max={plan.requests + plan.warmup}
                />
              )}
            </div>
          )}
          <fieldset
            disabled={busy !== null}
            className="min-w-0 space-y-4 disabled:opacity-60"
          >
            <legend className="sr-only">{t("benchmark.configure")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t("benchmark.name")}
                <input
                  className={inputClass}
                  maxLength={120}
                  value={plan.name}
                  onChange={(event) => edit({ name: event.target.value })}
                />
              </label>
              <label>
                {t("benchmark.mode")}
                <select
                  className={inputClass}
                  value={mode}
                  onChange={(event) => {
                    invalidate();
                    setMode(event.target.value as typeof mode);
                  }}
                >
                  <option value="mock">{t("benchmark.mode.mock")}</option>
                  <option value="live">{t("benchmark.mode.live")}</option>
                </select>
              </label>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs">
              {t(mode === "live" ? "benchmark.liveHelp" : "benchmark.mockHelp")}
            </p>
            {mode === "live" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  {t("benchmark.target")}
                  <input
                    className={inputClass}
                    type="url"
                    maxLength={2048}
                    value={plan.targetUrl}
                    placeholder="https://api.example.com/v1"
                    onChange={(event) => {
                      edit({ targetUrl: event.target.value });
                      setHeaders("{}");
                    }}
                  />
                </label>
                <label>
                  {t("benchmark.headers")}
                  <textarea
                    className={`${inputClass} min-h-20 font-mono`}
                    maxLength={65536}
                    value={headers}
                    spellCheck={false}
                    onChange={(event) => {
                      invalidate();
                      setHeaders(event.target.value);
                    }}
                  />
                </label>
                <p className="text-xs text-slate-600 sm:col-span-2">
                  {t("benchmark.headersHelp")}
                </p>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    invalidate();
                    setHeaders("{}");
                  }}
                >
                  {t("benchmark.clearHeaders")}
                </button>
              </div>
            )}
            <div>
              <h3 className="font-bold">{t("benchmark.workload")}</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {numericSettings.map((setting) => (
                  <label key={setting.key}>
                    {t(`benchmark.setting.${setting.key}`)}
                    <input
                      className={inputClass}
                      type="number"
                      min={setting.min}
                      max={setting.max}
                      step={setting.step ?? "1"}
                      value={plan[setting.key]}
                      onChange={(event) =>
                        edit({ [setting.key]: Number(event.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {t("benchmark.workloadHelp")}
              </p>
            </div>
            <div>
              <h3 className="font-bold">{t("benchmark.budgets")}</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {(
                  ["maxP95Ms", "maxErrorPercent", "minThroughput"] as const
                ).map((name) => (
                  <label key={name}>
                    {t(`benchmark.setting.${name}`)}
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      max={
                        name === "maxErrorPercent"
                          ? 100
                          : name === "maxP95Ms"
                            ? 60000
                            : 1000
                      }
                      step="any"
                      value={plan[name]}
                      onChange={(event) =>
                        edit({ [name]: Number(event.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t("benchmark.search")}
                <input
                  type="search"
                  className={inputClass}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSearch("");
                  }}
                />
              </label>
              <label>
                {t("benchmark.endpoint")}
                <select
                  className={inputClass}
                  value={chosen ? key(chosen) : ""}
                  onChange={(event) => setChoice(event.target.value)}
                >
                  <option value="" disabled>
                    {t("benchmark.chooseEndpoint")}
                  </option>
                  {choices.map((endpoint, index) => (
                    <option
                      key={`${key(endpoint)}-${index}`}
                      value={key(endpoint)}
                    >
                      {key(endpoint)} {endpoint.summary}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!chosen || plan.cases.length >= MAX_BENCHMARK_CASES}
                onClick={add}
              >
                {t("benchmark.add")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !visibleEndpoints.some((entry) =>
                    /^(GET|HEAD)$/i.test(entry.method),
                  ) || plan.cases.length >= MAX_BENCHMARK_CASES
                }
                onClick={addVisible}
              >
                {t("benchmark.addVisible")}
              </button>
              <span className="text-xs">
                {t("benchmark.caseCount", { count: String(plan.cases.length) })}
              </span>
            </div>
            {!!plan.cases.length && (
              <label className="block">
                {t("benchmark.case")}
                <select
                  className={inputClass}
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {plan.cases.map((entry, index) => (
                    <option key={entry.id} value={entry.id}>
                      {index + 1}. {entry.name || key(entry)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {entry && (
              <div className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4">
                <p className="break-all font-mono text-xs">{key(entry)}</p>
                {!endpoint && (
                  <p role="alert" className="text-rose-700">
                    {t("benchmark.endpointMissing")}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <label>
                    {t("benchmark.caseName")}
                    <input
                      className={inputClass}
                      value={entry.name}
                      maxLength={120}
                      onChange={(event) =>
                        editCase({ name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("benchmark.weight")}
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={10}
                      value={entry.weight}
                      onChange={(event) =>
                        editCase({ weight: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    {t("benchmark.expected")}
                    <input
                      className={inputClass}
                      maxLength={120}
                      value={entry.expectedStatus}
                      onChange={(event) =>
                        editCase({ expectedStatus: event.target.value })
                      }
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-600">
                  {t("benchmark.caseHelp")}
                </p>
                {mode === "mock" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      {t("benchmark.mockStatus")}
                      <select
                        className={inputClass}
                        value={entry.mockStatus}
                        onChange={(event) =>
                          editCase({ mockStatus: event.target.value })
                        }
                      >
                        {!endpoint?.responses.some(
                          (response) => response.status === entry.mockStatus,
                        ) && (
                          <option value={entry.mockStatus}>
                            {entry.mockStatus || "—"}
                          </option>
                        )}
                        {endpoint?.responses.map((response) => (
                          <option key={response.status} value={response.status}>
                            {response.status} {response.description}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("benchmark.mockLatency")}
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        max={5000}
                        value={entry.mockLatencyMs}
                        onChange={(event) =>
                          editCase({
                            mockLatencyMs: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("benchmark.parameters")}
                  </summary>
                  <p className="my-2 text-xs text-slate-600">
                    {t("benchmark.parametersHelp")}
                  </p>
                  <div className="space-y-2">
                    {entry.parameters.map((parameter, index) => (
                      <fieldset
                        key={index}
                        className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[100px_1fr_2fr_auto]"
                      >
                        <legend className="px-1 text-xs">
                          {t("benchmark.parameter", {
                            index: String(index + 1),
                          })}
                        </legend>
                        <label className="text-xs">
                          {t("benchmark.parameterLocation")}
                          <select
                            className={inputClass}
                            value={parameter.location}
                            onChange={(event) =>
                              editCase({
                                parameters: entry.parameters.map((item, at) =>
                                  at === index
                                    ? {
                                        ...item,
                                        location: event.target
                                          .value as CurlParameter["location"],
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            {["path", "query", "header", "cookie"].map(
                              (value) => (
                                <option key={value}>{value}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="text-xs">
                          {t("benchmark.parameterName")}
                          <input
                            className={inputClass}
                            value={parameter.name}
                            maxLength={256}
                            onChange={(event) =>
                              editCase({
                                parameters: entry.parameters.map((item, at) =>
                                  at === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="text-xs">
                          {t("benchmark.parameterValue")}
                          <input
                            className={inputClass}
                            value={parameter.value}
                            maxLength={8192}
                            onChange={(event) =>
                              editCase({
                                parameters: entry.parameters.map((item, at) =>
                                  at === index
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() =>
                            editCase({
                              parameters: entry.parameters.filter(
                                (_, at) => at !== index,
                              ),
                            })
                          }
                        >
                          {t("benchmark.removeParameter")}
                        </button>
                      </fieldset>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`${buttonClass} mt-2`}
                    disabled={entry.parameters.length >= 64}
                    onClick={() =>
                      editCase({
                        parameters: [
                          ...entry.parameters,
                          { location: "query", name: "", value: "" },
                        ],
                      })
                    }
                  >
                    {t("benchmark.addParameter")}
                  </button>
                </details>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!endpoint}
                    onClick={() => onSelectEndpoint(entry.method, entry.path)}
                  >
                    {t("benchmark.viewEndpoint")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={plan.cases[0]?.id === selected}
                    onClick={() => move(-1)}
                  >
                    {t("benchmark.moveUp")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={plan.cases.at(-1)?.id === selected}
                    onClick={() => move(1)}
                  >
                    {t("benchmark.moveDown")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      const cases = plan.cases.filter(
                        (item) => item.id !== selected,
                      );
                      edit({ cases });
                      setSelected(cases[0]?.id ?? "");
                    }}
                  >
                    {t("benchmark.remove")}
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!plan.cases.length || missing}
                onClick={() => void run()}
              >
                {t(mode === "mock" ? "benchmark.runMock" : "benchmark.runLive")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={downloadPlan}
              >
                {t("benchmark.downloadPlan")}
              </button>
            </div>
            <details className="rounded-lg border border-[color:var(--color-brand-border)] p-3">
              <summary className="cursor-pointer font-bold">
                {t("benchmark.importExport")}
              </summary>
              <p className="mt-3 text-xs text-slate-600">
                {t("benchmark.importHelp")}
              </p>
              <label className="mt-3 block">
                {t("benchmark.importKind")}
                <select
                  className={inputClass}
                  value={importKind}
                  onChange={(event) =>
                    setImportKind(event.target.value as typeof importKind)
                  }
                >
                  <option value="plan">
                    {t("benchmark.importPlanOption")}
                  </option>
                  <option value="baseline">
                    {t("benchmark.importBaselineOption")}
                  </option>
                </select>
              </label>
              <label className="mt-3 block">
                {t("benchmark.importJson")}
                <textarea
                  className={`${inputClass} min-h-28 font-mono`}
                  maxLength={MAX_BENCHMARK_BYTES}
                  value={input}
                  spellCheck={false}
                  onChange={(event) => setInput(event.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!input.trim()}
                  onClick={() => {
                    clearFeedback();
                    try {
                      accept(input, importKind);
                    } catch (error) {
                      fail(error);
                    }
                  }}
                >
                  {t("benchmark.import")}
                </button>
                <label className="text-xs">
                  {t("benchmark.importFile")}
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="mt-1 block max-w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void importFile(file);
                    }}
                  />
                </label>
              </div>
            </details>
            {baseline && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3">
                <p className="text-xs">
                  {t("benchmark.pinned", {
                    name: baseline.planName,
                    mode: t(`benchmark.mode.${baseline.mode}`),
                    date: baseline.startedAt,
                  })}
                </p>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    clearFeedback();
                    setBaseline(null);
                  }}
                >
                  {t("benchmark.clearBaseline")}
                </button>
              </div>
            )}
          </fieldset>
          {report && (
            <BenchmarkResults
              key={report.startedAt}
              report={report}
              baseline={baseline}
              busy={busy !== null}
              onExport={(format) => void exportReport(format)}
              onPin={() => {
                clearFeedback();
                setBaseline(report);
                setFeedback({ key: "benchmark.baselinePinned", error: false });
              }}
            />
          )}
        </div>
      )}
    </details>
  );
});
