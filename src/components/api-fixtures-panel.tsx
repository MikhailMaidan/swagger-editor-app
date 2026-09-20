"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  captureFixtureDocument,
  exportFixtureData,
  fixtureFields,
  FixtureError,
  generateFixtures,
  MAX_FIXTURE_BYTES,
  MAX_FIXTURE_DATASETS,
  parseFixtureRecipe,
  serializeFixtureRecipe,
  type FixtureDataset,
  type FixtureDocument,
  type FixtureRecipe,
  type FixtureResult,
  type FixtureRule,
} from "@/lib/api-fixtures";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { truncateJsonPreview } from "@/lib/response-data-explorer";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
type DraftRule =
  | Exclude<FixtureRule, { kind: "constant" }>
  | { field: string; kind: "constant"; text: string };
type DraftDataset = Omit<FixtureDataset, "rules"> & { rules: DraftRule[] };
type Feedback = { key: TranslationKey; error: boolean; dataset?: string };
function draftDatasets(recipe: FixtureRecipe): DraftDataset[] {
  return recipe.datasets.map((dataset) => ({
    ...dataset,
    rules: dataset.rules.map((rule) =>
      rule.kind === "constant"
        ? {
            field: rule.field,
            kind: rule.kind,
            text: JSON.stringify(rule.value, null, 2),
          }
        : rule,
    ),
  }));
}

export const ApiFixturesPanel = memo(function ApiFixturesPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<FixtureDocument | null>(null);
  const [seed, setSeed] = useState("rsswag");
  const [includeOptional, setIncludeOptional] = useState(true);
  const [datasets, setDatasets] = useState<DraftDataset[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [sourcePointer, setSourcePointer] = useState("");
  const [result, setResult] = useState<FixtureResult | null>(null);
  const [scope, setScope] = useState("");
  const [format, setFormat] = useState<"json" | "ndjson" | "csv">("json");
  const [page, setPage] = useState(0);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState<"generate" | "import" | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      revision.current++;
      controller.current?.abort();
    },
    [],
  );
  const dataset = datasets.find((entry) => entry.id === selected);
  const fields = useMemo(
    () =>
      source && dataset && open
        ? fixtureFields(source.root, dataset.source)
        : [],
    [source, dataset, open],
  );
  const sources = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (
      source?.sources.filter((entry) =>
        terms.every((term) =>
          `${entry.label} ${entry.pointer}`.toLowerCase().includes(term),
        ),
      ) ?? []
    );
  }, [source, search]);
  const chosenSource =
    sources.find((entry) => entry.pointer === sourcePointer) ?? sources[0];
  const output =
    result?.datasets.find((entry) => entry.id === scope) ?? result?.datasets[0];
  const preview = useMemo(
    () =>
      output
        ? truncateJsonPreview(
            JSON.stringify(
              output.rows.slice(page * 10, page * 10 + 10),
              null,
              2,
            ),
            30000,
          )
        : "",
    [output, page],
  );
  const total = datasets.reduce((sum, entry) => sum + entry.count, 0);

  function clearFeedback() {
    revision.current++;
    setFeedback(null);
  }
  function invalidate() {
    clearFeedback();
    setResult(null);
    setPage(0);
  }
  function fail(error: unknown) {
    const code = error instanceof FixtureError ? error.code : "read";
    const id = error instanceof FixtureError ? error.datasetId : "";
    setFeedback({
      key: `fixtures.error.${code}`,
      error: code !== "cancelled",
      dataset: datasets.find((entry) => entry.id === id)?.name ?? id,
    });
  }
  function capture() {
    clearFeedback();
    try {
      const next = captureFixtureDocument(getSchemaText());
      setSource(next);
      setSearch("");
      setSourcePointer("");
      setResult(null);
      setPage(0);
      setFeedback({ key: "fixtures.captured", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function update(next: DraftDataset[]) {
    invalidate();
    setDatasets(next);
  }
  function edit(patch: Partial<DraftDataset>) {
    update(
      datasets.map((entry) =>
        entry.id === selected ? { ...entry, ...patch } : entry,
      ),
    );
  }
  function editRule(index: number, rule: DraftRule) {
    if (dataset)
      edit({
        rules: dataset.rules.map((entry, at) => (at === index ? rule : entry)),
      });
  }
  function add() {
    if (!chosenSource || datasets.length >= MAX_FIXTURE_DATASETS) return;
    let index = 1;
    while (
      datasets.some(
        (entry) =>
          entry.id === `dataset-${index}` ||
          entry.name === `dataset_${index}` ||
          entry.rules.some(
            (rule) =>
              rule.kind === "reference" &&
              rule.datasetId === `dataset-${index}`,
          ),
      )
    )
      index++;
    const entry: DraftDataset = {
      id: `dataset-${index}`,
      name: `dataset_${index}`,
      source: chosenSource.pointer,
      direction: chosenSource.direction,
      count: 10,
      rules: [],
    };
    update([...datasets, entry]);
    setSelected(entry.id);
  }
  function recipe(): FixtureRecipe {
    const value = {
      seed,
      includeOptional,
      datasets: datasets.map((entry): FixtureDataset => ({
        ...entry,
        rules: entry.rules.map((rule): FixtureRule => {
          if (rule.kind !== "constant") return rule;
          try {
            return {
              field: rule.field,
              kind: rule.kind,
              value: JSON.parse(rule.text),
            };
          } catch {
            throw new FixtureError("recipe", entry.id);
          }
        }),
      })),
    };
    return parseFixtureRecipe(serializeFixtureRecipe(value));
  }
  async function generate() {
    invalidate();
    if (!source) return;
    const version = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy("generate");
    setProgress({ done: 0, total });
    try {
      const next = await generateFixtures(source, recipe(), {
        signal: abort.signal,
        onProgress: (done, total) => {
          if (version === revision.current) setProgress({ done, total });
        },
      });
      if (version !== revision.current) return;
      setResult(next);
      setScope(next.datasets[0].id);
      setFormat("json");
      setPage(0);
      setFeedback({ key: "fixtures.generated", error: false });
    } catch (error) {
      if (version === revision.current) fail(error);
    } finally {
      if (version === revision.current) {
        setBusy(null);
        controller.current = null;
      }
    }
  }
  function cancel() {
    revision.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(null);
    setFeedback({ key: "fixtures.error.cancelled", error: false });
  }
  function accept(text: string) {
    const next = parseFixtureRecipe(text);
    invalidate();
    setSeed(next.seed);
    setIncludeOptional(next.includeOptional);
    setDatasets(draftDatasets(next));
    setSelected(next.datasets[0]?.id ?? "");
    setImportText("");
    setFeedback({ key: "fixtures.imported", error: false });
  }
  async function importFile(file: File) {
    clearFeedback();
    const version = revision.current;
    setBusy("import");
    try {
      if (file.size > MAX_FIXTURE_BYTES) throw new FixtureError("limit");
      const text = await file.text();
      if (version === revision.current) {
        accept(text);
        setBusy(null);
      }
    } catch (error) {
      if (version === revision.current) {
        fail(error);
        setBusy(null);
      }
    }
  }
  async function exportData(copy: boolean) {
    clearFeedback();
    const version = revision.current;
    try {
      if (!result) return;
      const text = exportFixtureData(
        result,
        scope || null,
        scope ? format : "json",
      );
      const ok = copy
        ? await writeTextToClipboard(text)
        : downloadTextFile(
            text,
            `rsswag-${scope ? output!.name : "fixtures"}.${scope ? format : "json"}`,
            format === "csv" && scope
              ? "text/csv;charset=utf-8"
              : format === "ndjson" && scope
                ? "application/x-ndjson"
                : "application/json",
          );
      if (version === revision.current)
        setFeedback({
          key: ok
            ? copy
              ? "fixtures.copied"
              : "fixtures.downloaded"
            : "fixtures.error.export",
          error: !ok,
        });
    } catch (error) {
      if (version === revision.current) fail(error);
    }
  }
  function exportRecipe() {
    clearFeedback();
    try {
      const ok = downloadTextFile(
        serializeFixtureRecipe(recipe()),
        "rsswag-fixture-recipe.json",
        "application/json",
      );
      setFeedback({
        key: ok ? "fixtures.downloaded" : "fixtures.error.export",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }

  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("fixtures.title")}
      </summary>
      {busy && (
        <div className="flex items-center gap-3 px-5 pb-3">
          <p role="status" className="text-xs">
            {busy === "generate"
              ? t("fixtures.progress", {
                  done: String(progress.done),
                  total: String(progress.total),
                })
              : t("fixtures.loading")}
          </p>
          <button type="button" className={buttonClass} onClick={cancel}>
            {t("fixtures.cancel")}
          </button>
        </div>
      )}
      {open && (
        <div className="space-y-4 border-t border-[color:var(--color-brand-border)] p-5 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("fixtures.description")}</p>
          <p className="text-xs text-slate-600">{t("fixtures.privacy")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={
                feedback.error
                  ? "text-sm text-rose-700"
                  : "text-sm text-emerald-800"
              }
            >
              {t(feedback.key, { dataset: feedback.dataset ?? "" })}
            </p>
          )}
          <fieldset
            disabled={busy !== null}
            className="min-w-0 space-y-4 disabled:opacity-60"
          >
            <legend className="sr-only">{t("fixtures.configure")}</legend>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={buttonClass} onClick={capture}>
                {t("fixtures.capture")}
              </button>
              {source && (
                <span className="text-xs">
                  {t("fixtures.sourceSummary", {
                    title: source.title,
                    count: String(source.sources.length),
                  })}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">{t("fixtures.snapshot")}</p>
            {source?.truncated && (
              <p role="status" className="text-xs text-amber-800">
                {t("fixtures.sourcesLimited")}
              </p>
            )}
            {source && !source.sources.length && (
              <p>{t("fixtures.noSources")}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t("fixtures.seed")}
                <input
                  className={inputClass}
                  value={seed}
                  maxLength={128}
                  onChange={(event) => {
                    invalidate();
                    setSeed(event.target.value);
                  }}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeOptional}
                  onChange={(event) => {
                    invalidate();
                    setIncludeOptional(event.target.checked);
                  }}
                />
                {t("fixtures.optional")}
              </label>
              <label>
                {t("fixtures.search")}
                <input
                  type="search"
                  className={inputClass}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                {t("fixtures.source")}
                <select
                  className={inputClass}
                  value={chosenSource?.pointer ?? ""}
                  onChange={(event) => setSourcePointer(event.target.value)}
                >
                  <option value="" disabled>
                    {t("fixtures.chooseSource")}
                  </option>
                  {sources.map((entry) => (
                    <option key={entry.pointer} value={entry.pointer}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !chosenSource || datasets.length >= MAX_FIXTURE_DATASETS
                }
                onClick={add}
              >
                {t("fixtures.add")}
              </button>
              <span className="text-xs">
                {t("fixtures.counts", {
                  datasets: String(datasets.length),
                  rows: String(total),
                })}
              </span>
            </div>
            {!!datasets.length && (
              <label className="block">
                {t("fixtures.dataset")}
                <select
                  className={inputClass}
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {datasets.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name || entry.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {dataset && (
              <div className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4">
                <p className="break-all font-mono text-xs">{dataset.source}</p>
                {source &&
                  !source.sources.some(
                    (entry) => entry.pointer === dataset.source,
                  ) && (
                    <p role="alert" className="text-rose-700">
                      {t("fixtures.error.missing-source", {
                        dataset: dataset.name,
                      })}
                    </p>
                  )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <label>
                    {t("fixtures.name")}
                    <input
                      className={inputClass}
                      value={dataset.name}
                      maxLength={64}
                      onChange={(event) => edit({ name: event.target.value })}
                    />
                  </label>
                  <label>
                    {t("fixtures.rows")}
                    <input
                      type="number"
                      min={1}
                      max={500}
                      className={inputClass}
                      value={dataset.count}
                      onChange={(event) =>
                        edit({ count: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    {t("fixtures.direction")}
                    <select
                      className={inputClass}
                      value={dataset.direction}
                      onChange={(event) =>
                        edit({
                          direction: event.target
                            .value as FixtureDataset["direction"],
                        })
                      }
                    >
                      {(["none", "request", "response"] as const).map(
                        (value) => (
                          <option key={value} value={value}>
                            {t(`fixtures.direction.${value}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-slate-600">
                  {t("fixtures.nameHelp")}
                </p>
                <h3 className="font-bold">{t("fixtures.rules")}</h3>
                <p className="text-xs text-slate-600">
                  {t("fixtures.rulesHelp")}
                </p>
                {dataset.rules.map((rule, index) => (
                  <fieldset
                    key={index}
                    className="space-y-3 rounded-lg bg-slate-50 p-3"
                  >
                    <legend className="px-1 text-xs font-bold">
                      {t("fixtures.rule", { index: String(index + 1) })}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label>
                        {t("fixtures.field")}
                        <select
                          className={inputClass}
                          value={rule.field}
                          onChange={(event) =>
                            editRule(index, {
                              ...rule,
                              field: event.target.value,
                            })
                          }
                        >
                          {![...fields].includes(rule.field) && (
                            <option value={rule.field}>{rule.field}</option>
                          )}
                          {fields.map((field) => (
                            <option key={field}>{field}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("fixtures.ruleType")}
                        <select
                          className={inputClass}
                          value={rule.kind}
                          onChange={(event) => {
                            const kind = event.target.value;
                            const parent = datasets.find(
                              (entry) => entry.id !== dataset.id,
                            );
                            editRule(
                              index,
                              kind === "constant"
                                ? { field: rule.field, kind, text: "null" }
                                : kind === "reference"
                                  ? {
                                      field: rule.field,
                                      kind,
                                      datasetId: parent?.id ?? "",
                                      sourceField:
                                        source && parent
                                          ? (fixtureFields(
                                              source.root,
                                              parent.source,
                                            )[0] ?? "")
                                          : "",
                                    }
                                  : {
                                      field: rule.field,
                                      kind: "sequence",
                                      start: 1,
                                      step: 1,
                                      asString: false,
                                      prefix: "",
                                    },
                            );
                          }}
                        >
                          {(["sequence", "constant", "reference"] as const).map(
                            (kind) => (
                              <option key={kind} value={kind}>
                                {t(`fixtures.kind.${kind}`)}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      {rule.kind === "sequence" && (
                        <>
                          <label>
                            {t("fixtures.start")}
                            <input
                              type="number"
                              step="any"
                              className={inputClass}
                              value={rule.start}
                              onChange={(event) =>
                                editRule(index, {
                                  ...rule,
                                  start: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            {t("fixtures.step")}
                            <input
                              type="number"
                              step="any"
                              className={inputClass}
                              value={rule.step}
                              onChange={(event) =>
                                editRule(index, {
                                  ...rule,
                                  step: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={rule.asString}
                              onChange={(event) =>
                                editRule(index, {
                                  ...rule,
                                  asString: event.target.checked,
                                })
                              }
                            />
                            {t("fixtures.asString")}
                          </label>
                          {rule.asString && (
                            <label>
                              {t("fixtures.prefix")}
                              <input
                                className={inputClass}
                                value={rule.prefix}
                                maxLength={80}
                                onChange={(event) =>
                                  editRule(index, {
                                    ...rule,
                                    prefix: event.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                        </>
                      )}
                      {rule.kind === "constant" && (
                        <label className="sm:col-span-2">
                          {t("fixtures.constant")}
                          <textarea
                            className={`${inputClass} min-h-24 font-mono`}
                            value={rule.text}
                            maxLength={MAX_FIXTURE_BYTES}
                            onChange={(event) =>
                              editRule(index, {
                                ...rule,
                                text: event.target.value,
                              })
                            }
                            spellCheck={false}
                          />
                        </label>
                      )}
                      {rule.kind === "reference" && (
                        <>
                          <label>
                            {t("fixtures.parent")}
                            <select
                              className={inputClass}
                              value={rule.datasetId}
                              onChange={(event) => {
                                const parent = datasets.find(
                                  (entry) => entry.id === event.target.value,
                                );
                                editRule(index, {
                                  ...rule,
                                  datasetId: event.target.value,
                                  sourceField:
                                    source && parent
                                      ? (fixtureFields(
                                          source.root,
                                          parent.source,
                                        )[0] ?? "")
                                      : "",
                                });
                              }}
                            >
                              <option value="">
                                {t("fixtures.chooseDataset")}
                              </option>
                              {!datasets.some(
                                (entry) => entry.id === rule.datasetId,
                              ) &&
                                rule.datasetId && (
                                  <option value={rule.datasetId}>
                                    {rule.datasetId}
                                  </option>
                                )}
                              {datasets
                                .filter((entry) => entry.id !== dataset.id)
                                .map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            {t("fixtures.parentField")}
                            <input
                              className={inputClass}
                              value={rule.sourceField}
                              maxLength={256}
                              onChange={(event) =>
                                editRule(index, {
                                  ...rule,
                                  sourceField: event.target.value,
                                })
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() =>
                        edit({
                          rules: dataset.rules.filter((_, at) => at !== index),
                        })
                      }
                    >
                      {t("fixtures.removeRule")}
                    </button>
                  </fieldset>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      dataset.rules.length >= 64 ||
                      !fields.some(
                        (field) =>
                          !dataset.rules.some((rule) => rule.field === field),
                      )
                    }
                    onClick={() => {
                      const field = fields.find(
                        (field) =>
                          !dataset.rules.some((rule) => rule.field === field),
                      );
                      if (field)
                        edit({
                          rules: [
                            ...dataset.rules,
                            {
                              field,
                              kind: "sequence",
                              start: 1,
                              step: 1,
                              asString: false,
                              prefix: "",
                            },
                          ],
                        });
                    }}
                  >
                    {t("fixtures.addRule")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      const next = datasets.filter(
                        (entry) => entry.id !== selected,
                      );
                      update(next);
                      setSelected(next[0]?.id ?? "");
                    }}
                  >
                    {t("fixtures.removeDataset")}
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!source || !datasets.length}
                onClick={() => void generate()}
              >
                {t("fixtures.generate")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={exportRecipe}
              >
                {t("fixtures.exportRecipe")}
              </button>
            </div>
            <p className="text-xs text-slate-600">{t("fixtures.limits")}</p>
            <details className="rounded-lg border border-[color:var(--color-brand-border)] p-3">
              <summary className="cursor-pointer font-bold">
                {t("fixtures.importExport")}
              </summary>
              <p className="mt-3 text-xs text-slate-600">
                {t("fixtures.recipeHelp")}
              </p>
              <label className="mt-3 block">
                {t("fixtures.recipeJson")}
                <textarea
                  className={`${inputClass} min-h-28 font-mono`}
                  value={importText}
                  maxLength={MAX_FIXTURE_BYTES}
                  onChange={(event) => setImportText(event.target.value)}
                  spellCheck={false}
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!importText.trim()}
                  onClick={() => {
                    clearFeedback();
                    try {
                      accept(importText);
                    } catch (error) {
                      fail(error);
                    }
                  }}
                >
                  {t("fixtures.importRecipe")}
                </button>
                <label className="text-xs">
                  {t("fixtures.importFile")}
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="mt-1 block max-w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void importFile(file);
                    }}
                  />
                </label>
              </div>
            </details>
          </fieldset>
          {result && output && (
            <section
              className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4"
              aria-label={t("fixtures.results")}
            >
              <h3 className="font-bold">{t("fixtures.results")}</h3>
              <p className="text-xs">
                {t("fixtures.resultSeed", { seed: result.seed })}
              </p>
              <ul className="space-y-1 text-xs">
                {result.datasets.map((entry) => (
                  <li key={entry.id}>
                    {t("fixtures.resultSummary", {
                      name: entry.name,
                      rows: String(entry.rows.length),
                      invalid: String(entry.invalidRows),
                      review: String(entry.reviewRows),
                    })}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-600">
                {t("fixtures.validationHelp")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  {t("fixtures.exportScope")}
                  <select
                    className={inputClass}
                    value={scope}
                    disabled={busy !== null}
                    onChange={(event) => {
                      clearFeedback();
                      setScope(event.target.value);
                      setPage(0);
                      if (!event.target.value) setFormat("json");
                    }}
                  >
                    <option value="">{t("fixtures.allDatasets")}</option>
                    {result.datasets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("fixtures.format")}
                  <select
                    className={inputClass}
                    value={format}
                    disabled={!scope || busy !== null}
                    onChange={(event) => {
                      clearFeedback();
                      setFormat(event.target.value as typeof format);
                    }}
                  >
                    <option value="json">JSON</option>
                    <option value="ndjson">NDJSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => void exportData(false)}
                  disabled={busy !== null}
                >
                  {t("fixtures.download")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => void exportData(true)}
                  disabled={busy !== null}
                >
                  {t("fixtures.copy")}
                </button>
              </div>
              <p className="text-xs">
                {t("fixtures.preview", {
                  name: output.name,
                  start: String(page * 10 + 1),
                  end: String(Math.min(output.rows.length, page * 10 + 10)),
                  total: String(output.rows.length),
                })}
              </p>
              <pre
                className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100"
                aria-label={t("fixtures.previewLabel")}
              >
                {preview}
              </pre>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  {t("fixtures.previous")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={(page + 1) * 10 >= output.rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  {t("fixtures.next")}
                </button>
              </div>
              {!!result.issueCount && (
                <details>
                  <summary className="cursor-pointer font-bold">
                    {t("fixtures.issues", { count: String(result.issueCount) })}
                  </summary>
                  <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-xs">
                    {result.issues.map((issue, index) => (
                      <li
                        key={index}
                        className={
                          issue.severity === "error"
                            ? "text-rose-700"
                            : "text-amber-800"
                        }
                      >
                        <span className="font-bold">
                          {t("fixtures.issueLocation", {
                            name:
                              result.datasets.find(
                                (entry) => entry.id === issue.datasetId,
                              )?.name ?? issue.datasetId,
                            row: String(issue.row + 1),
                          })}
                        </span>{" "}
                        <code className="break-all">{issue.path || "/"}</code>
                        {" — "}
                        {t(`fixtures.issue.${issue.code}`)}
                        {issue.keyword && (
                          <code className="ml-1">({issue.keyword})</code>
                        )}
                      </li>
                    ))}
                  </ul>
                  {result.truncated && (
                    <p className="mt-2 text-xs">
                      {t("fixtures.issuesLimited")}
                    </p>
                  )}
                </details>
              )}
            </section>
          )}
        </div>
      )}
    </details>
  );
});
