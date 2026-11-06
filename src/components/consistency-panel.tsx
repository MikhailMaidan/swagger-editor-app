"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  LCAction,
  LCField,
  LCSelect,
  LCJsonEdit,
  LCOperationBuilder,
  lcFreshId,
  lcPretty,
} from "./consistency-controls";
import {
  ConsistencyTimeline,
  ConsistencyAnalysis,
} from "./consistency-timeline";
import {
  ConsistencyError,
  MAX_LC_PROJECT,
  emptyLcProject,
  normalizeLcProject,
  normalizeLcHistory,
  parseLcProject,
  parseLcJson,
  serializeLcProject,
  type LCProject,
  type LCHistory,
  type LCObject,
  type LCMode,
} from "@/lib/consistency-model";
import {
  analyzeConsistency,
  runConsistencySuite,
  findFailingPrefix,
  consistencyReport,
  type LCOptions,
  type LCResult,
  type LCSuiteRun,
  type LCPrefixResult,
} from "@/lib/consistency-engine";
import { demoLcProject } from "@/lib/consistency-demo";
import {
  importLcOperations,
  defaultLcHarRules,
  inspectLcHar,
  type LCHarPreview,
} from "@/lib/consistency-import";
import {
  exportLcSvg,
  generateLcToolkit,
  generateLcRunner,
} from "@/lib/consistency-export";
import { getByteSize } from "@/lib/text-encoding";
import { downloadTextFile } from "@/lib/schema-download";

function LCBudget({
  history,
  apply,
}: {
  history: LCHistory;
  apply: (value: number) => void;
}) {
  const { t } = useI18n(),
    [text, setText] = useState(String(history.maxStates));
  return (
    <div className="space-y-2">
      <LCField
        label={t("consistency.budget")}
        value={text}
        onChange={setText}
      />
      <LCAction onClick={() => apply(/^\d+$/.test(text) ? Number(text) : NaN)}>
        {t("consistency.applyBudget")}
      </LCAction>
    </div>
  );
}
export const ConsistencyPanel = memo(function ConsistencyPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState<LCProject>(emptyLcProject),
    [draft, setDraft] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [past, setPast] = useState<LCProject[]>([]),
    [future, setFuture] = useState<LCProject[]>([]),
    [historyId, setHistoryId] = useState("history-1"),
    [operationId, setOperationId] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [counts, setCounts] = useState({ states: 0, attempts: 0 }),
    [analysis, setAnalysis] = useState<{
      history: LCHistory;
      result: LCResult;
    } | null>(null),
    [comparison, setComparison] = useState<LCResult[] | null>(null),
    [runs, setRuns] = useState<LCSuiteRun[] | null>(null),
    [prefix, setPrefix] = useState<LCPrefixResult | null>(null);
  const [kind, setKind] = useState<LCObject["kind"]>("register"),
    [initial, setInitial] = useState("0"),
    [objectName, setObjectName] = useState("New object"),
    [importText, setImportText] = useState(""),
    [format, setFormat] = useState("operations"),
    [append, setAppend] = useState(false),
    [harRules, setHarRules] = useState(lcPretty(defaultLcHarRules("value"))),
    [clientHeader, setClientHeader] = useState(""),
    [har, setHar] = useState<LCHarPreview | null>(null),
    [partial, setPartial] = useState(false);
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
  const serialized = useMemo(() => serializeLcProject(project), [project]),
    dirty = draft !== null && draft !== serialized;
  const history =
      project.histories.find((h) => h.id === historyId) ?? project.histories[0],
    operation =
      history?.operations.find((op) => op.id === operationId) ??
      history?.operations[0];
  function diagnose(e: unknown) {
    setError(
      t("consistency.error", {
        code: e instanceof ConsistencyError ? e.code : "project",
      }),
    );
  }
  function safe(action: () => void, allowDraft = false) {
    if (busy) return;
    setError("");
    if (dirty && !allowDraft) {
      setError(t("consistency.dirty"));
      return;
    }
    try {
      action();
    } catch (e) {
      diagnose(e);
    }
  }
  function clearAnalysis() {
    setAnalysis(null);
    setComparison(null);
    setPrefix(null);
  }
  function publish(value: unknown, record = true) {
    const next = normalizeLcProject(value);
    if (record) {
      setPast((old) => [...old, project].slice(-5));
      setFuture([]);
    }
    setProject(next);
    setDraft(null);
    setRevision((v) => v + 1);
    clearAnalysis();
    setRuns(null);
    setHar(null);
    setPartial(false);
    setMessage(t("consistency.ready"));
  }
  function replaceHistory(value: unknown) {
    if (!history) throw new ConsistencyError("reference");
    publish({
      ...project,
      histories: project.histories.map((h) =>
        h.id === history.id ? value : h,
      ),
    });
  }
  function addHistory(clone = false) {
    const id = lcFreshId("history", project.histories),
      value: LCHistory =
        clone && history
          ? { ...history, id, name: "Copied operation history" }
          : {
              id,
              name: "Operation history",
              mode: "linearizable",
              maxStates: 20000,
              expected: null,
              operations: [],
            };
    publish({ ...project, histories: [...project.histories, value] });
    setHistoryId(id);
    setOperationId("");
  }
  function save(text: string, filename: string, mime = "application/json") {
    if (getByteSize(text) > 16 * 1024 * 1024)
      throw new ConsistencyError("limit");
    if (!downloadTextFile(text, filename, mime))
      setError(t("consistency.downloadError"));
  }
  async function start(action: (options: LCOptions) => Promise<() => void>) {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("consistency.dirty"));
      return;
    }
    const token = ++generation.current,
      cancelled = () => !mounted.current || token !== generation.current;
    setBusy(true);
    setCounts({ states: 0, attempts: 0 });
    try {
      const apply = await action({
        cancelled,
        progress: (next) => {
          if (!cancelled()) setCounts(next);
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
    setMessage(t("consistency.cancelled"));
  }
  async function fileRead(file: File, restore: boolean) {
    await start(async (options) => {
      if (file.size > MAX_LC_PROJECT) throw new ConsistencyError("limit");
      const text = await file.text();
      if (options.cancelled?.()) return () => {};
      if (getByteSize(text) > MAX_LC_PROJECT)
        throw new ConsistencyError("limit");
      const parsed = restore ? parseLcProject(text) : null;
      return () => {
        if (parsed) publish(parsed);
        else {
          setImportText(text);
          setHar(null);
        }
      };
    });
  }
  const buttons = "flex flex-wrap gap-2",
    section =
      "space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4";
  const verdictText = (result: LCResult) =>
    t("consistency.summary", {
      verdict: t(`consistency.${result.verdict}`),
      states: String(result.states),
      attempts: String(result.attempts),
      completed: String(result.completed),
      pending: String(result.pending),
    });
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-5 shadow-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-base font-bold text-[color:var(--color-ink)]">
        {t("consistency.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("consistency.description")}</p>
          <p className="text-xs text-slate-600">{t("consistency.help")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-xs">
            {busy
              ? t("consistency.busy", {
                  states: String(counts.states),
                  attempts: String(counts.attempts),
                })
              : message}
          </p>
          {busy && (
            <LCAction onClick={cancel}>{t("consistency.cancel")}</LCAction>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className={buttons}>
              <LCAction onClick={() => safe(() => publish(emptyLcProject()))}>
                {t("consistency.new")}
              </LCAction>
              <LCAction
                onClick={() =>
                  safe(() => {
                    publish(demoLcProject());
                    setHistoryId("overlap");
                    setOperationId("");
                  })
                }
              >
                {t("consistency.demo")}
              </LCAction>
              <LCAction
                onClick={() =>
                  safe(() => save(serialized, "concurrency-project.json"))
                }
              >
                {t("consistency.export")}
              </LCAction>
              <label className="text-xs font-semibold">
                {t("consistency.restore")}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="mt-1 block max-w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void fileRead(file, true);
                  }}
                />
              </label>
              <LCAction
                disabled={!past.length}
                onClick={() =>
                  safe(() => {
                    const next = past[past.length - 1];
                    setPast(past.slice(0, -1));
                    setFuture((old) => [...old, project].slice(-5));
                    publish(next, false);
                  })
                }
              >
                {t("consistency.undo")}
              </LCAction>
              <LCAction
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
                {t("consistency.redo")}
              </LCAction>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("consistency.source")}
              </summary>
              <div className="mt-3 space-y-2">
                <LCField
                  label={t("consistency.source")}
                  value={draft ?? serialized}
                  onChange={setDraft}
                  multiline
                />
                <div className={buttons}>
                  <LCAction
                    onClick={() =>
                      safe(
                        () => publish(parseLcProject(draft ?? serialized)),
                        true,
                      )
                    }
                  >
                    {t("consistency.apply")}
                  </LCAction>
                  <LCAction
                    onClick={() => {
                      setDraft(null);
                      setError("");
                    }}
                  >
                    {t("consistency.discard")}
                  </LCAction>
                </div>
              </div>
            </details>
            <section className={section} aria-label={t("consistency.objects")}>
              <h3 className="font-bold">{t("consistency.objects")}</h3>
              <p className="text-xs text-slate-600">
                {t("consistency.modelHelp")}
              </p>
              <ul className="text-xs">
                {project.objects.map((o) => (
                  <li key={o.id}>
                    {o.id}: {o.name} · {o.kind}
                  </li>
                ))}
              </ul>
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("consistency.objectJson")}
                </summary>
                <LCJsonEdit
                  key={`objects-${revision}`}
                  label={t("consistency.objectJson")}
                  value={project.objects}
                  applyLabel={t("consistency.applyObjects")}
                  apply={(text) =>
                    safe(() =>
                      publish({ ...project, objects: parseLcJson(text) }),
                    )
                  }
                />
              </details>
              <div className="grid gap-3 md:grid-cols-3">
                <LCSelect
                  label={t("consistency.kind")}
                  value={kind}
                  onChange={(v) => {
                    setKind(v as LCObject["kind"]);
                    setInitial(v === "queue" ? "[]" : "0");
                  }}
                >
                  {["register", "counter", "queue"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </LCSelect>
                <LCField
                  label={t("consistency.objectName")}
                  value={objectName}
                  onChange={setObjectName}
                />
                <LCField
                  label={t("consistency.initial")}
                  value={initial}
                  onChange={setInitial}
                />
              </div>
              <LCAction
                onClick={() =>
                  safe(() =>
                    publish({
                      ...project,
                      objects: [
                        ...project.objects,
                        {
                          id: lcFreshId("object", project.objects),
                          name: objectName,
                          kind,
                          initial: parseLcJson(initial),
                        },
                      ],
                    }),
                  )
                }
              >
                {t("consistency.addObject")}
              </LCAction>
            </section>
            <section
              className={section}
              aria-label={t("consistency.operations")}
            >
              <h3 className="font-bold">{t("consistency.operations")}</h3>
              <LCSelect
                label={t("consistency.history")}
                value={history?.id ?? ""}
                onChange={(id) => {
                  setHistoryId(id);
                  setOperationId("");
                  clearAnalysis();
                }}
              >
                {project.histories.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.id})
                  </option>
                ))}
              </LCSelect>
              <div className={buttons}>
                <LCAction onClick={() => safe(() => addHistory())}>
                  {t("consistency.newHistory")}
                </LCAction>
                <LCAction
                  disabled={!history}
                  onClick={() => safe(() => addHistory(true))}
                >
                  {t("consistency.cloneHistory")}
                </LCAction>
                <LCAction
                  disabled={!history}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        histories: project.histories.filter(
                          (h) => h.id !== history?.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("consistency.deleteHistory")}
                </LCAction>
              </div>
              {history && (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <LCSelect
                      label={t("consistency.mode")}
                      value={history.mode}
                      onChange={(mode) =>
                        safe(() => replaceHistory({ ...history, mode }))
                      }
                    >
                      <option value="linearizable">
                        {t("consistency.linearizable")}
                      </option>
                      <option value="sequential">
                        {t("consistency.sequential")}
                      </option>
                    </LCSelect>
                    <LCBudget
                      key={`budget-${history.id}-${revision}`}
                      history={history}
                      apply={(maxStates) =>
                        safe(() => replaceHistory({ ...history, maxStates }))
                      }
                    />
                  </div>
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("consistency.historyJson")}
                    </summary>
                    <LCJsonEdit
                      key={`history-${history.id}-${revision}`}
                      label={t("consistency.historyJson")}
                      value={history}
                      applyLabel={t("consistency.applyHistory")}
                      apply={(text) =>
                        safe(() => replaceHistory(parseLcJson(text)))
                      }
                    />
                  </details>
                  <LCOperationBuilder
                    key={`builder-${history.id}-${revision}`}
                    project={project}
                    history={history}
                    append={(make) =>
                      safe(() => {
                        const next = normalizeLcHistory(
                          {
                            ...history,
                            operations: [...history.operations, make()],
                          },
                          project.objects,
                        );
                        replaceHistory(next);
                        setOperationId(next.operations.at(-1)!.id);
                      })
                    }
                  />
                  <h4 className="text-sm font-bold">
                    {t("consistency.timeline")}
                  </h4>
                  <ConsistencyTimeline
                    history={history}
                    selected={operation?.id ?? ""}
                    select={setOperationId}
                  />
                  {operation && (
                    <>
                      <LCJsonEdit
                        key={`op-${history.id}-${operation.id}-${revision}`}
                        label={t("consistency.operationJson")}
                        value={operation}
                        applyLabel={t("consistency.applyOperation")}
                        apply={(text) =>
                          safe(() =>
                            replaceHistory({
                              ...history,
                              operations: history.operations.map((op) =>
                                op.id === operation.id ? parseLcJson(text) : op,
                              ),
                            }),
                          )
                        }
                      />
                      <LCAction
                        onClick={() =>
                          safe(() =>
                            replaceHistory({
                              ...history,
                              operations: history.operations.filter(
                                (op) => op.id !== operation.id,
                              ),
                            }),
                          )
                        }
                      >
                        {t("consistency.deleteOperation")}
                      </LCAction>
                    </>
                  )}
                  <div className={buttons}>
                    <LCAction
                      onClick={() =>
                        void start(async (options) => {
                          const result = await analyzeConsistency(
                            project,
                            history.id,
                            options,
                          );
                          return () => {
                            setAnalysis({ history, result });
                            setMessage(verdictText(result));
                          };
                        })
                      }
                    >
                      {t("consistency.run")}
                    </LCAction>
                    <LCAction
                      onClick={() =>
                        void start(async (options) => {
                          const results: LCResult[] = [];
                          for (const mode of [
                            "linearizable",
                            "sequential",
                          ] as LCMode[])
                            results.push(
                              await analyzeConsistency(project, history.id, {
                                ...options,
                                mode,
                              }),
                            );
                          return () => {
                            setComparison(results);
                          };
                        })
                      }
                    >
                      {t("consistency.compare")}
                    </LCAction>
                    <LCAction
                      onClick={() =>
                        safe(() =>
                          save(
                            exportLcSvg(history, analysis?.result),
                            "concurrency-timeline.svg",
                            "image/svg+xml",
                          ),
                        )
                      }
                    >
                      {t("consistency.svg")}
                    </LCAction>
                  </div>
                </>
              )}
            </section>
            <section className={section} aria-label={t("consistency.imports")}>
              <h3 className="font-bold">{t("consistency.imports")}</h3>
              <LCSelect
                label={t("consistency.format")}
                value={format}
                onChange={(v) => {
                  setFormat(v);
                  setHar(null);
                  setPartial(false);
                }}
              >
                <option value="operations">
                  {t("consistency.operationFormat")}
                </option>
                <option value="har">{t("consistency.harFormat")}</option>
              </LCSelect>
              <LCField
                label={t("consistency.importText")}
                value={importText}
                onChange={(v) => {
                  setImportText(v);
                  setHar(null);
                  setPartial(false);
                }}
                multiline
              />
              <label className="block text-xs font-semibold">
                {t("consistency.file")}
                <input
                  type="file"
                  accept=".json,.ndjson,.jsonl,.har"
                  className="mt-1 block max-w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void fileRead(file, false);
                  }}
                />
              </label>
              <label className="block text-xs">
                <input
                  type="checkbox"
                  checked={append}
                  onChange={(e) => setAppend(e.target.checked)}
                />{" "}
                {t("consistency.append")}
              </label>
              {format === "operations" ? (
                <LCAction
                  disabled={!history}
                  onClick={() =>
                    safe(() => {
                      if (!history) return;
                      replaceHistory(
                        importLcOperations(
                          importText,
                          history,
                          project.objects,
                          append,
                        ),
                      );
                    })
                  }
                >
                  {t("consistency.importOperations")}
                </LCAction>
              ) : (
                <>
                  <p className="text-xs text-slate-600">
                    {t("consistency.harHelp")}
                  </p>
                  <LCField
                    label={t("consistency.harRules")}
                    value={harRules}
                    onChange={(v) => {
                      setHarRules(v);
                      setHar(null);
                      setPartial(false);
                    }}
                    multiline
                  />
                  <LCField
                    label={t("consistency.clientHeader")}
                    value={clientHeader}
                    onChange={(v) => {
                      setClientHeader(v);
                      setHar(null);
                      setPartial(false);
                    }}
                  />
                  <LCAction
                    onClick={() =>
                      safe(() => {
                        setHar(
                          inspectLcHar(
                            importText,
                            parseLcJson(harRules),
                            project.objects,
                            clientHeader,
                          ),
                        );
                        setPartial(false);
                      })
                    }
                  >
                    {t("consistency.inspectHar")}
                  </LCAction>
                  {har && (
                    <>
                      <p className="text-xs">
                        {t("consistency.harSummary", {
                          count: String(har.operations.length),
                          skipped: String(har.skipped.length),
                        })}
                      </p>
                      <pre className="max-h-48 overflow-auto text-xs">
                        {lcPretty({ origin: har.origin, skipped: har.skipped })}
                      </pre>
                      {har.skipped.length > 0 && (
                        <label className="block text-xs">
                          <input
                            type="checkbox"
                            checked={partial}
                            onChange={(e) => setPartial(e.target.checked)}
                          />{" "}
                          {t("consistency.partial")}
                        </label>
                      )}
                      <LCAction
                        disabled={
                          !history ||
                          !har.operations.length ||
                          (har.skipped.length > 0 && !partial)
                        }
                        onClick={() =>
                          safe(() => {
                            if (!history) return;
                            replaceHistory({
                              ...history,
                              operations: [
                                ...(append ? history.operations : []),
                                ...har.operations,
                              ],
                            });
                          })
                        }
                      >
                        {t("consistency.applyHar")}
                      </LCAction>
                    </>
                  )}
                </>
              )}
            </section>
            {analysis && (
              <section
                className={section}
                aria-label={t("consistency.analysis")}
              >
                <h3 className="font-bold">
                  {t("consistency.analysis")}: {analysis.history.id} ·{" "}
                  {analysis.result.mode}
                </h3>
                <ConsistencyAnalysis
                  key={`${analysis.history.id}-${analysis.result.mode}-${analysis.result.states}`}
                  result={analysis.result}
                />
                <div className={buttons}>
                  <LCAction
                    disabled={analysis.result.verdict === "inconclusive"}
                    onClick={() =>
                      safe(() =>
                        publish({
                          ...project,
                          histories: project.histories.map((h) =>
                            h.id === analysis.history.id
                              ? { ...h, expected: analysis.result.verdict }
                              : h,
                          ),
                        }),
                      )
                    }
                  >
                    {t("consistency.record")}
                  </LCAction>
                  <LCAction
                    onClick={() =>
                      safe(() =>
                        save(
                          consistencyReport([
                            {
                              historyId: analysis.history.id,
                              expected: analysis.history.expected,
                              passed:
                                analysis.history.expected !== null &&
                                analysis.result.verdict ===
                                  analysis.history.expected,
                              result: analysis.result,
                            },
                          ]),
                          "concurrency-analysis.json",
                        ),
                      )
                    }
                  >
                    {t("consistency.report")}
                  </LCAction>
                  <LCAction
                    disabled={analysis.result.verdict !== "invalid"}
                    onClick={() =>
                      void start(async (options) => {
                        const found = await findFailingPrefix(
                          project,
                          analysis.history.id,
                          options,
                        );
                        return () => {
                          setPrefix(found);
                          setMessage(
                            found.status === "found"
                              ? t("consistency.prefixFound", {
                                  count: String(found.checked),
                                  cutoff:
                                    found.cutoff === null
                                      ? "—"
                                      : String(found.cutoff),
                                })
                              : t("consistency.prefixLimited"),
                          );
                        };
                      })
                    }
                  >
                    {t("consistency.prefix")}
                  </LCAction>
                </div>
                <p className="text-xs text-slate-600">
                  {t("consistency.prefixHelp")}
                </p>
                {prefix?.status === "found" && (
                  <>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
                      {lcPretty(prefix.history)}
                    </pre>
                    <LCAction
                      onClick={() =>
                        safe(() => {
                          const id = lcFreshId("prefix", project.histories);
                          publish({
                            ...project,
                            histories: [
                              ...project.histories,
                              {
                                ...prefix.history,
                                id,
                                name: "Failing event prefix",
                              },
                            ],
                          });
                          setHistoryId(id);
                        })
                      }
                    >
                      {t("consistency.savePrefix")}
                    </LCAction>
                  </>
                )}
              </section>
            )}
            {comparison && (
              <section
                className={section}
                aria-label={t("consistency.compare")}
              >
                <h3 className="font-bold">{t("consistency.compare")}</h3>
                <ul className="text-xs">
                  {comparison.map((result) => (
                    <li key={result.mode}>
                      {result.mode}: {verdictText(result)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className={section} aria-label={t("consistency.runAll")}>
              <h3 className="font-bold">{t("consistency.runAll")}</h3>
              <LCAction
                onClick={() =>
                  void start(async (options) => {
                    const completed = await runConsistencySuite(
                      project,
                      options,
                    );
                    return () => {
                      setRuns(completed);
                      setMessage(
                        t("consistency.suite", {
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
                {t("consistency.runAll")}
              </LCAction>
              {runs && (
                <>
                  <ul className="space-y-1 text-xs">
                    {runs.map((run) => (
                      <li key={run.historyId}>
                        {run.historyId}:{" "}
                        {t(
                          run.expected === null
                            ? "consistency.unchecked"
                            : run.passed
                              ? "consistency.passed"
                              : "consistency.failed",
                        )}{" "}
                        · {t(`consistency.${run.result.verdict}`)} ·{" "}
                        {run.result.reason}
                      </li>
                    ))}
                  </ul>
                  <LCAction
                    onClick={() =>
                      safe(() =>
                        save(
                          consistencyReport(runs),
                          "concurrency-regression-report.json",
                        ),
                      )
                    }
                  >
                    {t("consistency.report")}
                  </LCAction>
                </>
              )}
            </section>
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                {t("consistency.exportHelp")}
              </p>
              <div className={buttons}>
                <LCAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateLcToolkit(),
                        "consistency-checker.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("consistency.sdk")}
                </LCAction>
                <LCAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateLcRunner(project),
                        "consistency-tests.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("consistency.runner")}
                </LCAction>
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </details>
  );
});
