"use client";

import { memo, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { truncateJsonPreview } from "@/lib/response-data-explorer";
import {
  exportInferredSchema,
  inferResponseSchema,
  parseSchemaSample,
  schemaSampleLimit,
  validComponentName,
  MAX_SCHEMA_SAMPLES,
  type SchemaSample,
  type SchemaSampleIssue,
  type SchemaInferenceFormat,
} from "@/lib/response-schema";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const PAGE_SIZE = 25;

export const ResponseSchemaPanel = memo(function ResponseSchemaPanel({
  body,
}: {
  body: string | null;
}) {
  const { t } = useI18n();
  const id = useId();
  const nextId = useRef(0);
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [samples, setSamples] = useState<(SchemaSample & { id: number })[]>([]);
  const [paste, setPaste] = useState("");
  const [issue, setIssue] = useState<SchemaSampleIssue | null>(null);
  const [name, setName] = useState("ResponseModel");
  const [format, setFormat] = useState<SchemaInferenceFormat>("json");
  const [requireObserved, setRequireObserved] = useState(true);
  const [allowAdditional, setAllowAdditional] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const inference = useMemo(
    () =>
      samples.length
        ? inferResponseSchema(samples, { requireObserved, allowAdditional })
        : null,
    [samples, requireObserved, allowAdditional],
  );
  const output = useMemo(
    () =>
      inference && validComponentName(name)
        ? exportInferredSchema(inference, name, format)
        : null,
    [inference, name, format],
  );
  const fields = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (
      inference?.fields.filter((field) => {
        const text = `${field.path} ${field.types.join(" ")}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      }) ?? []
    );
  }, [inference, query]);
  const activePage = Math.min(
    page,
    Math.max(0, Math.ceil(fields.length / PAGE_SIZE) - 1),
  );

  function invalidate() {
    generation.current += 1;
    setFeedback(null);
  }
  function addSample(text: string, clearPaste = false) {
    invalidate();
    if (samples.length >= MAX_SCHEMA_SAMPLES) {
      setIssue("sample-limit");
      return;
    }
    const parsed = parseSchemaSample(text);
    if (!parsed.ok) {
      setIssue(parsed.issue);
      return;
    }
    const limit = schemaSampleLimit([...samples, parsed.sample]);
    if (limit) {
      setIssue(limit);
      return;
    }
    setSamples([...samples, { ...parsed.sample, id: ++nextId.current }]);
    setIssue(null);
    setPage(0);
    if (clearPaste) setPaste("");
  }
  async function copy() {
    if (!output) return;
    const token = ++generation.current;
    const success = await writeTextToClipboard(output.content);
    if (token !== generation.current) return;
    setFeedback({
      key: success ? "inference.copied" : "inference.copyFailed",
      error: !success,
    });
  }
  function download() {
    if (!output) return;
    invalidate();
    const success = downloadTextFile(
      output.content,
      output.fileName,
      output.contentType,
    );
    setFeedback({
      key: success ? "inference.downloaded" : "inference.downloadFailed",
      error: !success,
    });
  }

  return (
    <details
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) invalidate();
      }}
      className="mt-4 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("inference.title")}
      </summary>
      {open ? (
        <section aria-labelledby={id} className="mt-3 space-y-3">
          <h4 id={id} className="text-sm font-bold">
            {t("inference.heading")}
          </h4>
          <p className="text-xs text-[color:var(--color-brand-muted)]">
            {t("inference.description")}
          </p>
          <p className="text-xs text-[color:var(--color-brand-muted)]">
            {t("inference.limits")}
          </p>
          <button
            type="button"
            className={buttonClass}
            disabled={body === null || samples.length >= MAX_SCHEMA_SAMPLES}
            onClick={() => {
              if (body !== null) addSample(body);
            }}
          >
            {t("inference.capture")}
          </button>
          <label className="block text-xs font-bold">
            {t("inference.paste")}
            <textarea
              className={`${inputClass} font-mono`}
              rows={4}
              value={paste}
              spellCheck={false}
              onChange={(event) => {
                setPaste(event.target.value);
                setIssue(null);
              }}
            />
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={!paste.trim() || samples.length >= MAX_SCHEMA_SAMPLES}
            onClick={() => addSample(paste, true)}
          >
            {t("inference.add")}
          </button>
          {issue ? (
            <p role="alert" className="text-xs">
              {t(`inference.${issue}`)}
            </p>
          ) : null}
          <p className="text-xs font-bold">
            {t("inference.samples", { count: String(samples.length) })}
          </p>
          {samples.length ? (
            <>
              <ul aria-label={t("inference.sampleList")} className="space-y-1">
                {samples.map((sample) => (
                  <li
                    key={sample.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span>
                      {t("inference.sample", {
                        number: String(sample.id),
                        bytes: String(sample.bytes),
                      })}
                    </span>
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={t("inference.remove", {
                        number: String(sample.id),
                      })}
                      onClick={() => {
                        invalidate();
                        setSamples(
                          samples.filter((entry) => entry.id !== sample.id),
                        );
                        setIssue(null);
                        setPage(0);
                      }}
                    >
                      {t("inference.removeLabel")}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  invalidate();
                  setSamples([]);
                  setIssue(null);
                  setPage(0);
                }}
              >
                {t("inference.clear")}
              </button>
            </>
          ) : (
            <p className="text-xs">{t("inference.empty")}</p>
          )}
          {inference ? (
            <>
              <p className="text-xs text-[color:var(--color-brand-muted)]">
                {t("inference.review")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  {t("inference.name")}
                  <input
                    className={inputClass}
                    value={name}
                    maxLength={80}
                    aria-invalid={!validComponentName(name)}
                    onChange={(event) => {
                      invalidate();
                      setName(event.target.value);
                    }}
                  />
                </label>
                <label className="text-xs font-bold">
                  {t("inference.format")}
                  <select
                    className={inputClass}
                    value={format}
                    onChange={(event) => {
                      invalidate();
                      setFormat(event.target.value as SchemaInferenceFormat);
                    }}
                  >
                    <option value="json">{t("inference.json")}</option>
                    <option value="openapi-yaml">{t("inference.yaml")}</option>
                  </select>
                </label>
              </div>
              {!validComponentName(name) ? (
                <p role="alert" className="text-xs">
                  {t("inference.invalidName")}
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={requireObserved}
                  onChange={(event) => {
                    invalidate();
                    setRequireObserved(event.target.checked);
                  }}
                />
                {t("inference.required")}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={allowAdditional}
                  onChange={(event) => {
                    invalidate();
                    setAllowAdditional(event.target.checked);
                  }}
                />
                {t("inference.additional")}
              </label>
              <p className="text-xs">
                {t("inference.fields", {
                  count: String(inference.fields.length),
                  optional: String(
                    inference.fields.filter((field) => !field.required).length,
                  ),
                })}
              </p>
              <label className="block text-xs font-bold">
                {t("inference.search")}
                <input
                  type="search"
                  className={inputClass}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              {fields.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">
                        {t("inference.fieldTable")}
                      </caption>
                      <thead>
                        <tr>
                          {["path", "types", "observed", "presence"].map(
                            (key) => (
                              <th key={key} className="p-2">
                                {t(`inference.${key}` as TranslationKey)}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {fields
                          .slice(
                            activePage * PAGE_SIZE,
                            (activePage + 1) * PAGE_SIZE,
                          )
                          .map((field) => (
                            <tr key={field.path}>
                              <td className="break-all p-2 font-mono">
                                {field.path}
                              </td>
                              <td className="p-2">{field.types.join(" | ")}</td>
                              <td className="p-2">
                                {field.present}/{field.objects}
                              </td>
                              <td className="p-2">
                                {t(
                                  field.required
                                    ? "inference.requiredLabel"
                                    : "inference.optionalLabel",
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {fields.length > PAGE_SIZE ? (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={activePage === 0}
                        onClick={() => setPage(activePage - 1)}
                      >
                        {t("inference.previous")}
                      </button>
                      <span>
                        {t("inference.page", {
                          current: String(activePage + 1),
                          total: String(Math.ceil(fields.length / PAGE_SIZE)),
                        })}
                      </span>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={(activePage + 1) * PAGE_SIZE >= fields.length}
                        onClick={() => setPage(activePage + 1)}
                      >
                        {t("inference.next")}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs">{t("inference.noFields")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!output}
                  onClick={() => void copy()}
                >
                  {t("inference.copy")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!output}
                  onClick={download}
                >
                  {t("inference.download")}
                </button>
              </div>
              {feedback ? (
                <p
                  role={feedback.error ? "alert" : "status"}
                  className="text-xs"
                >
                  {t(feedback.key)}
                </p>
              ) : null}
              {output ? (
                <>
                  <pre
                    aria-label={t("inference.preview")}
                    className="max-h-96 overflow-auto rounded-lg bg-white p-3 text-xs"
                  >
                    {truncateJsonPreview(output.content, 12000)}
                  </pre>
                  {output.content.length > 12000 ? (
                    <p className="text-xs">{t("inference.shortened")}</p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </details>
  );
});
