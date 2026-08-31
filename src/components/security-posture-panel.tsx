"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import type {
  SecurityAccess,
  SecurityFindingCode,
  SecurityPostureOperation,
  SecurityPostureReport,
  SecurityPostureScheme,
} from "@/lib/security-posture";
import {
  createSecurityPostureMarkdown,
  downloadSecurityPostureFile,
} from "@/lib/security-posture-export";
import type { TranslationKey } from "@/lib/translations";

type OperationFilter = "all" | "issues" | SecurityAccess;

const OPERATION_PREVIEW_LIMIT = 8;

const accessTranslationKeys: Record<SecurityAccess, TranslationKey> = {
  optional: "workspace.securityAccessOptional",
  public: "workspace.securityAccessPublic",
  secured: "workspace.securityAccessSecured",
};

const accessClasses: Record<SecurityAccess, string> = {
  optional: "bg-amber-100 text-amber-800",
  public: "bg-sky-100 text-sky-800",
  secured: "bg-emerald-100 text-emerald-800",
};

const findingTranslationKeys: Record<SecurityFindingCode, TranslationKey> = {
  "incomplete-api-key": "workspace.securityFindingIncompleteApiKey",
  "incomplete-http": "workspace.securityFindingIncompleteHttp",
  "optional-authentication": "workspace.securityFindingOptional",
  "undefined-scheme": "workspace.securityFindingUndefined",
  "unsupported-scheme": "workspace.securityFindingUnsupported",
  "unused-scheme": "workspace.securityFindingUnused",
};

function getCoverageClasses(report: SecurityPostureReport) {
  if (report.findingCounts.error > 0) {
    return "bg-red-100 text-red-700";
  }

  if (report.coveragePercentage >= 80) {
    return "bg-emerald-100 text-emerald-800";
  }

  return "bg-amber-100 text-amber-800";
}

export function SecurityPosturePanel({
  onSelectEndpoint,
  report,
  schema,
}: {
  onSelectEndpoint: (method: string, path: string) => void;
  report: SecurityPostureReport;
  schema: { title: string; version: string };
}) {
  const { language, t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<OperationFilter>("all");
  const [activeScheme, setActiveScheme] = useState("all");
  const [actionStatus, setActionStatus] = useState<
    "copy-error" | "copy-success" | "export-error" | "export-success" | "idle"
  >("idle");
  const [showAll, setShowAll] = useState(false);
  const schemeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...report.schemes.map((scheme) => scheme.name),
          ...report.undefinedSchemeNames,
        ]),
      ),
    [report.schemes, report.undefinedSchemeNames],
  );
  const reviewCount = report.operations.filter(
    (operation) => operation.issueCodes.length > 0,
  ).length;
  const filters: Array<{
    count: number;
    label: TranslationKey;
    value: OperationFilter;
  }> = [
    {
      count: report.totalCount,
      label: "workspace.securityFilterAll",
      value: "all",
    },
    {
      count: report.securedCount,
      label: "workspace.securityFilterSecured",
      value: "secured",
    },
    {
      count: report.optionalCount,
      label: "workspace.securityFilterOptional",
      value: "optional",
    },
    {
      count: report.publicCount,
      label: "workspace.securityFilterPublic",
      value: "public",
    },
    {
      count: reviewCount,
      label: "workspace.securityFilterIssues",
      value: "issues",
    },
  ];
  const filteredOperations = report.operations.filter((operation) => {
    const matchesAccess =
      activeFilter === "all" ||
      (activeFilter === "issues"
        ? operation.issueCodes.length > 0
        : operation.access === activeFilter);
    const matchesScheme =
      activeScheme === "all" || operation.requirements.includes(activeScheme);

    return matchesAccess && matchesScheme;
  });
  const visibleOperations = showAll
    ? filteredOperations
    : filteredOperations.slice(0, OPERATION_PREVIEW_LIMIT);

  function getFindingMessage(code: SecurityFindingCode, schemeName = "") {
    return t(findingTranslationKeys[code], { scheme: schemeName });
  }

  function getSchemeDetails(scheme: SecurityPostureScheme) {
    if (scheme.type === "apiKey") {
      return scheme.location && scheme.parameterName
        ? `${scheme.location}: ${scheme.parameterName}`
        : t("workspace.securityIncompleteDefinition");
    }

    if (scheme.type === "http") {
      return (
        [scheme.scheme, scheme.bearerFormat].filter(Boolean).join(" · ") ||
        t("workspace.securityIncompleteDefinition")
      );
    }

    return scheme.type;
  }

  function getRequirementText(operation: SecurityPostureOperation) {
    const requirements = operation.requirementGroups
      .filter((group) => group.length > 0)
      .map((group) => group.join(` ${t("workspace.securityAnd")} `))
      .join(` ${t("workspace.securityOr")} `);

    if (operation.access === "public") {
      return t("workspace.securityRequirementPublic");
    }

    return t(
      operation.access === "optional"
        ? "workspace.securityRequirementOptional"
        : "workspace.securityRequirementSecured",
      { requirements },
    );
  }

  function handleFilterChange(filter: OperationFilter) {
    setActiveFilter(filter);
    setShowAll(false);
  }

  function handleSchemeChange(schemeName: string) {
    setActiveScheme(schemeName);
    setShowAll(false);
  }

  async function handleCopy() {
    const copied = await writeTextToClipboard(
      createSecurityPostureMarkdown(report, schema, language),
    );

    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  function handleExport() {
    const downloaded = downloadSecurityPostureFile(report, schema);

    setActionStatus(downloaded ? "export-success" : "export-error");
  }

  return (
    <section
      aria-labelledby="security-posture-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="security-posture-title"
            >
              {t("workspace.securityTitle")}
            </h3>
            <span
              className={`rounded-md px-3 py-1 text-sm font-extrabold ${getCoverageClasses(report)}`}
            >
              {t("workspace.securityCoverage", {
                percentage: String(report.coveragePercentage),
              })}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.securityFindingsSummary", {
              count: String(report.findings.length),
              errors: String(report.findingCounts.error),
              warnings: String(report.findingCounts.warning),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            type="button"
            onClick={handleCopy}
          >
            {t("workspace.securityCopy")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleExport}
          >
            {t("workspace.securityExport")}
          </button>
        </div>
      </div>

      {actionStatus !== "idle" ? (
        <p
          className={`mt-2 text-sm font-semibold ${
            actionStatus.endsWith("error") ? "text-red-700" : "text-emerald-700"
          }`}
          role={actionStatus.endsWith("error") ? "alert" : "status"}
        >
          {t(
            actionStatus === "copy-error"
              ? "workspace.securityCopyError"
              : actionStatus === "copy-success"
                ? "workspace.securityCopySuccess"
                : actionStatus === "export-error"
                  ? "workspace.securityExportError"
                  : "workspace.securityExportSuccess",
          )}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {[
          ["workspace.securityStatSecured", report.securedCount],
          ["workspace.securityStatOptional", report.optionalCount],
          ["workspace.securityStatPublic", report.publicCount],
          ["workspace.securityStatSchemes", report.usedSchemeCount],
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
          {t("workspace.securitySchemesTitle")}
        </h4>
        <span className="text-xs font-bold text-[color:var(--color-brand-muted)]">
          {t("workspace.securitySchemesSummary", {
            total: String(report.schemes.length),
            used: String(report.usedSchemeCount),
          })}
        </span>
      </div>

      {report.schemes.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-[color:var(--color-brand-muted)]">
          {t("workspace.securityNoSchemes")}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[color:var(--color-brand-border)] border-y border-[color:var(--color-brand-border)]">
          {report.schemes.map((scheme) => (
            <li className="py-3" key={scheme.name}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="break-all text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                      {scheme.name}
                    </code>
                    <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-extrabold text-violet-800">
                      {scheme.type}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs font-semibold text-[color:var(--color-brand-muted)]">
                    {getSchemeDetails(scheme)}
                    {scheme.description ? ` · ${scheme.description}` : ""}
                  </p>
                </div>
                <span className="text-xs font-bold text-[color:var(--color-brand-muted)]">
                  {t("workspace.securitySchemeUsage", {
                    count: String(scheme.operationCount),
                    type: scheme.type,
                  })}
                </span>
              </div>
              {scheme.issueCodes.length > 0 ? (
                <div className="mt-2 grid gap-1">
                  {scheme.issueCodes.map((code) => (
                    <p
                      className="text-xs font-semibold text-amber-800"
                      key={code}
                    >
                      {getFindingMessage(code, scheme.name)}
                    </p>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <h4 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
          {t("workspace.securityOperationsTitle")}
        </h4>
        <label className="grid min-w-[12rem] gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
          {t("workspace.securitySchemeFilterLabel")}
          <select
            className="h-9 min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            value={activeScheme}
            onChange={(event) => handleSchemeChange(event.target.value)}
          >
            <option value="all">{t("workspace.securityAllSchemes")}</option>
            {schemeOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        aria-label={t("workspace.securityFilterLabel")}
        className="mt-3 flex flex-wrap gap-2"
        role="group"
      >
        {filters.map((filter) => (
          <button
            aria-pressed={activeFilter === filter.value}
            className={`h-9 rounded-md px-3 text-xs font-extrabold transition ${
              activeFilter === filter.value
                ? "bg-[color:var(--color-brand-navy)] text-white"
                : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            }`}
            key={filter.value}
            type="button"
            onClick={() => handleFilterChange(filter.value)}
          >
            {t(filter.label, { count: String(filter.count) })}
          </button>
        ))}
      </div>

      {filteredOperations.length === 0 ? (
        <p
          className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.securityNoOperations")}
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-[color:var(--color-brand-border)]">
            {visibleOperations.map((operation) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={`${operation.method}-${operation.path}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-extrabold ${accessClasses[operation.access]}`}
                    >
                      {t(accessTranslationKeys[operation.access])}
                    </span>
                    <code className="break-all text-xs font-bold text-[color:var(--color-brand-navy)]">
                      {operation.method} {operation.path}
                    </code>
                  </div>
                  <p className="mt-1 break-words text-sm font-semibold text-[color:var(--color-brand-navy)]">
                    {operation.summary}
                  </p>
                  <p className="mt-1 break-words text-xs font-semibold text-[color:var(--color-brand-muted)]">
                    {getRequirementText(operation)}
                  </p>
                  {operation.issueCodes.map((code) => (
                    <p
                      className="mt-1 text-xs font-semibold text-amber-800"
                      key={code}
                    >
                      {getFindingMessage(
                        code,
                        code === "undefined-scheme"
                          ? operation.undefinedSchemes.join(", ")
                          : "",
                      )}
                    </p>
                  ))}
                </div>
                <button
                  className="h-9 shrink-0 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:border-[color:var(--color-brand-purple)] hover:bg-[color:var(--color-brand-soft)]"
                  type="button"
                  onClick={() =>
                    onSelectEndpoint(operation.method, operation.path)
                  }
                >
                  {t("workspace.securityViewEndpoint")}
                </button>
              </li>
            ))}
          </ul>
          {filteredOperations.length > OPERATION_PREVIEW_LIMIT ? (
            <button
              className="mt-2 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? t("workspace.securityShowLess")
                : t("workspace.securityShowAll", {
                    count: String(filteredOperations.length),
                  })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
