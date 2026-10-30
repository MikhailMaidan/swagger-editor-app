"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  AUTHZ_OPERATORS,
  AUTHZ_SOURCES,
  AuthzError,
  MAX_AUTHZ_BYTES,
  MAX_AUTHZ_CASES,
  MAX_AUTHZ_POLICIES,
  MAX_AUTHZ_RULES,
  authzJson,
  authzJsonValue,
  emptyAuthzProject,
  newAuthzCase,
  newAuthzRule,
  normalizeAuthzCondition,
  normalizeAuthzProject,
  parseAuthzProject,
  serializeAuthzProject,
  type AuthzCondition,
  type AuthzOperand,
  type AuthzProject,
} from "@/lib/authz-project";
import {
  authzActionsFromSchema,
  authzReport,
  demoAuthzProject,
  generateAuthzCases,
  roleCondition,
  runAuthzMatrix,
  tenantCondition,
  type AuthzRun,
} from "@/lib/authz-studio";
import { generateAuthzGuard } from "@/lib/authz-export";
import type { TranslationKey } from "@/lib/translations";

const json = (v: unknown) => JSON.stringify(v, null, 2);
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
function nextId(prefix: string, ids: string[]) {
  let n = 1;
  while (ids.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function drafts(
  p: AuthzProject,
  policyId: string,
  ruleId: string,
  caseId: string,
) {
  const policy = p.policies.find((v) => v.id === policyId)!,
    rule = policy.rules.find((v) => v.id === ruleId),
    item = p.cases.find((v) => v.id === caseId);
  return {
    name: p.name,
    policyName: policy.name,
    rule: rule
      ? {
          name: rule.name,
          enabled: rule.enabled,
          effect: rule.effect,
          mode: rule.mode,
          actions: rule.actions.join("\n"),
          conditions: json(rule.conditions),
        }
      : null,
    item: item
      ? {
          name: item.name,
          action: item.action,
          subject: json(item.subject),
          resource: json(item.resource),
          context: json(item.context),
          expect: json(item.expect),
        }
      : null,
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
          rows={6}
          spellCheck={false}
          value={value}
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
export const AuthorizationPanel = memo(function AuthorizationPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyAuthzProject),
    [policyId, setPolicyId] = useState("policy-1"),
    [ruleId, setRuleId] = useState("rule-1"),
    [caseId, setCaseId] = useState("case-1"),
    [draft, setDraft] = useState(() =>
      drafts(emptyAuthzProject(), "policy-1", "rule-1", "case-1"),
    );
  const [builder, setBuilder] = useState({
    operator: "contains" as AuthzCondition["operator"],
    leftSource: "subject" as AuthzOperand["source"],
    leftValue: "/roles",
    rightSource: "literal" as AuthzOperand["source"],
    rightValue: '"reader"',
  });
  const [generator, setGenerator] = useState({
    subjects: json([newAuthzCase().subject, null]),
    resources: json([newAuthzCase().resource]),
    actions: json(["documents:read", "documents:update"]),
    context: "{}",
  });
  const [results, setResults] = useState<AuthzRun[] | null>(null),
    [resultId, setResultId] = useState(""),
    [inspectId, setInspectId] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [changedOnly, setChangedOnly] = useState(false),
    [page, setPage] = useState(0),
    [includeDetails, setIncludeDetails] = useState(false);
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
    pending = json(draft) !== json(drafts(project, policyId, ruleId, caseId)),
    locked = busy || pending;
  const selected =
      results?.find((r) => r.policyId === resultId) ?? results?.[0],
    row =
      selected?.rows.find((r) => r.caseId === inspectId) ?? selected?.rows[0];
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean),
    filtered =
      selected?.rows.filter(
        (r) =>
          (!filter || r.decision.effect === filter) &&
          (!changedOnly || r.decision.effect !== r.baseline) &&
          terms.every((term) =>
            `${r.name} ${r.action} ${r.caseId}`.toLowerCase().includes(term),
          ),
      ) ?? [];
  const pages = Math.max(1, Math.ceil(filtered.length / 100)),
    currentPage = Math.min(page, pages - 1),
    visible = filtered.slice(currentPage * 100, currentPage * 100 + 100);
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, error: false, values });
  const fail = (e: unknown) =>
    setFeedback({
      key: `authz.error.${e instanceof AuthzError ? e.code : "project"}`,
      error: true,
    });
  const perform = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      fail(e);
    }
  };
  function choose(p: AuthzProject, pid: string, rid: string, cid: string) {
    setPolicyId(pid);
    setRuleId(rid);
    setCaseId(cid);
    setDraft(drafts(p, pid, rid, cid));
  }
  function install(
    value: AuthzProject,
    pid = policyId,
    rid = ruleId,
    cid = caseId,
  ) {
    const p = normalizeAuthzProject(value),
      selected = p.policies.find((v) => v.id === pid) ?? p.policies[0];
    const rule = selected.rules.find((v) => v.id === rid) ?? selected.rules[0],
      item = p.cases.find((v) => v.id === cid) ?? p.cases[0];
    setProject(p);
    choose(p, selected.id, rule?.id ?? "", item?.id ?? "");
    setResults(null);
    setSearch("");
    setFilter("");
    setChangedOnly(false);
    setPage(0);
  }
  function save() {
    perform(() => {
      install({
        ...project,
        name: draft.name,
        policies: project.policies.map((p) =>
          p.id === policyId
            ? {
                ...p,
                name: draft.policyName,
                rules: p.rules.map((r) =>
                  r.id === ruleId && draft.rule
                    ? {
                        ...r,
                        ...draft.rule,
                        actions: draft.rule.actions
                          .split("\n")
                          .map((a) => a.trim())
                          .filter(Boolean),
                        conditions: authzJson(
                          draft.rule.conditions,
                        ) as AuthzCondition[],
                      }
                    : r,
                ),
              }
            : p,
        ),
        cases: project.cases.map((c) =>
          c.id === caseId && draft.item
            ? {
                ...c,
                name: draft.item.name,
                action: draft.item.action,
                subject: authzJson(draft.item.subject) as typeof c.subject,
                resource: authzJson(draft.item.resource) as typeof c.resource,
                context: authzJson(draft.item.context) as typeof c.context,
                expect: authzJson(draft.item.expect) as typeof c.expect,
              }
            : c,
        ),
      });
      notify("authz.saved");
    });
  }
  function addPolicy(clone: boolean) {
    if (locked || project.policies.length >= MAX_AUTHZ_POLICIES) return;
    perform(() => {
      const id = nextId(
          "policy",
          project.policies.map((p) => p.id),
        ),
        added = {
          id,
          name: id,
          rules: clone ? policy.rules : [newAuthzRule()],
        };
      install(
        {
          ...project,
          policies: [...project.policies, added],
          cases: clone
            ? project.cases.map((c) =>
                Object.hasOwn(c.expect, policyId)
                  ? {
                      ...c,
                      expect: Object.fromEntries([
                        ...Object.entries(c.expect),
                        [id, c.expect[policyId]],
                      ]),
                    }
                  : c,
              )
            : project.cases,
        },
        id,
        added.rules[0]?.id ?? "",
      );
      setFeedback(null);
    });
  }
  function deletePolicy() {
    if (locked || project.policies.length === 1) return;
    perform(() => {
      install({
        ...project,
        policies: project.policies.filter((p) => p.id !== policyId),
        cases: project.cases.map((c) => ({
          ...c,
          expect: Object.fromEntries(
            Object.entries(c.expect).filter(([id]) => id !== policyId),
          ),
        })),
      });
      setFeedback(null);
    });
  }
  function addRule(clone: boolean) {
    if (locked || policy.rules.length >= MAX_AUTHZ_RULES) return;
    perform(() => {
      const id = nextId(
          "rule",
          policy.rules.map((r) => r.id),
        ),
        old = policy.rules.find((r) => r.id === ruleId),
        added = clone && old ? { ...old, id, name: id } : newAuthzRule(id);
      install(
        {
          ...project,
          policies: project.policies.map((p) =>
            p.id === policyId ? { ...p, rules: [...p.rules, added] } : p,
          ),
        },
        policyId,
        id,
      );
      setFeedback(null);
    });
  }
  function deleteRule() {
    if (locked) return;
    perform(() => {
      install({
        ...project,
        policies: project.policies.map((p) =>
          p.id === policyId
            ? { ...p, rules: p.rules.filter((r) => r.id !== ruleId) }
            : p,
        ),
      });
      setFeedback(null);
    });
  }
  function addCase(clone: boolean) {
    if (locked || project.cases.length >= MAX_AUTHZ_CASES) return;
    perform(() => {
      const id = nextId(
          "case",
          project.cases.map((c) => c.id),
        ),
        old = project.cases.find((c) => c.id === caseId);
      install(
        {
          ...project,
          cases: [
            ...project.cases,
            clone && old ? { ...old, id, name: id } : newAuthzCase(id),
          ],
        },
        policyId,
        ruleId,
        id,
      );
      setFeedback(null);
    });
  }
  function deleteCase() {
    if (locked) return;
    perform(() => {
      install({
        ...project,
        cases: project.cases.filter((c) => c.id !== caseId),
      });
      setFeedback(null);
    });
  }
  function appendCondition(condition: AuthzCondition) {
    if (busy || !draft.rule) return;
    perform(() => {
      const parsed = authzJson(draft.rule!.conditions);
      if (!Array.isArray(parsed) || parsed.length >= 16)
        throw new AuthzError("limit");
      const conditions = [
        ...parsed.map(normalizeAuthzCondition),
        normalizeAuthzCondition(condition),
      ];
      setDraft((d) => ({
        ...d,
        rule: d.rule ? { ...d.rule, conditions: json(conditions) } : null,
      }));
      setFeedback(null);
    });
  }
  function buildCondition() {
    perform(() => {
      const operand = (
        source: AuthzOperand["source"],
        value: string,
      ): AuthzOperand =>
        source === "literal"
          ? { source, value: authzJsonValue(authzJson(value, 4096), 4096) }
          : { source, pointer: value };
      appendCondition({
        operator: builder.operator,
        left: operand(builder.leftSource, builder.leftValue),
        ...(builder.operator === "exists" || builder.operator === "absent"
          ? {}
          : { right: operand(builder.rightSource, builder.rightValue) }),
      });
    });
  }
  function generate() {
    if (locked) return;
    perform(() => {
      const cases = generateAuthzCases(
        authzJson(generator.subjects),
        authzJson(generator.resources),
        authzJson(generator.actions),
        authzJson(generator.context),
        project.cases.map((c) => c.id),
      );
      install(
        { ...project, cases: [...project.cases, ...cases] },
        policyId,
        ruleId,
        cases[0].id,
      );
      notify("authz.generated", { count: String(cases.length) });
    });
  }
  function download(
    source: string,
    file: string,
    contentType = "application/json",
  ) {
    if (!downloadTextFile(source, file, contentType))
      setFeedback({ key: "authz.error.download", error: true });
    else notify("authz.downloaded");
  }
  async function run(all: boolean) {
    if (locked) return;
    const token = ++generation.current;
    setBusy(true);
    setFeedback(null);
    setProgress({ done: 0, total: 0 });
    try {
      const runs = await runAuthzMatrix(
        project,
        all ? undefined : caseId,
        () => generation.current !== token,
        (done, total) => {
          if (generation.current === token) setProgress({ done, total });
        },
      );
      if (generation.current !== token) return;
      setResults(runs);
      setResultId(policyId);
      setInspectId(caseId);
      setSearch("");
      setFilter("");
      setChangedOnly(false);
      setPage(0);
      const checked = runs.reduce((n, r) => n + r.checked, 0),
        failed = runs.reduce((n, r) => n + r.failed, 0),
        total = runs.reduce((n, r) => n + r.total, 0);
      notify("authz.finished", {
        passed: String(checked - failed),
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
      if (file.size > MAX_AUTHZ_BYTES) throw new AuthzError("limit");
      const source = await file.text();
      if (generation.current !== token) return;
      install(parseAuthzProject(source));
      notify("authz.loaded");
    } catch (e) {
      if (generation.current === token) fail(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  const patchRule = (patch: Partial<NonNullable<typeof draft.rule>>) =>
    setDraft((d) => ({ ...d, rule: d.rule ? { ...d.rule, ...patch } : null }));
  const patchCase = (
    key: keyof NonNullable<typeof draft.item>,
    value: string,
  ) =>
    setDraft((d) => ({
      ...d,
      item: d.item ? { ...d.item, [key]: value } : null,
    }));
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
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("authz.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("authz.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("authz.guide")}
            </summary>
            {(["semantics", "privacy", "limits"] as const).map((key) => (
              <p key={key}>{t(`authz.${key}`)}</p>
            ))}
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
            <p className="text-xs text-amber-800">{t("authz.pending")}</p>
          )}
          {busy && (
            <div className="space-y-2">
              <p role="status">
                {t("authz.busy")}{" "}
                {progress.total > 0 &&
                  t("authz.progress", {
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
                  notify("authz.cancelled");
                }}
              >
                {t("authz.cancel")}
              </button>
            </div>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-2">
              {action(
                "authz.demo",
                () =>
                  perform(() => {
                    install(demoAuthzProject());
                    notify("authz.loaded");
                  }),
                locked,
              )}
              {action(
                "authz.new",
                () =>
                  perform(() => {
                    install(emptyAuthzProject());
                    notify("authz.loaded");
                  }),
                locked,
              )}
              {action(
                "authz.export",
                () =>
                  perform(() =>
                    download(
                      serializeAuthzProject(project),
                      "authorization-project.json",
                    ),
                  ),
                locked,
              )}
              <label className="block text-xs font-semibold">
                {t("authz.import")}
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
              label={t("authz.name")}
              value={draft.name}
              onChange={(name) => setDraft((d) => ({ ...d, name }))}
            />
            <div className="flex flex-wrap gap-2">
              {action("authz.save", save, !pending)}
              {action(
                "authz.discard",
                () => {
                  setDraft(drafts(project, policyId, ruleId, caseId));
                  setFeedback(null);
                },
                !pending,
              )}
            </div>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("authz.policySection")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("authz.policy")}
                  value={policyId}
                  disabled={locked}
                  onChange={(id) => {
                    const p = project.policies.find((v) => v.id === id)!;
                    choose(project, id, p.rules[0]?.id ?? "", caseId);
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
                  label={t("authz.policyName")}
                  value={draft.policyName}
                  onChange={(policyName) =>
                    setDraft((d) => ({ ...d, policyName }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {action(
                  "authz.addPolicy",
                  () => addPolicy(false),
                  locked || project.policies.length >= MAX_AUTHZ_POLICIES,
                )}
                {action(
                  "authz.clonePolicy",
                  () => addPolicy(true),
                  locked || project.policies.length >= MAX_AUTHZ_POLICIES,
                )}
                {action(
                  "authz.deletePolicy",
                  deletePolicy,
                  locked || project.policies.length === 1,
                )}
                {action(
                  "authz.setBaseline",
                  () =>
                    perform(() => {
                      install({
                        ...project,
                        policies: [
                          policy,
                          ...project.policies.filter((p) => p.id !== policyId),
                        ],
                      });
                      setFeedback(null);
                    }),
                  locked || project.policies[0].id === policyId,
                )}
              </div>
              <Select
                label={t("authz.rule")}
                value={ruleId}
                disabled={locked || !policy.rules.length}
                onChange={(id) => {
                  choose(project, policyId, id, caseId);
                  setFeedback(null);
                }}
              >
                {policy.rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.id})
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                {action(
                  "authz.addRule",
                  () => addRule(false),
                  locked || policy.rules.length >= MAX_AUTHZ_RULES,
                )}
                {action(
                  "authz.cloneRule",
                  () => addRule(true),
                  locked || !ruleId || policy.rules.length >= MAX_AUTHZ_RULES,
                )}
                {action("authz.deleteRule", deleteRule, locked || !ruleId)}
              </div>
              {draft.rule ? (
                <div className="space-y-3">
                  <Field
                    label={t("authz.ruleName")}
                    value={draft.rule.name}
                    onChange={(name) => patchRule({ name })}
                  />
                  <Check
                    label={t("authz.enabled")}
                    checked={draft.rule.enabled}
                    onChange={(enabled) => patchRule({ enabled })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label={t("authz.effect")}
                      value={draft.rule.effect}
                      onChange={(effect) =>
                        patchRule({ effect: effect as "allow" | "deny" })
                      }
                    >
                      <option value="allow">{t("authz.allow")}</option>
                      <option value="deny">{t("authz.deny")}</option>
                    </Select>
                    <Select
                      label={t("authz.mode")}
                      value={draft.rule.mode}
                      onChange={(mode) =>
                        patchRule({ mode: mode as "all" | "any" })
                      }
                    >
                      <option value="all">{t("authz.all")}</option>
                      <option value="any">{t("authz.any")}</option>
                    </Select>
                  </div>
                  <Field
                    label={t("authz.actions")}
                    value={draft.rule.actions}
                    onChange={(actions) => patchRule({ actions })}
                    multiline
                  />
                  <Field
                    label={t("authz.conditions")}
                    value={draft.rule.conditions}
                    onChange={(conditions) => patchRule({ conditions })}
                    multiline
                  />
                  <p className="text-xs text-slate-600">
                    {t("authz.conditionsHelp")}
                  </p>
                  <details className="space-y-3 rounded-lg bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-bold">
                      {t("authz.builder")}
                    </summary>
                    <Select
                      label={t("authz.operator")}
                      value={builder.operator}
                      onChange={(operator) =>
                        setBuilder((b) => ({
                          ...b,
                          operator: operator as AuthzCondition["operator"],
                        }))
                      }
                    >
                      {AUTHZ_OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {t(`authz.operator.${op}`)}
                        </option>
                      ))}
                    </Select>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        label={t("authz.leftSource")}
                        value={builder.leftSource}
                        onChange={(leftSource) =>
                          setBuilder((b) => ({
                            ...b,
                            leftSource: leftSource as AuthzOperand["source"],
                          }))
                        }
                      >
                        {[...AUTHZ_SOURCES, "literal" as const].map((s) => (
                          <option key={s} value={s}>
                            {t(`authz.source.${s}`)}
                          </option>
                        ))}
                      </Select>
                      <Field
                        label={t("authz.leftValue")}
                        value={builder.leftValue}
                        onChange={(leftValue) =>
                          setBuilder((b) => ({ ...b, leftValue }))
                        }
                      />
                    </div>
                    {builder.operator !== "exists" &&
                      builder.operator !== "absent" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Select
                            label={t("authz.rightSource")}
                            value={builder.rightSource}
                            onChange={(rightSource) =>
                              setBuilder((b) => ({
                                ...b,
                                rightSource:
                                  rightSource as AuthzOperand["source"],
                              }))
                            }
                          >
                            {[...AUTHZ_SOURCES, "literal" as const].map((s) => (
                              <option key={s} value={s}>
                                {t(`authz.source.${s}`)}
                              </option>
                            ))}
                          </Select>
                          <Field
                            label={t("authz.rightValue")}
                            value={builder.rightValue}
                            onChange={(rightValue) =>
                              setBuilder((b) => ({ ...b, rightValue }))
                            }
                          />
                        </div>
                      )}
                    <div className="flex flex-wrap gap-2">
                      {action("authz.appendCondition", buildCondition)}
                      {action("authz.appendTenant", () =>
                        appendCondition(tenantCondition()),
                      )}
                      {action("authz.appendRole", () =>
                        appendCondition(roleCondition()),
                      )}
                    </div>
                  </details>
                </div>
              ) : (
                <p className="text-xs text-slate-600">{t("authz.noRules")}</p>
              )}
              {action(
                "authz.exportGuard",
                () =>
                  perform(() =>
                    download(
                      generateAuthzGuard(policy),
                      "authorization-guard.mjs",
                      "text/javascript",
                    ),
                  ),
                locked,
              )}
              <p className="text-xs text-slate-600">{t("authz.guardHelp")}</p>
            </section>
            <section className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <h3 className="font-bold">{t("authz.caseSection")}</h3>
              <Select
                label={t("authz.case")}
                value={caseId}
                disabled={locked || !project.cases.length}
                onChange={(id) => {
                  choose(project, policyId, ruleId, id);
                  setFeedback(null);
                }}
              >
                {project.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                {action(
                  "authz.addCase",
                  () => addCase(false),
                  locked || project.cases.length >= MAX_AUTHZ_CASES,
                )}
                {action(
                  "authz.cloneCase",
                  () => addCase(true),
                  locked || !caseId || project.cases.length >= MAX_AUTHZ_CASES,
                )}
                {action("authz.deleteCase", deleteCase, locked || !caseId)}
              </div>
              {draft.item ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label={t("authz.caseName")}
                      value={draft.item.name}
                      onChange={(value) => patchCase("name", value)}
                    />
                    <Field
                      label={t("authz.action")}
                      value={draft.item.action}
                      onChange={(value) => patchCase("action", value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      ["subject", "resource", "context", "expect"] as const
                    ).map((key) => (
                      <Field
                        key={key}
                        label={t(`authz.${key}`)}
                        value={draft.item![key]}
                        onChange={(value) => patchCase(key, value)}
                        multiline
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600">{t("authz.noCases")}</p>
              )}
              <p className="text-xs text-slate-600">{t("authz.expectHelp")}</p>
            </section>
            <details className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-3">
              <summary className="cursor-pointer font-bold">
                {t("authz.generator")}
              </summary>
              <p className="text-xs text-slate-600">
                {t("authz.generatorHelp")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["subjects", "resources", "actions", "context"] as const).map(
                  (key) => (
                    <Field
                      key={key}
                      label={t(
                        key === "actions"
                          ? "authz.matrixActions"
                          : key === "context"
                            ? "authz.matrixContext"
                            : `authz.${key}`,
                      )}
                      value={generator[key]}
                      onChange={(value) =>
                        setGenerator((g) => ({ ...g, [key]: value }))
                      }
                      multiline
                    />
                  ),
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {action(
                  "authz.generate",
                  generate,
                  locked || project.cases.length >= MAX_AUTHZ_CASES,
                )}
                {getSchemaText &&
                  action(
                    "authz.schemaActions",
                    () =>
                      perform(() => {
                        const actions = authzActionsFromSchema(getSchemaText());
                        setGenerator((g) => ({ ...g, actions: json(actions) }));
                        setFeedback(null);
                      }),
                    busy,
                  )}
              </div>
              <p className="text-xs text-slate-600">{t("authz.schemaHelp")}</p>
            </details>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={locked || !caseId}
                onClick={() => {
                  void run(false);
                }}
              >
                {t("authz.runCase")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={locked || !project.cases.length}
                onClick={() => {
                  void run(true);
                }}
              >
                {t("authz.runAll")}
              </button>
            </div>
            {results && selected && (
              <section className="space-y-4">
                <h3 className="font-bold">{t("authz.results")}</h3>
                <div className="overflow-x-auto">
                  <table
                    aria-label={t("authz.results")}
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr>
                        {(
                          [
                            "policyColumn",
                            "allowed",
                            "denied",
                            "checked",
                            "failed",
                            "newGrants",
                            "newDenials",
                          ] as const
                        ).map((key) => (
                          <th key={key} className="p-2">
                            {t(`authz.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr
                          key={r.policyId}
                          className="border-t border-slate-200"
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-purple-800 underline"
                              onClick={() => {
                                setResultId(r.policyId);
                                setInspectId("");
                                setSearch("");
                                setFilter("");
                                setChangedOnly(false);
                                setPage(0);
                              }}
                            >
                              {r.policyName}
                            </button>
                          </td>
                          {[
                            r.allowed,
                            r.denied,
                            `${r.checked}/${r.total}`,
                            r.failed,
                            r.newGrants,
                            r.newDenials,
                          ].map((v, i) => (
                            <td key={i} className="p-2">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Select
                  label={t("authz.result")}
                  value={selected.policyId}
                  onChange={(id) => {
                    setResultId(id);
                    setInspectId("");
                    setSearch("");
                    setFilter("");
                    setChangedOnly(false);
                    setPage(0);
                  }}
                >
                  {results.map((r) => (
                    <option key={r.policyId} value={r.policyId}>
                      {r.policyName}
                    </option>
                  ))}
                </Select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t("authz.search")}
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(0);
                    }}
                  />
                  <Select
                    label={t("authz.filter")}
                    value={filter}
                    onChange={(v) => {
                      setFilter(v);
                      setPage(0);
                    }}
                  >
                    <option value="">{t("authz.everyDecision")}</option>
                    <option value="allow">{t("authz.allow")}</option>
                    <option value="deny">{t("authz.deny")}</option>
                  </Select>
                </div>
                <Check
                  label={t("authz.changedOnly")}
                  checked={changedOnly}
                  onChange={(v) => {
                    setChangedOnly(v);
                    setPage(0);
                  }}
                />
                <div className="overflow-x-auto">
                  <table
                    aria-label={t("authz.caseRows")}
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr>
                        <th className="p-2">{t("authz.case")}</th>
                        <th className="p-2">{t("authz.action")}</th>
                        <th className="p-2">{t("authz.decision")}</th>
                        <th className="p-2">{t("authz.expected")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr
                          key={r.caseId}
                          className="border-t border-slate-200"
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-purple-800 underline"
                              aria-label={t("authz.inspect", { name: r.name })}
                              onClick={() => setInspectId(r.caseId)}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="break-all p-2">{r.action}</td>
                          <td
                            className={`p-2 font-bold ${r.decision.effect === "allow" ? "text-emerald-800" : "text-red-700"}`}
                          >
                            {t(`authz.${r.decision.effect}`)}
                          </td>
                          <td
                            className={`p-2 ${!r.passed ? "font-bold text-red-700" : ""}`}
                          >
                            {r.expected
                              ? t(`authz.${r.expected}`)
                              : t("authz.unchecked")}
                            {!r.passed && ` · ${t("authz.failed")}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {action(
                    "authz.previous",
                    () => setPage(currentPage - 1),
                    currentPage === 0,
                  )}
                  <span className="text-xs">
                    {t("authz.page", {
                      page: String(currentPage + 1),
                      pages: String(pages),
                    })}
                  </span>
                  {action(
                    "authz.next",
                    () => setPage(currentPage + 1),
                    currentPage + 1 >= pages,
                  )}
                </div>
                {row && (
                  <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                    <h4 className="font-bold">{t("authz.trace")}</h4>
                    <p className="text-sm font-bold">
                      {t(`authz.reason.${row.decision.reason}`)}
                    </p>
                    <ol className="space-y-3 text-xs">
                      {row.decision.rules.map((rule) => (
                        <li key={rule.id}>
                          <p className="font-bold">
                            {rule.name} · {t(`authz.${rule.effect}`)} ·{" "}
                            {t(`authz.status.${rule.status}`)}
                          </p>
                          <ul className="ml-4 list-disc">
                            {rule.checks.map((check) => (
                              <li key={check.index}>
                                {check.index + 1}.{" "}
                                {t(`authz.operator.${check.operator}`)}:{" "}
                                {t(`authz.check.${check.reason}`)}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                    <Field
                      label={t("authz.inspection")}
                      value={json({
                        case: project.cases.find((c) => c.id === row.caseId),
                        decision: row.decision,
                      })}
                      multiline
                      readOnly
                    />
                  </div>
                )}
                <Check
                  label={t("authz.includeDetails")}
                  checked={includeDetails}
                  onChange={setIncludeDetails}
                />
                {action(
                  "authz.report",
                  () =>
                    perform(() =>
                      download(
                        authzReport(results, includeDetails),
                        "authorization-report.json",
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
