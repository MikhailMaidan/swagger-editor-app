"use client";

import { memo, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import type { EndpointSummary } from "@/lib/openapi";
import type { SchemaModel } from "@/lib/schema-models";
import { createTypeScriptClient } from "@/lib/typescript-client";
import { downloadTypeScriptClientFile } from "@/lib/typescript-client-export";
import type { TranslationKey } from "@/lib/translations";

type ClientScope = "all" | "visible";
type ActionStatus =
  "copy-error" | "copy-success" | "export-error" | "export-success" | "idle";

const OPERATION_PREVIEW_LIMIT = 8;

const methodClasses: Record<string, string> = {
  DELETE: "bg-red-100 text-red-700",
  GET: "bg-emerald-100 text-emerald-800",
  HEAD: "bg-teal-100 text-teal-800",
  OPTIONS: "bg-slate-100 text-slate-700",
  PATCH: "bg-amber-100 text-amber-800",
  POST: "bg-sky-100 text-sky-800",
  PUT: "bg-violet-100 text-violet-800",
  TRACE: "bg-pink-100 text-pink-800",
};

export const TypeScriptClientPanel = memo(function TypeScriptClientPanel({
  allEndpoints,
  models,
  rootSchema,
  schema,
  visibleEndpoints,
}: {
  allEndpoints: EndpointSummary[];
  models: SchemaModel[];
  rootSchema: Record<string, unknown>;
  schema: { serverUrl: string; title: string; version: string };
  visibleEndpoints: EndpointSummary[];
}) {
  const { t } = useI18n();
  const {
    serverUrl: schemaServerUrl,
    title: schemaTitle,
    version: schemaVersion,
  } = schema;
  const [scope, setScope] = useState<ClientScope>("all");
  const [clientName, setClientName] = useState("");
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [includeDocumentation, setIncludeDocumentation] = useState(true);
  const [includeUnusedModels, setIncludeUnusedModels] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const selectedEndpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const build = useMemo(
    () =>
      createTypeScriptClient(
        selectedEndpoints,
        models,
        rootSchema,
        {
          serverUrl: schemaServerUrl,
          title: schemaTitle,
          version: schemaVersion,
        },
        {
          clientName,
          includeDeprecated,
          includeDocumentation,
          includeUnusedModels,
        },
      ),
    [
      clientName,
      includeDeprecated,
      includeDocumentation,
      includeUnusedModels,
      models,
      rootSchema,
      schemaServerUrl,
      schemaTitle,
      schemaVersion,
      selectedEndpoints,
    ],
  );
  const visibleOperations = showAll
    ? build.operations
    : build.operations.slice(0, OPERATION_PREVIEW_LIMIT);
  const hasOperations = build.summary.operationCount > 0;

  function resetPreview() {
    setActionStatus("idle");
    setShowAll(false);
  }

  async function handleCopy() {
    if (!hasOperations) {
      return;
    }

    const copied = await writeTextToClipboard(build.source);

    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  function handleExport() {
    if (!hasOperations) {
      return;
    }

    const downloaded = downloadTypeScriptClientFile(build, schema);

    setActionStatus(downloaded ? "export-success" : "export-error");
  }

  return (
    <section
      aria-labelledby="typescript-client-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="typescript-client-title"
            >
              {t("workspace.sdkTitle")}
            </h3>
            <span className="rounded-md bg-cyan-100 px-3 py-1 text-sm font-extrabold text-cyan-800">
              {t("workspace.sdkBadge")}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.sdkSummary", {
              models: String(build.summary.modelCount),
              operations: String(build.summary.operationCount),
            })}
          </p>
        </div>
        <div
          aria-label={t("workspace.sdkScopeLabel")}
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
            onClick={() => {
              setScope("all");
              resetPreview();
            }}
          >
            {t("workspace.sdkScopeAll", {
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
            onClick={() => {
              setScope("visible");
              resetPreview();
            }}
          >
            {t("workspace.sdkScopeVisible", {
              count: String(visibleEndpoints.length),
            })}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {[
          ["workspace.sdkStatMethods", build.summary.operationCount],
          ["workspace.sdkStatModels", build.summary.modelCount],
          ["workspace.sdkStatGeneratedNames", build.summary.generatedNameCount],
          [
            "workspace.sdkStatExcludedDeprecated",
            build.summary.excludedDeprecatedCount,
          ],
        ].map(([label, value]) => (
          <div className="min-w-0 bg-white p-3" key={label}>
            <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
              {t(label as TranslationKey)}
            </p>
            <p className="mt-1 text-xl font-extrabold text-[color:var(--color-brand-navy)]">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="min-w-0 text-xs font-bold text-[color:var(--color-brand-muted)]">
          <span>{t("workspace.sdkClientName")}</span>
          <input
            className="mt-1 h-10 w-full min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            placeholder={build.clientName}
            value={clientName}
            onChange={(event) => {
              setClientName(event.target.value);
              resetPreview();
            }}
          />
        </label>
        <p className="min-w-0 rounded bg-[#f4f3f8] px-3 py-2 font-mono text-xs font-bold text-[color:var(--color-brand-navy)]">
          {t("workspace.sdkGeneratedFactory", { name: build.clientName })}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
        <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
          <input
            checked={includeDeprecated}
            className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
            type="checkbox"
            onChange={(event) => {
              setIncludeDeprecated(event.target.checked);
              resetPreview();
            }}
          />
          {t("workspace.sdkIncludeDeprecated")}
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
          <input
            checked={includeDocumentation}
            className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
            type="checkbox"
            onChange={(event) => {
              setIncludeDocumentation(event.target.checked);
              resetPreview();
            }}
          />
          {t("workspace.sdkIncludeDocumentation")}
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
          <input
            checked={includeUnusedModels}
            className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
            type="checkbox"
            onChange={(event) => {
              setIncludeUnusedModels(event.target.checked);
              resetPreview();
            }}
          />
          {t("workspace.sdkIncludeUnusedModels")}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-brand-border)] pt-4">
        <h4 className="text-base font-extrabold text-[color:var(--color-brand-navy)]">
          {t("workspace.sdkOperationsTitle")}
        </h4>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasOperations}
            type="button"
            onClick={handleCopy}
          >
            {t("workspace.sdkCopy")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasOperations}
            type="button"
            onClick={handleExport}
          >
            {t("workspace.sdkExport")}
          </button>
        </div>
      </div>

      {actionStatus !== "idle" ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            actionStatus.endsWith("error") ? "text-red-700" : "text-emerald-700"
          }`}
          role={actionStatus.endsWith("error") ? "alert" : "status"}
        >
          {t(
            actionStatus === "copy-error"
              ? "workspace.sdkCopyError"
              : actionStatus === "copy-success"
                ? "workspace.sdkCopySuccess"
                : actionStatus === "export-error"
                  ? "workspace.sdkExportError"
                  : "workspace.sdkExportSuccess",
          )}
        </p>
      ) : null}

      {!hasOperations ? (
        <p
          className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.sdkNoEndpoints")}
        </p>
      ) : (
        <>
          <ol className="mt-2 divide-y divide-[color:var(--color-brand-border)]">
            {visibleOperations.map((operation) => (
              <li
                className="grid min-w-0 gap-2 py-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-center"
                key={`${operation.method}-${operation.path}-${operation.name}`}
              >
                <span
                  className={`w-fit rounded px-2 py-1 font-mono text-xs font-extrabold ${
                    methodClasses[operation.method] ??
                    "bg-slate-100 text-slate-700"
                  }`}
                >
                  {operation.method}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="break-all text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                      {operation.name}()
                    </code>
                    {operation.generatedName ? (
                      <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                        {t("workspace.sdkGeneratedName")}
                      </span>
                    ) : null}
                    {operation.deprecated ? (
                      <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                        {t("workspace.sdkDeprecated")}
                      </span>
                    ) : null}
                  </div>
                  <code className="mt-1 block break-all text-xs font-semibold text-[color:var(--color-brand-muted)]">
                    {t("workspace.sdkEndpoint", { path: operation.path })}
                  </code>
                </div>
                <p className="min-w-0 break-all font-mono text-xs font-semibold text-[color:var(--color-brand-muted)] lg:text-right">
                  {t("workspace.sdkReturns", {
                    type: operation.responseType,
                  })}
                </p>
              </li>
            ))}
          </ol>
          {build.operations.length > OPERATION_PREVIEW_LIMIT ? (
            <button
              className="mt-3 h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {t(showAll ? "workspace.sdkShowLess" : "workspace.sdkShowAll", {
                count: String(build.operations.length),
              })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
});
