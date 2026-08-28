"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { RequestPreset } from "@/lib/request-presets";

type PresetActionStatus = "deleted" | "error" | "idle" | "saved";

export function RequestPresetControls({
  disabled,
  onApply,
  onCreate,
  onDelete,
  onUpdate,
  presets,
  selectedPresetId,
}: {
  disabled: boolean;
  onApply: (presetId: string) => void;
  onCreate: (name: string) => boolean;
  onDelete: (presetId: string) => boolean;
  onUpdate: (presetId: string) => boolean;
  presets: RequestPreset[];
  selectedPresetId: string;
}) {
  const { t } = useI18n();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [status, setStatus] = useState<PresetActionStatus>("idle");
  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? null;

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = name.trim();

    if (!normalizedName) {
      setNameError(true);
      setStatus("idle");
      return;
    }

    setStatus(onCreate(normalizedName) ? "saved" : "error");
    setName("");
    setNameError(false);
    setIsCreating(false);
  }

  function handleUpdate() {
    if (!selectedPreset) {
      return;
    }

    setStatus(onUpdate(selectedPreset.id) ? "saved" : "error");
  }

  function handleDelete() {
    if (
      !selectedPreset ||
      !window.confirm(
        t("workspace.requestPresetDeleteConfirm", {
          name: selectedPreset.name,
        }),
      )
    ) {
      return;
    }

    setStatus(onDelete(selectedPreset.id) ? "deleted" : "error");
  }

  return (
    <div className="mt-3 border-y border-[color:var(--color-brand-border)] py-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
          <span className="mb-1 block">
            {t("workspace.requestPresetSelector")}
          </span>
          <select
            aria-label={t("workspace.requestPresetSelector")}
            className="h-9 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            value={selectedPreset?.id || ""}
            onChange={(event) => {
              onApply(event.target.value);
              setStatus("idle");
              setNameError(false);
            }}
          >
            <option value="">{t("workspace.requestPresetNone")}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-expanded={isCreating}
          className="h-9 rounded-lg border border-[color:var(--color-brand-purple)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          type="button"
          onClick={() => {
            setIsCreating((isOpen) => !isOpen);
            setNameError(false);
            setStatus("idle");
          }}
        >
          {t("workspace.requestPresetSaveAs")}
        </button>
        {selectedPreset ? (
          <>
            <button
              className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              type="button"
              onClick={handleUpdate}
            >
              {t("workspace.requestPresetUpdate")}
            </button>
            <button
              className="h-9 rounded-lg border border-red-300 bg-white px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              type="button"
              onClick={handleDelete}
            >
              {t("workspace.requestPresetDelete")}
            </button>
          </>
        ) : null}
      </div>

      {isCreating ? (
        <form
          aria-label={t("workspace.requestPresetCreateForm")}
          className="mt-3 flex flex-wrap items-end gap-2"
          noValidate
          onSubmit={handleCreate}
        >
          <label className="min-w-48 flex-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
            <span className="mb-1 block">
              {t("workspace.requestPresetName")}
            </span>
            <input
              aria-invalid={nameError}
              autoFocus
              className="h-9 w-full rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              maxLength={80}
              placeholder={t("workspace.requestPresetNamePlaceholder")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(false);
              }}
            />
          </label>
          <button
            className="h-9 rounded-lg bg-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-white transition hover:bg-[color:var(--color-brand-purple-dark)]"
            type="submit"
          >
            {t("workspace.requestPresetSave")}
          </button>
          <button
            className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:text-[color:var(--color-brand-navy)]"
            type="button"
            onClick={() => {
              setIsCreating(false);
              setName("");
              setNameError(false);
            }}
          >
            {t("workspace.requestPresetCancel")}
          </button>
        </form>
      ) : null}

      {nameError ? (
        <p className="mt-2 text-xs font-semibold text-red-700" role="alert">
          {t("workspace.requestPresetNameRequired")}
        </p>
      ) : status !== "idle" ? (
        <p
          className={`mt-2 text-xs font-semibold ${
            status === "error" ? "text-red-700" : "text-emerald-700"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {t(
            status === "error"
              ? "workspace.requestPresetStorageError"
              : status === "deleted"
                ? "workspace.requestPresetDeleted"
                : "workspace.requestPresetSaved",
          )}
        </p>
      ) : null}
    </div>
  );
}
