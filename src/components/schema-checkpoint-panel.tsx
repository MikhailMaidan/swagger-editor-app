"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatEuropeanDateTime } from "@/lib/date-format";
import { parseOpenApiSchema } from "@/lib/openapi";
import {
  createSchemaCheckpoint,
  MAX_SCHEMA_CHECKPOINTS,
  readSchemaCheckpoints,
  removeSchemaCheckpoint,
  SCHEMA_CHECKPOINTS_STORAGE_KEY,
  saveSchemaCheckpoints,
  type SchemaCheckpoint,
  upsertSchemaCheckpoint,
} from "@/lib/schema-checkpoints";
import { downloadSchemaFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

type CheckpointFeedback = {
  isError: boolean;
  key: TranslationKey;
  params?: Record<string, string>;
};

export function SchemaCheckpointPanel({
  onRestore,
  schemaText,
}: {
  onRestore: (checkpoint: SchemaCheckpoint) => void;
  schemaText: string;
}) {
  const { language, t } = useI18n();
  const [checkpoints, setCheckpoints] = useState<SchemaCheckpoint[]>([]);
  const [feedback, setFeedback] = useState<CheckpointFeedback | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setCheckpoints(readSchemaCheckpoints());
      }
    });

    function handleStorage(event: StorageEvent) {
      if (
        event.storageArea === window.localStorage &&
        event.key === SCHEMA_CHECKPOINTS_STORAGE_KEY
      ) {
        setCheckpoints(readSchemaCheckpoints());
        setFeedback(null);
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  function persistCheckpoints(
    nextCheckpoints: SchemaCheckpoint[],
    successFeedback: CheckpointFeedback,
  ) {
    setCheckpoints(nextCheckpoints);
    setFeedback(
      saveSchemaCheckpoints(nextCheckpoints)
        ? successFeedback
        : {
            isError: true,
            key: "workspace.checkpointStorageError",
          },
    );
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parseResult = parseOpenApiSchema(schemaText);
    const result = createSchemaCheckpoint({
      endpointCount: parseResult.ok ? parseResult.value.endpoints.length : 0,
      format: parseResult.ok ? parseResult.value.format : parseResult.format,
      isValid: parseResult.ok,
      name,
      schemaText,
      schemaTitle: parseResult.ok ? parseResult.value.title : "",
      schemaVersion: parseResult.ok ? parseResult.value.version : "",
    });

    if (!result.ok) {
      setFeedback({
        isError: true,
        key:
          result.reason === "too-large"
            ? "workspace.checkpointTooLarge"
            : "workspace.checkpointNameRequired",
      });
      return;
    }

    persistCheckpoints(upsertSchemaCheckpoint(checkpoints, result.value), {
      isError: false,
      key: "workspace.checkpointCreated",
      params: { name: result.value.name },
    });
    setName("");
  }

  function handleRestore(checkpoint: SchemaCheckpoint) {
    if (
      !window.confirm(
        t("workspace.checkpointRestoreConfirm", { name: checkpoint.name }),
      )
    ) {
      return;
    }

    onRestore(checkpoint);
    setFeedback({
      isError: false,
      key: "workspace.checkpointRestored",
      params: { name: checkpoint.name },
    });
  }

  function handleDownload(checkpoint: SchemaCheckpoint) {
    const downloaded = downloadSchemaFile(
      checkpoint.schemaText,
      checkpoint.schemaTitle || checkpoint.name,
      checkpoint.format,
    );

    setFeedback({
      isError: !downloaded,
      key: downloaded
        ? "workspace.checkpointDownloadStarted"
        : "workspace.checkpointDownloadError",
    });
  }

  function handleDelete(checkpoint: SchemaCheckpoint) {
    if (
      !window.confirm(
        t("workspace.checkpointDeleteConfirm", { name: checkpoint.name }),
      )
    ) {
      return;
    }

    persistCheckpoints(removeSchemaCheckpoint(checkpoints, checkpoint.id), {
      isError: false,
      key: "workspace.checkpointDeleted",
      params: { name: checkpoint.name },
    });
  }

  return (
    <section
      aria-labelledby="schema-checkpoints-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
            id="schema-checkpoints-title"
          >
            {t("workspace.checkpointTitle")}
          </h3>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.checkpointCount", {
              count: String(checkpoints.length),
              limit: String(MAX_SCHEMA_CHECKPOINTS),
            })}
          </p>
        </div>
        <form
          aria-label={t("workspace.checkpointCreateForm")}
          className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:flex-nowrap sm:justify-end"
          onSubmit={handleCreate}
        >
          <label className="w-full min-w-0 sm:max-w-72 sm:flex-1">
            <span className="sr-only">{t("workspace.checkpointName")}</span>
            <input
              aria-label={t("workspace.checkpointName")}
              className="h-9 w-full rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              maxLength={80}
              placeholder={t("workspace.checkpointNamePlaceholder")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFeedback(null);
              }}
            />
          </label>
          <button
            className="h-9 w-full rounded-md bg-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-white transition hover:bg-[#4a23d7] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={!name.trim() || !schemaText}
            type="submit"
          >
            {t("workspace.checkpointCreate")}
          </button>
        </form>
      </div>

      {feedback ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            feedback.isError ? "text-red-700" : "text-emerald-700"
          }`}
          role={feedback.isError ? "alert" : "status"}
        >
          {t(feedback.key, feedback.params)}
        </p>
      ) : null}

      {checkpoints.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
          {t("workspace.checkpointNoItems")}
        </p>
      ) : (
        <ol className="mt-4 border-t border-[color:var(--color-brand-border)]">
          {checkpoints.map((checkpoint) => (
            <li
              className="flex flex-col gap-3 border-b border-[color:var(--color-brand-border)] py-3 sm:flex-row sm:items-center sm:justify-between"
              key={checkpoint.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                  {checkpoint.name}
                </p>
                <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                  {checkpoint.schemaTitle ||
                    t("workspace.checkpointSchemaFallback")}
                  {checkpoint.schemaVersion
                    ? ` v${checkpoint.schemaVersion}`
                    : ""}
                  {" | "}
                  {formatEuropeanDateTime(checkpoint.createdAt, language)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span
                    className={`rounded px-2 py-1 ${
                      checkpoint.isValid
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t(
                      checkpoint.isValid
                        ? "workspace.checkpointValid"
                        : "workspace.checkpointInvalid",
                    )}
                  </span>
                  <span className="text-[color:var(--color-brand-muted)]">
                    {t("workspace.checkpointEndpoints", {
                      count: String(checkpoint.endpointCount),
                    })}
                  </span>
                  <span className="text-[color:var(--color-brand-muted)]">
                    {checkpoint.byteSize} B
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  aria-label={t("workspace.checkpointRestoreAriaLabel", {
                    name: checkpoint.name,
                  })}
                  className="h-9 rounded-md bg-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-white transition hover:bg-[#4a23d7]"
                  type="button"
                  onClick={() => handleRestore(checkpoint)}
                >
                  {t("workspace.checkpointRestore")}
                </button>
                <button
                  aria-label={t("workspace.checkpointDownloadAriaLabel", {
                    name: checkpoint.name,
                  })}
                  className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                  type="button"
                  onClick={() => handleDownload(checkpoint)}
                >
                  {t("workspace.checkpointDownload")}
                </button>
                <button
                  aria-label={t("workspace.checkpointDeleteAriaLabel", {
                    name: checkpoint.name,
                  })}
                  className="h-9 rounded-md border border-red-200 px-3 text-xs font-extrabold text-red-700 transition hover:bg-red-50"
                  type="button"
                  onClick={() => handleDelete(checkpoint)}
                >
                  {t("workspace.checkpointDelete")}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
