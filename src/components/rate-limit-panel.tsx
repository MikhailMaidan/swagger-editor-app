"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_RATE_BYTES,
  MAX_RATE_POLICIES,
  MAX_RATE_RULES,
  MAX_RATE_SCENARIOS,
  RATE_ALGORITHMS,
  RATE_SCOPES,
  RATE_OUTCOMES,
  RateError,
  emptyRateProject,
  newRateRule,
  newRateScenario,
  normalizeRateProject,
  parseRateProject,
  rateJson,
  serializeRateProject,
  type RateRule,
  type RateProject,
} from "@/lib/rate-project";
import {
  demoRateProject,
  generateRateSchedule,
  importRateHar,
  rateRunReport,
  runRateMatrix,
  type RateRun,
} from "@/lib/rate-studio";
import { generateRateMiddleware } from "@/lib/rate-export";
import type { TranslationKey } from "@/lib/translations";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const integer = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
function nextId(prefix: string, values: string[]) {
  let n = 1;
  while (values.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
const numericRule = [
  "limit",
  "windowMs",
  "refillTokens",
  "refillMs",
  "keyCapacity",
] as const;
type NumericRule = (typeof numericRule)[number];
type RuleDraft = Omit<RateRule, NumericRule> & Record<NumericRule, string>;
function ruleDraft(r: RateRule): RuleDraft {
  return {
    ...r,
    limit: String(r.limit),
    windowMs: String(r.windowMs),
    refillTokens: String(r.refillTokens),
    refillMs: String(r.refillMs),
    keyCapacity: String(r.keyCapacity),
  };
}
function drafts(
  p: RateProject,
  policyId: string,
  ruleId: string,
  scenarioId: string,
) {
  const policy = p.policies.find((p) => p.id === policyId)!,
    rule = policy.rules.find((r) => r.id === ruleId)!,
    scenario = p.scenarios.find((s) => s.id === scenarioId)!;
  return {
    name: p.name,
    clockMs: String(p.clockMs),
    policyName: policy.name,
    rule: ruleDraft(rule),
    scenario: {
      name: scenario.name,
      requests: json(scenario.requests),
      budgets: {
        minAccepted: String(scenario.budgets.minAccepted),
        maxLimited: String(scenario.budgets.maxLimited),
        maxCapacity: String(scenario.budgets.maxCapacity),
        maxUnmatched: String(scenario.budgets.maxUnmatched),
        maxRetryMs:
          scenario.budgets.maxRetryMs === null
            ? ""
            : String(scenario.budgets.maxRetryMs),
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
          readOnly={readOnly}
          spellCheck={false}
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
const runKey = (r: RateRun) => `${r.scenarioId}/${r.policyId}`;

export const RateLimitPanel = memo(function RateLimitPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyRateProject),
    [policyId, setPolicyId] = useState("policy-1"),
    [ruleId, setRuleId] = useState("rule-1"),
    [scenarioId, setScenarioId] = useState("scenario-1");
  const [draft, setDraft] = useState(() =>
    drafts(emptyRateProject(), "policy-1", "rule-1", "scenario-1"),
  );
  const [generator, setGenerator] = useState({
    count: "12",
    spacing: "100",
    clients: "2",
    route: "/orders",
    method: "GET",
    cost: "1",
  });
  const [results, setResults] = useState<RateRun[] | null>(null),
    [selectedKey, setSelectedKey] = useState(""),
    [rowIndex, setRowIndex] = useState(0),
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
  const pending =
      json(draft) !== json(drafts(project, policyId, ruleId, scenarioId)),
    locked = busy || pending;
  const selected =
      results?.find((r) => runKey(r) === selectedKey) ?? results?.[0],
    selectedRow =
      selected?.rows.find((r) => r.index === rowIndex) ?? selected?.rows[0];
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean),
    filtered =
      selected?.rows.filter(
        (row) =>
          (!outcome || row.decision.outcome === outcome) &&
          terms.every((term) =>
            [
              row.request.name,
              row.request.client,
              row.request.route,
              row.request.method,
            ]
              .join(" ")
              .toLowerCase()
              .includes(term),
          ),
      ) ?? [];
  const pages = Math.max(1, Math.ceil(filtered.length / 100)),
    currentPage = Math.min(page, pages - 1),
    visible = filtered.slice(currentPage * 100, currentPage * 100 + 100);
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, values, error: false });
  const fail = (e: unknown) =>
    setFeedback({
      key: `rate.error.${e instanceof RateError ? e.code : "project"}`,
      error: true,
    });
  function perform(action: () => void) {
    try {
      action();
    } catch (e) {
      fail(e);
    }
  }
  function install(
    value: RateProject,
    policy = value.policies[0]?.id,
    rule?: string,
    scenario = value.scenarios[0]?.id,
  ) {
    const p = normalizeRateProject(value),
      chosenPolicy = p.policies.find((x) => x.id === policy),
      chosenScenario = p.scenarios.find((x) => x.id === scenario);
    if (!chosenPolicy || !chosenScenario) throw new RateError("project");
    const chosenRule =
      chosenPolicy.rules.find((r) => r.id === rule) ?? chosenPolicy.rules[0];
    setProject(p);
    setPolicyId(chosenPolicy.id);
    setRuleId(chosenRule.id);
    setScenarioId(chosenScenario.id);
    setDraft(drafts(p, chosenPolicy.id, chosenRule.id, chosenScenario.id));
    setResults(null);
    setSelectedKey("");
    setRowIndex(0);
    setSearch("");
    setOutcome("");
    setPage(0);
  }
  function select(policy = policyId, rule = ruleId, scenario = scenarioId) {
    const chosen = project.policies.find((p) => p.id === policy)!;
    const selectedRule =
      chosen.rules.find((r) => r.id === rule) ?? chosen.rules[0];
    setPolicyId(policy);
    setRuleId(selectedRule.id);
    setScenarioId(scenario);
    setDraft(drafts(project, policy, selectedRule.id, scenario));
  }
  function current() {
    const rule: RateRule = {
      ...draft.rule,
      limit: integer(draft.rule.limit),
      windowMs: integer(draft.rule.windowMs),
      refillTokens: integer(draft.rule.refillTokens),
      refillMs: integer(draft.rule.refillMs),
      keyCapacity: integer(draft.rule.keyCapacity),
    };
    const b = draft.scenario.budgets;
    return normalizeRateProject({
      ...project,
      name: draft.name,
      clockMs: integer(draft.clockMs),
      policies: project.policies.map((p) =>
        p.id === policyId
          ? {
              ...p,
              name: draft.policyName,
              rules: p.rules.map((r) => (r.id === ruleId ? rule : r)),
            }
          : p,
      ),
      scenarios: project.scenarios.map((s) =>
        s.id === scenarioId
          ? {
              ...s,
              name: draft.scenario.name,
              requests: rateJson(draft.scenario.requests),
              budgets: {
                minAccepted: integer(b.minAccepted),
                maxLimited: integer(b.maxLimited),
                maxCapacity: integer(b.maxCapacity),
                maxUnmatched: integer(b.maxUnmatched),
                maxRetryMs: b.maxRetryMs.trim() ? integer(b.maxRetryMs) : null,
              },
            }
          : s,
      ),
    });
  }
  function download(source: string, file: string, mime = "application/json") {
    try {
      const ok = downloadTextFile(source, file, mime);
      setFeedback({
        key: ok ? "rate.downloaded" : "rate.downloadFailed",
        error: !ok,
      });
    } catch {
      setFeedback({ key: "rate.downloadFailed", error: true });
    }
  }
  async function importFile(file: File | undefined, har: boolean) {
    if (!file || locked) return;
    if (file.size > (har ? 5 * 1024 * 1024 : MAX_RATE_BYTES)) {
      fail(new RateError("limit"));
      return;
    }
    const ticket = ++generation.current;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      const source = await file.text();
      if (ticket !== generation.current) return;
      if (har) {
        const imported = importRateHar(project, source);
        install(
          imported.project,
          policyId,
          ruleId,
          imported.project.scenarios.at(-1)!.id,
        );
        notify("rate.harLoaded", {
          count: String(imported.imported),
          skipped: String(imported.skipped),
        });
      } else {
        install(parseRateProject(source));
        notify("rate.loaded");
      }
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function run(all: boolean) {
    if (locked) return;
    const ticket = ++generation.current;
    setBusy(true);
    setFeedback(null);
    setProgress({
      done: 0,
      total: (all ? project.scenarios.length : 1) * project.policies.length,
    });
    try {
      const runs = await runRateMatrix(
        project,
        all ? undefined : scenarioId,
        () => ticket !== generation.current,
        (done, total) => {
          if (ticket === generation.current) setProgress({ done, total });
        },
      );
      if (ticket !== generation.current) return;
      setResults(runs);
      setSelectedKey(
        runKey(
          runs.find(
            (r) => r.policyId === policyId && r.scenarioId === scenarioId,
          ) ?? runs[0],
        ),
      );
      setRowIndex(0);
      setSearch("");
      setOutcome("");
      setPage(0);
      notify("rate.completed", {
        passed: String(runs.filter((r) => r.passed).length),
        total: String(runs.length),
      });
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  function addPolicy(clone: boolean) {
    if (locked || project.policies.length >= MAX_RATE_POLICIES) return;
    perform(() => {
      const id = nextId(
          "policy",
          project.policies.map((p) => p.id),
        ),
        old = project.policies.find((p) => p.id === policyId)!;
      install(
        {
          ...project,
          policies: [
            ...project.policies,
            {
              id,
              name: id,
              rules: clone ? old.rules.map((r) => ({ ...r })) : [newRateRule()],
            },
          ],
        },
        id,
        undefined,
        scenarioId,
      );
      setFeedback(null);
    });
  }
  function addRule(clone: boolean) {
    const p = project.policies.find((p) => p.id === policyId)!;
    if (locked || p.rules.length >= MAX_RATE_RULES) return;
    perform(() => {
      const id = nextId(
          "rule",
          p.rules.map((r) => r.id),
        ),
        old = p.rules.find((r) => r.id === ruleId)!;
      const rule = clone ? { ...old, id, name: id } : newRateRule(id);
      install(
        {
          ...project,
          policies: project.policies.map((p) =>
            p.id === policyId ? { ...p, rules: [...p.rules, rule] } : p,
          ),
        },
        policyId,
        id,
        scenarioId,
      );
      setFeedback(null);
    });
  }
  function addScenario(clone: boolean) {
    if (locked || project.scenarios.length >= MAX_RATE_SCENARIOS) return;
    perform(() => {
      const id = nextId(
          "scenario",
          project.scenarios.map((s) => s.id),
        ),
        old = project.scenarios.find((s) => s.id === scenarioId)!;
      install(
        {
          ...project,
          scenarios: [
            ...project.scenarios,
            clone ? { ...old, id, name: id } : newRateScenario(id),
          ],
        },
        policyId,
        ruleId,
        id,
      );
      setFeedback(null);
    });
  }
  function generate() {
    perform(() => {
      const requests = generateRateSchedule(
        integer(generator.count),
        integer(generator.spacing),
        integer(generator.clients),
        generator.route,
        generator.method,
        integer(generator.cost),
      );
      setDraft((d) => ({
        ...d,
        scenario: { ...d.scenario, requests: json(requests) },
      }));
      notify("rate.generated");
    });
  }
  const retryLabel = (v: number | null) =>
    v === null ? t("rate.unbounded") : String(v);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("rate.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("rate.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("rate.scopeTitle")}
            </summary>
            {["algorithmHelp", "bounds", "retryHelp", "privacy", "limits"].map(
              (k) => (
                <p key={k}>{t(`rate.${k}` as TranslationKey)}</p>
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
            <p className="text-xs text-amber-800">{t("rate.pending")}</p>
          )}
          {busy && (
            <p role="status">
              {t("rate.busy")}{" "}
              {progress.total > 0 &&
                t("rate.progress", {
                  done: String(progress.done),
                  total: String(progress.total),
                })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(demoRateProject());
                  notify("rate.loaded");
                })
              }
            >
              {t("rate.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(emptyRateProject());
                  notify("rate.loaded");
                })
              }
            >
              {t("rate.new")}
            </button>
            <label className={buttonClass}>
              {t("rate.import")}
              <input
                className="mt-1 block max-w-56 text-xs"
                type="file"
                accept=".json,application/json"
                disabled={locked}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void importFile(file, false);
                }}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() =>
                  download(
                    serializeRateProject(project),
                    "rate-limit-project.json",
                  ),
                )
              }
            >
              {t("rate.export")}
            </button>
          </div>
          <fieldset disabled={busy} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label={t("rate.name")}
                value={draft.name}
                onChange={(name) => setDraft((d) => ({ ...d, name }))}
              />
              <Field
                label={t("rate.clock")}
                value={draft.clockMs}
                onChange={(clockMs) => setDraft((d) => ({ ...d, clockMs }))}
              />
            </div>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("rate.policySection")}</h4>
              <Select
                label={t("rate.policy")}
                value={policyId}
                disabled={locked}
                onChange={(id) => select(id, "")}
              >
                {project.policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </Select>
              <Field
                label={t("rate.policyName")}
                value={draft.policyName}
                onChange={(policyName) =>
                  setDraft((d) => ({ ...d, policyName }))
                }
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.policies.length >= MAX_RATE_POLICIES
                  }
                  onClick={() => addPolicy(false)}
                >
                  {t("rate.addPolicy")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.policies.length >= MAX_RATE_POLICIES
                  }
                  onClick={() => addPolicy(true)}
                >
                  {t("rate.clonePolicy")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.policies.length <= 1}
                  onClick={() =>
                    perform(() => {
                      const scenarios = project.scenarios.map((s) => ({
                        ...s,
                        requests: s.requests.map((r) => ({
                          ...r,
                          expect: Object.fromEntries(
                            Object.entries(r.expect).filter(
                              ([id]) => id !== policyId,
                            ),
                          ),
                        })),
                      }));
                      install(
                        {
                          ...project,
                          policies: project.policies.filter(
                            (p) => p.id !== policyId,
                          ),
                          scenarios,
                        },
                        undefined,
                        undefined,
                        scenarioId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("rate.deletePolicy")}
                </button>
              </div>
              <Select
                label={t("rate.rule")}
                value={ruleId}
                disabled={locked}
                onChange={(id) => select(policyId, id)}
              >
                {project.policies
                  .find((p) => p.id === policyId)!
                  .rules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id})
                    </option>
                  ))}
              </Select>
              <Field
                label={t("rate.ruleName")}
                value={draft.rule.name}
                onChange={(name) =>
                  setDraft((d) => ({ ...d, rule: { ...d.rule, name } }))
                }
              />
              <Check
                label={t("rate.enabled")}
                checked={draft.rule.enabled}
                onChange={(enabled) =>
                  setDraft((d) => ({ ...d, rule: { ...d.rule, enabled } }))
                }
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label={t("rate.algorithm")}
                  value={draft.rule.algorithm}
                  onChange={(algorithm) =>
                    setDraft((d) => ({
                      ...d,
                      rule: {
                        ...d.rule,
                        algorithm: algorithm as RateRule["algorithm"],
                      },
                    }))
                  }
                >
                  {RATE_ALGORITHMS.map((a) => (
                    <option key={a} value={a}>
                      {t(`rate.algorithm.${a}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  label={t("rate.scope")}
                  value={draft.rule.scope}
                  onChange={(scope) =>
                    setDraft((d) => ({
                      ...d,
                      rule: { ...d.rule, scope: scope as RateRule["scope"] },
                    }))
                  }
                >
                  {RATE_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {t(`rate.scope.${s}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {numericRule.map((k) => (
                  <Field
                    key={k}
                    label={t(
                      (
                        {
                          limit: "rate.limit",
                          windowMs: "rate.window",
                          refillTokens: "rate.refillTokens",
                          refillMs: "rate.refillMs",
                          keyCapacity: "rate.keyCapacity",
                        } as const
                      )[k],
                    )}
                    value={draft.rule[k]}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, rule: { ...d.rule, [k]: v } }))
                    }
                  />
                ))}
                <Field
                  label={t("rate.matchMethod")}
                  value={draft.rule.matchMethod}
                  onChange={(matchMethod) =>
                    setDraft((d) => ({
                      ...d,
                      rule: { ...d.rule, matchMethod },
                    }))
                  }
                />
                <Field
                  label={t("rate.matchRoute")}
                  value={draft.rule.matchRoute}
                  onChange={(matchRoute) =>
                    setDraft((d) => ({ ...d, rule: { ...d.rule, matchRoute } }))
                  }
                />
              </div>
              <p className="text-xs text-slate-600">{t("rate.ruleHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    project.policies.find((p) => p.id === policyId)!.rules
                      .length >= MAX_RATE_RULES
                  }
                  onClick={() => addRule(false)}
                >
                  {t("rate.addRule")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    project.policies.find((p) => p.id === policyId)!.rules
                      .length >= MAX_RATE_RULES
                  }
                  onClick={() => addRule(true)}
                >
                  {t("rate.cloneRule")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    project.policies.find((p) => p.id === policyId)!.rules
                      .length <= 1
                  }
                  onClick={() =>
                    perform(() => {
                      install(
                        {
                          ...project,
                          policies: project.policies.map((p) =>
                            p.id === policyId
                              ? {
                                  ...p,
                                  rules: p.rules.filter((r) => r.id !== ruleId),
                                }
                              : p,
                          ),
                        },
                        policyId,
                        undefined,
                        scenarioId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("rate.deleteRule")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    perform(() =>
                      download(
                        generateRateMiddleware(
                          project.policies.find((p) => p.id === policyId)!,
                        ),
                        "rate-limit-middleware.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("rate.exportMiddleware")}
                </button>
              </div>
              <p className="text-xs text-slate-600">
                {t("rate.middlewareHelp")}
              </p>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("rate.scenarioSection")}</h4>
              <Select
                label={t("rate.scenario")}
                value={scenarioId}
                disabled={locked}
                onChange={(id) => select(policyId, ruleId, id)}
              >
                {project.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id})
                  </option>
                ))}
              </Select>
              <Field
                label={t("rate.scenarioName")}
                value={draft.scenario.name}
                onChange={(name) =>
                  setDraft((d) => ({ ...d, scenario: { ...d.scenario, name } }))
                }
              />
              <Field
                label={t("rate.requests")}
                value={draft.scenario.requests}
                multiline
                onChange={(requests) =>
                  setDraft((d) => ({
                    ...d,
                    scenario: { ...d.scenario, requests },
                  }))
                }
              />
              <p className="text-xs text-slate-600">{t("rate.requestsHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.scenarios.length >= MAX_RATE_SCENARIOS
                  }
                  onClick={() => addScenario(false)}
                >
                  {t("rate.addScenario")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.scenarios.length >= MAX_RATE_SCENARIOS
                  }
                  onClick={() => addScenario(true)}
                >
                  {t("rate.cloneScenario")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.scenarios.length <= 1}
                  onClick={() =>
                    perform(() => {
                      install(
                        {
                          ...project,
                          scenarios: project.scenarios.filter(
                            (s) => s.id !== scenarioId,
                          ),
                        },
                        policyId,
                        ruleId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("rate.deleteScenario")}
                </button>
              </div>
              <h5 className="text-sm font-bold">{t("rate.budgets")}</h5>
              <div className="grid gap-3 md:grid-cols-2">
                {(
                  [
                    "minAccepted",
                    "maxLimited",
                    "maxCapacity",
                    "maxUnmatched",
                    "maxRetryMs",
                  ] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={t(`rate.budget.${k}`)}
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
              <details className="space-y-3 rounded-xl border p-3">
                <summary className="cursor-pointer font-bold">
                  {t("rate.generator")}
                </summary>
                <p className="text-xs text-slate-600">
                  {t("rate.generatorHelp")}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      "count",
                      "spacing",
                      "clients",
                      "route",
                      "method",
                      "cost",
                    ] as const
                  ).map((k) => (
                    <Field
                      key={k}
                      label={t(`rate.${k}`)}
                      value={generator[k]}
                      onChange={(v) => setGenerator((g) => ({ ...g, [k]: v }))}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={generate}
                >
                  {t("rate.generate")}
                </button>
              </details>
              <p className="text-xs text-slate-600">{t("rate.harHelp")}</p>
              <label className={buttonClass}>
                {t("rate.importHar")}
                <input
                  className="mt-1 block max-w-56 text-xs"
                  type="file"
                  accept=".har,.json,application/json"
                  disabled={locked}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void importFile(file, true);
                  }}
                />
              </label>
            </section>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            {busy && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  fail(new RateError("cancelled"));
                }}
              >
                {t("rate.cancel")}
              </button>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !pending}
              onClick={() =>
                perform(() => {
                  install(current(), policyId, ruleId, scenarioId);
                  notify("rate.saved");
                })
              }
            >
              {t("rate.save")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !pending}
              onClick={() => {
                setDraft(drafts(project, policyId, ruleId, scenarioId));
                setFeedback(null);
              }}
            >
              {t("rate.discard")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => void run(false)}
            >
              {t("rate.compare")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => void run(true)}
            >
              {t("rate.runAll")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !results}
              onClick={() =>
                perform(
                  () =>
                    results &&
                    download(
                      rateRunReport(results, includeRows),
                      "rate-limit-report.json",
                    ),
                )
              }
            >
              {t("rate.report")}
            </button>
          </div>
          <Check
            label={t("rate.includeRows")}
            checked={includeRows}
            onChange={setIncludeRows}
          />
          {results && selected && (
            <section
              aria-label={t("rate.results")}
              className="space-y-4 rounded-xl border p-3"
            >
              <h4 className="font-bold">{t("rate.results")}</h4>
              <div className="overflow-x-auto">
                <table
                  aria-label={t("rate.results")}
                  className="w-full text-left text-xs"
                >
                  <thead>
                    <tr>
                      {[
                        "policyColumn",
                        "admitted",
                        "limited",
                        "capacity",
                        "unmatched",
                        "retry",
                        "verdict",
                      ].map((k) => (
                        <th key={k} className="p-2">
                          {t(`rate.${k}` as TranslationKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={runKey(r)}
                        className={`border-t ${runKey(r) === runKey(selected) ? "bg-purple-50" : ""}`}
                      >
                        <td className="p-2">
                          {r.policyName} / {r.scenarioName}
                        </td>
                        <td className="p-2">{r.accepted}</td>
                        <td className="p-2">{r.limited}</td>
                        <td className="p-2">{r.capacity}</td>
                        <td className="p-2">{r.unmatched}</td>
                        <td className="p-2">{retryLabel(r.maxRetryMs)}</td>
                        <td className="p-2">
                          {t(r.passed ? "rate.passed" : "rate.failed")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Select
                label={t("rate.result")}
                value={runKey(selected)}
                onChange={(key) => {
                  setSelectedKey(key);
                  setRowIndex(0);
                  setSearch("");
                  setOutcome("");
                  setPage(0);
                }}
              >
                {results.map((r) => (
                  <option key={runKey(r)} value={runKey(r)}>
                    {r.scenarioName} / {r.policyName}
                  </option>
                ))}
              </Select>
              <ul className="list-inside list-disc text-xs">
                {selected.checks.map((c) => (
                  <li
                    key={c.code}
                    className={c.passed ? "text-green-800" : "text-red-700"}
                  >
                    {t("rate.checkRow", {
                      name: t(`rate.budget.${c.code}`),
                      state: t(
                        c.checked
                          ? c.passed
                            ? "rate.passed"
                            : "rate.failed"
                          : "rate.unchecked",
                      ),
                      actual: retryLabel(c.value),
                      limit:
                        c.limit === null
                          ? t("rate.unchecked")
                          : String(c.limit),
                    })}
                  </li>
                ))}
              </ul>
              <h5 className="text-sm font-bold">{t("rate.sequence")}</h5>
              <div
                aria-label={t("rate.sequence")}
                className="grid grid-cols-10 gap-1 sm:grid-cols-20"
              >
                {selected.rows.map((row) => (
                  <button
                    type="button"
                    key={row.index}
                    aria-label={t("rate.event", {
                      name: row.request.name,
                      time: String(row.request.atMs),
                      outcome: t(`rate.outcome.${row.decision.outcome}`),
                    })}
                    aria-pressed={selectedRow?.index === row.index}
                    className={`rounded p-1 text-xs font-semibold ${row.decision.outcome === "allowed" ? "bg-green-100 text-green-900" : row.decision.outcome === "limited" ? "bg-purple-100 text-purple-900" : row.decision.outcome === "capacity" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"} ${selectedRow?.index === row.index ? "ring-2 ring-purple-600" : ""}`}
                    onClick={() => setRowIndex(row.index)}
                  >
                    {row.index + 1}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label={t("rate.rowSearch")}
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    setPage(0);
                  }}
                />
                <Select
                  label={t("rate.outcomeFilter")}
                  value={outcome}
                  onChange={(v) => {
                    setOutcome(v);
                    setPage(0);
                  }}
                >
                  <option value="">{t("rate.allOutcomes")}</option>
                  {RATE_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {t(`rate.outcome.${o}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-xs">
                {t("rate.shown", {
                  shown: String(visible.length),
                  total: String(filtered.length),
                  page: String(currentPage + 1),
                  pages: String(pages),
                })}
              </p>
              <div className="overflow-x-auto">
                <table
                  aria-label={t("rate.requestRows")}
                  className="w-full text-left text-xs"
                >
                  <thead>
                    <tr>
                      {[
                        "at",
                        "client",
                        "routeColumn",
                        "costColumn",
                        "outcomeColumn",
                        "retryColumn",
                        "requestExpectation",
                      ].map((k) => (
                        <th key={k} className="p-2">
                          {t(`rate.${k}` as TranslationKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.index} className="border-t">
                        <td className="p-2">{row.request.atMs}</td>
                        <td className="p-2">{row.request.client}</td>
                        <td className="p-2">
                          {row.request.method} {row.request.route}
                        </td>
                        <td className="p-2">{row.request.cost}</td>
                        <td className="p-2">
                          {t(`rate.outcome.${row.decision.outcome}`)}
                        </td>
                        <td className="p-2">
                          {retryLabel(row.decision.retryAfterMs)}
                        </td>
                        <td className="p-2">
                          {t(
                            row.expected === undefined
                              ? "rate.unchecked"
                              : row.passed
                                ? "rate.passed"
                                : "rate.failed",
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {t("rate.previous")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={currentPage >= pages - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("rate.next")}
                </button>
              </div>
              {selectedRow && (
                <Field
                  label={t("rate.selectedRequest")}
                  value={json(selectedRow)}
                  multiline
                  readOnly
                />
              )}
              <h5 className="text-sm font-bold">{t("rate.clientSummary")}</h5>
              <div className="overflow-x-auto">
                <table
                  aria-label={t("rate.clientSummary")}
                  className="w-full text-left text-xs"
                >
                  <thead>
                    <tr>
                      {[
                        "client",
                        "requestCount",
                        "admitted",
                        "requestedCost",
                        "admittedCost",
                      ].map((k) => (
                        <th key={k} className="p-2">
                          {t(`rate.${k}` as TranslationKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.clients.map((c) => (
                      <tr key={c.index} className="border-t">
                        <td className="p-2">{c.client}</td>
                        <td className="p-2">{c.requests}</td>
                        <td className="p-2">{c.accepted}</td>
                        <td className="p-2">{c.requestedCost}</td>
                        <td className="p-2">{c.admittedCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
