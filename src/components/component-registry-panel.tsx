"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  createComponentRegistryMermaid,
  downloadComponentRegistryFile,
} from "@/lib/component-registry-export";
import {
  COMPONENT_KINDS,
  type ComponentKind,
  type ComponentReferenceStatus,
  type ComponentRegistryReport,
  type ReusableComponent,
} from "@/lib/component-registry";
import type { TranslationKey } from "@/lib/translations";

type RegistryFilter = "all" | "issues" | "unused" | "used";
type RegistryActionStatus =
  "copy-error" | "copy-success" | "export-error" | "export-success" | "idle";

const COMPONENT_PREVIEW_LIMIT = 8;
const FINDING_PREVIEW_LIMIT = 6;

const kindTranslationKeys: Record<ComponentKind, TranslationKey> = {
  callback: "workspace.registryKindCallback",
  example: "workspace.registryKindExample",
  header: "workspace.registryKindHeader",
  link: "workspace.registryKindLink",
  mediaType: "workspace.registryKindMediaType",
  parameter: "workspace.registryKindParameter",
  pathItem: "workspace.registryKindPathItem",
  requestBody: "workspace.registryKindRequestBody",
  response: "workspace.registryKindResponse",
  schema: "workspace.registryKindSchema",
  securityScheme: "workspace.registryKindSecurityScheme",
};

const kindClasses: Record<ComponentKind, string> = {
  callback: "bg-fuchsia-100 text-fuchsia-800",
  example: "bg-lime-100 text-lime-800",
  header: "bg-teal-100 text-teal-800",
  link: "bg-indigo-100 text-indigo-800",
  mediaType: "bg-orange-100 text-orange-800",
  parameter: "bg-cyan-100 text-cyan-800",
  pathItem: "bg-pink-100 text-pink-800",
  requestBody: "bg-violet-100 text-violet-800",
  response: "bg-emerald-100 text-emerald-800",
  schema: "bg-sky-100 text-sky-800",
  securityScheme: "bg-amber-100 text-amber-800",
};

function hasIssues(component: ReusableComponent) {
  return (
    !component.reachable ||
    component.inCycle ||
    component.brokenDependencyCount > 0 ||
    component.externalDependencyCount > 0
  );
}

function matchesFilter(component: ReusableComponent, filter: RegistryFilter) {
  if (filter === "used") {
    return component.reachable;
  }

  if (filter === "unused") {
    return !component.reachable;
  }

  if (filter === "issues") {
    return hasIssues(component);
  }

  return true;
}

function getFindingTranslationKey(status: ComponentReferenceStatus) {
  return status === "broken"
    ? "workspace.registryFindingBroken"
    : "workspace.registryFindingExternal";
}

export function ComponentRegistryPanel({
  report,
  schema,
}: {
  report: ComponentRegistryReport;
  schema: { title: string; version: string };
}) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<RegistryFilter>("all");
  const [activeKind, setActiveKind] = useState<"all" | ComponentKind>("all");
  const [actionStatus, setActionStatus] =
    useState<RegistryActionStatus>("idle");
  const [copiedComponentName, setCopiedComponentName] = useState("");
  const [expandedComponentKey, setExpandedComponentKey] = useState("");
  const [search, setSearch] = useState("");
  const [showAllComponents, setShowAllComponents] = useState(false);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const componentByKey = useMemo(
    () =>
      new Map(report.components.map((component) => [component.key, component])),
    [report.components],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const issueReferenceCount =
    report.brokenReferenceCount + report.externalReferenceCount;
  const problemReferences = report.references.filter(
    (reference) => reference.status !== "resolved",
  );
  const issueCount = report.components.filter(hasIssues).length;
  const filteredComponents = report.components.filter((component) => {
    const relationshipNames = [
      ...component.dependencyKeys,
      ...component.dependentKeys,
    ].map((key) => componentByKey.get(key)?.name ?? key);
    const matchesSearch =
      !normalizedSearch ||
      component.name.toLowerCase().includes(normalizedSearch) ||
      component.description.toLowerCase().includes(normalizedSearch) ||
      component.pointer.toLowerCase().includes(normalizedSearch) ||
      relationshipNames.some((name) =>
        name.toLowerCase().includes(normalizedSearch),
      );

    return (
      matchesFilter(component, activeFilter) &&
      (activeKind === "all" || component.kind === activeKind) &&
      matchesSearch
    );
  });
  const visibleComponents = showAllComponents
    ? filteredComponents
    : filteredComponents.slice(0, COMPONENT_PREVIEW_LIMIT);
  const visibleFindings = showAllFindings
    ? problemReferences
    : problemReferences.slice(0, FINDING_PREVIEW_LIMIT);
  const filters: Array<{
    count: number;
    key: TranslationKey;
    value: RegistryFilter;
  }> = [
    {
      count: report.totalCount,
      key: "workspace.registryFilterAll",
      value: "all",
    },
    {
      count: report.usedCount,
      key: "workspace.registryFilterUsed",
      value: "used",
    },
    {
      count: report.unusedCount,
      key: "workspace.registryFilterUnused",
      value: "unused",
    },
    {
      count: issueCount,
      key: "workspace.registryFilterIssues",
      value: "issues",
    },
  ];

  function resetListView() {
    setShowAllComponents(false);
    setExpandedComponentKey("");
    setActionStatus("idle");
  }

  async function handleCopyMermaid() {
    const copied = await writeTextToClipboard(
      createComponentRegistryMermaid(report),
    );

    setCopiedComponentName("");
    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  async function handleCopyReference(component: ReusableComponent) {
    const copied = await writeTextToClipboard(component.pointer);

    setCopiedComponentName(component.name);
    setActionStatus(copied ? "copy-success" : "copy-error");
  }

  function handleExport() {
    const downloaded = downloadComponentRegistryFile(report, schema);

    setCopiedComponentName("");
    setActionStatus(downloaded ? "export-success" : "export-error");
  }

  function getComponentName(key: string) {
    return componentByKey.get(key)?.name ?? key;
  }

  return (
    <section
      aria-labelledby="component-registry-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
              id="component-registry-title"
            >
              {t("workspace.registryTitle")}
            </h3>
            <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-800">
              {t("workspace.registryUsedSummary", {
                total: String(report.totalCount),
                used: String(report.usedCount),
              })}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.registrySummary", {
              broken: String(report.brokenReferenceCount),
              cycles: String(report.cycleCount),
              external: String(report.externalReferenceCount),
              unused: String(report.unusedCount),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            type="button"
            onClick={handleCopyMermaid}
          >
            {t("workspace.registryCopyMermaid")}
          </button>
          <button
            className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
            type="button"
            onClick={handleExport}
          >
            {t("workspace.registryExport")}
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
          {copiedComponentName
            ? t(
                actionStatus === "copy-success"
                  ? "workspace.registryReferenceCopySuccess"
                  : "workspace.registryReferenceCopyError",
                { name: copiedComponentName },
              )
            : t(
                actionStatus === "copy-error"
                  ? "workspace.registryCopyError"
                  : actionStatus === "copy-success"
                    ? "workspace.registryCopySuccess"
                    : actionStatus === "export-error"
                      ? "workspace.registryExportError"
                      : "workspace.registryExportSuccess",
              )}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-border)] lg:grid-cols-4">
        {[
          ["workspace.registryStatComponents", report.totalCount],
          ["workspace.registryStatUsed", report.usedCount],
          ["workspace.registryStatUnused", report.unusedCount],
          ["workspace.registryStatReferenceIssues", issueReferenceCount],
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

      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <input
          aria-label={t("workspace.registrySearch")}
          className="h-10 min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
          placeholder={t("workspace.registrySearchPlaceholder")}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetListView();
          }}
        />
        <select
          aria-label={t("workspace.registryKindFilterLabel")}
          className="h-10 min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
          value={activeKind}
          onChange={(event) => {
            setActiveKind(event.target.value as "all" | ComponentKind);
            resetListView();
          }}
        >
          <option value="all">{t("workspace.registryAllKinds")}</option>
          {COMPONENT_KINDS.filter(
            (kind) => report.categoryCounts[kind] > 0,
          ).map((kind) => (
            <option key={kind} value={kind}>
              {t(kindTranslationKeys[kind])} ({report.categoryCounts[kind]})
            </option>
          ))}
        </select>
      </div>

      <div
        aria-label={t("workspace.registryFilterLabel")}
        className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1"
        role="group"
      >
        {filters.map((filter) => (
          <button
            aria-pressed={activeFilter === filter.value}
            className={`h-9 shrink-0 rounded-md px-3 text-xs font-extrabold transition ${
              activeFilter === filter.value
                ? "bg-[color:var(--color-brand-navy)] text-white"
                : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
            }`}
            key={filter.value}
            type="button"
            onClick={() => {
              setActiveFilter(filter.value);
              resetListView();
            }}
          >
            {t(filter.key, { count: String(filter.count) })}
          </button>
        ))}
      </div>

      {filteredComponents.length === 0 ? (
        <p
          className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]"
          role="status"
        >
          {t("workspace.registryNoMatches")}
        </p>
      ) : (
        <>
          <ol className="mt-2 divide-y divide-[color:var(--color-brand-border)]">
            {visibleComponents.map((component) => {
              const isExpanded = expandedComponentKey === component.key;

              return (
                <li className="py-4" key={component.key}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="break-all text-base font-extrabold text-[color:var(--color-brand-navy)]">
                          {component.name}
                        </h4>
                        <span
                          className={`rounded px-2 py-1 text-xs font-bold ${kindClasses[component.kind]}`}
                        >
                          {t(kindTranslationKeys[component.kind])}
                        </span>
                        <span
                          className={`rounded px-2 py-1 text-xs font-bold ${
                            component.reachable
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {t(
                            component.reachable
                              ? "workspace.registryUsed"
                              : "workspace.registryUnused",
                          )}
                        </span>
                        {component.inCycle ? (
                          <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                            {t("workspace.registryCycle")}
                          </span>
                        ) : null}
                      </div>
                      <code className="mt-2 block break-all text-xs font-semibold text-[color:var(--color-brand-muted)]">
                        {component.pointer}
                      </code>
                      {component.description ? (
                        <p className="mt-2 text-sm font-medium text-[color:var(--color-brand-muted)]">
                          {component.description}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[color:var(--color-brand-muted)]">
                        <span className="rounded bg-[#f4f3f8] px-2 py-1">
                          {t("workspace.registryReferenceCount", {
                            count: String(component.directReferenceCount),
                          })}
                        </span>
                        <span className="rounded bg-[#f4f3f8] px-2 py-1">
                          {t("workspace.registryRootReferenceCount", {
                            count: String(component.rootReferenceCount),
                          })}
                        </span>
                        {component.brokenDependencyCount > 0 ? (
                          <span className="rounded bg-red-100 px-2 py-1 text-red-700">
                            {t("workspace.registryBrokenDependencies", {
                              count: String(component.brokenDependencyCount),
                            })}
                          </span>
                        ) : null}
                        {component.externalDependencyCount > 0 ? (
                          <span className="rounded bg-sky-100 px-2 py-1 text-sky-800">
                            {t("workspace.registryExternalDependencies", {
                              count: String(component.externalDependencyCount),
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                        type="button"
                        onClick={() => handleCopyReference(component)}
                      >
                        {t("workspace.registryCopyReference")}
                      </button>
                      <button
                        aria-expanded={isExpanded}
                        className="h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                        type="button"
                        onClick={() => {
                          setExpandedComponentKey(
                            isExpanded ? "" : component.key,
                          );
                          setActionStatus("idle");
                        }}
                      >
                        {t(
                          isExpanded
                            ? "workspace.registryHideDetails"
                            : "workspace.registryShowDetails",
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 grid min-w-0 gap-4 border-t border-[color:var(--color-brand-border)] pt-4 lg:grid-cols-2">
                      <div className="min-w-0">
                        <h5 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                          {t("workspace.registryRelationships")}
                        </h5>
                        <dl className="mt-2 grid gap-3 text-sm">
                          <div>
                            <dt className="font-bold text-[color:var(--color-brand-muted)]">
                              {t("workspace.registryDependsOn")}
                            </dt>
                            <dd className="mt-1 break-all font-mono text-xs text-[color:var(--color-brand-navy)]">
                              {component.dependencyKeys.length > 0
                                ? component.dependencyKeys
                                    .map(getComponentName)
                                    .join(", ")
                                : t("workspace.registryNone")}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-[color:var(--color-brand-muted)]">
                              {t("workspace.registryReferencedBy")}
                            </dt>
                            <dd className="mt-1 break-all font-mono text-xs text-[color:var(--color-brand-navy)]">
                              {component.dependentKeys.length > 0
                                ? component.dependentKeys
                                    .map(getComponentName)
                                    .join(", ")
                                : t("workspace.registryNone")}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                          {t("workspace.registryUsageSources")}
                        </h5>
                        {component.referencePointers.length > 0 ? (
                          <ul className="mt-2 grid gap-2">
                            {component.referencePointers.map((pointer) => (
                              <li
                                className="min-w-0 break-all font-mono text-xs text-[color:var(--color-brand-navy)]"
                                key={pointer}
                              >
                                {pointer}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm font-medium text-[color:var(--color-brand-muted)]">
                            {t("workspace.registryNoUsage")}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {filteredComponents.length > COMPONENT_PREVIEW_LIMIT ? (
            <button
              className="mt-3 h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              type="button"
              onClick={() => setShowAllComponents((current) => !current)}
            >
              {t(
                showAllComponents
                  ? "workspace.registryShowLess"
                  : "workspace.registryShowAll",
                { count: String(filteredComponents.length) },
              )}
            </button>
          ) : null}
        </>
      )}

      {problemReferences.length > 0 ? (
        <div className="mt-5 border-t border-[color:var(--color-brand-border)] pt-4">
          <h4 className="text-base font-extrabold text-[color:var(--color-brand-navy)]">
            {t("workspace.registryFindingsTitle")}
          </h4>
          <ul className="mt-2 divide-y divide-[color:var(--color-brand-border)]">
            {visibleFindings.map((reference) => (
              <li className="min-w-0 py-3" key={reference.sourcePointer}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      reference.status === "broken"
                        ? "bg-red-100 text-red-700"
                        : "bg-sky-100 text-sky-800"
                    }`}
                  >
                    {t(
                      reference.status === "broken"
                        ? "workspace.registryBroken"
                        : "workspace.registryExternal",
                    )}
                  </span>
                  <code className="break-all text-xs font-bold text-[color:var(--color-brand-muted)]">
                    {reference.sourcePointer}
                  </code>
                </div>
                <p className="mt-2 break-words text-sm font-semibold text-[color:var(--color-brand-navy)]">
                  {t(getFindingTranslationKey(reference.status), {
                    reference: reference.reference,
                  })}
                </p>
              </li>
            ))}
          </ul>
          {problemReferences.length > FINDING_PREVIEW_LIMIT ? (
            <button
              className="mt-3 h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              type="button"
              onClick={() => setShowAllFindings((current) => !current)}
            >
              {t(
                showAllFindings
                  ? "workspace.registryShowLessFindings"
                  : "workspace.registryShowAllFindings",
                { count: String(problemReferences.length) },
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
