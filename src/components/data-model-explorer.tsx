"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadSchemaModelsTypeScriptFile } from "@/lib/schema-model-export";
import type { SchemaModel } from "@/lib/schema-models";
import type { TranslationKey } from "@/lib/translations";

type ModelFilter = "all" | "unused" | "used";
type ModelFeedback = {
  isError: boolean;
  key: TranslationKey;
  params?: Record<string, string>;
};

const MODEL_PREVIEW_LIMIT = 8;

export function DataModelExplorer({
  models,
  onSelectEndpoint,
  schema,
}: {
  models: SchemaModel[];
  onSelectEndpoint: (method: string, path: string) => void;
  schema: { title: string; version: string };
}) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<ModelFilter>("all");
  const [expandedModel, setExpandedModel] = useState("");
  const [feedback, setFeedback] = useState<ModelFeedback | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const usedModelCount = models.filter(
    (model) => model.usages.length > 0,
  ).length;
  const unusedModelCount = models.length - usedModelCount;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredModels = models.filter((model) => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "used" && model.usages.length > 0) ||
      (activeFilter === "unused" && model.usages.length === 0);
    const matchesSearch =
      !normalizedSearch ||
      model.name.toLowerCase().includes(normalizedSearch) ||
      model.description.toLowerCase().includes(normalizedSearch) ||
      model.properties.some(
        (property) =>
          property.name.toLowerCase().includes(normalizedSearch) ||
          property.type.toLowerCase().includes(normalizedSearch),
      ) ||
      model.references.some((reference) =>
        reference.toLowerCase().includes(normalizedSearch),
      );

    return matchesFilter && matchesSearch;
  });
  const visibleModels = showAll
    ? filteredModels
    : filteredModels.slice(0, MODEL_PREVIEW_LIMIT);
  const filters: Array<{
    count: number;
    key: TranslationKey;
    value: ModelFilter;
  }> = [
    { count: models.length, key: "workspace.modelsFilterAll", value: "all" },
    {
      count: usedModelCount,
      key: "workspace.modelsFilterUsed",
      value: "used",
    },
    {
      count: unusedModelCount,
      key: "workspace.modelsFilterUnused",
      value: "unused",
    },
  ];

  function handleFilterChange(filter: ModelFilter) {
    setActiveFilter(filter);
    setShowAll(false);
    setFeedback(null);
  }

  function handleToggleModel(modelName: string) {
    setExpandedModel((currentModel) =>
      currentModel === modelName ? "" : modelName,
    );
    setFeedback(null);
  }

  async function handleCopy(
    content: string,
    modelName: string,
    kind: "example" | "typescript",
  ) {
    const copied = await writeTextToClipboard(content);

    setFeedback({
      isError: !copied,
      key: copied
        ? kind === "example"
          ? "workspace.modelsExampleCopySuccess"
          : "workspace.modelsTypeScriptCopySuccess"
        : kind === "example"
          ? "workspace.modelsExampleCopyError"
          : "workspace.modelsTypeScriptCopyError",
      params: { name: modelName },
    });
  }

  function handleExport() {
    const downloaded = downloadSchemaModelsTypeScriptFile(models, schema);

    setFeedback({
      isError: !downloaded,
      key: downloaded
        ? "workspace.modelsExportSuccess"
        : "workspace.modelsExportError",
    });
  }

  return (
    <section
      aria-labelledby="data-model-explorer-title"
      className="mt-5 border-y border-[color:var(--color-brand-border)] py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-lg font-extrabold text-[color:var(--color-brand-navy)]"
            id="data-model-explorer-title"
          >
            {t("workspace.modelsTitle")}
          </h3>
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.modelsSummary", {
              total: String(models.length),
              used: String(usedModelCount),
            })}
          </p>
        </div>
        <button
          className="h-9 rounded-md border border-[color:var(--color-brand-purple)] px-3 text-xs font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
          type="button"
          onClick={handleExport}
        >
          {t("workspace.modelsExport")}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          aria-label={t("workspace.modelsSearch")}
          className="h-10 min-w-0 flex-1 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)] sm:max-w-80"
          placeholder={t("workspace.modelsSearchPlaceholder")}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setShowAll(false);
            setFeedback(null);
          }}
        />
        <div
          aria-label={t("workspace.modelsFilterLabel")}
          className="flex max-w-full gap-2 overflow-x-auto pb-1"
          role="group"
        >
          {filters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.value}
              className={`h-9 shrink-0 rounded-md border px-3 text-xs font-extrabold transition ${
                activeFilter === filter.value
                  ? "border-[color:var(--color-brand-navy)] bg-[color:var(--color-brand-navy)] text-white"
                  : "border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              }`}
              key={filter.value}
              type="button"
              onClick={() => handleFilterChange(filter.value)}
            >
              {t(filter.key, { count: String(filter.count) })}
            </button>
          ))}
        </div>
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

      {filteredModels.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
          {t("workspace.modelsNoMatches")}
        </p>
      ) : (
        <ol className="mt-4 border-t border-[color:var(--color-brand-border)]">
          {visibleModels.map((model) => {
            const isExpanded = expandedModel === model.name;

            return (
              <li
                className="border-b border-[color:var(--color-brand-border)] py-4"
                key={model.name}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="break-words text-base font-extrabold text-[color:var(--color-brand-navy)]">
                        {model.name}
                      </h4>
                      <span className="rounded bg-sky-100 px-2 py-1 font-mono text-xs font-bold text-sky-800">
                        {model.type}
                      </span>
                      <span className="rounded bg-[color:var(--color-brand-soft)] px-2 py-1 text-xs font-bold text-[color:var(--color-brand-purple)]">
                        {t("workspace.modelsPropertyCount", {
                          count: String(model.properties.length),
                        })}
                      </span>
                      <span
                        className={`rounded px-2 py-1 text-xs font-bold ${
                          model.usages.length > 0
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {t(
                          model.usages.length > 0
                            ? "workspace.modelsUsed"
                            : "workspace.modelsUnused",
                        )}
                      </span>
                      {model.deprecated ? (
                        <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                          {t("workspace.modelsDeprecated")}
                        </span>
                      ) : null}
                    </div>
                    {model.description ? (
                      <p className="mt-2 text-sm font-medium text-[color:var(--color-brand-muted)]">
                        {model.description}
                      </p>
                    ) : null}
                  </div>
                  <button
                    aria-expanded={isExpanded}
                    className="h-9 shrink-0 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                    type="button"
                    onClick={() => handleToggleModel(model.name)}
                  >
                    {t(
                      isExpanded
                        ? "workspace.modelsHideDetails"
                        : "workspace.modelsShowDetails",
                    )}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="mt-4 border-t border-[color:var(--color-brand-border)] pt-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <h5 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                          {t("workspace.modelsRelationships")}
                        </h5>
                        <dl className="mt-2 grid gap-2 text-sm">
                          <div>
                            <dt className="font-bold text-[color:var(--color-brand-muted)]">
                              {t("workspace.modelsReferences")}
                            </dt>
                            <dd className="mt-1 break-words font-mono text-xs text-[color:var(--color-brand-navy)]">
                              {model.references.length > 0
                                ? model.references.join(", ")
                                : t("workspace.modelsNone")}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-[color:var(--color-brand-muted)]">
                              {t("workspace.modelsReferencedBy")}
                            </dt>
                            <dd className="mt-1 break-words font-mono text-xs text-[color:var(--color-brand-navy)]">
                              {model.referencedBy.length > 0
                                ? model.referencedBy.join(", ")
                                : t("workspace.modelsNone")}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div>
                        <h5 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                          {t("workspace.modelsUsedBy")}
                        </h5>
                        {model.usages.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {model.usages.map((usage) => (
                              <button
                                className="rounded-md border border-[color:var(--color-brand-border)] px-2 py-1 font-mono text-xs font-bold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                                key={`${usage.kind}-${usage.method}-${usage.path}`}
                                type="button"
                                onClick={() =>
                                  onSelectEndpoint(usage.method, usage.path)
                                }
                              >
                                {t(
                                  usage.kind === "request"
                                    ? "workspace.modelsUsageRequest"
                                    : "workspace.modelsUsageResponse",
                                )}
                                {": "}
                                {usage.method} {usage.path}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm font-medium text-[color:var(--color-brand-muted)]">
                            {t("workspace.modelsNoUsage")}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5">
                      <h5 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                        {t("workspace.modelsProperties")}
                      </h5>
                      {model.properties.length === 0 ? (
                        <p className="mt-2 text-sm font-medium text-[color:var(--color-brand-muted)]">
                          {t("workspace.modelsNoProperties")}
                        </p>
                      ) : (
                        <ul className="mt-2 border-t border-[color:var(--color-brand-border)]">
                          {model.properties.map((property) => (
                            <li
                              className="grid min-w-0 gap-2 border-b border-[color:var(--color-brand-border)] py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start"
                              key={property.name}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <code className="break-all text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                                    {property.name}
                                  </code>
                                  <span className="rounded bg-sky-100 px-2 py-1 font-mono text-xs font-bold text-sky-800">
                                    {property.type}
                                  </span>
                                </div>
                                {property.description ? (
                                  <p className="mt-2 text-xs font-medium text-[color:var(--color-brand-muted)]">
                                    {property.description}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex min-w-0 flex-wrap gap-2 text-xs font-bold">
                                <span
                                  className={`rounded px-2 py-1 ${
                                    property.required
                                      ? "bg-red-100 text-red-700"
                                      : "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand-muted)]"
                                  }`}
                                >
                                  {t(
                                    property.required
                                      ? "workspace.modelsRequired"
                                      : "workspace.modelsOptional",
                                  )}
                                </span>
                                {property.format ? (
                                  <span className="rounded bg-[color:var(--color-brand-soft)] px-2 py-1 text-[color:var(--color-brand-muted)]">
                                    {t("workspace.modelsFormat", {
                                      format: property.format,
                                    })}
                                  </span>
                                ) : null}
                                {property.nullable ? (
                                  <span className="rounded bg-[color:var(--color-brand-soft)] px-2 py-1 text-[color:var(--color-brand-muted)]">
                                    {t("workspace.modelsNullable")}
                                  </span>
                                ) : null}
                                {property.readOnly ? (
                                  <span className="rounded bg-[color:var(--color-brand-soft)] px-2 py-1 text-[color:var(--color-brand-muted)]">
                                    {t("workspace.modelsReadOnly")}
                                  </span>
                                ) : null}
                                {property.writeOnly ? (
                                  <span className="rounded bg-[color:var(--color-brand-soft)] px-2 py-1 text-[color:var(--color-brand-muted)]">
                                    {t("workspace.modelsWriteOnly")}
                                  </span>
                                ) : null}
                                {property.deprecated ? (
                                  <span className="rounded bg-red-100 px-2 py-1 text-red-700">
                                    {t("workspace.modelsDeprecated")}
                                  </span>
                                ) : null}
                                {property.enumValues.length > 0 ? (
                                  <span className="max-w-full break-words rounded bg-[color:var(--color-brand-soft)] px-2 py-1 text-[color:var(--color-brand-muted)]">
                                    {t("workspace.modelsEnum", {
                                      values: property.enumValues.join(", "),
                                    })}
                                  </span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h5 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                            {t("workspace.modelsExample")}
                          </h5>
                          <button
                            className="h-8 rounded-md border border-[color:var(--color-brand-border)] px-2 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                            type="button"
                            onClick={() =>
                              void handleCopy(
                                model.example,
                                model.name,
                                "example",
                              )
                            }
                          >
                            {t("workspace.modelsCopyExample")}
                          </button>
                        </div>
                        <pre className="mt-2 max-h-72 max-w-full overflow-auto rounded-md border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3 text-xs leading-5 text-[color:var(--color-brand-navy)]">
                          {model.example}
                        </pre>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h5 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
                            {t("workspace.modelsTypeScript")}
                          </h5>
                          <button
                            className="h-8 rounded-md border border-[color:var(--color-brand-border)] px-2 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                            type="button"
                            onClick={() =>
                              void handleCopy(
                                model.typeScript,
                                model.name,
                                "typescript",
                              )
                            }
                          >
                            {t("workspace.modelsCopyTypeScript")}
                          </button>
                        </div>
                        <pre className="mt-2 max-h-72 max-w-full overflow-auto rounded-md border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3 text-xs leading-5 text-[color:var(--color-brand-navy)]">
                          {model.typeScript}
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {filteredModels.length > MODEL_PREVIEW_LIMIT ? (
        <button
          className="mt-4 h-9 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
          type="button"
          onClick={() => setShowAll((currentValue) => !currentValue)}
        >
          {t(showAll ? "workspace.modelsShowLess" : "workspace.modelsShowAll", {
            count: String(filteredModels.length),
          })}
        </button>
      ) : null}
    </section>
  );
}
