"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  buildTrafficDefinition,
  discoverTrafficRoutes,
  DiscoveryError,
  MAX_DISCOVERY_BYTES,
  parseTrafficCapture,
  serializeTrafficDefinition,
  type TrafficCapture,
  type TrafficDefinition,
} from "@/lib/traffic-discovery";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import type { SchemaFormat } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const PAGE_SIZE = 25;

export const TrafficDiscoveryPanel = memo(function TrafficDiscoveryPanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState<TrafficCapture | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [origin, setOrigin] = useState("");
  const [prefix, setPrefix] = useState("");
  const [parameterize, setParameterize] = useState(true);
  const [requireObserved, setRequireObserved] = useState(false);
  const [title, setTitle] = useState("Discovered API");
  const [version, setVersion] = useState("1.0.0");
  const [edits, setEdits] = useState<
    Record<string, { path: string; included: boolean }>
  >({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<TrafficDefinition | null>(null);
  const [format, setFormat] = useState<SchemaFormat>("yaml");
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const [undo, setUndo] = useState<{ before: string; applied: string } | null>(
    null,
  );
  const importGeneration = useRef(0);
  const exportGeneration = useRef(0);
  useEffect(
    () => () => {
      importGeneration.current++;
      exportGeneration.current++;
    },
    [],
  );
  const origins = useMemo(
    () =>
      [...new Set(capture?.observations.map((row) => row.origin) ?? [])].sort(),
    [capture],
  );
  const discovery = useMemo(() => {
    if (!capture) return { routes: [], error: null };
    try {
      return {
        routes: discoverTrafficRoutes(capture, origin, prefix, parameterize),
        error: null,
      };
    } catch (error) {
      return {
        routes: [],
        error:
          error instanceof DiscoveryError ? error.code : ("prefix" as const),
      };
    }
  }, [capture, origin, prefix, parameterize]);
  const routes = useMemo(
    () => discovery.routes.map((route) => ({ ...route, ...edits[route.id] })),
    [discovery.routes, edits],
  );
  const matching = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return routes;
    return routes.filter((route) => {
      const text = `${route.method} ${route.path} ${route.observations
        .map((row) => `${row.path} ${row.status}`)
        .join(" ")}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [routes, search]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(matching.length / PAGE_SIZE) - 1),
  );
  const output = useMemo(() => {
    if (!result) return { text: "", error: false };
    try {
      return { text: serializeTrafficDefinition(result, format), error: false };
    } catch {
      return { text: "", error: true };
    }
  }, [result, format]);
  function invalidate() {
    exportGeneration.current++;
    setResult(null);
    setFeedback(null);
  }
  function scopeChanged() {
    invalidate();
    setEdits({});
    setPage(0);
  }
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof DiscoveryError
          ? `discovery.error.${error.code}`
          : "discovery.error.read",
      error: true,
    });
  }
  function accept(text: string) {
    // Failed pasted imports must also supersede pending clipboard feedback.
    exportGeneration.current++;
    try {
      const next = parseTrafficCapture(text);
      scopeChanged();
      setCapture(next);
      setOrigin(next.observations[0].origin);
      setPrefix("");
      setSearch("");
      setInput("");
      setFeedback({ key: "discovery.imported", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File) {
    const token = ++importGeneration.current;
    exportGeneration.current++;
    setLoading(true);
    setFeedback(null);
    try {
      if (file.size > MAX_DISCOVERY_BYTES)
        throw new DiscoveryError("too-large");
      const text = await file.text();
      if (token === importGeneration.current) accept(text);
    } catch (error) {
      if (token === importGeneration.current) fail(error);
    } finally {
      if (token === importGeneration.current) setLoading(false);
    }
  }
  function clear() {
    importGeneration.current++;
    scopeChanged();
    setCapture(null);
    setInput("");
    setLoading(false);
    setOrigin("");
    setSearch("");
  }
  async function exportText(copy: boolean) {
    const token = ++exportGeneration.current;
    const text = output.text;
    if (!text) return;
    try {
      const success = copy
        ? await writeTextToClipboard(text)
        : downloadTextFile(
            text,
            `rsswag-discovered-openapi.${format}`,
            format === "json" ? "application/json" : "application/yaml",
          );
      if (token === exportGeneration.current)
        setFeedback({
          key: success ? "discovery.exported" : "discovery.error.export",
          error: !success,
        });
    } catch {
      if (token === exportGeneration.current)
        setFeedback({ key: "discovery.error.export", error: true });
    }
  }
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("discovery.title")}
      </summary>
      {open ? (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-[color:var(--color-brand-muted)]">
            {t("discovery.description")}
          </p>
          <p className="text-xs">{t("discovery.privacy")}</p>
          <label className="block text-xs font-bold">
            {t("discovery.file")}
            <input
              className={inputClass}
              type="file"
              accept=".har,.json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void read(file);
              }}
            />
          </label>
          <details>
            <summary className="cursor-pointer text-xs font-bold">
              {t("discovery.paste")}
            </summary>
            <label className="block text-xs">
              {t("discovery.input")}
              <textarea
                className={`${inputClass} font-mono`}
                rows={5}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={!input.trim()}
              onClick={() => {
                importGeneration.current++;
                setLoading(false);
                accept(input);
              }}
            >
              {t("discovery.import")}
            </button>
          </details>
          <button
            type="button"
            className={buttonClass}
            disabled={!capture && !input && !loading}
            onClick={clear}
          >
            {t("discovery.clear")}
          </button>
          {loading ? (
            <p role="status" className="text-xs">
              {t("discovery.loading")}
            </p>
          ) : null}
          {capture ? (
            <fieldset
              disabled={loading}
              className="min-w-0 space-y-4 disabled:opacity-70"
            >
              <legend className="sr-only">{t("discovery.configure")}</legend>
              <p className="text-xs">
                {t("discovery.counts", {
                  count: String(capture.observations.length),
                  skipped: String(capture.skipped),
                  warnings: String(capture.warnings.length),
                })}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  {t("discovery.origin")}
                  <select
                    value={origin}
                    className={inputClass}
                    onChange={(event) => {
                      scopeChanged();
                      setOrigin(event.target.value);
                    }}
                  >
                    {origins.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold">
                  {t("discovery.prefix")}
                  <input
                    value={prefix}
                    className={inputClass}
                    placeholder="/api/v1"
                    maxLength={512}
                    onChange={(event) => {
                      scopeChanged();
                      setPrefix(event.target.value);
                    }}
                  />
                </label>
                <label className="text-xs font-bold">
                  {t("discovery.apiTitle")}
                  <input
                    value={title}
                    className={inputClass}
                    maxLength={200}
                    onChange={(event) => {
                      invalidate();
                      setTitle(event.target.value);
                    }}
                  />
                </label>
                <label className="text-xs font-bold">
                  {t("discovery.version")}
                  <input
                    value={version}
                    className={inputClass}
                    maxLength={80}
                    onChange={(event) => {
                      invalidate();
                      setVersion(event.target.value);
                    }}
                  />
                </label>
              </div>
              <p className="text-xs">{t("discovery.scopeHelp")}</p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={parameterize}
                  onChange={(event) => {
                    scopeChanged();
                    setParameterize(event.target.checked);
                  }}
                />
                {t("discovery.parameterize")}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={requireObserved}
                  onChange={(event) => {
                    invalidate();
                    setRequireObserved(event.target.checked);
                  }}
                />
                {t("discovery.required")}
              </label>
              <p className="text-xs">{t("discovery.inferenceHelp")}</p>
              {discovery.error ? (
                <p role="alert" className="text-xs">
                  {t(`discovery.error.${discovery.error}`)}
                </p>
              ) : (
                <>
                  <p className="text-xs font-bold">
                    {t("discovery.routes", {
                      selected: String(
                        routes.filter((route) => route.included).length,
                      ),
                      total: String(routes.length),
                    })}
                  </p>
                  <label className="block text-xs font-bold">
                    {t("discovery.search")}
                    <input
                      type="search"
                      value={search}
                      placeholder={t("discovery.searchPlaceholder")}
                      className={inputClass}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setSearch("");
                          setPage(0);
                        }
                      }}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[true, false].map((included) => (
                      <button
                        key={String(included)}
                        type="button"
                        className={buttonClass}
                        disabled={!matching.length}
                        onClick={() => {
                          invalidate();
                          setEdits((current) => ({
                            ...current,
                            ...Object.fromEntries(
                              matching.map((route) => [
                                route.id,
                                { path: route.path, included },
                              ]),
                            ),
                          }));
                        }}
                      >
                        {t(included ? "discovery.select" : "discovery.exclude")}
                      </button>
                    ))}
                  </div>
                  {matching.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <caption className="sr-only">
                          {t("discovery.table")}
                        </caption>
                        <thead>
                          <tr>
                            <th className="p-2">{t("discovery.include")}</th>
                            <th className="p-2">{t("discovery.route")}</th>
                            <th className="p-2">{t("discovery.evidence")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matching
                            .slice(
                              currentPage * PAGE_SIZE,
                              (currentPage + 1) * PAGE_SIZE,
                            )
                            .map((route) => (
                              <tr key={route.id}>
                                <td className="p-2">
                                  <input
                                    type="checkbox"
                                    aria-label={t("discovery.includeRoute", {
                                      route: route.id,
                                    })}
                                    checked={route.included}
                                    onChange={(event) => {
                                      invalidate();
                                      setEdits((current) => ({
                                        ...current,
                                        [route.id]: {
                                          path: route.path,
                                          included: event.target.checked,
                                        },
                                      }));
                                    }}
                                  />
                                </td>
                                <td className="min-w-64 p-2">
                                  <strong>{route.method}</strong>
                                  <input
                                    aria-label={t("discovery.template", {
                                      route: route.id,
                                    })}
                                    value={route.path}
                                    maxLength={1024}
                                    className={`${inputClass} font-mono`}
                                    onChange={(event) => {
                                      invalidate();
                                      setEdits((current) => ({
                                        ...current,
                                        [route.id]: {
                                          path: event.target.value,
                                          included: route.included,
                                        },
                                      }));
                                    }}
                                  />
                                  <details className="mt-1">
                                    <summary className="cursor-pointer">
                                      {t("discovery.observedPaths")}
                                    </summary>
                                    <ul className="break-all">
                                      {[
                                        ...new Set(
                                          route.observations.map(
                                            (row) => row.path,
                                          ),
                                        ),
                                      ]
                                        .slice(0, 10)
                                        .map((path) => (
                                          <li key={path}>{path}</li>
                                        ))}
                                    </ul>
                                  </details>
                                </td>
                                <td className="p-2">
                                  {t("discovery.samples", {
                                    count: String(route.observations.length),
                                  })}
                                  <br />
                                  {[
                                    ...new Set(
                                      route.observations.map(
                                        (row) => row.status,
                                      ),
                                    ),
                                  ]
                                    .sort()
                                    .join(", ")}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs">{t("discovery.noMatches")}</p>
                  )}
                  {matching.length > PAGE_SIZE ? (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={currentPage === 0}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        {t("discovery.previous")}
                      </button>
                      <span>
                        {t("discovery.page", {
                          current: String(currentPage + 1),
                          total: String(Math.ceil(matching.length / PAGE_SIZE)),
                        })}
                      </span>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={
                          (currentPage + 1) * PAGE_SIZE >= matching.length
                        }
                        onClick={() => setPage(currentPage + 1)}
                      >
                        {t("discovery.next")}
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!routes.some((route) => route.included)}
                    onClick={() => {
                      invalidate();
                      try {
                        setResult(
                          buildTrafficDefinition(routes, {
                            origin,
                            prefix,
                            title,
                            version,
                            requireObserved,
                          }),
                        );
                      } catch (error) {
                        fail(error);
                      }
                    }}
                  >
                    {t("discovery.build")}
                  </button>
                </>
              )}
              {capture.warnings.length ? (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("discovery.warnings")}
                  </summary>
                  <p className="mt-2 text-xs">{t("discovery.warningHelp")}</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {capture.warnings.slice(0, 100).map((warning, index) => (
                      <li key={index}>
                        {t("discovery.warningRow", {
                          entry: String(warning.entry),
                          part: t(`discovery.part.${warning.part}`),
                        })}
                        : {t(`discovery.warning.${warning.code}`)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </fieldset>
          ) : null}
          {feedback ? (
            <p className="text-xs" role={feedback.error ? "alert" : "status"}>
              {t(feedback.key)}
            </p>
          ) : null}
          {result ? (
            <div className="space-y-3">
              <p role="status" className="text-sm font-bold">
                {t("discovery.ready", {
                  count: String(result.operations.length),
                  observations: String(result.observations),
                })}
              </p>
              <label className="block text-xs font-bold">
                {t("discovery.format")}
                <select
                  className={inputClass}
                  value={format}
                  onChange={(event) => {
                    exportGeneration.current++;
                    setFeedback(null);
                    setFormat(event.target.value as SchemaFormat);
                  }}
                >
                  <option value="yaml">YAML</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              {output.error ? (
                <p role="alert" className="text-xs">
                  {t("discovery.error.too-large")}
                </p>
              ) : null}
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("discovery.preview")}
                </summary>
                <textarea
                  aria-label={t("discovery.previewText")}
                  className={`${inputClass} font-mono`}
                  readOnly
                  rows={14}
                  value={output.text.slice(0, 50000)}
                />
                {output.text.length > 50000 ? (
                  <p className="text-xs">{t("discovery.previewLimit")}</p>
                ) : null}
              </details>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!output.text || loading}
                  onClick={() => void exportText(true)}
                >
                  {t("discovery.copy")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!output.text || loading}
                  onClick={() => void exportText(false)}
                >
                  {t("discovery.download")}
                </button>
              </div>
              <p className="text-xs">{t("discovery.applyHelp")}</p>
              <button
                type="button"
                className={buttonClass}
                disabled={!output.text || loading}
                onClick={() => {
                  const before = getSchemaText();
                  onApply(output.text);
                  setUndo({ before, applied: output.text });
                  setFeedback({ key: "discovery.applied", error: false });
                }}
              >
                {t("discovery.apply")}
              </button>
            </div>
          ) : null}
          {undo ? (
            <button
              type="button"
              className={buttonClass}
              disabled={loading}
              onClick={() => {
                if (getSchemaText() !== undo.applied) {
                  setFeedback({ key: "discovery.error.undo", error: true });
                  return;
                }
                onApply(undo.before);
                setUndo(null);
                setFeedback({ key: "discovery.restored", error: false });
              }}
            >
              {t("discovery.undo")}
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  );
});
