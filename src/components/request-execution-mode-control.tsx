"use client";

import { useI18n } from "@/components/i18n-provider";
import type { RequestExecutionMode } from "@/lib/request-execution-mode";

const modes: RequestExecutionMode[] = ["live", "mock"];

export function RequestExecutionModeControl({
  mode,
  storageError,
  onChange,
}: {
  mode: RequestExecutionMode;
  storageError: boolean;
  onChange: (mode: RequestExecutionMode) => void;
}) {
  const { t } = useI18n();

  return (
    <section
      aria-label={t("workspace.executionMode")}
      className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-[color:var(--color-brand-border)] py-4"
    >
      <h3 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("workspace.executionMode")}
      </h3>
      <div
        aria-label={t("workspace.executionMode")}
        className="inline-flex h-10 items-center rounded-lg border border-[color:var(--color-brand-border)] bg-white p-1"
        role="group"
      >
        {modes.map((availableMode) => (
          <button
            aria-pressed={mode === availableMode}
            className={`h-8 rounded-md px-4 text-xs font-extrabold transition ${
              mode === availableMode
                ? "bg-[color:var(--color-brand-purple)] text-white"
                : "text-[color:var(--color-brand-muted)] hover:bg-[color:var(--color-brand-soft)]"
            }`}
            key={availableMode}
            type="button"
            onClick={() => onChange(availableMode)}
          >
            {t(
              availableMode === "live"
                ? "workspace.executionModeLive"
                : "workspace.executionModeMock",
            )}
          </button>
        ))}
      </div>
      {storageError ? (
        <p className="w-full text-xs font-semibold text-red-700" role="alert">
          {t("workspace.executionModeStorageError")}
        </p>
      ) : null}
    </section>
  );
}
