"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  defaultResiliencePolicy,
  defaultResilienceScenario,
  demoResilienceProject,
  emptyResilienceProject,
  MAX_RESILIENCE_BYTES,
  MAX_RESILIENCE_POLICIES,
  MAX_RESILIENCE_SCENARIOS,
  normalizeResiliencePolicy,
  normalizeResilienceScenario,
  parseResilienceProject,
  resilienceArrivals,
  resilienceAttemptsCsv,
  resilienceError,
  ResilienceError,
  resilienceFromHar,
  RESILIENCE_METHODS,
  runResilienceExperiment,
  serializeResilienceProject,
  serializeResilienceRun,
  type ResilienceMethod,
  type ResilienceOutcome,
  type ResiliencePolicy,
  type ResilienceProject,
  type ResilienceRun,
  type ResilienceScenario,
  type ResilienceSimulation,
} from "@/lib/api-resilience";
import { parseTransformValue } from "@/lib/api-transform";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const policyNumbers = [
  "maxAttempts",
  "attemptTimeoutMs",
  "deadlineMs",
  "baseDelayMs",
  "maxDelayMs",
  "concurrency",
  "queueLimit",
  "failureThreshold",
  "openMs",
  "halfOpenSuccesses",
] as const;
const policyFlags = [
  "retryNetwork",
  "retryTimeout",
  "respectRetryAfter",
  "breakerEnabled",
] as const;
const budgetNumbers = [
  "minSuccessPercent",
  "maxP95Ms",
  "maxAmplification",
  "maxRejected",
] as const;
type PolicyNumber = (typeof policyNumbers)[number];
type PolicyDraft = Omit<ResiliencePolicy, PolicyNumber | "retryStatuses"> &
  Record<PolicyNumber, string> & { retryStatuses: string };
type ScenarioDraft = {
  id: string;
  name: string;
  seed: string;
  arrivals: string;
  windows: string;
  defaultFault: string;
} & Record<(typeof budgetNumbers)[number], string>;
function draftPolicy(p: ResiliencePolicy): PolicyDraft {
  return {
    ...p,
    ...(Object.fromEntries(
      policyNumbers.map((k) => [k, String(p[k])]),
    ) as Record<PolicyNumber, string>),
    retryStatuses: p.retryStatuses.join(", "),
  };
}
function draftScenario(s: ResilienceScenario): ScenarioDraft {
  return {
    id: s.id,
    name: s.name,
    seed: String(s.seed),
    arrivals: json(s.arrivals),
    windows: json(s.windows),
    defaultFault: json(s.defaultFault),
    ...(Object.fromEntries(
      budgetNumbers.map((k) => [k, String(s.budgets[k])]),
    ) as Record<(typeof budgetNumbers)[number], string>),
  };
}
function scenarioJson(source: string): unknown {
  try {
    return parseTransformValue(source);
  } catch {
    throw new ResilienceError("json");
  }
}
const outcomes: ResilienceOutcome[] = [
  "success",
  "http-error",
  "network",
  "timeout",
  "deadline",
  "circuit-open",
  "queue-full",
];

function SimulationDetails({
  simulation,
  disabled,
  onCsv,
}: {
  simulation: ResilienceSimulation;
  disabled: boolean;
  onCsv: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState(""),
    [outcome, setOutcome] = useState("all"),
    [page, setPage] = useState(0),
    [requestId, setRequestId] = useState("");
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = simulation.requests.filter(
    (r) =>
      (outcome === "all" || r.outcome === outcome) &&
      terms.every((term) =>
        `${r.name} ${r.id} ${r.method} ${r.outcome} ${t(`resilience.outcome.${r.outcome}`)}`
          .toLowerCase()
          .includes(term),
      ),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 20)),
    currentPage = Math.min(page, pages - 1),
    rows = matches.slice(currentPage * 20, currentPage * 20 + 20);
  const selected = simulation.requests.find((r) => r.id === requestId);
  const attempts = simulation.attempts.filter(
    (a) => !requestId || a.requestId === requestId,
  );
  const events = simulation.events.filter(
    (e) => !requestId || e.requestId === requestId || e.type === "breaker",
  );
  const end = Math.max(1, simulation.metrics.elapsedMs);
  return (
    <section
      aria-label={t("resilience.details")}
      className="space-y-4 rounded-xl border p-3"
    >
      <h4 className="font-bold">
        {simulation.scenarioName} / {simulation.policyName}
      </h4>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(
          [
            "succeeded",
            "failed",
            "attempts",
            "retries",
            "amplification",
            "p95Ms",
            "peakConcurrency",
            "peakQueue",
            "openings",
            "shortCircuited",
            "queueRejected",
            "deadlineExceeded",
            "timeouts",
          ] as const
        ).map((k) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2 text-xs">
            <p>{t(`resilience.metric.${k}`)}</p>
            <strong className="text-lg">{simulation.metrics[k]}</strong>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-xs">
        {simulation.budgets.map((b) => (
          <li key={b.id}>
            {t(`resilience.budget.${b.id}`)}: {b.actual} / {b.limit} ·{" "}
            {t(b.passed ? "resilience.passed" : "resilience.failed")}
          </li>
        ))}
      </ul>
      <h4 className="text-sm font-bold">{t("resilience.timeline")}</h4>
      <p className="text-xs text-slate-600">{t("resilience.timelineHelp")}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold">
          {t("resilience.search")}
          <input
            className={inputClass}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSearch("");
                setPage(0);
              }
            }}
          />
        </label>
        <label className="text-xs font-semibold">
          {t("resilience.outcomeFilter")}
          <select
            className={inputClass}
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">{t("resilience.all")}</option>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {t(`resilience.outcome.${o}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-label={t("resilience.selectRequest", { name: r.name })}
            aria-pressed={r.id === requestId}
            className="block w-full rounded-lg border p-2 text-left text-xs hover:border-purple-400"
            onClick={() => setRequestId(r.id === requestId ? "" : r.id)}
          >
            <span className="flex flex-wrap justify-between gap-2">
              <span>
                {r.name} · {r.method} · {t(`resilience.outcome.${r.outcome}`)}
              </span>
              <span>
                {r.arrivedAtMs}–{r.completedAtMs} ms · {r.attempts}
              </span>
            </span>
            <span
              className="relative mt-1 block h-3 overflow-hidden rounded bg-slate-100"
              aria-hidden="true"
            >
              <span
                className={`absolute h-full rounded ${r.outcome === "success" ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{
                  left: `${(r.arrivedAtMs / end) * 100}%`,
                  width: `${Math.max(0.5, ((r.completedAtMs - r.arrivedAtMs) / end) * 100)}%`,
                }}
              />
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          className={buttonClass}
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          {t("resilience.previous")}
        </button>
        <p>
          {t("resilience.page", {
            page: String(currentPage + 1),
            total: String(pages),
            count: String(matches.length),
          })}
        </p>
        <button
          type="button"
          className={buttonClass}
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          {t("resilience.next")}
        </button>
      </div>
      {selected && (
        <p className="text-xs" role="status">
          {t("resilience.requestDetails", {
            name: selected.name,
            attempts: String(selected.attempts),
            queue: String(selected.queueWaitMs),
            backoff: String(selected.backoffMs),
          })}
        </p>
      )}
      <h4 className="text-sm font-bold">{t("resilience.attemptTimeline")}</h4>
      <button
        type="button"
        className={buttonClass}
        disabled={disabled}
        onClick={onCsv}
      >
        {t("resilience.downloadCsv")}
      </button>
      <p className="text-xs">
        {t("resilience.preview", {
          count: String(Math.min(attempts.length, 100)),
          total: String(attempts.length),
        })}
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full text-left text-xs"
          aria-label={t("resilience.attemptTimeline")}
        >
          <thead>
            <tr>
              {(
                [
                  "request",
                  "attempt",
                  "start",
                  "end",
                  "outcome",
                  "status",
                  "probe",
                ] as const
              ).map((k) => (
                <th key={k} className="p-2">
                  {t(`resilience.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attempts.slice(0, 100).map((a) => (
              <tr key={a.sequence} className="border-t">
                <td className="p-2">{a.requestId}</td>
                <td>{a.number}</td>
                <td>{a.startedAtMs}</td>
                <td>{a.completedAtMs}</td>
                <td>{t(`resilience.outcome.${a.outcome}`)}</td>
                <td>{a.status ?? "—"}</td>
                <td>{t(a.probe ? "resilience.yes" : "resilience.no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4 className="text-sm font-bold">{t("resilience.eventLog")}</h4>
      <p className="text-xs">
        {t("resilience.preview", {
          count: String(Math.min(events.length, 100)),
          total: String(events.length),
        })}
      </p>
      <ol
        aria-label={t("resilience.eventLog")}
        className="max-h-72 space-y-1 overflow-auto text-xs"
      >
        {events.slice(0, 100).map((e, i) => (
          <li key={i}>
            {e.atMs} ms · {t(`resilience.event.${e.type}`)}
            {e.requestId && ` · ${e.requestId}`}
            {e.attempt !== undefined && ` · #${e.attempt}`}
            {e.outcome && ` · ${t(`resilience.outcome.${e.outcome}`)}`}
            {e.state && ` · ${t(`resilience.state.${e.state}`)}`}
            {e.delayMs !== undefined && ` · ${e.delayMs} ms`}
          </li>
        ))}
      </ol>
    </section>
  );
}

export const ApiResiliencePanel = memo(function ApiResiliencePanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyResilienceProject);
  const [scenarioId, setScenarioId] = useState("healthy"),
    [policyId, setPolicyId] = useState("baseline");
  const [scenarioDraft, setScenarioDraft] = useState(() =>
    draftScenario(emptyResilienceProject().scenarios[0]),
  );
  const [policyDraft, setPolicyDraft] = useState(() =>
    draftPolicy(emptyResilienceProject().policies[0]),
  );
  const [count, setCount] = useState("12"),
    [spacing, setSpacing] = useState("200"),
    [arrivalMethod, setArrivalMethod] = useState<ResilienceMethod>("GET");
  const [report, setReport] = useState<ResilienceRun | null>(null),
    [simulationIndex, setSimulationIndex] = useState(0);
  const [busy, setBusy] = useState<"run" | "read" | "copy" | null>(null),
    [progress, setProgress] = useState({ count: 0, total: 0 });
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const generation = useRef(0),
    abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      abort.current?.abort();
    },
    [],
  );
  const selectedScenario =
    project.scenarios.find((s) => s.id === scenarioId) ?? project.scenarios[0];
  const selectedPolicy =
    project.policies.find((p) => p.id === policyId) ?? project.policies[0];
  const scenarioDirty =
    json(scenarioDraft) !== json(draftScenario(selectedScenario));
  const policyDirty = json(policyDraft) !== json(draftPolicy(selectedPolicy));
  const pending = scenarioDirty || policyDirty;
  const simulation = report?.simulations[simulationIndex];
  const invalidate = () => {
    setReport(null);
    setSimulationIndex(0);
    setFeedback(null);
  };
  const fail = (error: unknown) =>
    setFeedback({
      key: `resilience.error.${resilienceError(error).code}`,
      error: true,
    });
  function accept(next: ResilienceProject) {
    setProject(next);
    setScenarioId(next.scenarios[0].id);
    setPolicyId(next.policies[0].id);
    setScenarioDraft(draftScenario(next.scenarios[0]));
    setPolicyDraft(draftPolicy(next.policies[0]));
    invalidate();
  }
  function editScenario(patch: Partial<ScenarioDraft>) {
    setScenarioDraft({ ...scenarioDraft, ...patch });
    invalidate();
  }
  function editPolicy(patch: Partial<PolicyDraft>) {
    setPolicyDraft({ ...policyDraft, ...patch });
    invalidate();
  }
  async function task<T>(
    kind: NonNullable<typeof busy>,
    work: (signal: AbortSignal, token: number) => Promise<T>,
    apply: (value: T) => void,
  ) {
    const token = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    setBusy(kind);
    setFeedback(null);
    try {
      const value = await work(controller.signal, token);
      if (generation.current === token) apply(value);
    } catch (error) {
      if (generation.current === token) fail(error);
    } finally {
      if (generation.current === token) {
        setBusy(null);
        abort.current = null;
      }
    }
  }
  function saveScenario() {
    try {
      const s = normalizeResilienceScenario({
        id: scenarioDraft.id,
        name: scenarioDraft.name,
        seed: Number(scenarioDraft.seed),
        arrivals: scenarioJson(scenarioDraft.arrivals),
        windows: scenarioJson(scenarioDraft.windows),
        defaultFault: scenarioJson(scenarioDraft.defaultFault),
        budgets: Object.fromEntries(
          budgetNumbers.map((k) => [k, Number(scenarioDraft[k])]),
        ),
      });
      const next = parseResilienceProject(
        json({
          ...project,
          scenarios: project.scenarios.map((previous) =>
            previous.id === selectedScenario.id ? s : previous,
          ),
        }),
      );
      setProject(next);
      setScenarioDraft(draftScenario(s));
      invalidate();
      setFeedback({ key: "resilience.scenarioSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function savePolicy() {
    try {
      const p = normalizeResiliencePolicy({
        ...policyDraft,
        ...Object.fromEntries(
          policyNumbers.map((k) => [k, Number(policyDraft[k])]),
        ),
        retryStatuses: policyDraft.retryStatuses.trim()
          ? policyDraft.retryStatuses.split(",").map((s) => Number(s.trim()))
          : [],
      });
      const next = parseResilienceProject(
        json({
          ...project,
          policies: project.policies.map((previous) =>
            previous.id === selectedPolicy.id ? p : previous,
          ),
        }),
      );
      setProject(next);
      setPolicyDraft(draftPolicy(p));
      invalidate();
      setFeedback({ key: "resilience.policySaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function addScenario(duplicate = false) {
    try {
      const s = duplicate
        ? {
            ...selectedScenario,
            id: crypto.randomUUID(),
            name: `${selectedScenario.name.slice(0, 105)} (copy)`,
          }
        : defaultResilienceScenario(
            crypto.randomUUID(),
            `Scenario ${project.scenarios.length + 1}`,
          );
      const next = parseResilienceProject(
        json({ ...project, scenarios: [...project.scenarios, s] }),
      );
      setProject(next);
      setScenarioId(s.id);
      setScenarioDraft(draftScenario(s));
      invalidate();
    } catch (error) {
      fail(error);
    }
  }
  function addPolicy(duplicate = false) {
    try {
      const p = duplicate
        ? {
            ...selectedPolicy,
            id: crypto.randomUUID(),
            name: `${selectedPolicy.name.slice(0, 105)} (copy)`,
          }
        : defaultResiliencePolicy(
            crypto.randomUUID(),
            `Policy ${project.policies.length + 1}`,
          );
      const next = parseResilienceProject(
        json({ ...project, policies: [...project.policies, p] }),
      );
      setProject(next);
      setPolicyId(p.id);
      setPolicyDraft(draftPolicy(p));
      invalidate();
    } catch (error) {
      fail(error);
    }
  }
  function run(all: boolean) {
    setReport(null);
    setSimulationIndex(0);
    setProgress({
      count: 0,
      total: (all ? project.scenarios.length : 1) * project.policies.length,
    });
    void task(
      "run",
      (signal, token) =>
        runResilienceExperiment(
          project,
          all ? undefined : selectedScenario.id,
          signal,
          (count, total) => {
            if (generation.current === token && !signal.aborted)
              setProgress({ count, total });
          },
        ),
      setReport,
    );
  }
  function fileRead(file: File, kind: "project" | "har") {
    void task(
      "read",
      async () => {
        if (file.size > MAX_RESILIENCE_BYTES * (kind === "har" ? 2 : 1))
          throw new ResilienceError("limit");
        const source = await file.text();
        return kind === "project"
          ? parseResilienceProject(source)
          : resilienceFromHar(source);
      },
      (value) => {
        if ("kind" in value) {
          accept(value);
          setFeedback({ key: "resilience.loaded", error: false });
        } else {
          const next = parseResilienceProject(
            json({ ...project, scenarios: [...project.scenarios, value] }),
          );
          setProject(next);
          setScenarioId(value.id);
          setScenarioDraft(draftScenario(value));
          invalidate();
          setFeedback({ key: "resilience.harLoaded", error: false });
        }
      },
    );
  }
  function download(kind: "project" | "report" | "csv") {
    try {
      const source =
        kind === "project"
          ? serializeResilienceProject(project)
          : kind === "report" && report
            ? serializeResilienceRun(report)
            : kind === "csv" && simulation
              ? resilienceAttemptsCsv(simulation)
              : "";
      if (!source) return;
      const name =
        project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) ||
        "api-resilience";
      const ok = downloadTextFile(
        source,
        `${name}-${kind}.${kind === "csv" ? "csv" : "json"}`,
        kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
      );
      setFeedback({
        key: ok ? "resilience.downloaded" : "resilience.downloadFailed",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  const button = (
    key: TranslationKey,
    action: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      className={buttonClass}
      disabled={disabled}
      onClick={action}
    >
      {t(key)}
    </button>
  );
  const field = (
    key: TranslationKey,
    value: string,
    change: (value: string) => void,
    multiline = false,
  ) => (
    <label className="block text-xs font-semibold">
      {t(key)}
      {multiline ? (
        <textarea
          rows={6}
          spellCheck={false}
          className={`${inputClass} font-mono`}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
  const upload = (
    key: TranslationKey,
    kind: "project" | "har",
    disabled = false,
  ) => (
    <label className="text-xs font-semibold">
      {t(key)}
      <input
        type="file"
        className="mt-1 block max-w-full text-xs"
        accept={
          kind === "har"
            ? ".har,.json,application/json"
            : ".json,application/json"
        }
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) fileRead(file, kind);
        }}
      />
    </label>
  );

  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/80 p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("resilience.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-600">
            {t("resilience.description")}
          </p>
          <p className="text-xs text-slate-600">{t("resilience.help")}</p>
          {feedback && (
            <p className="text-xs" role={feedback.error ? "alert" : "status"}>
              {t(feedback.key)}
            </p>
          )}
          {busy && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <p role="status">
                {t("resilience.busy", {
                  count: String(progress.count),
                  total: String(progress.total),
                })}
              </p>
              {button("resilience.cancel", () => {
                abort.current?.abort();
                if (busy !== "run") {
                  generation.current++;
                  setBusy(null);
                }
                setFeedback({ key: "resilience.cancelled", error: false });
              })}
            </div>
          )}
          <fieldset disabled={!!busy} className="space-y-4">
            <fieldset
              disabled={pending}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("resilience.project")}
              </legend>
              {field("resilience.projectName", project.name, (name) => {
                setProject({ ...project, name });
                invalidate();
              })}
              <div className="flex flex-wrap items-center gap-2">
                {button("resilience.newProject", () =>
                  accept(emptyResilienceProject()),
                )}
                {button("resilience.demo", () => {
                  accept(demoResilienceProject());
                  setFeedback({ key: "resilience.demoLoaded", error: false });
                })}
                {upload("resilience.restore", "project")}
                {upload(
                  "resilience.importHar",
                  "har",
                  project.scenarios.length >= MAX_RESILIENCE_SCENARIOS,
                )}
                {button("resilience.downloadProject", () =>
                  download("project"),
                )}
              </div>
              <p className="text-xs text-slate-600">
                {t("resilience.harHelp")}
              </p>
            </fieldset>
            <fieldset
              disabled={policyDirty}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("resilience.scenario")}
              </legend>
              <label className="block text-xs font-semibold">
                {t("resilience.scenario")}
                <select
                  className={inputClass}
                  disabled={scenarioDirty}
                  value={selectedScenario.id}
                  onChange={(e) => {
                    const s = project.scenarios.find(
                      (s) => s.id === e.target.value,
                    )!;
                    setScenarioId(s.id);
                    setScenarioDraft(draftScenario(s));
                  }}
                >
                  {project.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {button(
                  "resilience.addScenario",
                  () => addScenario(),
                  scenarioDirty ||
                    project.scenarios.length >= MAX_RESILIENCE_SCENARIOS,
                )}
                {button(
                  "resilience.duplicateScenario",
                  () => addScenario(true),
                  scenarioDirty ||
                    project.scenarios.length >= MAX_RESILIENCE_SCENARIOS,
                )}
                {button(
                  "resilience.removeScenario",
                  () => {
                    const scenarios = project.scenarios.filter(
                      (s) => s.id !== selectedScenario.id,
                    );
                    setProject({ ...project, scenarios });
                    setScenarioId(scenarios[0].id);
                    setScenarioDraft(draftScenario(scenarios[0]));
                    invalidate();
                  },
                  scenarioDirty || project.scenarios.length === 1,
                )}
              </div>
              {field("resilience.scenarioName", scenarioDraft.name, (name) =>
                editScenario({ name }),
              )}
              {field("resilience.seed", scenarioDraft.seed, (seed) =>
                editScenario({ seed }),
              )}
              <p className="text-xs text-slate-600">
                {t("resilience.scenarioHelp")}
              </p>
              <fieldset className="space-y-2 rounded-lg border p-2">
                <legend className="text-xs font-bold">
                  {t("resilience.generator")}
                </legend>
                <div className="grid gap-2 md:grid-cols-3">
                  {field("resilience.count", count, setCount)}
                  {field("resilience.spacing", spacing, setSpacing)}
                  <label className="text-xs font-semibold">
                    {t("resilience.method")}
                    <select
                      className={inputClass}
                      value={arrivalMethod}
                      onChange={(e) =>
                        setArrivalMethod(e.target.value as ResilienceMethod)
                      }
                    >
                      {RESILIENCE_METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {button("resilience.generate", () => {
                  try {
                    editScenario({
                      arrivals: json(
                        resilienceArrivals(
                          Number(count),
                          Number(spacing),
                          arrivalMethod,
                        ),
                      ),
                    });
                  } catch (error) {
                    fail(error);
                  }
                })}
              </fieldset>
              {field(
                "resilience.arrivals",
                scenarioDraft.arrivals,
                (arrivals) => editScenario({ arrivals }),
                true,
              )}
              {field(
                "resilience.windows",
                scenarioDraft.windows,
                (windows) => editScenario({ windows }),
                true,
              )}
              {field(
                "resilience.defaultFault",
                scenarioDraft.defaultFault,
                (defaultFault) => editScenario({ defaultFault }),
                true,
              )}
              <fieldset className="grid gap-2 md:grid-cols-2">
                <legend className="text-xs font-bold">
                  {t("resilience.budgets")}
                </legend>
                {budgetNumbers.map((k) => (
                  <div key={k}>
                    {field(
                      `resilience.budget.${k}`,
                      scenarioDraft[k],
                      (value) => editScenario({ [k]: value }),
                    )}
                  </div>
                ))}
              </fieldset>
              {scenarioDirty && (
                <p role="status" className="text-xs">
                  {t("resilience.dirty")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button(
                  "resilience.saveScenario",
                  saveScenario,
                  !scenarioDirty,
                )}
                {button(
                  "resilience.discardScenario",
                  () => {
                    setScenarioDraft(draftScenario(selectedScenario));
                    setFeedback(null);
                  },
                  !scenarioDirty,
                )}
              </div>
            </fieldset>
            <fieldset
              disabled={scenarioDirty}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("resilience.policy")}
              </legend>
              <label className="block text-xs font-semibold">
                {t("resilience.policy")}
                <select
                  className={inputClass}
                  disabled={policyDirty}
                  value={selectedPolicy.id}
                  onChange={(e) => {
                    const p = project.policies.find(
                      (p) => p.id === e.target.value,
                    )!;
                    setPolicyId(p.id);
                    setPolicyDraft(draftPolicy(p));
                  }}
                >
                  {project.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {button(
                  "resilience.addPolicy",
                  () => addPolicy(),
                  policyDirty ||
                    project.policies.length >= MAX_RESILIENCE_POLICIES,
                )}
                {button(
                  "resilience.duplicatePolicy",
                  () => addPolicy(true),
                  policyDirty ||
                    project.policies.length >= MAX_RESILIENCE_POLICIES,
                )}
                {button(
                  "resilience.removePolicy",
                  () => {
                    const policies = project.policies.filter(
                      (p) => p.id !== selectedPolicy.id,
                    );
                    setProject({ ...project, policies });
                    setPolicyId(policies[0].id);
                    setPolicyDraft(draftPolicy(policies[0]));
                    invalidate();
                  },
                  policyDirty || project.policies.length === 1,
                )}
              </div>
              <p className="text-xs text-slate-600">
                {t("resilience.policyHelp")}
              </p>
              {field("resilience.policyName", policyDraft.name, (name) =>
                editPolicy({ name }),
              )}
              <div className="grid gap-2 md:grid-cols-2">
                {policyNumbers.map((k) => (
                  <div key={k}>
                    {field(`resilience.policy.${k}`, policyDraft[k], (value) =>
                      editPolicy({ [k]: value }),
                    )}
                  </div>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-xs font-semibold">
                  {t("resilience.backoff")}
                  <select
                    className={inputClass}
                    value={policyDraft.backoff}
                    onChange={(e) =>
                      editPolicy({
                        backoff: e.target.value as ResiliencePolicy["backoff"],
                      })
                    }
                  >
                    {(["fixed", "exponential"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`resilience.backoff.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  {t("resilience.jitter")}
                  <select
                    className={inputClass}
                    value={policyDraft.jitter}
                    onChange={(e) =>
                      editPolicy({
                        jitter: e.target.value as ResiliencePolicy["jitter"],
                      })
                    }
                  >
                    {(["none", "full"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`resilience.jitter.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {field(
                "resilience.retryStatuses",
                policyDraft.retryStatuses,
                (retryStatuses) => editPolicy({ retryStatuses }),
              )}
              <fieldset className="flex flex-wrap gap-3">
                <legend className="text-xs font-semibold">
                  {t("resilience.retryMethods")}
                </legend>
                {RESILIENCE_METHODS.map((m) => (
                  <label key={m} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={policyDraft.retryMethods.includes(m)}
                      onChange={(e) =>
                        editPolicy({
                          retryMethods: e.target.checked
                            ? [...policyDraft.retryMethods, m]
                            : policyDraft.retryMethods.filter((v) => v !== m),
                        })
                      }
                    />
                    {m}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap gap-3">
                {policyFlags.map((k) => (
                  <label key={k} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={policyDraft[k]}
                      onChange={(e) => editPolicy({ [k]: e.target.checked })}
                    />
                    {t(`resilience.policy.${k}`)}
                  </label>
                ))}
              </div>
              {policyDirty && (
                <p role="status" className="text-xs">
                  {t("resilience.dirty")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button("resilience.savePolicy", savePolicy, !policyDirty)}
                {button(
                  "resilience.discardPolicy",
                  () => {
                    setPolicyDraft(draftPolicy(selectedPolicy));
                    setFeedback(null);
                  },
                  !policyDirty,
                )}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              {button("resilience.run", () => run(false), pending)}
              {button("resilience.runAll", () => run(true), pending)}
            </div>
            {report && (
              <section
                aria-label={t("resilience.results")}
                className="space-y-4 rounded-xl border p-3"
              >
                <h3 className="font-bold">{t("resilience.results")}</h3>
                <p role="status" className="text-xs">
                  {t("resilience.summary", {
                    completed: String(report.completed),
                    total: String(report.total),
                    passed: String(
                      report.simulations.filter((s) => s.passed).length,
                    ),
                    failed: String(
                      report.simulations.filter((s) => !s.passed).length,
                    ),
                  })}
                </p>
                {!report.complete && (
                  <p className="text-xs text-amber-900">
                    {t("resilience.partial")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {button(
                    "resilience.downloadReport",
                    () => download("report"),
                    pending,
                  )}
                  {button(
                    "resilience.copyReport",
                    () => {
                      void task(
                        "copy",
                        () =>
                          writeTextToClipboard(serializeResilienceRun(report)),
                        (ok) =>
                          setFeedback({
                            key: ok
                              ? "resilience.copied"
                              : "resilience.copyFailed",
                            error: !ok,
                          }),
                      );
                    },
                    pending,
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-left text-xs"
                    aria-label={t("resilience.results")}
                  >
                    <thead>
                      <tr>
                        {(
                          [
                            "scenario",
                            "policy",
                            "metric.successPercent",
                            "metric.attempts",
                            "metric.amplification",
                            "metric.p95Ms",
                            "budgets",
                          ] as const
                        ).map((k) => (
                          <th key={k} className="p-2">
                            {t(`resilience.${k}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.simulations.map((s, index) => (
                        <tr
                          key={JSON.stringify([s.scenarioId, s.policyId])}
                          className="border-t"
                        >
                          <td className="p-2">{s.scenarioName}</td>
                          <td className="p-2">
                            <button
                              type="button"
                              className={buttonClass}
                              aria-pressed={index === simulationIndex}
                              aria-label={t("resilience.inspect", {
                                scenario: s.scenarioName,
                                policy: s.policyName,
                              })}
                              onClick={() => setSimulationIndex(index)}
                            >
                              {s.policyName}
                            </button>
                          </td>
                          <td>{s.metrics.successPercent}</td>
                          <td>{s.metrics.attempts}</td>
                          <td>{s.metrics.amplification}</td>
                          <td>{s.metrics.p95Ms}</td>
                          <td>
                            {t(
                              s.passed
                                ? "resilience.passed"
                                : "resilience.failed",
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {simulation && (
                  <SimulationDetails
                    key={JSON.stringify([
                      simulation.scenarioId,
                      simulation.policyId,
                    ])}
                    simulation={simulation}
                    disabled={pending || !!busy}
                    onCsv={() => download("csv")}
                  />
                )}
              </section>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
