"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  DQAction,
  DQField,
  DQSelect,
  DQStepBuilder,
  dqPretty,
} from "./data-query-controls";
import { DataQueryGrid, DataQueryPlan } from "./data-query-grid";
import {
  DataQueryError,
  MAX_DQ_IMPORT,
  MAX_DQ_PROJECT,
  dqDependencies,
  emptyDqProject,
  normalizeDqBindings,
  normalizeDqOverrides,
  normalizeDqProject,
  normalizeDqRows,
  normalizeDqStep,
  parseDqJson,
  parseDqProject,
  serializeDqProject,
  type DQProject,
  type DQQuery,
  type DQScenario,
} from "@/lib/data-query-model";
import {
  compareDqRows,
  dqReport,
  recordDqExpectation,
  runDataQuery,
  runDqScenarios,
  type DQOptions,
  type DQResult,
  type DQRun,
} from "@/lib/data-query-engine";
import { demoDqProject } from "@/lib/data-query-demo";
import {
  dqDatasetInventory,
  exportDqCsv,
  extractDqRows,
  importDqText,
  readDqHar,
  type DQImportMode,
} from "@/lib/data-query-import";
import { generateDqRunner, generateDqToolkit } from "@/lib/data-query-export";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";

function JsonEdit({
  label,
  value,
  applyLabel,
  apply,
}: {
  label: string;
  value: unknown;
  applyLabel: string;
  apply: (text: string) => void;
}) {
  const [text, setText] = useState(() => dqPretty(value));
  return (
    <div className="space-y-2">
      <DQField label={label} value={text} onChange={setText} multiline />
      <DQAction onClick={() => apply(text)}>{applyLabel}</DQAction>
    </div>
  );
}
const freshId = (prefix: string, items: { id: string }[]) => {
  let n = 1;
  while (items.some((i) => i.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};
type Captured = { result: DQResult; parameters: DQScenario["parameters"] };
export const DataQueryPanel = memo(function DataQueryPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState<DQProject>(emptyDqProject),
    [draft, setDraft] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [past, setPast] = useState<DQProject[]>([]),
    [future, setFuture] = useState<DQProject[]>([]),
    [datasetId, setDatasetId] = useState("records"),
    [queryId, setQueryId] = useState("query-1"),
    [caseId, setCaseId] = useState(""),
    [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [captured, setCaptured] = useState<Captured | null>(null),
    [runs, setRuns] = useState<DQRun[] | null>(null),
    [comparison, setComparison] = useState<ReturnType<
      typeof compareDqRows
    > | null>(null),
    [exact, setExact] = useState(false),
    [bindings, setBindings] = useState("{}"),
    [overrides, setOverrides] = useState("[]"),
    [identity, setIdentity] = useState("/id");
  const [format, setFormat] = useState("json"),
    [importText, setImportText] = useState(""),
    [pointer, setPointer] = useState(""),
    [mode, setMode] = useState<DQImportMode>("records"),
    [target, setTarget] = useState("new"),
    [tableName, setTableName] = useState("Imported table"),
    [har, setHar] = useState<ReturnType<typeof readDqHar> | null>(null),
    [harIndex, setHarIndex] = useState(0);
  const mounted = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    const token = generation;
    mounted.current = true;
    return () => {
      mounted.current = false;
      token.current++;
    };
  }, []);
  const serialized = useMemo(() => serializeDqProject(project), [project]),
    dirty = draft !== null && draft !== serialized;
  const table =
      project.datasets.find((d) => d.id === datasetId) ?? project.datasets[0],
    query = project.queries.find((q) => q.id === queryId) ?? project.queries[0],
    scenario =
      project.scenarios.find((s) => s.id === caseId) ?? project.scenarios[0],
    selectedStage =
      query?.steps[Math.min(stageIndex, Math.max(0, query.steps.length - 1))];
  const inventory = useMemo(
    () => (table ? dqDatasetInventory(table.rows) : null),
    [table],
  );
  const dependencies = useMemo(
    () => (query ? dqDependencies(project, query.id) : null),
    [project, query],
  );
  function diagnose(e: unknown) {
    const de = e instanceof DataQueryError ? e : new DataQueryError("project");
    setError(
      t("dataQuery.error", {
        code: de.code,
        query: de.queryId ?? "—",
        stage: de.stage === null ? "—" : String(de.stage),
      }),
    );
  }
  function safe(action: () => void, allowDraft = false) {
    if (busy) return;
    setError("");
    if (dirty && !allowDraft) {
      setError(t("dataQuery.dirty"));
      return;
    }
    try {
      action();
    } catch (e) {
      diagnose(e);
    }
  }
  function publish(value: unknown, history = true) {
    const next = normalizeDqProject(value);
    if (history) {
      setPast((old) => [...old, project].slice(-5));
      setFuture([]);
    }
    setProject(next);
    setDraft(null);
    setRevision((n) => n + 1);
    setCaptured(null);
    setRuns(null);
    setComparison(null);
    setMessage(t("dataQuery.ready"));
  }
  function save(content: string, name: string, mime = "application/json") {
    if (getByteSize(content) > 16 * 1024 * 1024)
      throw new DataQueryError("limit");
    if (!downloadTextFile(content, name, mime))
      setError(t("dataQuery.downloadError"));
  }
  async function start(action: (options: DQOptions) => Promise<() => void>) {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("dataQuery.dirty"));
      return;
    }
    const token = ++generation.current;
    setBusy(true);
    setProgress(0);
    const cancelled = () => !mounted.current || token !== generation.current;
    try {
      const apply = await action({
        cancelled,
        progress: () => {
          if (!cancelled()) setProgress((n) => n + 1);
        },
      });
      if (!cancelled()) apply();
    } catch (e) {
      if (!cancelled()) diagnose(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  function cancel() {
    generation.current++;
    setBusy(false);
    setMessage(t("dataQuery.cancelled"));
  }
  function bindingsValue() {
    return normalizeDqBindings(parseDqJson(bindings), project.parameters);
  }
  function updateQuery(value: unknown) {
    if (!query) throw new DataQueryError("reference");
    publish({
      ...project,
      queries: project.queries.map((q) => (q.id === query.id ? value : q)),
    });
  }
  function addTable(rows: unknown, name: string) {
    const id = freshId("dataset", project.datasets);
    publish({
      ...project,
      datasets: [
        ...project.datasets,
        { id, name, rows: normalizeDqRows(rows) },
      ],
    });
    setDatasetId(id);
  }
  function record() {
    if (!captured) return;
    const id = freshId("case", project.scenarios),
      value: DQScenario = {
        id,
        name: `Case ${project.scenarios.length + 1}`,
        queryId: captured.result.queryId,
        parameters: captured.parameters,
        overrides: [],
        expect: recordDqExpectation(captured.result, exact),
      };
    publish({ ...project, scenarios: [...project.scenarios, value] });
    setCaseId(id);
  }
  function addCase() {
    if (!query) throw new DataQueryError("reference");
    const id = freshId("case", project.scenarios);
    publish({
      ...project,
      scenarios: [
        ...project.scenarios,
        {
          id,
          name: `Case ${project.scenarios.length + 1}`,
          queryId: query.id,
          parameters: bindingsValue(),
          overrides: [],
          expect: null,
        },
      ],
    });
    setCaseId(id);
  }
  function newQuery(clone = false) {
    const from = table
      ? { kind: "dataset" as const, id: table.id }
      : query?.from;
    if (!from) throw new DataQueryError("reference");
    const id = freshId("query", project.queries),
      value: DQQuery =
        clone && query
          ? { ...query, id, name: `${query.name} copy` }
          : {
              id,
              name: `Query ${project.queries.length + 1}`,
              from,
              as: "row",
              steps: [],
            };
    publish({ ...project, queries: [...project.queries, value] });
    setQueryId(id);
  }
  function stageAction(kind: "remove" | "up" | "down") {
    if (!query) return;
    const steps = [...query.steps],
      i = Math.min(stageIndex, steps.length - 1);
    if (kind === "remove") steps.splice(i, 1);
    else {
      const j = i + (kind === "up" ? -1 : 1);
      if (j < 0 || j >= steps.length) return;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      setStageIndex(j);
    }
    updateQuery({ ...query, steps });
  }
  async function readFile(file: File, asProject: boolean) {
    await start(async (options) => {
      if (file.size > (asProject ? MAX_DQ_PROJECT : MAX_DQ_IMPORT))
        throw new DataQueryError("limit");
      const text = await file.text();
      if (options.cancelled?.()) return () => {};
      if (getByteSize(text) > (asProject ? MAX_DQ_PROJECT : MAX_DQ_IMPORT))
        throw new DataQueryError("limit");
      const restored = asProject ? parseDqProject(text) : null;
      return () => {
        if (restored) {
          publish(restored);
          setBindings("{}");
          setOverrides("[]");
        } else {
          setImportText(text);
          setHar(null);
        }
      };
    });
  }
  function importRows() {
    const entry = har?.entries[harIndex];
    const rows =
      format === "har"
        ? entry
          ? extractDqRows(entry.value, pointer, mode)
          : (() => {
              throw new DataQueryError("import");
            })()
        : importDqText(
            importText,
            format as "json" | "csv" | "ndjson",
            pointer,
            mode,
          );
    if (target === "new") addTable(rows, tableName);
    else {
      if (!table) throw new DataQueryError("reference");
      publish({
        ...project,
        datasets: project.datasets.map((d) =>
          d.id === table.id
            ? { ...d, rows: target === "append" ? [...d.rows, ...rows] : rows }
            : d,
        ),
      });
    }
  }
  const actionsClass = "flex flex-wrap gap-2",
    sectionClass =
      "space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4";
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-5 shadow-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-base font-bold text-[color:var(--color-ink)]">
        {t("dataQuery.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("dataQuery.description")}</p>
          <p className="text-xs text-slate-600">{t("dataQuery.help")}</p>
          {error && (
            <p role="alert" className="break-words text-sm text-red-700">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-xs">
            {busy ? t("dataQuery.busy", { count: String(progress) }) : message}
          </p>
          {busy && (
            <DQAction onClick={cancel}>{t("dataQuery.cancel")}</DQAction>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className={actionsClass}>
              <DQAction
                onClick={() =>
                  safe(() => {
                    publish(emptyDqProject());
                    setBindings("{}");
                    setOverrides("[]");
                  })
                }
              >
                {t("dataQuery.new")}
              </DQAction>
              <DQAction
                onClick={() =>
                  safe(() => {
                    publish(demoDqProject());
                    setQueryId("revenue");
                    setDatasetId("customers");
                    setCaseId("revenue-case");
                    setBindings("{}");
                    setOverrides("[]");
                    setIdentity("/customerId");
                  })
                }
              >
                {t("dataQuery.demo")}
              </DQAction>
              <DQAction
                onClick={() =>
                  safe(() => save(serialized, "data-query-project.json"))
                }
              >
                {t("dataQuery.exportProject")}
              </DQAction>
              <label className="text-xs font-semibold">
                {t("dataQuery.importProject")}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readFile(file, true);
                  }}
                  className="mt-1 block max-w-full text-xs"
                />
              </label>
              <DQAction
                disabled={!past.length}
                onClick={() =>
                  safe(() => {
                    const prior = past[past.length - 1];
                    setPast(past.slice(0, -1));
                    setFuture((old) => [...old, project].slice(-5));
                    publish(prior, false);
                  })
                }
              >
                {t("dataQuery.undo")}
              </DQAction>
              <DQAction
                disabled={!future.length}
                onClick={() =>
                  safe(() => {
                    const next = future[future.length - 1];
                    setFuture(future.slice(0, -1));
                    setPast((old) => [...old, project].slice(-5));
                    publish(next, false);
                  })
                }
              >
                {t("dataQuery.redo")}
              </DQAction>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("dataQuery.source")}
              </summary>
              <div className="mt-3 space-y-2">
                <DQField
                  label={t("dataQuery.source")}
                  value={draft ?? serialized}
                  onChange={setDraft}
                  multiline
                />
                <div className={actionsClass}>
                  <DQAction
                    onClick={() =>
                      safe(
                        () => publish(parseDqProject(draft ?? serialized)),
                        true,
                      )
                    }
                  >
                    {t("dataQuery.apply")}
                  </DQAction>
                  <DQAction
                    onClick={() => {
                      setDraft(null);
                      setError("");
                    }}
                  >
                    {t("dataQuery.discard")}
                  </DQAction>
                </div>
              </div>
            </details>
            <section
              className={sectionClass}
              aria-label={t("dataQuery.tables")}
            >
              <h3 className="font-bold">{t("dataQuery.tables")}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <DQSelect
                  label={t("dataQuery.dataset")}
                  value={table?.id ?? ""}
                  onChange={setDatasetId}
                >
                  {project.datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.rows.length})
                    </option>
                  ))}
                </DQSelect>
                <DQField
                  label={t("dataQuery.name")}
                  value={tableName}
                  onChange={setTableName}
                />
                <DQSelect
                  label={t("dataQuery.format")}
                  value={format}
                  onChange={(v) => {
                    setFormat(v);
                    setHar(null);
                  }}
                >
                  {["json", "ndjson", "csv", "har"].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </DQSelect>
                <DQSelect
                  label={t("dataQuery.target")}
                  value={target}
                  onChange={setTarget}
                >
                  <option value="new">{t("dataQuery.newTable")}</option>
                  <option value="append">{t("dataQuery.append")}</option>
                  <option value="replace">{t("dataQuery.replace")}</option>
                </DQSelect>
                <DQField
                  label={t("dataQuery.pointer")}
                  value={pointer}
                  onChange={setPointer}
                />
                <DQSelect
                  label={t("dataQuery.mode")}
                  value={mode}
                  onChange={(v) => setMode(v as DQImportMode)}
                >
                  <option value="records">{t("dataQuery.records")}</option>
                  <option value="values">{t("dataQuery.values")}</option>
                </DQSelect>
              </div>
              <DQField
                label={t("dataQuery.text")}
                value={importText}
                onChange={(v) => {
                  setImportText(v);
                  setHar(null);
                }}
                multiline
              />
              <label className="block text-xs font-semibold">
                {t("dataQuery.file")}
                <input
                  type="file"
                  accept=".json,.ndjson,.jsonl,.csv,.har"
                  className="mt-1 block max-w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readFile(file, false);
                  }}
                />
              </label>
              {format === "har" && (
                <>
                  <DQAction
                    onClick={() =>
                      safe(() => {
                        setHar(readDqHar(importText));
                        setHarIndex(0);
                      })
                    }
                  >
                    {t("dataQuery.inspectHar")}
                  </DQAction>
                  {har && (
                    <>
                      <p className="text-xs">
                        {t("dataQuery.harCount", {
                          count: String(har.entries.length),
                          skipped: String(har.skipped),
                        })}
                      </p>
                      <DQSelect
                        label={t("dataQuery.harEntry")}
                        value={String(harIndex)}
                        onChange={(v) => setHarIndex(Number(v))}
                      >
                        {har.entries.map((e, i) => (
                          <option key={e.index} value={i}>
                            {e.label}
                          </option>
                        ))}
                      </DQSelect>
                    </>
                  )}
                </>
              )}
              <div className={actionsClass}>
                <DQAction onClick={() => safe(importRows)}>
                  {t("dataQuery.import")}
                </DQAction>
                <DQAction
                  disabled={!table}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        datasets: project.datasets.filter(
                          (d) => d.id !== table?.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("dataQuery.deleteTable")}
                </DQAction>
              </div>
              {table && (
                <>
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("dataQuery.inventory")}
                    </summary>
                    <pre className="max-h-60 overflow-auto text-xs">
                      {dqPretty(inventory?.fields)}
                    </pre>
                    {inventory?.truncated && <p>{t("dataQuery.truncated")}</p>}
                  </details>
                  <DataQueryGrid
                    key={`table-${table.id}-${revision}`}
                    rows={table.rows}
                  />
                </>
              )}
            </section>
            <section
              className={sectionClass}
              aria-label={t("dataQuery.queries")}
            >
              <h3 className="font-bold">{t("dataQuery.queries")}</h3>
              <DQSelect
                label={t("dataQuery.query")}
                value={query?.id ?? ""}
                onChange={(v) => {
                  setQueryId(v);
                  setStageIndex(0);
                }}
              >
                {project.queries.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} ({q.id})
                  </option>
                ))}
              </DQSelect>
              <div className={actionsClass}>
                <DQAction onClick={() => safe(() => newQuery())}>
                  {t("dataQuery.newQuery")}
                </DQAction>
                <DQAction
                  disabled={!query}
                  onClick={() => safe(() => newQuery(true))}
                >
                  {t("dataQuery.cloneQuery")}
                </DQAction>
                <DQAction
                  disabled={!query}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        queries: project.queries.filter(
                          (q) => q.id !== query?.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("dataQuery.deleteQuery")}
                </DQAction>
              </div>
              {query && (
                <>
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("dataQuery.definition")}
                    </summary>
                    <JsonEdit
                      key={`query-${query.id}-${revision}`}
                      label={t("dataQuery.definition")}
                      value={query}
                      applyLabel={t("dataQuery.applyQuery")}
                      apply={(text) =>
                        safe(() => updateQuery(parseDqJson(text)))
                      }
                    />
                  </details>
                  <p className="break-words text-xs">
                    {t("dataQuery.dependencies")}:{" "}
                    {dependencies?.datasets.join(", ")} ·{" "}
                    {dependencies?.queries.join(", ")}
                  </p>
                  <p className="text-xs font-bold">{t("dataQuery.pipeline")}</p>
                  <ol className="flex flex-wrap gap-2">
                    {query.steps.map((step, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          className="rounded border px-3 py-2 text-xs"
                          aria-pressed={step === selectedStage}
                          onClick={() => setStageIndex(i)}
                        >
                          {i + 1}. {step.op}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {selectedStage && (
                    <>
                      <div className={actionsClass}>
                        <DQAction
                          disabled={query.steps.indexOf(selectedStage) === 0}
                          onClick={() => safe(() => stageAction("up"))}
                        >
                          {t("dataQuery.up")}
                        </DQAction>
                        <DQAction
                          disabled={
                            query.steps.indexOf(selectedStage) ===
                            query.steps.length - 1
                          }
                          onClick={() => safe(() => stageAction("down"))}
                        >
                          {t("dataQuery.down")}
                        </DQAction>
                        <DQAction
                          onClick={() => safe(() => stageAction("remove"))}
                        >
                          {t("dataQuery.removeStep")}
                        </DQAction>
                      </div>
                      <details>
                        <summary className="cursor-pointer text-xs font-bold">
                          {t("dataQuery.stageJson")}
                        </summary>
                        <JsonEdit
                          key={`stage-${query.id}-${query.steps.indexOf(selectedStage)}-${revision}`}
                          label={t("dataQuery.stageJson")}
                          value={selectedStage}
                          applyLabel={t("dataQuery.applyStep")}
                          apply={(text) =>
                            safe(() => {
                              const steps = [...query.steps];
                              steps[query.steps.indexOf(selectedStage)] =
                                normalizeDqStep(parseDqJson(text));
                              updateQuery({ ...query, steps });
                            })
                          }
                        />
                      </details>
                    </>
                  )}
                  <DQStepBuilder
                    key={`builder-${query.id}-${revision}`}
                    project={project}
                    query={query}
                    append={(make) =>
                      safe(() =>
                        updateQuery({
                          ...query,
                          steps: [...query.steps, normalizeDqStep(make())],
                        }),
                      )
                    }
                  />
                </>
              )}
              <DQField
                label={t("dataQuery.bindings")}
                value={bindings}
                onChange={setBindings}
                multiline
              />
              <DQAction
                disabled={!query}
                onClick={() =>
                  void start(async (options) => {
                    if (!query) throw new DataQueryError("reference");
                    const parameters = bindingsValue(),
                      result = await runDataQuery(
                        project,
                        query.id,
                        parameters,
                        [],
                        options,
                      );
                    return () => {
                      setCaptured({ result, parameters });
                      setMessage(
                        t("dataQuery.resultCount", {
                          count: String(result.rows.length),
                          work: String(result.work),
                        }),
                      );
                    };
                  })
                }
              >
                {t("dataQuery.run")}
              </DQAction>
            </section>
            {captured && (
              <section
                className={sectionClass}
                aria-label={t("dataQuery.result")}
              >
                <h3 className="font-bold">
                  {t("dataQuery.result")}: {captured.result.queryId}
                </h3>
                <p className="text-xs">
                  {t("dataQuery.resultCount", {
                    count: String(captured.result.rows.length),
                    work: String(captured.result.work),
                  })}
                </p>
                <DataQueryGrid
                  key={
                    captured.result.queryId +
                    captured.result.work +
                    JSON.stringify(captured.parameters)
                  }
                  rows={captured.result.rows}
                  lineage={captured.result.lineage}
                />
                <DataQueryPlan plan={captured.result.plan} />
                <div className={actionsClass}>
                  <DQAction
                    onClick={() =>
                      safe(() =>
                        save(dqPretty(captured.result.rows), "query-rows.json"),
                      )
                    }
                  >
                    {t("dataQuery.json")}
                  </DQAction>
                  <DQAction
                    onClick={() =>
                      safe(() =>
                        save(
                          captured.result.rows
                            .map((r) => JSON.stringify(r))
                            .join("\n"),
                          "query-rows.ndjson",
                          "application/x-ndjson",
                        ),
                      )
                    }
                  >
                    {t("dataQuery.ndjson")}
                  </DQAction>
                  <DQAction
                    onClick={() =>
                      safe(() =>
                        save(
                          exportDqCsv(captured.result.rows),
                          "query-rows.csv",
                          "text/csv;charset=utf-8",
                        ),
                      )
                    }
                  >
                    {t("dataQuery.csv")}
                  </DQAction>
                  <DQAction
                    onClick={() =>
                      safe(() => addTable(captured.result.rows, tableName))
                    }
                  >
                    {t("dataQuery.materialize")}
                  </DQAction>
                </div>
                <label className="block text-xs">
                  <input
                    type="checkbox"
                    checked={exact}
                    onChange={(e) => setExact(e.target.checked)}
                  />{" "}
                  {t("dataQuery.exact")}
                </label>
                <DQAction onClick={() => safe(record)}>
                  {t("dataQuery.record")}
                </DQAction>
              </section>
            )}
            <section className={sectionClass} aria-label={t("dataQuery.cases")}>
              <h3 className="font-bold">{t("dataQuery.cases")}</h3>
              <DQSelect
                label={t("dataQuery.case")}
                value={scenario?.id ?? ""}
                onChange={setCaseId}
              >
                {project.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </DQSelect>
              <div className={actionsClass}>
                <DQAction disabled={!query} onClick={() => safe(addCase)}>
                  {t("dataQuery.newCase")}
                </DQAction>
                <DQAction
                  disabled={!scenario}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        scenarios: project.scenarios.filter(
                          (s) => s.id !== scenario?.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("dataQuery.deleteCase")}
                </DQAction>
              </div>
              {scenario && (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("dataQuery.caseJson")}
                  </summary>
                  <JsonEdit
                    key={`case-${scenario.id}-${revision}`}
                    label={t("dataQuery.caseJson")}
                    value={scenario}
                    applyLabel={t("dataQuery.applyCase")}
                    apply={(text) =>
                      safe(() =>
                        publish({
                          ...project,
                          scenarios: project.scenarios.map((s) =>
                            s.id === scenario.id ? parseDqJson(text) : s,
                          ),
                        }),
                      )
                    }
                  />
                </details>
              )}
              <div className={actionsClass}>
                {[false, true].map((all) => (
                  <DQAction
                    key={String(all)}
                    disabled={!all && !scenario}
                    onClick={() =>
                      void start(async (options) => {
                        const completed = await runDqScenarios(
                          project,
                          all ? undefined : scenario?.id,
                          {
                            ...options,
                            suiteProgress: (done) => {
                              if (!options.cancelled?.()) setProgress(done);
                            },
                          },
                        );
                        return () => {
                          setRuns(completed);
                          setMessage(
                            t("dataQuery.suite", {
                              passed: String(
                                completed.filter((r) => r.passed).length,
                              ),
                              total: String(completed.length),
                            }),
                          );
                        };
                      })
                    }
                  >
                    {t(all ? "dataQuery.runAll" : "dataQuery.runCase")}
                  </DQAction>
                ))}
              </div>
              {runs && (
                <>
                  <ul className="space-y-1 text-xs">
                    {runs.map((r) => (
                      <li key={r.scenarioId}>
                        {r.scenarioName}:{" "}
                        {t(
                          !r.checked
                            ? "dataQuery.unchecked"
                            : r.passed
                              ? "dataQuery.passed"
                              : "dataQuery.failed",
                        )}{" "}
                        · {r.summary?.rows ?? "—"}
                        {r.error
                          ? ` · ${r.error.code} (${r.error.queryId ?? "—"}:${r.error.stage ?? "—"})`
                          : ""}
                        {r.checks.length > 0 && (
                          <details className="ml-3">
                            <summary className="cursor-pointer">
                              {t("dataQuery.checked")}
                            </summary>
                            <ul>
                              {r.checks.map((check, index) => (
                                <li key={index}>
                                  {check.kind}[{check.index}]:{" "}
                                  {t(
                                    check.passed
                                      ? "dataQuery.passed"
                                      : "dataQuery.failed",
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                  <DQAction
                    onClick={() =>
                      safe(() => save(dqReport(runs), "data-query-report.json"))
                    }
                  >
                    {t("dataQuery.report")}
                  </DQAction>
                </>
              )}
            </section>
            <section
              className={sectionClass}
              aria-label={t("dataQuery.compare")}
            >
              <h3 className="font-bold">{t("dataQuery.compare")}</h3>
              <p className="text-xs text-slate-600">
                {t("dataQuery.comparisonHelp")}
              </p>
              <DQField
                label={t("dataQuery.overrides")}
                value={overrides}
                onChange={setOverrides}
                multiline
              />
              <DQField
                label={t("dataQuery.identity")}
                value={identity}
                onChange={setIdentity}
              />
              <DQAction
                disabled={!query}
                onClick={() =>
                  void start(async (options) => {
                    if (!query) throw new DataQueryError("reference");
                    const parameters = bindingsValue(),
                      tables = normalizeDqOverrides(
                        parseDqJson(overrides),
                        project.datasets,
                      ),
                      key = identity;
                    const baseline = await runDataQuery(
                        project,
                        query.id,
                        parameters,
                        [],
                        options,
                      ),
                      candidate = await runDataQuery(
                        project,
                        query.id,
                        parameters,
                        tables,
                        options,
                      ),
                      diff = compareDqRows(baseline.rows, candidate.rows, key);
                    return () => {
                      setComparison(diff);
                      setMessage(
                        t(
                          "dataQuery.compared",
                          Object.fromEntries(
                            Object.entries(diff.summary).map(([k, v]) => [
                              k,
                              String(v),
                            ]),
                          ),
                        ),
                      );
                    };
                  })
                }
              >
                {t("dataQuery.compareRun")}
              </DQAction>
              {comparison && (
                <>
                  <p className="text-xs">
                    {t(
                      "dataQuery.compared",
                      Object.fromEntries(
                        Object.entries(comparison.summary).map(([k, v]) => [
                          k,
                          String(v),
                        ]),
                      ),
                    )}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("dataQuery.differences")}
                    </summary>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                      {dqPretty(comparison.differences)}
                    </pre>
                  </details>
                </>
              )}
            </section>
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                {t("dataQuery.exportHelp")}
              </p>
              <div className={actionsClass}>
                <DQAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateDqToolkit(project),
                        "data-query-sdk.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("dataQuery.sdk")}
                </DQAction>
                <DQAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateDqRunner(project),
                        "data-query-tests.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("dataQuery.runner")}
                </DQAction>
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </details>
  );
});
