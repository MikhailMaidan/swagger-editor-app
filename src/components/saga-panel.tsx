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
import { SagaGraph, SagaTimeline } from "./saga-graph";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import {
  MAX_SAGA_PROJECT,
  SagaError,
  emptySagaProject,
  newSagaStep,
  newSagaScenario,
  normalizeSagaProject,
  normalizeSagaDefinition,
  parseSagaProject,
  parseSagaJson,
  serializeSagaProject,
  sagaJson,
  type SagaProject,
  type SagaStep,
  type SagaCommand,
} from "@/lib/saga-model";
import { createSaga } from "@/lib/saga-engine";
import {
  demoSagaProject,
  replaySaga,
  runSagaScenarios,
  sagaReport,
  sagaCsv,
  alignSagaScenario,
  recordSagaScenario,
  type SagaRun,
} from "@/lib/saga-studio";
import { generateSagaToolkit, generateSagaRunner } from "@/lib/saga-export";
import type { TranslationKey } from "@/lib/translations";

const pretty = (v: unknown) => {
  const text = JSON.stringify(v, null, 2);
  return getByteSize(text) <= MAX_SAGA_PROJECT ? text : JSON.stringify(v);
};
const integer = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
function Action({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-violet-600 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const props = {
    className: inputClass,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea {...props} rows={7} spellCheck={false} />
      ) : (
        <input {...props} spellCheck={false} autoComplete="off" />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
function StepBuilder({
  step,
  onStage,
}: {
  step: SagaStep;
  onStage: (s: unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(step.name),
    [deps, setDeps] = useState(step.dependsOn.join(", ")),
    [effect, setEffect] = useState(step.effect),
    [operation, setOperation] = useState(step.forward.operation),
    [undo, setUndo] = useState(step.compensate?.operation ?? ""),
    [bindings, setBindings] = useState(pretty(step.forward.input)),
    [undoBindings, setUndoBindings] = useState(
      pretty(step.compensate?.input ?? {}),
    ),
    [timeout, setTimeoutValue] = useState(String(step.forward.timeoutMs)),
    [attempts, setAttempts] = useState(String(step.forward.attempts)),
    [backoff, setBackoff] = useState(String(step.forward.backoffMs));
  return (
    <details className="rounded-xl border border-[color:var(--color-brand-border)] p-3">
      <summary className="cursor-pointer text-sm font-bold">
        {t("saga.builder")}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs">{t("saga.builderHelp")}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("saga.stepName")} value={name} onChange={setName} />
          <Field
            label={t("saga.dependencies")}
            value={deps}
            onChange={setDeps}
          />
          <Select
            label={t("saga.effect")}
            value={effect}
            onChange={(v) => setEffect(v as "read" | "write")}
          >
            <option value="write">{t("saga.write")}</option>
            <option value="read">{t("saga.read")}</option>
          </Select>
          <Field
            label={t("saga.operation")}
            value={operation}
            onChange={setOperation}
          />
          <Field
            label={t("saga.undoOperation")}
            value={undo}
            onChange={setUndo}
          />
          <Field
            label={t("saga.timeout")}
            value={timeout}
            onChange={setTimeoutValue}
          />
          <Field
            label={t("saga.attempts")}
            value={attempts}
            onChange={setAttempts}
          />
          <Field
            label={t("saga.backoff")}
            value={backoff}
            onChange={setBackoff}
          />
          <Field
            label={t("saga.bindings")}
            value={bindings}
            onChange={setBindings}
            multiline
          />
          <Field
            label={t("saga.undoBindings")}
            value={undoBindings}
            onChange={setUndoBindings}
            multiline
          />
        </div>
        <Action
          label={t("saga.stage")}
          onClick={() =>
            onStage({
              ...step,
              name,
              dependsOn: deps
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              effect,
              forward: {
                operation,
                input: bindings,
                timeoutMs: integer(timeout),
                attempts: integer(attempts),
                backoffMs: integer(backoff),
              },
              compensate:
                effect === "read" || !undo.trim()
                  ? null
                  : {
                      ...(step.compensate ?? step.forward),
                      operation: undo,
                      input: undoBindings,
                    },
            })
          }
        />
      </div>
    </details>
  );
}
function playground(p: SagaProject, id: string) {
  const s =
      p.scenarios.find((s) => s.id === id) ?? newSagaScenario(p.definition),
    machine = createSaga(p.definition, s.input, s.fixtures);
  return { machine, snapshot: machine.snapshot() };
}
export const SagaPanel = memo(function SagaPanel() {
  const { t } = useI18n(),
    [open, setOpen] = useState(false),
    [project, setProject] = useState(emptySagaProject),
    [source, setSource] = useState(() =>
      serializeSagaProject(emptySagaProject()),
    ),
    [scenarioId, setScenarioId] = useState("case-1"),
    [stepId, setStepId] = useState("step-1"),
    [revision, setRevision] = useState(0),
    [runtime, setRuntime] = useState(() =>
      playground(emptySagaProject(), "case-1"),
    ),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [runs, setRuns] = useState<SagaRun[]>([]),
    [resultId, setResultId] = useState(""),
    [comparison, setComparison] = useState<{
      baseline: SagaRun[];
      candidate: SagaRun[];
    } | null>(null),
    [concurrency, setConcurrency] = useState("1"),
    [deadline, setDeadline] = useState("5000"),
    [to, setTo] = useState("100"),
    [phase, setPhase] = useState<"forward" | "compensation">("forward"),
    [output, setOutput] = useState('{"id":"confirmed"}'),
    [point, setPoint] = useState(0),
    [details, setDetails] = useState(false);
  const generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Normalizing + pretty-printing a project (up to MAX_SAGA_PROJECT) is not
  // cheap, and this panel re-renders on every keystroke in the JSON source
  // and on every run progress update; `project` only changes on publish.
  const serializedProject = useMemo(
    () => serializeSagaProject(project),
    [project],
  );
  const dirty = source !== serializedProject,
    locked = busy || dirty,
    snapshot = runtime.snapshot,
    summary = runtime.machine.summary(),
    active = ["running", "draining", "compensating"].includes(snapshot.status),
    step =
      project.definition.steps.find((s) => s.id === stepId) ??
      project.definition.steps[0],
    stepState = snapshot.steps.find((s) => s.id === step.id)!,
    selectedResult = runs.find((r) => r.scenarioId === resultId) ?? runs[0];
  const stateLabel = (s: string) => t(`saga.state.${s}` as TranslationKey);
  function failure(e: unknown) {
    setError(true);
    setMessage(
      t("saga.error", { code: e instanceof SagaError ? e.code : "command" }),
    );
  }
  function safe(action: () => void) {
    if (locked) return;
    setError(false);
    try {
      action();
    } catch (e) {
      failure(e);
    }
  }
  function publish(value: unknown, id = scenarioId, reset = true) {
    const p = normalizeSagaProject(value),
      selected = p.scenarios.some((s) => s.id === id)
        ? id
        : (p.scenarios[0]?.id ?? "");
    generation.current++;
    setBusy(false);
    setProject(p);
    setSource(serializeSagaProject(p));
    setScenarioId(selected);
    setStepId((id) =>
      p.definition.steps.some((s) => s.id === id)
        ? id
        : p.definition.steps[0].id,
    );
    setRevision((n) => n + 1);
    setRuns([]);
    setComparison(null);
    setPoint(0);
    if (reset) setRuntime(playground(p, selected));
  }
  function stageDefinition(steps: SagaStep[]) {
    const definition = normalizeSagaDefinition({
        ...project.definition,
        steps,
      }),
      p = normalizeSagaProject({
        ...project,
        definition,
        scenarios: project.scenarios.map((s) =>
          alignSagaScenario(s, definition),
        ),
      });
    setSource(serializeSagaProject(p));
    setMessage(t("saga.dirty"));
  }
  function stageStep(value: unknown) {
    safe(() => {
      const raw = value as SagaStep;
      const forward = {
          ...raw.forward,
          input: parseSagaJson(
            raw.forward.input as unknown as string,
            128 * 1024,
          ),
        },
        compensate = raw.compensate
          ? {
              ...raw.compensate,
              input: parseSagaJson(
                raw.compensate.input as unknown as string,
                128 * 1024,
              ),
            }
          : null;
      stageDefinition(
        project.definition.steps.map((s) =>
          s.id === raw.id ? ({ ...raw, forward, compensate } as SagaStep) : s,
        ),
      );
    });
  }
  function apply(command: SagaCommand | (() => SagaCommand)) {
    safe(() => {
      runtime.machine.apply(
        typeof command === "function" ? command() : command,
      );
      const snapshot = runtime.machine.snapshot();
      setRuntime({ machine: runtime.machine, snapshot });
      setPoint(snapshot.journal.length);
      setMessage(stateLabel(snapshot.status));
    });
  }
  function nextId(prefix: string, ids: string[]) {
    let n = 1;
    while (ids.includes(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
  function addCase(clone = false) {
    safe(() => {
      const id = nextId(
          "case",
          project.scenarios.map((s) => s.id),
        ),
        current = project.scenarios.find((s) => s.id === scenarioId),
        scenario =
          clone && current
            ? { ...current, id, name: id }
            : newSagaScenario(project.definition, id);
      publish({ ...project, scenarios: [...project.scenarios, scenario] }, id);
    });
  }
  async function run(mode: "all" | "selected" | "playground" | "compare") {
    if (locked || !project.scenarios.length) return;
    const token = ++generation.current,
      cancelled = () => !mounted.current || token !== generation.current;
    setBusy(true);
    setError(false);
    setProgress({
      done: 0,
      total:
        mode === "compare"
          ? project.scenarios.length * 2
          : mode === "all"
            ? project.scenarios.length
            : 1,
    });
    try {
      if (mode === "playground") {
        const s = project.scenarios.find((s) => s.id === scenarioId)!;
        const result = await replaySaga(project.definition, s, cancelled);
        if (!cancelled()) {
          setRuntime({ machine: result.machine, snapshot: result.snapshot });
          setPoint(result.snapshot.journal.length);
          setMessage(stateLabel(result.snapshot.status));
        }
      } else if (mode === "compare") {
        const candidate = normalizeSagaProject({
          ...project,
          definition: {
            ...project.definition,
            concurrency: integer(concurrency),
            deadlineMs: integer(deadline),
          },
        });
        const baseline = await runSagaScenarios(
          project,
          undefined,
          cancelled,
          (done) => {
            if (!cancelled())
              setProgress({ done, total: project.scenarios.length * 2 });
          },
        );
        const variants = await runSagaScenarios(
          candidate,
          undefined,
          cancelled,
          (done) => {
            if (!cancelled())
              setProgress({
                done: project.scenarios.length + done,
                total: project.scenarios.length * 2,
              });
          },
        );
        if (!cancelled()) {
          setComparison({ baseline, candidate: variants });
          setMessage(t("saga.comparison"));
        }
      } else {
        const result = await runSagaScenarios(
          project,
          mode === "selected" ? scenarioId : undefined,
          cancelled,
          (done, total) => {
            if (!cancelled()) setProgress({ done, total });
          },
        );
        if (!cancelled()) {
          setRuns(result);
          setResultId(result[0]?.scenarioId ?? "");
          setMessage(
            t("saga.finished", {
              passed: String(result.filter((r) => r.passed).length),
              total: String(result.length),
            }),
          );
        }
      }
    } catch (e) {
      if (!cancelled()) failure(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  function cancel() {
    generation.current++;
    setBusy(false);
    setError(false);
    setMessage(t("saga.cancelled"));
  }
  async function restore(file?: File) {
    if (!file || locked) return;
    const token = ++generation.current;
    setBusy(true);
    setError(false);
    try {
      if (file.size > MAX_SAGA_PROJECT) throw new SagaError("limit");
      const p = parseSagaProject(await file.text());
      if (mounted.current && token === generation.current) {
        publish(p, p.scenarios[0]?.id ?? "");
        setMessage(t("saga.loaded"));
      }
    } catch (e) {
      if (mounted.current && token === generation.current) failure(e);
    } finally {
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  function download(text: string, file: string, mime = "application/json") {
    if (getByteSize(text) > 16 * 1024 * 1024) throw new SagaError("limit");
    const ok = downloadTextFile(text, file, mime);
    setError(!ok);
    setMessage(t(ok ? "saga.downloaded" : "saga.downloadFailed"));
  }
  function record() {
    safe(() => {
      const id = nextId(
          "recorded",
          project.scenarios.map((s) => s.id),
        ),
        scenario = recordSagaScenario(
          id,
          id,
          runtime.machine.source(),
          snapshot,
          project.definition,
        );
      publish(
        { ...project, scenarios: [...project.scenarios, scenario] },
        id,
        false,
      );
    });
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-panel)] p-4"
    >
      <summary className="cursor-pointer text-base font-bold">
        {t("saga.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("saga.description")}</p>
          <p className="text-xs">{t("saga.help")}</p>
          {message && (
            <p
              role={error ? "alert" : "status"}
              className="rounded-lg border border-[color:var(--color-brand-border)] bg-white p-3 text-sm"
            >
              {message}
            </p>
          )}
          {dirty && (
            <p className="text-xs font-bold text-amber-800">
              {t("saga.dirty")}
            </p>
          )}
          {busy && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                {t("saga.busy", {
                  done: String(progress.done),
                  total: String(progress.total),
                })}
              </p>
              <Action label={t("saga.cancel")} onClick={cancel} />
            </div>
          )}
          <fieldset
            disabled={busy}
            className="min-w-0 space-y-5 disabled:opacity-60"
          >
            <div className="flex flex-wrap gap-2">
              <Action
                label={t("saga.new")}
                disabled={locked}
                onClick={() =>
                  safe(() => {
                    publish(emptySagaProject(), "case-1");
                    setMessage(t("saga.loaded"));
                  })
                }
              />
              <Action
                label={t("saga.demo")}
                disabled={locked}
                onClick={() =>
                  safe(() => {
                    publish(demoSagaProject(), "happy");
                    setMessage(t("saga.loaded"));
                  })
                }
              />
              <label className="text-xs font-bold">
                {t("saga.import")}
                <input
                  aria-label={t("saga.import")}
                  type="file"
                  accept=".json,application/json"
                  disabled={locked}
                  className="mt-1 block max-w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void restore(file);
                  }}
                />
              </label>
              <Action
                label={t("saga.export")}
                disabled={locked}
                onClick={() =>
                  safe(() =>
                    download(
                      serializeSagaProject(project),
                      "saga-project.json",
                    ),
                  )
                }
              />
            </div>
            <details className="rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <summary className="cursor-pointer text-sm font-bold">
                {t("saga.source")}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs">{t("saga.sourceHelp")}</p>
                <Field
                  label={t("saga.source")}
                  value={source}
                  onChange={setSource}
                  multiline
                />
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("saga.save")}
                    disabled={!dirty}
                    onClick={() => {
                      try {
                        publish(parseSagaProject(source));
                        setError(false);
                        setMessage(t("saga.saved"));
                      } catch (e) {
                        failure(e);
                      }
                    }}
                  />
                  <Action
                    label={t("saga.discard")}
                    disabled={!dirty}
                    onClick={() => {
                      setSource(serializeSagaProject(project));
                      setError(false);
                      setMessage("");
                    }}
                  />
                </div>
              </div>
            </details>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label={t("saga.case")}
                value={scenarioId}
                onChange={(id) =>
                  safe(() => {
                    setScenarioId(id);
                    setRuntime(playground(project, id));
                    setPoint(0);
                  })
                }
              >
                {project.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select
                label={t("saga.step")}
                value={step.id}
                onChange={setStepId}
              >
                {project.definition.steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}: {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Action
                label={t("saga.newCase")}
                disabled={locked || project.scenarios.length >= 12}
                onClick={() => addCase()}
              />
              <Action
                label={t("saga.cloneCase")}
                disabled={
                  locked || !scenarioId || project.scenarios.length >= 12
                }
                onClick={() => addCase(true)}
              />
              <Action
                label={t("saga.deleteCase")}
                disabled={locked || !scenarioId}
                onClick={() =>
                  safe(() =>
                    publish({
                      ...project,
                      scenarios: project.scenarios.filter(
                        (s) => s.id !== scenarioId,
                      ),
                    }),
                  )
                }
              />
              <Action
                label={t("saga.addStep")}
                disabled={locked || project.definition.steps.length >= 20}
                onClick={() =>
                  safe(() =>
                    stageDefinition([
                      ...project.definition.steps,
                      newSagaStep(
                        nextId(
                          "step",
                          project.definition.steps.map((s) => s.id),
                        ),
                      ),
                    ]),
                  )
                }
              />
              <Action
                label={t("saga.removeStep")}
                disabled={locked || project.definition.steps.length <= 1}
                onClick={() =>
                  safe(() =>
                    stageDefinition(
                      project.definition.steps.filter((s) => s.id !== step.id),
                    ),
                  )
                }
              />
            </div>
            <p className="text-xs">{t("saga.caseHelp")}</p>
            <fieldset disabled={locked} className="min-w-0">
              <StepBuilder
                key={`${step.id}-${revision}`}
                step={step}
                onStage={stageStep}
              />
            </fieldset>
            <SagaGraph
              definition={project.definition}
              snapshot={snapshot}
              selected={step.id}
              onSelect={setStepId}
            />
            <section className="space-y-3" aria-label={t("saga.playground")}>
              <h3 className="text-sm font-bold">{t("saga.playground")}</h3>
              <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                {[
                  [t("saga.status"), stateLabel(summary.status)],
                  [t("saga.clock"), summary.clock],
                  [t("saga.uncertain"), summary.uncertain],
                  [t("saga.uncompensated"), summary.uncompensated],
                  [t("saga.retries"), summary.metrics.retries],
                  [
                    t("saga.calls"),
                    `${summary.metrics.forwardAttempts} / ${summary.metrics.compensationAttempts}`,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white p-3">
                    <dt>{label}</dt>
                    <dd className="mt-1 font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                <Action
                  label={t("saga.reset")}
                  disabled={locked}
                  onClick={() =>
                    safe(() => {
                      setRuntime(playground(project, scenarioId));
                      setPoint(0);
                      setMessage("");
                    })
                  }
                />
                <Action
                  label={t("saga.loadCase")}
                  disabled={locked || !scenarioId}
                  onClick={() => void run("playground")}
                />
                <Action
                  label={t("saga.start")}
                  disabled={locked || snapshot.status !== "ready"}
                  onClick={() => apply({ type: "start" })}
                />
                <Action
                  label={t("saga.next")}
                  disabled={locked || (!active && snapshot.status !== "ready")}
                  onClick={() => apply({ type: "next" })}
                />
                <Action
                  label={t("saga.run")}
                  disabled={locked || (!active && snapshot.status !== "ready")}
                  onClick={() => apply({ type: "run" })}
                />
                <Action
                  label={t("saga.abort")}
                  disabled={locked || snapshot.status !== "running"}
                  onClick={() => apply({ type: "abort" })}
                />
                <Action
                  label={t("saga.record")}
                  disabled={
                    locked ||
                    project.scenarios.length >= 12 ||
                    snapshot.commands === 0
                  }
                  onClick={record}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label={t("saga.to")} value={to} onChange={setTo} />
                <Action
                  label={t("saga.advance")}
                  disabled={locked || !active}
                  onClick={() => apply({ type: "advance", to: integer(to) })}
                />
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      {[
                        t("saga.step"),
                        t("saga.forward"),
                        t("saga.compensation"),
                        t("saga.count"),
                        t("saga.reason"),
                      ].map((s) => (
                        <th key={s} className="p-2">
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.steps.map((s) => (
                      <tr
                        key={s.id}
                        className="border-t border-[color:var(--color-brand-border)]"
                      >
                        <td className="p-2">{s.id}</td>
                        <td className="p-2">{stateLabel(s.forward)}</td>
                        <td className="p-2">{stateLabel(s.compensation)}</td>
                        <td className="p-2">
                          {s.attempts} / {s.compensationCalls}
                        </td>
                        <td className="p-2">{s.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("saga.stepDetails")}
                </summary>
                <pre
                  aria-label={t("saga.stepDetails")}
                  className="mt-2 max-h-80 overflow-auto rounded-lg bg-white p-3 text-xs"
                >
                  {pretty({ definition: step, state: stepState })}
                </pre>
              </details>
            </section>
            <section className="space-y-3" aria-label={t("saga.recovery")}>
              <h3 className="text-sm font-bold">{t("saga.recovery")}</h3>
              <p className="text-xs">{t("saga.recoveryHelp")}</p>
              <Select
                label={t("saga.phase")}
                value={phase}
                onChange={(v) => setPhase(v as "forward" | "compensation")}
              >
                <option value="forward">{t("saga.forward")}</option>
                <option value="compensation">{t("saga.compensation")}</option>
              </Select>
              <Field
                label={t("saga.confirmedOutput")}
                value={output}
                onChange={setOutput}
                multiline
              />
              <div className="flex flex-wrap gap-2">
                <Action
                  label={t("saga.committed")}
                  disabled={
                    locked ||
                    snapshot.status !== "blocked" ||
                    stepState[phase] !== "unknown"
                  }
                  onClick={() =>
                    apply(() => ({
                      type: "reconcile",
                      stepId: step.id,
                      phase,
                      outcome: "committed",
                      output:
                        phase === "forward"
                          ? sagaJson(parseSagaJson(output, 4096))
                          : null,
                    }))
                  }
                />
                <Action
                  label={t("saga.aborted")}
                  disabled={
                    locked ||
                    snapshot.status !== "blocked" ||
                    stepState[phase] !== "unknown"
                  }
                  onClick={() =>
                    apply({
                      type: "reconcile",
                      stepId: step.id,
                      phase,
                      outcome: "aborted",
                      output: null,
                    })
                  }
                />
                <Action
                  label={t("saga.retryUndo")}
                  disabled={
                    locked ||
                    snapshot.status !== "attention" ||
                    stepState.compensation !== "failed" ||
                    stepState.recoveryCycles >= 3
                  }
                  onClick={() =>
                    apply({ type: "retry-compensation", stepId: step.id })
                  }
                />
              </div>
            </section>
            <SagaTimeline snapshot={snapshot} />
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("saga.journal")}
              </summary>
              {snapshot.journal.length ? (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-bold">
                    {t("saga.point")}
                    <input
                      type="range"
                      aria-label={t("saga.point")}
                      min={1}
                      max={snapshot.journal.length}
                      value={Math.max(1, point)}
                      onChange={(e) => setPoint(Number(e.target.value))}
                      className="mt-2 w-full"
                    />
                  </label>
                  <pre
                    aria-label={t("saga.pointDetails")}
                    className="overflow-auto bg-white p-3 text-xs"
                  >
                    {pretty(snapshot.journal[Math.max(0, point - 1)])}
                  </pre>
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          {[
                            t("saga.seq"),
                            t("saga.time"),
                            t("saga.step"),
                            t("saga.phase"),
                            t("saga.kind"),
                            t("saga.reason"),
                          ].map((s) => (
                            <th key={s} className="p-2">
                              {s}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.journal.map((j) => (
                          <tr
                            key={j.seq}
                            className="border-t border-[color:var(--color-brand-border)]"
                          >
                            <td className="p-2">
                              <button
                                type="button"
                                aria-pressed={point === j.seq}
                                onClick={() => setPoint(j.seq)}
                                className="underline"
                              >
                                {j.seq}
                              </button>
                            </td>
                            <td className="p-2">{j.at}</td>
                            <td className="p-2">
                              {j.stepId ?? t("saga.workflow")}
                            </td>
                            <td className="p-2">
                              {j.phase === "workflow"
                                ? t("saga.workflow")
                                : t(
                                    j.phase === "forward"
                                      ? "saga.forward"
                                      : "saga.compensation",
                                  )}
                            </td>
                            <td className="p-2">{j.kind}</td>
                            <td className="p-2">{j.reason ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs">{t("saga.empty")}</p>
              )}
            </details>
            <section className="space-y-3" aria-label={t("saga.results")}>
              <h3 className="text-sm font-bold">{t("saga.results")}</h3>
              <div className="flex flex-wrap gap-2">
                <Action
                  label={t("saga.runAll")}
                  disabled={locked || !project.scenarios.length}
                  onClick={() => void run("all")}
                />
                <Action
                  label={t("saga.runSelected")}
                  disabled={locked || !scenarioId}
                  onClick={() => void run("selected")}
                />
              </div>
              {!!runs.length && (
                <>
                  <div className="overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          {[
                            t("saga.case"),
                            t("saga.result"),
                            t("saga.status"),
                            t("saga.time"),
                            t("saga.uncertain"),
                            t("saga.uncompensated"),
                          ].map((s) => (
                            <th key={s} className="p-2">
                              {s}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr
                            key={r.scenarioId}
                            className="border-t border-[color:var(--color-brand-border)]"
                          >
                            <td className="p-2">{r.scenarioName}</td>
                            <td className="p-2">
                              {t(
                                !r.checked
                                  ? "saga.unchecked"
                                  : r.passed
                                    ? "saga.pass"
                                    : "saga.fail",
                              )}
                              {r.error ? ` (${r.error})` : ""}
                            </td>
                            <td className="p-2">
                              {stateLabel(r.summary.status)}
                            </td>
                            <td className="p-2">{r.summary.clock}</td>
                            <td className="p-2">{r.summary.uncertain}</td>
                            <td className="p-2">{r.summary.uncompensated}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Select
                    label={t("saga.result")}
                    value={selectedResult?.scenarioId ?? ""}
                    onChange={setResultId}
                  >
                    {runs.map((r) => (
                      <option key={r.scenarioId} value={r.scenarioId}>
                        {r.scenarioName}
                      </option>
                    ))}
                  </Select>
                  {selectedResult && (
                    <>
                      <pre
                        aria-label={t("saga.checks")}
                        className="max-h-60 overflow-auto rounded-lg bg-white p-3 text-xs"
                      >
                        {pretty(selectedResult.checks)}
                      </pre>
                      <details>
                        <summary className="cursor-pointer text-xs font-bold">
                          {t("saga.privateResult")}
                        </summary>
                        <pre
                          aria-label={t("saga.privateResult")}
                          className="mt-2 max-h-80 overflow-auto bg-white p-3 text-xs"
                        >
                          {pretty(selectedResult.snapshot)}
                        </pre>
                      </details>
                      <SagaTimeline snapshot={selectedResult.snapshot} />
                    </>
                  )}
                </>
              )}
            </section>
            <details className="rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <summary className="cursor-pointer text-sm font-bold">
                {t("saga.compare")}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs">{t("saga.compareHelp")}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label={t("saga.concurrency")}
                    value={concurrency}
                    onChange={setConcurrency}
                  />
                  <Field
                    label={t("saga.deadline")}
                    value={deadline}
                    onChange={setDeadline}
                  />
                </div>
                <Action
                  label={t("saga.compareRun")}
                  disabled={locked || !project.scenarios.length}
                  onClick={() => void run("compare")}
                />
                {comparison && (
                  <div className="overflow-auto">
                    <table
                      aria-label={t("saga.comparison")}
                      className="w-full text-left text-xs"
                    >
                      <thead>
                        <tr>
                          <th className="p-2">{t("saga.case")}</th>
                          <th className="p-2">{t("saga.baseline")}</th>
                          <th className="p-2">{t("saga.candidate")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.baseline.map((r, i) => {
                          const c = comparison.candidate[i];
                          return (
                            <tr key={r.scenarioId}>
                              <td className="p-2">{r.scenarioName}</td>
                              <td className="p-2">
                                {stateLabel(r.summary.status)} ·{" "}
                                {r.summary.clock} ms ·{" "}
                                {r.passed ? t("saga.pass") : t("saga.fail")}
                              </td>
                              <td className="p-2">
                                {stateLabel(c.summary.status)} ·{" "}
                                {c.summary.clock} ms ·{" "}
                                {c.passed ? t("saga.pass") : t("saga.fail")}
                                {c.error ? ` (${c.error})` : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
            <div className="space-y-3">
              <p className="text-xs">{t("saga.exportHelp")}</p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={details}
                  onChange={(e) => setDetails(e.target.checked)}
                />
                {t("saga.detailReport")}
              </label>
              <div className="flex flex-wrap gap-2">
                <Action
                  label={t("saga.report")}
                  disabled={locked || !runs.length}
                  onClick={() =>
                    safe(() =>
                      download(sagaReport(runs, details), "saga-report.json"),
                    )
                  }
                />
                <Action
                  label={t("saga.csv")}
                  disabled={locked || !runs.length}
                  onClick={() =>
                    safe(() =>
                      download(sagaCsv(runs), "saga-summary.csv", "text/csv"),
                    )
                  }
                />
                <Action
                  label={t("saga.snapshot")}
                  disabled={locked}
                  onClick={() =>
                    safe(() =>
                      download(pretty(snapshot), "saga-private-snapshot.json"),
                    )
                  }
                />
                <Action
                  label={t("saga.sdk")}
                  disabled={locked}
                  onClick={() =>
                    safe(() =>
                      download(
                        generateSagaToolkit(project.definition),
                        "saga-simulator.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                />
                <Action
                  label={t("saga.runner")}
                  disabled={locked}
                  onClick={() =>
                    safe(() =>
                      download(
                        generateSagaRunner(project),
                        "saga-regressions.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                />
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </details>
  );
});
