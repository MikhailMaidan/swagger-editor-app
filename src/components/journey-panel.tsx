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
import { JourneyGraph } from "./journey-graph";
import { downloadTextFile } from "@/lib/schema-download";
import {
  JourneyError,
  MAX_JOURNEY_BYTES,
  emptyJourneyProject,
  journeyJson,
  newJourneyModel,
  newJourneyState,
  newJourneyTrace,
  newJourneyTransition,
  normalizeJourneyProject,
  type JourneyProject,
  type JourneyTrace,
} from "@/lib/journey-project";
import { analyzeJourneyModel } from "@/lib/journey-engine";
import {
  compareJourneyModels,
  demoJourneyProject,
  generateJourneySuite,
  importJourneyHar,
  journeyActionsFromSchema,
  journeyReport,
  runJourneyMatrix,
  serializeJourneySuite,
  traceFromJourneyWitness,
  type JourneyComparison,
  type JourneyRun,
  type JourneySuite,
} from "@/lib/journey-studio";
import {
  generateJourneyMonitor,
  generateJourneySvg,
} from "@/lib/journey-export";
import {
  parseJourneyProject,
  serializeJourneyProject,
} from "@/lib/journey-project";
import type { TranslationKey } from "@/lib/translations";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const integer = (value: string) =>
  /^\d+$/.test(value.trim()) ? Number(value) : NaN;
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
function nextId(prefix: string, ids: string[]) {
  let n = 1;
  while (ids.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function drafts(
  p: JourneyProject,
  modelId: string,
  stateId: string,
  transitionId: string,
  traceId: string,
) {
  const model = p.models.find((m) => m.id === modelId)!,
    state = model.states.find((s) => s.id === stateId)!,
    transition = model.transitions.find((t) => t.id === transitionId),
    trace = p.traces.find((t) => t.id === traceId);
  return {
    name: p.name,
    modelName: model.name,
    initial: model.initial,
    state: { name: state.name, terminal: state.terminal },
    transition: transition
      ? {
          name: transition.name,
          enabled: transition.enabled,
          from: transition.from,
          to: transition.to,
          action: transition.action,
          statuses: transition.statuses.join(", "),
        }
      : null,
    trace: trace
      ? {
          name: trace.name,
          steps: json(trace.steps),
          expect: json(trace.expect),
        }
      : null,
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
  disabled,
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
const runKey = (r: JourneyRun) => `${r.traceId}/${r.modelId}`;
export const JourneyPanel = memo(function JourneyPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyJourneyProject),
    [modelId, setModelId] = useState("model-1"),
    [stateId, setStateId] = useState("state-1"),
    [transitionId, setTransitionId] = useState("transition-1"),
    [traceId, setTraceId] = useState("trace-1"),
    [draft, setDraft] = useState(() =>
      drafts(
        emptyJourneyProject(),
        "model-1",
        "state-1",
        "transition-1",
        "trace-1",
      ),
    );
  const [baselineId, setBaselineId] = useState("model-1"),
    [candidateId, setCandidateId] = useState("model-1"),
    [maxPairs, setMaxPairs] = useState("2000"),
    [mode, setMode] = useState<JourneySuite["mode"]>("transitions"),
    [maxCases, setMaxCases] = useState("120"),
    [catalog, setCatalog] = useState<string[]>([]);
  const [results, setResults] = useState<JourneyRun[] | null>(null),
    [resultKey, setResultKey] = useState(""),
    [search, setSearch] = useState(""),
    [comparison, setComparison] = useState<JourneyComparison | null>(null),
    [suite, setSuite] = useState<JourneySuite | null>(null),
    [generatedIndex, setGeneratedIndex] = useState(0),
    [includeDetails, setIncludeDetails] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
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
  const model = project.models.find((m) => m.id === modelId)!,
    analysis = useMemo(() => analyzeJourneyModel(model), [model]),
    pending =
      json(draft) !==
      json(drafts(project, modelId, stateId, transitionId, traceId)),
    locked = pending || busy;
  const selected =
      results?.find((r) => runKey(r) === resultKey) ?? results?.[0],
    generated = suite?.cases[generatedIndex];
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean),
    filtered =
      results?.filter((r) =>
        terms.every((term) =>
          `${r.modelName} ${r.traceName} ${r.outcome}`
            .toLowerCase()
            .includes(term),
        ),
      ) ?? [];
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, error: false, values });
  const fail = (e: unknown) =>
    setFeedback({
      key: `journey.error.${e instanceof JourneyError ? e.code : "project"}`,
      error: true,
    });
  const perform = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      fail(e);
    }
  };
  function choose(
    p: JourneyProject,
    mid: string,
    sid: string,
    eid: string,
    tid: string,
  ) {
    setModelId(mid);
    setStateId(sid);
    setTransitionId(eid);
    setTraceId(tid);
    setDraft(drafts(p, mid, sid, eid, tid));
  }
  function install(
    value: JourneyProject,
    mid = modelId,
    sid = stateId,
    eid = transitionId,
    tid = traceId,
  ) {
    const p = normalizeJourneyProject(value),
      m = p.models.find((v) => v.id === mid) ?? p.models[0],
      state = m.states.find((v) => v.id === sid) ?? m.states[0],
      transition = m.transitions.find((v) => v.id === eid) ?? m.transitions[0],
      trace = p.traces.find((v) => v.id === tid) ?? p.traces[0];
    setProject(p);
    choose(p, m.id, state.id, transition?.id ?? "", trace?.id ?? "");
    setResults(null);
    setComparison(null);
    setSuite(null);
    setSearch("");
    setBaselineId(
      p.models.some((m) => m.id === baselineId) ? baselineId : p.models[0].id,
    );
    setCandidateId(
      p.models.some((m) => m.id === candidateId)
        ? candidateId
        : (p.models[1] ?? p.models[0]).id,
    );
  }
  function appendTrace(trace: JourneyTrace) {
    const p = normalizeJourneyProject({
      ...project,
      traces: [...project.traces, trace],
    });
    setProject(p);
    choose(p, modelId, stateId, transitionId, trace.id);
    setResults(null);
    setSearch("");
    notify("journey.traceAdded");
  }
  function save() {
    perform(() => {
      const models = project.models.map((m) =>
        m.id !== modelId
          ? m
          : {
              ...m,
              name: draft.modelName,
              initial: draft.initial,
              states: m.states.map((s) =>
                s.id === stateId ? { ...s, ...draft.state } : s,
              ),
              transitions: m.transitions.map((edge) =>
                edge.id === transitionId && draft.transition
                  ? {
                      ...edge,
                      ...draft.transition,
                      statuses: draft.transition.statuses
                        .split(",")
                        .map((s) =>
                          /^\d{3}$/.test(s.trim()) ? Number(s.trim()) : NaN,
                        ),
                    }
                  : edge,
              ),
            },
      );
      const traces = project.traces.map((trace) =>
        trace.id === traceId && draft.trace
          ? {
              ...trace,
              name: draft.trace.name,
              steps: journeyJson(draft.trace.steps),
              expect: journeyJson(draft.trace.expect),
            }
          : trace,
      );
      install(
        normalizeJourneyProject({
          ...project,
          name: draft.name,
          models,
          traces,
        }),
      );
      notify("journey.saved");
    });
  }
  function addModel(clone: boolean) {
    if (locked || project.models.length >= 5) return;
    perform(() => {
      const id = nextId(
          "model",
          project.models.map((m) => m.id),
        ),
        added = clone ? { ...model, id, name: id } : newJourneyModel(id);
      install(
        {
          ...project,
          models: [...project.models, added],
          traces: clone
            ? project.traces.map((trace) =>
                Object.hasOwn(trace.expect, modelId)
                  ? {
                      ...trace,
                      expect: Object.fromEntries([
                        ...Object.entries(trace.expect),
                        [id, trace.expect[modelId]],
                      ]),
                    }
                  : trace,
              )
            : project.traces,
        },
        id,
        added.initial,
        added.transitions[0]?.id ?? "",
      );
      setFeedback(null);
    });
  }
  function deleteModel() {
    if (locked || project.models.length === 1) return;
    perform(() => {
      install({
        ...project,
        models: project.models.filter((m) => m.id !== modelId),
        traces: project.traces.map((trace) => ({
          ...trace,
          expect: Object.fromEntries(
            Object.entries(trace.expect).filter(([id]) => id !== modelId),
          ),
        })),
      });
      setFeedback(null);
    });
  }
  function addState() {
    if (locked || model.states.length >= 40) return;
    perform(() => {
      const id = nextId(
        "state",
        model.states.map((s) => s.id),
      );
      install(
        {
          ...project,
          models: project.models.map((m) =>
            m.id === modelId
              ? { ...m, states: [...m.states, newJourneyState(id)] }
              : m,
          ),
        },
        modelId,
        id,
      );
      setFeedback(null);
    });
  }
  function deleteState() {
    if (locked || model.states.length === 1) return;
    perform(() => {
      install({
        ...project,
        models: project.models.map((m) =>
          m.id === modelId
            ? { ...m, states: m.states.filter((s) => s.id !== stateId) }
            : m,
        ),
      });
      setFeedback(null);
    });
  }
  function addTransition(clone: boolean) {
    if (locked || model.transitions.length >= 120) return;
    perform(() => {
      const id = nextId(
          "transition",
          model.transitions.map((v) => v.id),
        ),
        old = model.transitions.find((v) => v.id === transitionId),
        edge =
          clone && old
            ? { ...old, id, name: id, enabled: false }
            : { ...newJourneyTransition(id, stateId, stateId), enabled: false };
      install(
        {
          ...project,
          models: project.models.map((m) =>
            m.id === modelId
              ? { ...m, transitions: [...m.transitions, edge] }
              : m,
          ),
        },
        modelId,
        stateId,
        id,
      );
      setFeedback(null);
    });
  }
  function deleteTransition() {
    if (locked) return;
    perform(() => {
      install({
        ...project,
        models: project.models.map((m) =>
          m.id === modelId
            ? {
                ...m,
                transitions: m.transitions.filter((v) => v.id !== transitionId),
              }
            : m,
        ),
      });
      setFeedback(null);
    });
  }
  function addTrace(clone: boolean) {
    if (locked || project.traces.length >= 30) return;
    perform(() => {
      const id = nextId(
          "trace",
          project.traces.map((v) => v.id),
        ),
        old = project.traces.find((v) => v.id === traceId);
      appendTrace(
        clone && old ? { ...old, id, name: id } : newJourneyTrace(id),
      );
    });
  }
  function deleteTrace() {
    if (locked) return;
    perform(() => {
      install({
        ...project,
        traces: project.traces.filter((v) => v.id !== traceId),
      });
      setFeedback(null);
    });
  }
  function saveGenerated() {
    if (locked || !generated) return;
    perform(() =>
      appendTrace({
        ...generated,
        id: nextId(
          "trace",
          project.traces.map((v) => v.id),
        ),
      }),
    );
  }
  function saveWitness(direction: "forward" | "reverse") {
    if (locked || !comparison) return;
    perform(() =>
      appendTrace(
        traceFromJourneyWitness(
          project,
          comparison,
          direction,
          nextId(
            "trace",
            project.traces.map((v) => v.id),
          ),
        ),
      ),
    );
  }
  function download(source: string, file: string, type = "application/json") {
    if (downloadTextFile(source, file, type)) notify("journey.downloaded");
    else setFeedback({ key: "journey.error.download", error: true });
  }
  async function execute(kind: "matrix" | "trace" | "compare" | "suite") {
    if (locked) return;
    const token = ++generation.current;
    setBusy(true);
    setFeedback(null);
    setProgress({ done: 0, total: 0 });
    const cancelled = () => generation.current !== token;
    try {
      if (kind === "compare") {
        const a = project.models.find((m) => m.id === baselineId)!,
          b = project.models.find((m) => m.id === candidateId)!,
          result = await compareJourneyModels(
            a,
            b,
            integer(maxPairs),
            cancelled,
          );
        if (cancelled()) return;
        setComparison(result);
        notify(`journey.classification.${result.classification}`);
      } else if (kind === "suite") {
        const result = await generateJourneySuite(
          model,
          mode,
          integer(maxCases),
          cancelled,
        );
        if (cancelled()) return;
        setSuite(result);
        setGeneratedIndex(0);
        notify(result.complete ? "journey.complete" : "journey.partial");
      } else {
        const runs = await runJourneyMatrix(
          project,
          kind === "trace" ? traceId : undefined,
          cancelled,
          (done, total) => {
            if (!cancelled()) setProgress({ done, total });
          },
        );
        if (cancelled()) return;
        setResults(runs);
        setResultKey(
          runKey(runs.find((r) => r.modelId === modelId) ?? runs[0]),
        );
        setSearch("");
        const checked = runs.filter((r) => r.checked).length;
        notify("journey.finished", {
          passed: String(runs.filter((r) => r.passed).length),
          total: String(runs.length),
          checked: String(checked),
          unchecked: String(runs.length - checked),
        });
      }
    } catch (e) {
      if (!cancelled()) fail(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  async function importFile(input: HTMLInputElement, har: boolean) {
    const file = input.files?.[0];
    input.value = "";
    if (!file || locked) return;
    const token = ++generation.current;
    setBusy(true);
    setFeedback(null);
    setProgress({ done: 0, total: 0 });
    try {
      if (file.size > (har ? 5 * 1024 * 1024 : MAX_JOURNEY_BYTES))
        throw new JourneyError("limit");
      const source = await file.text();
      if (generation.current !== token) return;
      if (har) {
        const result = importJourneyHar(
          source,
          model,
          nextId(
            "trace",
            project.traces.map((v) => v.id),
          ),
        );
        appendTrace(result.trace);
        notify("journey.harLoaded", {
          count: String(result.trace.steps.length),
          skipped: String(result.skipped),
        });
      } else {
        install(parseJourneyProject(source));
        notify("journey.loaded");
      }
    } catch (e) {
      if (generation.current === token) fail(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  const patchTransition = (
    patch: Partial<NonNullable<typeof draft.transition>>,
  ) =>
    setDraft((d) => ({
      ...d,
      transition: d.transition ? { ...d.transition, ...patch } : null,
    }));
  const patchTrace = (
    key: keyof NonNullable<typeof draft.trace>,
    value: string,
  ) =>
    setDraft((d) => ({
      ...d,
      trace: d.trace ? { ...d.trace, [key]: value } : null,
    }));
  function action(key: TranslationKey, fn: () => void, disabled = false) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={fn}
        disabled={disabled}
      >
        {t(key)}
      </button>
    );
  }
  function stateSelect(
    label: TranslationKey,
    value: string,
    onChange: (v: string) => void,
  ) {
    return (
      <Select label={t(label)} value={value} onChange={onChange}>
        {!model.states.some((s) => s.id === value) && (
          <option value={value}>
            {t("journey.missingState", { id: value })}
          </option>
        )}
        {model.states.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.id})
          </option>
        ))}
      </Select>
    );
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("journey.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("journey.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("journey.guide")}
            </summary>
            {(["semantics", "proofHelp", "privacy", "limits"] as const).map(
              (key) => (
                <p key={key}>{t(`journey.${key}`)}</p>
              ),
            )}
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
            <p className="text-xs text-amber-800">{t("journey.pending")}</p>
          )}
          {busy && (
            <div className="space-y-2">
              <p role="status">
                {t("journey.busy")}{" "}
                {progress.total > 0 &&
                  t("journey.progress", {
                    done: String(progress.done),
                    total: String(progress.total),
                  })}
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  notify("journey.cancelled");
                }}
              >
                {t("journey.cancel")}
              </button>
            </div>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-2">
              {action(
                "journey.demo",
                () =>
                  perform(() => {
                    install(demoJourneyProject());
                    notify("journey.loaded");
                  }),
                locked,
              )}
              {action(
                "journey.new",
                () =>
                  perform(() => {
                    install(emptyJourneyProject());
                    notify("journey.loaded");
                  }),
                locked,
              )}
              {action(
                "journey.export",
                () =>
                  perform(() =>
                    download(
                      serializeJourneyProject(project),
                      "journey-project.json",
                    ),
                  ),
                locked,
              )}
              <label className="block text-xs font-semibold">
                {t("journey.import")}
                <input
                  className={inputClass}
                  type="file"
                  accept=".json,application/json"
                  disabled={locked}
                  onChange={(e) => {
                    void importFile(e.currentTarget, false);
                  }}
                />
              </label>
            </div>
            <Field
              label={t("journey.name")}
              value={draft.name}
              onChange={(name) => setDraft((d) => ({ ...d, name }))}
            />
            <div className="flex flex-wrap gap-2">
              {action("journey.save", save, !pending)}
              {action(
                "journey.discard",
                () => {
                  setDraft(
                    drafts(project, modelId, stateId, transitionId, traceId),
                  );
                  setFeedback(null);
                },
                !pending,
              )}
            </div>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("journey.modelSection")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("journey.model")}
                  value={modelId}
                  disabled={locked}
                  onChange={(id) => {
                    const m = project.models.find((m) => m.id === id)!;
                    choose(
                      project,
                      id,
                      m.states[0].id,
                      m.transitions[0]?.id ?? "",
                      traceId,
                    );
                    setFeedback(null);
                  }}
                >
                  {project.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("journey.modelName")}
                  value={draft.modelName}
                  onChange={(modelName) =>
                    setDraft((d) => ({ ...d, modelName }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {action(
                  "journey.addModel",
                  () => addModel(false),
                  locked || project.models.length >= 5,
                )}
                {action(
                  "journey.cloneModel",
                  () => addModel(true),
                  locked || project.models.length >= 5,
                )}
                {action(
                  "journey.deleteModel",
                  deleteModel,
                  locked || project.models.length === 1,
                )}
              </div>
              {stateSelect("journey.initial", draft.initial, (initial) =>
                setDraft((d) => ({ ...d, initial })),
              )}
              <JourneyGraph
                model={model}
                stateId={stateId}
                transitionId={transitionId}
                activeState={
                  selected?.modelId === modelId
                    ? selected.finalState
                    : undefined
                }
                coveredTransitions={
                  selected?.modelId === modelId
                    ? selected.coveredTransitions
                    : []
                }
                disabled={locked}
                onState={(id) => {
                  choose(project, modelId, id, transitionId, traceId);
                  setFeedback(null);
                }}
                onTransition={(id) => {
                  choose(project, modelId, stateId, id, traceId);
                  setFeedback(null);
                }}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("journey.state")}
                  value={stateId}
                  disabled={locked}
                  onChange={(id) => {
                    choose(project, modelId, id, transitionId, traceId);
                    setFeedback(null);
                  }}
                >
                  {model.states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("journey.stateName")}
                  value={draft.state.name}
                  onChange={(name) =>
                    setDraft((d) => ({ ...d, state: { ...d.state, name } }))
                  }
                />
              </div>
              <Check
                label={t("journey.terminal")}
                checked={draft.state.terminal}
                onChange={(terminal) =>
                  setDraft((d) => ({ ...d, state: { ...d.state, terminal } }))
                }
              />
              <div className="flex flex-wrap gap-2">
                {action(
                  "journey.addState",
                  addState,
                  locked || model.states.length >= 40,
                )}
                {action(
                  "journey.deleteState",
                  deleteState,
                  locked || model.states.length === 1,
                )}
              </div>
              <p className="text-xs text-slate-600">{t("journey.stateHelp")}</p>
              <h4 className="text-sm font-bold">
                {t("journey.analysis")}:{" "}
                <span
                  className={
                    analysis.valid ? "text-emerald-800" : "text-red-700"
                  }
                >
                  {t(analysis.valid ? "journey.valid" : "journey.invalid")}
                </span>
              </h4>
              <p className="text-xs text-slate-600">
                {t("journey.reachable", {
                  reachable: String(analysis.reachable.length),
                  total: String(model.states.length),
                  transitions: String(analysis.reachableTransitions.length),
                })}
              </p>
              <p className="text-xs text-slate-600">
                {t("journey.findings", {
                  total: String(analysis.diagnostics.length),
                })}
              </p>
              <ul className="space-y-1 text-xs">
                {analysis.diagnostics.slice(0, 100).map((d, i) => (
                  <li
                    key={i}
                    className={
                      d.severity === "error"
                        ? "break-words text-red-700"
                        : "break-words text-amber-800"
                    }
                  >
                    {t(`journey.diagnostic.${d.code}`)} ·{" "}
                    {[
                      d.stateId,
                      d.transitionIds?.join(", "),
                      d.action,
                      d.status,
                    ]
                      .filter((v) => v !== undefined)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {action(
                  "journey.exportSvg",
                  () =>
                    perform(() =>
                      download(
                        generateJourneySvg(model),
                        "journey-graph.svg",
                        "image/svg+xml",
                      ),
                    ),
                  locked,
                )}
                {action(
                  "journey.exportMonitor",
                  () =>
                    perform(() =>
                      download(
                        generateJourneyMonitor(model),
                        "journey-monitor.mjs",
                        "text/javascript",
                      ),
                    ),
                  locked || !analysis.valid,
                )}
              </div>
              <p className="text-xs text-slate-600">
                {t("journey.monitorHelp")}
              </p>
              <p className="text-xs text-slate-600">
                {t("journey.monitorCounts")}
              </p>
            </section>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("journey.transitionSection")}</h3>
              <Select
                label={t("journey.transition")}
                value={transitionId}
                disabled={locked || !model.transitions.length}
                onChange={(id) => {
                  choose(project, modelId, stateId, id, traceId);
                  setFeedback(null);
                }}
              >
                {model.transitions.map((edge) => (
                  <option key={edge.id} value={edge.id}>
                    {edge.name} ({edge.id})
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                {action(
                  "journey.addTransition",
                  () => addTransition(false),
                  locked || model.transitions.length >= 120,
                )}
                {action(
                  "journey.cloneTransition",
                  () => addTransition(true),
                  locked || !transitionId || model.transitions.length >= 120,
                )}
                {action(
                  "journey.deleteTransition",
                  deleteTransition,
                  locked || !transitionId,
                )}
              </div>
              {draft.transition ? (
                <div className="space-y-3">
                  <Field
                    label={t("journey.transitionName")}
                    value={draft.transition.name}
                    onChange={(name) => patchTransition({ name })}
                  />
                  <Check
                    label={t("journey.enabled")}
                    checked={draft.transition.enabled}
                    onChange={(enabled) => patchTransition({ enabled })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {stateSelect(
                      "journey.from",
                      draft.transition.from,
                      (from) => patchTransition({ from }),
                    )}
                    {stateSelect("journey.to", draft.transition.to, (to) =>
                      patchTransition({ to }),
                    )}
                    <Field
                      label={t("journey.action")}
                      value={draft.transition.action}
                      onChange={(action) => patchTransition({ action })}
                    />
                    <Field
                      label={t("journey.statuses")}
                      value={draft.transition.statuses}
                      onChange={(statuses) => patchTransition({ statuses })}
                    />
                  </div>
                  {getSchemaText &&
                    action(
                      "journey.loadActions",
                      () =>
                        perform(() => {
                          setCatalog(journeyActionsFromSchema(getSchemaText()));
                          setFeedback(null);
                        }),
                      busy,
                    )}
                  {catalog.length > 0 && (
                    <Select
                      label={t("journey.catalog")}
                      value=""
                      onChange={(action) => {
                        if (action) patchTransition({ action });
                      }}
                    >
                      <option value="">
                        {t("journey.catalogPlaceholder")}
                      </option>
                      {catalog.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </Select>
                  )}
                  <p className="text-xs text-slate-600">
                    {t("journey.catalogHelp")}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  {t("journey.noTransitions")}
                </p>
              )}
            </section>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("journey.traceSection")}</h3>
              <Select
                label={t("journey.trace")}
                value={traceId}
                disabled={locked || !project.traces.length}
                onChange={(id) => {
                  choose(project, modelId, stateId, transitionId, id);
                  setFeedback(null);
                }}
              >
                {project.traces.map((trace) => (
                  <option key={trace.id} value={trace.id}>
                    {trace.name} ({trace.id})
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                {action(
                  "journey.addTrace",
                  () => addTrace(false),
                  locked || project.traces.length >= 30,
                )}
                {action(
                  "journey.cloneTrace",
                  () => addTrace(true),
                  locked || !traceId || project.traces.length >= 30,
                )}
                {action("journey.deleteTrace", deleteTrace, locked || !traceId)}
              </div>
              {draft.trace ? (
                <div className="space-y-3">
                  <Field
                    label={t("journey.traceName")}
                    value={draft.trace.name}
                    onChange={(v) => patchTrace("name", v)}
                  />
                  <Field
                    label={t("journey.steps")}
                    value={draft.trace.steps}
                    onChange={(v) => patchTrace("steps", v)}
                    multiline
                  />
                  <Field
                    label={t("journey.expect")}
                    value={draft.trace.expect}
                    onChange={(v) => patchTrace("expect", v)}
                    multiline
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  {t("journey.noTraces")}
                </p>
              )}
              <p className="text-xs text-slate-600">{t("journey.traceHelp")}</p>
              <label className="block text-xs font-semibold">
                {t("journey.importHar")}
                <input
                  type="file"
                  accept=".har,.json,application/json"
                  className={inputClass}
                  disabled={locked || project.traces.length >= 30}
                  onChange={(e) => {
                    void importFile(e.currentTarget, true);
                  }}
                />
              </label>
              <p className="text-xs text-slate-600">{t("journey.harHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || !traceId}
                  onClick={() => {
                    void execute("trace");
                  }}
                >
                  {t("journey.runTrace")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || !project.traces.length}
                  onClick={() => {
                    void execute("matrix");
                  }}
                >
                  {t("journey.runAll")}
                </button>
              </div>
            </section>
            {results && selected && (
              <section className="space-y-3" aria-label={t("journey.results")}>
                <h3 className="font-bold">{t("journey.results")}</h3>
                <Field
                  label={t("journey.search")}
                  value={search}
                  onChange={setSearch}
                />
                <div className="overflow-x-auto">
                  <table
                    aria-label={t("journey.results")}
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr>
                        {(
                          [
                            "modelTrace",
                            "outcome",
                            "expected",
                            "finalState",
                            "checked",
                          ] as const
                        ).map((key) => (
                          <th key={key} className="p-2">
                            {t(`journey.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr
                          key={runKey(r)}
                          className="border-t border-slate-200"
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-purple-800 underline"
                              onClick={() => setResultKey(runKey(r))}
                            >
                              {r.modelName} / {r.traceName}
                            </button>
                          </td>
                          <td className="p-2">
                            {t(`journey.outcome.${r.outcome}`)}
                          </td>
                          <td className="p-2">
                            {r.expected
                              ? t(`journey.outcome.${r.expected}`)
                              : t("journey.unchecked")}
                          </td>
                          <td className="p-2">{r.finalState}</td>
                          <td
                            className={`p-2 font-bold ${r.passed ? "text-emerald-800" : "text-red-700"}`}
                          >
                            {t(r.passed ? "journey.pass" : "journey.fail")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Select
                  label={t("journey.result")}
                  value={runKey(selected)}
                  onChange={setResultKey}
                >
                  {results.map((r) => (
                    <option key={runKey(r)} value={runKey(r)}>
                      {r.modelName} / {r.traceName}
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("journey.inspection")}
                  value={json({
                    trace: project.traces.find(
                      (trace) => trace.id === selected.traceId,
                    ),
                    ...selected,
                  })}
                  multiline
                  readOnly
                />
              </section>
            )}
            <section
              className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3"
              aria-label={t("journey.compareSection")}
            >
              <h3 className="font-bold">{t("journey.compareSection")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("journey.baseline")}
                  value={baselineId}
                  disabled={locked}
                  onChange={setBaselineId}
                >
                  {project.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </Select>
                <Select
                  label={t("journey.candidate")}
                  value={candidateId}
                  disabled={locked}
                  onChange={setCandidateId}
                >
                  {project.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </Select>
              </div>
              <Field
                label={t("journey.maxPairs")}
                value={maxPairs}
                onChange={setMaxPairs}
              />
              <p className="text-xs text-slate-600">{t("journey.proofHelp")}</p>
              <button
                type="button"
                className={buttonClass}
                disabled={locked}
                onClick={() => {
                  void execute("compare");
                }}
              >
                {t("journey.compare")}
              </button>
              {comparison && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold">
                    {t("journey.comparison")}: {comparison.baselineId} →{" "}
                    {comparison.candidateId}
                  </h4>
                  <p className="text-sm font-bold">
                    {t(`journey.classification.${comparison.classification}`)}
                  </p>
                  {(["forward", "reverse"] as const).map((direction) => {
                    const result = comparison[direction];
                    return (
                      <div
                        key={direction}
                        className="space-y-2 rounded-lg bg-slate-50 p-3"
                      >
                        <h5 className="text-xs font-bold">
                          {t(`journey.${direction}`)}:{" "}
                          {t(`journey.inclusion.${result.status}`)}
                        </h5>
                        <p className="text-xs">
                          {t("journey.pairs", {
                            count: String(result.checkedPairs),
                          })}{" "}
                          {result.reason &&
                            t(`journey.reason.${result.reason}`)}
                        </p>
                        {result.steps !== null && (
                          <div className="space-y-2">
                            <p className="text-xs">
                              {t("journey.witnessLength", {
                                count: String(result.steps.length),
                              })}
                            </p>
                            <Field
                              label={`${t("journey.witness")} · ${t(`journey.${direction}`)}`}
                              value={json(result.steps)}
                              multiline
                              readOnly
                            />
                          </div>
                        )}
                        {action(
                          direction === "forward"
                            ? "journey.saveForward"
                            : "journey.saveReverse",
                          () => saveWitness(direction),
                          locked ||
                            project.traces.length >= 30 ||
                            result.status !== "counterexample" ||
                            result.steps === null ||
                            result.steps.length > 200,
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("journey.suiteSection")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("journey.suiteMode")}
                  value={mode}
                  onChange={(mode) => setMode(mode as JourneySuite["mode"])}
                >
                  {(["states", "transitions", "events"] as const).map(
                    (mode) => (
                      <option key={mode} value={mode}>
                        {t(`journey.mode.${mode}`)}
                      </option>
                    ),
                  )}
                </Select>
                <Field
                  label={t("journey.maxCases")}
                  value={maxCases}
                  onChange={setMaxCases}
                />
              </div>
              <p className="text-xs text-slate-600">{t("journey.suiteHelp")}</p>
              <button
                type="button"
                className={buttonClass}
                disabled={locked || !analysis.valid}
                onClick={() => {
                  void execute("suite");
                }}
              >
                {t("journey.generate")}
              </button>
              {suite && (
                <div className="space-y-3">
                  <p className="text-sm font-bold">
                    {suite.modelName} · {t(`journey.mode.${suite.mode}`)} ·{" "}
                    {t(suite.complete ? "journey.complete" : "journey.partial")}
                  </p>
                  <p className="text-xs">
                    {t("journey.coverage", {
                      covered: String(suite.covered),
                      total: String(suite.objectives),
                      cases: String(suite.cases.length),
                    })}
                  </p>
                  <Select
                    label={t("journey.generatedCase")}
                    value={String(generatedIndex)}
                    disabled={!suite.cases.length}
                    onChange={(v) => setGeneratedIndex(Number(v))}
                  >
                    {suite.cases.map((c, i) => (
                      <option key={c.id} value={i}>
                        {c.name} · {c.steps.length} ·{" "}
                        {t(`journey.outcome.${c.expect[suite.modelId]}`)}
                      </option>
                    ))}
                  </Select>
                  {generated && (
                    <Field
                      label={t("journey.generatedInspection")}
                      value={json(generated)}
                      multiline
                      readOnly
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {action(
                      "journey.saveCase",
                      saveGenerated,
                      locked || !generated || project.traces.length >= 30,
                    )}
                    {action(
                      "journey.exportSuite",
                      () =>
                        perform(() =>
                          download(
                            serializeJourneySuite(suite),
                            "journey-coverage-suite.json",
                          ),
                        ),
                      locked,
                    )}
                  </div>
                </div>
              )}
            </section>
            <Check
              label={t("journey.includeDetails")}
              checked={includeDetails}
              onChange={setIncludeDetails}
            />
            {action(
              "journey.report",
              () =>
                perform(() =>
                  download(
                    journeyReport(
                      results ?? [],
                      includeDetails,
                      comparison ?? undefined,
                    ),
                    "journey-analysis-report.json",
                  ),
                ),
              locked || (!results && !comparison),
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
