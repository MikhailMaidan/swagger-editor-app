"use client";

import { memo, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { createNodeMockServer } from "@/lib/node-mock-server";
import { downloadNodeMockServerFile } from "@/lib/node-mock-server-export";
import type { EndpointSummary } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";

type MockServerScope = "all" | "visible";
type ActionStatus =
  | "copy-error"
  | "copy-success"
  | "download-error"
  | "download-success"
  | "idle";

function parseNumericSetting(value: string, fallback: number) {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const NodeMockServerPanel = memo(function NodeMockServerPanel({
  allEndpoints,
  schema,
  visibleEndpoints,
}: {
  allEndpoints: EndpointSummary[];
  schema: { title: string; version: string };
  visibleEndpoints: EndpointSummary[];
}) {
  const { t } = useI18n();
  const { title: schemaTitle, version: schemaVersion } = schema;
  const [scope, setScope] = useState<MockServerScope>("all");
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [cors, setCors] = useState(true);
  const [validateRequiredInputs, setValidateRequiredInputs] = useState(true);
  const [port, setPort] = useState("4010");
  const [delayMs, setDelayMs] = useState("0");
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const selectedEndpoints = scope === "all" ? allEndpoints : visibleEndpoints;
  const configuredPort = parseNumericSetting(port, 4010);
  const configuredDelayMs = parseNumericSetting(delayMs, 0);
  const build = useMemo(
    () =>
      createNodeMockServer(
        selectedEndpoints,
        { title: schemaTitle, version: schemaVersion },
        {
          cors,
          defaultDelayMs: configuredDelayMs,
          defaultPort: configuredPort,
          includeDeprecated,
          validateRequiredInputs,
        },
      ),
    [
      configuredDelayMs,
      configuredPort,
      cors,
      includeDeprecated,
      schemaTitle,
      schemaVersion,
      selectedEndpoints,
      validateRequiredInputs,
    ],
  );
  const hasRoutes = build.summary.routeCount > 0;

  function resetStatus() {
    setActionStatus("idle");
  }

  function updateScope(nextScope: MockServerScope) {
    setScope(nextScope);
    resetStatus();
  }

  function updateOption(setter: (value: boolean) => void, value: boolean) {
    setter(value);
    resetStatus();
  }

  async function handleCopy() {
    if (!hasRoutes) return;
    setActionStatus(
      (await writeTextToClipboard(build.source))
        ? "copy-success"
        : "copy-error",
    );
  }

  function handleDownload() {
    if (!hasRoutes) return;
    setActionStatus(
      downloadNodeMockServerFile(build, { title: schemaTitle })
        ? "download-success"
        : "download-error",
    );
  }

  function getFeedbackKey(status: Exclude<ActionStatus, "idle">) {
    const keys: Record<Exclude<ActionStatus, "idle">, TranslationKey> = {
      "copy-error": "workspace.nodeMockCopyError",
      "copy-success": "workspace.nodeMockCopySuccess",
      "download-error": "workspace.nodeMockDownloadError",
      "download-success": "workspace.nodeMockDownloadSuccess",
    };
    return keys[status];
  }

  const statistics: Array<[TranslationKey, number]> = [
    ["workspace.nodeMockStatRoutes", build.summary.routeCount],
    ["workspace.nodeMockStatVariants", build.summary.responseVariantCount],
    ["workspace.nodeMockStatBodies", build.summary.bodyVariantCount],
    [
      "workspace.nodeMockStatExcludedDeprecated",
      build.summary.deprecatedExcludedCount,
    ],
  ];

  return (
    <section
      aria-labelledby="node-mock-server-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="node-mock-server-title"
            >
              {t("workspace.nodeMockTitle")}
            </h3>
            <span className="rounded-md bg-amber-100 px-3 py-1 text-sm font-extrabold text-amber-800">
              {t("workspace.nodeMockBadge")}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.nodeMockSummary", {
              responses: String(build.summary.responseVariantCount),
              routes: String(build.summary.routeCount),
            })}
          </p>
        </div>
        <div
          aria-label={t("workspace.nodeMockScopeLabel")}
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
            {t("workspace.nodeMockScopeAll", {
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
            {t("workspace.nodeMockScopeVisible", {
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

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-bold text-[color:var(--color-brand-muted)]">
          <span>{t("workspace.nodeMockPort")}</span>
          <input
            className="mt-1 h-10 w-full min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            inputMode="numeric"
            max="65535"
            min="1"
            type="number"
            value={port}
            onChange={(event) => {
              setPort(event.target.value);
              resetStatus();
            }}
          />
        </label>
        <label className="min-w-0 text-xs font-bold text-[color:var(--color-brand-muted)]">
          <span>{t("workspace.nodeMockDelay")}</span>
          <input
            className="mt-1 h-10 w-full min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            inputMode="numeric"
            max="30000"
            min="0"
            step="50"
            type="number"
            value={delayMs}
            onChange={(event) => {
              setDelayMs(event.target.value);
              resetStatus();
            }}
          />
        </label>
      </div>

      <p className="mt-3 min-w-0 rounded bg-[#f4f3f8] px-3 py-2 font-mono text-xs font-bold text-[color:var(--color-brand-navy)]">
        {t("workspace.nodeMockTarget", {
          port: String(
            Math.min(65_535, Math.max(1, Math.round(configuredPort))),
          ),
        })}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
        <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
          <input
            checked={includeDeprecated}
            className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
            type="checkbox"
            onChange={(event) =>
              updateOption(setIncludeDeprecated, event.target.checked)
            }
          />
          {t("workspace.nodeMockIncludeDeprecated")}
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
          <input
            checked={cors}
            className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
            type="checkbox"
            onChange={(event) => updateOption(setCors, event.target.checked)}
          />
          {t("workspace.nodeMockCors")}
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
          <input
            checked={validateRequiredInputs}
            className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
            type="checkbox"
            onChange={(event) =>
              updateOption(setValidateRequiredInputs, event.target.checked)
            }
          />
          {t("workspace.nodeMockValidate")}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--color-brand-border)] pt-4">
        <button
          className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasRoutes}
          type="button"
          onClick={handleCopy}
        >
          {t("workspace.nodeMockCopy")}
        </button>
        <button
          className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasRoutes}
          type="button"
          onClick={handleDownload}
        >
          {t("workspace.nodeMockDownload")}
        </button>
      </div>

      {!hasRoutes ? (
        <p
          className="mt-3 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.nodeMockNoEndpoints")}
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
});
