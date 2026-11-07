"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  DTAction,
  DTField,
  DTSelect,
  DTJsonEdit,
  DTRuleBuilder,
  DTColumnBuilder,
  dtPretty,
  dtFreshId,
} from "./decision-controls";
import {
  DecisionGraph,
  DecisionExplanation,
  dtStatusKey,
} from "./decision-graph";
import {
  DecisionError,
  MAX_DT_PROJECT,
  emptyDtProject,
  normalizeDtProject,
  normalizeDtContext,
  parseDtProject,
  parseDtJson,
  serializeDtProject,
  type DTProject,
  type DTDecision,
  type DTScalar,
  type DTInput,
  type DTStatus,
} from "@/lib/decision-model";
import {
  evaluateDecision,
  analyzeDecisionCatalog,
  findDecisionCounterfactual,
  runDecisionSuite,
  recordDecisionExpectation,
  decisionReport,
  type DTEvaluation,
  type DTCoverage,
  type DTCounterfactual,
  type DTCaseRun,
  type DTOptions,
} from "@/lib/decision-engine";
import { demoDtProject } from "@/lib/decision-demo";
import { importDecisionContexts } from "@/lib/decision-import";
import {
  generateDecisionSdk,
  generateDecisionService,
  generateDecisionContract,
  generateDecisionRunner,
} from "@/lib/decision-export";
import { getByteSize } from "@/lib/text-encoding";
import { downloadTextFile } from "@/lib/schema-download";
const statuses: DTStatus[] = [
  "matched",
  "default",
  "no-match",
  "conflict",
  "blocked",
  "error",
];
export const DecisionPanel = memo(function DecisionPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState<DTProject>(emptyDtProject),
    [draft, setDraft] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [past, setPast] = useState<DTProject[]>([]),
    [future, setFuture] = useState<DTProject[]>([]),
    [decisionId, setDecisionId] = useState("decision"),
    [ruleId, setRuleId] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ checked: 0, total: 0, work: 0 }),
    [contextText, setContextText] = useState('{"amount":0}'),
    [captured, setCaptured] = useState<{
      context: Record<string, DTScalar>;
      evaluation: DTEvaluation;
    } | null>(null),
    [coverage, setCoverage] = useState<DTCoverage | null>(null),
    [counter, setCounter] = useState<DTCounterfactual | null>(null),
    [runs, setRuns] = useState<DTCaseRun[] | null>(null);
  const [inputType, setInputType] = useState<DTInput["type"]>("number"),
    [inputName, setInputName] = useState("New input"),
    [targetStatus, setTargetStatus] = useState<DTStatus>("matched"),
    [targetOutput, setTargetOutput] = useState("0"),
    [mutable, setMutable] = useState(""),
    [caseId, setCaseId] = useState(""),
    [exact, setExact] = useState(false),
    [importText, setImportText] = useState("");
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
  const serialized = useMemo(() => serializeDtProject(project), [project]),
    dirty = draft !== null && draft !== serialized;
  const decision =
      project.decisions.find((d) => d.id === decisionId) ??
      project.decisions[0],
    rule = decision?.rules.find((r) => r.id === ruleId) ?? decision?.rules[0],
    scenario = project.cases.find((c) => c.id === caseId) ?? project.cases[0];
  function diagnose(e: unknown) {
    setError(
      t("decision.error", {
        code: e instanceof DecisionError ? e.code : "project",
      }),
    );
  }
  function safe(action: () => void, allowDraft = false) {
    if (busy) return;
    setError("");
    if (dirty && !allowDraft) {
      setError(t("decision.dirty"));
      return;
    }
    try {
      action();
    } catch (e) {
      diagnose(e);
    }
  }
  function clearResults() {
    setCaptured(null);
    setCoverage(null);
    setCounter(null);
  }
  function selectDecision(id: string) {
    setDecisionId(id);
    setRuleId("");
    clearResults();
  }
  function publish(value: unknown, record = true) {
    const next = normalizeDtProject(value);
    if (record) {
      setPast((old) => [...old, project].slice(-5));
      setFuture([]);
    }
    setProject(next);
    setDraft(null);
    setRevision((v) => v + 1);
    clearResults();
    setRuns(null);
    setMessage(t("decision.ready"));
  }
  function updateDecision(value: unknown) {
    if (!decision) throw new DecisionError("reference");
    publish({
      ...project,
      decisions: project.decisions.map((d) =>
        d.id === decision.id ? value : d,
      ),
    });
  }
  function save(text: string, name: string, mime = "application/json") {
    if (getByteSize(text) > 16 * 1024 * 1024) throw new DecisionError("limit");
    if (!downloadTextFile(text, name, mime))
      setError(t("decision.downloadError"));
  }
  async function start(action: (options: DTOptions) => Promise<() => void>) {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("decision.dirty"));
      return;
    }
    const token = ++generation.current,
      cancelled = () => !mounted.current || token !== generation.current;
    setBusy(true);
    setProgress({ checked: 0, total: 0, work: 0 });
    try {
      const apply = await action({
        cancelled,
        progress: (next) => {
          if (!cancelled()) setProgress(next);
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
    setMessage(t("decision.cancelled"));
  }
  function context() {
    if (!decision) throw new DecisionError("reference");
    return normalizeDtContext(project, decision.id, parseDtJson(contextText));
  }
  function addDecision(clone = false) {
    const id = dtFreshId("decision", project.decisions),
      value: DTDecision =
        clone && decision
          ? { ...decision, id, name: "Copied decision" }
          : {
              id,
              name: "Business decision",
              policy: "unique",
              columns: project.inputs[0]
                ? [
                    {
                      id: "column",
                      name: project.inputs[0].name,
                      source: { kind: "input", id: project.inputs[0].id },
                    },
                  ]
                : [],
              rules: [],
              fallback: null,
            };
    publish({ ...project, decisions: [...project.decisions, value] });
    selectDecision(id);
  }
  function moveRule(direction: number) {
    if (!decision || !rule) return;
    const rules = [...decision.rules],
      index = rules.indexOf(rule),
      next = index + direction;
    if (next < 0 || next >= rules.length) return;
    [rules[index], rules[next]] = [rules[next], rules[index]];
    updateDecision({ ...decision, rules });
  }
  function addCase(recorded = false) {
    const id = dtFreshId("case", project.cases);
    const value =
      recorded && captured
        ? {
            id,
            name: id,
            decisionId: captured.evaluation.rootId,
            context: captured.context,
            expect: recordDecisionExpectation(captured.evaluation, exact),
          }
        : {
            id,
            name: id,
            decisionId: decision!.id,
            context: context(),
            expect: null,
          };
    publish({ ...project, cases: [...project.cases, value] });
    setCaseId(id);
  }
  async function readFile(file: File, restore: boolean) {
    await start(async (options) => {
      if (file.size > MAX_DT_PROJECT) throw new DecisionError("limit");
      const text = await file.text();
      if (options.cancelled?.()) return () => {};
      if (getByteSize(text) > MAX_DT_PROJECT) throw new DecisionError("limit");
      const parsed = restore ? parseDtProject(text) : null;
      return () => {
        if (parsed) {
          publish(parsed);
          const first = parsed.cases[0];
          setDecisionId(first?.decisionId ?? parsed.decisions[0]?.id ?? "");
          setRuleId("");
          setContextText(
            dtPretty(
              first?.context ??
                Object.fromEntries(
                  parsed.inputs.flatMap((input) => {
                    const cell = input.catalog[0];
                    return cell.present ? [[input.id, cell.value]] : [];
                  }),
                ),
            ),
          );
        } else setImportText(text);
      };
    });
  }
  const actions = "flex flex-wrap gap-2",
    section =
      "space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4";
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-5 shadow-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-base font-bold text-[color:var(--color-ink)]">
        {t("decision.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("decision.description")}</p>
          <p className="text-xs text-slate-600">{t("decision.help")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-xs">
            {busy
              ? t("decision.busy", {
                  checked: String(progress.checked),
                  total: String(progress.total),
                  work: String(progress.work),
                })
              : message}
          </p>
          {busy && <DTAction onClick={cancel}>{t("decision.cancel")}</DTAction>}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className={actions}>
              <DTAction
                onClick={() =>
                  safe(() => {
                    publish(emptyDtProject());
                    setContextText('{"amount":0}');
                  })
                }
              >
                {t("decision.new")}
              </DTAction>
              <DTAction
                onClick={() =>
                  safe(() => {
                    publish(demoDtProject());
                    setDecisionId("shipping");
                    setRuleId("");
                    setContextText(
                      '{"region":"EU","subtotal":50,"member":false,"express":false}',
                    );
                  })
                }
              >
                {t("decision.demo")}
              </DTAction>
              <DTAction
                onClick={() =>
                  safe(() => save(serialized, "decision-project.json"))
                }
              >
                {t("decision.export")}
              </DTAction>
              <label className="text-xs font-semibold">
                {t("decision.restore")}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="mt-1 block max-w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readFile(file, true);
                  }}
                />
              </label>
              <DTAction
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
                {t("decision.undo")}
              </DTAction>
              <DTAction
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
                {t("decision.redo")}
              </DTAction>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("decision.source")}
              </summary>
              <div className="mt-3 space-y-2">
                <DTField
                  label={t("decision.source")}
                  value={draft ?? serialized}
                  onChange={setDraft}
                  multiline
                />
                <div className={actions}>
                  <DTAction
                    onClick={() =>
                      safe(
                        () => publish(parseDtProject(draft ?? serialized)),
                        true,
                      )
                    }
                  >
                    {t("decision.apply")}
                  </DTAction>
                  <DTAction
                    onClick={() => {
                      setDraft(null);
                      setError("");
                    }}
                  >
                    {t("decision.discard")}
                  </DTAction>
                </div>
              </div>
            </details>
            <section className={section} aria-label={t("decision.inputs")}>
              <h3 className="font-bold">{t("decision.inputs")}</h3>
              <p className="text-xs text-slate-600">
                {t("decision.inputHelp")}
              </p>
              <ul className="text-xs">
                {project.inputs.map((input) => (
                  <li key={input.id}>
                    {input.id}: {input.name} · {input.type} · cost: {input.cost}{" "}
                    · catalog: {input.catalog.length}
                  </li>
                ))}
              </ul>
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("decision.inputJson")}
                </summary>
                <DTJsonEdit
                  key={`inputs-${revision}`}
                  label={t("decision.inputJson")}
                  value={project.inputs}
                  applyLabel={t("decision.applyInputs")}
                  apply={(text) =>
                    safe(() =>
                      publish({ ...project, inputs: parseDtJson(text) }),
                    )
                  }
                />
              </details>
              <div className="grid gap-3 md:grid-cols-2">
                <DTSelect
                  label={t("decision.inputType")}
                  value={inputType}
                  onChange={(v) => setInputType(v as DTInput["type"])}
                >
                  {["number", "string", "boolean"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </DTSelect>
                <DTField
                  label={t("decision.inputName")}
                  value={inputName}
                  onChange={setInputName}
                />
              </div>
              <DTAction
                disabled={project.inputs.length >= 8}
                onClick={() =>
                  safe(() =>
                    publish({
                      ...project,
                      inputs: [
                        ...project.inputs,
                        {
                          id: dtFreshId("input", project.inputs),
                          name: inputName,
                          type: inputType,
                          required: true,
                          nullable: false,
                          cost: 1,
                          catalog: (inputType === "number"
                            ? [0, 100]
                            : inputType === "string"
                              ? ["A", "B"]
                              : [false, true]
                          ).map((value) => ({ present: true, value })),
                        },
                      ],
                    }),
                  )
                }
              >
                {t("decision.addInput")}
              </DTAction>
            </section>
            <section className={section} aria-label={t("decision.tables")}>
              <h3 className="font-bold">{t("decision.tables")}</h3>
              <DTSelect
                label={t("decision.table")}
                value={decision?.id ?? ""}
                onChange={selectDecision}
              >
                {project.decisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.id})
                  </option>
                ))}
              </DTSelect>
              <div className={actions}>
                <DTAction
                  disabled={project.decisions.length >= 12}
                  onClick={() => safe(() => addDecision())}
                >
                  {t("decision.newTable")}
                </DTAction>
                <DTAction
                  disabled={!decision || project.decisions.length >= 12}
                  onClick={() => safe(() => addDecision(true))}
                >
                  {t("decision.cloneTable")}
                </DTAction>
                <DTAction
                  disabled={!decision}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        decisions: project.decisions.filter(
                          (d) => d.id !== decision?.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("decision.deleteTable")}
                </DTAction>
              </div>
              {decision && (
                <>
                  <p className="text-xs text-slate-600">
                    {t("decision.policyHelp")}
                  </p>
                  <DTSelect
                    label={t("decision.policy")}
                    value={decision.policy}
                    onChange={(policy) =>
                      safe(() => updateDecision({ ...decision, policy }))
                    }
                  >
                    {(["unique", "first", "all", "sum"] as const).map(
                      (policy) => (
                        <option key={policy} value={policy}>
                          {t(`decision.${policy}`)}
                        </option>
                      ),
                    )}
                  </DTSelect>
                  <DecisionGraph
                    project={project}
                    rootId={decision.id}
                    select={selectDecision}
                  />
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("decision.tableJson")}
                    </summary>
                    <DTJsonEdit
                      key={`definition-${decision.id}-${revision}`}
                      label={t("decision.tableJson")}
                      value={decision}
                      applyLabel={t("decision.applyTable")}
                      apply={(text) =>
                        safe(() => updateDecision(parseDtJson(text)))
                      }
                    />
                  </details>
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("decision.columns")}
                    </summary>
                    <ul className="space-y-2 py-2 text-xs">
                      {decision.columns.map((column, index) => (
                        <li key={column.id}>
                          {column.id}: {column.source.kind}:{column.source.id}{" "}
                          <DTAction
                            onClick={() =>
                              safe(() =>
                                updateDecision({
                                  ...decision,
                                  columns: decision.columns.filter(
                                    (_, i) => i !== index,
                                  ),
                                  rules: decision.rules.map((row) => ({
                                    ...row,
                                    when: row.when.filter(
                                      (_, i) => i !== index,
                                    ),
                                  })),
                                }),
                              )
                            }
                          >
                            {t("decision.deleteColumn", { id: column.id })}
                          </DTAction>
                        </li>
                      ))}
                    </ul>
                    <DTColumnBuilder
                      key={`column-${decision.id}-${revision}`}
                      project={project}
                      append={(make) =>
                        safe(() => {
                          const value = make() as {
                            name: string;
                            source: unknown;
                          };
                          updateDecision({
                            ...decision,
                            columns: [
                              ...decision.columns,
                              {
                                id: dtFreshId("column", decision.columns),
                                ...value,
                              },
                            ],
                            rules: decision.rules.map((row) => ({
                              ...row,
                              when: [...row.when, { op: "any" }],
                            })),
                          });
                        })
                      }
                    />
                  </details>
                  <h4 className="text-sm font-bold">{t("decision.rows")}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          <th>ID</th>
                          {decision.columns.map((c) => (
                            <th className="p-2" key={c.id}>
                              {c.name}
                            </th>
                          ))}
                          <th>{t("decision.output")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {decision.rules.map((row) => (
                          <tr
                            key={row.id}
                            className="border-t border-slate-200"
                          >
                            <td className="p-2">
                              <button
                                type="button"
                                className="font-bold text-violet-700 underline"
                                aria-label={t("decision.inspectRule", {
                                  id: row.id,
                                })}
                                aria-pressed={row === rule}
                                onClick={() => setRuleId(row.id)}
                              >
                                {row.id}
                              </button>
                            </td>
                            {row.when.map((condition, index) => (
                              <td
                                className="max-w-48 break-all p-2 font-mono"
                                key={index}
                              >
                                {JSON.stringify(condition)}
                              </td>
                            ))}
                            <td className="max-w-64 break-all p-2 font-mono">
                              {JSON.stringify(row.output).slice(0, 180)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rule && (
                    <>
                      <div className={actions}>
                        <DTAction
                          disabled={decision.rules.indexOf(rule) === 0}
                          onClick={() => safe(() => moveRule(-1))}
                        >
                          {t("decision.up")}
                        </DTAction>
                        <DTAction
                          disabled={
                            decision.rules.indexOf(rule) ===
                            decision.rules.length - 1
                          }
                          onClick={() => safe(() => moveRule(1))}
                        >
                          {t("decision.down")}
                        </DTAction>
                        <DTAction
                          onClick={() =>
                            safe(() =>
                              updateDecision({
                                ...decision,
                                rules: decision.rules.filter(
                                  (r) => r.id !== rule.id,
                                ),
                              }),
                            )
                          }
                        >
                          {t("decision.deleteRule")}
                        </DTAction>
                      </div>
                      <details>
                        <summary className="cursor-pointer text-xs font-bold">
                          {t("decision.ruleJson")}
                        </summary>
                        <DTJsonEdit
                          key={`rule-${decision.id}-${rule.id}-${revision}`}
                          label={t("decision.ruleJson")}
                          value={rule}
                          applyLabel={t("decision.applyRule")}
                          apply={(text) =>
                            safe(() =>
                              updateDecision({
                                ...decision,
                                rules: decision.rules.map((r) =>
                                  r.id === rule.id ? parseDtJson(text) : r,
                                ),
                              }),
                            )
                          }
                        />
                      </details>
                    </>
                  )}
                  <DTRuleBuilder
                    key={`builder-${decision.id}-${revision}`}
                    decision={decision}
                    append={(make) =>
                      safe(() => {
                        const value = make() as { id: string };
                        updateDecision({
                          ...decision,
                          rules: [...decision.rules, value],
                        });
                        setRuleId(value.id);
                      })
                    }
                  />
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("decision.fallback")}
                    </summary>
                    <DTJsonEdit
                      key={`fallback-${decision.id}-${revision}`}
                      label={t("decision.fallback")}
                      value={decision.fallback}
                      applyLabel={t("decision.applyFallback")}
                      apply={(text) =>
                        safe(() =>
                          updateDecision({
                            ...decision,
                            fallback: parseDtJson(text),
                          }),
                        )
                      }
                    />
                  </details>
                </>
              )}
              <DTField
                label={t("decision.context")}
                value={contextText}
                onChange={setContextText}
                multiline
              />
              <DTAction
                disabled={!decision}
                onClick={() =>
                  void start(async () => {
                    if (!decision) throw new DecisionError("reference");
                    const value = context(),
                      evaluation = evaluateDecision(
                        project,
                        decision.id,
                        value,
                      );
                    return () => {
                      setCaptured({ context: value, evaluation });
                      setMessage(
                        t("decision.summary", {
                          id: decision.id,
                          status: t(dtStatusKey(evaluation.result.status)),
                          work: String(evaluation.work),
                        }),
                      );
                    };
                  })
                }
              >
                {t("decision.run")}
              </DTAction>
            </section>
            {captured && (
              <section
                className={section}
                aria-label={t("decision.explanation")}
              >
                <h3 className="font-bold">
                  {t("decision.explanation")}: {captured.evaluation.rootId}
                </h3>
                <DecisionExplanation
                  key={`${captured.evaluation.rootId}-${captured.evaluation.work}-${JSON.stringify(captured.context)}`}
                  evaluation={captured.evaluation}
                />
                <label className="block text-xs">
                  <input
                    type="checkbox"
                    checked={exact}
                    onChange={(e) => setExact(e.target.checked)}
                  />{" "}
                  {t("decision.exact")}
                </label>
                <div className={actions}>
                  <DTAction
                    disabled={project.cases.length >= 24}
                    onClick={() => safe(() => addCase(true))}
                  >
                    {t("decision.record")}
                  </DTAction>
                  <DTAction
                    onClick={() =>
                      safe(() =>
                        save(
                          decisionReport([
                            {
                              caseId: "interactive",
                              decisionId: captured.evaluation.rootId,
                              checked: false,
                              passed: false,
                              checks: [],
                              evaluation: captured.evaluation,
                              error: null,
                            },
                          ]),
                          "decision-evaluation-report.json",
                        ),
                      )
                    }
                  >
                    {t("decision.singleReport")}
                  </DTAction>
                </div>
              </section>
            )}
            <section className={section} aria-label={t("decision.coverage")}>
              <h3 className="font-bold">{t("decision.coverage")}</h3>
              <p className="text-xs text-slate-600">
                {t("decision.coverageHelp")}
              </p>
              <DTAction
                disabled={!decision}
                onClick={() =>
                  void start(async (options) => {
                    if (!decision) throw new DecisionError("reference");
                    const result = await analyzeDecisionCatalog(
                      project,
                      decision.id,
                      options,
                    );
                    return () => {
                      setCoverage(result);
                      setMessage(
                        t("decision.coverageSummary", {
                          checked: String(result.checked),
                          total: String(result.total),
                          overlaps: String(result.overlaps),
                        }),
                      );
                    };
                  })
                }
              >
                {t("decision.analyze")}
              </DTAction>
              {coverage && (
                <>
                  <p className="text-xs font-bold">
                    {t(
                      coverage.complete
                        ? "decision.complete"
                        : "decision.partial",
                    )}
                    {coverage.reason ? ` · ${coverage.reason}` : ""}
                  </p>
                  <p className="text-xs">
                    {t("decision.coverageSummary", {
                      checked: String(coverage.checked),
                      total: String(coverage.total),
                      overlaps: String(coverage.overlaps),
                    })}
                  </p>
                  <ul className="text-xs">
                    {statuses.map((status) => (
                      <li key={status}>
                        {t(dtStatusKey(status))}: {coverage.counts[status]}
                      </li>
                    ))}
                  </ul>
                  <h4 className="text-xs font-bold">
                    {t("decision.ruleCoverage")}
                  </h4>
                  <pre className="max-h-64 overflow-auto text-xs">
                    {dtPretty(coverage.rules)}
                  </pre>
                  <div className={actions}>
                    {coverage.samples.map((sample) => (
                      <DTAction
                        key={sample.index}
                        onClick={() => setContextText(dtPretty(sample.context))}
                      >
                        {t("decision.loadSample", {
                          index: String(sample.index),
                        })}
                      </DTAction>
                    ))}
                  </div>
                  <DTAction
                    onClick={() =>
                      safe(() =>
                        save(
                          JSON.stringify(
                            {
                              kind: "rsswag-decision-coverage",
                              version: 1,
                              decisionId: coverage.decisionId,
                              checked: coverage.checked,
                              total: coverage.total,
                              complete: coverage.complete,
                              reason: coverage.reason,
                              work: coverage.work,
                              counts: coverage.counts,
                              overlaps: coverage.overlaps,
                              rules: coverage.rules,
                            },
                            null,
                            2,
                          ),
                          "decision-coverage-report.json",
                        ),
                      )
                    }
                  >
                    {t("decision.coverageReport")}
                  </DTAction>
                </>
              )}
            </section>
            <section className={section} aria-label={t("decision.counter")}>
              <h3 className="font-bold">{t("decision.counter")}</h3>
              <p className="text-xs text-slate-600">
                {t("decision.counterHelp")}
              </p>
              <DTSelect
                label={t("decision.targetStatus")}
                value={targetStatus}
                onChange={(v) => setTargetStatus(v as DTStatus)}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {t(dtStatusKey(status))}
                  </option>
                ))}
              </DTSelect>
              <DTField
                label={t("decision.targetOutput")}
                value={targetOutput}
                onChange={setTargetOutput}
              />
              <DTField
                label={t("decision.mutable")}
                value={mutable}
                onChange={setMutable}
              />
              <DTAction
                disabled={!decision}
                onClick={() =>
                  void start(async (options) => {
                    if (!decision) throw new DecisionError("reference");
                    const target = {
                        status: targetStatus,
                        ...(targetOutput.trim()
                          ? { output: parseDtJson(targetOutput) }
                          : {}),
                      },
                      ids = mutable.trim()
                        ? mutable.split(",").map((id) => id.trim())
                        : undefined;
                    const result = await findDecisionCounterfactual(
                      project,
                      decision.id,
                      context(),
                      target as Parameters<
                        typeof findDecisionCounterfactual
                      >[3],
                      ids,
                      options,
                    );
                    return () => {
                      setCounter(result);
                      setMessage(
                        t("decision.counterSummary", {
                          checked: String(result.enumerated),
                          total: String(result.total),
                          evaluated: String(result.evaluated),
                          work: String(result.work),
                        }),
                      );
                    };
                  })
                }
              >
                {t("decision.search")}
              </DTAction>
              {counter && (
                <>
                  <p className="text-xs">
                    {t("decision.counterSummary", {
                      checked: String(counter.enumerated),
                      total: String(counter.total),
                      evaluated: String(counter.evaluated),
                      work: String(counter.work),
                    })}
                  </p>
                  <p className="text-xs font-bold">
                    {t(
                      counter.complete
                        ? "decision.complete"
                        : "decision.partial",
                    )}
                    {counter.reason ? ` · ${counter.reason}` : ""}
                  </p>
                  {counter.best ? (
                    <>
                      <p className="text-xs font-bold">
                        {t(
                          counter.optimal
                            ? "decision.optimal"
                            : "decision.bestSoFar",
                        )}{" "}
                        · {t("decision.cost")}: {counter.best.cost}
                      </p>
                      <p className="text-xs">{t("decision.changes")}</p>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
                        {dtPretty(counter.best.changes)}
                      </pre>
                      <DTAction
                        onClick={() =>
                          setContextText(dtPretty(counter.best!.context))
                        }
                      >
                        {t("decision.adopt")}
                      </DTAction>
                    </>
                  ) : (
                    <p className="text-xs">{t("decision.noCandidate")}</p>
                  )}
                  <DTAction
                    onClick={() =>
                      safe(() =>
                        save(
                          JSON.stringify(
                            {
                              kind: "rsswag-decision-counterfactual",
                              version: 1,
                              decisionId: counter.decisionId,
                              enumerated: counter.enumerated,
                              evaluated: counter.evaluated,
                              total: counter.total,
                              complete: counter.complete,
                              optimal: counter.optimal,
                              reason: counter.reason,
                              work: counter.work,
                              best: counter.best
                                ? {
                                    cost: counter.best.cost,
                                    changedInputs: counter.best.changes.map(
                                      (change) => change.id,
                                    ),
                                    status:
                                      counter.best.evaluation.result.status,
                                  }
                                : null,
                            },
                            null,
                            2,
                          ),
                          "decision-counterfactual-report.json",
                        ),
                      )
                    }
                  >
                    {t("decision.counterReport")}
                  </DTAction>
                </>
              )}
            </section>
            <section className={section} aria-label={t("decision.cases")}>
              <h3 className="font-bold">{t("decision.cases")}</h3>
              <DTSelect
                label={t("decision.case")}
                value={scenario?.id ?? ""}
                onChange={setCaseId}
              >
                {project.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </DTSelect>
              <div className={actions}>
                <DTAction
                  disabled={!decision || project.cases.length >= 24}
                  onClick={() => safe(() => addCase())}
                >
                  {t("decision.newCase")}
                </DTAction>
                <DTAction
                  disabled={!scenario}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        cases: project.cases.filter(
                          (c) => c.id !== scenario?.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("decision.deleteCase")}
                </DTAction>
                <DTAction
                  disabled={!scenario}
                  onClick={() => {
                    if (scenario) {
                      selectDecision(scenario.decisionId);
                      setContextText(dtPretty(scenario.context));
                    }
                  }}
                >
                  {t("decision.loadCase")}
                </DTAction>
              </div>
              {scenario && (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("decision.caseJson")}
                  </summary>
                  <DTJsonEdit
                    key={`case-${scenario.id}-${revision}`}
                    label={t("decision.caseJson")}
                    value={scenario}
                    applyLabel={t("decision.applyCase")}
                    apply={(text) =>
                      safe(() =>
                        publish({
                          ...project,
                          cases: project.cases.map((c) =>
                            c.id === scenario.id ? parseDtJson(text) : c,
                          ),
                        }),
                      )
                    }
                  />
                </details>
              )}
              <DTAction
                onClick={() =>
                  void start(async (options) => {
                    const completed = await runDecisionSuite(project, options);
                    return () => {
                      setRuns(completed);
                      setMessage(
                        t("decision.suite", {
                          passed: String(
                            completed.filter((run) => run.passed).length,
                          ),
                          total: String(completed.length),
                        }),
                      );
                    };
                  })
                }
              >
                {t("decision.runAll")}
              </DTAction>
              {runs && (
                <>
                  <ul className="space-y-1 text-xs">
                    {runs.map((run) => (
                      <li key={run.caseId}>
                        {run.caseId}:{" "}
                        {t(
                          !run.checked
                            ? "decision.unchecked"
                            : run.passed
                              ? "decision.passed"
                              : "decision.failed",
                        )}{" "}
                        ·{" "}
                        {run.evaluation
                          ? t(dtStatusKey(run.evaluation.result.status))
                          : run.error}
                      </li>
                    ))}
                  </ul>
                  <DTAction
                    onClick={() =>
                      safe(() =>
                        save(decisionReport(runs), "decision-regressions.json"),
                      )
                    }
                  >
                    {t("decision.report")}
                  </DTAction>
                </>
              )}
              <DTField
                label={t("decision.importText")}
                value={importText}
                onChange={setImportText}
                multiline
              />
              <label className="block text-xs font-semibold">
                {t("decision.importFile")}
                <input
                  type="file"
                  accept=".json,.ndjson,.jsonl"
                  className="mt-1 block max-w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readFile(file, false);
                  }}
                />
              </label>
              <DTAction
                disabled={!decision}
                onClick={() =>
                  safe(() => {
                    if (decision)
                      publish(
                        importDecisionContexts(
                          project,
                          decision.id,
                          importText,
                        ),
                      );
                  })
                }
              >
                {t("decision.importContexts")}
              </DTAction>
            </section>
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                {t("decision.exportHelp")}
              </p>
              <div className={actions}>
                <DTAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateDecisionSdk(),
                        "decision-sdk.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("decision.sdk")}
                </DTAction>
                <DTAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateDecisionService(project),
                        "decision-handler.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("decision.service")}
                </DTAction>
                <DTAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateDecisionContract(project),
                        "decision-openapi.json",
                      ),
                    )
                  }
                >
                  {t("decision.contract")}
                </DTAction>
                <DTAction
                  onClick={() =>
                    safe(() =>
                      save(
                        generateDecisionRunner(project),
                        "decision-tests.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("decision.runner")}
                </DTAction>
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </details>
  );
});
