"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  CORS_METHODS,
  CORS_OUTCOMES,
  CORS_PREFLIGHTS,
  MAX_CORS_BYTES,
  MAX_CORS_CASES,
  MAX_CORS_POLICIES,
  MAX_CORS_SCENARIOS,
  CorsError,
  corsError,
  defaultCorsBudgets,
  defaultCorsCase,
  emptyCorsProject,
  normalizeCorsProject,
  parseCorsProject,
  serializeCorsProject,
  type CorsBudgets,
  type CorsCase,
  type CorsFixture,
  type CorsProject,
} from "@/lib/cors-project";
import { corsPolicyFindings } from "@/lib/cors-protocol";
import {
  corsRunReport,
  runCorsProject,
  type CorsRun,
  type CorsSimulation,
} from "@/lib/cors-engine";
import { generateCorsMiddleware } from "@/lib/cors-export";
import { demoCorsProject } from "@/lib/cors-demo";
import type { TranslationKey } from "@/lib/translations";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const number = (value: string) =>
  /^\d+$/.test(value.trim()) ? Number(value) : NaN;
const budgetKeys = ["maxBlocked", "maxPreflights", "maxWaitMs"] as const;
const csv = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const fixtureDraft = (f: CorsFixture) => ({
  ...f,
  status: String(f.status),
  headers: json(f.headers),
  delayMs: String(f.delayMs),
});
type FixtureDraft = ReturnType<typeof fixtureDraft>;
function drafts(
  project: CorsProject,
  policyId: string,
  scenarioId: string,
  caseId: string,
) {
  const p = project.policies.find((p) => p.id === policyId)!,
    s = project.scenarios.find((s) => s.id === scenarioId)!,
    c = s.cases.find((c) => c.id === caseId)!;
  return {
    name: project.name,
    maxAgeCap: String(project.maxAgeCap),
    cacheCapacity: String(project.cacheCapacity),
    policy: {
      ...p,
      origins: p.origins.join("\n"),
      methods: p.methods.join(", "),
      requestHeaders: p.requestHeaders.join(", "),
      exposeHeaders: p.exposeHeaders.join(", "),
      maxAge: String(p.maxAge),
    },
    scenario: {
      name: s.name,
      budgets: Object.fromEntries(
        budgetKeys.map((k) => [k, String(s.budgets[k])]),
      ) as Record<keyof CorsBudgets, string>,
    },
    request: {
      ...c,
      atMs: String(c.atMs),
      headers: json(c.headers),
      preflight: fixtureDraft(c.preflight),
      response: fixtureDraft(c.response),
      expectOutcome: c.expect.outcome ?? "",
      expectPreflight: c.expect.preflight ?? "",
      expectStatus:
        c.expect.status === undefined ? "" : String(c.expect.status),
    },
  };
}
type Draft = ReturnType<typeof drafts>;
function parse(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new CorsError("json");
  }
}
function nextId(prefix: string, ids: string[]) {
  let i = 1;
  while (ids.includes(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
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
  onChange?: (value: string) => void;
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
          spellCheck={false}
          readOnly={readOnly}
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
  onChange: (value: string) => void;
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
  onChange: (value: boolean) => void;
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
function FixtureEditor({
  kind,
  value,
  onChange,
}: {
  kind: "preflight" | "response";
  value: FixtureDraft;
  onChange: (patch: Partial<FixtureDraft>) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="space-y-3 rounded-lg bg-slate-50 p-3">
      <h5 className="text-sm font-bold">
        {t(
          kind === "preflight" ? "cors.preflightFixture" : "cors.actualFixture",
        )}
      </h5>
      <Check
        label={t(
          kind === "preflight" ? "cors.preflightPolicy" : "cors.responsePolicy",
        )}
        checked={value.usePolicy}
        onChange={(usePolicy) => onChange({ usePolicy })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label={t(
            kind === "preflight"
              ? "cors.preflightStatus"
              : "cors.responseStatus",
          )}
          value={value.status}
          onChange={(status) => onChange({ status })}
        />
        <Field
          label={t(
            kind === "preflight" ? "cors.preflightDelay" : "cors.responseDelay",
          )}
          value={value.delayMs}
          onChange={(delayMs) => onChange({ delayMs })}
        />
      </div>
      <Field
        label={t(
          kind === "preflight"
            ? "cors.preflightHeaders"
            : "cors.responseHeaders",
        )}
        value={value.headers}
        multiline
        onChange={(headers) => onChange({ headers })}
      />
      {kind === "response" && (
        <Field
          label={t("cors.responseBody")}
          value={value.body}
          multiline
          onChange={(body) => onChange({ body })}
        />
      )}
    </section>
  );
}
function CorsDetails({ simulation }: { simulation: CorsSimulation }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(""),
    [outcome, setOutcome] = useState("all"),
    [caseId, setCaseId] = useState("");
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = simulation.rows.filter(
    (r) =>
      (outcome === "all" || r.outcome === outcome) &&
      terms.every((term) =>
        `${r.name} ${r.method} ${r.url} ${r.origin} ${t(`cors.outcome.${r.outcome}`)} ${t(`cors.preflight.${r.preflight}`)} ${r.notes.map((n) => t(`cors.reason.${n}`)).join(" ")}`
          .toLowerCase()
          .includes(term),
      ),
  );
  const selected =
    simulation.rows.find((r) => r.id === caseId) ?? simulation.rows[0];
  const end = Math.max(1, ...simulation.rows.map((r) => r.completedMs));
  return (
    <section
      aria-label={t("cors.result")}
      className="space-y-4 rounded-xl border p-3"
    >
      <h4 className="font-bold">
        {simulation.scenarioName} / {simulation.policyName}
      </h4>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Object.entries(simulation.metrics).map(([key, value]) => (
          <div key={key} className="rounded-lg bg-slate-50 p-2 text-xs">
            <p>{t(`cors.metric.${key}` as TranslationKey)}</p>
            <strong className="text-lg">{value}</strong>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-xs">
        {simulation.budgets.map((b) => (
          <li key={b.id}>
            {t(`cors.budget.${b.id}`)}: {b.actual} / {b.limit} ·{" "}
            {t(b.passed ? "cors.passed" : "cors.failed")}
          </li>
        ))}
      </ul>
      <h4 className="font-bold">{t("cors.timeline")}</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold">
          {t("cors.search")}
          <input
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setQuery("");
              }
            }}
          />
        </label>
        <Select label={t("cors.filter")} value={outcome} onChange={setOutcome}>
          <option value="all">{t("cors.all")}</option>
          {CORS_OUTCOMES.map((v) => (
            <option key={v} value={v}>
              {t(`cors.outcome.${v}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{t("cors.timeline")}</caption>
          <thead>
            <tr>
              {["time", "request", "outcome", "preflight", "check"].map((k) => (
                <th key={k} className="p-2">
                  {t(`cors.column.${k}` as TranslationKey)}
                </th>
              ))}
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
                      className={`h-1 min-w-1 rounded ${r.outcome === "blocked" || r.outcome === "invalid" ? "bg-amber-500" : "bg-purple-500"}`}
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
                    aria-label={`${t("cors.inspect")}: ${r.name}`}
                    aria-pressed={selected.id === r.id}
                    onClick={() => setCaseId(r.id)}
                  >
                    {r.name}
                  </button>
                  <p>{r.method}</p>
                </td>
                <td className="p-2">
                  {t(`cors.outcome.${r.outcome}`)} / {r.scriptStatus}
                </td>
                <td className="p-2">{t(`cors.preflight.${r.preflight}`)}</td>
                <td className="p-2">
                  {t(r.passed ? "cors.passed" : "cors.failed")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!matches.length && <p className="text-xs">{t("cors.noMatches")}</p>}
      <section
        aria-label={t("cors.inspector")}
        className="space-y-3 rounded-lg bg-slate-50 p-3"
      >
        <h5 className="text-sm font-bold">
          {selected.name}: {t(`cors.outcome.${selected.outcome}`)}
        </h5>
        <p className="break-all font-mono text-xs">
          {selected.origin} → {selected.method} {selected.url}
        </p>
        <div className="grid gap-2 text-xs md:grid-cols-3">
          <p className="rounded border bg-white p-2">
            {t("cors.requestAttempted", {
              value: t(selected.requestSent ? "cors.yes" : "cors.no"),
            })}
          </p>
          <p className="rounded border bg-white p-2">
            {t(`cors.preflight.${selected.preflight}`)} /{" "}
            {selected.preflightStatus}
          </p>
          <p className="rounded border bg-white p-2">
            {t("cors.ambient", {
              value: t(selected.ambientCredentials ? "cors.yes" : "cors.no"),
            })}
          </p>
        </div>
        <p className="text-xs">{t("cors.preflightNeverCredentials")}</p>
        <ul className="list-inside list-disc text-xs">
          {selected.notes.map((n, i) => (
            <li key={i}>{t(`cors.reason.${n}`)}</li>
          ))}
        </ul>
        <Field
          label={t("cors.exchange")}
          value={json({
            request: selected.requestHeaders,
            unsafeHeaderNames: selected.unsafeHeaders,
            preflightRequest: selected.preflightRequest,
            preflightStatus: selected.preflightStatus,
            preflightResponse: selected.preflightResponse,
            actualStatus: selected.networkStatus,
            actualResponse: selected.responseHeaders,
          })}
          multiline
          readOnly
        />
        <Field
          label={t("cors.visibleHeaders")}
          value={json(selected.visibleHeaders)}
          multiline
          readOnly
        />
        <Field
          label={t("cors.visibleBody")}
          value={selected.visibleBody}
          multiline
          readOnly
        />
      </section>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-bold">
          {t("cors.cache")}
        </summary>
        <Field
          label={t("cors.cacheData")}
          value={json(simulation.cache)}
          multiline
          readOnly
        />
      </details>
    </section>
  );
}

export const CorsStudioPanel = memo(function CorsStudioPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyCorsProject);
  const [policyId, setPolicyId] = useState("trusted"),
    [scenarioId, setScenarioId] = useState("scenario-1"),
    [caseId, setCaseId] = useState("request-1");
  const [draft, setDraft] = useState(() =>
    drafts(emptyCorsProject(), "trusted", "scenario-1", "request-1"),
  );
  const [run, setRun] = useState<CorsRun | null>(null),
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
  const policy = project.policies.find((p) => p.id === policyId)!,
    scenario = project.scenarios.find((s) => s.id === scenarioId)!;
  const pending =
      json(draft) !== json(drafts(project, policyId, scenarioId, caseId)),
    locked = pending || reading;
  const findings = corsPolicyFindings(policy);
  let middleware: string | null = null;
  if (open) {
    try {
      middleware = generateCorsMiddleware(policy);
    } catch {
      // Broken policies remain available for rehearsal but cannot be exported.
    }
  }
  const result = run?.simulations[Number(resultIndex)] ?? run?.simulations[0];
  const notify = (
    key: TranslationKey,
    values?: Record<string, string>,
    error = false,
  ) => setFeedback({ key, values, error });
  const fail = (e: unknown) =>
    setFeedback({ key: `cors.error.${corsError(e)}`, error: true });
  function perform(action: () => void) {
    try {
      action();
    } catch (e) {
      fail(e);
    }
  }
  function install(
    next: CorsProject,
    p = next.policies[0].id,
    s = next.scenarios[0].id,
    c = next.scenarios.find((v) => v.id === s)!.cases[0].id,
  ) {
    next = normalizeCorsProject(next);
    setProject(next);
    setPolicyId(p);
    setScenarioId(s);
    setCaseId(c);
    setDraft(drafts(next, p, s, c));
    setRun(null);
    setResultIndex("0");
  }
  function select(p: string, s: string, c: string) {
    if (locked) return;
    setPolicyId(p);
    setScenarioId(s);
    setCaseId(c);
    setDraft(drafts(project, p, s, c));
    setFeedback(null);
  }
  const editRequest = (patch: Partial<Draft["request"]>) =>
    setDraft((d) => ({ ...d, request: { ...d.request, ...patch } }));
  function save() {
    perform(() => {
      const r = draft.request;
      const f = (v: FixtureDraft) => ({
        ...v,
        status: number(v.status),
        delayMs: number(v.delayMs),
        headers: parse(v.headers),
      });
      const next = normalizeCorsProject({
        ...project,
        name: draft.name,
        maxAgeCap: number(draft.maxAgeCap),
        cacheCapacity: number(draft.cacheCapacity),
        policies: project.policies.map((p) =>
          p.id !== policyId
            ? p
            : {
                ...draft.policy,
                origins: draft.policy.origins
                  .split(/\r?\n/)
                  .map((v) => v.trim())
                  .filter(Boolean),
                methods: csv(draft.policy.methods),
                requestHeaders: csv(draft.policy.requestHeaders),
                exposeHeaders: csv(draft.policy.exposeHeaders),
                maxAge: number(draft.policy.maxAge),
              },
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
                cases: s.cases.map((c) =>
                  c.id !== caseId
                    ? c
                    : {
                        ...r,
                        atMs: number(r.atMs),
                        headers: parse(r.headers),
                        preflight: f(r.preflight),
                        response: f(r.response),
                        expect: {
                          ...(r.expectOutcome
                            ? { outcome: r.expectOutcome }
                            : {}),
                          ...(r.expectPreflight
                            ? { preflight: r.expectPreflight }
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
      install(next, policyId, scenarioId, caseId);
      notify("cors.saved");
    });
  }
  function download(source: string, name: string, mime = "application/json") {
    try {
      const ok = downloadTextFile(source, name, mime);
      notify(ok ? "cors.downloaded" : "cors.downloadFailed", undefined, !ok);
    } catch {
      notify("cors.downloadFailed", undefined, true);
    }
  }
  async function importFile(file: File | undefined) {
    if (!file || locked) return;
    if (file.size > MAX_CORS_BYTES) {
      fail(new CorsError("limit"));
      return;
    }
    const ticket = ++generation.current;
    setReading(true);
    setFeedback(null);
    try {
      const source = await file.text();
      if (ticket !== generation.current) return;
      install(parseCorsProject(source));
      notify("cors.loaded");
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) setReading(false);
    }
  }
  function rehearse(all: boolean) {
    if (locked) return;
    perform(() => {
      const next = runCorsProject(project, all ? undefined : { scenarioId });
      setRun(next);
      setResultIndex("0");
      notify("cors.completed", {
        passed: String(next.simulations.filter((s) => s.passed).length),
        total: String(next.simulations.length),
      });
    });
  }
  function add(kind: "policy" | "scenario" | "case") {
    if (locked) return;
    perform(() => {
      if (kind === "policy" && project.policies.length < MAX_CORS_POLICIES) {
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
          caseId,
        );
      } else if (
        kind === "scenario" &&
        project.scenarios.length < MAX_CORS_SCENARIOS
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
                cases: [defaultCorsCase()],
                budgets: defaultCorsBudgets(),
              },
            ],
          },
          policyId,
          id,
        );
      } else if (kind === "case" && scenario.cases.length < MAX_CORS_CASES) {
        const id = nextId(
          "request",
          scenario.cases.map((c) => c.id),
        );
        install(
          {
            ...project,
            scenarios: project.scenarios.map((s) =>
              s.id !== scenarioId
                ? s
                : {
                    ...s,
                    cases: [
                      ...s.cases,
                      defaultCorsCase(
                        id,
                        Math.min(604800000, s.cases.at(-1)!.atMs + 1000),
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
    });
  }
  function remove(kind: "policy" | "scenario" | "case") {
    if (locked) return;
    perform(() => {
      if (kind === "policy" && project.policies.length > 1)
        install(
          {
            ...project,
            policies: project.policies.filter((p) => p.id !== policyId),
          },
          project.policies.find((p) => p.id !== policyId)!.id,
          scenarioId,
          caseId,
        );
      else if (kind === "scenario" && project.scenarios.length > 1)
        install(
          {
            ...project,
            scenarios: project.scenarios.filter((s) => s.id !== scenarioId),
          },
          policyId,
        );
      else if (kind === "case" && scenario.cases.length > 1)
        install(
          {
            ...project,
            scenarios: project.scenarios.map((s) =>
              s.id !== scenarioId
                ? s
                : { ...s, cases: s.cases.filter((c) => c.id !== caseId) },
            ),
          },
          policyId,
          scenarioId,
        );
      setFeedback(null);
    });
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("cors.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("cors.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("cors.scopeTitle")}
            </summary>
            <p>{t("cors.scope")}</p>
            <p>{t("cors.fixtureHelp")}</p>
            <p>{t("cors.authorizationHelp")}</p>
            <p>{t("cors.privacy")}</p>
            <p>{t("cors.limits")}</p>
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
            <p className="text-xs text-amber-800">{t("cors.pending")}</p>
          )}
          {reading && <p role="status">{t("cors.reading")}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(demoCorsProject());
                  notify("cors.loaded");
                })
              }
            >
              {t("cors.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(emptyCorsProject());
                  notify("cors.loaded");
                })
              }
            >
              {t("cors.new")}
            </button>
            <label className={buttonClass}>
              {t("cors.import")}
              <input
                className="mt-1 block max-w-56 text-xs"
                type="file"
                accept=".json,application/json"
                disabled={locked}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void importFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() =>
                  download(serializeCorsProject(project), "cors-project.json"),
                )
              }
            >
              {t("cors.export")}
            </button>
          </div>
          <fieldset disabled={reading} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {(["name", "maxAgeCap", "cacheCapacity"] as const).map((k) => (
                <Field
                  key={k}
                  label={t(k === "name" ? "cors.projectName" : `cors.${k}`)}
                  value={draft[k]}
                  onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
                />
              ))}
            </div>
            <section className="space-y-3 rounded-xl border p-3">
              <div className="grid items-end gap-3 md:grid-cols-3">
                <Select
                  label={t("cors.policy")}
                  value={policyId}
                  disabled={locked}
                  onChange={(p) => select(p, scenarioId, caseId)}
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
                    locked || project.policies.length >= MAX_CORS_POLICIES
                  }
                  onClick={() => add("policy")}
                >
                  {t("cors.addPolicy")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.policies.length <= 1}
                  onClick={() => remove("policy")}
                >
                  {t("cors.deletePolicy")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(
                  [
                    "name",
                    "origins",
                    "methods",
                    "requestHeaders",
                    "exposeHeaders",
                    "maxAge",
                  ] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={t(k === "name" ? "cors.policyName" : `cors.${k}`)}
                    value={draft.policy[k]}
                    multiline={k === "origins"}
                    onChange={(value) =>
                      setDraft((d) => ({
                        ...d,
                        policy: { ...d.policy, [k]: value },
                      }))
                    }
                  />
                ))}
              </div>
              <Check
                label={t("cors.credentials")}
                checked={draft.policy.credentials}
                onChange={(credentials) =>
                  setDraft((d) => ({
                    ...d,
                    policy: { ...d.policy, credentials },
                  }))
                }
              />
              {!!findings.length && (
                <section
                  aria-label={t("cors.findings")}
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3"
                >
                  <h5 className="text-sm font-bold">{t("cors.findings")}</h5>
                  <ul className="list-inside list-disc text-xs">
                    {findings.map((f) => (
                      <li key={f.code}>{t(`cors.finding.${f.code}`)}</li>
                    ))}
                  </ul>
                </section>
              )}
              <button
                type="button"
                className={buttonClass}
                disabled={locked || !middleware}
                onClick={() =>
                  middleware &&
                  download(middleware, "cors-middleware.mjs", "text/javascript")
                }
              >
                {t("cors.middleware")}
              </button>
              {middleware && (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("cors.middlewarePreview")}
                  </summary>
                  <Field
                    label={t("cors.middlewareSource")}
                    value={middleware}
                    multiline
                    readOnly
                  />
                </details>
              )}
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <div className="grid items-end gap-3 md:grid-cols-3">
                <Select
                  label={t("cors.scenario")}
                  value={scenarioId}
                  disabled={locked}
                  onChange={(s) =>
                    select(
                      policyId,
                      s,
                      project.scenarios.find((v) => v.id === s)!.cases[0].id,
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
                    locked || project.scenarios.length >= MAX_CORS_SCENARIOS
                  }
                  onClick={() => add("scenario")}
                >
                  {t("cors.addScenario")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.scenarios.length <= 1}
                  onClick={() => remove("scenario")}
                >
                  {t("cors.deleteScenario")}
                </button>
              </div>
              <Field
                label={t("cors.scenarioName")}
                value={draft.scenario.name}
                onChange={(name) =>
                  setDraft((d) => ({ ...d, scenario: { ...d.scenario, name } }))
                }
              />
              <div className="grid gap-3 md:grid-cols-3">
                {budgetKeys.map((k) => (
                  <Field
                    key={k}
                    label={t(`cors.budget.${k}`)}
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
                  label={t("cors.case")}
                  value={caseId}
                  disabled={locked}
                  onChange={(c) => select(policyId, scenarioId, c)}
                >
                  {scenario.cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.atMs} ms)
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || scenario.cases.length >= MAX_CORS_CASES}
                  onClick={() => add("case")}
                >
                  {t("cors.addCase")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || scenario.cases.length <= 1}
                  onClick={() => remove("case")}
                >
                  {t("cors.deleteCase")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(["name", "atMs", "partition", "origin", "url"] as const).map(
                  (k) => (
                    <Field
                      key={k}
                      label={t(k === "name" ? "cors.caseName" : `cors.${k}`)}
                      value={draft.request[k]}
                      onChange={(value) => editRequest({ [k]: value })}
                    />
                  ),
                )}
                <Select
                  label={t("cors.method")}
                  value={draft.request.method}
                  onChange={(method) =>
                    editRequest({ method: method as CorsCase["method"] })
                  }
                >
                  {CORS_METHODS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
                <Select
                  label={t("cors.mode")}
                  value={draft.request.mode}
                  onChange={(mode) =>
                    editRequest({ mode: mode as CorsCase["mode"] })
                  }
                >
                  {(["cors", "same-origin", "no-cors"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`cors.mode.${v}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  label={t("cors.credentialMode")}
                  value={draft.request.credentials}
                  onChange={(credentials) =>
                    editRequest({
                      credentials: credentials as CorsCase["credentials"],
                    })
                  }
                >
                  {(["omit", "same-origin", "include"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`cors.credential.${v}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <Field
                label={t("cors.browserHeaders")}
                value={draft.request.headers}
                multiline
                onChange={(headers) => editRequest({ headers })}
              />
              <Check
                label={t("cors.force")}
                checked={draft.request.forcePreflight}
                onChange={(forcePreflight) => editRequest({ forcePreflight })}
              />
              {(["preflight", "response"] as const).map((kind) => (
                <FixtureEditor
                  key={kind}
                  kind={kind}
                  value={draft.request[kind]}
                  onChange={(patch) =>
                    setDraft((d) => ({
                      ...d,
                      request: {
                        ...d.request,
                        [kind]: { ...d.request[kind], ...patch },
                      },
                    }))
                  }
                />
              ))}
              <div className="grid gap-3 md:grid-cols-3">
                <Select
                  label={t("cors.expectOutcome")}
                  value={draft.request.expectOutcome}
                  onChange={(expectOutcome) =>
                    editRequest({
                      expectOutcome:
                        expectOutcome as Draft["request"]["expectOutcome"],
                    })
                  }
                >
                  <option value="">{t("cors.unchecked")}</option>
                  {CORS_OUTCOMES.map((v) => (
                    <option key={v} value={v}>
                      {t(`cors.outcome.${v}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  label={t("cors.expectPreflight")}
                  value={draft.request.expectPreflight}
                  onChange={(expectPreflight) =>
                    editRequest({
                      expectPreflight:
                        expectPreflight as Draft["request"]["expectPreflight"],
                    })
                  }
                >
                  <option value="">{t("cors.unchecked")}</option>
                  {CORS_PREFLIGHTS.map((v) => (
                    <option key={v} value={v}>
                      {t(`cors.preflight.${v}`)}
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("cors.expectStatus")}
                  value={draft.request.expectStatus}
                  onChange={(expectStatus) => editRequest({ expectStatus })}
                />
              </div>
            </section>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!pending || reading}
              onClick={save}
            >
              {t("cors.save")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!pending || reading}
              onClick={() => {
                setDraft(drafts(project, policyId, scenarioId, caseId));
                setFeedback(null);
              }}
            >
              {t("cors.discard")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => rehearse(false)}
            >
              {t("cors.run")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => rehearse(true)}
            >
              {t("cors.runAll")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !run}
              onClick={() =>
                run && download(corsRunReport(run), "cors-report.json")
              }
            >
              {t("cors.report")}
            </button>
          </div>
          {run && result && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="mb-2 text-left text-sm font-bold">
                    {t("cors.comparison")}
                  </caption>
                  <thead>
                    <tr>
                      <th className="p-2">{t("cors.result")}</th>
                      {(
                        [
                          "allowed",
                          "blocked",
                          "preflights",
                          "cacheHits",
                          "totalWaitMs",
                        ] as const
                      ).map((k) => (
                        <th key={k} className="p-2">
                          {t(`cors.metric.${k}`)}
                        </th>
                      ))}
                      <th className="p-2">{t("cors.column.check")}</th>
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
                            "allowed",
                            "blocked",
                            "preflights",
                            "cacheHits",
                            "totalWaitMs",
                          ] as const
                        ).map((k) => (
                          <td key={k} className="p-2">
                            {s.metrics[k]}
                          </td>
                        ))}
                        <td className="p-2">
                          {t(s.passed ? "cors.passed" : "cors.failed")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Select
                label={t("cors.resultSelector")}
                value={String(run.simulations.indexOf(result))}
                onChange={setResultIndex}
              >
                {run.simulations.map((s, index) => (
                  <option key={index} value={String(index)}>
                    {s.scenarioName} / {s.policyName}
                  </option>
                ))}
              </Select>
              <CorsDetails
                key={`${result.scenarioId}/${result.policyId}`}
                simulation={result}
              />
            </>
          )}
        </div>
      )}
    </details>
  );
});
