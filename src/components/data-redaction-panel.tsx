"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  addRedactionSources,
  emptyRedactionProject,
  MAX_REDACTION_BYTES,
  MAX_REDACTION_SOURCE_BYTES,
  MAX_REDACTION_RULES,
  MAX_REDACTION_SOURCES,
  parseRedactionProject,
  parseRedactionRules,
  parseRedactionValue,
  readRedactionSource,
  redactData,
  RedactionError,
  serializeRedactedBundle,
  serializeRedactionProject,
  serializeRedactionReport,
  serializeRedactionRules,
  type RedactionAction,
  type RedactionKind,
  type RedactionOptions,
  type RedactionProject,
  type RedactionResult,
  type RedactionRule,
} from "@/lib/data-redaction";
import { downloadTextFile } from "@/lib/schema-download";
import { truncateJsonPreview } from "@/lib/response-data-explorer";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const draftValue = (
  values: Record<string, string>,
  key: string,
  fallback: string,
) => (Object.hasOwn(values, key) ? values[key] : fallback);

export const DataRedactionPanel = memo(function DataRedactionPanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(emptyRedactionProject);
  const [selected, setSelected] = useState("");
  const [selectedRule, setSelectedRule] = useState("");
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, string>>({});
  const [replacementDrafts, setReplacementDrafts] = useState<
    Record<string, string>
  >({});
  const [paste, setPaste] = useState("");
  const [pasteKind, setPasteKind] = useState<RedactionKind | "auto">("auto");
  const [result, setResult] = useState<{
    preview: RedactionResult;
    editorSource: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const [undo, setUndo] = useState<{ before: string; applied: string } | null>(
    null,
  );
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const source = project.sources.find((s) => s.key === selected);
  const rule = project.rules.find((r) => r.key === selectedRule);
  const dirty =
    project.sources.some(
      (s) => draftValue(sourceDrafts, s.key, s.text) !== s.text,
    ) ||
    project.rules.some(
      (r) =>
        r.action === "replace" &&
        draftValue(replacementDrafts, r.key, JSON.stringify(r.replacement)) !==
          JSON.stringify(r.replacement),
    );
  const output =
    result?.preview.files.find((f) => f.key === selected) ??
    result?.preview.files[0];
  const findings = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (
      result?.preview.findings.filter((f) =>
        terms.every((term) =>
          `${project.sources.find((s) => s.key === f.source)?.name ?? ""} ${f.pointer} ${f.payloadPointer ?? ""} ${f.category} ${f.action}`
            .toLowerCase()
            .includes(term),
        ),
      ) ?? []
    );
  }, [result, project.sources, search]);
  const lastPage = Math.max(0, Math.ceil(findings.length / 25) - 1),
    currentPage = Math.min(page, lastPage);
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof RedactionError
          ? `redaction.error.${error.code}`
          : "redaction.error.read",
      error: true,
    });
  }
  function invalidate() {
    setResult(null);
    setFeedback(null);
    setPage(0);
  }
  function update(next: RedactionProject) {
    setProject(next);
    invalidate();
  }
  function options(patch: Partial<RedactionOptions>) {
    update({ ...project, options: { ...project.options, ...patch } });
  }
  function editRule(patch: Partial<RedactionRule>) {
    update({
      ...project,
      rules: project.rules.map((r) =>
        r.key === selectedRule ? { ...r, ...patch } : r,
      ),
    });
  }
  function add(inputs: { name: string; text: string; kind?: RedactionKind }[]) {
    try {
      const next = addRedactionSources(project, inputs);
      update(next);
      setSelected(next.sources.at(-1)?.key ?? "");
      setPaste("");
      setFeedback({ key: "redaction.imported", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function saveSource() {
    if (!source) return;
    setFeedback(null);
    try {
      const text = draftValue(sourceDrafts, source.key, source.text);
      readRedactionSource(text, source.kind);
      const next = {
        ...project,
        sources: project.sources.map((s) =>
          s.key === selected ? { ...s, text } : s,
        ),
      };
      serializeRedactionProject(next);
      update(next);
      setSourceDrafts(
        Object.fromEntries(
          Object.entries(sourceDrafts).filter(([key]) => key !== selected),
        ),
      );
      setFeedback({ key: "redaction.sourceSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function saveReplacement() {
    if (!rule || rule.action !== "replace") return;
    setFeedback(null);
    try {
      const replacement = parseRedactionValue(
        draftValue(
          replacementDrafts,
          rule.key,
          JSON.stringify(rule.replacement),
        ),
      );
      const next = {
        ...project,
        rules: project.rules.map((r) =>
          r.key === selectedRule ? { ...r, replacement } : r,
        ),
      };
      serializeRedactionProject(next);
      update(next);
      setReplacementDrafts(
        Object.fromEntries(
          Object.entries(replacementDrafts).filter(
            ([key]) => key !== selectedRule,
          ),
        ),
      );
      setFeedback({ key: "redaction.replacementSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function addRule() {
    let n = 1;
    while (project.rules.some((r) => r.key === `rule-${n}`)) n++;
    const key = `rule-${n}`;
    update({
      ...project,
      rules: [
        ...project.rules,
        {
          key,
          name: `${t("redaction.ruleDefault")} ${n}`,
          enabled: true,
          selector: "/**/privateNote",
          action: "mask",
        },
      ],
    });
    setSelectedRule(key);
  }
  function moveRule(direction: number) {
    const index = project.rules.findIndex((r) => r.key === selectedRule);
    const rules = [...project.rules];
    [rules[index], rules[index + direction]] = [
      rules[index + direction],
      rules[index],
    ];
    update({ ...project, rules });
  }
  function generate() {
    if (dirty || loading) return;
    setFeedback(null);
    try {
      setResult({
        preview: redactData(project),
        editorSource: getSchemaText(),
      });
      setPage(0);
      setFeedback({ key: "redaction.generated", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(files: File[], kind: "sources" | "project" | "rules") {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (
        kind === "sources" &&
        project.sources.length + files.length > MAX_REDACTION_SOURCES
      )
        throw new RedactionError("limit");
      if (
        files.some(
          (f) =>
            f.size >
            (kind === "sources"
              ? MAX_REDACTION_SOURCE_BYTES
              : MAX_REDACTION_BYTES),
        )
      )
        throw new RedactionError("limit");
      const inputs = await Promise.all(
        files.map(async (f) => ({ name: f.name, text: await f.text() })),
      );
      if (generation.current !== token) return;
      if (kind === "sources") add(inputs);
      else if (kind === "rules") {
        const profile = parseRedactionRules(inputs[0].text);
        update({ ...project, ...profile });
        setReplacementDrafts({});
        setSelectedRule(profile.rules[0]?.key ?? "");
        setFeedback({ key: "redaction.rulesImported", error: false });
      } else {
        const next = parseRedactionProject(inputs[0].text);
        update(next);
        setSourceDrafts({});
        setReplacementDrafts({});
        setSelected(next.sources[0]?.key ?? "");
        setSelectedRule(next.rules[0]?.key ?? "");
        setPaste("");
        setSearch("");
        setFeedback({ key: "redaction.projectImported", error: false });
      }
    } catch (error) {
      if (generation.current === token) fail(error);
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }
  function download(kind: "project" | "rules" | "report" | "file" | "bundle") {
    if (loading || dirty) return;
    setFeedback(null);
    try {
      const text =
        kind === "project"
          ? serializeRedactionProject(project)
          : kind === "rules"
            ? serializeRedactionRules(project)
            : kind === "report" && result
              ? serializeRedactionReport(project, result.preview)
              : kind === "bundle" && result
                ? serializeRedactedBundle(result.preview)
                : kind === "file" && output?.canExport
                  ? output.text
                  : "";
      if (!text) return;
      const extension = kind === "file" ? output!.format : "json";
      const ok = downloadTextFile(
        text,
        kind === "file"
          ? `redacted-${output!.name.replace(/\.(json|ya?ml|har)$/i, "")}.${extension}`
          : `redaction-${kind}.${extension}`,
        extension === "yaml" ? "application/yaml" : "application/json",
      );
      setFeedback({
        key: ok ? "redaction.downloaded" : "redaction.error.download",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  function apply() {
    if (
      !result ||
      !output?.canExport ||
      output.kind !== "openapi" ||
      dirty ||
      loading
    )
      return;
    if (getSchemaText() !== result.editorSource) {
      setFeedback({ key: "redaction.error.changed", error: true });
      return;
    }
    setUndo({ before: result.editorSource, applied: output.text });
    onApply(output.text);
    setFeedback({ key: "redaction.applied", error: false });
  }
  function restore() {
    if (!undo || loading) return;
    if (getSchemaText() !== undo.applied) {
      setFeedback({ key: "redaction.error.undo", error: true });
      return;
    }
    onApply(undo.before);
    setUndo(null);
    setFeedback({ key: "redaction.undone", error: false });
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("redaction.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("redaction.description")}</p>
          <p className="text-xs text-slate-600">{t("redaction.help")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-emerald-700"}
            >
              {t(feedback.key)}
            </p>
          )}
          {loading && <p role="status">{t("redaction.loading")}</p>}
          <div className="grid gap-3 lg:grid-cols-3">
            {(["sources", "project", "rules"] as const).map((kind) => (
              <label key={kind} className="block text-xs font-bold">
                {t(`redaction.import.${kind}`)}
                <input
                  className={inputClass}
                  type="file"
                  multiple={kind === "sources"}
                  accept={
                    kind === "sources"
                      ? ".json,.yaml,.yml,.har,application/json,application/yaml"
                      : ".json,application/json"
                  }
                  disabled={loading}
                  onChange={(e) => {
                    const files = Array.from(e.currentTarget.files ?? []);
                    e.currentTarget.value = "";
                    if (files.length) void read(files, kind);
                  }}
                />
              </label>
            ))}
          </div>
          <fieldset disabled={loading} className="min-w-0 space-y-4">
            <legend className="mb-2 font-bold">{t("redaction.inputs")}</legend>
            <label className="block text-xs font-bold">
              {t("redaction.name")}
              <input
                className={inputClass}
                maxLength={120}
                value={project.name}
                onChange={(e) => update({ ...project, name: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={project.sources.length >= MAX_REDACTION_SOURCES}
                onClick={() =>
                  add([
                    { name: "Editor", text: getSchemaText(), kind: "openapi" },
                  ])
                }
              >
                {t("redaction.capture")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={dirty}
                onClick={() => download("project")}
              >
                {t("redaction.exportProject")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={dirty}
                onClick={() => download("rules")}
              >
                {t("redaction.exportRules")}
              </button>
              {undo && (
                <button type="button" className={buttonClass} onClick={restore}>
                  {t("redaction.undo")}
                </button>
              )}
            </div>
            <details className="rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer font-bold">
                {t("redaction.pasteHeading")}
              </summary>
              <label className="mt-3 block text-xs font-bold">
                {t("redaction.pasteKind")}
                <select
                  className={inputClass}
                  value={pasteKind}
                  onChange={(e) =>
                    setPasteKind(e.target.value as typeof pasteKind)
                  }
                >
                  {(["auto", "openapi", "har", "json"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`redaction.kind.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs font-bold">
                {t("redaction.paste")}
                <textarea
                  className={`${inputClass} font-mono`}
                  maxLength={MAX_REDACTION_SOURCE_BYTES}
                  spellCheck={false}
                  rows={5}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`${buttonClass} mt-2`}
                disabled={
                  !paste.trim() ||
                  project.sources.length >= MAX_REDACTION_SOURCES
                }
                onClick={() =>
                  add([
                    {
                      name: `Input ${project.sources.length + 1}`,
                      text: paste,
                      ...(pasteKind === "auto" ? {} : { kind: pasteKind }),
                    },
                  ])
                }
              >
                {t("redaction.addPasted")}
              </button>
            </details>
            <label className="block text-xs font-bold">
              {t("redaction.source")}
              <select
                className={inputClass}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {!project.sources.length && <option value="">—</option>}
                {project.sources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name} · {t(`redaction.kind.${s.kind}`)}
                  </option>
                ))}
              </select>
            </label>
            {source && (
              <details className="rounded-xl border border-slate-200 p-3">
                <summary className="cursor-pointer font-bold">
                  {t("redaction.sourceHeading")}
                </summary>
                <label className="mt-3 block text-xs font-bold">
                  {t("redaction.sourceName")}
                  <input
                    className={inputClass}
                    maxLength={120}
                    value={source.name}
                    onChange={(e) =>
                      update({
                        ...project,
                        sources: project.sources.map((s) =>
                          s.key === selected
                            ? { ...s, name: e.target.value }
                            : s,
                        ),
                      })
                    }
                  />
                </label>
                <label className="mt-3 block text-xs font-bold">
                  {t("redaction.sourceText")}
                  <textarea
                    className={`${inputClass} font-mono`}
                    maxLength={MAX_REDACTION_SOURCE_BYTES}
                    spellCheck={false}
                    rows={7}
                    value={draftValue(sourceDrafts, source.key, source.text)}
                    onChange={(e) => {
                      setSourceDrafts({
                        ...sourceDrafts,
                        [source.key]: e.target.value,
                      });
                      invalidate();
                    }}
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={saveSource}
                  >
                    {t("redaction.saveSource")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      setSourceDrafts(
                        Object.fromEntries(
                          Object.entries(sourceDrafts).filter(
                            ([key]) => key !== selected,
                          ),
                        ),
                      );
                      setFeedback(null);
                    }}
                  >
                    {t("redaction.discardSource")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      const sources = project.sources.filter(
                        (s) => s.key !== selected,
                      );
                      update({ ...project, sources });
                      setSourceDrafts(
                        Object.fromEntries(
                          Object.entries(sourceDrafts).filter(
                            ([key]) => key !== selected,
                          ),
                        ),
                      );
                      setSelected(sources[0]?.key ?? "");
                    }}
                  >
                    {t("redaction.removeSource")}
                  </button>
                </div>
              </details>
            )}
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="font-bold">{t("redaction.automatic")}</h3>
              <div className="flex flex-wrap gap-4 text-xs">
                {(["secrets", "personal", "dropOpaqueBodies"] as const).map(
                  (key) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={project.options[key]}
                        onChange={(e) => options({ [key]: e.target.checked })}
                      />
                      {t(`redaction.option.${key}`)}
                    </label>
                  ),
                )}
              </div>
              <label className="block text-xs font-bold">
                {t("redaction.strategy")}
                <select
                  className={inputClass}
                  value={project.options.action}
                  onChange={(e) =>
                    options({
                      action: e.target.value as RedactionOptions["action"],
                    })
                  }
                >
                  {(["mask", "pseudonymize"] as const).map((a) => (
                    <option key={a} value={a}>
                      {t(`redaction.action.${a}`)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-600">
                {t("redaction.automaticHelp")}
              </p>
            </section>
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="font-bold">{t("redaction.rules")}</h3>
              <button
                type="button"
                className={buttonClass}
                disabled={project.rules.length >= MAX_REDACTION_RULES}
                onClick={addRule}
              >
                {t("redaction.addRule")}
              </button>
              <label className="block text-xs font-bold">
                {t("redaction.rule")}
                <select
                  className={inputClass}
                  value={selectedRule}
                  onChange={(e) => setSelectedRule(e.target.value)}
                >
                  {!project.rules.length && <option value="">—</option>}
                  {project.rules.map((r, i) => (
                    <option key={r.key} value={r.key}>
                      {i + 1}. {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {rule && (
                <>
                  <label className="block text-xs font-bold">
                    {t("redaction.ruleName")}
                    <input
                      className={inputClass}
                      maxLength={120}
                      value={rule.name}
                      onChange={(e) => editRule({ name: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => editRule({ enabled: e.target.checked })}
                    />
                    {t("redaction.enableRule")}
                  </label>
                  <label className="block text-xs font-bold">
                    {t("redaction.selector")}
                    <input
                      className={`${inputClass} font-mono`}
                      maxLength={1024}
                      value={rule.selector}
                      onChange={(e) => editRule({ selector: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {t("redaction.ruleAction")}
                    <select
                      className={inputClass}
                      value={rule.action}
                      onChange={(e) =>
                        editRule({
                          action: e.target.value as RedactionAction,
                          ...(e.target.value === "replace" &&
                          rule.replacement === undefined
                            ? { replacement: "[redacted]" }
                            : {}),
                        })
                      }
                    >
                      {(
                        ["mask", "pseudonymize", "remove", "replace"] as const
                      ).map((a) => (
                        <option key={a} value={a}>
                          {t(`redaction.action.${a}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {rule.action === "replace" && (
                    <>
                      <label className="block text-xs font-bold">
                        {t("redaction.replacement")}
                        <textarea
                          className={`${inputClass} font-mono`}
                          maxLength={MAX_REDACTION_SOURCE_BYTES}
                          rows={3}
                          spellCheck={false}
                          value={draftValue(
                            replacementDrafts,
                            rule.key,
                            JSON.stringify(rule.replacement),
                          )}
                          onChange={(e) => {
                            setReplacementDrafts({
                              ...replacementDrafts,
                              [rule.key]: e.target.value,
                            });
                            invalidate();
                          }}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={saveReplacement}
                        >
                          {t("redaction.saveReplacement")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => {
                            setReplacementDrafts(
                              Object.fromEntries(
                                Object.entries(replacementDrafts).filter(
                                  ([key]) => key !== selectedRule,
                                ),
                              ),
                            );
                            setFeedback(null);
                          }}
                        >
                          {t("redaction.discardReplacement")}
                        </button>
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={project.rules[0].key === rule.key}
                      onClick={() => moveRule(-1)}
                    >
                      {t("redaction.moveUp")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={project.rules.at(-1)?.key === rule.key}
                      onClick={() => moveRule(1)}
                    >
                      {t("redaction.moveDown")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        const rules = project.rules.filter(
                          (r) => r.key !== selectedRule,
                        );
                        update({ ...project, rules });
                        setReplacementDrafts(
                          Object.fromEntries(
                            Object.entries(replacementDrafts).filter(
                              ([key]) => key !== selectedRule,
                            ),
                          ),
                        );
                        setSelectedRule(rules[0]?.key ?? "");
                      }}
                    >
                      {t("redaction.removeRule")}
                    </button>
                  </div>
                </>
              )}
              <p className="text-xs text-slate-600">
                {t("redaction.ruleHelp")}
              </p>
            </section>
            {dirty && (
              <p role="status" className="text-amber-800">
                {t("redaction.dirty")}
              </p>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={dirty || !project.sources.length}
              onClick={generate}
            >
              {t("redaction.generate")}
            </button>
          </fieldset>
          {result && (
            <section className="space-y-3" aria-label={t("redaction.result")}>
              <h3 className="font-bold">{t("redaction.result")}</h3>
              <p>
                {t("redaction.summary", {
                  files: String(result.preview.files.length),
                  changes: String(result.preview.changeCount),
                  diagnostics: String(result.preview.diagnosticCount),
                })}
              </p>
              <p className="text-xs text-slate-600">
                {t("redaction.reviewHelp")}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={loading || dirty}
                  onClick={() => download("report")}
                >
                  {t("redaction.exportReport")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    loading ||
                    dirty ||
                    result.preview.files.some((f) => !f.canExport)
                  }
                  onClick={() => download("bundle")}
                >
                  {t("redaction.exportBundle")}
                </button>
              </div>
              {result.preview.diagnostics.length > 0 && (
                <ul className="max-h-64 space-y-2 overflow-auto text-xs">
                  {result.preview.diagnostics.map((d, i) => (
                    <li
                      key={i}
                      className={
                        d.severity === "error"
                          ? "text-red-700"
                          : "text-amber-800"
                      }
                    >
                      {project.sources.find((s) => s.key === d.source)?.name} ·{" "}
                      {t(`redaction.diagnostic.${d.code}`)} ·{" "}
                      <code className="break-all">{d.pointer || "/"}</code>
                    </li>
                  ))}
                </ul>
              )}
              {output && (
                <>
                  <h4 className="text-xs font-bold">
                    {t("redaction.output", {
                      name: output.name,
                      count: String(output.changes),
                    })}
                  </h4>
                  <pre
                    aria-label={t("redaction.preview")}
                    className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs whitespace-pre-wrap break-all text-slate-100"
                  >
                    {truncateJsonPreview(output.text, 16000)}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={loading || dirty || !output.canExport}
                      onClick={() => download("file")}
                    >
                      {t("redaction.exportFile")}
                    </button>
                    {output.kind === "openapi" && (
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={loading || dirty || !output.canExport}
                        onClick={apply}
                      >
                        {t("redaction.apply")}
                      </button>
                    )}
                  </div>
                </>
              )}
              <label className="block text-xs font-bold">
                {t("redaction.search")}
                <input
                  className={inputClass}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearch("");
                      setPage(0);
                    }
                  }}
                />
              </label>
              <p className="text-xs">
                {t("redaction.findingCount", {
                  total: String(result.preview.changeCount),
                  shown: String(result.preview.findings.length),
                  diagnostics: String(result.preview.diagnostics.length),
                })}
              </p>
              <ul
                aria-label={t("redaction.findings")}
                className="space-y-2 text-xs"
              >
                {findings
                  .slice(currentPage * 25, (currentPage + 1) * 25)
                  .map((f, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-slate-200 p-2 break-all"
                    >
                      {project.sources.find((s) => s.key === f.source)?.name} ·{" "}
                      {t(`redaction.category.${f.category}`)} ·{" "}
                      {t(`redaction.action.${f.action}`)} ·{" "}
                      <code>
                        {f.pointer || "/"}
                        {f.payloadPointer ? ` → ${f.payloadPointer}` : ""}
                      </code>{" "}
                      · {f.valueType}
                    </li>
                  ))}
              </ul>
              {!findings.length && <p>{t("redaction.noMatches")}</p>}
              {lastPage > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    {t("redaction.previous")}
                  </button>
                  <p className="text-xs">
                    {t("redaction.page", {
                      page: String(currentPage + 1),
                      total: String(lastPage + 1),
                    })}
                  </p>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={currentPage === lastPage}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    {t("redaction.next")}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </details>
  );
});
