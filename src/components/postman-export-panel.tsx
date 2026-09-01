"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { EndpointSummary, SecuritySchemeSummary } from "@/lib/openapi";
import { createPostmanCollection } from "@/lib/postman-collection";
import {
  downloadPostmanCollectionFile,
  downloadPostmanEnvironmentFile,
} from "@/lib/postman-export";

type ExportScope = "all" | "visible";

type ActionStatus =
  | "collection-error"
  | "collection-success"
  | "environment-error"
  | "environment-success"
  | "idle";

export function PostmanExportPanel({
  allEndpoints,
  schema,
  securitySchemes,
  visibleEndpoints,
}: {
  allEndpoints: EndpointSummary[];
  schema: { serverUrl: string; title: string; version: string };
  securitySchemes: SecuritySchemeSummary[];
  visibleEndpoints: EndpointSummary[];
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<ExportScope>("all");
  const [groupByTags, setGroupByTags] = useState(true);
  const [includeResponseExamples, setIncludeResponseExamples] = useState(true);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const selectedEndpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const build = useMemo(
    () =>
      createPostmanCollection(selectedEndpoints, securitySchemes, schema, {
        groupByTags,
        includeResponseExamples,
      }),
    [
      groupByTags,
      includeResponseExamples,
      schema,
      securitySchemes,
      selectedEndpoints,
    ],
  );
  const hasRequests = build.summary.requestCount > 0;

  function handleScopeChange(nextScope: ExportScope) {
    setScope(nextScope);
    setActionStatus("idle");
  }

  function handleGroupByTagsChange(checked: boolean) {
    setGroupByTags(checked);
    setActionStatus("idle");
  }

  function handleResponseExamplesChange(checked: boolean) {
    setIncludeResponseExamples(checked);
    setActionStatus("idle");
  }

  function handleCollectionExport() {
    if (!hasRequests) {
      return;
    }

    const downloaded = downloadPostmanCollectionFile(build, schema);

    setActionStatus(downloaded ? "collection-success" : "collection-error");
  }

  function handleEnvironmentExport() {
    if (!hasRequests) {
      return;
    }

    const downloaded = downloadPostmanEnvironmentFile(build, schema);

    setActionStatus(downloaded ? "environment-success" : "environment-error");
  }

  return (
    <section
      aria-labelledby="postman-export-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3
            className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
            id="postman-export-title"
          >
            {t("workspace.postmanTitle")}
          </h3>
          <span className="rounded-md bg-orange-100 px-3 py-1 text-sm font-extrabold text-orange-800">
            {t("workspace.postmanVersion")}
          </span>
        </div>
        <div
          aria-label={t("workspace.postmanScopeLabel")}
          className="flex flex-wrap gap-2"
          role="group"
        >
          <button
            aria-pressed={scope === "all"}
            className={`h-9 rounded-md px-3 text-xs font-extrabold transition ${
              scope === "all"
                ? "bg-[color:var(--color-brand-navy)] text-white"
                : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            }`}
            type="button"
            onClick={() => handleScopeChange("all")}
          >
            {t("workspace.postmanScopeAll", {
              count: String(allEndpoints.length),
            })}
          </button>
          <button
            aria-pressed={scope === "visible"}
            className={`h-9 rounded-md px-3 text-xs font-extrabold transition ${
              scope === "visible"
                ? "bg-[color:var(--color-brand-navy)] text-white"
                : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            }`}
            type="button"
            onClick={() => handleScopeChange("visible")}
          >
            {t("workspace.postmanScopeVisible", {
              count: String(visibleEndpoints.length),
            })}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {[
          ["workspace.postmanStatRequests", build.summary.requestCount],
          ["workspace.postmanStatFolders", build.summary.folderCount],
          [
            "workspace.postmanStatResponses",
            build.summary.responseExampleCount,
          ],
          ["workspace.postmanStatVariables", build.summary.variableCount],
        ].map(([label, value]) => (
          <div className="min-w-0 bg-white p-3" key={label}>
            <p className="text-xs font-bold text-[color:var(--color-brand-muted)]">
              {t(label as Parameters<typeof t>[0])}
            </p>
            <p className="mt-1 text-xl font-extrabold text-[color:var(--color-brand-navy)]">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
            <input
              checked={groupByTags}
              className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
              type="checkbox"
              onChange={(event) =>
                handleGroupByTagsChange(event.target.checked)
              }
            />
            {t("workspace.postmanGroupByTags")}
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
            <input
              checked={includeResponseExamples}
              className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
              type="checkbox"
              onChange={(event) =>
                handleResponseExamplesChange(event.target.checked)
              }
            />
            {t("workspace.postmanIncludeResponses")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasRequests}
            type="button"
            onClick={handleEnvironmentExport}
          >
            {t("workspace.postmanExportEnvironment")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasRequests}
            type="button"
            onClick={handleCollectionExport}
          >
            {t("workspace.postmanExportCollection")}
          </button>
        </div>
      </div>

      {!hasRequests ? (
        <p
          className="mt-3 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.postmanNoEndpoints")}
        </p>
      ) : actionStatus !== "idle" ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            actionStatus.endsWith("error") ? "text-red-700" : "text-emerald-700"
          }`}
          role={actionStatus.endsWith("error") ? "alert" : "status"}
        >
          {t(
            actionStatus === "collection-error"
              ? "workspace.postmanCollectionExportError"
              : actionStatus === "collection-success"
                ? "workspace.postmanCollectionExportSuccess"
                : actionStatus === "environment-error"
                  ? "workspace.postmanEnvironmentExportError"
                  : "workspace.postmanEnvironmentExportSuccess",
          )}
        </p>
      ) : null}
    </section>
  );
}
