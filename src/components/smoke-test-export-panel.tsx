"use client";

import { memo, useId, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import type { EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { createSmokeTestExport } from "@/lib/smoke-test-export";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";

export const SmokeTestExportPanel = memo(function SmokeTestExportPanel({
  allEndpoints,
  visibleEndpoints,
  title,
}: {
  allEndpoints: EndpointSummary[];
  visibleEndpoints: EndpointSummary[];
  title: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const [scope, setScope] = useState("visible");
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [checkJson, setCheckJson] = useState(true);
  const [timeout, setTimeoutValue] = useState("10000");
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budget, setBudget] = useState("1000");
  const [preview, setPreview] = useState("script");
  const [feedback, setFeedback] = useState<{
    context: string;
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const selected = scope === "all" ? allEndpoints : visibleEndpoints;
  const invalid =
    !timeout.trim() ||
    !Number.isInteger(Number(timeout)) ||
    Number(timeout) < 100 ||
    Number(timeout) > 120000 ||
    (budgetEnabled &&
      (!budget.trim() ||
        !Number.isInteger(Number(budget)) ||
        Number(budget) < 1 ||
        Number(budget) > 120000));
  const build = useMemo(
    () =>
      createSmokeTestExport(selected, title, {
        includeDeprecated,
        checkJson,
        timeoutMs: Number(timeout),
        maxDurationMs: budgetEnabled ? Number(budget) : null,
      }),
    [
      selected,
      title,
      includeDeprecated,
      checkJson,
      timeout,
      budgetEnabled,
      budget,
    ],
  );
  const context =
    build.source +
    build.config +
    build.scriptFileName +
    preview +
    String(invalid);
  const currentFeedback = feedback?.context === context ? feedback : null;
  const blocked = invalid || build.operations.length === 0;

  async function copy() {
    const success = await writeTextToClipboard(
      preview === "script" ? build.source : build.config,
    );
    setFeedback({
      context,
      key: success ? "smoke.copySuccess" : "smoke.copyError",
      error: !success,
    });
  }
  function download(kind: "script" | "config") {
    const success = downloadTextFile(
      kind === "script" ? build.source : build.config,
      kind === "script" ? build.scriptFileName : build.configFileName,
      kind === "script" ? "text/javascript;charset=utf-8" : "application/json",
    );
    setFeedback({
      context,
      key: success ? "smoke.downloadSuccess" : "smoke.downloadError",
      error: !success,
    });
  }

  return (
    <section
      aria-labelledby={id}
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <h3
        id={id}
        className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
      >
        {t("smoke.title")}
      </h3>
      <p className="mt-1 text-xs text-[color:var(--color-brand-muted)]">
        {t("smoke.description")}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold">
          {t("smoke.scope")}
          <select
            className={inputClass}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="visible">{t("smoke.visible")}</option>
            <option value="all">{t("smoke.all")}</option>
          </select>
        </label>
        <label className="text-xs font-bold">
          {t("smoke.timeout")}
          <input
            type="number"
            min={100}
            max={120000}
            step={1}
            className={inputClass}
            value={timeout}
            onChange={(event) => setTimeoutValue(event.target.value)}
          />
        </label>
        {budgetEnabled ? (
          <label className="text-xs font-bold">
            {t("smoke.budget")}
            <input
              type="number"
              min={1}
              max={120000}
              step={1}
              className={inputClass}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeDeprecated}
            onChange={(event) => setIncludeDeprecated(event.target.checked)}
          />
          {t("smoke.deprecated")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checkJson}
            onChange={(event) => setCheckJson(event.target.checked)}
          />
          {t("smoke.checkJson")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={budgetEnabled}
            onChange={(event) => setBudgetEnabled(event.target.checked)}
          />
          {t("smoke.enableBudget")}
        </label>
      </div>
      {invalid ? (
        <p role="alert" className="mt-3 text-xs">
          {t("smoke.invalid")}
        </p>
      ) : null}
      <p aria-live="polite" className="mt-3 text-xs font-semibold">
        {t("smoke.summary", {
          count: String(build.operations.length),
          excluded: String(build.excludedCount),
        })}
      </p>
      {!build.operations.length ? (
        <p className="mt-2 text-xs">{t("smoke.empty")}</p>
      ) : null}
      {build.operations.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold">
            {t("smoke.manifest")}
          </summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{t("smoke.manifest")}</caption>
              <thead>
                <tr>
                  <th className="p-2">{t("smoke.operation")}</th>
                  <th className="p-2">{t("smoke.inputs")}</th>
                  <th className="p-2">{t("smoke.auth")}</th>
                </tr>
              </thead>
              <tbody>
                {build.operations.map((operation) => (
                  <tr
                    key={operation.key}
                    className="border-t border-[color:var(--color-brand-border)]"
                  >
                    <td className="p-2 font-mono">{operation.key}</td>
                    <td className="p-2">{operation.requiredInputs}</td>
                    <td className="p-2">
                      {t(
                        operation.secured
                          ? "smoke.authRequired"
                          : "smoke.authNotRequired",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={blocked}
          onClick={() => download("script")}
        >
          {t("smoke.downloadScript")}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={blocked}
          onClick={() => download("config")}
        >
          {t("smoke.downloadConfig")}
        </button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold">
          {t("smoke.preview")}
        </summary>
        <label className="mt-2 block max-w-xs text-xs font-bold">
          {t("smoke.previewFile")}
          <select
            className={inputClass}
            value={preview}
            onChange={(event) => {
              setPreview(event.target.value);
              setFeedback(null);
            }}
          >
            <option value="script">{t("smoke.script")}</option>
            <option value="config">{t("smoke.config")}</option>
          </select>
        </label>
        <button
          type="button"
          className={`${buttonClass} mt-2`}
          disabled={blocked}
          onClick={() => void copy()}
        >
          {t("smoke.copy")}
        </button>
        {!blocked ? (
          <pre
            aria-label={t("smoke.source")}
            className="mt-2 max-h-80 overflow-auto rounded-lg bg-[#fbfaff] p-3 text-xs"
          >
            {preview === "script" ? build.source : build.config}
          </pre>
        ) : null}
      </details>
      {currentFeedback ? (
        <p
          role={currentFeedback.error ? "alert" : undefined}
          aria-live="polite"
          className="mt-2 text-xs"
        >
          {t(currentFeedback.key)}
        </p>
      ) : null}
      <details className="mt-3 text-xs text-[color:var(--color-brand-muted)]">
        <summary className="cursor-pointer font-bold">
          {t("smoke.instructions")}
        </summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>{t("smoke.step1")}</li>
          <li>{t("smoke.step2")}</li>
          <li>{t("smoke.step3")}</li>
        </ol>
        <pre className="mt-2 overflow-auto rounded-lg bg-[#fbfaff] p-3">{`node ${build.scriptFileName} > smoke-report.json`}</pre>
        <p className="mt-2">{t("smoke.exit")}</p>
        <p className="mt-2">{t("smoke.limits")}</p>
      </details>
    </section>
  );
});
