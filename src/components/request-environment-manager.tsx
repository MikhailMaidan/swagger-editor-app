"use client";

import { useId, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  createRequestEnvironment,
  createRequestEnvironmentHeader,
  getActiveRequestEnvironment,
  getEnabledRequestEnvironmentHeaders,
  isValidRequestHeaderName,
  isValidRequestHeaderValue,
  removeRequestEnvironment,
  upsertRequestEnvironment,
  type RequestEnvironment,
  type RequestEnvironmentSettings,
} from "@/lib/request-environments";
import { isPublicHttpServerUrl } from "@/lib/server-url";
import type { TranslationKey } from "@/lib/translations";

type FormError = "header" | "name" | "none" | "serverUrl";

const formErrorKeys: Record<Exclude<FormError, "none">, TranslationKey> = {
  header: "workspace.environmentHeaderInvalid",
  name: "workspace.environmentNameRequired",
  serverUrl: "workspace.environmentServerInvalid",
};

function copyEnvironment(environment: RequestEnvironment) {
  return {
    ...environment,
    headers: environment.headers.map((header) => ({ ...header })),
  };
}

export function RequestEnvironmentManager({
  hasCustomServerOverride,
  onSettingsChange,
  settings,
  storageError,
}: {
  hasCustomServerOverride: boolean;
  onSettingsChange: (settings: RequestEnvironmentSettings) => void;
  settings: RequestEnvironmentSettings;
  storageError: boolean;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [draft, setDraft] = useState<RequestEnvironment | null>(null);
  const [formError, setFormError] = useState<FormError>("none");
  const [showSavedStatus, setShowSavedStatus] = useState(false);
  const activeEnvironment = getActiveRequestEnvironment(settings);
  const activeHeaderCount =
    getEnabledRequestEnvironmentHeaders(activeEnvironment).length;

  function startCreating() {
    setDraft(createRequestEnvironment());
    setFormError("none");
    setShowSavedStatus(false);
  }

  function startEditing(environment: RequestEnvironment) {
    const editableEnvironment = copyEnvironment(environment);

    if (editableEnvironment.headers.length === 0) {
      editableEnvironment.headers.push(createRequestEnvironmentHeader());
    }

    setDraft(editableEnvironment);
    setFormError("none");
    setShowSavedStatus(false);
  }

  function updateDraft(updater: (environment: RequestEnvironment) => void) {
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const nextDraft = copyEnvironment(currentDraft);
      updater(nextDraft);
      return nextDraft;
    });
    setFormError("none");
    setShowSavedStatus(false);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft) {
      return;
    }

    const name = draft.name.trim();
    const serverUrl = draft.serverUrl.trim();

    if (!name) {
      setFormError("name");
      return;
    }

    if (serverUrl && !isPublicHttpServerUrl(serverUrl)) {
      setFormError("serverUrl");
      return;
    }

    const headers = draft.headers.flatMap((header) => {
      const headerName = header.name.trim();
      const headerValue = header.value.trim();

      if (!headerName && !headerValue) {
        return [];
      }

      return [{ ...header, name: headerName, value: headerValue }];
    });

    if (
      headers.some(
        (header) =>
          !isValidRequestHeaderName(header.name) ||
          !isValidRequestHeaderValue(header.value),
      )
    ) {
      setFormError("header");
      return;
    }

    onSettingsChange(
      upsertRequestEnvironment(settings, {
        ...draft,
        headers,
        name,
        serverUrl,
      }),
    );
    setDraft(null);
    setFormError("none");
    setShowSavedStatus(true);
  }

  function handleDelete(environment: RequestEnvironment) {
    if (
      !window.confirm(
        t("workspace.environmentDeleteConfirm", { name: environment.name }),
      )
    ) {
      return;
    }

    onSettingsChange(removeRequestEnvironment(settings, environment.id));

    if (draft?.id === environment.id) {
      setDraft(null);
    }

    setFormError("none");
    setShowSavedStatus(false);
  }

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
            id={`${formId}-title`}
          >
            {t("workspace.environmentTitle")}
          </h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.environmentDescription")}
          </p>
        </div>
        <button
          className="h-9 border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
          type="button"
          onClick={startCreating}
        >
          {t("workspace.environmentNew")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-bold text-[color:var(--color-brand-navy)]">
          <span className="mb-1 block">
            {t("workspace.environmentSelector")}
          </span>
          <select
            aria-label={t("workspace.environmentSelector")}
            className="h-10 w-full min-w-0 border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            value={settings.activeEnvironmentId}
            onChange={(event) => {
              onSettingsChange({
                ...settings,
                activeEnvironmentId: event.target.value,
              });
              setShowSavedStatus(false);
            }}
          >
            <option value="">{t("workspace.environmentNone")}</option>
            {settings.environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </label>
        {activeEnvironment ? (
          <>
            <button
              className="h-10 border border-[color:var(--color-brand-border)] px-3 text-xs font-bold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              type="button"
              onClick={() => startEditing(activeEnvironment)}
            >
              {t("workspace.environmentEdit")}
            </button>
            <button
              className="h-10 border border-red-300 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50"
              type="button"
              onClick={() => handleDelete(activeEnvironment)}
            >
              {t("workspace.environmentDelete")}
            </button>
          </>
        ) : null}
      </div>

      {activeEnvironment ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
          <p>
            {t("workspace.environmentBaseUrlSummary", {
              url:
                activeEnvironment.serverUrl ||
                t("workspace.environmentSchemaServer"),
            })}
          </p>
          <p>
            {t("workspace.environmentHeaderCount", {
              count: String(activeHeaderCount),
            })}
          </p>
          {hasCustomServerOverride && activeEnvironment.serverUrl ? (
            <p className="font-bold text-amber-700">
              {t("workspace.environmentCustomOverrideNotice")}
            </p>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <form
          aria-label={t(
            settings.environments.some(
              (environment) => environment.id === draft.id,
            )
              ? "workspace.environmentEditForm"
              : "workspace.environmentNewForm",
          )}
          className="mt-5 border-t border-[color:var(--color-brand-border)] pt-4"
          noValidate
          onSubmit={handleSave}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-[color:var(--color-brand-navy)]">
              <span className="mb-1 block">
                {t("workspace.environmentName")}
              </span>
              <input
                autoFocus
                className="h-10 w-full border border-[color:var(--color-brand-border)] px-3 text-sm outline-none focus:border-[color:var(--color-brand-purple)]"
                placeholder={t("workspace.environmentNamePlaceholder")}
                value={draft.name}
                onChange={(event) =>
                  updateDraft((environment) => {
                    environment.name = event.target.value;
                  })
                }
              />
            </label>
            <label className="text-xs font-bold text-[color:var(--color-brand-navy)]">
              <span className="mb-1 block">
                {t("workspace.environmentServerUrl")}
              </span>
              <input
                className="h-10 w-full border border-[color:var(--color-brand-border)] px-3 font-mono text-xs outline-none focus:border-[color:var(--color-brand-purple)]"
                placeholder={t("workspace.environmentServerUrlPlaceholder")}
                type="url"
                value={draft.serverUrl}
                onChange={(event) =>
                  updateDraft((environment) => {
                    environment.serverUrl = event.target.value;
                  })
                }
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                {t("workspace.environmentSharedHeaders")}
              </p>
              <p className="text-xs font-semibold text-[color:var(--color-brand-muted)]">
                {t("workspace.environmentLocalOnly")}
              </p>
            </div>
            <button
              className="h-9 border border-[color:var(--color-brand-border)] px-3 text-xs font-bold text-[color:var(--color-brand-purple)] transition hover:border-[color:var(--color-brand-purple)]"
              type="button"
              onClick={() =>
                updateDraft((environment) => {
                  environment.headers.push(createRequestEnvironmentHeader());
                })
              }
            >
              {t("workspace.environmentAddHeader")}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {draft.headers.map((header, headerIndex) => (
              <div
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 md:grid-cols-[auto_minmax(0,0.8fr)_minmax(0,1.2fr)_auto]"
                key={header.id}
              >
                <label className="flex h-10 items-center gap-2 px-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
                  <input
                    aria-label={t("workspace.environmentHeaderEnabled", {
                      index: String(headerIndex + 1),
                    })}
                    checked={header.enabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((environment) => {
                        environment.headers[headerIndex].enabled =
                          event.target.checked;
                      })
                    }
                  />
                  <span className="hidden sm:inline">
                    {t("workspace.environmentHeaderEnabledLabel")}
                  </span>
                </label>
                <label className="min-w-0 text-xs font-bold text-[color:var(--color-brand-navy)]">
                  <span className="mb-1 block">
                    {t("workspace.environmentHeaderName")}
                  </span>
                  <input
                    aria-label={t("workspace.environmentHeaderNameLabel", {
                      index: String(headerIndex + 1),
                    })}
                    autoComplete="off"
                    className="h-10 w-full min-w-0 border border-[color:var(--color-brand-border)] px-3 font-mono text-xs outline-none focus:border-[color:var(--color-brand-purple)]"
                    placeholder={t(
                      "workspace.environmentHeaderNamePlaceholder",
                    )}
                    spellCheck={false}
                    value={header.name}
                    onChange={(event) =>
                      updateDraft((environment) => {
                        environment.headers[headerIndex].name =
                          event.target.value;
                      })
                    }
                  />
                </label>
                <label className="col-span-2 min-w-0 text-xs font-bold text-[color:var(--color-brand-navy)] md:col-span-1">
                  <span className="mb-1 block">
                    {t("workspace.environmentHeaderValue")}
                  </span>
                  <input
                    aria-label={t("workspace.environmentHeaderValueLabel", {
                      index: String(headerIndex + 1),
                    })}
                    autoComplete="off"
                    className="h-10 w-full min-w-0 border border-[color:var(--color-brand-border)] px-3 font-mono text-xs outline-none focus:border-[color:var(--color-brand-purple)]"
                    placeholder={t(
                      "workspace.environmentHeaderValuePlaceholder",
                    )}
                    spellCheck={false}
                    value={header.value}
                    onChange={(event) =>
                      updateDraft((environment) => {
                        environment.headers[headerIndex].value =
                          event.target.value;
                      })
                    }
                  />
                </label>
                <button
                  aria-label={t("workspace.environmentRemoveHeader", {
                    index: String(headerIndex + 1),
                  })}
                  className="h-10 border border-red-200 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50"
                  type="button"
                  onClick={() =>
                    updateDraft((environment) => {
                      environment.headers.splice(headerIndex, 1);
                    })
                  }
                >
                  {t("workspace.environmentRemove")}
                </button>
              </div>
            ))}
          </div>

          {formError !== "none" ? (
            <p className="mt-3 text-xs font-semibold text-red-700" role="alert">
              {t(formErrorKeys[formError])}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="h-10 bg-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-white transition hover:bg-[color:var(--color-brand-purple-dark)]"
              type="submit"
            >
              {t("workspace.environmentSave")}
            </button>
            <button
              className="h-10 border border-[color:var(--color-brand-border)] px-4 text-sm font-bold text-[color:var(--color-brand-muted)] transition hover:text-[color:var(--color-brand-navy)]"
              type="button"
              onClick={() => {
                setDraft(null);
                setFormError("none");
              }}
            >
              {t("workspace.environmentCancel")}
            </button>
          </div>
        </form>
      ) : null}

      {storageError ? (
        <p className="mt-3 text-xs font-semibold text-red-700" role="alert">
          {t("workspace.environmentStorageError")}
        </p>
      ) : showSavedStatus ? (
        <p
          className="mt-3 text-xs font-semibold text-emerald-700"
          role="status"
        >
          {t("workspace.environmentSaved")}
        </p>
      ) : null}
    </section>
  );
}
