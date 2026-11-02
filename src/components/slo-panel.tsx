"use client";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { SloCharts } from "./slo-charts";
import { parseOpenApiSchema } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import { classifySloEvent } from "@/lib/slo-engine";
import {
  MAX_SLO_PROJECT,
  SloError,
  emptySloProject,
  newSloObjective,
  newSloScenario,
  normalizeSloProject,
  parseSloProject,
  serializeSloProject,
  sloJson,
  sloPercentToPpm,
  type SloObjective,
  type SloProject,
} from "@/lib/slo-project";
import {
  demoSloProject,
  generateSloTraffic,
  importSloHar,
  importSloNdjson,
  runSloMatrix,
  sloRunReport,
  sloTimelineCsv,
  type SloGenerator,
  type SloRun,
} from "@/lib/slo-studio";
import { generateSloPrometheus, generateSloToolkit } from "@/lib/slo-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => JSON.stringify(v, null, 2),
  integer = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN),
  numberText = (v: number | null) =>
    v === null ? "—" : String(Number(v.toFixed(6)));
const inputClass =
    "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs",
  buttonClass =
    "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:opacity-50";
type Selection = { objectiveId: string; scenarioId: string };
function drafts(p: SloProject, s: Selection) {
  const o = p.objectives.find((o) => o.id === s.objectiveId)!,
    c = p.scenarios.find((c) => c.id === s.scenarioId);
  return {
    name: p.name,
    objectiveName: o.name,
    mode: o.mode,
    target: String(o.targetPpm / 10000),
    window: String(o.windowMs),
    threshold: String(o.thresholdMs),
    requireCoverage: o.requireCoverage,
    service: o.scope.service,
    route: o.scope.route,
    method: o.scope.method,
    statuses: json(o.goodStatuses),
    rules: json(o.rules),
    scenarioName: c?.name ?? "",
    events: json(c?.events ?? []),
    coverage: json(c?.coverage ?? null),
    from: String(c?.timeline.fromMs ?? Date.UTC(2026, 10, 2)),
    to: String(c?.timeline.toMs ?? Date.UTC(2026, 10, 2)),
    step: String(c?.timeline.stepMs ?? 2000),
    expect: json(c?.expect ?? {}),
  };
}
type Draft = ReturnType<typeof drafts>;
function Field({
  label,
  value,
  onChange,
  multiline = false,
  readOnly = false,
  list,
  onEscape,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  list?: string;
  onEscape?: () => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea
          rows={6}
          spellCheck={false}
          className={`${inputClass} font-mono`}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onEscape?.();
          }}
        />
      ) : (
        <input
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
          value={value}
          list={list}
          readOnly={readOnly}
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
const keyOf = (r: SloRun) => `${r.objectiveId}/${r.scenarioId}`;
export const SloPanel = memo(function SloPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n(),
    [open, setOpen] = useState(false),
    [project, setProject] = useState(emptySloProject),
    [selection, setSelection] = useState<Selection>({
      objectiveId: "objective-1",
      scenarioId: "scenario-1",
    }),
    [draft, setDraft] = useState(() =>
      drafts(emptySloProject(), {
        objectiveId: "objective-1",
        scenarioId: "scenario-1",
      }),
    ),
    [saved, setSaved] = useState(() =>
      drafts(emptySloProject(), {
        objectiveId: "objective-1",
        scenarioId: "scenario-1",
      }),
    );
  const [runs, setRuns] = useState<SloRun[] | null>(null),
    [resultKey, setResultKey] = useState(""),
    [pointIndex, setPointIndex] = useState(0),
    [search, setSearch] = useState(""),
    [details, setDetails] = useState(false),
    [catalog, setCatalog] = useState<string[]>([]),
    [generator, setGenerator] = useState(() =>
      json({
        count: 180,
        startMs: Date.UTC(2026, 10, 2),
        spacingMs: 1000,
        badFrom: 40,
        badCount: 30,
        goodLatencyMs: 40,
        badLatencyMs: 900,
        badStatus: 503,
        service: "store",
        route: "/orders",
        method: "GET",
        weight: 1,
      }),
    );
  const [busy, setBusy] = useState(false),
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
  const objective = project.objectives.find(
      (o) => o.id === selection.objectiveId,
    )!,
    scenario = project.scenarios.find((s) => s.id === selection.scenarioId),
    pending = (Object.keys(draft) as (keyof Draft)[]).some(
      (k) => draft[k] !== saved[k],
    ),
    inspected = runs?.find((r) => keyOf(r) === resultKey),
    index = inspected ? Math.min(pointIndex, inspected.points.length - 1) : 0,
    point = inspected?.points[index],
    resultObjective = project.objectives.find(
      (o) => o.id === inspected?.objectiveId,
    ),
    resultScenario = project.scenarios.find(
      (s) => s.id === inspected?.scenarioId,
    );
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function error(e: unknown) {
    setFeedback({
      key:
        e instanceof SloError
          ? e.code === "cancelled"
            ? "slo.cancelled"
            : `slo.error.${e.code}`
          : "slo.error.unknown",
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
      setFeedback({ key: "slo.pending", error: true });
      return false;
    }
    return true;
  }
  function nextId(prefix: string, ids: string[]) {
    let n = 1;
    while (ids.includes(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
  function install(
    value: SloProject,
    prefer: Partial<Selection> = {},
    fresh = false,
  ) {
    const p = normalizeSloProject(value),
      old: Partial<Selection> = fresh ? {} : selection,
      s = {
        objectiveId:
          p.objectives.find(
            (o) => o.id === (prefer.objectiveId ?? old.objectiveId),
          )?.id ?? p.objectives[0].id,
        scenarioId:
          p.scenarios.find(
            (c) => c.id === (prefer.scenarioId ?? old.scenarioId),
          )?.id ??
          p.scenarios[0]?.id ??
          "",
      },
      next = drafts(p, s);
    setProject(p);
    setSelection(s);
    setDraft(next);
    setSaved(next);
    setRuns(null);
    setResultKey("");
    setPointIndex(0);
    setFeedback(null);
    if (fresh) {
      setSearch("");
      setCatalog([]);
    }
  }
  function select(prefer: Partial<Selection>) {
    if (!ready()) return;
    const s = { ...selection, ...prefer },
      next = drafts(project, s);
    setSelection(s);
    setDraft(next);
    setSaved(next);
    setFeedback(null);
  }
  function save() {
    attempt(() => {
      install({
        ...project,
        name: draft.name,
        objectives: project.objectives.map((o) =>
          o.id !== objective.id
            ? o
            : {
                ...o,
                name: draft.objectiveName,
                mode: draft.mode,
                targetPpm: sloPercentToPpm(draft.target),
                windowMs: integer(draft.window),
                thresholdMs: integer(draft.threshold),
                requireCoverage: draft.requireCoverage,
                scope: {
                  service: draft.service,
                  route: draft.route,
                  method: draft.method,
                },
                goodStatuses: sloJson(
                  draft.statuses,
                ) as SloObjective["goodStatuses"],
                rules: sloJson(draft.rules) as SloObjective["rules"],
              },
        ),
        scenarios: project.scenarios.map((s) =>
          s.id !== selection.scenarioId
            ? s
            : {
                ...s,
                name: draft.scenarioName,
                events: sloJson(draft.events) as typeof s.events,
                coverage: sloJson(draft.coverage) as typeof s.coverage,
                timeline: {
                  fromMs: integer(draft.from),
                  toMs: integer(draft.to),
                  stepMs: integer(draft.step),
                },
                expect: sloJson(draft.expect) as typeof s.expect,
              },
        ),
      });
      setFeedback({ key: "slo.saved" });
    });
  }
  function objectiveAction(mode: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (mode === "delete") {
        if (project.objectives.length === 1) return;
        install({
          ...project,
          objectives: project.objectives.filter((o) => o.id !== objective.id),
          scenarios: project.scenarios.map((s) => ({
            ...s,
            expect: Object.fromEntries(
              Object.entries(s.expect).filter(([id]) => id !== objective.id),
            ),
          })),
        });
      } else {
        const id = nextId(
            "objective",
            project.objectives.map((o) => o.id),
          ),
          added =
            mode === "add"
              ? newSloObjective(id)
              : { ...objective, id, name: id };
        install(
          {
            ...project,
            objectives: [...project.objectives, added],
            scenarios: project.scenarios.map((s) =>
              mode === "clone" && Object.hasOwn(s.expect, objective.id)
                ? {
                    ...s,
                    expect: { ...s.expect, [id]: s.expect[objective.id] },
                  }
                : s,
            ),
          },
          { objectiveId: id },
        );
      }
    });
  }
  function scenarioAction(mode: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (mode === "delete")
        install({
          ...project,
          scenarios: project.scenarios.filter(
            (s) => s.id !== selection.scenarioId,
          ),
        });
      else {
        const id = nextId(
            "scenario",
            project.scenarios.map((s) => s.id),
          ),
          added =
            mode === "add"
              ? newSloScenario(id)
              : { ...scenario!, id, name: id };
        install(
          { ...project, scenarios: [...project.scenarios, added] },
          { scenarioId: id },
        );
      }
    });
  }
  async function run(all: boolean) {
    if (!ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      const rows = await runSloMatrix(
        project,
        all ? undefined : selection.scenarioId,
        cancelled,
        (done, total) => {
          if (!cancelled()) setProgress({ done, total });
        },
      );
      if (cancelled()) return;
      setRuns(rows);
      setResultKey(rows[0] ? keyOf(rows[0]) : "");
      setPointIndex(rows[0]?.points.length ? rows[0].points.length - 1 : 0);
      setFeedback({
        key: "slo.completed",
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
  async function importFile(
    file: File | undefined,
    kind: "project" | "har" | "ndjson",
  ) {
    if (!file || !ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      if (file.size > (kind === "har" ? 5 * 1024 * 1024 : MAX_SLO_PROJECT))
        throw new SloError("limit");
      const source = await file.text();
      if (cancelled()) return;
      if (kind === "project") {
        install(parseSloProject(source), {}, true);
        setFeedback({ key: "slo.loaded" });
      } else {
        const id = nextId(
            "scenario",
            project.scenarios.map((s) => s.id),
          ),
          result =
            kind === "har"
              ? importSloHar(source, id)
              : { scenario: importSloNdjson(source, id), skipped: 0 };
        install(
          { ...project, scenarios: [...project.scenarios, result.scenario] },
          { scenarioId: id },
        );
        setFeedback({
          key: "slo.imported",
          values: {
            count: String(result.scenario.events.length),
            skipped: String(result.skipped),
          },
        });
      }
    } catch (e) {
      if (!cancelled()) error(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  function download(
    kind: "project" | "report" | "csv" | "toolkit" | "prometheus",
  ) {
    if (!ready()) return;
    attempt(() => {
      if (kind === "csv" && !inspected) throw new SloError("project");
      const source =
        kind === "project"
          ? serializeSloProject(project)
          : kind === "report"
            ? json(sloRunReport(runs ?? [], details))
            : kind === "csv"
              ? sloTimelineCsv(inspected!)
              : kind === "toolkit"
                ? generateSloToolkit(objective)
                : generateSloPrometheus(objective);
      if (getByteSize(source) > 16 * 1024 * 1024) throw new SloError("limit");
      const extension =
          kind === "toolkit"
            ? "mjs"
            : kind === "prometheus"
              ? "yaml"
              : kind === "csv"
                ? "csv"
                : "json",
        type =
          kind === "toolkit"
            ? "text/javascript"
            : kind === "prometheus"
              ? "application/yaml"
              : kind === "csv"
                ? "text/csv"
                : "application/json",
        ok = downloadTextFile(source, `slo-${kind}.${extension}`, type);
      setFeedback({
        key: ok ? "slo.downloaded" : "slo.error.download",
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
  const upload = (kind: "project" | "har" | "ndjson") => (
    <label className="block text-xs font-semibold">
      {t(
        kind === "project"
          ? "slo.import"
          : kind === "har"
            ? "slo.har"
            : "slo.ndjson",
      )}
      <input
        type="file"
        className={inputClass}
        aria-label={t(
          kind === "project"
            ? "slo.import"
            : kind === "har"
              ? "slo.har"
              : "slo.ndjson",
        )}
        accept={
          kind === "har"
            ? ".har,.json,application/json"
            : kind === "ndjson"
              ? ".ndjson,.jsonl,application/x-ndjson"
              : ".json,application/json"
        }
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void importFile(file, kind);
        }}
      />
    </label>
  );
  function selectResult(key: string) {
    setResultKey(key);
    setPointIndex(
      runs?.find((r) => keyOf(r) === key)?.points.length
        ? runs.find((r) => keyOf(r) === key)!.points.length - 1
        : 0,
    );
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("slo.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("slo.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("slo.guide")}
            </summary>
            {(
              [
                "slo.semantics",
                "slo.coverageHelp",
                "slo.alertHelp",
                "slo.monitorHelp",
                "slo.promHelp",
                "slo.limits",
                "slo.privacy",
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
                {t("slo.busy", {
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
                  setFeedback({ key: "slo.cancelled" });
                }}
              >
                {t("slo.cancel")}
              </button>
            </div>
          )}
          {pending && (
            <p className="text-xs font-semibold text-amber-800">
              {t("slo.pending")}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            {actions([
              {
                key: "slo.new",
                action: () => {
                  if (ready())
                    attempt(() => {
                      install(emptySloProject(), {}, true);
                      setFeedback({ key: "slo.loaded" });
                    });
                },
              },
              {
                key: "slo.demo",
                action: () => {
                  if (ready())
                    attempt(() => {
                      install(demoSloProject(), {}, true);
                      setFeedback({ key: "slo.loaded" });
                    });
                },
              },
              { key: "slo.export", action: () => download("project") },
            ])}
            {upload("project")}
            <Field
              label={t("slo.name")}
              value={draft.name}
              onChange={(v) => edit("name", v)}
            />
            {actions([
              { key: "slo.save", action: save, disabled: !pending },
              {
                key: "slo.discard",
                action: () => {
                  setDraft(saved);
                  setFeedback(null);
                },
                disabled: !pending,
              },
            ])}
            <div className="grid gap-5 xl:grid-cols-2">
              <section
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
                aria-label={t("slo.objectives")}
              >
                <h3 className="font-bold">{t("slo.objectives")}</h3>
                <Select
                  label={t("slo.objective")}
                  value={selection.objectiveId}
                  onChange={(objectiveId) => select({ objectiveId })}
                >
                  {project.objectives.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.id})
                    </option>
                  ))}
                </Select>
                {actions([
                  {
                    key: "slo.addObjective",
                    action: () => objectiveAction("add"),
                    disabled: project.objectives.length >= 5,
                  },
                  {
                    key: "slo.cloneObjective",
                    action: () => objectiveAction("clone"),
                    disabled: project.objectives.length >= 5,
                  },
                  {
                    key: "slo.deleteObjective",
                    action: () => objectiveAction("delete"),
                    disabled: project.objectives.length <= 1,
                  },
                ])}
                <Field
                  label={t("slo.objectiveName")}
                  value={draft.objectiveName}
                  onChange={(v) => edit("objectiveName", v)}
                />
                <Select
                  label={t("slo.mode")}
                  value={draft.mode}
                  onChange={(v) => edit("mode", v as SloObjective["mode"])}
                >
                  {(["availability", "latency", "combined"] as const).map(
                    (m) => (
                      <option key={m} value={m}>
                        {t(`slo.mode.${m}`)}
                      </option>
                    ),
                  )}
                </Select>
                <Field
                  label={t("slo.target")}
                  value={draft.target}
                  onChange={(v) => edit("target", v)}
                />
                <Field
                  label={t("slo.window")}
                  value={draft.window}
                  onChange={(v) => edit("window", v)}
                />
                <Field
                  label={t("slo.threshold")}
                  value={draft.threshold}
                  onChange={(v) => edit("threshold", v)}
                />
                <Check
                  label={t("slo.requireCoverage")}
                  checked={draft.requireCoverage}
                  onChange={(v) => edit("requireCoverage", v)}
                />
                <Field
                  label={t("slo.service")}
                  value={draft.service}
                  onChange={(v) => edit("service", v)}
                />
                <Field
                  label={t("slo.route")}
                  value={draft.route}
                  list="slo-route-catalog"
                  onChange={(v) => edit("route", v)}
                />
                <datalist id="slo-route-catalog">
                  {catalog.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                <Field
                  label={t("slo.method")}
                  value={draft.method}
                  onChange={(v) => edit("method", v)}
                />
                {getSchemaText &&
                  actions([
                    {
                      key: "slo.catalog",
                      action: () =>
                        attempt(() => {
                          const source = getSchemaText();
                          if (getByteSize(source) > MAX_SLO_PROJECT)
                            throw new SloError("limit");
                          const parsed = parseOpenApiSchema(source);
                          if (!parsed.ok) {
                            setFeedback({
                              key: "slo.error.schema",
                              error: true,
                            });
                            return;
                          }
                          const labels = [
                            ...new Set(
                              parsed.value.endpoints.map((e) => e.path),
                            ),
                          ];
                          if (labels.length > 500) throw new SloError("limit");
                          setCatalog(labels);
                          setFeedback({
                            key: "slo.catalogDone",
                            values: { count: String(labels.length) },
                          });
                        }),
                    },
                  ])}
                <Field
                  label={t("slo.statuses")}
                  value={draft.statuses}
                  onChange={(v) => edit("statuses", v)}
                  multiline
                />
                <Field
                  label={t("slo.rules")}
                  value={draft.rules}
                  onChange={(v) => edit("rules", v)}
                  multiline
                />
                <p className="text-xs text-slate-600">{t("slo.rulesHelp")}</p>
                {actions([
                  { key: "slo.toolkit", action: () => download("toolkit") },
                  {
                    key: "slo.prometheus",
                    action: () => download("prometheus"),
                  },
                ])}
                <p className="text-xs text-slate-600">{t("slo.exportHelp")}</p>
              </section>
              <section
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
                aria-label={t("slo.scenarios")}
              >
                <h3 className="font-bold">{t("slo.scenarios")}</h3>
                {scenario && (
                  <Select
                    label={t("slo.scenario")}
                    value={selection.scenarioId}
                    onChange={(scenarioId) => select({ scenarioId })}
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
                    key: "slo.addScenario",
                    action: () => scenarioAction("add"),
                    disabled: project.scenarios.length >= 8,
                  },
                  {
                    key: "slo.cloneScenario",
                    action: () => scenarioAction("clone"),
                    disabled: !scenario || project.scenarios.length >= 8,
                  },
                  {
                    key: "slo.deleteScenario",
                    action: () => scenarioAction("delete"),
                    disabled: !scenario,
                  },
                ])}
                {scenario ? (
                  <>
                    <Field
                      label={t("slo.scenarioName")}
                      value={draft.scenarioName}
                      onChange={(v) => edit("scenarioName", v)}
                    />
                    <Field
                      label={t("slo.events")}
                      value={draft.events}
                      onChange={(v) => edit("events", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("slo.eventsHelp")}
                    </p>
                    <Field
                      label={t("slo.coverage")}
                      value={draft.coverage}
                      onChange={(v) => edit("coverage", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("slo.coverageFormat")}
                    </p>
                    {(
                      [
                        { key: "from", label: "slo.from" },
                        { key: "to", label: "slo.to" },
                        { key: "step", label: "slo.step" },
                      ] as const
                    ).map(({ key, label }) => (
                      <Field
                        key={key}
                        label={t(label)}
                        value={draft[key]}
                        onChange={(v) => edit(key, v)}
                      />
                    ))}
                    <Field
                      label={t("slo.expect")}
                      value={draft.expect}
                      onChange={(v) => edit("expect", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("slo.expectHelp")}
                    </p>
                  </>
                ) : (
                  <p>{t("slo.noScenarios")}</p>
                )}
                <details className="space-y-3">
                  <summary className="cursor-pointer text-sm font-bold">
                    {t("slo.generator")}
                  </summary>
                  <Field
                    label={t("slo.generatorSettings")}
                    value={generator}
                    onChange={setGenerator}
                    multiline
                  />
                  <p className="text-xs text-slate-600">
                    {t("slo.generatorHelp")}
                  </p>
                  {actions([
                    {
                      key: "slo.generate",
                      disabled: project.scenarios.length >= 8,
                      action: () => {
                        if (ready())
                          attempt(() => {
                            const id = nextId(
                                "scenario",
                                project.scenarios.map((s) => s.id),
                              ),
                              generated = generateSloTraffic(
                                sloJson(generator) as SloGenerator,
                                id,
                              );
                            install(
                              {
                                ...project,
                                scenarios: [...project.scenarios, generated],
                              },
                              { scenarioId: id },
                            );
                            setFeedback({
                              key: "slo.generated",
                              values: {
                                count: String(generated.events.length),
                              },
                            });
                          });
                      },
                    },
                  ])}
                </details>
                {upload("har")}
                {upload("ndjson")}
                <p className="text-xs text-slate-600">{t("slo.importHelp")}</p>
              </section>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!scenario}
                onClick={() => void run(false)}
              >
                {t("slo.run")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!project.scenarios.length}
                onClick={() => void run(true)}
              >
                {t("slo.runAll")}
              </button>
            </div>
            {runs && (
              <section className="space-y-3">
                <h3 className="font-bold">{t("slo.results")}</h3>
                <Field
                  label={t("slo.search")}
                  value={search}
                  onChange={setSearch}
                  onEscape={() => setSearch("")}
                />
                <div className="max-h-80 overflow-auto">
                  <table
                    className="w-full text-left text-xs"
                    aria-label={t("slo.results")}
                  >
                    <thead>
                      <tr>
                        <th>{t("slo.policyCase")}</th>
                        <th>{t("slo.targetStatus")}</th>
                        <th>{t("slo.verdict")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs
                        .filter((r) =>
                          `${r.objectiveName} ${r.scenarioName}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((r) => (
                          <tr
                            key={keyOf(r)}
                            className={
                              keyOf(r) === resultKey ? "bg-violet-50" : ""
                            }
                          >
                            <td className="p-2">
                              <button
                                type="button"
                                className="underline"
                                onClick={() => selectResult(keyOf(r))}
                              >
                                {r.objectiveName} / {r.scenarioName}
                              </button>
                            </td>
                            <td>{t(`slo.target.${r.target}`)}</td>
                            <td>
                              {t(
                                !r.checked
                                  ? "slo.unchecked"
                                  : r.passed
                                    ? "slo.passed"
                                    : "slo.failed",
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {inspected && point && resultObjective && resultScenario && (
                  <>
                    <Select
                      label={t("slo.result")}
                      value={resultKey}
                      onChange={selectResult}
                    >
                      {runs.map((r) => (
                        <option key={keyOf(r)} value={keyOf(r)}>
                          {r.objectiveName} / {r.scenarioName}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs">
                      {t(
                        "slo.inputStats",
                        Object.fromEntries(
                          Object.entries(inspected.info).map(([k, v]) => [
                            k,
                            String(v),
                          ]),
                        ),
                      )}
                    </p>
                    <label className="block text-xs font-semibold">
                      {t("slo.point")}
                      <input
                        type="range"
                        className="mt-2 w-full"
                        aria-label={t("slo.point")}
                        min={0}
                        max={inspected.points.length - 1}
                        step={1}
                        value={index}
                        onChange={(e) => setPointIndex(Number(e.target.value))}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <Field
                        label={t("slo.time")}
                        value={new Date(point.atMs).toISOString()}
                        readOnly
                      />
                      <Field
                        label={t("slo.targetStatus")}
                        value={t(`slo.target.${point.window.target}`)}
                        readOnly
                      />
                      <Field
                        label={t("slo.confidence")}
                        value={t(`slo.confidence.${point.window.coverage}`)}
                        readOnly
                      />
                      {(
                        [
                          { key: "sliPercent", label: "slo.sli" },
                          { key: "total", label: "slo.units" },
                          { key: "bad", label: "slo.bad" },
                          { key: "allowedBad", label: "slo.allowed" },
                          { key: "remainingBad", label: "slo.remaining" },
                          {
                            key: "remainingPercent",
                            label: "slo.remainingPercent",
                          },
                        ] as const
                      ).map(({ key, label }) => (
                        <Field
                          key={key}
                          label={t(label)}
                          value={numberText(point.window[key])}
                          readOnly
                        />
                      ))}
                      <Field
                        label={t("slo.burn")}
                        value={
                          point.window.infiniteBurn
                            ? "∞"
                            : numberText(point.window.burnRate)
                        }
                        readOnly
                      />
                    </div>
                    <SloCharts
                      run={inspected}
                      index={index}
                      onSelect={setPointIndex}
                    />
                    <div className="overflow-auto">
                      <table
                        className="w-full text-left text-xs"
                        aria-label={t("slo.incidents")}
                      >
                        <thead>
                          <tr>
                            <th>{t("slo.rule")}</th>
                            <th>{t("slo.incidentStart")}</th>
                            <th>{t("slo.incidentEnd")}</th>
                            <th>{t("slo.firingPoints")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspected.incidents.map((incident, i) => (
                            <tr key={i}>
                              <td className="p-2">
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() =>
                                    setPointIndex(
                                      inspected.points.findIndex(
                                        (p) => p.atMs === incident.fromMs,
                                      ),
                                    )
                                  }
                                >
                                  {incident.ruleName}
                                </button>
                              </td>
                              <td>{new Date(incident.fromMs).toISOString()}</td>
                              <td>
                                {incident.toMs === null
                                  ? t("slo.open")
                                  : new Date(incident.toMs).toISOString()}
                              </td>
                              <td>{incident.firingPoints}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm font-bold">
                        {t("slo.decisions")}
                      </summary>
                      <pre
                        className="max-h-96 overflow-auto bg-slate-50 p-3 text-xs"
                        aria-label={t("slo.decisions")}
                      >
                        {json(point)}
                      </pre>
                    </details>
                    <details>
                      <summary className="cursor-pointer text-sm font-bold">
                        {t("slo.samples")}
                      </summary>
                      <div className="max-h-80 overflow-auto">
                        <table
                          className="w-full text-left text-xs"
                          aria-label={t("slo.eventTable")}
                        >
                          <thead>
                            <tr>
                              <th>{t("slo.event")}</th>
                              <th>{t("slo.classification")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resultScenario.events
                              .filter(
                                (e) =>
                                  e.atMs > point.window.fromMs &&
                                  e.atMs <= point.atMs,
                              )
                              .slice(0, 100)
                              .map((e) => (
                                <tr key={e.id}>
                                  <td className="p-2">
                                    {e.name} · {e.service} · {e.method}{" "}
                                    {e.route} · {e.status} · {e.latencyMs} ms ·
                                    ×{e.weight}
                                  </td>
                                  <td>
                                    {classifySloEvent(resultObjective, e)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                    {actions([
                      {
                        key: "slo.record",
                        action: () => {
                          if (ready())
                            attempt(() => {
                              install({
                                ...project,
                                scenarios: project.scenarios.map((s) =>
                                  s.id === inspected.scenarioId
                                    ? {
                                        ...s,
                                        expect: {
                                          ...s.expect,
                                          [inspected.objectiveId]: {
                                            target: inspected.target,
                                            maxFiringPoints:
                                              inspected.firingPoints,
                                            maxIncidents:
                                              inspected.incidents.length,
                                          },
                                        },
                                      }
                                    : s,
                                ),
                              });
                              setFeedback({ key: "slo.recorded" });
                            });
                        },
                      },
                      { key: "slo.csv", action: () => download("csv") },
                    ])}
                  </>
                )}
                <Check
                  label={t("slo.details")}
                  checked={details}
                  onChange={setDetails}
                />
                {actions([
                  { key: "slo.report", action: () => download("report") },
                ])}
              </section>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
