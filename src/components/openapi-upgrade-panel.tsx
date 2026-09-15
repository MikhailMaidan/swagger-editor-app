"use client";

import { memo, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { parseOpenApiSchema, type SchemaFormat } from "@/lib/openapi";
import {
  compareUpgradeEndpoints,
  getUpgradeTargets,
  serializeUpgradedDocument,
  upgradeOpenApiDocument,
  type OpenApiUpgradeSource,
  type OpenApiUpgradeTarget,
  type OpenApiUpgradeWarning,
} from "@/lib/openapi-upgrade";
import {
  createUpgradeNotesMarkdown,
  downloadUpgradedDocument,
  formatUpgradeChange,
  formatUpgradeWarning,
  upgradeSourceKeys,
} from "@/lib/openapi-upgrade-export";
import {
  createSchemaCheckpoint,
  readSchemaCheckpoints,
  saveSchemaCheckpoints,
  SCHEMA_CHECKPOINTS_STORAGE_KEY,
  upsertSchemaCheckpoint,
} from "@/lib/schema-checkpoints";
import type { TranslationKey } from "@/lib/translations";

type ActionStatus =
  | "checkpoint-error"
  | "copy-error"
  | "copy-success"
  | "download-error"
  | "download-success"
  | "idle"
  | "notes-error"
  | "notes-success"
  | "reveal-error";

const actionMessageKeys: Record<
  Exclude<ActionStatus, "idle">,
  TranslationKey
> = {
  "checkpoint-error": "workspace.upgradeCheckpointError",
  "copy-error": "workspace.upgradeCopyError",
  "copy-success": "workspace.upgradeCopySuccess",
  "download-error": "workspace.upgradeDownloadError",
  "download-success": "workspace.upgradeDownloadSuccess",
  "notes-error": "workspace.upgradeNotesError",
  "notes-success": "workspace.upgradeNotesCopied",
  "reveal-error": "workspace.upgradeRevealError",
};

function countLines(text: string) {
  return text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
}

// Memoized because the workspace re-renders on every editor keystroke; the
// conversion itself only runs while the preview is open.
export const OpenApiUpgradePanel = memo(function OpenApiUpgradePanel({
  getSchemaText,
  onApply,
  onRevealLocation,
  rootSchema,
  schemaFormat,
  schemaTitle,
  schemaVersion,
  source,
}: {
  getSchemaText: () => string;
  onApply: (
    upgradedText: string,
    target: OpenApiUpgradeTarget,
    checkpointSaved: boolean,
  ) => void;
  onRevealLocation: (pointer: string, target: "key" | "value") => boolean;
  rootSchema: Record<string, unknown>;
  schemaFormat: SchemaFormat;
  schemaTitle: string;
  schemaVersion: string;
  source: OpenApiUpgradeSource;
}) {
  const { language, t } = useI18n();
  const targets = getUpgradeTargets(source);
  const [selectedTarget, setSelectedTarget] = useState<
    OpenApiUpgradeTarget | ""
  >("");
  const [selectedFormat, setSelectedFormat] = useState<SchemaFormat | "">("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saveCheckpoint, setSaveCheckpoint] = useState(true);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const target =
    selectedTarget && targets.includes(selectedTarget)
      ? selectedTarget
      : targets[0];
  const outputFormat = selectedFormat || schemaFormat;
  const preview = useMemo(() => {
    if (!isPreviewOpen) {
      return null;
    }

    const result = upgradeOpenApiDocument(rootSchema, target);
    const text = serializeUpgradedDocument(result.document, outputFormat);

    return {
      isParseable: parseOpenApiSchema(text).ok,
      parity: compareUpgradeEndpoints(rootSchema, result.document),
      result,
      text,
    };
  }, [isPreviewOpen, outputFormat, rootSchema, target]);
  const sourceLabel = t(upgradeSourceKeys[source]);
  const changeTotal =
    preview?.result.changes.reduce(
      (total, change) => total + change.count,
      0,
    ) ?? 0;
  const canApply =
    Boolean(preview?.isParseable) && preview?.parity.missing.length === 0;

  async function handleCopy() {
    if (!preview) {
      return;
    }

    setActionStatus(
      (await writeTextToClipboard(preview.text))
        ? "copy-success"
        : "copy-error",
    );
  }

  async function handleCopyNotes() {
    if (!preview) {
      return;
    }

    const copied = await writeTextToClipboard(
      createUpgradeNotesMarkdown(
        preview.result,
        preview.parity,
        { title: schemaTitle, version: schemaVersion },
        language,
      ),
    );

    setActionStatus(copied ? "notes-success" : "notes-error");
  }

  function handleDownload() {
    if (!preview) {
      return;
    }

    setActionStatus(
      downloadUpgradedDocument(preview.text, schemaTitle, target, outputFormat)
        ? "download-success"
        : "download-error",
    );
  }

  function handleReveal(warning: OpenApiUpgradeWarning) {
    setActionStatus(
      onRevealLocation(warning.pointer, "key") ? "idle" : "reveal-error",
    );
  }

  function handleApply() {
    if (!preview || !canApply) {
      return;
    }

    if (saveCheckpoint) {
      const checkpoint = createSchemaCheckpoint({
        endpointCount: preview.parity.sourceCount,
        format: schemaFormat,
        isValid: true,
        name: t("workspace.upgradeCheckpointName", { version: target }),
        schemaText: getSchemaText(),
        schemaTitle,
        schemaVersion,
      });

      if (
        !checkpoint.ok ||
        !saveSchemaCheckpoints(
          upsertSchemaCheckpoint(readSchemaCheckpoints(), checkpoint.value),
        )
      ) {
        setActionStatus("checkpoint-error");
        return;
      }

      // Same-tab writes do not emit storage events, so the checkpoint panel
      // is notified explicitly and lists the new restore point right away.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SCHEMA_CHECKPOINTS_STORAGE_KEY,
          storageArea: window.localStorage,
        }),
      );
    }

    setIsPreviewOpen(false);
    setActionStatus("idle");
    onApply(preview.text, target, saveCheckpoint);
  }

  return (
    <section
      aria-labelledby="openapi-upgrade-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="openapi-upgrade-title"
            >
              {t("workspace.upgradeTitle")}
            </h3>
            <span className="rounded-md bg-[linear-gradient(135deg,var(--color-brand-soft),#ffffff)] px-2.5 py-1 text-xs font-extrabold text-[color:var(--color-brand-purple)] ring-1 ring-[color:var(--color-brand-border)]">
              {t("workspace.upgradePath", { source: sourceLabel, target })}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-[color:var(--color-brand-muted)]">
            {t("workspace.upgradeDescription")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {targets.length > 1 ? (
          <label className="grid min-w-[9rem] gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
            {t("workspace.upgradeTargetLabel")}
            <select
              className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              value={target}
              onChange={(event) =>
                setSelectedTarget(event.target.value as OpenApiUpgradeTarget)
              }
            >
              {targets.map((option) => (
                <option key={option} value={option}>
                  OpenAPI {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid min-w-[9rem] gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
          {t("workspace.upgradeFormatLabel")}
          <select
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            value={outputFormat}
            onChange={(event) =>
              setSelectedFormat(event.target.value as SchemaFormat)
            }
          >
            <option value="yaml">{t("workspace.upgradeFormatYaml")}</option>
            <option value="json">{t("workspace.upgradeFormatJson")}</option>
          </select>
        </label>
        <button
          aria-expanded={isPreviewOpen}
          className={`h-9 rounded-md px-4 text-xs font-extrabold transition ${
            isPreviewOpen
              ? "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              : "bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] text-white shadow-[0_8px_20px_rgba(90,45,255,0.22)] hover:translate-y-[-1px]"
          }`}
          type="button"
          onClick={() => {
            setIsPreviewOpen((current) => !current);
            setActionStatus("idle");
          }}
        >
          {t(
            isPreviewOpen
              ? "workspace.upgradeHidePreview"
              : "workspace.upgradePreview",
          )}
        </button>
      </div>

      {actionStatus !== "idle" ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            actionStatus.endsWith("success")
              ? "text-emerald-700"
              : "text-red-700"
          }`}
          role={actionStatus.endsWith("success") ? "status" : "alert"}
        >
          {t(actionMessageKeys[actionStatus])}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
            {[
              ["workspace.upgradeStatChanges", String(changeTotal)],
              [
                "workspace.upgradeStatWarnings",
                String(preview.result.warnings.length),
              ],
              [
                "workspace.upgradeStatEndpoints",
                t("workspace.upgradeStatEndpointsValue", {
                  source: String(preview.parity.sourceCount),
                  upgraded: String(
                    preview.parity.sourceCount - preview.parity.missing.length,
                  ),
                }),
              ],
              ["workspace.upgradeStatLines", String(countLines(preview.text))],
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

          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${
              preview.parity.missing.length === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {preview.parity.missing.length === 0
              ? t("workspace.upgradeParityOk", {
                  count: String(preview.parity.sourceCount),
                })
              : t("workspace.upgradeParityMissing", {
                  count: String(preview.parity.missing.length),
                  endpoints: preview.parity.missing.join(", "),
                })}
          </p>

          {!preview.isParseable ? (
            <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
              {t("workspace.upgradeInvalidOutput")}
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h4 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                {t("workspace.upgradeChangesTitle")}
              </h4>
              {preview.result.changes.length === 0 ? (
                <p className="mt-2 text-sm font-semibold text-[color:var(--color-brand-muted)]">
                  {t("workspace.upgradeNoChanges")}
                </p>
              ) : (
                <ul className="mt-2 grid gap-1.5">
                  {preview.result.changes.map((change) => (
                    <li
                      className="flex items-start gap-2 text-sm font-semibold text-[color:var(--color-brand-navy)]"
                      key={change.code}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-brand-purple)]"
                      />
                      <span className="min-w-0 break-words">
                        {formatUpgradeChange(change, target, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                {t("workspace.upgradeWarningsTitle")}
              </h4>
              {preview.result.warnings.length === 0 ? (
                <p className="mt-2 text-sm font-semibold text-emerald-700">
                  {t("workspace.upgradeNoWarnings")}
                </p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {preview.result.warnings.map((warning) => (
                    <li
                      className="rounded-lg border border-l-4 border-[color:var(--color-brand-border)] border-l-amber-400 bg-white p-2.5"
                      key={`${warning.code}-${warning.pointer}-${JSON.stringify(warning.params)}`}
                    >
                      <p className="break-words text-sm font-semibold text-[color:var(--color-brand-navy)]">
                        {formatUpgradeWarning(warning, t)}
                      </p>
                      {warning.pointer ? (
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <code className="break-all font-mono text-[11px] text-[color:var(--color-brand-muted)]">
                            {warning.pointer}
                          </code>
                          <button
                            aria-label={t("workspace.upgradeRevealAriaLabel", {
                              pointer: warning.pointer,
                            })}
                            className="h-8 rounded-md border border-[color:var(--color-brand-border)] px-2.5 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                            type="button"
                            onClick={() => handleReveal(warning)}
                          >
                            {t("workspace.upgradeReveal")}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <label className="mt-4 grid gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
            {t("workspace.upgradeOutputLabel")}
            <textarea
              className="h-72 w-full resize-y rounded-lg border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              readOnly
              spellCheck={false}
              value={preview.text}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="button"
                onClick={handleCopy}
              >
                {t("workspace.upgradeCopy")}
              </button>
              <button
                className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="button"
                onClick={handleDownload}
              >
                {t("workspace.upgradeDownload")}
              </button>
              <button
                className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="button"
                onClick={handleCopyNotes}
              >
                {t("workspace.upgradeCopyNotes")}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-[color:var(--color-brand-navy)]">
                <input
                  checked={saveCheckpoint}
                  className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                  type="checkbox"
                  onChange={(event) => setSaveCheckpoint(event.target.checked)}
                />
                {t("workspace.upgradeSaveCheckpoint")}
              </label>
              <button
                className="h-9 rounded-md bg-[color:var(--color-brand-navy)] px-4 text-xs font-extrabold text-white transition hover:bg-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canApply}
                type="button"
                onClick={handleApply}
              >
                {t("workspace.upgradeApply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
});
