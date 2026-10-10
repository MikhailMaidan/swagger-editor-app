"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  emptyMergeProject,
  MAX_MERGE_CUSTOM_BYTES,
  MAX_MERGE_PROJECT_BYTES,
  MAX_MERGE_SOURCE_BYTES,
  mergeOpenApi,
  MergeError,
  mergeReport,
  mergeReportMarkdown,
  parseMergeCustom,
  parseMergeProject,
  readMergeSource,
  serializeMergedApi,
  serializeMergeProject,
  type MergePlan,
  type MergeResolution,
  type MergeSide,
  type MergeSlot,
} from "@/lib/openapi-merge";
import { downloadTextFile } from "@/lib/schema-download";
import type { SchemaFormat } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";
import { getByteSize } from "@/lib/text-encoding";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const sides: MergeSide[] = ["base", "ours", "theirs"];

export const OpenApiMergePanel = memo(function OpenApiMergePanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyMergeProject),
    [plan, setPlan] = useState<MergePlan | null>(null);
  const [fresh, setFresh] = useState(false),
    [previewEditor, setPreviewEditor] = useState<string | null>(null),
    [format, setFormat] = useState<SchemaFormat>("json");
  const [loading, setLoading] = useState(false),
    [selected, setSelected] = useState(""),
    [custom, setCustom] = useState<Record<string, string>>({});
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("all"),
    [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
      side?: MergeSide;
    } | null>(null),
    [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const choices = useMemo(
    () => new Map(project.resolutions.map((r) => [r.id, r])),
    [project.resolutions],
  );
  const conflicts = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (plan?.conflicts ?? []).filter(
      (c) =>
        (filter === "all" || choices.has(c.id) === (filter === "resolved")) &&
        terms.every((term) =>
          `${c.location} ${c.kind} ${choices.get(c.id)?.choice ?? "unresolved"}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [plan, search, filter, choices]);
  const conflict = plan?.conflicts.find((c) => c.id === selected),
    choice = choices.get(selected);
  const lastPage = Math.max(0, Math.ceil(conflicts.length / 20) - 1),
    currentPage = Math.min(page, lastPage);
  const ready = Boolean(
    fresh &&
    plan &&
    plan.document !== null &&
    !plan.issue &&
    plan.resolvedCount === plan.conflicts.length,
  );
  const output = useMemo(() => {
    if (!ready || !plan) return null;
    try {
      return { text: serializeMergedApi(plan, format), error: false };
    } catch {
      return { text: "", error: true };
    }
  }, [ready, plan, format]);
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof MergeError
          ? `mergeStudio.error.${error.code}`
          : "mergeStudio.error.source",
      error: true,
      ...(error instanceof MergeError && error.side
        ? { side: error.side }
        : {}),
    });
  }
  function invalidate() {
    generation.current++;
    setFresh(false);
    setPreviewEditor(null);
    setFeedback(null);
  }
  function input(side: MergeSide, text: string) {
    setProject({
      ...project,
      inputs: { ...project.inputs, [side]: text },
      resolutions: [],
    });
    setCustom({});
    setPlan(null);
    setSelected("");
    setPage(0);
    invalidate();
  }
  function capture(side: MergeSide) {
    try {
      const text = getSchemaText();
      readMergeSource(text, side);
      input(side, text);
      setFeedback({ key: "mergeStudio.captured", error: false, side });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, side: MergeSide | "project") {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (
        file.size >
        (side === "project" ? MAX_MERGE_PROJECT_BYTES : MAX_MERGE_SOURCE_BYTES)
      )
        throw new MergeError("limit");
      const text = await file.text();
      if (generation.current !== token) return;
      if (side === "project") {
        const parsed = parseMergeProject(text);
        setProject(parsed.project);
        setPlan(parsed.plan);
        setCustom({});
        setSelected(parsed.plan.conflicts[0]?.id ?? "");
        setPage(0);
        setSearch("");
        setFilter("all");
        setFresh(false);
        setPreviewEditor(null);
        setFeedback({ key: "mergeStudio.restored", error: false });
      } else {
        readMergeSource(text, side);
        input(side, text);
        setFeedback({ key: "mergeStudio.imported", error: false, side });
      }
    } catch (error) {
      if (generation.current === token) fail(error);
    } finally {
      setLoading(false);
    }
  }
  function analyse() {
    setFeedback(null);
    setFresh(false);
    setPreviewEditor(null);
    try {
      const next = mergeOpenApi(project.inputs, {
        keyedArrays: project.keyedArrays,
        resolutions: project.resolutions,
      });
      setPlan(next);
      setFresh(true);
      setPreviewEditor(getSchemaText());
      if (!next.conflicts.some((c) => c.id === selected))
        setSelected(next.conflicts[0]?.id ?? "");
      setFeedback({
        key: next.issue
          ? `mergeStudio.error.${next.issue}`
          : next.resolvedCount === next.conflicts.length
            ? "mergeStudio.ready"
            : "mergeStudio.conflictsFound",
        error: Boolean(next.issue),
      });
    } catch (error) {
      setPlan(null);
      fail(error);
    }
  }
  function resolve(id: string, chosen: MergeResolution["choice"]) {
    const c = plan?.conflicts.find((c) => c.id === id);
    if (!c) return;
    try {
      const resolution: MergeResolution = { id, choice: chosen };
      if (chosen === "custom") {
        if (c.kind === "array-order") throw new MergeError("resolution");
        const text = Object.hasOwn(custom, id)
          ? custom[id]
          : choice?.choice === "custom"
            ? choice.custom!
            : "null";
        parseMergeCustom(text);
        resolution.custom = text;
      }
      setProject({
        ...project,
        resolutions: [
          ...project.resolutions.filter((r) => r.id !== id),
          resolution,
        ],
      });
      invalidate();
    } catch (error) {
      fail(error);
    }
  }
  function clearResolution(id: string) {
    setProject({
      ...project,
      resolutions: project.resolutions.filter((r) => r.id !== id),
    });
    invalidate();
  }
  function bulk(side: MergeSide) {
    if (!plan) return;
    setProject({
      ...project,
      resolutions: [
        ...project.resolutions,
        ...plan.conflicts
          .filter((c) => !choices.has(c.id))
          .map((c) => ({ id: c.id, choice: side })),
      ],
    });
    invalidate();
  }
  function apply() {
    if (!ready || !output || output.error || previewEditor === null) return;
    const current = getSchemaText();
    if (current !== previewEditor) {
      setFeedback({ key: "mergeStudio.stale", error: true });
      return;
    }
    if (current === output.text) {
      setFeedback({ key: "mergeStudio.unchanged", error: false });
      return;
    }
    onApply(output.text);
    setUndo({ before: current, after: output.text });
    setPreviewEditor(output.text);
    setFeedback({ key: "mergeStudio.applied", error: false });
  }
  function revert() {
    if (!undo) return;
    if (getSchemaText() !== undo.after) {
      setFeedback({ key: "mergeStudio.staleUndo", error: true });
      return;
    }
    onApply(undo.before);
    setUndo(null);
    setFresh(false);
    setPreviewEditor(null);
    setFeedback({ key: "mergeStudio.undone", error: false });
  }
  function download(kind: "api" | "project" | "report" | "markdown") {
    if (loading) return;
    try {
      const text =
        kind === "project"
          ? serializeMergeProject(project)
          : kind === "api"
            ? ready && output && !output.error
              ? output.text
              : ""
            : fresh && plan
              ? kind === "report"
                ? json(mergeReport(plan, project.name)) + "\n"
                : mergeReportMarkdown(plan, project.name)
              : "";
      if (!text) return;
      if (getByteSize(text) > MAX_MERGE_PROJECT_BYTES)
        throw new MergeError("limit");
      const ext = kind === "api" ? format : kind === "markdown" ? "md" : "json";
      const ok = downloadTextFile(
        text,
        `openapi-merge-${kind}.${ext}`,
        ext === "yaml"
          ? "application/yaml"
          : ext === "md"
            ? "text/markdown"
            : "application/json",
      );
      setFeedback({
        key: ok ? "mergeStudio.downloaded" : "mergeStudio.error.download",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  function renderSlot(value: MergeSlot, side: MergeSide) {
    return (
      <div className="min-w-0 space-y-2 rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-bold">{t(`mergeStudio.side.${side}`)}</p>
        <pre
          aria-label={t("mergeStudio.sidePreview", {
            side: t(`mergeStudio.side.${side}`),
          })}
          className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-2 text-xs break-all whitespace-pre-wrap"
        >
          {value.present
            ? json(value.value).slice(0, 16000)
            : t("mergeStudio.missing")}
        </pre>
        <button
          type="button"
          className={buttonClass}
          disabled={loading}
          onClick={() => {
            if (conflict) resolve(conflict.id, side);
          }}
        >
          {t(`mergeStudio.choose.${side}`)}
        </button>
      </div>
    );
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("mergeStudio.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("mergeStudio.description")}</p>
          <p className="text-xs text-slate-600">{t("mergeStudio.help")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-emerald-700"}
            >
              {t(feedback.key)}
              {feedback.side
                ? ` · ${t(`mergeStudio.side.${feedback.side}`)}`
                : ""}
            </p>
          )}
          {loading && <p role="status">{t("mergeStudio.loading")}</p>}
          <label className="block text-xs font-bold">
            {t("mergeStudio.importProject")}
            <input
              className={inputClass}
              type="file"
              accept=".json,application/json"
              disabled={loading}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) void read(f, "project");
              }}
            />
          </label>
          <fieldset disabled={loading} className="min-w-0 space-y-3">
            <legend className="font-bold">{t("mergeStudio.sources")}</legend>
            <label className="block text-xs font-bold">
              {t("mergeStudio.name")}
              <input
                className={inputClass}
                value={project.name}
                maxLength={120}
                onChange={(e) => {
                  setProject({ ...project, name: e.target.value });
                  setFeedback(null);
                }}
              />
            </label>
            <div className="grid gap-4 xl:grid-cols-3">
              {sides.map((side) => (
                <section
                  className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
                  key={side}
                >
                  <h3 className="font-bold">{t(`mergeStudio.side.${side}`)}</h3>
                  <p className="text-xs text-slate-600">
                    {t(`mergeStudio.sideHelp.${side}`)}
                  </p>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => capture(side)}
                  >
                    {t(`mergeStudio.capture.${side}`)}
                  </button>
                  <label className="block text-xs font-bold">
                    {t(`mergeStudio.import.${side}`)}
                    <input
                      className={inputClass}
                      type="file"
                      accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (f) void read(f, side);
                      }}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {t(`mergeStudio.source.${side}`)}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={8}
                      spellCheck={false}
                      maxLength={MAX_MERGE_SOURCE_BYTES}
                      value={project.inputs[side]}
                      onChange={(e) => input(side, e.target.value)}
                    />
                  </label>
                  {plan && (
                    <p className="text-xs break-all">
                      {plan.sources[side].title} · {plan.sources[side].format}
                    </p>
                  )}
                </section>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={project.keyedArrays}
                onChange={(e) => {
                  setProject({
                    ...project,
                    keyedArrays: e.target.checked,
                    resolutions: [],
                  });
                  setPlan(null);
                  setCustom({});
                  setSelected("");
                  invalidate();
                }}
              />
              {t("mergeStudio.keyedArrays")}
            </label>
            <p className="text-xs text-slate-600">
              {t("mergeStudio.arrayHelp")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={sides.some((side) => !project.inputs[side].trim())}
                onClick={analyse}
              >
                {t("mergeStudio.preview")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={sides.some((side) => !project.inputs[side].trim())}
                onClick={() => download("project")}
              >
                {t("mergeStudio.exportProject")}
              </button>
            </div>
          </fieldset>
          {plan && (
            <>
              <p className="text-xs font-bold">
                {t("mergeStudio.summary", {
                  resolved: String(
                    plan.conflicts.filter((c) => choices.has(c.id)).length,
                  ),
                  conflicts: String(plan.conflicts.length),
                  automatic: String(plan.automaticDecisions),
                  keyed: String(plan.keyedArrayCount),
                  atomic: String(plan.atomicArrayCount),
                })}
              </p>
              {!fresh && (
                <p role="status" className="text-amber-800">
                  {t("mergeStudio.needsPreview")}
                </p>
              )}
              <section className="space-y-3 rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold">{t("mergeStudio.conflicts")}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold">
                    {t("mergeStudio.search")}
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
                  <label className="block text-xs font-bold">
                    {t("mergeStudio.filter")}
                    <select
                      className={inputClass}
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value as typeof filter);
                        setPage(0);
                      }}
                    >
                      {(["all", "unresolved", "resolved"] as const).map((f) => (
                        <option key={f} value={f}>
                          {t(`mergeStudio.filter.${f}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sides.map((side) => (
                    <button
                      type="button"
                      key={side}
                      className={buttonClass}
                      disabled={
                        loading ||
                        plan.conflicts.every((c) => choices.has(c.id))
                      }
                      onClick={() => bulk(side)}
                    >
                      {t(`mergeStudio.bulk.${side}`)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={loading || !project.resolutions.length}
                    onClick={() => {
                      setProject({ ...project, resolutions: [] });
                      invalidate();
                    }}
                  >
                    {t("mergeStudio.clearResolutions")}
                  </button>
                </div>
                {!conflicts.length && (
                  <p className="text-xs">{t("mergeStudio.noConflicts")}</p>
                )}
                <div className="space-y-2">
                  {conflicts
                    .slice(currentPage * 20, (currentPage + 1) * 20)
                    .map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`${buttonClass} block w-full text-left break-all`}
                        aria-pressed={selected === c.id}
                        onClick={() => setSelected(c.id)}
                      >
                        {c.location || "/"} · {t(`mergeStudio.kind.${c.kind}`)}{" "}
                        ·{" "}
                        {choices.has(c.id)
                          ? t(`mergeStudio.choice.${choices.get(c.id)!.choice}`)
                          : t("mergeStudio.unresolved")}
                      </button>
                    ))}
                </div>
                {lastPage > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!currentPage}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {t("mergeStudio.previous")}
                    </button>
                    <p className="text-xs">
                      {t("mergeStudio.page", {
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
                      {t("mergeStudio.next")}
                    </button>
                  </div>
                )}
                {conflict && (
                  <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                    <h4 className="text-xs font-bold break-all">
                      {t("mergeStudio.selected", {
                        location: conflict.location || "/",
                      })}
                    </h4>
                    {conflict.kind === "array-order" && (
                      <p className="text-xs text-slate-600">
                        {t("mergeStudio.orderHelp")}
                      </p>
                    )}
                    <div className="grid gap-3 lg:grid-cols-3">
                      {sides.map((side) => (
                        <div key={side}>{renderSlot(conflict[side], side)}</div>
                      ))}
                    </div>
                    <label className="block text-xs font-bold">
                      {t("mergeStudio.custom")}
                      <textarea
                        className={`${inputClass} font-mono`}
                        rows={5}
                        maxLength={MAX_MERGE_CUSTOM_BYTES}
                        spellCheck={false}
                        disabled={loading || conflict.kind === "array-order"}
                        value={
                          Object.hasOwn(custom, selected)
                            ? custom[selected]
                            : choice?.choice === "custom"
                              ? choice.custom!
                              : "null"
                        }
                        onChange={(e) => {
                          setCustom({ ...custom, [selected]: e.target.value });
                          if (choice?.choice === "custom")
                            clearResolution(selected);
                          else invalidate();
                        }}
                      />
                    </label>
                    <p className="text-xs text-slate-600">
                      {t("mergeStudio.customHelp")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={loading || conflict.kind === "array-order"}
                        onClick={() => resolve(selected, "custom")}
                      >
                        {t("mergeStudio.saveCustom")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={loading || !choice}
                        onClick={() => clearResolution(selected)}
                      >
                        {t("mergeStudio.clearSelected")}
                      </button>
                    </div>
                  </div>
                )}
              </section>
              {fresh && (
                <section className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <h3 className="font-bold">{t("mergeStudio.output")}</h3>
                  {plan.review && (
                    <>
                      <p className="text-xs">
                        {t("mergeStudio.review", {
                          added: String(plan.review.added),
                          removed: String(plan.review.removed),
                          modified: String(plan.review.modified),
                          breaking: String(plan.review.breaking),
                          broken: String(plan.review.brokenReferences),
                          external: String(plan.review.externalReferences),
                        })}
                      </p>
                      <p className="text-xs text-slate-600">
                        {t("mergeStudio.reviewHelp")}
                      </p>
                      {plan.review.references.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-xs font-bold">
                            {t("mergeStudio.referenceFindings")}
                          </summary>
                          <ul className="mt-2 space-y-1 text-xs">
                            {plan.review.references.slice(0, 50).map((r, i) => (
                              <li className="break-all" key={i}>
                                {r.status} · {r.pointer} · {r.reference}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                  {plan.document !== null && (
                    <p className="text-xs">
                      {t("mergeStudio.changeCount", {
                        count: String(plan.changes.length),
                      })}
                      {plan.changesTruncated
                        ? ` · ${t("mergeStudio.truncatedChanges")}`
                        : ""}
                    </p>
                  )}
                  {plan.changes.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-xs font-bold">
                        {t("mergeStudio.changes")}
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs">
                        {plan.changes.map((c) => (
                          <li className="break-all" key={c.path}>
                            {c.kind} · {c.path || "/"}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <label className="block text-xs font-bold">
                    {t("mergeStudio.format")}
                    <select
                      className={inputClass}
                      disabled={loading}
                      value={format}
                      onChange={(e) =>
                        setFormat(e.target.value as SchemaFormat)
                      }
                    >
                      <option value="json">JSON</option>
                      <option value="yaml">YAML</option>
                    </select>
                  </label>
                  {output?.error && (
                    <p role="alert" className="text-red-700">
                      {t("mergeStudio.error.limit")}
                    </p>
                  )}
                  <pre
                    aria-label={t("mergeStudio.previewLabel")}
                    className="max-h-96 overflow-auto rounded-xl bg-slate-50 p-3 text-xs break-all whitespace-pre-wrap"
                  >
                    {(output && !output.error
                      ? output.text
                      : plan.candidateText
                    ).slice(0, 16000) || t("mergeStudio.blocked")}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={loading || !ready || !output || output.error}
                      onClick={() => download("api")}
                    >
                      {t("mergeStudio.exportApi")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={loading || !ready || !output || output.error}
                      onClick={apply}
                    >
                      {t("mergeStudio.apply")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={loading}
                      onClick={() => download("report")}
                    >
                      {t("mergeStudio.exportReport")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={loading}
                      onClick={() => download("markdown")}
                    >
                      {t("mergeStudio.exportMarkdown")}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={loading || !undo}
            onClick={revert}
          >
            {t("mergeStudio.undo")}
          </button>
        </div>
      )}
    </details>
  );
});
