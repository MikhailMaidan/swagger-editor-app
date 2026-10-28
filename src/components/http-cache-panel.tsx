"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { CacheError, cacheError, type CacheMode } from "@/lib/http-cache";
import {
  CACHE_METHODS,
  CACHE_OUTCOMES,
  MAX_CACHE_POLICIES,
  MAX_CACHE_PROJECT_BYTES,
  MAX_CACHE_SCENARIOS,
  MAX_CACHE_STEPS,
  defaultCacheBudgets,
  defaultCacheStep,
  emptyCacheProject,
  normalizeCacheProject,
  parseCacheProject,
  serializeCacheProject,
  type CacheBudgets,
  type CacheOutcome,
  type CacheProject,
} from "@/lib/http-cache-project";
import {
  cacheRunReport,
  runCacheProject,
  type CacheRun,
  type CacheSimulation,
} from "@/lib/http-cache-engine";
import { demoCacheProject } from "@/lib/http-cache-demo";
import { cacheProjectFromHar } from "@/lib/http-cache-har";
import type { TranslationKey } from "@/lib/translations";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const number = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const budgetKeys = [
  "minHitPercent",
  "maxOriginRequests",
  "maxOriginBodyBytes",
  "maxErrors",
] as const;
function parsed(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new CacheError("json");
  }
}
function nextId(prefix: string, ids: string[]) {
  let i = 1;
  while (ids.includes(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
function draftFor(
  project: CacheProject,
  policyId: string,
  scenarioId: string,
  stepId: string,
) {
  const p = project.policies.find((p) => p.id === policyId)!;
  const s = project.scenarios.find((s) => s.id === scenarioId)!;
  const r = s.steps.find((r) => r.id === stepId)!;
  return {
    name: project.name,
    startTime: project.startTime,
    policy: {
      ...p,
      capacity: String(p.capacity),
      maxBodyBytes: String(p.maxBodyBytes),
    },
    scenario: {
      name: s.name,
      budgets: Object.fromEntries(
        budgetKeys.map((k) => [k, String(s.budgets[k])]),
      ) as Record<keyof CacheBudgets, string>,
    },
    step: {
      name: r.name,
      atMs: String(r.atMs),
      method: r.method,
      url: r.url,
      headers: json(r.headers),
      kind: r.origin?.kind ?? "none",
      status: String(r.origin?.kind === "response" ? r.origin.status : 200),
      delayMs: String(r.origin?.delayMs ?? 0),
      responseHeaders: json(
        r.origin?.kind === "response" ? r.origin.headers : {},
      ),
      body: r.origin?.kind === "response" ? r.origin.body : "",
      expectOutcome: r.expect.outcome ?? "",
      expectStatus:
        r.expect.status === undefined ? "" : String(r.expect.status),
    },
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
          rows={5}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
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
  disabled = false,
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
function CacheDetails({
  simulation,
  onDownload,
}: {
  simulation: CacheSimulation;
  onDownload: (source: string, name: string) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [rowId, setRowId] = useState(""),
    [entryId, setEntryId] = useState("");
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = simulation.rows.filter(
    (r) =>
      (filter === "all" || r.outcome === filter) &&
      terms.every((term) =>
        `${r.name} ${r.method} ${r.url} ${r.status} ${t(`cache.outcome.${r.outcome}`)} ${r.notes.map((n) => t(`cache.reason.${n}`)).join(" ")}`
          .toLowerCase()
          .includes(term),
      ),
  );
  const selected =
    simulation.rows.find((r) => r.id === rowId) ?? simulation.rows[0];
  const entry =
    simulation.entries.find((e) => String(e.id) === entryId) ??
    simulation.entries[0];
  const end = Math.max(1, ...simulation.rows.map((r) => r.completedMs));
  return (
    <section
      aria-label={t("cache.result")}
      className="space-y-4 rounded-xl border p-3"
    >
      <h4 className="font-bold">
        {simulation.scenarioName} / {simulation.policyName}
      </h4>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Object.entries(simulation.metrics).map(([key, value]) => (
          <div key={key} className="rounded-lg bg-slate-50 p-2 text-xs">
            <p>{t(`cache.metric.${key}` as TranslationKey)}</p>
            <strong className="text-lg">{value}</strong>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-xs">
        {simulation.budgets.map((b) => (
          <li key={b.id}>
            {t(`cache.budget.${b.id}`)}: {b.actual} / {b.limit} ·{" "}
            {t(b.passed ? "cache.passed" : "cache.failed")}
          </li>
        ))}
      </ul>
      <h4 className="font-bold">{t("cache.timeline")}</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold">
          {t("cache.search")}
          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSearch("");
              }
            }}
          />
        </label>
        <Select label={t("cache.filter")} value={filter} onChange={setFilter}>
          <option value="all">{t("cache.all")}</option>
          {CACHE_OUTCOMES.map((v) => (
            <option key={v} value={v}>
              {t(`cache.outcome.${v}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{t("cache.timeline")}</caption>
          <thead>
            <tr>
              {["time", "request", "decision", "freshness", "check"].map(
                (k) => (
                  <th key={k} className="p-2">
                    {t(`cache.column.${k}` as TranslationKey)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {matches.map((r) => (
              <tr
                key={r.id}
                className={r.id === selected.id ? "bg-purple-50" : "border-t"}
              >
                <td className="p-2 tabular-nums">
                  {r.atMs}–{r.completedMs}
                  <div
                    aria-hidden="true"
                    className="mt-1 h-1 min-w-24 rounded bg-slate-100"
                  >
                    <div
                      className="h-1 min-w-1 rounded bg-purple-500"
                      style={{
                        marginLeft: `${(r.atMs / end) * 95}%`,
                        width: `${Math.max(1, ((r.completedMs - r.atMs) / end) * 95)}%`,
                      }}
                    />
                  </div>
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    className="text-left font-bold underline"
                    aria-label={`${t("cache.inspect")}: ${r.name}`}
                    aria-pressed={selected.id === r.id}
                    onClick={() => setRowId(r.id)}
                  >
                    {r.name}
                  </button>
                  <p>{r.method}</p>
                </td>
                <td className="p-2">
                  {t(`cache.outcome.${r.outcome}`)} / {r.status || "—"}
                </td>
                <td className="p-2">
                  {r.freshness
                    ? `${Math.round(r.freshness.ageMs / 10) / 100} / ${r.freshness.lifetimeMs / 1000}`
                    : "—"}
                </td>
                <td className="p-2">
                  {t(r.passed ? "cache.passed" : "cache.failed")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!matches.length && <p className="text-xs">{t("cache.noMatches")}</p>}
      <section
        aria-label={t("cache.inspector")}
        className="space-y-3 rounded-lg bg-slate-50 p-3"
      >
        <h5 className="text-sm font-bold">
          {selected.name}: {t(`cache.outcome.${selected.outcome}`)}
        </h5>
        <p className="break-all font-mono text-xs">
          {selected.method} {selected.url}
        </p>
        <ul className="list-inside list-disc text-xs">
          {selected.notes.map((n, i) => (
            <li key={i}>{t(`cache.reason.${n}`)}</li>
          ))}
        </ul>
        <Field
          label={t("cache.inspectedHeaders")}
          value={json({
            status: selected.status,
            headers: selected.headers,
            conditional: selected.conditional,
            freshness: selected.freshness,
          })}
          multiline
          readOnly
        />
        <Field
          label={t("cache.inspectedBody")}
          value={selected.body}
          multiline
          readOnly
        />
        <button
          type="button"
          className={buttonClass}
          disabled={!selected.status}
          onClick={() =>
            onDownload(
              json({
                status: selected.status,
                headers: selected.headers,
                body: selected.body,
              }),
              "http-cache-response.json",
            )
          }
        >
          {t("cache.responseExport")}
        </button>
      </section>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-bold">
          {t("cache.entries")}
        </summary>
        {entry ? (
          <>
            <Select
              label={t("cache.entry")}
              value={String(entry.id)}
              onChange={setEntryId}
            >
              {simulation.entries.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.id}: {e.url} [{e.vary.join(", ")}]
                </option>
              ))}
            </Select>
            <Field
              label={t("cache.entryData")}
              value={json(entry)}
              multiline
              readOnly
            />
          </>
        ) : (
          <p className="text-xs">{t("cache.noEntries")}</p>
        )}
      </details>
    </section>
  );
}

export const HttpCachePanel = memo(function HttpCachePanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyCacheProject);
  const [policyId, setPolicyId] = useState("private"),
    [scenarioId, setScenarioId] = useState("scenario-1"),
    [stepId, setStepId] = useState("request-1");
  const [draft, setDraft] = useState(() =>
    draftFor(emptyCacheProject(), "private", "scenario-1", "request-1"),
  );
  const [run, setRun] = useState<CacheRun | null>(null),
    [resultIndex, setResultIndex] = useState("0"),
    [reading, setReading] = useState(false);
  const [feedback, setFeedback] = useState<{
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
  const policy = project.policies.find((p) => p.id === policyId)!;
  const scenario = project.scenarios.find((s) => s.id === scenarioId)!;
  const pending =
    json(draft) !== json(draftFor(project, policyId, scenarioId, stepId));
  const locked = pending || reading;
  const result = run?.simulations[Number(resultIndex)] ?? run?.simulations[0];
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, error: false, values });
  const fail = (e: unknown) =>
    setFeedback({ key: `cache.error.${cacheError(e)}`, error: true });
  function install(
    next: CacheProject,
    p = next.policies[0].id,
    s = next.scenarios[0].id,
    r = next.scenarios.find((v) => v.id === s)!.steps[0].id,
  ) {
    next = normalizeCacheProject(next);
    setProject(next);
    setPolicyId(p);
    setScenarioId(s);
    setStepId(r);
    setDraft(draftFor(next, p, s, r));
    setRun(null);
    setResultIndex("0");
  }
  function select(p: string, s: string, r: string) {
    if (locked) return;
    setPolicyId(p);
    setScenarioId(s);
    setStepId(r);
    setDraft(draftFor(project, p, s, r));
    setFeedback(null);
  }
  function save() {
    try {
      const r = draft.step;
      const next = normalizeCacheProject({
        ...project,
        name: draft.name,
        startTime: draft.startTime,
        policies: project.policies.map((p) =>
          p.id === policyId
            ? {
                ...draft.policy,
                capacity: number(draft.policy.capacity),
                maxBodyBytes: number(draft.policy.maxBodyBytes),
              }
            : p,
        ),
        scenarios: project.scenarios.map((s) =>
          s.id !== scenarioId
            ? s
            : {
                ...s,
                name: draft.scenario.name,
                budgets: Object.fromEntries(
                  budgetKeys.map((k) => [k, number(draft.scenario.budgets[k])]),
                ),
                steps: s.steps.map((step) =>
                  step.id !== stepId
                    ? step
                    : {
                        id: step.id,
                        name: r.name,
                        atMs: number(r.atMs),
                        method: r.method,
                        url: r.url,
                        headers: parsed(r.headers),
                        origin:
                          r.kind === "none"
                            ? null
                            : r.kind === "network-error"
                              ? { kind: r.kind, delayMs: number(r.delayMs) }
                              : {
                                  kind: r.kind,
                                  delayMs: number(r.delayMs),
                                  status: number(r.status),
                                  headers: parsed(r.responseHeaders),
                                  body: r.body,
                                },
                        expect: {
                          ...(r.expectOutcome
                            ? { outcome: r.expectOutcome }
                            : {}),
                          ...(r.expectStatus.trim()
                            ? { status: number(r.expectStatus) }
                            : {}),
                        },
                      },
                ),
              },
        ),
      });
      install(next, policyId, scenarioId, stepId);
      notify("cache.saved");
    } catch (e) {
      fail(e);
    }
  }
  function download(source: string, name: string) {
    try {
      notify(
        downloadTextFile(source, name, "application/json")
          ? "cache.downloaded"
          : "cache.downloadFailed",
      );
    } catch {
      notify("cache.downloadFailed");
    }
  }
  async function importFile(file: File | undefined, har: boolean) {
    if (!file || locked) return;
    if (file.size > MAX_CACHE_PROJECT_BYTES) {
      fail(new CacheError("limit"));
      return;
    }
    const ticket = ++generation.current;
    setReading(true);
    setFeedback(null);
    try {
      const source = await file.text();
      if (ticket !== generation.current) return;
      if (har) {
        const imported = cacheProjectFromHar(source);
        install(imported.project);
        notify("cache.harLoaded", {
          count: String(imported.project.scenarios[0].steps.length),
          skipped: String(imported.skipped),
          missing: String(imported.missingBodies),
        });
      } else {
        install(parseCacheProject(source));
        notify("cache.loaded");
      }
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) setReading(false);
    }
  }
  function replay(all: boolean) {
    if (locked) return;
    try {
      const next = runCacheProject(project, all ? undefined : { scenarioId });
      setRun(next);
      setResultIndex("0");
      notify("cache.completed", {
        passed: String(next.simulations.filter((s) => s.passed).length),
        total: String(next.simulations.length),
      });
    } catch (e) {
      fail(e);
    }
  }
  function add(kind: "policy" | "scenario" | "step") {
    if (locked) return;
    try {
      if (kind === "policy" && project.policies.length < MAX_CACHE_POLICIES) {
        const id = nextId(
          "policy",
          project.policies.map((p) => p.id),
        );
        install(
          {
            ...project,
            policies: [...project.policies, { ...policy, id, name: id }],
          },
          id,
          scenarioId,
          stepId,
        );
      } else if (
        kind === "scenario" &&
        project.scenarios.length < MAX_CACHE_SCENARIOS
      ) {
        const id = nextId(
          "scenario",
          project.scenarios.map((s) => s.id),
        );
        install(
          {
            ...project,
            scenarios: [
              ...project.scenarios,
              {
                id,
                name: id,
                budgets: defaultCacheBudgets(),
                steps: [defaultCacheStep()],
              },
            ],
          },
          policyId,
          id,
        );
      } else if (kind === "step" && scenario.steps.length < MAX_CACHE_STEPS) {
        const id = nextId(
          "request",
          scenario.steps.map((r) => r.id),
        );
        install(
          {
            ...project,
            scenarios: project.scenarios.map((s) =>
              s.id !== scenarioId
                ? s
                : {
                    ...s,
                    steps: [
                      ...s.steps,
                      defaultCacheStep(
                        id,
                        Math.min(604800000, s.steps.at(-1)!.atMs + 1000),
                      ),
                    ],
                  },
            ),
          },
          policyId,
          scenarioId,
          id,
        );
      }
      setFeedback(null);
    } catch (e) {
      fail(e);
    }
  }
  function remove(kind: "policy" | "scenario" | "step") {
    if (locked) return;
    try {
      if (kind === "policy" && project.policies.length > 1)
        install(
          {
            ...project,
            policies: project.policies.filter((p) => p.id !== policyId),
          },
          project.policies.find((p) => p.id !== policyId)!.id,
          scenarioId,
          stepId,
        );
      else if (kind === "scenario" && project.scenarios.length > 1)
        install(
          {
            ...project,
            scenarios: project.scenarios.filter((s) => s.id !== scenarioId),
          },
          policyId,
        );
      else if (kind === "step" && scenario.steps.length > 1)
        install(
          {
            ...project,
            scenarios: project.scenarios.map((s) =>
              s.id !== scenarioId
                ? s
                : { ...s, steps: s.steps.filter((r) => r.id !== stepId) },
            ),
          },
          policyId,
          scenarioId,
        );
      setFeedback(null);
    } catch (e) {
      fail(e);
    }
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("cache.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("cache.help")}</p>
          <p className="text-xs text-slate-600">{t("cache.scope")}</p>
          <p className="text-xs text-slate-600">{t("cache.privacy")}</p>
          <p className="text-xs text-slate-500">{t("cache.limits")}</p>
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
            <p className="text-xs text-amber-800">{t("cache.pending")}</p>
          )}
          {reading && <p role="status">{t("cache.reading")}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => {
                install(demoCacheProject());
                notify("cache.loaded");
              }}
            >
              {t("cache.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => {
                install(emptyCacheProject());
                notify("cache.loaded");
              }}
            >
              {t("cache.new")}
            </button>
            {([false, true] as const).map((har) => (
              <label key={String(har)} className={buttonClass}>
                {t(har ? "cache.har" : "cache.import")}
                <input
                  className="mt-1 block max-w-56 text-xs"
                  type="file"
                  accept={
                    har
                      ? ".har,.json,application/json"
                      : ".json,application/json"
                  }
                  disabled={locked}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void importFile(file, har);
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => {
                try {
                  download(
                    serializeCacheProject(project),
                    "http-cache-project.json",
                  );
                } catch (e) {
                  fail(e);
                }
              }}
            >
              {t("cache.export")}
            </button>
          </div>
          <fieldset disabled={reading} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label={t("cache.projectName")}
                value={draft.name}
                onChange={(name) => setDraft((d) => ({ ...d, name }))}
              />
              <Field
                label={t("cache.startTime")}
                value={draft.startTime}
                onChange={(startTime) => setDraft((d) => ({ ...d, startTime }))}
              />
            </div>
            <section className="space-y-3 rounded-xl border p-3">
              <div className="grid items-end gap-3 md:grid-cols-3">
                <Select
                  label={t("cache.policy")}
                  value={policyId}
                  disabled={locked}
                  onChange={(p) => select(p, scenarioId, stepId)}
                >
                  {project.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.policies.length >= MAX_CACHE_POLICIES
                  }
                  onClick={() => add("policy")}
                >
                  {t("cache.addPolicy")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.policies.length <= 1}
                  onClick={() => remove("policy")}
                >
                  {t("cache.deletePolicy")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label={t("cache.policyName")}
                  value={draft.policy.name}
                  onChange={(name) =>
                    setDraft((d) => ({ ...d, policy: { ...d.policy, name } }))
                  }
                />
                <Select
                  label={t("cache.mode")}
                  value={draft.policy.mode}
                  onChange={(mode) =>
                    setDraft((d) => ({
                      ...d,
                      policy: { ...d.policy, mode: mode as CacheMode },
                    }))
                  }
                >
                  {(["private", "shared"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`cache.mode.${v}`)}
                    </option>
                  ))}
                </Select>
                {(["capacity", "maxBodyBytes"] as const).map((k) => (
                  <Field
                    key={k}
                    label={t(`cache.${k}`)}
                    value={draft.policy[k]}
                    onChange={(value) =>
                      setDraft((d) => ({
                        ...d,
                        policy: { ...d.policy, [k]: value },
                      }))
                    }
                  />
                ))}
              </div>
              {(["heuristic", "staleIfError"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.policy[k]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        policy: { ...d.policy, [k]: e.target.checked },
                      }))
                    }
                  />
                  {t(`cache.${k}`)}
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.policy.responseCacheControl !== null}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      policy: {
                        ...d.policy,
                        responseCacheControl: e.target.checked ? "" : null,
                      },
                    }))
                  }
                />
                {t("cache.override")}
              </label>
              {draft.policy.responseCacheControl !== null && (
                <Field
                  label={t("cache.overrideValue")}
                  value={draft.policy.responseCacheControl}
                  onChange={(responseCacheControl) =>
                    setDraft((d) => ({
                      ...d,
                      policy: { ...d.policy, responseCacheControl },
                    }))
                  }
                />
              )}
              <p className="text-xs text-slate-500">
                {t("cache.overrideHelp")}
              </p>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <div className="grid items-end gap-3 md:grid-cols-3">
                <Select
                  label={t("cache.scenario")}
                  value={scenarioId}
                  disabled={locked}
                  onChange={(s) =>
                    select(
                      policyId,
                      s,
                      project.scenarios.find((v) => v.id === s)!.steps[0].id,
                    )
                  }
                >
                  {project.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.scenarios.length >= MAX_CACHE_SCENARIOS
                  }
                  onClick={() => add("scenario")}
                >
                  {t("cache.addScenario")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.scenarios.length <= 1}
                  onClick={() => remove("scenario")}
                >
                  {t("cache.deleteScenario")}
                </button>
              </div>
              <Field
                label={t("cache.scenarioName")}
                value={draft.scenario.name}
                onChange={(name) =>
                  setDraft((d) => ({ ...d, scenario: { ...d.scenario, name } }))
                }
              />
              <div className="grid gap-3 md:grid-cols-2">
                {budgetKeys.map((k) => (
                  <Field
                    key={k}
                    label={t(`cache.budget.${k}`)}
                    value={draft.scenario.budgets[k]}
                    onChange={(value) =>
                      setDraft((d) => ({
                        ...d,
                        scenario: {
                          ...d.scenario,
                          budgets: { ...d.scenario.budgets, [k]: value },
                        },
                      }))
                    }
                  />
                ))}
              </div>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <div className="grid items-end gap-3 md:grid-cols-3">
                <Select
                  label={t("cache.step")}
                  value={stepId}
                  disabled={locked}
                  onChange={(r) => select(policyId, scenarioId, r)}
                >
                  {scenario.steps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.atMs} ms)
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || scenario.steps.length >= MAX_CACHE_STEPS}
                  onClick={() => add("step")}
                >
                  {t("cache.addStep")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || scenario.steps.length <= 1}
                  onClick={() => remove("step")}
                >
                  {t("cache.deleteStep")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(["name", "atMs", "url"] as const).map((k) => (
                  <Field
                    key={k}
                    label={t(k === "name" ? "cache.stepName" : `cache.${k}`)}
                    value={draft.step[k]}
                    onChange={(value) =>
                      setDraft((d) => ({
                        ...d,
                        step: { ...d.step, [k]: value },
                      }))
                    }
                  />
                ))}
                <Select
                  label={t("cache.method")}
                  value={draft.step.method}
                  onChange={(method) =>
                    setDraft((d) => ({
                      ...d,
                      step: {
                        ...d.step,
                        method: method as typeof d.step.method,
                      },
                    }))
                  }
                >
                  {CACHE_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </div>
              <Field
                label={t("cache.requestHeaders")}
                value={draft.step.headers}
                multiline
                onChange={(headers) =>
                  setDraft((d) => ({ ...d, step: { ...d.step, headers } }))
                }
              />
              <Select
                label={t("cache.originKind")}
                value={draft.step.kind}
                onChange={(kind) =>
                  setDraft((d) => ({
                    ...d,
                    step: { ...d.step, kind: kind as typeof d.step.kind },
                  }))
                }
              >
                {(["response", "network-error", "none"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`cache.origin.${k}`)}
                  </option>
                ))}
              </Select>
              {draft.step.kind !== "none" && (
                <Field
                  label={t("cache.delayMs")}
                  value={draft.step.delayMs}
                  onChange={(delayMs) =>
                    setDraft((d) => ({ ...d, step: { ...d.step, delayMs } }))
                  }
                />
              )}
              {draft.step.kind === "response" && (
                <>
                  <Field
                    label={t("cache.status")}
                    value={draft.step.status}
                    onChange={(status) =>
                      setDraft((d) => ({ ...d, step: { ...d.step, status } }))
                    }
                  />
                  <Field
                    label={t("cache.responseHeaders")}
                    value={draft.step.responseHeaders}
                    multiline
                    onChange={(responseHeaders) =>
                      setDraft((d) => ({
                        ...d,
                        step: { ...d.step, responseHeaders },
                      }))
                    }
                  />
                  <Field
                    label={t("cache.body")}
                    value={draft.step.body}
                    multiline
                    onChange={(body) =>
                      setDraft((d) => ({ ...d, step: { ...d.step, body } }))
                    }
                  />
                </>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label={t("cache.expectOutcome")}
                  value={draft.step.expectOutcome}
                  onChange={(expectOutcome) =>
                    setDraft((d) => ({
                      ...d,
                      step: {
                        ...d.step,
                        expectOutcome: expectOutcome as CacheOutcome | "",
                      },
                    }))
                  }
                >
                  <option value="">{t("cache.any")}</option>
                  {CACHE_OUTCOMES.map((k) => (
                    <option key={k} value={k}>
                      {t(`cache.outcome.${k}`)}
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("cache.expectStatus")}
                  value={draft.step.expectStatus}
                  onChange={(expectStatus) =>
                    setDraft((d) => ({
                      ...d,
                      step: { ...d.step, expectStatus },
                    }))
                  }
                />
              </div>
              <p className="text-xs text-slate-500">{t("cache.fixtureHelp")}</p>
            </section>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!pending || reading}
              onClick={save}
            >
              {t("cache.save")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!pending || reading}
              onClick={() => {
                setDraft(draftFor(project, policyId, scenarioId, stepId));
                setFeedback(null);
              }}
            >
              {t("cache.discard")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => replay(false)}
            >
              {t("cache.run")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => replay(true)}
            >
              {t("cache.runAll")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !run}
              onClick={() =>
                run && download(cacheRunReport(run), "http-cache-report.json")
              }
            >
              {t("cache.report")}
            </button>
          </div>
          {run && result && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="mb-2 text-left text-sm font-bold">
                    {t("cache.comparison")}
                  </caption>
                  <thead>
                    <tr>
                      <th className="p-2">{t("cache.result")}</th>
                      {(
                        [
                          "hitPercent",
                          "originRequests",
                          "originBodyBytes",
                          "totalWaitMs",
                        ] as const
                      ).map((k) => (
                        <th className="p-2" key={k}>
                          {t(`cache.metric.${k}`)}
                        </th>
                      ))}
                      <th className="p-2">{t("cache.column.check")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.simulations.map((s, index) => (
                      <tr
                        key={`${s.scenarioId}/${s.policyId}`}
                        className="border-t"
                      >
                        <td className="p-2">
                          <button
                            type="button"
                            className="font-bold underline"
                            onClick={() => setResultIndex(String(index))}
                          >
                            {s.scenarioName} / {s.policyName}
                          </button>
                        </td>
                        {(
                          [
                            "hitPercent",
                            "originRequests",
                            "originBodyBytes",
                            "totalWaitMs",
                          ] as const
                        ).map((k) => (
                          <td className="p-2" key={k}>
                            {s.metrics[k]}
                          </td>
                        ))}
                        <td className="p-2">
                          {t(s.passed ? "cache.passed" : "cache.failed")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Select
                label={t("cache.result")}
                value={String(run.simulations.indexOf(result))}
                onChange={setResultIndex}
              >
                {run.simulations.map((s, index) => (
                  <option key={index} value={String(index)}>
                    {s.scenarioName} / {s.policyName}
                  </option>
                ))}
              </Select>
              <CacheDetails
                key={`${result.scenarioId}/${result.policyId}`}
                simulation={result}
                onDownload={download}
              />
            </>
          )}
        </div>
      )}
    </details>
  );
});
