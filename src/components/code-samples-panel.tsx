"use client";

import { memo, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  createCodeSamplesMarkdown,
  createEndpointCodeSamples,
  DEFAULT_CODE_SAMPLE_FORMATS,
  getCodeSamplesFile,
  injectCodeSamples,
} from "@/lib/code-samples";
import type {
  EndpointSummary,
  SchemaFormat,
  SecuritySchemeSummary,
} from "@/lib/openapi";
import { serializeUpgradedDocument } from "@/lib/openapi-upgrade";
import {
  REQUEST_CODE_FORMATS,
  SNIPPET_LANGUAGES,
  type RequestCodeFormat,
} from "@/lib/request-snippets";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

type Scope = "all" | "visible";

type ActionStatus =
  | { key: TranslationKey; params?: Record<string, string>; tone: "error" }
  | { key: TranslationKey; params?: Record<string, string>; tone: "success" }
  | null;

const ALL_FORMATS: RequestCodeFormat[] = [
  "curl",
  "fetch",
  "http",
  ...SNIPPET_LANGUAGES,
];

function getEndpointKey(endpoint: EndpointSummary) {
  return `${endpoint.method.toUpperCase()} ${endpoint.path}`;
}

// Memoized because the workspace re-renders on every editor keystroke; the
// complete sample set is only generated when an export action runs.
export const CodeSamplesPanel = memo(function CodeSamplesPanel({
  allEndpoints,
  rootSchema,
  schemaFormat,
  schemaTitle,
  schemaVersion,
  securitySchemes,
  visibleEndpoints,
}: {
  allEndpoints: EndpointSummary[];
  rootSchema: Record<string, unknown>;
  schemaFormat: SchemaFormat;
  schemaTitle: string;
  schemaVersion: string;
  securitySchemes: SecuritySchemeSummary[];
  visibleEndpoints: EndpointSummary[];
}) {
  const { language, t } = useI18n();
  const [formats, setFormats] = useState<RequestCodeFormat[]>(
    DEFAULT_CODE_SAMPLE_FORMATS,
  );
  const [scope, setScope] = useState<Scope>("all");
  const [includeAuthPlaceholders, setIncludeAuthPlaceholders] = useState(true);
  const [previewKey, setPreviewKey] = useState("");
  const [previewFormat, setPreviewFormat] = useState<RequestCodeFormat | "">(
    "",
  );
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const endpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const orderedFormats = ALL_FORMATS.filter((format) =>
    formats.includes(format),
  );
  const previewEndpoint =
    endpoints.find((endpoint) => getEndpointKey(endpoint) === previewKey) ??
    endpoints[0];
  const activePreviewFormat =
    previewFormat && orderedFormats.includes(previewFormat)
      ? previewFormat
      : orderedFormats[0];
  const previewSample = useMemo(() => {
    if (!previewEndpoint || !activePreviewFormat) {
      return "";
    }

    return (
      createEndpointCodeSamples([previewEndpoint], securitySchemes, {
        formats: [activePreviewFormat],
        includeAuthPlaceholders,
      })[0]?.samples[0]?.source ?? ""
    );
  }, [
    activePreviewFormat,
    includeAuthPlaceholders,
    previewEndpoint,
    securitySchemes,
  ]);
  const canExport = endpoints.length > 0 && orderedFormats.length > 0;

  function buildSamples() {
    return createEndpointCodeSamples(endpoints, securitySchemes, {
      formats: orderedFormats,
      includeAuthPlaceholders,
    });
  }

  function toggleFormat(format: RequestCodeFormat) {
    setFormats((current) =>
      current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format],
    );
    setActionStatus(null);
  }

  async function copyText(text: string, successKey: TranslationKey) {
    const copied = await writeTextToClipboard(text);

    setActionStatus(
      copied
        ? { key: successKey, tone: "success" }
        : { key: "workspace.codeSamplesCopyError", tone: "error" },
    );
  }

  function handleDownloadMarkdown() {
    const file = getCodeSamplesFile(schemaTitle, "markdown", schemaFormat);
    const downloaded = downloadTextFile(
      createCodeSamplesMarkdown(
        buildSamples(),
        { title: schemaTitle, version: schemaVersion },
        language,
      ),
      file.fileName,
      file.contentType,
    );

    setActionStatus(
      downloaded
        ? { key: "workspace.codeSamplesMarkdownDownloaded", tone: "success" }
        : { key: "workspace.codeSamplesDownloadError", tone: "error" },
    );
  }

  function handleDownloadSpec() {
    const { document, operationCount } = injectCodeSamples(
      rootSchema,
      buildSamples(),
    );
    const file = getCodeSamplesFile(schemaTitle, "spec", schemaFormat);
    const downloaded = downloadTextFile(
      serializeUpgradedDocument(document, schemaFormat),
      file.fileName,
      file.contentType,
    );

    setActionStatus(
      downloaded
        ? {
            key: "workspace.codeSamplesSpecDownloaded",
            params: { count: String(operationCount) },
            tone: "success",
          }
        : { key: "workspace.codeSamplesDownloadError", tone: "error" },
    );
  }

  return (
    <section
      aria-labelledby="code-samples-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="code-samples-title"
            >
              {t("workspace.codeSamplesTitle")}
            </h3>
            <span className="rounded-md bg-[color:var(--color-brand-soft)] px-2.5 py-1 text-xs font-extrabold text-[color:var(--color-brand-purple)]">
              {t("workspace.codeSamplesSummary", {
                endpoints: String(endpoints.length),
                languages: String(orderedFormats.length),
                samples: String(endpoints.length * orderedFormats.length),
              })}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-[color:var(--color-brand-muted)]">
            {t("workspace.codeSamplesDescription")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] px-3 py-2">
        <p className="min-w-0 text-xs font-semibold text-[color:var(--color-brand-muted)]">
          <span className="font-extrabold text-[color:var(--color-brand-navy)]">
            {t("workspace.codeSamplesLanguagesLabel")}:
          </span>{" "}
          {orderedFormats.length > 0
            ? orderedFormats
                .map((format) => REQUEST_CODE_FORMATS[format].label)
                .join(", ")
            : t("workspace.codeSamplesNoLanguages")}
        </p>
        <button
          aria-expanded={isCustomizing}
          className="h-8 rounded-md border border-[color:var(--color-brand-purple)] bg-white px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
          type="button"
          onClick={() => setIsCustomizing((current) => !current)}
        >
          {t(
            isCustomizing
              ? "workspace.codeSamplesHideOptions"
              : "workspace.codeSamplesShowOptions",
          )}
        </button>
      </div>

      {/* Options and the live preview render on demand: the workspace mounts
          every tool at once, and this section holds dozens of controls. */}
      {isCustomizing ? (
        <>
          <div className="mt-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className="text-xs font-extrabold uppercase text-[color:var(--color-brand-purple)]"
                id="code-samples-languages-label"
              >
                {t("workspace.codeSamplesLanguagesLabel")}
              </p>
              <div className="flex gap-2">
                <button
                  className="text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
                  type="button"
                  onClick={() => {
                    setFormats(ALL_FORMATS);
                    setActionStatus(null);
                  }}
                >
                  {t("workspace.codeSamplesSelectAll")}
                </button>
                <button
                  className="text-xs font-extrabold text-[color:var(--color-brand-muted)] hover:underline"
                  type="button"
                  onClick={() => {
                    setFormats([]);
                    setActionStatus(null);
                  }}
                >
                  {t("workspace.codeSamplesSelectNone")}
                </button>
              </div>
            </div>
            <div
              aria-labelledby="code-samples-languages-label"
              className="mt-2 flex flex-wrap gap-1.5"
              role="group"
            >
              {ALL_FORMATS.map((format) => {
                const isSelected = formats.includes(format);

                return (
                  <button
                    aria-pressed={isSelected}
                    className={`h-8 rounded-lg border px-2.5 text-xs font-bold transition ${
                      isSelected
                        ? "border-[color:var(--color-brand-purple)] bg-[color:var(--color-brand-purple)] text-white"
                        : "border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                    }`}
                    key={format}
                    type="button"
                    onClick={() => toggleFormat(format)}
                  >
                    {REQUEST_CODE_FORMATS[format].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="grid min-w-[12rem] gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
              {t("workspace.codeSamplesScopeLabel")}
              <select
                className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as Scope);
                  setActionStatus(null);
                }}
              >
                <option value="all">
                  {t("workspace.codeSamplesScopeAll", {
                    count: String(allEndpoints.length),
                  })}
                </option>
                <option value="visible">
                  {t("workspace.codeSamplesScopeVisible", {
                    count: String(visibleEndpoints.length),
                  })}
                </option>
              </select>
            </label>
            <div className="min-w-0 flex-1">
              <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
                <input
                  checked={includeAuthPlaceholders}
                  className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                  type="checkbox"
                  onChange={(event) =>
                    setIncludeAuthPlaceholders(event.target.checked)
                  }
                />
                {t("workspace.codeSamplesAuth")}
              </label>
              <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                {t("workspace.codeSamplesAuthHint")}
              </p>
            </div>
          </div>

          {orderedFormats.length === 0 ? (
            <p
              className="mt-4 text-sm font-semibold text-amber-800"
              role="status"
            >
              {t("workspace.codeSamplesNoLanguages")}
            </p>
          ) : !previewEndpoint ? (
            <p
              className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
              role="status"
            >
              {t("workspace.codeSamplesNoEndpoints")}
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--color-brand-border)]">
              <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--color-brand-border)] bg-[#fbfaff] px-3 py-2">
                <label className="flex min-w-0 items-center gap-2 text-xs font-bold text-[color:var(--color-brand-muted)]">
                  {t("workspace.codeSamplesPreviewEndpoint")}
                  <select
                    className="h-8 min-w-0 max-w-[16rem] rounded-md border border-[color:var(--color-brand-border)] bg-white px-2 font-mono text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                    value={getEndpointKey(previewEndpoint)}
                    onChange={(event) => setPreviewKey(event.target.value)}
                  >
                    {endpoints.map((endpoint) => (
                      <option
                        key={getEndpointKey(endpoint)}
                        value={getEndpointKey(endpoint)}
                      >
                        {getEndpointKey(endpoint)}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  aria-label={t("workspace.codeSamplesPreviewLanguages")}
                  className="flex flex-wrap gap-1"
                  role="group"
                >
                  {orderedFormats.map((format) => (
                    <button
                      aria-pressed={format === activePreviewFormat}
                      className={`h-7 rounded-md px-2 text-[11px] font-extrabold transition ${
                        format === activePreviewFormat
                          ? "bg-[color:var(--color-brand-navy)] text-white"
                          : "text-[color:var(--color-brand-muted)] hover:bg-[color:var(--color-brand-soft)] hover:text-[color:var(--color-brand-purple)]"
                      }`}
                      key={format}
                      type="button"
                      onClick={() => setPreviewFormat(format)}
                    >
                      {REQUEST_CODE_FORMATS[format].label}
                    </button>
                  ))}
                </div>
                <button
                  className="ml-auto h-8 rounded-md border border-[color:var(--color-brand-border)] bg-white px-2.5 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                  type="button"
                  onClick={() =>
                    copyText(previewSample, "workspace.codeSamplesSampleCopied")
                  }
                >
                  {t("workspace.codeSamplesCopySample")}
                </button>
              </div>
              <pre
                aria-label={t("workspace.codeSamplesPreviewAriaLabel", {
                  language: REQUEST_CODE_FORMATS[activePreviewFormat].label,
                  method: previewEndpoint.method.toUpperCase(),
                  path: previewEndpoint.path,
                })}
                className="max-h-80 overflow-auto bg-white p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]"
              >
                {previewSample}
              </pre>
            </div>
          )}
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canExport}
          type="button"
          onClick={() =>
            copyText(
              createCodeSamplesMarkdown(
                buildSamples(),
                { title: schemaTitle, version: schemaVersion },
                language,
              ),
              "workspace.codeSamplesMarkdownCopied",
            )
          }
        >
          {t("workspace.codeSamplesCopyMarkdown")}
        </button>
        <button
          className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canExport}
          type="button"
          onClick={handleDownloadMarkdown}
        >
          {t("workspace.codeSamplesDownloadMarkdown")}
        </button>
        <button
          className="h-9 rounded-md bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-3 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(90,45,255,0.2)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canExport}
          type="button"
          onClick={handleDownloadSpec}
        >
          {t("workspace.codeSamplesDownloadSpec")}
        </button>
      </div>

      {actionStatus ? (
        <p
          className={`mt-2 text-sm font-semibold ${
            actionStatus.tone === "error" ? "text-red-700" : "text-emerald-700"
          }`}
          role={actionStatus.tone === "error" ? "alert" : "status"}
        >
          {t(actionStatus.key, actionStatus.params)}
        </p>
      ) : null}
    </section>
  );
});
