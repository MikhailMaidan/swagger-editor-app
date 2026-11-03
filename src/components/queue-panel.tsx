"use client";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { QueueChart } from "./queue-chart";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import {
  MAX_QUEUE_PROJECT,
  QueueError,
  newQueueDefinition,
  newQueueInput,
  normalizeQueueStep,
  queueJson,
  type QueueStep,
  type QueueDefinition,
} from "@/lib/queue-model";
import { createJobQueue, summarizeQueue } from "@/lib/queue-engine";
import {
  emptyQueueProject,
  newQueueScenario,
  normalizeQueueProject,
  parseQueueProject,
  serializeQueueProject,
  type QueueProject,
  type QueueScenario,
} from "@/lib/queue-project";
import {
  demoQueueProject,
  generateQueueScenario,
  importQueueNdjson,
  queueRunReport,
  queueTimelineCsv,
  recordQueueScenario,
  runQueueScenarios,
  type QueuePoint,
  type QueueRun,
} from "@/lib/queue-studio";
import { generateQueueToolkit, generateQueueOpenApi } from "@/lib/queue-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => JSON.stringify(v, null, 2),
  integer = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s) : NaN);
const inputClass =
    "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs",
  buttonClass =
    "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:opacity-50";
function Field({
  label,
  value,
  onChange,
  multiline = false,
  onEscape,
}: {
  label: string;
  value: string;
  onChange?: (s: string) => void;
  multiline?: boolean;
  onEscape?: () => void;
}) {
  const props = {
    className: inputClass,
    value,
    readOnly: !onChange,
    onChange: (e: { target: { value: string } }) => onChange?.(e.target.value),
    onKeyDown: (e: { key: string }) => {
      if (e.key === "Escape") onEscape?.();
    },
  };
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea {...props} rows={6} spellCheck={false} />
      ) : (
        <input {...props} autoComplete="off" spellCheck={false} />
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
  onChange: (s: string) => void;
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
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
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
const policyFields = [
  { key: "capacity", label: "queue.capacity" },
  { key: "perWorker", label: "queue.perWorker" },
  { key: "visibilityMs", label: "queue.visibility" },
  { key: "retentionMs", label: "queue.retention" },
  { key: "maxAttempts", label: "queue.attempts" },
  { key: "backoffMs", label: "queue.backoff" },
  { key: "maxBackoffMs", label: "queue.maxBackoff" },
] as const;
function drafts(p: QueueProject, id: string) {
  const s = p.scenarios.find((s) => s.id === id),
    d = p.definition;
  return {
    name: p.name,
    policyName: d.name,
    order: d.order,
    serialGroups: d.serialGroups,
    capacity: String(d.capacity),
    perWorker: String(d.perWorker),
    visibilityMs: String(d.visibilityMs),
    retentionMs: String(d.retentionMs),
    maxAttempts: String(d.maxAttempts),
    backoffMs: String(d.backoffMs),
    maxBackoffMs: String(d.maxBackoffMs),
    scenarioName: s?.name ?? "",
    steps: json(s?.steps ?? []),
    expect: json(s?.expect ?? null),
  };
}
type Draft = ReturnType<typeof drafts>;
function makeRuntime(d: QueueDefinition, instanceId: string) {
  const queue = createJobQueue(d, instanceId);
  return {
    queue,
    snapshot: queue.snapshot(),
    steps: [] as QueueStep[],
    points: [] as QueuePoint[],
  };
}
export const QueuePanel = memo(function QueuePanel() {
  const { t } = useI18n(),
    [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyQueueProject),
    [scenarioId, setScenarioId] = useState("case-1"),
    [draft, setDraft] = useState(() => drafts(emptyQueueProject(), "case-1")),
    [saved, setSaved] = useState(() => drafts(emptyQueueProject(), "case-1"));
  const [runtime, setRuntime] = useState(() =>
      makeRuntime(newQueueDefinition(), "session-1"),
    ),
    [jobId, setJobId] = useState("job-1"),
    [jobName, setJobName] = useState("Job 1"),
    [group, setGroup] = useState(""),
    [priority, setPriority] = useState("0"),
    [delay, setDelay] = useState("0"),
    [payload, setPayload] = useState(() => json(newQueueInput().payload)),
    [worker, setWorker] = useState("worker-a"),
    [limit, setLimit] = useState("1"),
    [selectedJob, setSelectedJob] = useState(""),
    [receipt, setReceipt] = useState(""),
    [advanceMs, setAdvanceMs] = useState("1000"),
    [command, setCommand] = useState(() =>
      json({ type: "poll", worker: "worker-a", limit: 1 }),
    ),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [liveIndex, setLiveIndex] = useState(0);
  const [runs, setRuns] = useState<QueueRun[] | null>(null),
    [resultId, setResultId] = useState(""),
    [pointIndex, setPointIndex] = useState(0),
    [details, setDetails] = useState(false),
    [generator, setGenerator] = useState(() =>
      json({ count: 20, spacingMs: 100, groupCount: 3 }),
    ),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error?: boolean;
      values?: Record<string, string>;
    } | null>(null);
  const generation = useRef(0);
  const [runtimeEpoch, setRuntimeEpoch] = useState(1);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const pending = (Object.keys(draft) as (keyof Draft)[]).some(
      (k) => draft[k] !== saved[k],
    ),
    scenario = project.scenarios.find((s) => s.id === scenarioId),
    job = runtime.snapshot.jobs.find((j) => j.id === selectedJob),
    summary = summarizeQueue(runtime.snapshot),
    inspected = runs?.find((r) => r.scenarioId === resultId),
    index = inspected
      ? Math.min(pointIndex, Math.max(0, inspected.timeline.length - 1))
      : 0,
    point = inspected?.timeline[index];
  const reason = (s: string) => t(`queue.reason.${s}` as TranslationKey);
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function error(e: unknown) {
    setFeedback({
      key:
        e instanceof QueueError
          ? e.code === "cancelled"
            ? "queue.cancelled"
            : `queue.error.${e.code}`
          : "queue.error.unknown",
      error: true,
    });
  }
  function attempt(f: () => void) {
    try {
      f();
    } catch (e) {
      error(e);
    }
  }
  function ready() {
    if (busy) return false;
    if (pending) {
      setFeedback({ key: "queue.pending", error: true });
      return false;
    }
    return true;
  }
  function nextId() {
    let n = 1;
    while (project.scenarios.some((s) => s.id === `case-${n}`)) n++;
    return `case-${n}`;
  }
  function reset(d = project.definition) {
    const nextEpoch = runtimeEpoch + 1;
    setRuntimeEpoch(nextEpoch);
    setRuntime(makeRuntime(d, `session-${nextEpoch}`));
    setSelectedJob("");
    setReceipt("");
    setSearch("");
    setFilter("all");
    setLiveIndex(0);
  }
  function install(value: QueueProject, preferred = scenarioId, fresh = false) {
    const p = normalizeQueueProject(value),
      id =
        p.scenarios.find((s) => s.id === preferred)?.id ??
        p.scenarios[0]?.id ??
        "",
      next = drafts(p, id);
    if (fresh || json(p.definition) !== json(project.definition))
      reset(p.definition);
    setProject(p);
    setScenarioId(id);
    setDraft(next);
    setSaved(next);
    setRuns(null);
    setResultId("");
    setPointIndex(0);
    setFeedback(null);
  }
  function save() {
    attempt(() => {
      const definition = {
        ...project.definition,
        name: draft.policyName,
        order: draft.order,
        serialGroups: draft.serialGroups,
        ...Object.fromEntries(
          policyFields.map(({ key }) => [key, integer(draft[key])]),
        ),
      };
      install({
        ...project,
        name: draft.name,
        definition,
        scenarios: project.scenarios.map((s) =>
          s.id === scenarioId
            ? {
                ...s,
                name: draft.scenarioName,
                steps: queueJson(draft.steps) as QueueStep[],
                expect: queueJson(draft.expect) as QueueScenario["expect"],
              }
            : s,
        ),
      });
      setFeedback({ key: "queue.saved" });
    });
  }
  function selectCase(id: string) {
    if (!ready()) return;
    const next = drafts(project, id);
    setScenarioId(id);
    setDraft(next);
    setSaved(next);
    setFeedback(null);
  }
  function caseAction(action: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (action === "delete")
        install({
          ...project,
          scenarios: project.scenarios.filter((s) => s.id !== scenarioId),
        });
      else {
        const id = nextId(),
          added =
            action === "add"
              ? newQueueScenario(id)
              : { ...scenario!, id, name: id };
        install({ ...project, scenarios: [...project.scenarios, added] }, id);
      }
    });
  }
  function chooseJob(id: string) {
    setSelectedJob(id);
    const j = runtime.snapshot.jobs.find((j) => j.id === id);
    if (j?.lease) {
      setWorker(j.lease.worker);
      setReceipt(j.lease.receipt);
    }
  }
  function apply(input: unknown) {
    if (!ready()) return;
    attempt(() => {
      const step = normalizeQueueStep(input),
        decision = runtime.queue.apply(step),
        snapshot = runtime.queue.snapshot(),
        s = summarizeQueue(snapshot);
      setRuntime({
        ...runtime,
        snapshot,
        steps: [...runtime.steps, step],
        points: [
          ...runtime.points,
          {
            command: snapshot.commands,
            atMs: snapshot.nowMs,
            accepted: decision.accepted,
            reason: decision.reason,
            summary: s,
          },
        ],
      });
      setLiveIndex(snapshot.commands - 1);
      setCommand(json(step));
      const j = decision.jobs[0];
      if (j) {
        setSelectedJob(j.id);
        if (j.lease) {
          setWorker(j.lease.worker);
          setReceipt(j.lease.receipt);
        }
      }
      setFeedback({
        key: "queue.applied",
        error: !decision.accepted,
        values: { reason: reason(decision.reason) },
      });
    });
  }
  async function run(all: boolean) {
    if (!ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setFeedback(null);
    setProgress({ done: 0, total: 0 });
    try {
      const rows = await runQueueScenarios(
        project,
        all ? undefined : scenarioId,
        cancelled,
        (done, total) => {
          if (!cancelled()) setProgress({ done, total });
        },
      );
      if (cancelled()) return;
      setRuns(rows);
      setResultId(rows[0]?.scenarioId ?? "");
      setPointIndex(Math.max(0, (rows[0]?.timeline.length ?? 1) - 1));
      setFeedback({
        key: "queue.completed",
        values: {
          passed: String(rows.filter((r) => r.passed).length),
          checked: String(rows.filter((r) => r.checked).length),
          total: String(rows.length),
        },
      });
    } catch (e) {
      if (!cancelled()) error(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  async function importFile(file: File | undefined, traffic: boolean) {
    if (!file || !ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      if (file.size > MAX_QUEUE_PROJECT) throw new QueueError("limit");
      const source = await file.text();
      if (cancelled()) return;
      if (traffic) {
        const id = nextId(),
          s = importQueueNdjson(source, id);
        install({ ...project, scenarios: [...project.scenarios, s] }, id);
        setFeedback({ key: "queue.imported" });
      } else {
        install(parseQueueProject(source), "", true);
        setFeedback({ key: "queue.loaded" });
      }
    } catch (e) {
      if (!cancelled()) error(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  function download(
    kind: "project" | "toolkit" | "openapi" | "report" | "csv",
  ) {
    if (!ready()) return;
    attempt(() => {
      const source =
        kind === "project"
          ? serializeQueueProject(project)
          : kind === "toolkit"
            ? generateQueueToolkit(project.definition)
            : kind === "openapi"
              ? json(generateQueueOpenApi(project.definition))
              : kind === "csv"
                ? queueTimelineCsv(inspected!)
                : json(queueRunReport(runs ?? [], details));
      if (getByteSize(source) > 16 * 1024 * 1024) throw new QueueError("limit");
      const ext = kind === "toolkit" ? "mjs" : kind === "csv" ? "csv" : "json",
        ok = downloadTextFile(
          source,
          `queue-${kind}.${ext}`,
          kind === "toolkit"
            ? "text/javascript"
            : kind === "csv"
              ? "text/csv"
              : "application/json",
        );
      setFeedback({
        key: ok ? "queue.downloaded" : "queue.error.download",
        error: !ok,
      });
    });
  }
  const actions = (
    items: { key: TranslationKey; action: () => void; disabled?: boolean }[],
  ) => (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button
          type="button"
          className={buttonClass}
          key={i.key}
          disabled={busy || i.disabled}
          onClick={i.action}
        >
          {t(i.key)}
        </button>
      ))}
    </div>
  );
  const upload = (traffic: boolean) => (
    <label className="block text-xs font-semibold">
      {t(traffic ? "queue.ndjson" : "queue.import")}
      <input
        type="file"
        aria-label={t(traffic ? "queue.ndjson" : "queue.import")}
        className={inputClass}
        accept={
          traffic
            ? ".ndjson,.jsonl,application/x-ndjson"
            : ".json,application/json"
        }
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void importFile(f, traffic);
        }}
      />
    </label>
  );
  const metrics = (s: ReturnType<typeof summarizeQueue>) => (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {(
        [
          "retained",
          "ready",
          "delayed",
          "leased",
          "done",
          "dead",
          "expired",
          "cancelled",
          "oldestReadyAgeMs",
        ] as const
      ).map((k) => (
        <div key={k} className="rounded-lg bg-slate-50 p-2 text-xs">
          <span>{t(`queue.metric.${k}`)}</span>
          <strong className="block text-base">{s[k]}</strong>
        </div>
      ))}
      {(["rejected", "retried"] as const).map((k) => (
        <div key={k} className="rounded-lg bg-slate-50 p-2 text-xs">
          <span>{t(`queue.metric.${k}`)}</span>
          <strong className="block text-base">{s.metrics[k]}</strong>
        </div>
      ))}
    </div>
  );
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("queue.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("queue.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("queue.guide")}
            </summary>
            {(
              [
                "queue.semantics",
                "queue.leases",
                "queue.retries",
                "queue.privacy",
                "queue.limits",
              ] as const
            ).map((k) => (
              <p key={k}>{t(k)}</p>
            ))}
          </details>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className="text-sm font-semibold"
            >
              {t(feedback.key, feedback.values)}
            </p>
          )}
          {busy && (
            <div className="flex items-center gap-3">
              <p role="status">
                {t("queue.busy", {
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
                  setFeedback({ key: "queue.cancelled" });
                }}
              >
                {t("queue.cancel")}
              </button>
            </div>
          )}
          {pending && (
            <p className="text-xs font-semibold text-amber-800">
              {t("queue.pending")}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            {actions([
              {
                key: "queue.new",
                action: () => {
                  if (ready())
                    attempt(() => install(emptyQueueProject(), "", true));
                },
              },
              {
                key: "queue.demo",
                action: () => {
                  if (ready())
                    attempt(() => install(demoQueueProject(), "", true));
                },
              },
              { key: "queue.export", action: () => download("project") },
            ])}
            {upload(false)}
            <Field
              label={t("queue.name")}
              value={draft.name}
              onChange={(v) => edit("name", v)}
            />
            {actions([
              { key: "queue.save", action: save, disabled: !pending },
              {
                key: "queue.discard",
                action: () => {
                  setDraft(saved);
                  setFeedback(null);
                },
                disabled: !pending,
              },
            ])}
            <div className="grid gap-5 xl:grid-cols-2">
              <section
                aria-label={t("queue.policy")}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <h3 className="font-bold">{t("queue.policy")}</h3>
                <Field
                  label={t("queue.policyName")}
                  value={draft.policyName}
                  onChange={(v) => edit("policyName", v)}
                />
                <Select
                  label={t("queue.order")}
                  value={draft.order}
                  onChange={(v) => edit("order", v as QueueDefinition["order"])}
                >
                  <option value="fifo">{t("queue.fifo")}</option>
                  <option value="priority">{t("queue.priorityOrder")}</option>
                </Select>
                <Check
                  label={t("queue.groups")}
                  checked={draft.serialGroups}
                  onChange={(v) => edit("serialGroups", v)}
                />
                {policyFields.map(({ key, label }) => (
                  <Field
                    key={key}
                    label={t(label)}
                    value={draft[key]}
                    onChange={(v) => edit(key, v)}
                  />
                ))}
                {actions([
                  { key: "queue.toolkit", action: () => download("toolkit") },
                  { key: "queue.openapi", action: () => download("openapi") },
                ])}
                <p className="text-xs text-slate-600">
                  {t("queue.exportHelp")}
                </p>
              </section>
              <section
                aria-label={t("queue.scenarios")}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <h3 className="font-bold">{t("queue.scenarios")}</h3>
                {!!project.scenarios.length && (
                  <Select
                    label={t("queue.scenario")}
                    value={scenarioId}
                    onChange={selectCase}
                  >
                    {project.scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </Select>
                )}
                {actions([
                  {
                    key: "queue.add",
                    action: () => caseAction("add"),
                    disabled: project.scenarios.length >= 12,
                  },
                  {
                    key: "queue.clone",
                    action: () => caseAction("clone"),
                    disabled: !scenario || project.scenarios.length >= 12,
                  },
                  {
                    key: "queue.delete",
                    action: () => caseAction("delete"),
                    disabled: !scenario,
                  },
                ])}
                {scenario ? (
                  <>
                    <Field
                      label={t("queue.scenarioName")}
                      value={draft.scenarioName}
                      onChange={(v) => edit("scenarioName", v)}
                    />
                    <Field
                      label={t("queue.steps")}
                      value={draft.steps}
                      onChange={(v) => edit("steps", v)}
                      multiline
                    />
                    <Field
                      label={t("queue.expect")}
                      value={draft.expect}
                      onChange={(v) => edit("expect", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("queue.caseHelp")}
                    </p>
                  </>
                ) : (
                  <p>{t("queue.empty")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || !scenario}
                    onClick={() => void run(false)}
                  >
                    {t("queue.run")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || !project.scenarios.length}
                    onClick={() => void run(true)}
                  >
                    {t("queue.runAll")}
                  </button>
                </div>
                {upload(true)}
                <p className="text-xs text-slate-600">
                  {t("queue.ndjsonHelp")}
                </p>
                <details className="space-y-2">
                  <summary className="cursor-pointer text-sm font-bold">
                    {t("queue.generator")}
                  </summary>
                  <Field
                    label={t("queue.generatorSettings")}
                    value={generator}
                    onChange={setGenerator}
                    multiline
                  />
                  <p className="text-xs text-slate-600">
                    {t("queue.generatorHelp")}
                  </p>
                  {actions([
                    {
                      key: "queue.generate",
                      disabled: project.scenarios.length >= 12,
                      action: () => {
                        if (ready())
                          attempt(() => {
                            const id = nextId(),
                              s = generateQueueScenario(
                                queueJson(generator),
                                id,
                              );
                            install(
                              {
                                ...project,
                                scenarios: [...project.scenarios, s],
                              },
                              id,
                            );
                            setFeedback({ key: "queue.imported" });
                          });
                      },
                    },
                  ])}
                </details>
              </section>
            </div>
            <section aria-label={t("queue.playground")} className="space-y-4">
              <h3 className="font-bold">{t("queue.playground")}</h3>
              <p className="text-xs text-slate-600">{t("queue.recordHelp")}</p>
              <p className="text-sm font-semibold">
                {t("queue.time")}: {summary.nowMs}
              </p>
              {metrics(summary)}
              {actions([
                {
                  key: "queue.reset",
                  action: () => {
                    if (ready()) {
                      reset();
                      setFeedback(null);
                    }
                  },
                },
                {
                  key: "queue.record",
                  disabled:
                    !runtime.steps.length || project.scenarios.length >= 12,
                  action: () => {
                    if (ready())
                      attempt(() => {
                        const id = nextId(),
                          s = recordQueueScenario(
                            id,
                            id,
                            runtime.steps,
                            runtime.snapshot.instanceId,
                            runtime.snapshot,
                          );
                        install(
                          { ...project, scenarios: [...project.scenarios, s] },
                          id,
                        );
                        setFeedback({
                          key: "queue.recorded",
                          values: { count: String(runtime.steps.length) },
                        });
                      });
                  },
                },
              ])}
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
                  {(
                    [
                      { key: "queue.jobId", value: jobId, set: setJobId },
                      { key: "queue.jobName", value: jobName, set: setJobName },
                      { key: "queue.group", value: group, set: setGroup },
                      {
                        key: "queue.priority",
                        value: priority,
                        set: setPriority,
                      },
                      { key: "queue.delay", value: delay, set: setDelay },
                    ] as const
                  ).map((f) => (
                    <Field
                      key={f.key}
                      label={t(f.key)}
                      value={f.value}
                      onChange={f.set}
                    />
                  ))}
                  <Field
                    label={t("queue.payload")}
                    value={payload}
                    onChange={setPayload}
                    multiline
                  />
                  {actions([
                    {
                      key: "queue.enqueue",
                      action: () =>
                        attempt(() =>
                          apply({
                            type: "enqueue",
                            job: {
                              id: jobId,
                              name: jobName,
                              group,
                              priority: integer(priority),
                              delayMs: integer(delay),
                              payload: queueJson(payload),
                            },
                          }),
                        ),
                    },
                  ])}
                </div>
                <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
                  <Field
                    label={t("queue.worker")}
                    value={worker}
                    onChange={setWorker}
                  />
                  <Field
                    label={t("queue.pollLimit")}
                    value={limit}
                    onChange={setLimit}
                  />
                  {actions([
                    {
                      key: "queue.poll",
                      action: () =>
                        apply({ type: "poll", worker, limit: integer(limit) }),
                    },
                  ])}
                  <Select
                    label={t("queue.selectedJob")}
                    value={job?.id ?? ""}
                    onChange={chooseJob}
                  >
                    <option value="">—</option>
                    {runtime.snapshot.jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name} ({j.id})
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("queue.receipt")}
                    value={receipt}
                    onChange={setReceipt}
                  />
                  {actions([
                    {
                      key: "queue.currentLease",
                      disabled: !job?.lease,
                      action: () => chooseJob(selectedJob),
                    },
                    ...(
                      [
                        { type: "ack", key: "queue.ack" },
                        { type: "nack", key: "queue.nack" },
                        { type: "heartbeat", key: "queue.heartbeat" },
                      ] as const
                    ).map((a) => ({
                      key: a.key,
                      disabled: !job,
                      action: () =>
                        apply({
                          type: a.type,
                          job: selectedJob,
                          worker,
                          receipt,
                        }),
                    })),
                    {
                      key: "queue.cancelJob",
                      disabled: !job,
                      action: () => apply({ type: "cancel", job: selectedJob }),
                    },
                    {
                      key: "queue.redrive",
                      disabled: job?.status !== "dead",
                      action: () =>
                        apply({
                          type: "redrive",
                          job: selectedJob,
                          delayMs: integer(delay),
                        }),
                    },
                  ])}
                  <Field
                    label={t("queue.advanceMs")}
                    value={advanceMs}
                    onChange={setAdvanceMs}
                  />
                  {actions([
                    {
                      key: "queue.advance",
                      action: () =>
                        apply({ type: "advance", ms: integer(advanceMs) }),
                    },
                    {
                      key: "queue.purge",
                      action: () => apply({ type: "purge" }),
                    },
                  ])}
                </div>
              </div>
              <details className="space-y-3">
                <summary className="cursor-pointer text-sm font-bold">
                  {t("queue.command")}
                </summary>
                <Field
                  label={t("queue.command")}
                  value={command}
                  onChange={setCommand}
                  multiline
                />
                {actions([
                  {
                    key: "queue.apply",
                    action: () => attempt(() => apply(queueJson(command))),
                  },
                ])}
              </details>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t("queue.search")}
                  value={search}
                  onChange={setSearch}
                  onEscape={() => setSearch("")}
                />
                <Select
                  label={t("queue.filter")}
                  value={filter}
                  onChange={setFilter}
                >
                  <option value="all">{t("queue.all")}</option>
                  {(
                    [
                      "queued",
                      "leased",
                      "done",
                      "dead",
                      "expired",
                      "cancelled",
                    ] as const
                  ).map((s) => (
                    <option key={s} value={s}>
                      {t(`queue.status.${s}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="max-h-96 overflow-auto">
                <table
                  className="w-full text-left text-xs"
                  aria-label={t("queue.jobs")}
                >
                  <thead>
                    <tr>
                      <th>{t("queue.job")}</th>
                      <th>{t("queue.status")}</th>
                      <th>{t("queue.delivery")}</th>
                      <th>{t("queue.lease")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runtime.snapshot.jobs
                      .filter(
                        (j) =>
                          (filter === "all" || j.status === filter) &&
                          `${j.id} ${j.name}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((j) => (
                        <tr key={j.id}>
                          <td className="p-2">
                            <button
                              type="button"
                              className="underline"
                              onClick={() => chooseJob(j.id)}
                            >
                              {j.name} ({j.id})
                            </button>
                          </td>
                          <td>
                            {t(`queue.status.${j.status}`)}
                            {j.status === "queued"
                              ? ` (${t(j.availableMs > summary.nowMs ? "queue.status.delayed" : "queue.status.ready")})`
                              : ""}
                          </td>
                          <td>
                            {j.attempts} / {j.deliveries}
                          </td>
                          <td>
                            {j.lease
                              ? `${j.lease.worker} / ${j.lease.receipt} / ${j.lease.untilMs}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {job && (
                <details>
                  <summary className="cursor-pointer text-sm font-bold">
                    {t("queue.selectedDetails")}
                  </summary>
                  <pre
                    className="max-h-80 overflow-auto bg-slate-50 p-3 text-xs"
                    aria-label={t("queue.selectedDetails")}
                  >
                    {json(job)}
                  </pre>
                </details>
              )}
              {!!runtime.points.length && (
                <QueueChart
                  points={runtime.points}
                  index={Math.min(liveIndex, runtime.points.length - 1)}
                  onSelect={setLiveIndex}
                />
              )}
              {!!runtime.points.length && (
                <pre className="max-h-60 overflow-auto bg-slate-50 p-3 text-xs">
                  {json(
                    runtime.points[
                      Math.min(liveIndex, runtime.points.length - 1)
                    ],
                  )}
                </pre>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-bold">
                  {t("queue.journal")}
                </summary>
                <p className="text-xs">
                  {t("queue.dropped", {
                    count: String(runtime.snapshot.journalDropped),
                  })}
                </p>
                <pre
                  className="max-h-96 overflow-auto bg-slate-50 p-3 text-xs"
                  aria-label={t("queue.journal")}
                >
                  {json(runtime.snapshot.journal)}
                </pre>
              </details>
            </section>
            {runs && (
              <section className="space-y-3">
                <h3 className="font-bold">{t("queue.results")}</h3>
                <div className="overflow-auto">
                  <table
                    className="w-full text-left text-xs"
                    aria-label={t("queue.results")}
                  >
                    <thead>
                      <tr>
                        <th>{t("queue.scenarioName")}</th>
                        <th>{t("queue.status")}</th>
                        <th>{t("queue.metric.rejected")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.scenarioId}>
                          <td className="p-2">
                            <button
                              type="button"
                              className="underline"
                              onClick={() => {
                                setResultId(r.scenarioId);
                                setPointIndex(
                                  Math.max(0, r.timeline.length - 1),
                                );
                              }}
                            >
                              {r.scenarioName}
                            </button>
                          </td>
                          <td>
                            {t(
                              !r.checked
                                ? "queue.unchecked"
                                : r.passed
                                  ? "queue.passed"
                                  : "queue.failed",
                            )}
                          </td>
                          <td>{r.summary.metrics.rejected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {inspected && (
                  <>
                    <Select
                      label={t("queue.result")}
                      value={resultId}
                      onChange={(id) => {
                        setResultId(id);
                        setPointIndex(0);
                      }}
                    >
                      {runs.map((r) => (
                        <option key={r.scenarioId} value={r.scenarioId}>
                          {r.scenarioName} ({r.scenarioId})
                        </option>
                      ))}
                    </Select>
                    {metrics(point?.summary ?? inspected.summary)}
                    {point && (
                      <>
                        <label className="block text-xs font-semibold">
                          {t("queue.point")}
                          <input
                            type="range"
                            aria-label={t("queue.point")}
                            className="mt-2 w-full"
                            min={0}
                            max={inspected.timeline.length - 1}
                            step={1}
                            value={index}
                            onChange={(e) =>
                              setPointIndex(Number(e.target.value))
                            }
                          />
                        </label>
                        <QueueChart
                          points={inspected.timeline}
                          index={index}
                          onSelect={setPointIndex}
                        />
                        <pre
                          className="max-h-80 overflow-auto bg-slate-50 p-3 text-xs"
                          aria-label={t("queue.pointDetails")}
                        >
                          {json(point)}
                        </pre>
                      </>
                    )}
                    <details>
                      <summary className="cursor-pointer text-sm font-bold">
                        {t("queue.finalJobs")}
                      </summary>
                      <pre className="max-h-96 overflow-auto bg-slate-50 p-3 text-xs">
                        {json(inspected.snapshot.jobs)}
                      </pre>
                    </details>
                    {actions([
                      { key: "queue.csv", action: () => download("csv") },
                    ])}
                  </>
                )}
                <Check
                  label={t("queue.details")}
                  checked={details}
                  onChange={setDetails}
                />
                {actions([
                  { key: "queue.report", action: () => download("report") },
                ])}
              </section>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
