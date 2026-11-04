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
import { EventStoreTimeline } from "./event-store-timeline";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import {
  MAX_EVENT_PROJECT,
  MAX_EVENT_LOG,
  EventStoreError,
  emptyEventProject,
  newEventDefinition,
  newEventScenario,
  normalizeEventProject,
  normalizeEventCommand,
  parseEventProject,
  serializeEventProject,
  eventJson,
  type EventStoreProject,
  type EventStoreDefinition,
  type EventStoreCommand,
  type EventStoreScenario,
  type EventStoreSnapshot,
  type EventLog,
  type EventContract,
  type EventJson,
} from "@/lib/event-store-model";
import {
  createEventStore,
  summarizeEventStore,
  upcastStoredEvent,
} from "@/lib/event-store-engine";
import {
  demoEventStoreProject,
  replayEventStore,
  runEventStoreScenarios,
  eventStoreReport,
  eventStoreCsv,
  eventStoreExpectation,
  parseEventLog,
  serializeEventLog,
  previewEventPrefix,
  forkEventScenario,
  type EventStorePoint,
  type EventStoreRun,
} from "@/lib/event-store-studio";
import {
  generateEventStoreToolkit,
  generateEventStoreOpenApi,
} from "@/lib/event-store-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => {
    const pretty = JSON.stringify(v, null, 2);
    return getByteSize(pretty) > MAX_EVENT_PROJECT ? JSON.stringify(v) : pretty;
  },
  integer = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
const inputClass =
    "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs",
  buttonClass =
    "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:opacity-50";
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
      className={buttonClass}
      onClick={onClick}
      disabled={disabled}
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
  onEscape,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
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
function drafts(p: EventStoreProject, id: string) {
  const s = p.scenarios.find((s) => s.id === id);
  return {
    name: p.name,
    definitionName: p.definition.name,
    capacity: String(p.definition.capacity),
    types: json(p.definition.types),
    upcasters: json(p.definition.upcasters),
    projections: json(p.definition.projections),
    scenarioName: s?.name ?? "",
    baseLog: json(s?.baseLog ?? null),
    commands: json(s?.commands ?? []),
    expect: json(s?.expect ?? null),
  };
}
type Draft = ReturnType<typeof drafts>;
function makeRuntime(d: EventStoreDefinition, baseLog: EventLog | null = null) {
  const store = createEventStore(d, baseLog ?? undefined);
  return {
    store,
    snapshot: store.snapshot(),
    baseLog,
    commands: [] as EventStoreCommand[],
    timeline: [] as EventStorePoint[],
  };
}
function seed(t: EventContract): Record<string, EventJson> {
  return Object.fromEntries(
    t.fields
      .filter((f) => f.required && /^\/[^/]*$/.test(f.pointer))
      .map((f) => {
        const field = f.pointer
            .slice(1)
            .replace(/~1/g, "/")
            .replace(/~0/g, "~"),
          value =
            f.kind === "integer" || f.kind === "number"
              ? 1
              : f.kind === "boolean"
                ? true
                : f.kind === "object"
                  ? {}
                  : f.kind === "array"
                    ? []
                    : f.kind === "null"
                      ? null
                      : "example";
        return [field, value];
      }),
  );
}
export const EventStorePanel = memo(function EventStorePanel() {
  const { t } = useI18n(),
    [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyEventProject),
    [scenarioId, setScenarioId] = useState("case-1"),
    [draft, setDraft] = useState(() => drafts(emptyEventProject(), "case-1")),
    [saved, setSaved] = useState(() => drafts(emptyEventProject(), "case-1"));
  const [runtime, setRuntime] = useState(() =>
      makeRuntime(newEventDefinition()),
    ),
    [stream, setStream] = useState("stream-a"),
    [expected, setExpected] = useState("0"),
    [eventId, setEventId] = useState("event-1"),
    [eventType, setEventType] = useState("Changed"),
    [version, setVersion] = useState("1"),
    [payload, setPayload] = useState(() => json({ value: 1 })),
    [batch, setBatch] = useState(() =>
      json([
        { id: "event-1", type: "Changed", version: 1, payload: { value: 1 } },
      ]),
    ),
    [command, setCommand] = useState(() =>
      json({ type: "project", projectionId: "totals", limit: 500 }),
    ),
    [projectionId, setProjectionId] = useState("totals"),
    [limit, setLimit] = useState("500"),
    [position, setPosition] = useState(0),
    [rowIndex, setRowIndex] = useState(0),
    [search, setSearch] = useState(""),
    [filterStream, setFilterStream] = useState(""),
    [liveIndex, setLiveIndex] = useState(0),
    [preview, setPreview] = useState<{
      position: number;
      snapshot: EventStoreSnapshot;
    } | null>(null);
  const [runs, setRuns] = useState<EventStoreRun[] | null>(null),
    [resultId, setResultId] = useState(""),
    [resultProjection, setResultProjection] = useState("totals"),
    [pointIndex, setPointIndex] = useState(0),
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
  const pending = (Object.keys(draft) as (keyof Draft)[]).some(
      (k) => draft[k] !== saved[k],
    ),
    scenario = project.scenarios.find((s) => s.id === scenarioId),
    summary = summarizeEventStore(runtime.snapshot),
    view = runtime.snapshot.projections.find((p) => p.id === projectionId),
    row = view?.rows[Math.min(rowIndex, Math.max(0, view.rows.length - 1))],
    selectedEvent = runtime.snapshot.events[position - 1],
    inspected = runs?.find((r) => r.scenarioId === resultId),
    resultIndex = inspected
      ? Math.min(pointIndex, Math.max(0, inspected.timeline.length - 1))
      : 0,
    point = inspected?.timeline[resultIndex],
    resultView = inspected?.snapshot.projections.find(
      (p) => p.id === resultProjection,
    );
  const upcasted = useMemo(
    () =>
      selectedEvent
        ? upcastStoredEvent(project.definition, selectedEvent)
        : null,
    [project.definition, selectedEvent],
  );
  const reason = (s: string) => t(`eventStore.reason.${s}` as TranslationKey);
  function edit<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft({ ...draft, [k]: v });
  }
  function error(e: unknown) {
    setFeedback({
      key:
        e instanceof EventStoreError
          ? e.code === "cancelled"
            ? "eventStore.cancelled"
            : `eventStore.error.${e.code}`
          : "eventStore.error.unknown",
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
      setFeedback({ key: "eventStore.pending", error: true });
      return false;
    }
    return true;
  }
  function nextId() {
    let i = 1;
    while (project.scenarios.some((s) => s.id === `case-${i}`)) i++;
    return `case-${i}`;
  }
  function reset(d = project.definition) {
    setRuntime(makeRuntime(d));
    setProjectionId(d.projections[0]?.id ?? "");
    setResultProjection(d.projections[0]?.id ?? "");
    setPosition(0);
    setRowIndex(0);
    setPreview(null);
    setSearch("");
    setFilterStream("");
    setLiveIndex(0);
    setExpected("0");
    setEventId("event-1");
    setEventType(d.types[0].id);
    setVersion(String(d.types[0].version));
    setPayload(json(seed(d.types[0])));
    setBatch(
      json([
        {
          id: "event-1",
          type: d.types[0].id,
          version: d.types[0].version,
          payload: seed(d.types[0]),
        },
      ]),
    );
  }
  function install(
    value: EventStoreProject,
    preferred = scenarioId,
    fresh = false,
  ) {
    const p = normalizeEventProject(value),
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
      install({
        ...project,
        name: draft.name,
        definition: {
          name: draft.definitionName,
          capacity: integer(draft.capacity),
          types: eventJson(draft.types) as EventStoreDefinition["types"],
          upcasters: eventJson(
            draft.upcasters,
          ) as EventStoreDefinition["upcasters"],
          projections: eventJson(
            draft.projections,
          ) as EventStoreDefinition["projections"],
        },
        scenarios: project.scenarios.map((s) =>
          s.id === scenarioId
            ? {
                ...s,
                name: draft.scenarioName,
                baseLog: eventJson(
                  draft.baseLog,
                  MAX_EVENT_LOG,
                ) as EventLog | null,
                commands: eventJson(draft.commands) as EventStoreCommand[],
                expect: eventJson(draft.expect) as EventStoreScenario["expect"],
              }
            : s,
        ),
      });
      setFeedback({ key: "eventStore.saved" });
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
              ? newEventScenario(id)
              : { ...scenario!, id, name: id };
        install({ ...project, scenarios: [...project.scenarios, added] }, id);
      }
    });
  }
  function apply(input: unknown) {
    if (!ready()) return;
    attempt(() => {
      const c = normalizeEventCommand(input),
        decision = runtime.store.apply(c),
        snapshot = runtime.store.snapshot();
      setRuntime({
        ...runtime,
        snapshot,
        commands: [...runtime.commands, c],
        timeline: [
          ...runtime.timeline,
          {
            command: snapshot.commands,
            accepted: decision.accepted,
            reason: decision.reason,
            summary: summarizeEventStore(snapshot),
          },
        ],
      });
      setLiveIndex(snapshot.commands - 1);
      setCommand(json(c));
      setPreview(null);
      if (c.type === "append" && decision.reason === "appended")
        setPosition(snapshot.events.length);
      setFeedback({
        key: "eventStore.applied",
        error: !decision.accepted,
        values: { reason: reason(decision.reason) },
      });
    });
  }
  async function job<T>(
    work: (
      cancelled: () => boolean,
      report: (done: number, total: number) => void,
    ) => Promise<T>,
    publish: (r: T) => void,
  ) {
    if (!ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      const r = await work(cancelled, (done, total) => {
        if (!cancelled()) setProgress({ done, total });
      });
      if (!cancelled()) publish(r);
    } catch (e) {
      if (!cancelled()) error(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  async function run(all: boolean) {
    await job(
      (cancelled, report) =>
        runEventStoreScenarios(
          project,
          all ? undefined : scenarioId,
          cancelled,
          report,
        ),
      (rows) => {
        setRuns(rows);
        setResultId(rows[0]?.scenarioId ?? "");
        setPointIndex(Math.max(0, (rows[0]?.timeline.length ?? 1) - 1));
        setResultProjection(project.definition.projections[0]?.id ?? "");
        setFeedback({
          key: "eventStore.completed",
          values: {
            passed: String(rows.filter((r) => r.passed).length),
            checked: String(rows.filter((r) => r.checked).length),
            total: String(rows.length),
          },
        });
      },
    );
  }
  async function loadCase() {
    if (!scenario) return;
    await job(
      (cancelled, report) =>
        replayEventStore(project.definition, scenario, cancelled, report),
      (replay) => {
        setRuntime({
          store: replay.store,
          snapshot: replay.snapshot,
          baseLog: scenario.baseLog,
          commands: structuredClone(scenario.commands),
          timeline: replay.timeline,
        });
        setPosition(replay.snapshot.events.length);
        setProjectionId(project.definition.projections[0]?.id ?? "");
        setRowIndex(0);
        setPreview(null);
        setLiveIndex(Math.max(0, replay.timeline.length - 1));
        const last = replay.snapshot.events.at(-1);
        if (last) {
          setStream(last.stream);
          setExpected(
            String(
              replay.snapshot.events.filter((e) => e.stream === last.stream)
                .length,
            ),
          );
        }
        setFeedback({ key: "eventStore.loaded" });
      },
    );
  }
  async function previewPrefix() {
    await job(
      (cancelled) =>
        previewEventPrefix(
          project.definition,
          runtime.store.exportLog(),
          position,
          cancelled,
        ),
      (result) => {
        setPreview({ position, snapshot: result.snapshot });
        setFeedback({
          key: "eventStore.previewed",
          values: { position: String(position) },
        });
      },
    );
  }
  async function importFile(file: File | undefined, log: boolean) {
    if (!file || !ready()) return;
    await job(
      async (cancelled) => {
        if (file.size > (log ? MAX_EVENT_LOG : MAX_EVENT_PROJECT))
          throw new EventStoreError("limit");
        const source = await file.text();
        if (cancelled()) throw new EventStoreError("cancelled");
        return source;
      },
      (source) => {
        attempt(() => {
          if (log) {
            const baseLog = parseEventLog(source),
              next = makeRuntime(project.definition, baseLog);
            setRuntime(next);
            setPosition(next.snapshot.events.length);
            setProjectionId(project.definition.projections[0]?.id ?? "");
            setRowIndex(0);
            setPreview(null);
            setSearch("");
            setFilterStream("");
            setLiveIndex(0);
            setFeedback({
              key: "eventStore.logLoaded",
              values: { count: String(next.snapshot.events.length) },
            });
          } else {
            install(parseEventProject(source), "", true);
            setFeedback({ key: "eventStore.loaded" });
          }
        });
      },
    );
  }
  function download(
    kind: "project" | "log" | "view" | "toolkit" | "openapi" | "report" | "csv",
  ) {
    if (!ready()) return;
    attempt(() => {
      const source =
        kind === "project"
          ? serializeEventProject(project)
          : kind === "log"
            ? serializeEventLog(runtime.store.exportLog())
            : kind === "view"
              ? json(view)
              : kind === "toolkit"
                ? generateEventStoreToolkit(project.definition)
                : kind === "openapi"
                  ? json(generateEventStoreOpenApi(project.definition))
                  : kind === "csv"
                    ? eventStoreCsv(inspected!)
                    : json(eventStoreReport(runs ?? [], details));
      if (getByteSize(source) > 16 * 1024 * 1024)
        throw new EventStoreError("limit");
      const ext = kind === "toolkit" ? "mjs" : kind === "csv" ? "csv" : "json",
        ok = downloadTextFile(
          source,
          `event-store-${kind}.${ext}`,
          kind === "toolkit"
            ? "text/javascript"
            : kind === "csv"
              ? "text/csv"
              : "application/json",
        );
      setFeedback({
        key: ok ? "eventStore.downloaded" : "eventStore.error.download",
        error: !ok,
      });
    });
  }
  const upload = (log: boolean) => (
    <label className="block text-xs font-semibold">
      {t(log ? "eventStore.importLog" : "eventStore.import")}
      <input
        type="file"
        className={inputClass}
        aria-label={t(log ? "eventStore.importLog" : "eventStore.import")}
        accept=".json,application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void importFile(f, log);
        }}
      />
    </label>
  );
  const metrics = (s: ReturnType<typeof summarizeEventStore>) => (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {(["events", "streams", "lag", "errors", "rows", "skipped"] as const).map(
        (k) => (
          <div className="rounded-lg bg-slate-50 p-2 text-xs" key={k}>
            <span>{t(`eventStore.metric.${k}`)}</span>
            <strong className="block text-base">{s[k]}</strong>
          </div>
        ),
      )}
      {(["rejected", "duplicates"] as const).map((k) => (
        <div className="rounded-lg bg-slate-50 p-2 text-xs" key={k}>
          <span>{t(`eventStore.metric.${k}`)}</span>
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
        {t("eventStore.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("eventStore.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("eventStore.guide")}
            </summary>
            {(
              [
                "eventStore.semantics",
                "eventStore.upcastHelp",
                "eventStore.projectionHelp",
                "eventStore.recoveryHelp",
                "eventStore.historyHelp",
                "eventStore.privacy",
                "eventStore.limits",
              ] as const
            ).map((k) => (
              <p key={k}>{t(k)}</p>
            ))}
          </details>
          {feedback && (
            <p
              className="text-sm font-semibold"
              role={feedback.error ? "alert" : "status"}
            >
              {t(feedback.key, feedback.values)}
            </p>
          )}
          {busy && (
            <div className="flex items-center gap-3">
              <p role="status">
                {t("eventStore.busy", {
                  done: String(progress.done),
                  total: String(progress.total),
                })}
              </p>
              <Action
                label={t("eventStore.cancel")}
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  setFeedback({ key: "eventStore.cancelled" });
                }}
              />
            </div>
          )}
          {pending && (
            <p className="text-xs font-semibold text-amber-800">
              {t("eventStore.pending")}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-2">
              <Action
                label={t("eventStore.new")}
                onClick={() => {
                  if (ready())
                    attempt(() => install(emptyEventProject(), "", true));
                }}
              />
              <Action
                label={t("eventStore.demo")}
                onClick={() => {
                  if (ready())
                    attempt(() => install(demoEventStoreProject(), "", true));
                }}
              />
              <Action
                label={t("eventStore.export")}
                onClick={() => download("project")}
              />
            </div>
            {upload(false)}
            <Field
              label={t("eventStore.name")}
              value={draft.name}
              onChange={(v) => edit("name", v)}
            />
            <div className="flex flex-wrap gap-2">
              <Action
                label={t("eventStore.save")}
                onClick={save}
                disabled={!pending}
              />
              <Action
                label={t("eventStore.discard")}
                onClick={() => {
                  setDraft(saved);
                  setFeedback(null);
                }}
                disabled={!pending}
              />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <section
                aria-label={t("eventStore.definition")}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <h3 className="font-bold">{t("eventStore.definition")}</h3>
                <Field
                  label={t("eventStore.definitionName")}
                  value={draft.definitionName}
                  onChange={(v) => edit("definitionName", v)}
                />
                <Field
                  label={t("eventStore.capacity")}
                  value={draft.capacity}
                  onChange={(v) => edit("capacity", v)}
                />
                {(
                  [
                    { key: "types", label: "eventStore.types" },
                    { key: "upcasters", label: "eventStore.upcasters" },
                    { key: "projections", label: "eventStore.projections" },
                  ] as const
                ).map(({ key, label }) => (
                  <Field
                    key={key}
                    label={t(label)}
                    value={draft[key]}
                    onChange={(v) => edit(key, v)}
                    multiline
                  />
                ))}
                <p className="text-xs text-slate-600">
                  {t("eventStore.definitionHelp")}
                </p>
                <p className="text-xs text-slate-600">
                  {t("eventStore.editHelp")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("eventStore.clearExpectations")}
                    onClick={() => {
                      if (ready())
                        attempt(() =>
                          install({
                            ...project,
                            scenarios: project.scenarios.map((s) => ({
                              ...s,
                              expect: null,
                            })),
                          }),
                        );
                    }}
                  />
                  <Action
                    label={t("eventStore.toolkit")}
                    onClick={() => download("toolkit")}
                  />
                  <Action
                    label={t("eventStore.openapi")}
                    onClick={() => download("openapi")}
                  />
                </div>
                <p className="text-xs text-slate-600">
                  {t("eventStore.exportHelp")}
                </p>
              </section>
              <section
                aria-label={t("eventStore.scenarios")}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <h3 className="font-bold">{t("eventStore.scenarios")}</h3>
                {!!project.scenarios.length && (
                  <Select
                    label={t("eventStore.scenario")}
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
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("eventStore.add")}
                    onClick={() => caseAction("add")}
                    disabled={project.scenarios.length >= 12}
                  />
                  <Action
                    label={t("eventStore.clone")}
                    onClick={() => caseAction("clone")}
                    disabled={!scenario || project.scenarios.length >= 12}
                  />
                  <Action
                    label={t("eventStore.delete")}
                    onClick={() => caseAction("delete")}
                    disabled={!scenario}
                  />
                </div>
                {scenario ? (
                  <>
                    <Field
                      label={t("eventStore.scenarioName")}
                      value={draft.scenarioName}
                      onChange={(v) => edit("scenarioName", v)}
                    />
                    <Field
                      label={t("eventStore.baseLog")}
                      value={draft.baseLog}
                      onChange={(v) => edit("baseLog", v)}
                      multiline
                    />
                    <Field
                      label={t("eventStore.commands")}
                      value={draft.commands}
                      onChange={(v) => edit("commands", v)}
                      multiline
                    />
                    <Field
                      label={t("eventStore.expect")}
                      value={draft.expect}
                      onChange={(v) => edit("expect", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("eventStore.expectHelp")}
                    </p>
                  </>
                ) : (
                  <p>{t("eventStore.empty")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("eventStore.run")}
                    onClick={() => void run(false)}
                    disabled={!scenario}
                  />
                  <Action
                    label={t("eventStore.runAll")}
                    onClick={() => void run(true)}
                    disabled={!project.scenarios.length}
                  />
                  <Action
                    label={t("eventStore.load")}
                    onClick={() => void loadCase()}
                    disabled={!scenario}
                  />
                </div>
              </section>
            </div>
            <section
              aria-label={t("eventStore.playground")}
              className="space-y-4"
            >
              <h3 className="font-bold">{t("eventStore.playground")}</h3>
              <p className="text-xs text-slate-600">
                {t("eventStore.recordHelp")}
              </p>
              {metrics(summary)}
              <div className="flex flex-wrap gap-2">
                <Action
                  label={t("eventStore.reset")}
                  onClick={() => {
                    if (ready()) {
                      reset();
                      setFeedback(null);
                    }
                  }}
                />
                <Action
                  label={t("eventStore.record")}
                  disabled={
                    (!runtime.commands.length && !runtime.baseLog) ||
                    project.scenarios.length >= 12
                  }
                  onClick={() => {
                    if (ready())
                      attempt(() => {
                        const id = nextId(),
                          s: EventStoreScenario = {
                            id,
                            name: id,
                            baseLog: runtime.baseLog,
                            commands: runtime.commands,
                            expect: eventStoreExpectation(runtime.snapshot),
                          };
                        install(
                          { ...project, scenarios: [...project.scenarios, s] },
                          id,
                        );
                        setFeedback({
                          key: "eventStore.recorded",
                          values: { count: String(runtime.commands.length) },
                        });
                      });
                  }}
                />
                <Action
                  label={t("eventStore.exportLog")}
                  onClick={() => download("log")}
                />
              </div>
              {upload(true)}
              <p className="text-xs text-slate-600">
                {t("eventStore.logHelp")}
              </p>
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
                  <Field
                    label={t("eventStore.stream")}
                    value={stream}
                    onChange={setStream}
                  />
                  <Field
                    label={t("eventStore.expected")}
                    value={expected}
                    onChange={setExpected}
                  />
                  <Action
                    label={t("eventStore.currentRevision")}
                    onClick={() => {
                      if (ready())
                        setExpected(
                          String(
                            runtime.snapshot.events.filter(
                              (e) => e.stream === stream,
                            ).length,
                          ),
                        );
                    }}
                  />
                  <Field
                    label={t("eventStore.eventId")}
                    value={eventId}
                    onChange={setEventId}
                  />
                  <Select
                    label={t("eventStore.eventType")}
                    value={eventType}
                    onChange={setEventType}
                  >
                    {project.definition.types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name} ({type.id})
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("eventStore.eventVersion")}
                    value={version}
                    onChange={setVersion}
                  />
                  <Action
                    label={t("eventStore.seed")}
                    onClick={() => {
                      if (ready()) {
                        const type = project.definition.types.find(
                          (t) => t.id === eventType,
                        )!;
                        setVersion(String(type.version));
                        setPayload(json(seed(type)));
                      }
                    }}
                  />
                  <Field
                    label={t("eventStore.payload")}
                    value={payload}
                    onChange={setPayload}
                    multiline
                  />
                  <Action
                    label={t("eventStore.append")}
                    onClick={() =>
                      attempt(() =>
                        apply({
                          type: "append",
                          stream,
                          expectedRevision: integer(expected),
                          events: [
                            {
                              id: eventId,
                              type: eventType,
                              version: integer(version),
                              payload: eventJson(payload),
                            },
                          ],
                        }),
                      )
                    }
                  />
                  <details className="space-y-3">
                    <summary className="cursor-pointer text-sm font-bold">
                      {t("eventStore.batch")}
                    </summary>
                    <Field
                      label={t("eventStore.batch")}
                      value={batch}
                      onChange={setBatch}
                      multiline
                    />
                    <Action
                      label={t("eventStore.appendBatch")}
                      onClick={() =>
                        attempt(() =>
                          apply({
                            type: "append",
                            stream,
                            expectedRevision: integer(expected),
                            events: eventJson(batch),
                          }),
                        )
                      }
                    />
                  </details>
                </div>
                <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
                  <Select
                    label={t("eventStore.selectedProjection")}
                    value={projectionId}
                    onChange={(id) => {
                      setProjectionId(id);
                      setRowIndex(0);
                    }}
                  >
                    {project.definition.projections.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("eventStore.limit")}
                    value={limit}
                    onChange={setLimit}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Action
                      label={t("eventStore.project")}
                      disabled={!view}
                      onClick={() =>
                        apply({
                          type: "project",
                          projectionId,
                          limit: integer(limit),
                        })
                      }
                    />
                    <Action
                      label={t("eventStore.rebuild")}
                      disabled={!view}
                      onClick={() => apply({ type: "rebuild", projectionId })}
                    />
                    <Action
                      label={t("eventStore.skip")}
                      disabled={!view?.error}
                      onClick={() =>
                        apply({
                          type: "skip",
                          projectionId,
                          position: view!.error!.position,
                        })
                      }
                    />
                    <Action
                      label={t("eventStore.viewExport")}
                      disabled={!view}
                      onClick={() => download("view")}
                    />
                  </div>
                  <p className="text-xs">
                    {t("eventStore.error")}:{" "}
                    {view?.error
                      ? `${view.error.position}: ${view.error.reason}`
                      : t("eventStore.none")}
                  </p>
                  <div className="max-h-72 overflow-auto">
                    <table
                      className="w-full text-left text-xs"
                      aria-label={t("eventStore.checkpoints")}
                    >
                      <thead>
                        <tr>
                          <th>{t("eventStore.projection")}</th>
                          <th>{t("eventStore.checkpoint")}</th>
                          <th>{t("eventStore.lag")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.projections.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2">{p.id}</td>
                            <td>{p.checkpoint}</td>
                            <td>{p.lag}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details className="space-y-3">
                    <summary className="cursor-pointer text-sm font-bold">
                      {t("eventStore.command")}
                    </summary>
                    <Field
                      label={t("eventStore.command")}
                      value={command}
                      onChange={setCommand}
                      multiline
                    />
                    <Action
                      label={t("eventStore.apply")}
                      onClick={() => attempt(() => apply(eventJson(command)))}
                    />
                  </details>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t("eventStore.search")}
                  value={search}
                  onChange={setSearch}
                  onEscape={() => setSearch("")}
                />
                <Select
                  label={t("eventStore.filterStream")}
                  value={filterStream}
                  onChange={setFilterStream}
                >
                  <option value="">{t("eventStore.allStreams")}</option>
                  {[
                    ...new Set(runtime.snapshot.events.map((e) => e.stream)),
                  ].map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </Select>
              </div>
              <div className="max-h-80 overflow-auto">
                <table
                  className="w-full text-left text-xs"
                  aria-label={t("eventStore.events")}
                >
                  <thead>
                    <tr>
                      <th>{t("eventStore.position")}</th>
                      <th>{t("eventStore.eventId")}</th>
                      <th>{t("eventStore.stream")}</th>
                      <th>{t("eventStore.revision")}</th>
                      <th>{t("eventStore.type")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runtime.snapshot.events
                      .filter(
                        (e) =>
                          (!filterStream || filterStream === e.stream) &&
                          `${e.id} ${e.stream} ${e.type}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((e) => (
                        <tr key={e.id}>
                          <td className="p-2">
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setPosition(e.position)}
                            >
                              {e.position}
                            </button>
                          </td>
                          <td>{e.id}</td>
                          <td>{e.stream}</td>
                          <td>{e.revision}</td>
                          <td>
                            {e.type} / {e.version}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <label className="block text-xs font-semibold">
                {t("eventStore.position")}
                <input
                  type="range"
                  className="mt-2 w-full"
                  aria-label={t("eventStore.position")}
                  min={0}
                  max={runtime.snapshot.events.length}
                  step={1}
                  value={position}
                  onChange={(e) => setPosition(Number(e.target.value))}
                />
              </label>
              {selectedEvent && (
                <div className="grid gap-3 xl:grid-cols-2">
                  <Field
                    label={t("eventStore.raw")}
                    value={json(selectedEvent)}
                    multiline
                  />
                  <Field
                    label={t("eventStore.upcasted")}
                    value={json(upcasted)}
                    multiline
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Action
                  label={t("eventStore.preview")}
                  onClick={() => void previewPrefix()}
                />
                <Action
                  label={t("eventStore.fork")}
                  disabled={project.scenarios.length >= 12}
                  onClick={() => {
                    if (ready())
                      attempt(() => {
                        const id = nextId(),
                          s = forkEventScenario(
                            project.definition,
                            runtime.store.exportLog(),
                            position,
                            id,
                          );
                        install(
                          { ...project, scenarios: [...project.scenarios, s] },
                          id,
                        );
                        setFeedback({ key: "eventStore.forked" });
                      });
                  }}
                />
              </div>
              <p className="text-xs text-slate-600">
                {t("eventStore.historyHelp")}
              </p>
              {preview && (
                <section
                  aria-label={t("eventStore.prefix")}
                  className="space-y-3"
                >
                  <h4 className="font-bold">
                    {t("eventStore.prefix")}: {preview.position}
                  </h4>
                  {metrics(summarizeEventStore(preview.snapshot))}
                  <pre
                    className="max-h-72 overflow-auto bg-slate-50 p-3 text-xs"
                    aria-label={t("eventStore.prefixDetails")}
                  >
                    {json(preview.snapshot.projections)}
                  </pre>
                </section>
              )}
              {view && (
                <>
                  <div className="max-h-80 overflow-auto">
                    <table
                      className="w-full text-left text-xs"
                      aria-label={t("eventStore.rows")}
                    >
                      <thead>
                        <tr>
                          <th>{t("eventStore.row")}</th>
                          <th>{t("eventStore.fields")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.rows.map((r, i) => (
                          <tr key={json([typeof r.key, r.key])}>
                            <td className="p-2">
                              <button
                                type="button"
                                className="underline"
                                onClick={() => setRowIndex(i)}
                              >
                                {json(r.key)}
                              </button>
                            </td>
                            <td className="max-w-lg break-all">
                              {JSON.stringify(r.fields).slice(0, 1000)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!!view.rows.length && (
                    <Select
                      label={t("eventStore.selectedRow")}
                      value={String(Math.min(rowIndex, view.rows.length - 1))}
                      onChange={(v) => setRowIndex(Number(v))}
                    >
                      {view.rows.map((r, i) => (
                        <option key={i} value={i}>
                          {json(r.key)}
                        </option>
                      ))}
                    </Select>
                  )}
                  {row && (
                    <details>
                      <summary className="cursor-pointer text-sm font-bold">
                        {t("eventStore.rowDetails")}
                      </summary>
                      <pre
                        className="max-h-80 overflow-auto bg-slate-50 p-3 text-xs"
                        aria-label={t("eventStore.rowDetails")}
                      >
                        {json(row)}
                      </pre>
                    </details>
                  )}
                </>
              )}
              {!!runtime.timeline.length && (
                <>
                  <EventStoreTimeline
                    points={runtime.timeline}
                    index={Math.min(liveIndex, runtime.timeline.length - 1)}
                    onSelect={setLiveIndex}
                  />
                  <pre className="max-h-64 overflow-auto bg-slate-50 p-3 text-xs">
                    {json(
                      runtime.timeline[
                        Math.min(liveIndex, runtime.timeline.length - 1)
                      ],
                    )}
                  </pre>
                </>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-bold">
                  {t("eventStore.journal")}
                </summary>
                <pre
                  className="max-h-80 overflow-auto bg-slate-50 p-3 text-xs"
                  aria-label={t("eventStore.journal")}
                >
                  {json(runtime.snapshot.journal)}
                </pre>
              </details>
            </section>
            {runs && (
              <section
                aria-label={t("eventStore.results")}
                className="space-y-3"
              >
                <h3 className="font-bold">{t("eventStore.results")}</h3>
                <div className="overflow-auto">
                  <table
                    className="w-full text-left text-xs"
                    aria-label={t("eventStore.results")}
                  >
                    <thead>
                      <tr>
                        <th>{t("eventStore.scenarioName")}</th>
                        <th>{t("eventStore.metric.events")}</th>
                        <th>{t("eventStore.metric.lag")}</th>
                        <th>{t("eventStore.error")}</th>
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
                          <td>{r.summary.events}</td>
                          <td>{r.summary.lag}</td>
                          <td>
                            {t(
                              !r.checked
                                ? "eventStore.unchecked"
                                : r.passed
                                  ? "eventStore.passed"
                                  : "eventStore.failed",
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
                      label={t("eventStore.result")}
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
                          {t("eventStore.point")}
                          <input
                            type="range"
                            className="mt-2 w-full"
                            aria-label={t("eventStore.point")}
                            min={0}
                            max={inspected.timeline.length - 1}
                            step={1}
                            value={resultIndex}
                            onChange={(e) =>
                              setPointIndex(Number(e.target.value))
                            }
                          />
                        </label>
                        <EventStoreTimeline
                          points={inspected.timeline}
                          index={resultIndex}
                          onSelect={setPointIndex}
                        />
                        <pre
                          className="max-h-72 overflow-auto bg-slate-50 p-3 text-xs"
                          aria-label={t("eventStore.pointDetails")}
                        >
                          {json(point)}
                        </pre>
                      </>
                    )}
                    <Select
                      label={t("eventStore.resultProjection")}
                      value={resultProjection}
                      onChange={setResultProjection}
                    >
                      {project.definition.projections.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </Select>
                    {resultView && (
                      <details>
                        <summary className="cursor-pointer text-sm font-bold">
                          {t("eventStore.resultRows")}
                        </summary>
                        <pre
                          className="max-h-80 overflow-auto bg-slate-50 p-3 text-xs"
                          aria-label={t("eventStore.resultRows")}
                        >
                          {json(resultView)}
                        </pre>
                      </details>
                    )}
                    <Action
                      label={t("eventStore.csv")}
                      onClick={() => download("csv")}
                    />
                  </>
                )}
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={details}
                    onChange={(e) => setDetails(e.target.checked)}
                  />
                  {t("eventStore.details")}
                </label>
                <Action
                  label={t("eventStore.report")}
                  onClick={() => download("report")}
                />
              </section>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
