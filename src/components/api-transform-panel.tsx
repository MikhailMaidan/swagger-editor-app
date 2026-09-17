"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  MAX_TRANSFORM_BYTES,
  MAX_TRANSFORM_STEPS,
  TransformError,
  listTransformPointers,
  parsePatch,
  parseTransformValue,
  previewTransformation,
  readTransformSource,
  serializePatch,
  serializeTransformation,
  validatePatch,
  type PatchOperation,
  type TransformPreview,
  type TransformSource,
} from "@/lib/api-transform";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import type { SchemaFormat } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
type Step = {
  id: number;
  op: PatchOperation["op"];
  path: string;
  from: string;
  value: string;
};
type Feedback = { key: TranslationKey; error: boolean; step?: string };

export const ApiTransformPanel = memo(function ApiTransformPanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<TransformSource | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<TransformPreview | null>(null);
  const [format, setFormat] = useState<SchemaFormat>("yaml");
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const generation = useRef(0);
  const nextId = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const step = steps.find((entry) => entry.id === selected);
  const pointers = useMemo(
    () => (source && open ? listTransformPointers(source.document) : []),
    [source, open],
  );
  const matches = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return pointers.filter((entry) =>
      terms.every((term) => entry.path.toLowerCase().includes(term)),
    );
  }, [pointers, search]);
  const output = useMemo(() => {
    if (!preview) return null;
    try {
      return { text: serializeTransformation(preview, format), error: false };
    } catch {
      return { text: "", error: true };
    }
  }, [preview, format]);

  function resetFeedback() {
    generation.current++;
    setLoading(false);
    setFeedback(null);
  }
  function invalidate() {
    resetFeedback();
    setPreview(null);
  }
  function fail(error: unknown) {
    setFeedback(
      error instanceof TransformError
        ? {
            key: `transform.error.${error.code}`,
            error: true,
            step: error.step === null ? undefined : String(error.step + 1),
          }
        : { key: "transform.error.read", error: true },
    );
  }
  function makeStep(operation: PatchOperation): Step {
    return {
      id: ++nextId.current,
      op: operation.op,
      path: operation.path,
      from: "from" in operation ? operation.from : "",
      value:
        "value" in operation
          ? JSON.stringify(operation.value, null, 2)
          : "null",
    };
  }
  function capture() {
    resetFeedback();
    try {
      const next = readTransformSource(getSchemaText());
      setSource(next);
      setFormat(next.format);
      setPreview(null);
      setSearch("");
      setFeedback({ key: "transform.captured", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function updateSteps(next: Step[]) {
    invalidate();
    setSteps(next);
  }
  function editStep(patch: Partial<Step>) {
    updateSteps(
      steps.map((entry) =>
        entry.id === selected ? { ...entry, ...patch } : entry,
      ),
    );
  }
  function add(
    operation: PatchOperation = {
      op: "add",
      path: "/info/description",
      value: "Describe this API variant.",
    },
  ) {
    if (steps.length >= MAX_TRANSFORM_STEPS) return;
    const next = makeStep(operation);
    updateSteps([...steps, next]);
    setSelected(next.id);
  }
  function move(index: number, direction: number) {
    const next = [...steps];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    updateSteps(next);
  }
  function operations() {
    return validatePatch(
      steps.map((entry, index) => {
        try {
          if (entry.op === "remove") return { op: entry.op, path: entry.path };
          if (entry.op === "copy" || entry.op === "move")
            return { op: entry.op, path: entry.path, from: entry.from };
          return {
            op: entry.op,
            path: entry.path,
            value: parseTransformValue(entry.value),
          };
        } catch (error) {
          if (error instanceof TransformError) error.step = index;
          throw error;
        }
      }),
    );
  }
  function accept(text: string) {
    resetFeedback();
    try {
      const next = parsePatch(text).map(makeStep);
      setSteps(next);
      setSelected(next[0]?.id ?? null);
      setPreview(null);
      setInput("");
      setFeedback({ key: "transform.imported", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File) {
    resetFeedback();
    const token = generation.current;
    setLoading(true);
    try {
      if (file.size > MAX_TRANSFORM_BYTES) throw new TransformError("limit");
      const text = await file.text();
      if (token === generation.current) accept(text);
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function generate() {
    invalidate();
    try {
      if (!source) throw new TransformError("source");
      setPreview(previewTransformation(source, operations()));
      setFeedback({ key: "transform.ready", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function exportText(kind: "recipe" | "document", copy: boolean) {
    resetFeedback();
    const token = generation.current;
    try {
      const text =
        kind === "recipe" ? serializePatch(operations()) : output?.text;
      if (text === undefined || (kind === "document" && output?.error))
        throw new TransformError("result");
      const ok = copy
        ? await writeTextToClipboard(text)
        : downloadTextFile(
            text,
            kind === "recipe"
              ? "rsswag-api-recipe.json"
              : `rsswag-transformed-openapi.${format}`,
            kind === "recipe"
              ? "application/json-patch+json"
              : format === "json"
                ? "application/json"
                : "application/yaml",
          );
      if (token === generation.current)
        setFeedback({
          key: ok
            ? copy
              ? "transform.copied"
              : "transform.downloaded"
            : copy
              ? "transform.error.copy"
              : "transform.error.download",
          error: !ok,
        });
    } catch (error) {
      if (token === generation.current) fail(error);
    }
  }
  function apply() {
    resetFeedback();
    if (!preview || !output || output.error) return;
    if (getSchemaText() !== preview.source.text) {
      setFeedback({ key: "transform.error.stale", error: true });
      return;
    }
    setUndo({ before: preview.source.text, after: output.text });
    onApply(output.text);
    setFeedback({ key: "transform.applied", error: false });
  }
  function restore() {
    resetFeedback();
    if (!undo) return;
    if (getSchemaText() !== undo.after) {
      setFeedback({ key: "transform.error.undo", error: true });
      return;
    }
    onApply(undo.before);
    setUndo(null);
    setFeedback({ key: "transform.undone", error: false });
  }
  const canAdd = steps.length < MAX_TRANSFORM_STEPS;

  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("transform.title")}
      </summary>
      {open && (
        <div className="space-y-4 border-t border-[color:var(--color-brand-border)] p-5 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("transform.description")}</p>
          <p className="text-xs text-slate-600">{t("transform.help")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass} onClick={capture}>
              {t("transform.capture")}
            </button>
            {source && (
              <span className="break-all text-xs">
                {t("transform.source", { title: source.title })}
              </span>
            )}
            {undo && (
              <button type="button" className={buttonClass} onClick={restore}>
                {t("transform.undo")}
              </button>
            )}
          </div>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer font-bold">
              {t("transform.importHeading")}
            </summary>
            <label className="mt-3 block text-xs font-bold">
              {t("transform.file")}
              <input
                className={inputClass}
                type="file"
                accept=".json,.jsonpatch,application/json,application/json-patch+json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void read(file);
                }}
              />
            </label>
            <label className="mt-3 block text-xs font-bold">
              {t("transform.input")}
              <textarea
                className={`${inputClass} font-mono`}
                rows={5}
                value={input}
                onChange={(event) => {
                  resetFeedback();
                  setInput(event.target.value);
                }}
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className={`${buttonClass} mt-2`}
              disabled={!input.trim()}
              onClick={() => accept(input)}
            >
              {t("transform.import")}
            </button>
            {loading && <p role="status">{t("transform.loading")}</p>}
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!canAdd}
              onClick={() => add()}
            >
              {t("transform.add")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!canAdd}
              onClick={() =>
                add({ op: "add", path: "/info/version", value: "2.0.0" })
              }
            >
              {t("transform.versionTemplate")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={
                !canAdd ||
                !source ||
                !(
                  typeof source.document === "object" &&
                  source.document !== null &&
                  Object.hasOwn(source.document, "openapi")
                )
              }
              onClick={() =>
                add({
                  op: "add",
                  path: "/servers",
                  value: [{ url: "https://api.example.com/v2" }],
                })
              }
            >
              {t("transform.serverTemplate")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!steps.length}
              onClick={() => {
                updateSteps([]);
                setSelected(null);
              }}
            >
              {t("transform.clear")}
            </button>
          </div>
          <p className="text-xs">
            {t("transform.steps", {
              count: String(steps.length),
              max: String(MAX_TRANSFORM_STEPS),
            })}
          </p>
          {steps.length === 0 && (
            <p className="text-xs text-slate-600">{t("transform.empty")}</p>
          )}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <ol
              aria-label={t("transform.recipe")}
              className="max-h-96 space-y-2 overflow-auto"
            >
              {steps.map((entry, index) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 p-2"
                >
                  <button
                    type="button"
                    className={`${buttonClass} min-w-0 flex-1 break-all text-left`}
                    aria-pressed={selected === entry.id}
                    onClick={() => {
                      setSelected(entry.id);
                      resetFeedback();
                    }}
                  >
                    {index + 1}. {entry.op} {entry.path || t("transform.root")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={index === 0}
                    aria-label={t("transform.up", { step: String(index + 1) })}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={index === steps.length - 1}
                    aria-label={t("transform.down", {
                      step: String(index + 1),
                    })}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={t("transform.remove", {
                      step: String(index + 1),
                    })}
                    onClick={() => {
                      const next = steps.filter((item) => item.id !== entry.id);
                      updateSteps(next);
                      if (selected === entry.id)
                        setSelected(
                          next[Math.min(index, next.length - 1)]?.id ?? null,
                        );
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            {step && (
              <fieldset className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 font-bold">
                  {t("transform.edit", {
                    step: String(steps.indexOf(step) + 1),
                  })}
                </legend>
                <label className="block text-xs font-bold">
                  {t("transform.operation")}
                  <select
                    className={inputClass}
                    value={step.op}
                    onChange={(event) =>
                      editStep({ op: event.target.value as Step["op"] })
                    }
                  >
                    {(
                      [
                        "add",
                        "replace",
                        "remove",
                        "copy",
                        "move",
                        "test",
                      ] as const
                    ).map((op) => (
                      <option key={op} value={op}>
                        {op} — {t(`transform.op.${op}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-slate-600">
                  {t(`transform.opHelp.${step.op}`)}
                </p>
                <label className="block text-xs font-bold">
                  {t("transform.path")}
                  <input
                    className={`${inputClass} font-mono`}
                    value={step.path}
                    maxLength={4096}
                    onChange={(event) => editStep({ path: event.target.value })}
                    spellCheck={false}
                  />
                </label>
                {(step.op === "copy" || step.op === "move") && (
                  <label className="block text-xs font-bold">
                    {t("transform.from")}
                    <input
                      className={`${inputClass} font-mono`}
                      value={step.from}
                      maxLength={4096}
                      onChange={(event) =>
                        editStep({ from: event.target.value })
                      }
                      spellCheck={false}
                    />
                  </label>
                )}
                {(step.op === "add" ||
                  step.op === "replace" ||
                  step.op === "test") && (
                  <label className="block text-xs font-bold">
                    {t("transform.value")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={6}
                      value={step.value}
                      onChange={(event) =>
                        editStep({ value: event.target.value })
                      }
                      spellCheck={false}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!canAdd}
                  onClick={() => {
                    const next = { ...step, id: ++nextId.current };
                    updateSteps([...steps, next]);
                    setSelected(next.id);
                  }}
                >
                  {t("transform.duplicate")}
                </button>
              </fieldset>
            )}
          </div>
          {source && (
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer font-bold">
                {t("transform.browser")}
              </summary>
              <p className="mt-2 text-xs text-slate-600">
                {t("transform.pointerHelp")}
              </p>
              <label className="mt-2 block text-xs font-bold">
                {t("transform.search")}
                <input
                  className={inputClass}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSearch("");
                    }
                  }}
                />
              </label>
              <p className="my-2 text-xs">
                {t("transform.matches", {
                  count: String(matches.length),
                  shown: String(Math.min(matches.length, 50)),
                })}
              </p>
              <ul className="max-h-64 space-y-1 overflow-auto">
                {matches.slice(0, 50).map((entry) => (
                  <li
                    key={entry.path}
                    className="flex flex-wrap items-center gap-2 text-xs"
                  >
                    <code className="min-w-0 flex-1 break-all">
                      {entry.path || t("transform.root")} · {entry.summary}
                    </code>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!step}
                      aria-label={t("transform.usePath", {
                        path: entry.path || t("transform.root"),
                      })}
                      onClick={() => editStep({ path: entry.path })}
                    >
                      {t("transform.use")}
                    </button>
                    {(step?.op === "copy" || step?.op === "move") && (
                      <button
                        type="button"
                        className={buttonClass}
                        aria-label={t("transform.useFrom", {
                          path: entry.path || t("transform.root"),
                        })}
                        onClick={() => editStep({ from: entry.path })}
                      >
                        {t("transform.useSource")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!source}
              onClick={generate}
            >
              {t("transform.preview")}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => void exportText("recipe", true)}
            >
              {t("transform.copyRecipe")}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => void exportText("recipe", false)}
            >
              {t("transform.downloadRecipe")}
            </button>
          </div>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={`break-words text-xs ${feedback.error ? "text-red-700" : "text-emerald-700"}`}
            >
              {feedback.step &&
                `${t("transform.stepError", { step: feedback.step })} `}
              {t(feedback.key)}
            </p>
          )}
          {preview && output && (
            <section
              aria-label={t("transform.result")}
              className="space-y-3 rounded-lg border border-slate-200 p-3"
            >
              <p className="font-bold">
                {t("transform.changeCount", {
                  count: String(preview.changes.length),
                })}
              </p>
              {preview.truncated && (
                <p className="text-xs">{t("transform.truncated")}</p>
              )}
              {preview.changes.length === 0 && (
                <p className="text-xs">{t("transform.noChanges")}</p>
              )}
              <ul className="max-h-72 space-y-2 overflow-auto text-xs">
                {preview.changes.map((change) => (
                  <li
                    key={change.path}
                    className="break-all rounded bg-slate-50 p-2"
                  >
                    <strong>{t(`transform.kind.${change.kind}`)}</strong>{" "}
                    <code>{change.path || t("transform.root")}</code>
                    <div>
                      {change.before !== undefined && (
                        <span>
                          {t("transform.before")}:{" "}
                          <code>{change.before}</code>{" "}
                        </span>
                      )}
                      {change.after !== undefined && (
                        <span>
                          {t("transform.after")}: <code>{change.after}</code>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <label className="block max-w-xs text-xs font-bold">
                {t("transform.format")}
                <select
                  className={inputClass}
                  value={format}
                  onChange={(event) => {
                    resetFeedback();
                    setFormat(event.target.value as SchemaFormat);
                  }}
                >
                  <option value="json">JSON</option>
                  <option value="yaml">YAML</option>
                </select>
              </label>
              {output.error ? (
                <p role="alert">{t("transform.error.limit")}</p>
              ) : (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("transform.output")}
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-slate-50 p-2 text-xs">
                    {output.text.slice(0, 50000)}
                  </pre>
                  {output.text.length > 50000 && (
                    <p className="text-xs">{t("transform.previewLimit")}</p>
                  )}
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={output.error}
                  onClick={() => void exportText("document", true)}
                >
                  {t("transform.copyDocument")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={output.error}
                  onClick={() => void exportText("document", false)}
                >
                  {t("transform.downloadDocument")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={output.error}
                  onClick={apply}
                >
                  {t("transform.apply")}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
