"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import { createStyleGuideReport } from "@/lib/api-style-guide";
import type { StyleViolation } from "@/lib/api-style-guide";
import {
  DEFAULT_STYLE_GUIDE_CONFIG,
  MAX_STYLE_GUIDE_CONFIG_BYTES,
  NAMING_CONVENTIONS,
  parseStyleGuideConfig,
  readStyleGuideConfigPreference,
  saveStyleGuideConfigPreference,
  STYLE_GUIDE_CONVENTION_KEYS,
  STYLE_RULE_CATEGORIES,
  type NamingConvention,
  type StyleGuideConfig,
  type StyleRuleCategory,
  type StyleRuleId,
  type StyleSeverity,
} from "@/lib/api-style-guide-config";
import {
  createStyleGuideMarkdown,
  downloadStyleGuideReport,
  downloadStyleGuideRuleset,
  formatStyleViolation,
  styleCategoryKeys,
  styleConventionKeys,
  styleRuleTitleKeys,
  styleSeverityKeys,
} from "@/lib/api-style-guide-export";
import { writeTextToClipboard } from "@/lib/clipboard";
import { isCancelRequestShortcut } from "@/lib/keyboard-shortcut";
import type { TranslationKey } from "@/lib/translations";

type SeverityFilter = "all" | StyleSeverity;
type CategoryFilter = "all" | StyleRuleCategory;
type ActionStatus =
  | "copy-error"
  | "copy-success"
  | "export-error"
  | "export-success"
  | "idle"
  | "import-invalid"
  | "import-read-error"
  | "import-success"
  | "import-too-large"
  | "reveal-error"
  | "ruleset-export-error"
  | "ruleset-export-success";

const FINDING_PREVIEW_LIMIT = 8;

const actionMessageKeys: Record<
  Exclude<ActionStatus, "idle">,
  TranslationKey
> = {
  "copy-error": "workspace.styleCopyError",
  "copy-success": "workspace.styleCopySuccess",
  "export-error": "workspace.styleExportError",
  "export-success": "workspace.styleExportSuccess",
  "import-invalid": "workspace.styleImportInvalid",
  "import-read-error": "workspace.styleImportReadError",
  "import-success": "workspace.styleImportSuccess",
  "import-too-large": "workspace.styleImportTooLarge",
  "reveal-error": "workspace.styleRevealError",
  "ruleset-export-error": "workspace.styleRulesetExportError",
  "ruleset-export-success": "workspace.styleRulesetExportSuccess",
};

const severityOrder: Record<StyleSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const severityBadgeClasses: Record<StyleSeverity, string> = {
  error: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-800",
  warning: "bg-amber-100 text-amber-800",
};

const severityAccentClasses: Record<StyleSeverity, string> = {
  error: "border-l-red-400",
  info: "border-l-sky-300",
  warning: "border-l-amber-400",
};

const methodClasses: Record<string, string> = {
  DELETE: "bg-red-100 text-red-700",
  GET: "bg-emerald-100 text-emerald-800",
  HEAD: "bg-teal-100 text-teal-800",
  OPTIONS: "bg-slate-100 text-slate-700",
  PATCH: "bg-amber-100 text-amber-800",
  POST: "bg-sky-100 text-sky-800",
  PUT: "bg-violet-100 text-violet-800",
  TRACE: "bg-pink-100 text-pink-800",
};

function getScoreColor(score: number) {
  if (score >= 90) {
    return "#059669";
  }

  return score >= 70 ? "#d97706" : "#dc2626";
}

function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unreadable file."));
    reader.onerror = () => reject(new Error("Unreadable file."));
    reader.onabort = () => reject(new Error("Unreadable file."));
    reader.readAsText(file);
  });
}

// Memoized because the workspace re-renders on every editor keystroke, while
// the report only changes when the parsed schema or ruleset changes.
export const ApiStyleGuidePanel = memo(function ApiStyleGuidePanel({
  onRevealLocation,
  onSelectEndpoint,
  rootSchema,
  schemaTitle,
  schemaVersion,
}: {
  onRevealLocation: (pointer: string, target: "key" | "value") => boolean;
  onSelectEndpoint: (method: string, path: string) => void;
  rootSchema: Record<string, unknown>;
  schemaTitle: string;
  schemaVersion: string;
}) {
  const { language, t } = useI18n();
  const schema = useMemo(
    () => ({ title: schemaTitle, version: schemaVersion }),
    [schemaTitle, schemaVersion],
  );
  const [config, setConfig] = useState<StyleGuideConfig>(
    DEFAULT_STYLE_GUIDE_CONFIG,
  );
  const [storageError, setStorageError] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);
  const report = useMemo(
    () => createStyleGuideReport(rootSchema, config),
    [config, rootSchema],
  );
  const ruleCategories = useMemo(
    () => new Map(report.rules.map((rule) => [rule.id, rule.category])),
    [report.rules],
  );
  const categorySummaries = useMemo(
    () =>
      STYLE_RULE_CATEGORIES.map((category) => {
        const rules = report.rules.filter(
          (rule) => rule.category === category && rule.enabled,
        );
        const failingRules = rules.filter((rule) => rule.violationCount > 0);

        return {
          category,
          findingCount: failingRules.reduce(
            (total, rule) => total + rule.violationCount,
            0,
          ),
          passingCount: rules.length - failingRules.length,
          totalCount: rules.length,
          worstSeverity: failingRules
            .map((rule) => rule.severity)
            .sort(
              (left, right) => severityOrder[left] - severityOrder[right],
            )[0],
        };
      }),
    [report.rules],
  );
  const filteredViolations = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return report.violations
      .filter((violation) => {
        if (severityFilter !== "all" && violation.severity !== severityFilter) {
          return false;
        }

        if (
          categoryFilter !== "all" &&
          ruleCategories.get(violation.ruleId) !== categoryFilter
        ) {
          return false;
        }

        if (terms.length === 0) {
          return true;
        }

        const haystack = [
          t(styleRuleTitleKeys[violation.ruleId]),
          formatStyleViolation(violation, t),
          violation.method,
          violation.path,
          violation.pointer,
          ...Object.values(violation.params),
        ]
          .join(" ")
          .toLowerCase();

        return terms.every((term) => haystack.includes(term));
      })
      .map((violation, index) => ({ index, violation }))
      .sort(
        (left, right) =>
          severityOrder[left.violation.severity] -
            severityOrder[right.violation.severity] || left.index - right.index,
      )
      .map(({ violation }) => violation);
  }, [
    categoryFilter,
    query,
    report.violations,
    ruleCategories,
    severityFilter,
    t,
  ]);
  const visibleViolations = showAll
    ? filteredViolations
    : filteredViolations.slice(0, FINDING_PREVIEW_LIMIT);
  const findingCount =
    report.counts.error + report.counts.warning + report.counts.info;
  const scoreColor = getScoreColor(report.score);

  useEffect(() => {
    const storedConfig = readStyleGuideConfigPreference();
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setConfig(storedConfig);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function applyConfig(nextConfig: StyleGuideConfig) {
    setConfig(nextConfig);
    setStorageError(!saveStyleGuideConfigPreference(nextConfig));
    setShowAll(false);
  }

  function handleConventionChange(
    key: (typeof STYLE_GUIDE_CONVENTION_KEYS)[number],
    convention: NamingConvention,
  ) {
    applyConfig({ ...config, [key]: convention });
  }

  function handleRuleToggle(ruleId: StyleRuleId, enabled: boolean) {
    const disabledRules = new Set(config.disabledRules);

    if (enabled) {
      disabledRules.delete(ruleId);
    } else {
      disabledRules.add(ruleId);
    }

    applyConfig({
      ...config,
      disabledRules: report.rules
        .map((rule) => rule.id)
        .filter((id) => disabledRules.has(id)),
    });
  }

  async function handleCopy() {
    const copied = await writeTextToClipboard(
      createStyleGuideMarkdown(report, config, schema, language),
    );

    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  function handleExport() {
    setActionStatus(
      downloadStyleGuideReport(report, config, schema)
        ? "export-success"
        : "export-error",
    );
  }

  function handleExportRuleset() {
    setActionStatus(
      downloadStyleGuideRuleset(config)
        ? "ruleset-export-success"
        : "ruleset-export-error",
    );
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const generation = ++importGeneration.current;

    if (file.size > MAX_STYLE_GUIDE_CONFIG_BYTES) {
      setActionStatus("import-too-large");
      return;
    }

    try {
      const text = await readFileText(file);

      if (generation !== importGeneration.current) {
        return;
      }

      const parsed = parseStyleGuideConfig(text);

      if (!parsed.ok) {
        setActionStatus(
          parsed.issue === "too-large" ? "import-too-large" : "import-invalid",
        );
        return;
      }

      applyConfig(parsed.config);
      setActionStatus("import-success");
    } catch {
      if (generation === importGeneration.current) {
        setActionStatus("import-read-error");
      }
    }
  }

  function handleReveal(violation: StyleViolation) {
    setActionStatus(
      onRevealLocation(violation.pointer, violation.highlight)
        ? "idle"
        : "reveal-error",
    );
  }

  const severityFilters: Array<{
    count: number;
    label: TranslationKey;
    value: SeverityFilter;
  }> = [
    { count: findingCount, label: "workspace.styleFilterAll", value: "all" },
    {
      count: report.counts.error,
      label: "workspace.styleFilterError",
      value: "error",
    },
    {
      count: report.counts.warning,
      label: "workspace.styleFilterWarning",
      value: "warning",
    },
    {
      count: report.counts.info,
      label: "workspace.styleFilterInfo",
      value: "info",
    },
  ];

  return (
    <section
      aria-labelledby="api-style-guide-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 max-w-2xl items-start gap-4">
          <div
            aria-label={t("workspace.styleScoreLabel", {
              score: String(report.score),
            })}
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
            role="img"
            style={{
              background: `conic-gradient(${scoreColor} ${report.score * 3.6}deg, var(--color-brand-soft) 0deg)`,
            }}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-lg font-extrabold text-[color:var(--color-brand-navy)]">
              {report.score}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
                id="api-style-guide-title"
              >
                {t("workspace.styleTitle")}
              </h3>
              <span className="rounded-md bg-[color:var(--color-brand-soft)] px-2.5 py-1 text-xs font-extrabold text-[color:var(--color-brand-purple)]">
                {t("workspace.styleRulesPassing", {
                  enabled: String(report.enabledRuleCount),
                  passing: String(report.passingRuleCount),
                })}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-[color:var(--color-brand-muted)]">
              {t("workspace.styleDescription")}
            </p>
            <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.styleSummary", {
                errors: String(report.counts.error),
                findings: String(findingCount),
                notes: String(report.counts.info),
                warnings: String(report.counts.warning),
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            type="button"
            onClick={handleCopy}
          >
            {t("workspace.styleCopy")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleExport}
          >
            {t("workspace.styleExport")}
          </button>
        </div>
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

      {storageError ? (
        <p className="mt-2 text-xs font-semibold text-amber-800" role="alert">
          {t("workspace.styleStorageError")}
        </p>
      ) : null}

      {report.truncated ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {t("workspace.styleTruncated")}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {categorySummaries.map((summary) => {
          const isActive = categoryFilter === summary.category;
          const ratio =
            summary.totalCount === 0
              ? 1
              : summary.passingCount / summary.totalCount;

          return (
            <button
              aria-label={t("workspace.styleCategoryFilterAria", {
                category: t(styleCategoryKeys[summary.category]),
              })}
              aria-pressed={isActive}
              className={`rounded-xl border p-3 text-left transition ${
                isActive
                  ? "border-[color:var(--color-brand-purple)] bg-[color:var(--color-brand-soft)]"
                  : "border-[color:var(--color-brand-border)] bg-white hover:border-[color:var(--color-brand-purple)]"
              }`}
              key={summary.category}
              type="button"
              onClick={() => {
                setCategoryFilter(isActive ? "all" : summary.category);
                setShowAll(false);
              }}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                  {t(styleCategoryKeys[summary.category])}
                </span>
                <span
                  className={`min-w-6 rounded-full px-2 text-center text-xs font-extrabold leading-6 ${
                    summary.worstSeverity
                      ? severityBadgeClasses[summary.worstSeverity]
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {summary.findingCount}
                </span>
              </span>
              <span className="mt-1 block text-xs font-semibold text-[color:var(--color-brand-muted)]">
                {t("workspace.styleCategoryCardSummary", {
                  passing: String(summary.passingCount),
                  total: String(summary.totalCount),
                })}
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[color:var(--color-brand-soft)]">
                <span
                  className="block h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-purple),var(--color-brand-purple-dark))] transition-[width] duration-300"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-[color:var(--color-brand-border)] bg-[#fbfaff]">
        <button
          aria-controls={isConfigOpen ? "api-style-guide-config" : undefined}
          aria-expanded={isConfigOpen}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-extrabold text-[color:var(--color-brand-navy)] transition hover:text-[color:var(--color-brand-purple)]"
          type="button"
          onClick={() => setIsConfigOpen((current) => !current)}
        >
          {t("workspace.styleConfigure")}
          <span
            aria-hidden="true"
            className={`text-[color:var(--color-brand-purple)] transition ${
              isConfigOpen ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>
        {/* Rendered only while open: the rule list is the largest part of the
            panel and the workspace mounts every tool at once. */}
        {isConfigOpen ? (
          <div
            className="border-t border-[color:var(--color-brand-border)] px-4 py-4"
            id="api-style-guide-config"
          >
            <p className="text-xs font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.styleConfigureHint")}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {STYLE_GUIDE_CONVENTION_KEYS.map((key) => (
                <label
                  className="grid gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]"
                  key={key}
                >
                  {t(styleConventionKeys[key])}
                  <select
                    className="h-9 min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                    value={config[key]}
                    onChange={(event) =>
                      handleConventionChange(
                        key,
                        event.target.value as NamingConvention,
                      )
                    }
                  >
                    {NAMING_CONVENTIONS.map((convention) => (
                      <option key={convention} value={convention}>
                        {convention}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {STYLE_RULE_CATEGORIES.map((category) => (
                <fieldset className="min-w-0" key={category}>
                  <legend className="text-[11px] font-extrabold uppercase text-[color:var(--color-brand-purple)]">
                    {t(styleCategoryKeys[category])}
                  </legend>
                  <ul className="mt-1 divide-y divide-[color:var(--color-brand-border)]">
                    {report.rules
                      .filter((rule) => rule.category === category)
                      .map((rule) => (
                        <li
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                          key={rule.id}
                        >
                          <label className="flex min-w-0 items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
                            <input
                              aria-label={t("workspace.styleRuleToggle", {
                                rule: t(styleRuleTitleKeys[rule.id]),
                              })}
                              checked={rule.enabled}
                              className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                              type="checkbox"
                              onChange={(event) =>
                                handleRuleToggle(rule.id, event.target.checked)
                              }
                            />
                            <span className="min-w-0 break-words">
                              {t(styleRuleTitleKeys[rule.id])}
                            </span>
                          </label>
                          <span className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-extrabold ${severityBadgeClasses[rule.severity]}`}
                            >
                              {t(styleSeverityKeys[rule.severity])}
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                rule.enabled && rule.violationCount > 0
                                  ? "text-red-700"
                                  : "text-[color:var(--color-brand-muted)]"
                              }`}
                            >
                              {!rule.enabled
                                ? t("workspace.styleRuleDisabled")
                                : rule.violationCount > 0
                                  ? t("workspace.styleRuleFindings", {
                                      count: String(rule.violationCount),
                                    })
                                  : rule.checkedCount === 0
                                    ? t("workspace.styleRuleNotApplicable")
                                    : t("workspace.styleRulePassing")}
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </fieldset>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-extrabold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="button"
                onClick={() =>
                  applyConfig({
                    ...DEFAULT_STYLE_GUIDE_CONFIG,
                    disabledRules: [],
                  })
                }
              >
                {t("workspace.styleResetConfig")}
              </button>
              <button
                className="h-9 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="button"
                onClick={handleExportRuleset}
              >
                {t("workspace.styleExportRuleset")}
              </button>
              <button
                className="h-9 rounded-md border border-[color:var(--color-brand-purple)] bg-white px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                type="button"
                onClick={() => importInputRef.current?.click()}
              >
                {t("workspace.styleImportRuleset")}
              </button>
              <input
                accept=".json,application/json"
                aria-label={t("workspace.styleImportRulesetFile")}
                className="hidden"
                ref={importInputRef}
                type="file"
                onChange={handleImportFile}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div
          aria-label={t("workspace.styleSeverityFilterLabel")}
          className="flex flex-1 flex-wrap gap-2"
          role="group"
        >
          {severityFilters.map((filter) => (
            <button
              aria-pressed={severityFilter === filter.value}
              className={`h-9 rounded-md px-3 text-xs font-extrabold transition ${
                severityFilter === filter.value
                  ? "bg-[color:var(--color-brand-navy)] text-white"
                  : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              }`}
              key={filter.value}
              type="button"
              onClick={() => {
                setSeverityFilter(filter.value);
                setShowAll(false);
              }}
            >
              {t(filter.label, { count: String(filter.count) })}
            </button>
          ))}
        </div>
        <label className="grid min-w-[11rem] gap-1 text-xs font-bold text-[color:var(--color-brand-muted)]">
          {t("workspace.styleCategoryFilterLabel")}
          <select
            className="h-9 min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value as CategoryFilter);
              setShowAll(false);
            }}
          >
            <option value="all">{t("workspace.styleCategoryAll")}</option>
            {STYLE_RULE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(styleCategoryKeys[category])}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        aria-label={t("workspace.styleSearchLabel")}
        className="mt-3 h-10 w-full rounded-lg border border-[color:var(--color-brand-border)] bg-[#fbfaff] px-3 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
        placeholder={t("workspace.styleSearchPlaceholder")}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setShowAll(false);
        }}
        onKeyDown={(event) => {
          if (
            query &&
            !event.nativeEvent.isComposing &&
            isCancelRequestShortcut(event)
          ) {
            event.preventDefault();
            event.stopPropagation();
            setQuery("");
            setShowAll(false);
          }
        }}
      />

      {filteredViolations.length === 0 ? (
        <p
          className={`mt-4 text-sm font-semibold ${
            findingCount === 0
              ? "text-emerald-700"
              : "text-[color:var(--color-brand-muted)]"
          }`}
          role="status"
        >
          {t(
            findingCount === 0
              ? "workspace.styleNoFindings"
              : "workspace.styleNoMatches",
          )}
        </p>
      ) : (
        <>
          <ul className="mt-3 grid gap-2">
            {visibleViolations.map((violation) => (
              <li
                className={`rounded-lg border border-l-4 border-[color:var(--color-brand-border)] bg-white p-3 ${severityAccentClasses[violation.severity]}`}
                key={violation.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-extrabold ${severityBadgeClasses[violation.severity]}`}
                      >
                        {t(styleSeverityKeys[violation.severity])}
                      </span>
                      <span className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                        {t(styleRuleTitleKeys[violation.ruleId])}
                      </span>
                      {violation.method ? (
                        <code
                          className={`break-all rounded-md px-2 py-1 text-xs font-extrabold ${
                            methodClasses[violation.method] ??
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {violation.method} {violation.path}
                        </code>
                      ) : null}
                    </div>
                    <p className="mt-2 break-words text-sm font-semibold text-[color:var(--color-brand-navy)]">
                      {formatStyleViolation(violation, t)}
                    </p>
                    {violation.params.suggestion ? (
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs font-bold text-emerald-800">
                        {t("workspace.styleSuggestion", { suggestion: "" })}
                        <code className="break-all rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-900">
                          {violation.params.suggestion}
                        </code>
                      </p>
                    ) : null}
                    <p className="mt-1 break-all font-mono text-[11px] text-[color:var(--color-brand-muted)]">
                      {violation.pointer || "/"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      aria-label={t("workspace.styleRevealAriaLabel", {
                        pointer: violation.pointer || "/",
                        rule: t(styleRuleTitleKeys[violation.ruleId]),
                      })}
                      className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                      type="button"
                      onClick={() => handleReveal(violation)}
                    >
                      {t("workspace.styleReveal")}
                    </button>
                    {violation.method ? (
                      <button
                        aria-label={t("workspace.styleOpenEndpointAriaLabel", {
                          method: violation.method,
                          path: violation.path,
                        })}
                        className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:border-[color:var(--color-brand-purple)] hover:bg-[color:var(--color-brand-soft)]"
                        type="button"
                        onClick={() =>
                          onSelectEndpoint(violation.method, violation.path)
                        }
                      >
                        {t("workspace.styleOpenEndpoint")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {filteredViolations.length > FINDING_PREVIEW_LIMIT ? (
            <button
              className="mt-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] hover:underline"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? t("workspace.styleShowLess")
                : t("workspace.styleShowAll", {
                    count: String(filteredViolations.length),
                  })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
});
