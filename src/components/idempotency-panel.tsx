"use client";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  IDEM_OUTCOMES,
  IdemError,
  MAX_IDEM_BYTES,
  emptyIdemProject,
  idemJson,
  newIdemPolicy,
  newIdemScenario,
  normalizeIdemProject,
  parseIdemProject,
  serializeIdemProject,
  type IdemPolicy,
  type IdemProject,
  type IdemScenario,
} from "@/lib/idempotency-project";
import {
  demoIdemProject,
  generateIdemTraffic,
  idemReport,
  runIdemMatrix,
  type IdemRun,
} from "@/lib/idempotency-studio";
import { generateIdemMiddleware } from "@/lib/idempotency-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => JSON.stringify(v, null, 2),
  integer = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const numeric = [
  "ttlMs",
  "maxEntries",
  "waitMs",
  "maxWaiters",
  "maxRequestBytes",
  "maxResponseBytes",
] as const;
type PolicyDraft = Omit<IdemPolicy, (typeof numeric)[number]> &
  Record<(typeof numeric)[number], string>;
const budgetKeys = ["maxExecutions", "maxRefusals", "maxWaitMs"] as const;
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
function nextId(prefix: string, ids: string[]) {
  let n = 1;
  while (ids.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function drafts(p: IdemProject, policyId: string, scenarioId: string) {
  const policy = p.policies.find((v) => v.id === policyId)!,
    scenario = p.scenarios.find((v) => v.id === scenarioId)!;
  return {
    name: p.name,
    policy: {
      ...policy,
      ttlMs: String(policy.ttlMs),
      maxEntries: String(policy.maxEntries),
      waitMs: String(policy.waitMs),
      maxWaiters: String(policy.maxWaiters),
      maxRequestBytes: String(policy.maxRequestBytes),
      maxResponseBytes: String(policy.maxResponseBytes),
    },
    scenario: {
      name: scenario.name,
      requests: json(scenario.requests),
      budgets: {
        maxExecutions: String(scenario.budgets.maxExecutions),
        maxRefusals: String(scenario.budgets.maxRefusals),
        maxWaitMs: String(scenario.budgets.maxWaitMs),
      },
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
          rows={8}
          value={value}
          spellCheck={false}
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
const runKey = (r: IdemRun) => `${r.scenarioId}/${r.policyId}`;
export const IdempotencyPanel = memo(function IdempotencyPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyIdemProject),
    [policyId, setPolicyId] = useState("policy-1"),
    [scenarioId, setScenarioId] = useState("scenario-1"),
    [draft, setDraft] = useState(() =>
      drafts(emptyIdemProject(), "policy-1", "scenario-1"),
    );
  const [generator, setGenerator] = useState({
    count: "12",
    spacing: "10",
    keys: "2",
    duration: "100",
  });
  const [results, setResults] = useState<IdemRun[] | null>(null),
    [resultKey, setResultKey] = useState(""),
    [rowId, setRowId] = useState(""),
    [search, setSearch] = useState(""),
    [outcome, setOutcome] = useState(""),
    [page, setPage] = useState(0),
    [includeRows, setIncludeRows] = useState(false);
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
  const policy = project.policies.find((p) => p.id === policyId)!,
    scenario = project.scenarios.find((s) => s.id === scenarioId)!,
    pending = json(draft) !== json(drafts(project, policyId, scenarioId)),
    locked = busy || pending;
  const selected =
      results?.find((r) => runKey(r) === resultKey) ?? results?.[0],
    row =
      selected?.rows.find((r) => r.request.id === rowId) ?? selected?.rows[0];
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean),
    filtered =
      selected?.rows.filter(
        (r) =>
          (!outcome || r.outcome === outcome) &&
          terms.every((term) =>
            [
              r.request.name,
              r.request.client,
              r.request.route,
              r.request.key,
              r.request.method,
            ]
              .join(" ")
              .toLowerCase()
              .includes(term),
          ),
      ) ?? [];
  const pages = Math.max(1, Math.ceil(filtered.length / 100)),
    currentPage = Math.min(page, pages - 1),
    visible = filtered.slice(currentPage * 100, currentPage * 100 + 100),
    horizon = Math.max(
      1,
      ...(selected?.rows.map((r) => r.completedAt ?? r.request.atMs) ?? []),
    );
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, error: false, values });
  const fail = (e: unknown) =>
    setFeedback({
      key: `idem.error.${e instanceof IdemError ? e.code : "project"}`,
      error: true,
    });
  const perform = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      fail(e);
    }
  };
  function choose(p: IdemProject, pid: string, sid: string) {
    setPolicyId(pid);
    setScenarioId(sid);
    setDraft(drafts(p, pid, sid));
  }
  function install(value: IdemProject, pid = policyId, sid = scenarioId) {
    const p = normalizeIdemProject(value),
      policy = p.policies.find((v) => v.id === pid) ?? p.policies[0],
      scenario = p.scenarios.find((v) => v.id === sid) ?? p.scenarios[0];
    setProject(p);
    choose(p, policy.id, scenario.id);
    setResults(null);
    setSearch("");
    setOutcome("");
    setPage(0);
  }
  function save() {
    perform(() => {
      const p = {
        ...draft.policy,
        ttlMs: integer(draft.policy.ttlMs),
        maxEntries: integer(draft.policy.maxEntries),
        waitMs: integer(draft.policy.waitMs),
        maxWaiters: integer(draft.policy.maxWaiters),
        maxRequestBytes: integer(draft.policy.maxRequestBytes),
        maxResponseBytes: integer(draft.policy.maxResponseBytes),
      };
      const s = {
        ...scenario,
        name: draft.scenario.name,
        requests: idemJson(draft.scenario.requests),
        budgets: Object.fromEntries(
          budgetKeys.map((key) => [key, integer(draft.scenario.budgets[key])]),
        ),
      } as IdemScenario;
      install({
        ...project,
        name: draft.name,
        policies: project.policies.map((v) => (v.id === policyId ? p : v)),
        scenarios: project.scenarios.map((v) => (v.id === scenarioId ? s : v)),
      });
      notify("idem.saved");
    });
  }
  function addPolicy(clone: boolean) {
    if (locked || project.policies.length >= 5) return;
    perform(() => {
      const id = nextId(
        "policy",
        project.policies.map((v) => v.id),
      );
      install(
        {
          ...project,
          policies: [
            ...project.policies,
            clone ? { ...policy, id, name: id } : newIdemPolicy(id),
          ],
          scenarios: clone
            ? project.scenarios.map((s) => ({
                ...s,
                requests: s.requests.map((r) =>
                  Object.hasOwn(r.expect, policyId)
                    ? {
                        ...r,
                        expect: Object.fromEntries([
                          ...Object.entries(r.expect),
                          [id, r.expect[policyId]],
                        ]),
                      }
                    : r,
                ),
              }))
            : project.scenarios,
        },
        id,
      );
      setFeedback(null);
    });
  }
  function deletePolicy() {
    if (locked || project.policies.length === 1) return;
    perform(() => {
      install({
        ...project,
        policies: project.policies.filter((v) => v.id !== policyId),
        scenarios: project.scenarios.map((s) => ({
          ...s,
          requests: s.requests.map((r) => ({
            ...r,
            expect: Object.fromEntries(
              Object.entries(r.expect).filter(([key]) => key !== policyId),
            ),
          })),
        })),
      });
      setFeedback(null);
    });
  }
  function addScenario(clone: boolean) {
    if (locked || project.scenarios.length >= 8) return;
    perform(() => {
      const id = nextId(
        "scenario",
        project.scenarios.map((v) => v.id),
      );
      install(
        {
          ...project,
          scenarios: [
            ...project.scenarios,
            clone ? { ...scenario, id, name: id } : newIdemScenario(id),
          ],
        },
        policyId,
        id,
      );
      setFeedback(null);
    });
  }
  function deleteScenario() {
    if (locked || project.scenarios.length === 1) return;
    perform(() => {
      install({
        ...project,
        scenarios: project.scenarios.filter((v) => v.id !== scenarioId),
      });
      setFeedback(null);
    });
  }
  function generate() {
    perform(() => {
      const requests = generateIdemTraffic(
        integer(generator.count),
        integer(generator.spacing),
        integer(generator.keys),
        integer(generator.duration),
      );
      setDraft((d) => ({
        ...d,
        scenario: { ...d.scenario, requests: json(requests) },
      }));
      notify("idem.generated");
    });
  }
  function download(source: string, file: string, type = "application/json") {
    if (downloadTextFile(source, file, type)) notify("idem.downloaded");
    else setFeedback({ key: "idem.error.download", error: true });
  }
  async function run(all: boolean) {
    if (locked) return;
    const token = ++generation.current;
    setBusy(true);
    setFeedback(null);
    setProgress({ done: 0, total: 0 });
    try {
      const runs = await runIdemMatrix(
        project,
        all ? undefined : scenarioId,
        () => generation.current !== token,
        (done, total) => {
          if (generation.current === token) setProgress({ done, total });
        },
      );
      if (generation.current !== token) return;
      setResults(runs);
      setResultKey(runKey(runs[0]));
      setRowId("");
      setSearch("");
      setOutcome("");
      setPage(0);
      const total = runs.reduce((n, r) => n + r.total, 0),
        checked = runs.reduce((n, r) => n + r.checked, 0);
      notify("idem.finished", {
        passed: String(runs.filter((r) => r.passed).length),
        total: String(runs.length),
        checked: String(checked),
        unchecked: String(total - checked),
      });
    } catch (e) {
      if (generation.current === token) fail(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  async function importProject(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file || locked) return;
    const token = ++generation.current;
    setBusy(true);
    setFeedback(null);
    setProgress({ done: 0, total: 0 });
    try {
      if (file.size > MAX_IDEM_BYTES) throw new IdemError("limit");
      const source = await file.text();
      if (generation.current !== token) return;
      install(parseIdemProject(source));
      notify("idem.loaded");
    } catch (e) {
      if (generation.current === token) fail(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  const patchPolicy = (patch: Partial<PolicyDraft>) =>
    setDraft((d) => ({ ...d, policy: { ...d.policy, ...patch } }));
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
  function selectResult(key: string) {
    setResultKey(key);
    setRowId("");
    setSearch("");
    setOutcome("");
    setPage(0);
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("idem.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("idem.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("idem.guide")}
            </summary>
            {(["semantics", "safety", "privacy", "limits"] as const).map(
              (key) => (
                <p key={key}>{t(`idem.${key}`)}</p>
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
            <p className="text-xs text-amber-800">{t("idem.pending")}</p>
          )}
          {busy && (
            <div className="space-y-2">
              <p role="status">
                {t("idem.busy")}{" "}
                {progress.total > 0 &&
                  t("idem.progress", {
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
                  notify("idem.cancelled");
                }}
              >
                {t("idem.cancel")}
              </button>
            </div>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-2">
              {action(
                "idem.demo",
                () =>
                  perform(() => {
                    install(demoIdemProject());
                    notify("idem.loaded");
                  }),
                locked,
              )}
              {action(
                "idem.new",
                () =>
                  perform(() => {
                    install(emptyIdemProject());
                    notify("idem.loaded");
                  }),
                locked,
              )}
              {action(
                "idem.export",
                () =>
                  perform(() =>
                    download(
                      serializeIdemProject(project),
                      "idempotency-project.json",
                    ),
                  ),
                locked,
              )}
              <label className="block text-xs font-semibold">
                {t("idem.import")}
                <input
                  className={inputClass}
                  type="file"
                  accept=".json,application/json"
                  disabled={locked}
                  onChange={(e) => {
                    void importProject(e.currentTarget);
                  }}
                />
              </label>
            </div>
            <Field
              label={t("idem.name")}
              value={draft.name}
              onChange={(name) => setDraft((d) => ({ ...d, name }))}
            />
            <div className="flex flex-wrap gap-2">
              {action("idem.save", save, !pending)}
              {action(
                "idem.discard",
                () => {
                  setDraft(drafts(project, policyId, scenarioId));
                  setFeedback(null);
                },
                !pending,
              )}
            </div>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("idem.policySection")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("idem.policy")}
                  value={policyId}
                  disabled={locked}
                  onChange={(id) => {
                    choose(project, id, scenarioId);
                    setFeedback(null);
                  }}
                >
                  {project.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("idem.policyName")}
                  value={draft.policy.name}
                  onChange={(name) => patchPolicy({ name })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {action(
                  "idem.addPolicy",
                  () => addPolicy(false),
                  locked || project.policies.length >= 5,
                )}
                {action(
                  "idem.clonePolicy",
                  () => addPolicy(true),
                  locked || project.policies.length >= 5,
                )}
                {action(
                  "idem.deletePolicy",
                  deletePolicy,
                  locked || project.policies.length === 1,
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  label={t("idem.scope")}
                  value={draft.policy.scope}
                  onChange={(scope) =>
                    patchPolicy({ scope: scope as IdemPolicy["scope"] })
                  }
                >
                  {(["client-route", "client"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`idem.scope.${v}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  label={t("idem.inFlight")}
                  value={draft.policy.inFlight}
                  onChange={(inFlight) =>
                    patchPolicy({
                      inFlight: inFlight as IdemPolicy["inFlight"],
                    })
                  }
                >
                  <option value="reject">{t("idem.reject")}</option>
                  <option value="wait">{t("idem.wait")}</option>
                </Select>
                <Select
                  label={t("idem.missingKey")}
                  value={draft.policy.missingKey}
                  onChange={(missingKey) =>
                    patchPolicy({
                      missingKey: missingKey as IdemPolicy["missingKey"],
                    })
                  }
                >
                  <option value="reject">{t("idem.reject")}</option>
                  <option value="bypass">{t("idem.bypass")}</option>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {numeric.map((key) => (
                  <Field
                    key={key}
                    label={t(`idem.${key}`)}
                    value={draft.policy[key]}
                    onChange={(value) => patchPolicy({ [key]: value })}
                  />
                ))}
              </div>
              <Check
                label={t("idem.cacheErrors")}
                checked={draft.policy.cacheErrors}
                onChange={(cacheErrors) => patchPolicy({ cacheErrors })}
              />
              {action(
                "idem.exportMiddleware",
                () =>
                  perform(() =>
                    download(
                      generateIdemMiddleware(policy),
                      "idempotency-middleware.mjs",
                      "text/javascript",
                    ),
                  ),
                locked,
              )}
              <p className="text-xs text-slate-600">
                {t("idem.middlewareHelp")}
              </p>
              <p className="text-xs text-slate-600">{t("idem.encodingHelp")}</p>
            </section>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("idem.scenarioSection")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("idem.scenario")}
                  value={scenarioId}
                  disabled={locked}
                  onChange={(id) => {
                    choose(project, policyId, id);
                    setFeedback(null);
                  }}
                >
                  {project.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("idem.scenarioName")}
                  value={draft.scenario.name}
                  onChange={(name) =>
                    setDraft((d) => ({
                      ...d,
                      scenario: { ...d.scenario, name },
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {action(
                  "idem.addScenario",
                  () => addScenario(false),
                  locked || project.scenarios.length >= 8,
                )}
                {action(
                  "idem.cloneScenario",
                  () => addScenario(true),
                  locked || project.scenarios.length >= 8,
                )}
                {action(
                  "idem.deleteScenario",
                  deleteScenario,
                  locked || project.scenarios.length === 1,
                )}
              </div>
              <Field
                label={t("idem.requests")}
                value={draft.scenario.requests}
                onChange={(requests) =>
                  setDraft((d) => ({
                    ...d,
                    scenario: { ...d.scenario, requests },
                  }))
                }
                multiline
              />
              <p className="text-xs text-slate-600">{t("idem.requestsHelp")}</p>
              <h4 className="text-sm font-bold">{t("idem.budgets")}</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                {budgetKeys.map((key) => (
                  <Field
                    key={key}
                    label={t(`idem.${key}`)}
                    value={draft.scenario.budgets[key]}
                    onChange={(value) =>
                      setDraft((d) => ({
                        ...d,
                        scenario: {
                          ...d.scenario,
                          budgets: { ...d.scenario.budgets, [key]: value },
                        },
                      }))
                    }
                  />
                ))}
              </div>
              <details className="space-y-3 rounded-lg bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-bold">
                  {t("idem.generator")}
                </summary>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["count", "spacing", "keys", "duration"] as const).map(
                    (key) => (
                      <Field
                        key={key}
                        label={t(`idem.${key}`)}
                        value={generator[key]}
                        onChange={(value) =>
                          setGenerator((g) => ({ ...g, [key]: value }))
                        }
                      />
                    ),
                  )}
                </div>
                {action("idem.generate", generate)}
              </details>
            </section>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={locked}
                onClick={() => {
                  void run(false);
                }}
              >
                {t("idem.compare")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={locked}
                onClick={() => {
                  void run(true);
                }}
              >
                {t("idem.runAll")}
              </button>
            </div>
            {results && selected && (
              <section className="space-y-4">
                <h3 className="font-bold">{t("idem.results")}</h3>
                <div className="overflow-x-auto">
                  <table
                    aria-label={t("idem.results")}
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr>
                        {(
                          [
                            "comparison",
                            "executions",
                            "savedExecutions",
                            "refusals",
                            "checked",
                            "verdict",
                          ] as const
                        ).map((key) => (
                          <th key={key} className="p-2">
                            {t(`idem.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr
                          key={runKey(r)}
                          className="border-t border-slate-200"
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-purple-800 underline"
                              onClick={() => selectResult(runKey(r))}
                            >
                              {r.policyName} / {r.scenarioName}
                            </button>
                          </td>
                          {[
                            r.executions,
                            r.savedExecutions,
                            r.refusals,
                            `${r.checked}/${r.total}`,
                          ].map((v, i) => (
                            <td key={i} className="p-2">
                              {v}
                            </td>
                          ))}
                          <td
                            className={`p-2 font-bold ${r.passed ? "text-emerald-800" : "text-red-700"}`}
                          >
                            {t(r.passed ? "idem.pass" : "idem.fail")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Select
                  label={t("idem.result")}
                  value={runKey(selected)}
                  onChange={selectResult}
                >
                  {results.map((r) => (
                    <option key={runKey(r)} value={runKey(r)}>
                      {r.policyName} / {r.scenarioName}
                    </option>
                  ))}
                </Select>
                <ul className="text-xs text-slate-600">
                  {selected.checks.map((c) => (
                    <li key={c.name}>
                      {t(`idem.${c.name}` as TranslationKey)}: {c.actual} /{" "}
                      {c.limit} · {t(c.passed ? "idem.pass" : "idem.fail")}
                    </li>
                  ))}
                </ul>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t("idem.search")}
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(0);
                    }}
                  />
                  <Select
                    label={t("idem.outcomeFilter")}
                    value={outcome}
                    onChange={(v) => {
                      setOutcome(v);
                      setPage(0);
                    }}
                  >
                    <option value="">{t("idem.allOutcomes")}</option>
                    {IDEM_OUTCOMES.map((v) => (
                      <option key={v} value={v}>
                        {t(`idem.outcome.${v}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div
                  role="group"
                  aria-label={t("idem.timeline")}
                  className="space-y-1 rounded-xl bg-slate-50 p-2"
                >
                  {visible.map((r) => (
                    <button
                      key={r.request.id}
                      type="button"
                      className="relative block h-9 w-full overflow-hidden rounded-lg text-left text-xs"
                      aria-label={t("idem.inspect", {
                        name: r.request.name,
                        outcome: t(`idem.outcome.${r.outcome}`),
                      })}
                      onClick={() => setRowId(r.request.id)}
                    >
                      <span
                        className={`absolute inset-y-1 rounded ${r.outcome === "replayed" || r.outcome === "joined" ? "bg-indigo-200" : r.handled ? "bg-emerald-200" : "bg-red-200"}`}
                        style={{
                          left: `${(r.request.atMs / horizon) * 80}%`,
                          width: `${Math.max(0.7, (((r.completedAt ?? r.request.atMs) - r.request.atMs) / horizon) * 80)}%`,
                        }}
                      />
                      <span className="relative z-10 px-2">
                        {r.request.atMs}–{r.completedAt} ms · {r.request.name} ·{" "}
                        {t(`idem.outcome.${r.outcome}`)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table
                    aria-label={t("idem.rows")}
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr>
                        {(
                          [
                            "arrival",
                            "outcome",
                            "completedAt",
                            "status",
                            "verdict",
                          ] as const
                        ).map((key) => (
                          <th key={key} className="p-2">
                            {t(`idem.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr
                          key={r.request.id}
                          className="border-t border-slate-200"
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-purple-800 underline"
                              onClick={() => setRowId(r.request.id)}
                            >
                              {r.request.name}
                            </button>
                          </td>
                          <td className="p-2">
                            {t(`idem.outcome.${r.outcome}`)}
                          </td>
                          <td className="p-2">{r.completedAt}</td>
                          <td className="p-2">{r.status ?? "—"}</td>
                          <td className="p-2">
                            {t(
                              !r.checked
                                ? "idem.unchecked"
                                : r.passed
                                  ? "idem.pass"
                                  : "idem.fail",
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {action(
                    "idem.previous",
                    () => setPage(currentPage - 1),
                    currentPage === 0,
                  )}
                  <span className="text-xs">
                    {t("idem.page", {
                      page: String(currentPage + 1),
                      pages: String(pages),
                    })}
                  </span>
                  {action(
                    "idem.next",
                    () => setPage(currentPage + 1),
                    currentPage + 1 >= pages,
                  )}
                </div>
                {row && (
                  <Field
                    label={t("idem.inspection")}
                    value={json(row)}
                    multiline
                    readOnly
                  />
                )}
                <Field
                  label={t("idem.states")}
                  value={json(selected.states)}
                  multiline
                  readOnly
                />
                <Check
                  label={t("idem.includeRows")}
                  checked={includeRows}
                  onChange={setIncludeRows}
                />
                {action(
                  "idem.report",
                  () =>
                    perform(() =>
                      download(
                        idemReport(results, includeRows),
                        "idempotency-report.json",
                      ),
                    ),
                  locked,
                )}
              </section>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
