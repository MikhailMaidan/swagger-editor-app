"use client";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import {
  MAX_SYNC_PROJECT,
  MAX_SYNC_STATE,
  SyncError,
  normalizeSyncState,
  syncJson,
  type SyncDefinition,
} from "@/lib/sync-model";
import {
  emptySyncProject,
  newSyncScenario,
  normalizeSyncProject,
  parseSyncProject,
  serializeSyncProject,
  type SyncProject,
} from "@/lib/sync-project";
import {
  createSyncLab,
  stepSyncLab,
  summarizeSyncLab,
  type SyncLab,
} from "@/lib/sync-engine";
import {
  checkSyncMergeLaws,
  demoSyncProject,
  replaySyncSteps,
  runSyncScenarios,
  syncRunReport,
  type SyncRun,
} from "@/lib/sync-studio";
import { generateSyncOpenApi, generateSyncToolkit } from "@/lib/sync-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => JSON.stringify(v, null, 2),
  inputClass =
    "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs",
  buttonClass =
    "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:opacity-50";
function drafts(p: SyncProject, id: string) {
  const s = p.scenarios.find((s) => s.id === id);
  return {
    name: p.name,
    document: p.definition.documentId,
    actors: json(p.definition.actors),
    fields: json(p.definition.fields),
    links: json(p.definition.links),
    scenarioName: s?.name ?? "",
    steps: json(s?.steps ?? []),
    expect: json(s?.expect ?? null),
  };
}
type Draft = ReturnType<typeof drafts>;
function initialRuntime() {
  const d = emptySyncProject().definition,
    lab = createSyncLab(d);
  return { lab, summary: summarizeSyncLab(d, lab) };
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  onEscape,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  onEscape?: () => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea
          className={`${inputClass} font-mono`}
          rows={6}
          spellCheck={false}
          value={value}
          readOnly={!onChange}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onEscape?.();
          }}
        />
      ) : (
        <input
          className={inputClass}
          autoComplete="off"
          value={value}
          readOnly={!onChange}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onEscape?.();
          }}
        />
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
function Topology({
  definition,
  lab,
  label,
  actor,
}: {
  definition: SyncDefinition;
  lab: SyncLab;
  label: string;
  actor: string;
}) {
  const points = definition.actors.map((a, i) => ({
    ...a,
    x:
      300 +
      210 *
        Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / definition.actors.length),
    y:
      150 +
      105 *
        Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / definition.actors.length),
  }));
  return (
    <svg
      viewBox="0 0 600 300"
      role="img"
      aria-label={label}
      className="max-h-80 w-full"
    >
      <defs>
        <marker
          id="sync-topology-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed" />
        </marker>
      </defs>
      {lab.links.map((l) => {
        const a = points.find((a) => a.id === l.from)!,
          b = points.find((a) => a.id === l.to)!,
          dx = b.x - a.x,
          dy = b.y - a.y,
          n = Math.hypot(dx, dy),
          x1 = a.x + (dx / n) * 23,
          y1 = a.y + (dy / n) * 23,
          x2 = b.x - (dx / n) * 23,
          y2 = b.y - (dy / n) * 23,
          cx = (a.x + b.x) / 2 - (dy / n) * 16,
          cy = (a.y + b.y) / 2 + (dx / n) * 16,
          count = lab.messages.filter(
            (m) => m.from === l.from && m.to === l.to,
          ).length;
        return (
          <g key={JSON.stringify(l)}>
            <path
              d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`}
              fill="none"
              stroke="#7c3aed"
              strokeWidth="1.5"
              markerEnd="url(#sync-topology-arrow)"
            />
            {count > 0 && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                fill="#b45309"
                fontSize="12"
              >
                {count}
              </text>
            )}
          </g>
        );
      })}
      {points.map((a) => (
        <g key={a.id}>
          <circle
            cx={a.x}
            cy={a.y}
            r="22"
            fill={a.id === actor ? "#ede9fe" : "#f8fafc"}
            stroke="#7c3aed"
            strokeWidth={a.id === actor ? 3 : 1}
          />
          <text x={a.x} y={a.y + 4} textAnchor="middle" fontSize="10">
            {a.id.slice(0, 7)}
          </text>
          <text x={a.x} y={a.y + 39} textAnchor="middle" fontSize="12">
            {a.name.slice(0, 20)}
          </text>
        </g>
      ))}
    </svg>
  );
}
export const SyncPanel = memo(function SyncPanel() {
  const { t } = useI18n(),
    [open, setOpen] = useState(false),
    [project, setProject] = useState(emptySyncProject),
    [scenarioId, setScenarioId] = useState("scenario-1"),
    [draft, setDraft] = useState(() =>
      drafts(emptySyncProject(), "scenario-1"),
    ),
    [saved, setSaved] = useState(() =>
      drafts(emptySyncProject(), "scenario-1"),
    ),
    [runtime, setRuntime] = useState(initialRuntime);
  const [actor, setActor] = useState("alpha"),
    [field, setField] = useState("count"),
    [operation, setOperation] = useState("increment"),
    [amount, setAmount] = useState("1"),
    [value, setValue] = useState('"draft"'),
    [from, setFrom] = useState("alpha"),
    [to, setTo] = useState("beta"),
    [message, setMessage] = useState(""),
    [recordName, setRecordName] = useState("Recorded synchronization");
  const [lawActors, setLawActors] = useState(["alpha", "beta", "gamma"]),
    [laws, setLaws] = useState<Awaited<
      ReturnType<typeof checkSyncMergeLaws>
    > | null>(null),
    [runs, setRuns] = useState<SyncRun[] | null>(null),
    [resultId, setResultId] = useState(""),
    [search, setSearch] = useState(""),
    [details, setDetails] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error?: boolean;
      values?: Record<string, string>;
    } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const d = project.definition,
    scenario = project.scenarios.find((s) => s.id === scenarioId),
    pending = (Object.keys(draft) as (keyof Draft)[]).some(
      (k) => draft[k] !== saved[k],
    ),
    fieldType = d.fields.find((f) => f.id === field)!.type,
    operations =
      fieldType === "counter"
        ? ["increment"]
        : fieldType === "set"
          ? ["add", "remove"]
          : ["assign", "clear"],
    op = operations.includes(operation) ? operation : operations[0],
    inspected = runs?.find((r) => r.scenarioId === resultId);
  function edit<K extends keyof Draft>(key: K, v: Draft[K]) {
    setDraft({ ...draft, [key]: v });
  }
  function error(e: unknown) {
    setFeedback({
      key:
        e instanceof SyncError
          ? e.code === "cancelled"
            ? "sync.cancelled"
            : `sync.error.${e.code}`
          : "sync.error.unknown",
      error: true,
    });
  }
  function attempt(action: () => void) {
    try {
      action();
    } catch (e) {
      error(e);
    }
  }
  function ready() {
    if (busy) return false;
    if (pending) {
      setFeedback({ key: "sync.pending", error: true });
      return false;
    }
    return true;
  }
  function install(value: SyncProject, lab: SyncLab, prefer = scenarioId) {
    const p = normalizeSyncProject(value),
      id =
        p.scenarios.find((s) => s.id === prefer)?.id ??
        p.scenarios[0]?.id ??
        "",
      next = drafts(p, id);
    setProject(p);
    setScenarioId(id);
    setDraft(next);
    setSaved(next);
    setRuntime({ lab, summary: summarizeSyncLab(p.definition, lab) });
    setRuns(null);
    setResultId("");
    setLaws(null);
    setSearch("");
    setFeedback(null);
    setActor(
      p.definition.actors.find((a) => a.id === actor)?.id ??
        p.definition.actors[0].id,
    );
    setField(
      p.definition.fields.find((f) => f.id === field)?.id ??
        p.definition.fields[0].id,
    );
    setFrom(
      p.definition.actors.find((a) => a.id === from)?.id ??
        p.definition.actors[0].id,
    );
    setTo(
      p.definition.actors.find((a) => a.id === to)?.id ??
        p.definition.actors[1]?.id ??
        p.definition.actors[0].id,
    );
    setLawActors(
      lawActors.map(
        (a, i) =>
          p.definition.actors.find((x) => x.id === a)?.id ??
          p.definition.actors[i]?.id ??
          p.definition.actors[0].id,
      ),
    );
    setMessage(lab.messages[0]?.id ?? "");
  }
  function commitStep(input: unknown) {
    const lab = stepSyncLab(d, runtime.lab, input),
      p = normalizeSyncProject({ ...project, playground: lab.steps }),
      summary = summarizeSyncLab(d, lab);
    setProject(p);
    setRuntime({ lab, summary });
    setLaws(null);
    setMessage(
      lab.messages.some((m) => m.id === message)
        ? message
        : (lab.messages[0]?.id ?? ""),
    );
    const status = lab.journal.at(-1)!.status;
    setFeedback({
      key: "sync.stepResult",
      values: { status: t(`sync.status.${status}`) },
      error: !["applied", "unchanged"].includes(status),
    });
  }
  function apply(input: unknown) {
    if (ready()) attempt(() => commitStep(input));
  }
  function local() {
    if (!ready()) return;
    attempt(() => {
      const parsedAmount = /^-?\d+$/.test(amount.trim()) ? Number(amount) : NaN;
      commitStep(
        op === "increment"
          ? { type: op, actor, field, amount: parsedAmount }
          : op === "clear"
            ? { type: op, actor, field }
            : { type: op, actor, field, value: syncJson(value) },
      );
    });
  }
  function reset() {
    if (!ready()) return;
    attempt(() => {
      const lab = createSyncLab(d),
        p = normalizeSyncProject({ ...project, playground: [] });
      setProject(p);
      setRuntime({ lab, summary: summarizeSyncLab(d, lab) });
      setMessage("");
      setLaws(null);
      setFeedback(null);
    });
  }
  function scenarioAction(mode: "add" | "clone" | "delete" | "record") {
    if (!ready()) return;
    attempt(() => {
      if (mode === "delete") {
        install(
          {
            ...project,
            scenarios: project.scenarios.filter((s) => s.id !== scenarioId),
          },
          runtime.lab,
        );
        return;
      }
      let n = 1;
      while (project.scenarios.some((s) => s.id === `scenario-${n}`)) n++;
      const id = `scenario-${n}`,
        s =
          mode === "clone"
            ? { ...scenario!, id, name: id }
            : mode === "record"
              ? {
                  id,
                  name: recordName,
                  steps: runtime.lab.steps,
                  expect: {
                    converged: runtime.summary.converged,
                    maxRejected: runtime.summary.rejected,
                    maxConflicts: runtime.summary.conflicts,
                  },
                }
              : newSyncScenario(id);
      install(
        { ...project, scenarios: [...project.scenarios, s] },
        runtime.lab,
        id,
      );
      if (mode === "record") setFeedback({ key: "sync.recorded" });
    });
  }
  async function execute(
    kind: "save" | "new" | "demo" | "selected" | "suite" | "laws" | "load",
  ) {
    if (kind === "save" ? busy : !ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      if (kind === "selected" || kind === "suite") {
        const rows = await runSyncScenarios(
          project,
          kind === "selected" ? scenarioId : undefined,
          cancelled,
          (done, total) => {
            if (!cancelled()) setProgress({ done, total });
          },
        );
        if (cancelled()) return;
        setRuns(rows);
        setResultId(rows[0]?.scenarioId ?? "");
        setFeedback({
          key: "sync.completed",
          values: {
            passed: String(rows.filter((r) => r.passed).length),
            checked: String(rows.filter((r) => r.checked).length),
            total: String(rows.length),
          },
        });
      } else if (kind === "laws") {
        const result = await checkSyncMergeLaws(
          d,
          runtime.lab,
          lawActors,
          cancelled,
        );
        if (!cancelled()) setLaws(result);
      } else {
        let p: SyncProject;
        if (kind === "save")
          p = normalizeSyncProject({
            ...project,
            name: draft.name,
            definition: {
              documentId: draft.document,
              actors: syncJson(draft.actors),
              fields: syncJson(draft.fields),
              links: syncJson(draft.links),
            },
            scenarios: project.scenarios.map((s) =>
              s.id === scenarioId
                ? {
                    ...s,
                    name: draft.scenarioName,
                    steps: syncJson(draft.steps),
                    expect: syncJson(draft.expect),
                  }
                : s,
            ),
          });
        else if (kind === "new") p = emptySyncProject();
        else if (kind === "demo") p = demoSyncProject();
        else {
          if (!inspected?.snapshot) throw new SyncError("definition");
          p = normalizeSyncProject({
            ...project,
            playground: inspected.snapshot.steps,
          });
        }
        const lab = await replaySyncSteps(
          p.definition,
          p.playground,
          cancelled,
          (done, total) => {
            if (!cancelled()) setProgress({ done, total });
          },
        );
        if (cancelled()) return;
        install(
          p,
          lab,
          kind === "new" || kind === "demo"
            ? (p.scenarios[0]?.id ?? "")
            : scenarioId,
        );
        setFeedback({ key: kind === "save" ? "sync.saved" : "sync.loaded" });
      }
    } catch (e) {
      if (!cancelled()) error(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  async function importFile(file: File | undefined, wire: boolean) {
    if (!file || !ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      if (file.size > (wire ? MAX_SYNC_STATE : MAX_SYNC_PROJECT))
        throw new SyncError("limit");
      const source = await file.text();
      if (cancelled()) return;
      if (wire) {
        const state = normalizeSyncState(d, syncJson(source, MAX_SYNC_STATE));
        commitStep({ type: "merge", actor, state });
      } else {
        const p = parseSyncProject(source),
          lab = await replaySyncSteps(
            p.definition,
            p.playground,
            cancelled,
            (done, total) => {
              if (!cancelled()) setProgress({ done, total });
            },
          );
        if (cancelled()) return;
        install(p, lab, p.scenarios[0]?.id ?? "");
        setFeedback({ key: "sync.loaded" });
      }
    } catch (e) {
      if (!cancelled()) error(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  function download(
    kind: "project" | "wire" | "report" | "toolkit" | "openapi",
  ) {
    if (!ready()) return;
    attempt(() => {
      let source: string;
      if (kind === "project") source = serializeSyncProject(project);
      else if (kind === "wire") {
        const state = normalizeSyncState(d, runtime.lab.states[actor]),
          pretty = json(state);
        source =
          getByteSize(pretty) <= MAX_SYNC_STATE
            ? pretty
            : JSON.stringify(state);
      } else if (kind === "toolkit") source = generateSyncToolkit(d);
      else if (kind === "openapi") source = json(generateSyncOpenApi(d));
      else {
        const s = runtime.summary;
        source = json({
          ...syncRunReport(runs ?? [], details),
          playground: {
            steps: runtime.lab.steps.length,
            converged: s.converged,
            viewsEqual: s.viewsEqual,
            conflicts: s.conflicts,
            rejected: s.rejected,
            queued: s.queued,
            sent: runtime.lab.sent,
            delivered: runtime.lab.delivered,
            dropped: runtime.lab.dropped,
            ...(details ? { journal: runtime.lab.journal } : {}),
          },
          laws,
        });
      }
      if (getByteSize(source) > 16 * 1024 * 1024) throw new SyncError("limit");
      const ok = downloadTextFile(
        source,
        `synchronization-${kind}.${kind === "toolkit" ? "mjs" : "json"}`,
        kind === "toolkit" ? "text/javascript" : "application/json",
      );
      setFeedback({
        key: ok ? "sync.downloaded" : "sync.error.download",
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
  const actorOptions = d.actors.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} ({a.id})
    </option>
  ));
  const upload = (wire: boolean) => (
    <label className="block text-xs font-semibold">
      {t(wire ? "sync.wireImport" : "sync.import")}
      <input
        type="file"
        accept=".json,application/json"
        aria-label={t(wire ? "sync.wireImport" : "sync.import")}
        className={inputClass}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void importFile(file, wire);
        }}
      />
    </label>
  );
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("sync.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("sync.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("sync.guide")}
            </summary>
            {(
              [
                "sync.semantics",
                "sync.ownership",
                "sync.networkHelp",
                "sync.convergenceHelp",
                "sync.limits",
                "sync.privacy",
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
                {t("sync.busy", {
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
                  setFeedback({ key: "sync.cancelled" });
                }}
              >
                {t("sync.cancel")}
              </button>
            </div>
          )}
          {pending && (
            <p className="text-xs font-semibold text-amber-800">
              {t("sync.pending")}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => void execute("new")}
              >
                {t("sync.new")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void execute("demo")}
              >
                {t("sync.demo")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => download("project")}
              >
                {t("sync.export")}
              </button>
            </div>
            {upload(false)}
            <Field
              label={t("sync.name")}
              value={draft.name}
              onChange={(v) => edit("name", v)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!pending}
                onClick={() => void execute("save")}
              >
                {t("sync.save")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!pending}
                onClick={() => {
                  setDraft(saved);
                  setFeedback(null);
                }}
              >
                {t("sync.discard")}
              </button>
            </div>
            <details className="space-y-3">
              <summary className="cursor-pointer font-bold">
                {t("sync.definition")}
              </summary>
              <Field
                label={t("sync.document")}
                value={draft.document}
                onChange={(v) => edit("document", v)}
              />
              <div className="grid gap-3 xl:grid-cols-3">
                <Field
                  label={t("sync.actors")}
                  value={draft.actors}
                  onChange={(v) => edit("actors", v)}
                  multiline
                />
                <Field
                  label={t("sync.fields")}
                  value={draft.fields}
                  onChange={(v) => edit("fields", v)}
                  multiline
                />
                <Field
                  label={t("sync.links")}
                  value={draft.links}
                  onChange={(v) => edit("links", v)}
                  multiline
                />
              </div>
              <p className="text-xs text-slate-600">
                {t("sync.definitionHelp")}
              </p>
            </details>
            <section
              className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-3"
              aria-label={t("sync.playground")}
            >
              <h3 className="font-bold">{t("sync.playground")}</h3>
              <p className="text-sm font-bold">
                {t(
                  runtime.summary.converged
                    ? "sync.converged"
                    : "sync.diverged",
                )}{" "}
                ·{" "}
                {t(
                  runtime.summary.viewsEqual
                    ? "sync.viewsEqual"
                    : "sync.viewsDiffer",
                )}
              </p>
              <p className="text-xs">
                {t("sync.stats", {
                  steps: String(runtime.lab.steps.length),
                  queued: String(runtime.summary.queued),
                  sent: String(runtime.lab.sent),
                  delivered: String(runtime.lab.delivered),
                  dropped: String(runtime.lab.dropped),
                  rejected: String(runtime.summary.rejected),
                  conflicts: String(runtime.summary.conflicts),
                })}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Select
                  label={t("sync.actor")}
                  value={actor}
                  onChange={setActor}
                >
                  {actorOptions}
                </Select>
                <Select
                  label={t("sync.field")}
                  value={field}
                  onChange={setField}
                >
                  {d.fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.type})
                    </option>
                  ))}
                </Select>
                <Select
                  label={t("sync.operation")}
                  value={op}
                  onChange={setOperation}
                >
                  {operations.map((o) => (
                    <option key={o} value={o}>
                      {t(`sync.op.${o}` as TranslationKey)}
                    </option>
                  ))}
                </Select>
              </div>
              {op === "increment" ? (
                <Field
                  label={t("sync.amount")}
                  value={amount}
                  onChange={setAmount}
                />
              ) : (
                op !== "clear" && (
                  <Field
                    label={t("sync.value")}
                    value={value}
                    onChange={setValue}
                    multiline
                  />
                )
              )}
              {actions([
                { key: "sync.apply", action: local },
                { key: "sync.reset", action: reset },
                { key: "sync.round", action: () => apply({ type: "round" }) },
              ])}
              <div className="grid gap-3 xl:grid-cols-3">
                {d.actors.map((a) => (
                  <section
                    key={a.id}
                    aria-label={t("sync.view", { name: a.name, id: a.id })}
                    className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <h4 className="font-bold">
                      {a.name} ({a.id})
                    </h4>
                    {d.fields.map((f) => {
                      const v = runtime.summary.views[a.id][f.id];
                      return (
                        <div key={f.id} className="mt-2 text-xs">
                          <span className="font-semibold">{f.name}</span>
                          {v.type === "register" && v.conflict && (
                            <span className="ml-2 font-bold text-amber-800">
                              {t("sync.conflict")}
                            </span>
                          )}
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono">
                            {json(v.type === "counter" ? v.value : v.values)}
                          </pre>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
              <Topology
                definition={d}
                lab={runtime.lab}
                label={t("sync.topology")}
                actor={actor}
              />
              <div className="overflow-auto">
                <table
                  className="w-full text-left text-xs"
                  aria-label={t("sync.linkMatrix")}
                >
                  <thead>
                    <tr>
                      <th />
                      <>
                        {d.actors.map((a) => (
                          <th className="p-2" key={a.id}>
                            {a.name}
                          </th>
                        ))}
                      </>
                    </tr>
                  </thead>
                  <tbody>
                    {d.actors.map((a) => (
                      <tr key={a.id}>
                        <th className="p-2">{a.name}</th>
                        {d.actors.map((b) => (
                          <td className="p-2" key={b.id}>
                            {a.id === b.id ? (
                              "—"
                            ) : (
                              <input
                                type="checkbox"
                                aria-label={t("sync.link", {
                                  from: a.name,
                                  to: b.name,
                                })}
                                checked={runtime.lab.links.some(
                                  (l) => l.from === a.id && l.to === b.id,
                                )}
                                onChange={(e) =>
                                  apply({
                                    type: "link",
                                    from: a.id,
                                    to: b.id,
                                    enabled: e.target.checked,
                                  })
                                }
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label={t("sync.from")} value={from} onChange={setFrom}>
                  {actorOptions}
                </Select>
                <Select label={t("sync.to")} value={to} onChange={setTo}>
                  {actorOptions}
                </Select>
              </div>
              {actions([
                {
                  key: "sync.send",
                  action: () => apply({ type: "send", from, to }),
                  disabled: from === to,
                },
              ])}
              {runtime.lab.messages.length ? (
                <Select
                  label={t("sync.message")}
                  value={message}
                  onChange={setMessage}
                >
                  {runtime.lab.messages.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}: {m.from} → {m.to}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-xs">{t("sync.noMessages")}</p>
              )}
              {actions([
                {
                  key: "sync.deliver",
                  action: () => apply({ type: "deliver", message }),
                  disabled: !message,
                },
                {
                  key: "sync.duplicate",
                  action: () => apply({ type: "duplicate", message }),
                  disabled: !message,
                },
                {
                  key: "sync.drop",
                  action: () => apply({ type: "drop", message }),
                  disabled: !message,
                },
              ])}
              <details>
                <summary className="cursor-pointer text-sm font-bold">
                  {t("sync.wire")}
                </summary>
                <pre
                  className="max-h-80 overflow-auto bg-slate-50 p-2 text-xs"
                  aria-label={t("sync.wire")}
                >
                  {json(runtime.lab.states[actor])}
                </pre>
              </details>
              {actions([
                { key: "sync.wireExport", action: () => download("wire") },
              ])}
              {upload(true)}
              <p className="text-xs text-slate-600">{t("sync.wireHelp")}</p>
              <Field
                label={t("sync.recordName")}
                value={recordName}
                onChange={setRecordName}
              />
              {actions([
                {
                  key: "sync.record",
                  action: () => scenarioAction("record"),
                  disabled: project.scenarios.length >= 12,
                },
              ])}
              <Field
                label={t("sync.search")}
                value={search}
                onChange={setSearch}
                onEscape={() => setSearch("")}
              />
              <div className="max-h-80 overflow-auto">
                <table
                  className="w-full text-left text-xs"
                  aria-label={t("sync.timeline")}
                >
                  <thead>
                    <tr>
                      <th>{t("sync.index")}</th>
                      <th>{t("sync.type")}</th>
                      <th>{t("sync.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runtime.lab.journal
                      .filter((j) =>
                        `${j.type} ${j.status} ${t(`sync.status.${j.status}`)}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((j) => (
                        <tr key={j.index}>
                          <td className="p-2">{j.index}</td>
                          <td>{j.type}</td>
                          <td>{t(`sync.status.${j.status}`)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="space-y-3" aria-label={t("sync.laws")}>
              <h3 className="font-bold">{t("sync.laws")}</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["sync.lawA", "sync.lawB", "sync.lawC"] as const).map(
                  (k, i) => (
                    <Select
                      key={k}
                      label={t(k)}
                      value={lawActors[i]}
                      onChange={(v) => {
                        setLawActors(
                          lawActors.map((a, j) => (j === i ? v : a)),
                        );
                        setLaws(null);
                      }}
                    >
                      {actorOptions}
                    </Select>
                  ),
                )}
              </div>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void execute("laws")}
              >
                {t("sync.checkLaws")}
              </button>
              {laws && (
                <ul className="text-sm">
                  {laws.map((l) => (
                    <li key={l.law}>
                      {t(`sync.law.${l.law}`)}: {t(`sync.law.${l.status}`)}
                      {l.reason ? ` (${l.reason})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-3" aria-label={t("sync.scenarios")}>
              <h3 className="font-bold">{t("sync.scenarios")}</h3>
              {scenario && (
                <Select
                  label={t("sync.scenario")}
                  value={scenarioId}
                  onChange={(id) => {
                    if (ready()) {
                      setScenarioId(id);
                      const next = drafts(project, id);
                      setDraft(next);
                      setSaved(next);
                    }
                  }}
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
                  key: "sync.addScenario",
                  action: () => scenarioAction("add"),
                  disabled: project.scenarios.length >= 12,
                },
                {
                  key: "sync.cloneScenario",
                  action: () => scenarioAction("clone"),
                  disabled: !scenario || project.scenarios.length >= 12,
                },
                {
                  key: "sync.deleteScenario",
                  action: () => scenarioAction("delete"),
                  disabled: !scenario,
                },
              ])}
              {scenario ? (
                <>
                  <Field
                    label={t("sync.scenarioName")}
                    value={draft.scenarioName}
                    onChange={(v) => edit("scenarioName", v)}
                  />
                  <Field
                    label={t("sync.steps")}
                    value={draft.steps}
                    onChange={(v) => edit("steps", v)}
                    multiline
                  />
                  <Field
                    label={t("sync.expect")}
                    value={draft.expect}
                    onChange={(v) => edit("expect", v)}
                    multiline
                  />
                  <p className="text-xs text-slate-600">
                    {t("sync.expectHelp")}
                  </p>
                </>
              ) : (
                <p>{t("sync.noScenarios")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!scenario}
                  onClick={() => void execute("selected")}
                >
                  {t("sync.run")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!project.scenarios.length}
                  onClick={() => void execute("suite")}
                >
                  {t("sync.runAll")}
                </button>
              </div>
              {runs && (
                <>
                  <div className="overflow-auto">
                    <table
                      className="w-full text-left text-xs"
                      aria-label={t("sync.results")}
                    >
                      <thead>
                        <tr>
                          <th>{t("sync.scenario")}</th>
                          <th>{t("sync.converged")}</th>
                          <th>{t("sync.verdict")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.scenarioId}>
                            <td className="p-2">
                              <button
                                type="button"
                                className="underline"
                                onClick={() => setResultId(r.scenarioId)}
                              >
                                {r.scenarioName}
                              </button>
                            </td>
                            <td>
                              {t(
                                r.converged
                                  ? "sync.converged"
                                  : "sync.diverged",
                              )}
                            </td>
                            <td>
                              {t(
                                !r.checked
                                  ? "sync.unchecked"
                                  : r.passed
                                    ? "sync.passed"
                                    : "sync.failed",
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {inspected && (
                    <>
                      <Select
                        label={t("sync.result")}
                        value={resultId}
                        onChange={setResultId}
                      >
                        {runs.map((r) => (
                          <option key={r.scenarioId} value={r.scenarioId}>
                            {r.scenarioName}
                          </option>
                        ))}
                      </Select>
                      {inspected.snapshot ? (
                        <>
                          <pre
                            className="max-h-80 overflow-auto bg-slate-50 p-3 text-xs"
                            aria-label={t("sync.resultViews")}
                          >
                            {json(
                              summarizeSyncLab(d, inspected.snapshot).views,
                            )}
                          </pre>
                          <button
                            type="button"
                            className={buttonClass}
                            onClick={() => void execute("load")}
                          >
                            {t("sync.loadResult")}
                          </button>
                        </>
                      ) : (
                        <p className="text-xs">{t("sync.retention")}</p>
                      )}
                    </>
                  )}
                </>
              )}
            </section>
            <Check
              label={t("sync.details")}
              checked={details}
              onChange={setDetails}
            />
            {actions([
              { key: "sync.report", action: () => download("report") },
              { key: "sync.toolkit", action: () => download("toolkit") },
              { key: "sync.openapi", action: () => download("openapi") },
            ])}
            <p className="text-xs text-slate-600">{t("sync.exportHelp")}</p>
          </fieldset>
        </div>
      )}
    </details>
  );
});
