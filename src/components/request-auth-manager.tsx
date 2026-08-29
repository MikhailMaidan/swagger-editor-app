"use client";

import { useId, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { SecuritySchemeSummary } from "@/lib/openapi";
import {
  EMPTY_REQUEST_AUTH_CREDENTIAL,
  hasUsableRequestAuthCredential,
  isSupportedSecurityScheme,
  type RequestAuthCredential,
  type RequestAuthValues,
} from "@/lib/request-auth";

function getSchemeSummary(
  scheme: SecuritySchemeSummary,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (scheme.type === "apiKey") {
    const location =
      scheme.location === "header"
        ? t("workspace.header")
        : scheme.location === "query"
          ? t("workspace.query")
          : t("workspace.cookie");

    return t("workspace.requestAuthApiKeySummary", {
      location,
      name: scheme.parameterName,
    });
  }

  if (scheme.type === "http" && scheme.scheme === "basic") {
    return t("workspace.requestAuthBasicSummary");
  }

  if (scheme.type === "http" && scheme.scheme === "bearer") {
    return t("workspace.requestAuthBearerSummary", {
      format: scheme.bearerFormat || t("workspace.requestAuthToken"),
    });
  }

  if (scheme.type === "oauth2") {
    return t("workspace.requestAuthOAuthSummary");
  }

  if (scheme.type === "openIdConnect") {
    return t("workspace.requestAuthOpenIdSummary");
  }

  return t("workspace.requestAuthUnsupportedSummary");
}

export function RequestAuthManager({
  onChange,
  schemes,
  values,
}: {
  onChange: (values: RequestAuthValues) => void;
  schemes: SecuritySchemeSummary[];
  values: RequestAuthValues;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [revealedSecrets, setRevealedSecrets] = useState<
    Record<string, boolean>
  >({});
  const configuredCount = schemes.filter((scheme) =>
    hasUsableRequestAuthCredential(scheme, values[scheme.name]),
  ).length;

  if (schemes.length === 0) {
    return null;
  }

  function updateCredential(
    schemeName: string,
    update: Partial<RequestAuthCredential>,
  ) {
    onChange({
      ...values,
      [schemeName]: {
        ...EMPTY_REQUEST_AUTH_CREDENTIAL,
        ...values[schemeName],
        ...update,
      },
    });
  }

  function toggleSecret(schemeName: string) {
    setRevealedSecrets((current) => ({
      ...current,
      [schemeName]: !current[schemeName],
    }));
  }

  return (
    <section
      aria-labelledby={titleId}
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
            id={titleId}
          >
            {t("workspace.requestAuthTitle")}
          </h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.requestAuthDescription")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-extrabold text-emerald-700" role="status">
            {t("workspace.requestAuthConfiguredCount", {
              count: String(configuredCount),
            })}
          </p>
          <button
            className="h-9 border border-[color:var(--color-brand-border)] px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={Object.keys(values).length === 0}
            type="button"
            onClick={() => {
              onChange({});
              setRevealedSecrets({});
            }}
          >
            {t("workspace.requestAuthClear")}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {schemes.map((scheme) => {
          const credential =
            values[scheme.name] ?? EMPTY_REQUEST_AUTH_CREDENTIAL;
          const supported = isSupportedSecurityScheme(scheme);
          const isBasic = scheme.type === "http" && scheme.scheme === "basic";
          const isRevealed = revealedSecrets[scheme.name] === true;

          return (
            <div
              className="rounded-lg border border-[color:var(--color-brand-border)] bg-white p-3"
              key={scheme.name}
            >
              <div className="flex min-w-0 items-start gap-3">
                <input
                  aria-label={t("workspace.requestAuthEnable", {
                    name: scheme.name,
                  })}
                  checked={supported && credential.enabled}
                  className="mt-1 h-4 w-4 accent-[color:var(--color-brand-purple)]"
                  disabled={!supported}
                  type="checkbox"
                  onChange={(event) =>
                    updateCredential(scheme.name, {
                      enabled: event.target.checked,
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                    {scheme.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
                    {getSchemeSummary(scheme, t)}
                  </p>
                  {scheme.description ? (
                    <p className="mt-1 text-xs text-[color:var(--color-brand-muted)]">
                      {scheme.description}
                    </p>
                  ) : null}
                </div>
              </div>

              {supported ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  {isBasic ? (
                    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                      <label className="min-w-0 text-xs font-bold text-[color:var(--color-brand-navy)]">
                        <span className="mb-1 block">
                          {t("workspace.requestAuthUsername")}
                        </span>
                        <input
                          aria-label={t("workspace.requestAuthUsernameFor", {
                            name: scheme.name,
                          })}
                          autoComplete="off"
                          className="h-10 w-full min-w-0 border border-[color:var(--color-brand-border)] px-3 text-sm outline-none focus:border-[color:var(--color-brand-purple)] disabled:bg-slate-50"
                          disabled={!credential.enabled}
                          maxLength={8192}
                          type="text"
                          value={credential.username}
                          onChange={(event) =>
                            updateCredential(scheme.name, {
                              username: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="min-w-0 text-xs font-bold text-[color:var(--color-brand-navy)]">
                        <span className="mb-1 block">
                          {t("workspace.requestAuthPassword")}
                        </span>
                        <input
                          aria-label={t("workspace.requestAuthPasswordFor", {
                            name: scheme.name,
                          })}
                          autoComplete="off"
                          className="h-10 w-full min-w-0 border border-[color:var(--color-brand-border)] px-3 text-sm outline-none focus:border-[color:var(--color-brand-purple)] disabled:bg-slate-50"
                          disabled={!credential.enabled}
                          maxLength={8192}
                          type={isRevealed ? "text" : "password"}
                          value={credential.password}
                          onChange={(event) =>
                            updateCredential(scheme.name, {
                              password: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="min-w-0 text-xs font-bold text-[color:var(--color-brand-navy)]">
                      <span className="mb-1 block">
                        {scheme.type === "apiKey"
                          ? t("workspace.requestAuthApiKey")
                          : t("workspace.requestAuthAccessToken")}
                      </span>
                      <input
                        aria-label={t("workspace.requestAuthSecretFor", {
                          name: scheme.name,
                        })}
                        autoComplete="off"
                        className="h-10 w-full min-w-0 border border-[color:var(--color-brand-border)] px-3 text-sm outline-none focus:border-[color:var(--color-brand-purple)] disabled:bg-slate-50"
                        disabled={!credential.enabled}
                        maxLength={8192}
                        placeholder={t(
                          "workspace.requestAuthSecretPlaceholder",
                        )}
                        type={isRevealed ? "text" : "password"}
                        value={credential.token}
                        onChange={(event) =>
                          updateCredential(scheme.name, {
                            token: event.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  <button
                    aria-label={t(
                      isRevealed
                        ? "workspace.requestAuthHideFor"
                        : "workspace.requestAuthShowFor",
                      { name: scheme.name },
                    )}
                    className="h-10 self-end border border-[color:var(--color-brand-border)] px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!credential.enabled}
                    type="button"
                    onClick={() => toggleSecret(scheme.name)}
                  >
                    {t(
                      isRevealed
                        ? "workspace.requestAuthHide"
                        : "workspace.requestAuthShow",
                    )}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-semibold text-[color:var(--color-brand-muted)]">
        {t("workspace.requestAuthSessionOnly")}
      </p>
    </section>
  );
}
