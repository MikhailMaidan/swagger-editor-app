"use client";

import { memo, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  createApiSlice,
  createApiSliceExport,
  type ApiSliceIssue,
} from "@/lib/api-slice";
import { writeTextToClipboard } from "@/lib/clipboard";
import type { EndpointSummary, SchemaFormat } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import type { TranslationKey } from "@/lib/translations";

const issueLabels: Record<ApiSliceIssue["code"], TranslationKey> = {
  "broken-reference": "workspace.apiSliceBrokenReference",
  "external-reference": "workspace.apiSliceExternalReference",
  "linked-operation": "workspace.apiSliceLinkedOperation",
  "preserved-components": "workspace.apiSlicePreservedComponents",
  "path-reference": "workspace.apiSlicePathReference",
  "serialization-error": "workspace.apiSliceSerializationError",
};
const buttonClass =
  "rounded-md border border-[color:var(--color-brand-border)] px-3 py-2 text-xs font-extrabold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";

export const ApiSlicePanel = memo(function ApiSlicePanel({
  rootSchema,
  allEndpoints,
  visibleEndpoints,
  title,
}: {
  rootSchema: Record<string, unknown>;
  allEndpoints: EndpointSummary[];
  visibleEndpoints: EndpointSummary[];
  title: string;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState("visible");
  const [format, setFormat] = useState<SchemaFormat>("yaml");
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [includeWebhooks, setIncludeWebhooks] = useState(false);
  const [pruneComponents, setPruneComponents] = useState(true);
  const [feedback, setFeedback] = useState<{
    content: string;
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const selected = scope === "all" ? allEndpoints : visibleEndpoints;
  const build = useMemo(
    () =>
      createApiSlice(rootSchema, selected, {
        includeDeprecated,
        includeWebhooks,
        pruneComponents,
      }),
    [rootSchema, selected, includeDeprecated, includeWebhooks, pruneComponents],
  );
  const exported = useMemo(
    () => createApiSliceExport(build, title, format),
    [build, title, format],
  );
  const byteSize = useMemo(
    () => getByteSize(exported.content),
    [exported.content],
  );
  const serializationFailed = build.issues.some(
    (issue) => issue.code === "serialization-error",
  );
  const blocked =
    serializationFailed ||
    build.operationCount === 0 ||
    build.issues.some(
      (issue) =>
        issue.code === "broken-reference" || issue.code === "path-reference",
    );
  const currentFeedback =
    feedback?.content === exported.content ? feedback : null;
  const stats: [TranslationKey, number][] = [
    ["workspace.apiSliceOperations", build.operationCount],
    ["workspace.apiSlicePaths", build.pathCount],
    ["workspace.apiSliceRetained", build.retainedComponentCount],
    ["workspace.apiSliceRemoved", build.removedComponentCount],
  ];

  async function copy() {
    const success = await writeTextToClipboard(exported.content);
    setFeedback({
      content: exported.content,
      key: success
        ? "workspace.apiSliceCopySuccess"
        : "workspace.apiSliceCopyError",
      error: !success,
    });
  }

  function download() {
    const success = downloadTextFile(
      exported.content,
      exported.fileName,
      exported.contentType,
    );
    setFeedback({
      content: exported.content,
      key: success
        ? "workspace.apiSliceDownloadSuccess"
        : "workspace.apiSliceDownloadError",
      error: !success,
    });
  }

  return (
    <section
      aria-labelledby="api-slice-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <h3
        id="api-slice-title"
        className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
      >
        {t("workspace.apiSliceTitle")}
      </h3>
      <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
        {t("workspace.apiSliceDescription")}
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
          {t("workspace.apiSliceScope")}
          <select
            className={buttonClass}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="visible">
              {t("workspace.apiSliceVisible", {
                count: String(visibleEndpoints.length),
              })}
            </option>
            <option value="all">
              {t("workspace.apiSliceAll", {
                count: String(allEndpoints.length),
              })}
            </option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
          {t("workspace.apiSliceFormat")}
          <select
            className={buttonClass}
            value={format}
            onChange={(event) => setFormat(event.target.value as SchemaFormat)}
          >
            <option value="yaml">YAML (.yaml)</option>
            <option value="json">JSON (.json)</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-[color:var(--color-brand-navy)]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pruneComponents}
            onChange={(event) => setPruneComponents(event.target.checked)}
          />
          {t("workspace.apiSlicePrune")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeDeprecated}
            onChange={(event) => setIncludeDeprecated(event.target.checked)}
          />
          {t("workspace.apiSliceDeprecated")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeWebhooks}
            onChange={(event) => setIncludeWebhooks(event.target.checked)}
          />
          {t("workspace.apiSliceWebhooks")}
        </label>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div className="rounded-md bg-[#f4f3f8] p-3" key={label}>
            <dt className="text-xs font-bold text-[color:var(--color-brand-muted)]">
              {t(label)}
            </dt>
            <dd className="mt-1 text-xl font-extrabold text-[color:var(--color-brand-navy)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {build.issues.length > 0 && (
        <details
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
          open
        >
          <summary className="cursor-pointer font-bold text-amber-900">
            {t("workspace.apiSliceIssues", {
              count: String(build.issues.length),
            })}
          </summary>
          <ul className="mt-2 max-h-64 space-y-3 overflow-auto">
            {build.issues.map((issue, index) => (
              <li
                className="break-words text-amber-950"
                key={`${issue.source}-${index}`}
              >
                <p
                  role={
                    issue.code === "serialization-error" ? "alert" : undefined
                  }
                >
                  {t(issueLabels[issue.code])}
                </p>
                <p className="mt-1 break-all font-mono text-xs">
                  {issue.source}
                  {issue.target ? ` → ${issue.target}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {blocked && !serializationFailed && (
        <p
          role="status"
          className="mt-3 text-sm font-semibold text-[color:var(--color-brand-muted)]"
        >
          {t(
            build.operationCount === 0
              ? "workspace.apiSliceEmpty"
              : "workspace.apiSliceBlocked",
          )}
        </p>
      )}
      {!serializationFailed && (
        <p className="mt-4 break-all text-xs font-semibold text-[color:var(--color-brand-muted)]">
          {t("workspace.apiSliceFileDetails", {
            fileName: exported.fileName,
            size: String(byteSize),
          })}
        </p>
      )}
      {!serializationFailed && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
            {t("workspace.apiSlicePreview")}
          </summary>
          <textarea
            aria-label={t("workspace.apiSlicePreview")}
            className="mt-2 h-72 w-full rounded-md border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3 font-mono text-xs"
            readOnly
            value={exported.content}
            spellCheck={false}
          />
        </details>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={blocked}
          type="button"
          onClick={copy}
        >
          {t("workspace.apiSliceCopy")}
        </button>
        <button
          className={buttonClass}
          disabled={blocked}
          type="button"
          onClick={download}
        >
          {t("workspace.apiSliceDownload")}
        </button>
      </div>
      {currentFeedback && (
        <p
          className={`mt-3 text-sm font-semibold ${currentFeedback.error ? "text-red-700" : "text-emerald-700"}`}
          role={currentFeedback.error ? "alert" : "status"}
        >
          {t(currentFeedback.key)}
        </p>
      )}
    </section>
  );
});
