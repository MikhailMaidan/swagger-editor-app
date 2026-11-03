"use client";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { FlagCohortChart, FlagDependencyGraph } from "./flag-visuals";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import {
  MAX_FLAG_PROJECT,
  FlagError,
  emptyFlagProject,
  newFeatureFlag,
  newFlagCase,
  normalizeFlagProject,
  parseFlagProject,
  serializeFlagProject,
  flagJson,
  flagPercentToPpm,
  type FeatureFlag,
  type FlagCase,
  type FlagProject,
  type FlagDefinition,
} from "@/lib/flag-model";
import { createFlagEvaluator, type FlagDecision } from "@/lib/flag-engine";
import {
  demoFlagProject,
  runFlagCases,
  compareFlagDefinitions,
  planFlagRollout,
  flagPlannerContexts,
  flagRunReport,
  flagRunsCsv,
  importFlagNdjson,
  type FlagRun,
  type FlagPlan,
  type FlagComparison,
} from "@/lib/flag-studio";
import { generateFlagToolkit } from "@/lib/flag-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => {
    const pretty = JSON.stringify(v, null, 2);
    return getByteSize(pretty) > MAX_FLAG_PROJECT ? JSON.stringify(v) : pretty;
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
type Selection = { flagId: string; caseId: string };
function drafts(p: FlagProject, s: Selection) {
  const f = p.definition.flags.find((f) => f.id === s.flagId)!,
    c = p.cases.find((c) => c.id === s.caseId);
  return {
    name: p.name,
    environmentSalt: p.definition.salt,
    segments: json(p.definition.segments),
    flagName: f.name,
    kind: f.kind,
    enabled: f.enabled,
    salt: f.salt,
    percent: String(f.rolloutPpm / 10000),
    offValue: json(f.offValue),
    start: f.startMs === null ? "" : String(f.startMs),
    end: f.endMs === null ? "" : String(f.endMs),
    include: json(f.include),
    exclude: json(f.exclude),
    prerequisites: json(f.prerequisites),
    variants: json(f.variants),
    rules: json(f.rules),
    caseName: c?.name ?? "",
    key: c?.context.key ?? "",
    attributes: json(c?.context.attributes ?? {}),
    now: String(c?.context.nowMs ?? 2000),
    expect: json(c?.expect ?? {}),
    candidate: json(p.candidate),
    planner: json(p.planner),
  };
}
type Draft = ReturnType<typeof drafts>;
type Inspection = {
  decision: FlagDecision;
  caseId: string | null;
  name: string;
  stagePpm: number | null;
};
const keyOf = (r: FlagRun) => `${r.caseId}/${r.flagId}`;
export const FlagPanel = memo(function FlagPanel() {
  const { t } = useI18n(),
    [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyFlagProject),
    [selection, setSelection] = useState<Selection>({
      flagId: "flag-1",
      caseId: "case-1",
    }),
    [draft, setDraft] = useState(() =>
      drafts(emptyFlagProject(), { flagId: "flag-1", caseId: "case-1" }),
    ),
    [saved, setSaved] = useState(() =>
      drafts(emptyFlagProject(), { flagId: "flag-1", caseId: "case-1" }),
    );
  const [runs, setRuns] = useState<FlagRun[] | null>(null),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [resultKey, setResultKey] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0),
    [includeTrace, setIncludeTrace] = useState(false),
    [plan, setPlan] = useState<FlagPlan | null>(null),
    [stage, setStage] = useState(0),
    [subject, setSubject] = useState(0),
    [comparison, setComparison] = useState<FlagComparison[] | null>(null),
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
  const flag = project.definition.flags.find((f) => f.id === selection.flagId)!,
    selectedCase = project.cases.find((c) => c.id === selection.caseId),
    pending = (Object.keys(draft) as (keyof Draft)[]).some(
      (k) => draft[k] !== saved[k],
    ),
    filtered = (runs ?? []).filter(
      (r) =>
        `${r.caseName} ${r.flagName}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "served" && r.outcome.served) ||
          (filter === "off" && !r.outcome.served) ||
          (filter === "failed" && r.checked && !r.passed) ||
          (filter === "unchecked" && !r.checked)),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / 50)),
    shownPage = Math.min(page, pages - 1),
    dependents = project.definition.flags.some((f) =>
      f.prerequisites.some((p) => p.flagId === selection.flagId),
    );
  const reason = (r: FlagDecision["reason"]) => t(`flag.reason.${r}`);
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function error(e: unknown) {
    setFeedback({
      key:
        e instanceof FlagError
          ? e.code === "cancelled"
            ? "flag.cancelled"
            : `flag.error.${e.code}`
          : "flag.error.unknown",
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
      setFeedback({ key: "flag.pending", error: true });
      return false;
    }
    return true;
  }
  function nextId(prefix: string, ids: string[]) {
    let n = 1;
    while (ids.includes(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
  function clearOutputs() {
    setRuns(null);
    setInspection(null);
    setResultKey("");
    setPlan(null);
    setComparison(null);
    setPage(0);
  }
  function install(
    value: FlagProject,
    preferred: Partial<Selection> = {},
    fresh = false,
  ) {
    const p = normalizeFlagProject(value),
      old: Partial<Selection> = fresh ? {} : selection,
      s = {
        flagId:
          p.definition.flags.find(
            (f) => f.id === (preferred.flagId ?? old.flagId),
          )?.id ?? p.definition.flags[0].id,
        caseId:
          p.cases.find((c) => c.id === (preferred.caseId ?? old.caseId))?.id ??
          p.cases[0]?.id ??
          "",
      },
      next = drafts(p, s);
    setProject(p);
    setSelection(s);
    setDraft(next);
    setSaved(next);
    clearOutputs();
    setFeedback(null);
    if (fresh) {
      setSearch("");
      setFilter("all");
    }
  }
  function select(preferred: Partial<Selection>) {
    if (!ready()) return;
    const s = { ...selection, ...preferred },
      next = drafts(project, s);
    setSelection(s);
    setDraft(next);
    setSaved(next);
    setFeedback(null);
    if (preferred.flagId) {
      setPlan(null);
      setComparison(null);
      setInspection(null);
    }
  }
  function save() {
    attempt(() => {
      const nextFlag = {
        ...flag,
        name: draft.flagName,
        kind: draft.kind,
        enabled: draft.enabled,
        salt: draft.salt,
        rolloutPpm: flagPercentToPpm(draft.percent),
        offValue: flagJson(draft.offValue),
        startMs: draft.start.trim() === "" ? null : integer(draft.start),
        endMs: draft.end.trim() === "" ? null : integer(draft.end),
        include: flagJson(draft.include),
        exclude: flagJson(draft.exclude),
        prerequisites: flagJson(draft.prerequisites),
        variants: flagJson(draft.variants),
        rules: flagJson(draft.rules),
      } as FeatureFlag;
      install({
        ...project,
        name: draft.name,
        definition: {
          salt: draft.environmentSalt,
          segments: flagJson(draft.segments) as FlagDefinition["segments"],
          flags: project.definition.flags.map((f) =>
            f.id === flag.id ? nextFlag : f,
          ),
        },
        candidate: flagJson(draft.candidate) as FlagDefinition | null,
        planner: flagJson(draft.planner) as FlagProject["planner"],
        cases: project.cases.map((c) =>
          c.id === selection.caseId
            ? {
                ...c,
                name: draft.caseName,
                context: {
                  key: draft.key,
                  attributes: flagJson(
                    draft.attributes,
                  ) as FlagCase["context"]["attributes"],
                  nowMs: integer(draft.now),
                },
                expect: flagJson(draft.expect) as FlagCase["expect"],
              }
            : c,
        ),
      });
      setFeedback({ key: "flag.saved" });
    });
  }
  function flagAction(action: "add" | "clone" | "delete" | "clear") {
    if (!ready()) return;
    attempt(() => {
      if (action === "clear") {
        install({
          ...project,
          cases: project.cases.map((c) => ({
            ...c,
            expect: Object.fromEntries(
              Object.entries(c.expect).filter(
                ([id]) => id !== selection.flagId,
              ),
            ),
          })),
        });
        return;
      }
      if (action === "delete") {
        if (project.definition.flags.length === 1 || dependents)
          throw new FlagError("reference");
        install({
          ...project,
          definition: {
            ...project.definition,
            flags: project.definition.flags.filter(
              (f) => f.id !== selection.flagId,
            ),
          },
          cases: project.cases.map((c) => ({
            ...c,
            expect: Object.fromEntries(
              Object.entries(c.expect).filter(
                ([id]) => id !== selection.flagId,
              ),
            ),
          })),
        });
        return;
      }
      const id = nextId(
          "flag",
          project.definition.flags.map((f) => f.id),
        ),
        added =
          action === "add" ? newFeatureFlag(id) : { ...flag, id, name: id };
      install(
        {
          ...project,
          definition: {
            ...project.definition,
            flags: [...project.definition.flags, added],
          },
        },
        { flagId: id },
      );
    });
  }
  function caseAction(action: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (action === "delete")
        install({
          ...project,
          cases: project.cases.filter((c) => c.id !== selection.caseId),
        });
      else {
        const id = nextId(
            "case",
            project.cases.map((c) => c.id),
          ),
          added =
            action === "add"
              ? newFlagCase(id)
              : { ...selectedCase!, id, name: id };
        install(
          { ...project, cases: [...project.cases, added] },
          { caseId: id },
        );
      }
    });
  }
  async function job<T>(
    work: (
      cancelled: () => boolean,
      report: (done: number, total: number) => void,
    ) => Promise<T>,
    publish: (result: T) => void,
  ) {
    if (!ready()) return;
    const token = ++generation.current,
      cancelled = () => generation.current !== token;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      const result = await work(cancelled, (done, total) => {
        if (!cancelled()) setProgress({ done, total });
      });
      if (!cancelled()) publish(result);
    } catch (e) {
      if (!cancelled()) error(e);
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  async function run(all: boolean) {
    await job(
      async (cancelled, report) => {
        const rows = await runFlagCases(
            project,
            all ? undefined : selection.caseId,
            cancelled,
            report,
          ),
          first = rows[0],
          c = first ? project.cases.find((c) => c.id === first.caseId) : null,
          decision = c
            ? (
                await createFlagEvaluator(project.definition)(c.context, [
                  first.flagId,
                ])
              )[0]
            : null;
        return { rows, first, decision };
      },
      ({ rows, first, decision }) => {
        setRuns(rows);
        setResultKey(first ? keyOf(first) : "");
        setInspection(
          first && decision
            ? {
                decision,
                caseId: first.caseId,
                name: first.caseName,
                stagePpm: null,
              }
            : null,
        );
        setPage(0);
        setFeedback({
          key: "flag.completed",
          values: {
            passed: String(rows.filter((r) => r.passed).length),
            checked: String(rows.filter((r) => r.checked).length),
            total: String(rows.length),
          },
        });
      },
    );
  }
  async function inspect(r: FlagRun) {
    const c = project.cases.find((c) => c.id === r.caseId);
    if (!c) return;
    await job(
      async () => {
        return (
          await createFlagEvaluator(project.definition)(c.context, [r.flagId])
        )[0];
      },
      (decision) => {
        setResultKey(keyOf(r));
        setInspection({ decision, caseId: c.id, name: c.name, stagePpm: null });
        setFeedback({ key: "flag.ready" });
      },
    );
  }
  async function analyze() {
    await job(
      (cancelled, report) =>
        planFlagRollout(
          project.definition,
          project.planner,
          selection.flagId,
          cancelled,
          report,
        ),
      (result) => {
        setPlan(result);
        setStage(0);
        setSubject(0);
        setFeedback({
          key: "flag.planned",
          values: {
            count: String(result.count),
            stages: String(result.stages.length),
          },
        });
      },
    );
  }
  async function compare() {
    if (!project.candidate) return;
    await job(
      (cancelled, report) =>
        compareFlagDefinitions(
          project.definition,
          project.candidate!,
          project.cases,
          selection.flagId,
          cancelled,
          report,
        ),
      (rows) => {
        setComparison(rows);
        setFeedback({
          key: "flag.compared",
          values: {
            count: String(rows.length),
            changed: String(rows.filter((r) => r.changed).length),
          },
        });
      },
    );
  }
  async function inspectCohort() {
    if (!plan) return;
    const cohort = flagPlannerContexts(project.planner)[subject],
      stagePpm = plan.stages[stage].rolloutPpm,
      definition = {
        ...project.definition,
        flags: project.definition.flags.map((f) =>
          f.id === plan.flagId ? { ...f, rolloutPpm: stagePpm } : f,
        ),
      };
    await job(
      async () => {
        return (
          await createFlagEvaluator(definition)(cohort, [plan.flagId])
        )[0];
      },
      (decision) => {
        setInspection({
          decision,
          caseId: null,
          name: `${t("flag.subject")} ${subject + 1}`,
          stagePpm,
        });
        setResultKey("");
        setFeedback({ key: "flag.ready" });
      },
    );
  }
  function generate() {
    if (!ready()) return;
    attempt(() => {
      const contexts = flagPlannerContexts(project.planner),
        used = project.cases.map((c) => c.id),
        added = contexts.map((context, i) => {
          const id = nextId("generated", used);
          used.push(id);
          return {
            id,
            name: `${project.planner.prefix} ${i + 1}`,
            context,
            expect: {},
          };
        });
      install(
        { ...project, cases: [...project.cases, ...added] },
        { caseId: added[0]?.id },
      );
      setFeedback({
        key: "flag.generated",
        values: { count: String(added.length) },
      });
    });
  }
  async function importFile(file: File | undefined, traffic: boolean) {
    if (!file || !ready()) return;
    await job(
      async (cancelled) => {
        if (file.size > MAX_FLAG_PROJECT) throw new FlagError("limit");
        const source = await file.text();
        if (cancelled()) throw new FlagError("cancelled");
        return source;
      },
      (source) => {
        attempt(() => {
          if (traffic) {
            const added = importFlagNdjson(source);
            install(
              { ...project, cases: [...project.cases, ...added] },
              { caseId: added[0]?.id },
            );
            setFeedback({ key: "flag.imported" });
          } else {
            install(parseFlagProject(source), {}, true);
            setFeedback({ key: "flag.loaded" });
          }
        });
      },
    );
  }
  function download(
    kind: "project" | "toolkit" | "report" | "csv" | "plan" | "comparison",
  ) {
    if (!ready()) return;
    attempt(() => {
      const source =
        kind === "project"
          ? serializeFlagProject(project)
          : kind === "toolkit"
            ? generateFlagToolkit(project.definition)
            : kind === "csv"
              ? flagRunsCsv(runs ?? [])
              : kind === "plan"
                ? json({
                    kind: "rsswag-flag-cohort-report",
                    version: 1,
                    ...plan,
                  })
                : kind === "comparison"
                  ? json({
                      kind: "rsswag-flag-comparison",
                      version: 1,
                      flagId: selection.flagId,
                      rows: comparison,
                    })
                  : json({
                      ...flagRunReport(
                        runs ?? [],
                        includeTrace ? (inspection?.decision ?? null) : null,
                      ),
                      inspection:
                        includeTrace && inspection
                          ? {
                              caseId: inspection.caseId,
                              stagePpm: inspection.stagePpm,
                            }
                          : null,
                    });
      if (getByteSize(source) > 16 * 1024 * 1024) throw new FlagError("limit");
      const ext = kind === "toolkit" ? "mjs" : kind === "csv" ? "csv" : "json",
        ok = downloadTextFile(
          source,
          `flags-${kind}.${ext}`,
          kind === "toolkit"
            ? "text/javascript"
            : kind === "csv"
              ? "text/csv"
              : "application/json",
        );
      setFeedback({
        key: ok ? "flag.downloaded" : "flag.error.download",
        error: !ok,
      });
    });
  }
  const upload = (traffic: boolean) => (
    <label className="block text-xs font-semibold">
      {t(traffic ? "flag.ndjson" : "flag.import")}
      <input
        type="file"
        className={inputClass}
        aria-label={t(traffic ? "flag.ndjson" : "flag.import")}
        accept={
          traffic
            ? ".ndjson,.jsonl,application/x-ndjson"
            : ".json,application/json"
        }
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void importFile(file, traffic);
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
        {t("flag.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("flag.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("flag.guide")}
            </summary>
            {(
              [
                "flag.semantics",
                "flag.buckets",
                "flag.gates",
                "flag.privacy",
                "flag.limits",
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
                {t("flag.busy", {
                  done: String(progress.done),
                  total: String(progress.total),
                })}
              </p>
              <Action
                label={t("flag.cancel")}
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  setFeedback({ key: "flag.cancelled" });
                }}
              />
            </div>
          )}
          {pending && (
            <p className="text-xs font-semibold text-amber-800">
              {t("flag.pending")}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-2">
              <Action
                label={t("flag.new")}
                onClick={() => {
                  if (ready())
                    attempt(() => install(emptyFlagProject(), {}, true));
                }}
              />
              <Action
                label={t("flag.demo")}
                onClick={() => {
                  if (ready())
                    attempt(() =>
                      install(demoFlagProject(), { flagId: "checkout" }, true),
                    );
                }}
              />
              <Action
                label={t("flag.export")}
                onClick={() => download("project")}
              />
            </div>
            {upload(false)}
            <Field
              label={t("flag.name")}
              value={draft.name}
              onChange={(v) => edit("name", v)}
            />
            <div className="flex flex-wrap gap-2">
              <Action
                label={t("flag.save")}
                onClick={save}
                disabled={!pending}
              />
              <Action
                label={t("flag.discard")}
                onClick={() => {
                  setDraft(saved);
                  setFeedback(null);
                }}
                disabled={!pending}
              />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <section
                aria-label={t("flag.flags")}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <h3 className="font-bold">{t("flag.flags")}</h3>
                <Field
                  label={t("flag.environmentSalt")}
                  value={draft.environmentSalt}
                  onChange={(v) => edit("environmentSalt", v)}
                />
                <Select
                  label={t("flag.selected")}
                  value={selection.flagId}
                  onChange={(flagId) => select({ flagId })}
                >
                  {project.definition.flags.map((f) => (
                    <option value={f.id} key={f.id}>
                      {f.name} ({f.id})
                    </option>
                  ))}
                </Select>
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("flag.addFlag")}
                    disabled={project.definition.flags.length >= 16}
                    onClick={() => flagAction("add")}
                  />
                  <Action
                    label={t("flag.cloneFlag")}
                    disabled={project.definition.flags.length >= 16}
                    onClick={() => flagAction("clone")}
                  />
                  <Action
                    label={t("flag.deleteFlag")}
                    disabled={
                      project.definition.flags.length === 1 || dependents
                    }
                    onClick={() => flagAction("delete")}
                  />
                  <Action
                    label={t("flag.clearExpectations")}
                    onClick={() => flagAction("clear")}
                  />
                </div>
                <Field
                  label={t("flag.flagName")}
                  value={draft.flagName}
                  onChange={(v) => edit("flagName", v)}
                />
                <Select
                  label={t("flag.kind")}
                  value={draft.kind}
                  onChange={(v) => edit("kind", v as FeatureFlag["kind"])}
                >
                  {["boolean", "string", "number", "json"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </Select>
                <Check
                  label={t("flag.enabled")}
                  checked={draft.enabled}
                  onChange={(v) => edit("enabled", v)}
                />
                {(
                  [
                    { key: "salt", label: "flag.salt" },
                    { key: "percent", label: "flag.percent" },
                    { key: "start", label: "flag.start" },
                    { key: "end", label: "flag.end" },
                  ] as const
                ).map(({ key, label }) => (
                  <Field
                    key={key}
                    label={t(label)}
                    value={draft[key]}
                    onChange={(v) => edit(key, v)}
                  />
                ))}
                {(
                  [
                    { key: "offValue", label: "flag.offValue" },
                    { key: "include", label: "flag.include" },
                    { key: "exclude", label: "flag.exclude" },
                    { key: "prerequisites", label: "flag.prerequisites" },
                    { key: "variants", label: "flag.variants" },
                    { key: "rules", label: "flag.rules" },
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
                <p className="text-xs text-slate-600">{t("flag.flagHelp")}</p>
                <Field
                  label={t("flag.segments")}
                  value={draft.segments}
                  onChange={(v) => edit("segments", v)}
                  multiline
                />
                <p className="text-xs text-slate-600">
                  {t("flag.segmentHelp")}
                </p>
                <Action
                  label={t("flag.toolkit")}
                  onClick={() => download("toolkit")}
                />
                <p className="text-xs text-slate-600">{t("flag.exportHelp")}</p>
              </section>
              <section
                aria-label={t("flag.cases")}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <h3 className="font-bold">{t("flag.cases")}</h3>
                {!!project.cases.length && (
                  <Select
                    label={t("flag.case")}
                    value={selection.caseId}
                    onChange={(caseId) => select({ caseId })}
                  >
                    {project.cases.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                  </Select>
                )}
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("flag.addCase")}
                    onClick={() => caseAction("add")}
                    disabled={project.cases.length >= 200}
                  />
                  <Action
                    label={t("flag.cloneCase")}
                    onClick={() => caseAction("clone")}
                    disabled={!selectedCase || project.cases.length >= 200}
                  />
                  <Action
                    label={t("flag.deleteCase")}
                    onClick={() => caseAction("delete")}
                    disabled={!selectedCase}
                  />
                </div>
                {selectedCase ? (
                  <>
                    <Field
                      label={t("flag.caseName")}
                      value={draft.caseName}
                      onChange={(v) => edit("caseName", v)}
                    />
                    <Field
                      label={t("flag.key")}
                      value={draft.key}
                      onChange={(v) => edit("key", v)}
                    />
                    <Field
                      label={t("flag.attributes")}
                      value={draft.attributes}
                      onChange={(v) => edit("attributes", v)}
                      multiline
                    />
                    <Field
                      label={t("flag.now")}
                      value={draft.now}
                      onChange={(v) => edit("now", v)}
                    />
                    <Field
                      label={t("flag.expect")}
                      value={draft.expect}
                      onChange={(v) => edit("expect", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("flag.expectHelp")}
                    </p>
                  </>
                ) : (
                  <p>{t("flag.noCases")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("flag.run")}
                    onClick={() => void run(false)}
                    disabled={!selectedCase}
                  />
                  <Action
                    label={t("flag.runAll")}
                    onClick={() => void run(true)}
                    disabled={!project.cases.length}
                  />
                </div>
                {upload(true)}
                <p className="text-xs text-slate-600">{t("flag.ndjsonHelp")}</p>
                <Field
                  label={t("flag.candidate")}
                  value={draft.candidate}
                  onChange={(v) => edit("candidate", v)}
                  multiline
                />
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("flag.copyCandidate")}
                    onClick={() => {
                      if (ready())
                        attempt(() =>
                          install({
                            ...project,
                            candidate: structuredClone(project.definition),
                          }),
                        );
                    }}
                  />
                  <Action
                    label={t("flag.clearCandidate")}
                    onClick={() => {
                      if (ready())
                        attempt(() => install({ ...project, candidate: null }));
                    }}
                  />
                  <Action
                    label={t("flag.compare")}
                    onClick={() => void compare()}
                    disabled={!project.candidate || !project.cases.length}
                  />
                </div>
                <p className="text-xs text-slate-600">
                  {t("flag.candidateHelp")}
                </p>
              </section>
            </div>
            <FlagDependencyGraph
              definition={project.definition}
              selected={selection.flagId}
              onSelect={(flagId) => select({ flagId })}
            />
            <section aria-label={t("flag.planner")} className="space-y-3">
              <h3 className="font-bold">{t("flag.planner")}</h3>
              <Field
                label={t("flag.plannerSettings")}
                value={draft.planner}
                onChange={(v) => edit("planner", v)}
                multiline
              />
              <p className="text-xs text-slate-600">
                {t("flag.plannerFields")}
              </p>
              <p className="text-xs text-slate-600">{t("flag.plannerHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <Action label={t("flag.plan")} onClick={() => void analyze()} />
                <Action
                  label={t("flag.generate")}
                  onClick={generate}
                  disabled={project.cases.length >= 200}
                />
              </div>
              {plan && (
                <>
                  <div className="overflow-auto">
                    <table
                      className="w-full text-left text-xs"
                      aria-label={t("flag.planner")}
                    >
                      <thead>
                        <tr>
                          <th>{t("flag.stage")}</th>
                          <th>{t("flag.served")}</th>
                          <th>{t("flag.entered")}</th>
                          <th>{t("flag.exited")}</th>
                          <th>{t("flag.reassigned")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.stages.map((s) => (
                          <tr key={s.rolloutPpm}>
                            <td>{s.rolloutPpm / 10000}%</td>
                            <td>
                              {s.served}/{plan.count}
                            </td>
                            <td>{s.entered}</td>
                            <td>{s.exited}</td>
                            <td>{s.reassigned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <FlagCohortChart
                    plan={plan}
                    variantIds={flag.variants.map((v) => v.id)}
                    stage={stage}
                    subject={subject}
                    onSelect={(s, i) => {
                      setStage(s);
                      setSubject(i);
                    }}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label={t("flag.stage")}
                      value={String(stage)}
                      onChange={(v) => setStage(Number(v))}
                    >
                      {plan.stages.map((s, i) => (
                        <option value={i} key={s.rolloutPpm}>
                          {s.rolloutPpm / 10000}%
                        </option>
                      ))}
                    </Select>
                    <Select
                      label={t("flag.subject")}
                      value={String(subject)}
                      onChange={(v) => setSubject(Number(v))}
                    >
                      {Array.from({ length: plan.count }, (_, i) => (
                        <option key={i} value={i}>
                          {i + 1}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Action
                      label={t("flag.inspectCohort")}
                      onClick={() => void inspectCohort()}
                    />
                    <Action
                      label={t("flag.planReport")}
                      onClick={() => download("plan")}
                    />
                  </div>
                </>
              )}
            </section>
            {comparison && (
              <section className="space-y-3" aria-label={t("flag.comparison")}>
                <h3 className="font-bold">{t("flag.comparison")}</h3>
                <div className="max-h-96 overflow-auto">
                  <table
                    className="w-full text-left text-xs"
                    aria-label={t("flag.comparison")}
                  >
                    <thead>
                      <tr>
                        <th>{t("flag.caseName")}</th>
                        <th>{t("flag.before")}</th>
                        <th>{t("flag.after")}</th>
                        <th>{t("flag.assignmentChanged")}</th>
                        <th>{t("flag.valueChanged")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((r) => (
                        <tr key={r.caseId}>
                          <td className="p-2">{r.caseName}</td>
                          <td>
                            {r.before.variantId ?? t("flag.off")}:{" "}
                            {reason(r.before.reason)}
                          </td>
                          <td>
                            {r.after.variantId ?? t("flag.off")}:{" "}
                            {reason(r.after.reason)}
                          </td>
                          <td>{String(r.assignmentChanged)}</td>
                          <td>{String(r.valueChanged)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Action
                  label={t("flag.compareReport")}
                  onClick={() => download("comparison")}
                />
              </section>
            )}
            {runs && (
              <section aria-label={t("flag.results")} className="space-y-3">
                <h3 className="font-bold">{t("flag.results")}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t("flag.search")}
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(0);
                    }}
                    onEscape={() => {
                      setSearch("");
                      setPage(0);
                    }}
                  />
                  <Select
                    label={t("flag.filter")}
                    value={filter}
                    onChange={(v) => {
                      setFilter(v);
                      setPage(0);
                    }}
                  >
                    {[
                      { id: "all", label: "flag.all" },
                      { id: "served", label: "flag.onlyServed" },
                      { id: "off", label: "flag.onlyOff" },
                      { id: "failed", label: "flag.onlyFailed" },
                      { id: "unchecked", label: "flag.onlyUnchecked" },
                    ].map((v) => (
                      <option key={v.id} value={v.id}>
                        {t(v.label as TranslationKey)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="overflow-auto">
                  <table
                    className="w-full text-left text-xs"
                    aria-label={t("flag.results")}
                  >
                    <thead>
                      <tr>
                        <th>{t("flag.contextFlag")}</th>
                        <th>{t("flag.variant")}</th>
                        <th>{t("flag.reason")}</th>
                        <th>{t("flag.verdict")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .slice(shownPage * 50, shownPage * 50 + 50)
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
                                onClick={() => void inspect(r)}
                              >
                                {r.caseName} / {r.flagName}
                              </button>
                            </td>
                            <td>{r.outcome.variantId ?? t("flag.off")}</td>
                            <td>{reason(r.outcome.reason)}</td>
                            <td>
                              {t(
                                !r.checked
                                  ? "flag.unchecked"
                                  : r.passed
                                    ? "flag.passed"
                                    : "flag.failed",
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs">
                  {t("flag.page", {
                    page: String(shownPage + 1),
                    total: String(pages),
                    count: String(filtered.length),
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("flag.previous")}
                    onClick={() => setPage(Math.max(0, shownPage - 1))}
                    disabled={shownPage === 0}
                  />
                  <Action
                    label={t("flag.next")}
                    onClick={() => setPage(Math.min(pages - 1, shownPage + 1))}
                    disabled={shownPage === pages - 1}
                  />
                </div>
                <Check
                  label={t("flag.includeTrace")}
                  checked={includeTrace}
                  onChange={setIncludeTrace}
                />
                <div className="flex flex-wrap gap-2">
                  <Action
                    label={t("flag.report")}
                    onClick={() => download("report")}
                  />
                  <Action
                    label={t("flag.csv")}
                    onClick={() => download("csv")}
                  />
                </div>
              </section>
            )}
            {inspection && (
              <section className="space-y-3" aria-label={t("flag.inspection")}>
                <h3 className="font-bold">
                  {t("flag.inspection")}: {inspection.name} /{" "}
                  {inspection.decision.flagId}
                  {inspection.stagePpm === null
                    ? ""
                    : ` (${inspection.stagePpm / 10000}%)`}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label={t("flag.served")}
                    value={String(inspection.decision.served)}
                  />
                  <Field
                    label={t("flag.variant")}
                    value={inspection.decision.variantId ?? "—"}
                  />
                  <Field
                    label={t("flag.reason")}
                    value={reason(inspection.decision.reason)}
                  />
                </div>
                <Field
                  label={t("flag.value")}
                  value={json(inspection.decision.value)}
                  multiline
                />
                <p className="text-xs text-slate-600">
                  {t("flag.inspectionHelp")}
                </p>
                <details>
                  <summary className="cursor-pointer text-sm font-bold">
                    {t("flag.trace")}
                  </summary>
                  <pre
                    className="max-h-96 overflow-auto bg-slate-50 p-3 text-xs"
                    aria-label={t("flag.trace")}
                  >
                    {json(
                      (({ value: privateValue, ...rest }) => {
                        void privateValue;
                        return rest;
                      })(inspection.decision),
                    )}
                  </pre>
                </details>
                <Action
                  label={t("flag.record")}
                  disabled={inspection.caseId === null}
                  onClick={() => {
                    if (ready())
                      attempt(() => {
                        const { decision, caseId } = inspection;
                        install({
                          ...project,
                          cases: project.cases.map((c) =>
                            c.id === caseId
                              ? {
                                  ...c,
                                  expect: {
                                    ...c.expect,
                                    [decision.flagId]: {
                                      served: decision.served,
                                      variantId: decision.variantId,
                                      reason: decision.reason,
                                    },
                                  },
                                }
                              : c,
                          ),
                        });
                        setFeedback({ key: "flag.recorded" });
                      });
                  }}
                />
              </section>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
