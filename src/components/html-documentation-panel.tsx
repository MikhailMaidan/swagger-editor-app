"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { createHtmlDocumentation } from "@/lib/html-documentation";
import {
  downloadHtmlDocumentationFile,
  previewHtmlDocumentation,
} from "@/lib/html-documentation-export";
import type { EndpointSummary, SecuritySchemeSummary } from "@/lib/openapi";
import type { SchemaModel } from "@/lib/schema-models";
import type { TranslationKey } from "@/lib/translations";

type DocumentationScope = "all" | "visible";
type ActionStatus =
  | "download-error"
  | "download-success"
  | "idle"
  | "preview-error"
  | "preview-success";

export function HtmlDocumentationPanel({
  allEndpoints,
  models,
  schema,
  securitySchemes,
  visibleEndpoints,
}: {
  allEndpoints: EndpointSummary[];
  models: SchemaModel[];
  schema: { serverUrl: string; title: string; version: string };
  securitySchemes: SecuritySchemeSummary[];
  visibleEndpoints: EndpointSummary[];
}) {
  const { language, t } = useI18n();
  const {
    serverUrl: schemaServerUrl,
    title: schemaTitle,
    version: schemaVersion,
  } = schema;
  const [scope, setScope] = useState<DocumentationScope>("all");
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [includeExamples, setIncludeExamples] = useState(true);
  const [includeModels, setIncludeModels] = useState(true);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const selectedEndpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const build = useMemo(
    () =>
      createHtmlDocumentation(
        selectedEndpoints,
        models,
        securitySchemes,
        {
          serverUrl: schemaServerUrl,
          title: schemaTitle,
          version: schemaVersion,
        },
        {
          includeDeprecated,
          includeExamples,
          includeModels,
          language,
        },
      ),
    [
      includeDeprecated,
      includeExamples,
      includeModels,
      language,
      models,
      schemaServerUrl,
      schemaTitle,
      schemaVersion,
      securitySchemes,
      selectedEndpoints,
    ],
  );
  const hasEndpoints = build.summary.endpointCount > 0;

  function updateScope(nextScope: DocumentationScope) {
    setScope(nextScope);
    setActionStatus("idle");
  }

  function updateOption(setter: (value: boolean) => void, value: boolean) {
    setter(value);
    setActionStatus("idle");
  }

  function handlePreview() {
    if (!hasEndpoints) return;
    setActionStatus(
      previewHtmlDocumentation(build) ? "preview-success" : "preview-error",
    );
  }

  function handleDownload() {
    if (!hasEndpoints) return;
    setActionStatus(
      downloadHtmlDocumentationFile(build, { title: schemaTitle })
        ? "download-success"
        : "download-error",
    );
  }

  function getFeedbackKey(status: Exclude<ActionStatus, "idle">) {
    const keys: Record<Exclude<ActionStatus, "idle">, TranslationKey> = {
      "download-error": "workspace.docsDownloadError",
      "download-success": "workspace.docsDownloadSuccess",
      "preview-error": "workspace.docsPreviewError",
      "preview-success": "workspace.docsPreviewSuccess",
    };

    return keys[status];
  }

  const statistics: Array<[TranslationKey, number]> = [
    ["workspace.docsStatEndpoints", build.summary.endpointCount],
    ["workspace.docsStatMethods", build.summary.methodCount],
    ["workspace.docsStatModels", build.summary.modelCount],
    ["workspace.docsStatSecurity", build.summary.securitySchemeCount],
  ];

  return (
    <section
      aria-labelledby="html-documentation-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="html-documentation-title"
            >
              {t("workspace.docsTitle")}
            </h3>
            <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-800">
              {t("workspace.docsBadge")}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.docsSummary", {
              count: String(build.summary.endpointCount),
            })}
          </p>
        </div>
        <div
          aria-label={t("workspace.docsScopeLabel")}
          className="flex max-w-full gap-2 overflow-x-auto pb-1"
          role="group"
        >
          <button
            aria-pressed={scope === "all"}
            className={`h-9 shrink-0 rounded-md px-3 text-xs font-extrabold transition ${
              scope === "all"
                ? "bg-[color:var(--color-brand-navy)] text-white"
                : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            }`}
            type="button"
            onClick={() => updateScope("all")}
          >
            {t("workspace.docsScopeAll", {
              count: String(allEndpoints.length),
            })}
          </button>
          <button
            aria-pressed={scope === "visible"}
            className={`h-9 shrink-0 rounded-md px-3 text-xs font-extrabold transition ${
              scope === "visible"
                ? "bg-[color:var(--color-brand-navy)] text-white"
                : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            }`}
            type="button"
            onClick={() => updateScope("visible")}
          >
            {t("workspace.docsScopeVisible", {
              count: String(visibleEndpoints.length),
            })}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {statistics.map(([label, value]) => (
          <div className="min-w-0 bg-white p-3" key={label}>
            <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
              {t(label)}
            </p>
            <p className="mt-1 text-xl font-extrabold text-[color:var(--color-brand-navy)]">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
            {t("workspace.docsOptionsTitle")}
          </h4>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
              <input
                checked={includeDeprecated}
                className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                type="checkbox"
                onChange={(event) =>
                  updateOption(setIncludeDeprecated, event.target.checked)
                }
              />
              {t("workspace.docsIncludeDeprecated")}
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
              <input
                checked={includeExamples}
                className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                type="checkbox"
                onChange={(event) =>
                  updateOption(setIncludeExamples, event.target.checked)
                }
              />
              {t("workspace.docsIncludeExamples")}
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
              <input
                checked={includeModels}
                className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                type="checkbox"
                onChange={(event) =>
                  updateOption(setIncludeModels, event.target.checked)
                }
              />
              {t("workspace.docsIncludeModels")}
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasEndpoints}
            type="button"
            onClick={handlePreview}
          >
            {t("workspace.docsPreview")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasEndpoints}
            type="button"
            onClick={handleDownload}
          >
            {t("workspace.docsDownload")}
          </button>
        </div>
      </div>

      {build.summary.deprecatedExcludedCount > 0 ? (
        <p className="mt-3 text-xs font-semibold text-[color:var(--color-brand-muted)]">
          {t("workspace.docsDeprecatedExcluded", {
            count: String(build.summary.deprecatedExcludedCount),
          })}
        </p>
      ) : null}

      {!hasEndpoints ? (
        <p
          className="mt-3 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.docsNoEndpoints")}
        </p>
      ) : actionStatus !== "idle" ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            actionStatus.endsWith("error") ? "text-red-700" : "text-emerald-700"
          }`}
          role={actionStatus.endsWith("error") ? "alert" : "status"}
        >
          {t(getFeedbackKey(actionStatus))}
        </p>
      ) : null}
    </section>
  );
}
