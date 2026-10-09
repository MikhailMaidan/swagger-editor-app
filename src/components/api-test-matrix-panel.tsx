"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  addMatrixEndpoint,
  emptyMatrixProject,
  MatrixError,
  MAX_MATRIX_BYTES,
  matrixBinding,
  matrixJUnitReport,
  parseMatrixHeaders,
  parseMatrixProject,
  parseMatrixValues,
  previewMatrixRun,
  readMatrixDataset,
  runTestMatrix,
  serializeMatrixProject,
  serializeMatrixReport,
  validateMatrixProject,
  type MatrixCaseOutcome,
  type MatrixProgress,
  type MatrixProject,
  type MatrixReport,
} from "@/lib/api-test-matrix";
import { parseScenario, serializeScenario } from "@/lib/api-scenario";
import { parseTransformValue, readTransformSource } from "@/lib/api-transform";
import { extractEndpoints, type EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const ownDraft = (
  map: Record<string, string>,
  key: string,
  fallback: string,
) => (Object.hasOwn(map, key) ? map[key] : fallback);

export const ApiTestMatrixPanel = memo(function ApiTestMatrixPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyMatrixProject);
  const [workflowDraft, setWorkflowDraft] = useState<string | null>(null),
    [bindingDraft, setBindingDraft] = useState<string | null>(null);
  const [caseDrafts, setCaseDrafts] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState("");
  const [dataset, setDataset] = useState(""),
    [datasetFormat, setDatasetFormat] = useState<"json" | "csv">("json"),
    [inferCsv, setInferCsv] = useState(false);
  const [choices, setChoices] = useState<EndpointSummary[]>([]),
    [choice, setChoice] = useState("0");
  const [mode, setMode] = useState<"mock" | "live">("mock"),
    [headers, setHeaders] = useState("{}"),
    [server, setServer] = useState(""),
    [allowWrites, setAllowWrites] = useState(false);
  const [running, setRunning] = useState(false),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState<MatrixProgress | null>(null);
  const [report, setReport] = useState<MatrixReport | null>(null),
    [preview, setPreview] = useState<{
      cases: number;
      requests: number;
    } | null>(null);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
    caseKey?: string;
  } | null>(null);
  const [retryKeys, setRetryKeys] = useState<string[]>([]);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState<MatrixCaseOutcome | "all">("all"),
    [page, setPage] = useState(0);
  const revision = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      revision.current++;
      controller.current?.abort();
    },
    [],
  );
  const row = project.cases.find((c) => c.key === selected);
  const dirty =
    (workflowDraft !== null && workflowDraft !== json(project.scenario)) ||
    (bindingDraft !== null && bindingDraft !== json(project.bindings)) ||
    project.cases.some(
      (c) => ownDraft(caseDrafts, c.key, json(c.values)) !== json(c.values),
    );
  const enabled = project.cases.filter((c) => c.enabled).length;
  const failedKeys = retryKeys.filter((key) =>
    project.cases.some((c) => c.key === key && c.enabled),
  );
  const results = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (report?.results ?? progress?.results ?? []).filter(
      (r) =>
        (filter === "all" || r.outcome === filter) &&
        terms.every((term) =>
          `${r.name} ${r.key} ${r.outcome} ${r.steps.map((s) => `${s.method} ${s.path}`).join(" ")}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [report, progress, search, filter]);
  const lastPage = Math.max(0, Math.ceil(results.length / 20) - 1),
    currentPage = Math.min(page, lastPage);
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof MatrixError
          ? `matrix.error.${error.code}`
          : "matrix.error.project",
      error: true,
      ...(error instanceof MatrixError && error.caseKey
        ? { caseKey: error.caseKey }
        : {}),
    });
  }
  function invalidate() {
    revision.current++;
    setReport(null);
    setProgress(null);
    setPreview(null);
    setFeedback(null);
    setPage(0);
  }
  function update(next: MatrixProject) {
    setProject(next);
    invalidate();
  }
  function endpoints() {
    try {
      const source = readTransformSource(getSchemaText());
      return extractEndpoints(source.document as Record<string, unknown>);
    } catch {
      throw new MatrixError("source");
    }
  }
  function captureChoices() {
    setFeedback(null);
    try {
      const next = endpoints().filter((e) =>
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(e.method),
      );
      if (next.length > 1000) throw new MatrixError("limit");
      setChoices(next);
      setChoice("0");
      setFeedback({ key: "matrix.choicesLoaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function addStep() {
    if (!choices[Number(choice)] || dirty) return;
    try {
      update(addMatrixEndpoint(project, choices[Number(choice)]));
      setWorkflowDraft(null);
      setSelected(project.cases[0]?.key ?? "case-1");
    } catch (error) {
      fail(error);
    }
  }
  function saveDefinitions() {
    setFeedback(null);
    try {
      const next = validateMatrixProject({
        ...project,
        scenario:
          workflowDraft === null
            ? project.scenario
            : parseTransformValue(workflowDraft),
        bindings:
          bindingDraft === null
            ? project.bindings
            : parseTransformValue(bindingDraft),
      });
      update(next);
      setWorkflowDraft(null);
      setBindingDraft(null);
      setAllowWrites(false);
      setFeedback({ key: "matrix.definitionsSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function acceptDataset(text: string, format: "json" | "csv") {
    try {
      const cases = readMatrixDataset(text, format, inferCsv);
      update(validateMatrixProject({ ...project, cases }));
      setRetryKeys([]);
      setCaseDrafts({});
      setSelected(cases[0]?.key ?? "");
      setDataset("");
      setFeedback({ key: "matrix.datasetLoaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function saveCase() {
    if (!row) return;
    try {
      const values = parseMatrixValues(
        ownDraft(caseDrafts, row.key, json(row.values)),
      );
      update(
        validateMatrixProject({
          ...project,
          cases: project.cases.map((c) =>
            c.key === selected ? { ...c, values } : c,
          ),
        }),
      );
      setCaseDrafts(
        Object.fromEntries(
          Object.entries(caseDrafts).filter(([key]) => key !== selected),
        ),
      );
      setFeedback({ key: "matrix.caseSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function addCase() {
    let n = 1;
    while (project.cases.some((c) => c.key === `case-${n}`)) n++;
    const key = `case-${n}`;
    update({
      ...project,
      cases: [
        ...project.cases,
        {
          key,
          name: `Case ${n}`,
          enabled: true,
          values: row ? { ...row.values } : {},
        },
      ],
    });
    setSelected(key);
  }
  function configureBinding() {
    const step = project.scenario.steps.find(
      (s) => !project.bindings.some((b) => b.stepId === s.id),
    );
    if (step) {
      update({
        ...project,
        bindings: [...project.bindings, matrixBinding(step.id)],
      });
      setBindingDraft(null);
    }
  }
  async function read(file: File, kind: "project" | "scenario" | "dataset") {
    const token = ++revision.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (file.size > MAX_MATRIX_BYTES) throw new MatrixError("limit");
      const text = await file.text();
      if (revision.current !== token) return;
      if (kind === "dataset")
        acceptDataset(text, /\.csv$/i.test(file.name) ? "csv" : "json");
      else {
        const next =
          kind === "project"
            ? parseMatrixProject(text)
            : validateMatrixProject({
                ...project,
                scenario: parseScenario(text),
                bindings: [],
              });
        // Do not retain session credentials or a Live acknowledgement across imported workflows.
        setProject(next);
        setWorkflowDraft(null);
        setBindingDraft(null);
        if (kind === "project") {
          setCaseDrafts({});
          setSelected(next.cases[0]?.key ?? "");
        }
        setReport(null);
        setProgress(null);
        setPreview(null);
        setRetryKeys([]);
        setMode("mock");
        setHeaders("{}");
        setServer("");
        setAllowWrites(false);
        setChoices([]);
        setPage(0);
        setFeedback({
          key:
            kind === "project"
              ? "matrix.projectLoaded"
              : "matrix.scenarioLoaded",
          error: false,
        });
      }
    } catch (error) {
      if (revision.current === token) fail(error);
    } finally {
      setLoading(false);
    }
  }
  function checkPreview() {
    if (dirty) return;
    setPreview(null);
    setFeedback(null);
    try {
      const next = previewMatrixRun(project, endpoints(), {
        mode,
        serverOverride: server,
        sharedHeaders: parseMatrixHeaders(headers),
      });
      setPreview({
        cases: next.prepared.length,
        requests: next.prepared.length * next.project.scenario.steps.length,
      });
      setFeedback({ key: "matrix.previewReady", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function run(keys?: string[]) {
    if (dirty || loading || running) return;
    invalidate();
    const token = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    try {
      const result = await runTestMatrix(project, endpoints(), {
        mode,
        serverOverride: server,
        sharedHeaders: parseMatrixHeaders(headers),
        allowWrites,
        signal: abort.signal,
        ...(keys ? { caseKeys: keys } : {}),
        onProgress: (value) => {
          if (token === revision.current) setProgress(value);
        },
      });
      if (token === revision.current) {
        setReport(result);
        setRetryKeys(
          result.results
            .filter((r) => ["failed", "error"].includes(r.outcome))
            .map((r) => r.key),
        );
        setFeedback({
          key:
            result.outcome === "cancelled"
              ? "matrix.cancelled"
              : "matrix.completed",
          error: false,
        });
      }
    } catch (error) {
      if (token === revision.current) fail(error);
    } finally {
      if (token === revision.current) {
        setRunning(false);
        controller.current = null;
      }
    }
  }
  function download(kind: "project" | "scenario" | "report" | "junit") {
    if (dirty || loading || running) return;
    try {
      const text =
        kind === "project"
          ? serializeMatrixProject(project)
          : kind === "scenario"
            ? serializeScenario(validateMatrixProject(project).scenario)
            : report
              ? kind === "report"
                ? serializeMatrixReport(report)
                : matrixJUnitReport(report)
              : "";
      if (!text) return;
      const ok = downloadTextFile(
        text,
        `api-matrix-${kind}.${kind === "junit" ? "xml" : "json"}`,
        kind === "junit" ? "application/xml" : "application/json",
      );
      setFeedback({
        key: ok ? "matrix.downloaded" : "matrix.error.download",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  const busy = loading || running;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("matrix.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("matrix.description")}</p>
          <p className="text-xs text-slate-600">{t("matrix.help")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-emerald-700"}
            >
              {t(feedback.key)}
            </p>
          )}
          {feedback?.caseKey && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => setSelected(feedback.caseKey!)}
            >
              {t("matrix.inspectInvalid", { key: feedback.caseKey })}
            </button>
          )}
          {loading && <p role="status">{t("matrix.loading")}</p>}
          <div className="grid gap-3 lg:grid-cols-3">
            {(["project", "scenario", "dataset"] as const).map((kind) => (
              <label key={kind} className="block text-xs font-bold">
                {t(`matrix.import.${kind}`)}
                <input
                  className={inputClass}
                  type="file"
                  accept={
                    kind === "dataset"
                      ? ".json,.csv,application/json,text/csv"
                      : ".json,application/json"
                  }
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (file) void read(file, kind);
                  }}
                />
              </label>
            ))}
          </div>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <legend className="mb-2 font-bold">
              {t("matrix.configuration")}
            </legend>
            <label className="block text-xs font-bold">
              {t("matrix.name")}
              <input
                className={inputClass}
                maxLength={120}
                value={project.name}
                onChange={(e) => update({ ...project, name: e.target.value })}
              />
            </label>
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="font-bold">{t("matrix.workflow")}</h3>
              <button
                type="button"
                className={buttonClass}
                onClick={captureChoices}
              >
                {t("matrix.capture")}
              </button>
              <label className="block text-xs font-bold">
                {t("matrix.endpoint")}
                <select
                  className={inputClass}
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  {!choices.length && <option value="0">—</option>}
                  {choices.map((ep, i) => (
                    <option key={i} value={i}>
                      {ep.method} {ep.path}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !choices.length ||
                  dirty ||
                  project.scenario.steps.length >= 20
                }
                onClick={addStep}
              >
                {t("matrix.addStep")}
              </button>
              <p className="text-xs text-slate-600">
                {t("matrix.templateHelp")}
              </p>
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("matrix.editWorkflow")}
                </summary>
                <label className="mt-3 block text-xs font-bold">
                  {t("matrix.workflowJson")}
                  <textarea
                    className={`${inputClass} font-mono`}
                    rows={10}
                    maxLength={MAX_MATRIX_BYTES}
                    spellCheck={false}
                    value={workflowDraft ?? json(project.scenario)}
                    onChange={(e) => {
                      setWorkflowDraft(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={`${buttonClass} mt-2`}
                  disabled={
                    dirty ||
                    project.scenario.steps.every((step) =>
                      project.bindings.some(
                        (binding) => binding.stepId === step.id,
                      ),
                    )
                  }
                  onClick={configureBinding}
                >
                  {t("matrix.addBinding")}
                </button>
                <label className="mt-3 block text-xs font-bold">
                  {t("matrix.bindingsJson")}
                  <textarea
                    className={`${inputClass} font-mono`}
                    rows={7}
                    maxLength={MAX_MATRIX_BYTES}
                    spellCheck={false}
                    value={bindingDraft ?? json(project.bindings)}
                    onChange={(e) => {
                      setBindingDraft(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <p className="mt-2 text-xs text-slate-600">
                  {t("matrix.bindingHelp")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={saveDefinitions}
                  >
                    {t("matrix.saveDefinitions")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      setWorkflowDraft(null);
                      setBindingDraft(null);
                      setFeedback(null);
                    }}
                  >
                    {t("matrix.discardDefinitions")}
                  </button>
                </div>
              </details>
            </section>
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="font-bold">{t("matrix.data")}</h3>
              <label className="block text-xs font-bold">
                {t("matrix.dataFormat")}
                <select
                  className={inputClass}
                  value={datasetFormat}
                  onChange={(e) =>
                    setDatasetFormat(e.target.value as "json" | "csv")
                  }
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={inferCsv}
                  onChange={(e) => setInferCsv(e.target.checked)}
                />
                {t("matrix.inferCsv")}
              </label>
              <label className="block text-xs font-bold">
                {t("matrix.dataset")}
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={5}
                  maxLength={MAX_MATRIX_BYTES}
                  spellCheck={false}
                  value={dataset}
                  onChange={(e) => setDataset(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={!dataset.trim()}
                onClick={() => acceptDataset(dataset, datasetFormat)}
              >
                {t("matrix.useDataset")}
              </button>
              <p className="text-xs text-slate-600">{t("matrix.dataHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={project.cases.length >= 100}
                  onClick={addCase}
                >
                  {t("matrix.addCase")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!project.cases.length}
                  onClick={() =>
                    update({
                      ...project,
                      cases: project.cases.map((c) => ({
                        ...c,
                        enabled: true,
                      })),
                    })
                  }
                >
                  {t("matrix.enableAll")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!project.cases.length}
                  onClick={() =>
                    update({
                      ...project,
                      cases: project.cases.map((c) => ({
                        ...c,
                        enabled: false,
                      })),
                    })
                  }
                >
                  {t("matrix.disableAll")}
                </button>
              </div>
              <label className="block text-xs font-bold">
                {t("matrix.selectCase")}
                <select
                  className={inputClass}
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {!project.cases.length && <option value="">—</option>}
                  {project.cases.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} · {c.key}
                    </option>
                  ))}
                </select>
              </label>
              {row && (
                <>
                  <label className="block text-xs font-bold">
                    {t("matrix.caseName")}
                    <input
                      className={inputClass}
                      maxLength={120}
                      value={row.name}
                      onChange={(e) =>
                        update({
                          ...project,
                          cases: project.cases.map((c) =>
                            c.key === selected
                              ? { ...c, name: e.target.value }
                              : c,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) =>
                        update({
                          ...project,
                          cases: project.cases.map((c) =>
                            c.key === selected
                              ? { ...c, enabled: e.target.checked }
                              : c,
                          ),
                        })
                      }
                    />
                    {t("matrix.caseEnabled")}
                  </label>
                  <label className="block text-xs font-bold">
                    {t("matrix.caseValues")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={5}
                      maxLength={65536}
                      spellCheck={false}
                      value={ownDraft(caseDrafts, row.key, json(row.values))}
                      onChange={(e) => {
                        setCaseDrafts({
                          ...caseDrafts,
                          [row.key]: e.target.value,
                        });
                        invalidate();
                      }}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={saveCase}
                    >
                      {t("matrix.saveCase")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        setCaseDrafts(
                          Object.fromEntries(
                            Object.entries(caseDrafts).filter(
                              ([key]) => key !== selected,
                            ),
                          ),
                        );
                        setFeedback(null);
                      }}
                    >
                      {t("matrix.discardCase")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        const cases = project.cases.filter(
                          (c) => c.key !== selected,
                        );
                        setRetryKeys((keys) =>
                          keys.filter((key) => key !== selected),
                        );
                        update({ ...project, cases });
                        setCaseDrafts(
                          Object.fromEntries(
                            Object.entries(caseDrafts).filter(
                              ([key]) => key !== selected,
                            ),
                          ),
                        );
                        setSelected(cases[0]?.key ?? "");
                      }}
                    >
                      {t("matrix.removeCase")}
                    </button>
                  </div>
                </>
              )}
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold">
                {t("matrix.concurrency")}
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={4}
                  value={project.concurrency}
                  onChange={(e) =>
                    update({ ...project, concurrency: Number(e.target.value) })
                  }
                />
              </label>
              <label className="block text-xs font-bold">
                {t("matrix.budget")}
                <input
                  className={inputClass}
                  type="number"
                  min={1000}
                  max={300000}
                  value={project.maxRunMs}
                  onChange={(e) =>
                    update({ ...project, maxRunMs: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={project.stopOnCaseFailure}
                onChange={(e) =>
                  update({ ...project, stopOnCaseFailure: e.target.checked })
                }
              />
              {t("matrix.stopOnFailure")}
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={project.allowInvalidInputs}
                onChange={(e) =>
                  update({ ...project, allowInvalidInputs: e.target.checked })
                }
              />
              {t("matrix.negativeInputs")}
            </label>
            {dirty && (
              <p role="status" className="text-amber-800">
                {t("matrix.dirty")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={dirty}
                onClick={() => download("project")}
              >
                {t("matrix.exportProject")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={dirty}
                onClick={() => download("scenario")}
              >
                {t("matrix.exportScenario")}
              </button>
            </div>
          </fieldset>
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <legend className="mb-2 font-bold">{t("matrix.execution")}</legend>
            <label className="block text-xs font-bold">
              {t("matrix.mode")}
              <select
                className={inputClass}
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "mock" | "live");
                  invalidate();
                }}
              >
                <option value="mock">Mock</option>
                <option value="live">Live</option>
              </select>
            </label>
            {mode === "live" && (
              <>
                <p className="text-xs text-amber-800">{t("matrix.liveHelp")}</p>
                <label className="block text-xs font-bold">
                  {t("matrix.server")}
                  <input
                    className={inputClass}
                    maxLength={2048}
                    value={server}
                    onChange={(e) => {
                      setServer(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <label className="block text-xs font-bold">
                  {t("matrix.headers")}
                  <textarea
                    className={`${inputClass} font-mono`}
                    maxLength={65536}
                    rows={3}
                    spellCheck={false}
                    value={headers}
                    onChange={(e) => {
                      setHeaders(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={allowWrites}
                    onChange={(e) => setAllowWrites(e.target.checked)}
                  />
                  {t("matrix.allowWrites")}
                </label>
              </>
            )}
            <p>
              {t("matrix.caseCount", {
                enabled: String(enabled),
                total: String(project.cases.length),
                steps: String(project.scenario.steps.length),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={dirty || !enabled || !project.scenario.steps.length}
                onClick={checkPreview}
              >
                {t("matrix.preview")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={dirty || !enabled || !project.scenario.steps.length}
                onClick={() => void run()}
              >
                {t("matrix.run")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={dirty || !failedKeys.length}
                onClick={() => void run(failedKeys)}
              >
                {t("matrix.rerun")}
              </button>
            </div>
            {preview && (
              <p role="status">
                {t("matrix.previewSummary", {
                  cases: String(preview.cases),
                  requests: String(preview.requests),
                })}
              </p>
            )}
          </fieldset>
          {running && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="status">
                {t("matrix.progress", {
                  completed: String(progress?.completed ?? 0),
                  total: String(progress?.total ?? enabled),
                  active: String(progress?.active ?? 0),
                })}
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => controller.current?.abort()}
              >
                {t("matrix.cancel")}
              </button>
            </div>
          )}
          {(report || progress) && (
            <section className="space-y-3" aria-label={t("matrix.results")}>
              <h3 className="font-bold">{t("matrix.results")}</h3>
              {report && (
                <>
                  <p>
                    {t("matrix.summary", {
                      passed: String(report.counts.passed),
                      failed: String(report.counts.failed),
                      error: String(report.counts.error),
                      cancelled: String(report.counts.cancelled),
                      skipped: String(report.counts.skipped),
                    })}
                  </p>
                  {report.stopReason && (
                    <p className="text-xs">
                      {t(`matrix.stop.${report.stopReason}`)}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy || dirty}
                      onClick={() => download("report")}
                    >
                      {t("matrix.exportReport")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy || dirty}
                      onClick={() => download("junit")}
                    >
                      {t("matrix.exportJUnit")}
                    </button>
                  </div>
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold">
                  {t("matrix.search")}
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
                <label className="block text-xs font-bold">
                  {t("matrix.filter")}
                  <select
                    className={inputClass}
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value as typeof filter);
                      setPage(0);
                    }}
                  >
                    <option value="all">{t("matrix.all")}</option>
                    {(
                      [
                        "passed",
                        "failed",
                        "error",
                        "cancelled",
                        "skipped",
                      ] as const
                    ).map((status) => (
                      <option key={status} value={status}>
                        {t(`matrix.outcome.${status}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!results.length && <p>{t("matrix.noMatches")}</p>}
              {results
                .slice(currentPage * 20, (currentPage + 1) * 20)
                .map((r) => (
                  <article
                    key={r.key}
                    className="space-y-2 rounded-xl border border-slate-200 p-3"
                  >
                    <h4 className="text-xs font-bold break-all">
                      {r.name} · {t(`matrix.outcome.${r.outcome}`)} ·{" "}
                      {r.durationMs.toFixed(0)} ms
                    </h4>
                    <ul className="space-y-2 text-xs">
                      {r.steps.map((s) => (
                        <li key={s.id} className="break-all">
                          {s.method} {s.path} ·{" "}
                          {t(`matrix.outcome.${s.outcome}`)} · {s.status ?? "—"}
                          {s.issue ? ` · ${t(`scenario.${s.issue}`)}` : ""}
                          {s.assertions.length > 0 && (
                            <ul className="mt-1 space-y-1 pl-3">
                              {s.assertions.map((a, i) => (
                                <li key={i}>
                                  {a.name || t("matrix.unnamedAssertion")} ·{" "}
                                  {a.target} {a.path} · {a.outcome}
                                  {a.issue ? ` (${a.issue})` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              {lastPage > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    {t("matrix.previous")}
                  </button>
                  <p className="text-xs">
                    {t("matrix.page", {
                      page: String(currentPage + 1),
                      total: String(lastPage + 1),
                    })}
                  </p>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={currentPage === lastPage}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    {t("matrix.next")}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </details>
  );
});
