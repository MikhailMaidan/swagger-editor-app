"use client";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import { type NegotiationVariant } from "@/lib/negotiation-engine";
import {
  MAX_NEGOTIATION_BYTES,
  NegotiationError,
  emptyNegotiationProject,
  negotiationJson,
  newNegotiationCase,
  newNegotiationPolicy,
  newNegotiationVariant,
  normalizeNegotiationProject,
  parseNegotiationProject,
  serializeNegotiationProject,
  type NegotiationProject,
} from "@/lib/negotiation-project";
import {
  compareNegotiationRuns,
  demoNegotiationProject,
  generateNegotiationCases,
  importNegotiationHar,
  negotiationMediaCatalog,
  negotiationReport,
  runNegotiationMatrix,
  type NegotiationRun,
} from "@/lib/negotiation-studio";
import { generateNegotiationSelector } from "@/lib/negotiation-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs disabled:opacity-50";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:opacity-50";
const nextId = (prefix: string, ids: string[]) => {
  let n = 1;
  while (ids.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};
type Selection = { policyId: string; variantId: string; caseId: string };
function makeDraft(p: NegotiationProject, s: Selection) {
  const policy = p.policies.find((p) => p.id === s.policyId)!,
    variant = policy.variants.find((v) => v.id === s.variantId)!,
    c = p.cases.find((c) => c.id === s.caseId);
  return {
    name: p.name,
    policyName: policy.name,
    languageMode: policy.language,
    ranking: policy.ranking,
    variant: {
      ...variant,
      language: variant.language ?? "",
      weight: String(variant.weight),
    },
    case: c
      ? { name: c.name, request: { ...c.request }, expect: json(c.expect) }
      : null,
  };
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  list,
  onEscape,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  list?: string;
  onEscape?: () => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea
          className={`${inputClass} font-mono`}
          rows={5}
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onEscape?.();
          }}
        />
      ) : (
        <input
          className={inputClass}
          autoComplete="off"
          spellCheck={false}
          list={list}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
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
const keyOf = (r: NegotiationRun) => `${r.policyId}/${r.caseId}`;
export const NegotiationPanel = memo(function NegotiationPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyNegotiationProject),
    [selection, setSelection] = useState<Selection>({
      policyId: "policy-1",
      variantId: "variant-1",
      caseId: "case-1",
    }),
    [draft, setDraft] = useState(() =>
      makeDraft(emptyNegotiationProject(), {
        policyId: "policy-1",
        variantId: "variant-1",
        caseId: "case-1",
      }),
    );
  const [results, setResults] = useState<NegotiationRun[] | null>(null),
    [resultKey, setResultKey] = useState(""),
    [comparison, setComparison] = useState<ReturnType<
      typeof compareNegotiationRuns
    > | null>(null),
    [baselineId, setBaselineId] = useState("policy-1"),
    [candidateId, setCandidateId] = useState("policy-1"),
    [search, setSearch] = useState(""),
    [includeDetails, setIncludeDetails] = useState(false),
    [catalog, setCatalog] = useState<string[]>([]),
    [dimensions, setDimensions] = useState(() =>
      json({
        accept: [null, "application/json", "text/html", "*/*;q=0"],
        language: [null, "en", "ru"],
        encoding: [null, "", "gzip,identity;q=0"],
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
  const policy = project.policies.find((p) => p.id === selection.policyId)!,
    selectedCase = project.cases.find((c) => c.id === selection.caseId),
    pending = json(draft) !== json(makeDraft(project, selection)),
    inspected = results?.find((r) => keyOf(r) === resultKey),
    visible = results?.filter((r) =>
      `${r.caseName} ${r.policyName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  function error(e: unknown) {
    setFeedback({
      key:
        e instanceof NegotiationError
          ? e.code === "cancelled"
            ? "neg.cancelled"
            : `neg.error.${e.code}`
          : "neg.error.unknown",
      error: true,
    });
  }
  function ready() {
    if (busy) return false;
    if (pending) {
      setFeedback({ key: "neg.pending", error: true });
      return false;
    }
    return true;
  }
  function attempt(action: () => void) {
    try {
      action();
    } catch (e) {
      error(e);
    }
  }
  function install(
    value: NegotiationProject,
    prefer: Partial<Selection> = {},
    fresh = false,
  ) {
    const p = normalizeNegotiationProject(value),
      current: Partial<Selection> = fresh ? {} : selection,
      chosenPolicy =
        p.policies.find(
          (p) => p.id === (prefer.policyId ?? current.policyId),
        ) ?? p.policies[0],
      s = {
        policyId: chosenPolicy.id,
        variantId:
          chosenPolicy.variants.find(
            (v) => v.id === (prefer.variantId ?? current.variantId),
          )?.id ?? chosenPolicy.variants[0].id,
        caseId:
          p.cases.find((c) => c.id === (prefer.caseId ?? current.caseId))?.id ??
          p.cases[0]?.id ??
          "",
      };
    setProject(p);
    setSelection(s);
    setDraft(makeDraft(p, s));
    setResults(null);
    setResultKey("");
    setComparison(null);
    if (fresh || !p.policies.some((p) => p.id === baselineId))
      setBaselineId(p.policies[0].id);
    if (fresh || !p.policies.some((p) => p.id === candidateId))
      setCandidateId(p.policies[1]?.id ?? p.policies[0].id);
    if (fresh) {
      setCatalog([]);
      setSearch("");
    }
    setFeedback(null);
  }
  function select(prefer: Partial<Selection>) {
    if (!ready()) return;
    const s = { ...selection, ...prefer };
    if (prefer.policyId)
      s.variantId = project.policies.find(
        (p) => p.id === prefer.policyId,
      )!.variants[0].id;
    setSelection(s);
    setDraft(makeDraft(project, s));
    setFeedback(null);
  }
  function save() {
    attempt(() => {
      const weight = /^\d+$/.test(draft.variant.weight.trim())
        ? Number(draft.variant.weight)
        : NaN;
      install({
        ...project,
        name: draft.name,
        policies: project.policies.map((p) =>
          p.id !== policy.id
            ? p
            : {
                ...p,
                name: draft.policyName,
                language: draft.languageMode,
                ranking: draft.ranking,
                variants: p.variants.map((v) =>
                  v.id === selection.variantId
                    ? {
                        ...draft.variant,
                        weight,
                        language: draft.variant.language || null,
                      }
                    : v,
                ),
              },
        ),
        cases: project.cases.map((c) =>
          c.id === selection.caseId && draft.case
            ? {
                ...c,
                name: draft.case.name,
                request: draft.case.request,
                expect: negotiationJson(draft.case.expect) as typeof c.expect,
              }
            : c,
        ),
      });
      setFeedback({ key: "neg.saved" });
    });
  }
  function editPolicy(mode: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (mode === "delete") {
        if (project.policies.length === 1) return;
        install({
          ...project,
          policies: project.policies.filter((p) => p.id !== policy.id),
          cases: project.cases.map((c) => ({
            ...c,
            expect: Object.fromEntries(
              Object.entries(c.expect).filter(([id]) => id !== policy.id),
            ),
          })),
        });
      } else {
        const id = nextId(
            "policy",
            project.policies.map((p) => p.id),
          ),
          added =
            mode === "add"
              ? newNegotiationPolicy(id)
              : { ...policy, id, name: id };
        install(
          {
            ...project,
            policies: [...project.policies, added],
            cases: project.cases.map((c) =>
              mode === "clone" && Object.hasOwn(c.expect, policy.id)
                ? { ...c, expect: { ...c.expect, [id]: c.expect[policy.id] } }
                : c,
            ),
          },
          { policyId: id },
        );
      }
    });
  }
  function editVariant(mode: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      const id = nextId(
          "variant",
          policy.variants.map((v) => v.id),
        ),
        added =
          mode === "add"
            ? newNegotiationVariant(id)
            : {
                ...policy.variants.find((v) => v.id === selection.variantId)!,
                id,
                name: id,
              };
      added.enabled = false;
      if (mode === "delete" && policy.variants.length === 1) return;
      install(
        {
          ...project,
          policies: project.policies.map((p) =>
            p.id !== policy.id
              ? p
              : {
                  ...p,
                  variants:
                    mode === "delete"
                      ? p.variants.filter((v) => v.id !== selection.variantId)
                      : [...p.variants, added],
                },
          ),
          cases: project.cases.map((c) =>
            mode === "delete" &&
            c.expect[policy.id]?.variantId === selection.variantId
              ? {
                  ...c,
                  expect: Object.fromEntries(
                    Object.entries(c.expect).filter(([id]) => id !== policy.id),
                  ),
                }
              : c,
          ),
        },
        mode === "delete" ? {} : { variantId: id },
      );
    });
  }
  function editCase(mode: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (mode === "delete")
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
            mode === "add"
              ? newNegotiationCase(id)
              : { ...selectedCase!, id, name: id };
        install(
          { ...project, cases: [...project.cases, added] },
          { caseId: id },
        );
      }
    });
  }
  function moveVariant(direction: number) {
    if (!ready()) return;
    attempt(() => {
      const index = policy.variants.findIndex(
          (v) => v.id === selection.variantId,
        ),
        target = index + direction;
      if (target < 0 || target >= policy.variants.length) return;
      const variants = [...policy.variants];
      [variants[index], variants[target]] = [variants[target], variants[index]];
      install({
        ...project,
        policies: project.policies.map((p) =>
          p.id === policy.id ? { ...p, variants } : p,
        ),
      });
    });
  }
  async function run(mode: "all" | "case" | "compare") {
    if (!ready()) return;
    const token = ++generation.current;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      const rows = await runNegotiationMatrix(
        project,
        mode === "case" ? selection.caseId : undefined,
        () => generation.current !== token,
        (done, total) => {
          if (generation.current === token) setProgress({ done, total });
        },
      );
      if (generation.current !== token) return;
      setResults(rows);
      setResultKey(rows[0] ? keyOf(rows[0]) : "");
      setComparison(
        mode === "compare"
          ? compareNegotiationRuns(rows, baselineId, candidateId)
          : null,
      );
      setFeedback({
        key: "neg.completed",
        values: {
          passed: String(rows.filter((r) => r.passed).length),
          checked: String(rows.filter((r) => r.checked).length),
          total: String(rows.length),
        },
      });
    } catch (e) {
      if (generation.current === token) error(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  async function importFile(file: File | undefined, har: boolean) {
    if (!file || !ready()) return;
    const token = ++generation.current;
    setBusy(true);
    setFeedback(null);
    try {
      if (file.size > (har ? 5 * 1024 * 1024 : MAX_NEGOTIATION_BYTES))
        throw new NegotiationError("limit");
      const source = await file.text();
      if (generation.current !== token) return;
      if (har) {
        const imported = importNegotiationHar(
          source,
          project.cases.map((c) => c.id),
        );
        install(
          { ...project, cases: [...project.cases, ...imported.cases] },
          { caseId: imported.cases[0].id },
        );
        setFeedback({
          key: "neg.harDone",
          values: {
            count: String(imported.cases.length),
            skipped: String(imported.skipped),
          },
        });
      } else {
        install(parseNegotiationProject(source), {}, true);
        setFeedback({ key: "neg.loaded" });
      }
    } catch (e) {
      if (generation.current === token) error(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  function download(kind: "project" | "report" | "selector") {
    if (!ready()) return;
    attempt(() => {
      const content =
        kind === "project"
          ? serializeNegotiationProject(project)
          : kind === "selector"
            ? generateNegotiationSelector(policy)
            : json(
                negotiationReport(
                  results ?? [],
                  includeDetails,
                  comparison ?? undefined,
                ),
              );
      if (getByteSize(content) > 16 * 1024 * 1024)
        throw new NegotiationError("limit");
      const downloaded = downloadTextFile(
        content,
        `negotiation-${kind}.${kind === "selector" ? "mjs" : "json"}`,
        kind === "selector" ? "text/javascript" : "application/json",
      );
      setFeedback({
        key: downloaded ? "neg.downloaded" : "neg.error.download",
        error: !downloaded,
      });
    });
  }
  const actions = (
    items: { key: TranslationKey; action: () => void; disabled?: boolean }[],
  ) => (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          type="button"
          className={buttonClass}
          key={item.key}
          disabled={item.disabled || busy}
          onClick={item.action}
        >
          {t(item.key)}
        </button>
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
        {t("neg.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("neg.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("neg.guide")}
            </summary>
            {(
              [
                "neg.semantics",
                "neg.codingHelp",
                "neg.rankingHelp",
                "neg.limits",
                "neg.privacy",
              ] as const
            ).map((key) => (
              <p key={key}>{t(key)}</p>
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
                {t("neg.busy", {
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
                  setFeedback({ key: "neg.cancelled" });
                }}
              >
                {t("neg.cancel")}
              </button>
            </div>
          )}
          {pending && (
            <p className="text-xs font-semibold text-amber-800">
              {t("neg.pending")}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            {actions([
              {
                key: "neg.new",
                action: () => {
                  if (ready())
                    attempt(() => {
                      install(emptyNegotiationProject(), {}, true);
                      setFeedback({ key: "neg.loaded" });
                    });
                },
              },
              {
                key: "neg.demo",
                action: () => {
                  if (ready())
                    attempt(() => {
                      install(demoNegotiationProject(), {}, true);
                      setFeedback({ key: "neg.loaded" });
                    });
                },
              },
              { key: "neg.export", action: () => download("project") },
            ])}
            <label className="block text-xs font-semibold">
              {t("neg.import")}
              <input
                aria-label={t("neg.import")}
                type="file"
                accept=".json,application/json"
                className={inputClass}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void importFile(file, false);
                }}
              />
            </label>
            <Field
              label={t("neg.name")}
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            {actions([
              { key: "neg.save", action: save, disabled: !pending },
              {
                key: "neg.discard",
                action: () => {
                  setDraft(makeDraft(project, selection));
                  setFeedback(null);
                },
                disabled: !pending,
              },
            ])}
            <div className="grid gap-5 xl:grid-cols-2">
              <section
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
                aria-label={t("neg.policies")}
              >
                <h3 className="font-bold">{t("neg.policies")}</h3>
                <Select
                  label={t("neg.policy")}
                  value={selection.policyId}
                  onChange={(policyId) => select({ policyId })}
                >
                  {project.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </Select>
                {actions([
                  {
                    key: "neg.addPolicy",
                    action: () => editPolicy("add"),
                    disabled: project.policies.length >= 5,
                  },
                  {
                    key: "neg.clonePolicy",
                    action: () => editPolicy("clone"),
                    disabled: project.policies.length >= 5,
                  },
                  {
                    key: "neg.deletePolicy",
                    action: () => editPolicy("delete"),
                    disabled: project.policies.length <= 1,
                  },
                ])}
                <Field
                  label={t("neg.policyName")}
                  value={draft.policyName}
                  onChange={(policyName) => setDraft({ ...draft, policyName })}
                />
                <Select
                  label={t("neg.languageMode")}
                  value={draft.languageMode}
                  onChange={(languageMode) =>
                    setDraft({
                      ...draft,
                      languageMode: languageMode as "filter" | "ignore",
                    })
                  }
                >
                  <option value="filter">{t("neg.filter")}</option>
                  <option value="ignore">{t("neg.ignore")}</option>
                </Select>
                <Select
                  label={t("neg.ranking")}
                  value={draft.ranking}
                  onChange={(ranking) =>
                    setDraft({
                      ...draft,
                      ranking: ranking as "product" | "media-first",
                    })
                  }
                >
                  <option value="product">{t("neg.product")}</option>
                  <option value="media-first">{t("neg.mediaFirst")}</option>
                </Select>
                <Select
                  label={t("neg.variant")}
                  value={selection.variantId}
                  onChange={(variantId) => select({ variantId })}
                >
                  {policy.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.id})
                    </option>
                  ))}
                </Select>
                {actions([
                  {
                    key: "neg.addVariant",
                    action: () => editVariant("add"),
                    disabled: policy.variants.length >= 64,
                  },
                  {
                    key: "neg.cloneVariant",
                    action: () => editVariant("clone"),
                    disabled: policy.variants.length >= 64,
                  },
                  {
                    key: "neg.deleteVariant",
                    action: () => editVariant("delete"),
                    disabled: policy.variants.length <= 1,
                  },
                  {
                    key: "neg.moveUp",
                    action: () => moveVariant(-1),
                    disabled: policy.variants[0].id === selection.variantId,
                  },
                  {
                    key: "neg.moveDown",
                    action: () => moveVariant(1),
                    disabled:
                      policy.variants.at(-1)!.id === selection.variantId,
                  },
                ])}
                <p className="text-xs text-slate-600">{t("neg.variantHelp")}</p>
                <Field
                  label={t("neg.variantName")}
                  value={draft.variant.name}
                  onChange={(name) =>
                    setDraft({ ...draft, variant: { ...draft.variant, name } })
                  }
                />
                <Check
                  label={t("neg.enabled")}
                  checked={draft.variant.enabled}
                  onChange={(enabled) =>
                    setDraft({
                      ...draft,
                      variant: { ...draft.variant, enabled },
                    })
                  }
                />
                <Field
                  label={t("neg.media")}
                  value={draft.variant.mediaType}
                  list="negotiation-media-catalog"
                  onChange={(mediaType) =>
                    setDraft({
                      ...draft,
                      variant: { ...draft.variant, mediaType },
                    })
                  }
                />
                <datalist id="negotiation-media-catalog">
                  {catalog.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                {getSchemaText &&
                  actions([
                    {
                      key: "neg.catalog",
                      action: () => {
                        attempt(() => {
                          const types =
                            negotiationMediaCatalog(getSchemaText());
                          setCatalog(types);
                          setFeedback({
                            key: "neg.catalogDone",
                            values: { count: String(types.length) },
                          });
                        });
                      },
                    },
                  ])}
                <Field
                  label={t("neg.language")}
                  value={draft.variant.language}
                  onChange={(language) =>
                    setDraft({
                      ...draft,
                      variant: { ...draft.variant, language },
                    })
                  }
                />
                <Select
                  label={t("neg.encoding")}
                  value={draft.variant.encoding}
                  onChange={(encoding) =>
                    setDraft({
                      ...draft,
                      variant: {
                        ...draft.variant,
                        encoding: encoding as NegotiationVariant["encoding"],
                      },
                    })
                  }
                >
                  {["identity", "gzip", "br", "deflate", "zstd"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Field
                  label={t("neg.weight")}
                  value={draft.variant.weight}
                  onChange={(weight) =>
                    setDraft({
                      ...draft,
                      variant: { ...draft.variant, weight },
                    })
                  }
                />
                {actions([
                  { key: "neg.selector", action: () => download("selector") },
                ])}
                <p className="text-xs text-slate-600">
                  {t("neg.selectorHelp")}
                </p>
              </section>
              <section
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
                aria-label={t("neg.cases")}
              >
                <h3 className="font-bold">{t("neg.cases")}</h3>
                {selectedCase && (
                  <Select
                    label={t("neg.case")}
                    value={selection.caseId}
                    onChange={(caseId) => select({ caseId })}
                  >
                    {project.cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                  </Select>
                )}
                {actions([
                  {
                    key: "neg.addCase",
                    action: () => editCase("add"),
                    disabled: project.cases.length >= 200,
                  },
                  {
                    key: "neg.cloneCase",
                    action: () => editCase("clone"),
                    disabled: !selectedCase || project.cases.length >= 200,
                  },
                  {
                    key: "neg.deleteCase",
                    action: () => editCase("delete"),
                    disabled: !selectedCase,
                  },
                ])}
                {draft.case ? (
                  <>
                    <Field
                      label={t("neg.caseName")}
                      value={draft.case.name}
                      onChange={(name) =>
                        setDraft({ ...draft, case: { ...draft.case!, name } })
                      }
                    />
                    {(
                      [
                        {
                          field: "accept",
                          label: "neg.accept",
                          missing: "neg.acceptMissing",
                        },
                        {
                          field: "language",
                          label: "neg.acceptLanguage",
                          missing: "neg.languageMissing",
                        },
                        {
                          field: "encoding",
                          label: "neg.acceptEncoding",
                          missing: "neg.encodingMissing",
                        },
                      ] as const
                    ).map(({ field, label, missing }) => (
                      <div key={field} className="space-y-1">
                        <Check
                          label={t(missing)}
                          checked={draft.case!.request[field] === null}
                          onChange={(absent) =>
                            setDraft({
                              ...draft,
                              case: {
                                ...draft.case!,
                                request: {
                                  ...draft.case!.request,
                                  [field]: absent ? null : "",
                                },
                              },
                            })
                          }
                        />
                        <Field
                          label={t(label)}
                          value={draft.case!.request[field] ?? ""}
                          disabled={draft.case!.request[field] === null}
                          onChange={(value) =>
                            setDraft({
                              ...draft,
                              case: {
                                ...draft.case!,
                                request: {
                                  ...draft.case!.request,
                                  [field]: value,
                                },
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                    <Field
                      label={t("neg.expect")}
                      value={draft.case.expect}
                      multiline
                      onChange={(expect) =>
                        setDraft({ ...draft, case: { ...draft.case!, expect } })
                      }
                    />
                    <p className="text-xs text-slate-600">
                      {t("neg.expectHelp")}
                    </p>
                  </>
                ) : (
                  <p>{t("neg.noCases")}</p>
                )}
                <details className="space-y-2">
                  <summary className="cursor-pointer text-sm font-bold">
                    {t("neg.generateTitle")}
                  </summary>
                  <Field
                    label={t("neg.dimensions")}
                    value={dimensions}
                    onChange={setDimensions}
                    multiline
                  />
                  <p className="text-xs text-slate-600">
                    {t("neg.generateHelp")}
                  </p>
                  {actions([
                    {
                      key: "neg.generate",
                      action: () => {
                        if (ready())
                          attempt(() => {
                            const cases = generateNegotiationCases(
                              negotiationJson(dimensions),
                              project.cases.map((c) => c.id),
                            );
                            install(
                              {
                                ...project,
                                cases: [...project.cases, ...cases],
                              },
                              { caseId: cases[0].id },
                            );
                            setFeedback({
                              key: "neg.generated",
                              values: { count: String(cases.length) },
                            });
                          });
                      },
                    },
                  ])}
                </details>
                <label className="block text-xs font-semibold">
                  {t("neg.har")}
                  <input
                    aria-label={t("neg.har")}
                    type="file"
                    accept=".har,.json,application/json"
                    className={inputClass}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void importFile(file, true);
                    }}
                  />
                </label>
                <p className="text-xs text-slate-600">{t("neg.harHelp")}</p>
              </section>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!selectedCase}
                onClick={() => void run("case")}
              >
                {t("neg.runCase")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!project.cases.length}
                onClick={() => void run("all")}
              >
                {t("neg.runAll")}
              </button>
            </div>
            <section className="space-y-3" aria-label={t("neg.compareTitle")}>
              <h3 className="font-bold">{t("neg.compareTitle")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("neg.baseline")}
                  value={baselineId}
                  onChange={setBaselineId}
                >
                  {project.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </Select>
                <Select
                  label={t("neg.candidate")}
                  value={candidateId}
                  onChange={setCandidateId}
                >
                  {project.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                className={buttonClass}
                disabled={!project.cases.length}
                onClick={() => void run("compare")}
              >
                {t("neg.compare")}
              </button>
              {comparison && (
                <>
                  <p className="text-sm" role="status">
                    {t("neg.compared", {
                      changed: String(comparison.changed),
                      total: String(comparison.total),
                    })}
                  </p>
                  <div className="overflow-x-auto">
                    <table
                      className="w-full text-left text-xs"
                      aria-label={t("neg.comparison")}
                    >
                      <thead>
                        <tr>
                          {[
                            "neg.case",
                            "neg.baselineDecision",
                            "neg.candidateDecision",
                          ].map((k) => (
                            <th className="p-2" key={k}>
                              {t(k as TranslationKey)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.rows
                          .filter((r) => r.changed)
                          .map((r) => (
                            <tr key={r.caseId}>
                              <td className="p-2">
                                {r.caseName}
                                {r.representationChanged && (
                                  <span className="block text-slate-600">
                                    {t("neg.metadataChanged")}
                                  </span>
                                )}
                                {r.varyChanged && (
                                  <span className="block text-slate-600">
                                    {t("neg.varyChanged")}
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                {r.baseline.status} /{" "}
                                {r.baseline.variantId ?? "—"}
                              </td>
                              <td className="p-2">
                                {r.candidate.status} /{" "}
                                {r.candidate.variantId ?? "—"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
            {results && (
              <section className="space-y-3">
                <h3 className="font-bold">{t("neg.results")}</h3>
                <Field
                  label={t("neg.search")}
                  value={search}
                  onChange={setSearch}
                  onEscape={() => setSearch("")}
                />
                <div
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearch("");
                  }}
                  className="max-h-96 overflow-auto"
                >
                  <table
                    className="w-full text-left text-xs"
                    aria-label={t("neg.results")}
                  >
                    <thead>
                      <tr>
                        {[
                          "neg.policyCase",
                          "neg.status",
                          "neg.selected",
                          "neg.verdict",
                        ].map((k) => (
                          <th className="p-2" key={k}>
                            {t(k as TranslationKey)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible?.map((r) => (
                        <tr
                          className={
                            keyOf(r) === resultKey ? "bg-violet-50" : ""
                          }
                          key={keyOf(r)}
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-left underline"
                              onClick={() => setResultKey(keyOf(r))}
                            >
                              {r.policyName} / {r.caseName}
                            </button>
                          </td>
                          <td className="p-2">{r.decision.status}</td>
                          <td className="p-2">{r.decision.variantId ?? "—"}</td>
                          <td className="p-2">
                            {t(
                              !r.checked
                                ? "neg.unchecked"
                                : r.passed
                                  ? "neg.passed"
                                  : "neg.failed",
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
                      label={t("neg.result")}
                      value={resultKey}
                      onChange={setResultKey}
                    >
                      {results.map((r) => (
                        <option key={keyOf(r)} value={keyOf(r)}>
                          {r.policyName} / {r.caseName}
                        </option>
                      ))}
                    </Select>
                    {actions([
                      {
                        key: "neg.record",
                        action: () => {
                          if (ready())
                            attempt(() => {
                              install({
                                ...project,
                                cases: project.cases.map((c) =>
                                  c.id !== inspected.caseId
                                    ? c
                                    : {
                                        ...c,
                                        expect: {
                                          ...c.expect,
                                          [inspected.policyId]: {
                                            status: inspected.decision.status,
                                            variantId:
                                              inspected.decision.variantId,
                                          },
                                        },
                                      },
                                ),
                              });
                              setFeedback({ key: "neg.recorded" });
                            });
                        },
                      },
                    ])}
                    <div className="overflow-auto">
                      <table
                        className="w-full text-left text-xs"
                        aria-label={t("neg.candidates")}
                      >
                        <thead>
                          <tr>
                            {[
                              "neg.selected",
                              "neg.mediaQ",
                              "neg.languageQ",
                              "neg.encodingQ",
                              "neg.score",
                              "neg.reason",
                            ].map((k) => (
                              <th key={k} className="p-2">
                                {t(k as TranslationKey)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inspected.decision.candidates.map((c) => (
                            <tr
                              key={c.variantId}
                              className={
                                c.variantId === inspected.decision.variantId
                                  ? "bg-emerald-50 font-bold"
                                  : ""
                              }
                            >
                              <td className="p-2">{c.variantId}</td>
                              {[c.media, c.language, c.encoding].map((q, i) => (
                                <td
                                  key={i}
                                  className="p-2"
                                  title={q.range ?? ""}
                                >
                                  {q.q / 1000}
                                  <div aria-hidden className="h-1 bg-slate-100">
                                    <div
                                      className="h-1 bg-violet-500"
                                      style={{ width: `${q.q / 10}%` }}
                                    />
                                  </div>
                                </td>
                              ))}
                              <td className="p-2 font-mono">{c.score}</td>
                              <td className="p-2">
                                {t(
                                  c.excluded === "disabled"
                                    ? "neg.disabled"
                                    : c.excluded === "media"
                                      ? "neg.excludedMedia"
                                      : c.excluded === "language"
                                        ? "neg.excludedLanguage"
                                        : c.excluded === "encoding"
                                          ? "neg.excludedEncoding"
                                          : "neg.eligible",
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm font-bold">
                        {t("neg.explain")}
                      </summary>
                      <pre
                        className="max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-xs"
                        aria-label={t("neg.explain")}
                      >
                        {json(inspected.decision)}
                      </pre>
                    </details>
                  </>
                )}
                <Check
                  label={t("neg.details")}
                  checked={includeDetails}
                  onChange={setIncludeDetails}
                />
                {actions([
                  { key: "neg.report", action: () => download("report") },
                ])}
              </section>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
