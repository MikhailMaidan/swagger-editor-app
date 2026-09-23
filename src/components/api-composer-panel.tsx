"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  addComposerServices,
  composeApis,
  ComposerError,
  MAX_COMPOSER_BYTES,
  MAX_COMPOSER_SERVICES,
  MAX_COMPOSER_SOURCE_BYTES,
  parseComposerProject,
  readComposerSource,
  serializeComposedApi,
  serializeComposerInventory,
  serializeComposerProject,
  type ComposerProject,
  type ComposerResult,
  type ComposerService,
} from "@/lib/api-composer";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { truncateJsonPreview } from "@/lib/response-data-explorer";
import type { SchemaFormat } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
export const ApiComposerPanel = memo(function ApiComposerPanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<ComposerProject>({
    title: "Gateway API",
    version: "1.0.0",
    gatewayUrl: "",
    services: [],
  });
  const [selected, setSelected] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [paste, setPaste] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    composition: ComposerResult;
    source: string;
  } | null>(null);
  const [format, setFormat] = useState<SchemaFormat>("yaml");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const [undo, setUndo] = useState<{ before: string; applied: string } | null>(
    null,
  );
  const fileGeneration = useRef(0),
    exportGeneration = useRef(0);
  useEffect(
    () => () => {
      fileGeneration.current++;
      exportGeneration.current++;
    },
    [],
  );
  const service = project.services.find((s) => s.key === selected);
  const dirty = project.services.some(
    (s) => Object.hasOwn(drafts, s.key) && drafts[s.key] !== s.text,
  );
  const sourceText = service ? (drafts[service.key] ?? service.text) : "";
  const routes = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (
      result?.composition.routes.filter((r) =>
        terms.every((term) =>
          `${r.namespace} ${r.method} ${r.sourcePath} ${r.gatewayPath} ${r.operationId}`
            .toLowerCase()
            .includes(term),
        ),
      ) ?? []
    );
  }, [result, search]);
  const lastPage = Math.max(0, Math.ceil(routes.length / 25) - 1),
    currentPage = Math.min(page, lastPage);
  const output = useMemo(() => {
    if (!result?.composition.canExport) return null;
    try {
      return {
        text: serializeComposedApi(result.composition, format),
        error: false,
      };
    } catch {
      return { text: "", error: true };
    }
  }, [result, format]);
  function clearFeedback() {
    exportGeneration.current++;
    setFeedback(null);
  }
  function invalidate() {
    clearFeedback();
    setResult(null);
    setPage(0);
  }
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof ComposerError
          ? `composer.error.${error.code}`
          : "composer.error.read",
      error: true,
    });
  }
  function update(next: ComposerProject) {
    invalidate();
    setProject(next);
  }
  function editService(patch: Partial<ComposerService>) {
    update({
      ...project,
      services: project.services.map((s) =>
        s.key === selected ? { ...s, ...patch } : s,
      ),
    });
  }
  function add(inputs: { name: string; text: string }[]) {
    try {
      const next = addComposerServices(project, inputs);
      update(next);
      setSelected(next.services.at(-1)?.key ?? "");
      setPaste("");
      setFeedback({ key: "composer.imported", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(files: File[], kind: "source" | "project") {
    clearFeedback();
    const token = ++fileGeneration.current;
    setLoading(true);
    try {
      if (
        kind === "source" &&
        files.length + project.services.length > MAX_COMPOSER_SERVICES
      )
        throw new ComposerError("limit");
      if (
        files.some(
          (f) =>
            f.size >
            (kind === "source"
              ? MAX_COMPOSER_SOURCE_BYTES
              : MAX_COMPOSER_BYTES),
        )
      )
        throw new ComposerError("limit");
      const inputs = await Promise.all(
        files.map(async (f) => ({ name: f.name, text: await f.text() })),
      );
      if (token !== fileGeneration.current) return;
      if (kind === "source") add(inputs);
      else {
        const next = parseComposerProject(inputs[0].text);
        update(next);
        setDrafts({});
        setSelected(next.services[0]?.key ?? "");
        setSearch("");
        setPaste("");
        setFeedback({ key: "composer.imported", error: false });
      }
    } catch (error) {
      if (token === fileGeneration.current) fail(error);
    } finally {
      if (token === fileGeneration.current) setLoading(false);
    }
  }
  function saveSource() {
    if (!service) return;
    clearFeedback();
    try {
      readComposerSource(sourceText);
      const next = {
        ...project,
        services: project.services.map((s) =>
          s.key === selected ? { ...s, text: sourceText } : s,
        ),
      };
      serializeComposerProject(next);
      update(next);
      setDrafts((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([key]) => key !== selected),
        ),
      );
      setFeedback({ key: "composer.sourceSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function generate() {
    if (dirty || loading) return;
    invalidate();
    try {
      setResult({ composition: composeApis(project), source: getSchemaText() });
    } catch (error) {
      fail(error);
    }
  }
  async function exportText(
    kind: "project" | "document" | "inventory",
    copy = false,
  ) {
    if (loading || dirty) return;
    clearFeedback();
    const token = exportGeneration.current;
    try {
      let text: string;
      if (kind === "project") text = serializeComposerProject(project);
      else if (kind === "inventory" && result)
        text = serializeComposerInventory(result.composition);
      else if (kind === "document" && output && !output.error)
        text = output.text;
      else throw new ComposerError("output");
      const extension = kind === "document" ? format : "json";
      const ok = copy
        ? await writeTextToClipboard(text)
        : downloadTextFile(
            text,
            `gateway-${kind}.${extension}`,
            extension === "yaml" ? "application/yaml" : "application/json",
          );
      if (token === exportGeneration.current)
        setFeedback({
          key: ok
            ? copy
              ? "composer.copied"
              : "composer.downloaded"
            : copy
              ? "composer.error.copy"
              : "composer.error.download",
          error: !ok,
        });
    } catch (error) {
      if (token === exportGeneration.current) fail(error);
    }
  }
  function apply() {
    clearFeedback();
    if (!result || !output || output.error || dirty || loading) return;
    if (getSchemaText() !== result.source) {
      setFeedback({ key: "composer.error.stale", error: true });
      return;
    }
    setUndo({ before: result.source, applied: output.text });
    onApply(output.text);
    setFeedback({ key: "composer.applied", error: false });
  }
  function restore() {
    clearFeedback();
    if (!undo || loading) return;
    if (getSchemaText() !== undo.applied) {
      setFeedback({ key: "composer.error.undo", error: true });
      return;
    }
    onApply(undo.before);
    setUndo(null);
    setFeedback({ key: "composer.undone", error: false });
  }
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("composer.title")}
      </summary>
      {open && (
        <div className="space-y-4 border-t border-[color:var(--color-brand-border)] p-5 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("composer.description")}</p>
          <p className="text-xs text-slate-600">{t("composer.help")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold">
              {t("composer.files")}
              <input
                className={inputClass}
                type="file"
                multiple
                accept=".json,.yaml,.yml,application/json,application/yaml"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) void read(files, "source");
                }}
              />
            </label>
            <label className="text-xs font-bold">
              {t("composer.projectFile")}
              <input
                className={inputClass}
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void read([file], "project");
                }}
              />
            </label>
          </div>
          {loading && <p role="status">{t("composer.loading")}</p>}
          <fieldset disabled={loading} className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClass}
                type="button"
                disabled={project.services.length >= MAX_COMPOSER_SERVICES}
                onClick={() => {
                  clearFeedback();
                  add([{ name: "Editor", text: getSchemaText() }]);
                }}
              >
                {t("composer.capture")}
              </button>
              <button
                className={buttonClass}
                type="button"
                disabled={dirty}
                onClick={() => void exportText("project")}
              >
                {t("composer.exportProject")}
              </button>
              {undo && (
                <button className={buttonClass} type="button" onClick={restore}>
                  {t("composer.undo")}
                </button>
              )}
            </div>
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer font-bold">
                {t("composer.pasteHeading")}
              </summary>
              <label className="mt-2 block text-xs font-bold">
                {t("composer.paste")}
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={5}
                  value={paste}
                  spellCheck={false}
                  onChange={(e) => setPaste(e.target.value)}
                />
              </label>
              <button
                className={`${buttonClass} mt-2`}
                type="button"
                disabled={
                  !paste.trim() ||
                  project.services.length >= MAX_COMPOSER_SERVICES
                }
                onClick={() => {
                  clearFeedback();
                  add([{ name: "Pasted service", text: paste }]);
                }}
              >
                {t("composer.addPasted")}
              </button>
            </details>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-bold">
                {t("composer.apiTitle")}
                <input
                  className={inputClass}
                  maxLength={200}
                  value={project.title}
                  onChange={(e) =>
                    update({ ...project, title: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-bold">
                {t("composer.version")}
                <input
                  className={inputClass}
                  maxLength={80}
                  value={project.version}
                  onChange={(e) =>
                    update({ ...project, version: e.target.value })
                  }
                />
              </label>
              <label className="text-xs font-bold">
                {t("composer.gateway")}
                <input
                  className={inputClass}
                  maxLength={2048}
                  placeholder="https://gateway.example.com"
                  value={project.gatewayUrl}
                  onChange={(e) =>
                    update({ ...project, gatewayUrl: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="font-bold">
              {t("composer.serviceCount", {
                count: String(project.services.length),
                max: String(MAX_COMPOSER_SERVICES),
              })}
            </p>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(0,3fr)]">
              <ul className="space-y-2">
                {project.services.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 p-2"
                  >
                    <input
                      className="mt-2"
                      type="checkbox"
                      aria-label={t("composer.enable", {
                        name: s.name,
                        key: s.key,
                      })}
                      checked={s.enabled}
                      onChange={(e) =>
                        update({
                          ...project,
                          services: project.services.map((entry) =>
                            entry.key === s.key
                              ? { ...entry, enabled: e.target.checked }
                              : entry,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className={`${buttonClass} min-w-0 flex-1 break-all text-left`}
                      aria-pressed={s.key === selected}
                      onClick={() => setSelected(s.key)}
                    >
                      {s.name}
                      <span className="block text-xs font-normal">
                        {s.namespace} · {s.prefix || "/"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {service && (
                <section
                  className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3"
                  aria-label={t("composer.serviceEditor")}
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-bold">
                      {t("composer.name")}
                      <input
                        className={inputClass}
                        maxLength={200}
                        value={service.name}
                        onChange={(e) => editService({ name: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-bold">
                      {t("composer.namespace")}
                      <input
                        className={inputClass}
                        maxLength={32}
                        value={service.namespace}
                        onChange={(e) =>
                          editService({ namespace: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs font-bold">
                      {t("composer.prefix")}
                      <input
                        className={inputClass}
                        maxLength={256}
                        value={service.prefix}
                        onChange={(e) =>
                          editService({ prefix: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-600">
                    {t("composer.namespaceHelp")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {([-1, 1] as const).map((direction) => (
                      <button
                        type="button"
                        key={direction}
                        className={buttonClass}
                        disabled={
                          project.services.indexOf(service) + direction < 0 ||
                          project.services.indexOf(service) + direction >=
                            project.services.length
                        }
                        onClick={() => {
                          const services = [...project.services],
                            index = services.indexOf(service);
                          [services[index], services[index + direction]] = [
                            services[index + direction],
                            services[index],
                          ];
                          update({ ...project, services });
                        }}
                      >
                        {t(
                          direction < 0
                            ? "composer.moveUp"
                            : "composer.moveDown",
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        const services = project.services.filter(
                          (s) => s.key !== selected,
                        );
                        update({ ...project, services });
                        setDrafts((previous) =>
                          Object.fromEntries(
                            Object.entries(previous).filter(
                              ([key]) => key !== selected,
                            ),
                          ),
                        );
                        setSelected(services[0]?.key ?? "");
                      }}
                    >
                      {t("composer.remove")}
                    </button>
                  </div>
                  <details>
                    <summary className="cursor-pointer font-bold">
                      {t("composer.sourceHeading")}
                    </summary>
                    <label className="mt-2 block text-xs font-bold">
                      {t("composer.source")}
                      <textarea
                        className={`${inputClass} font-mono`}
                        rows={12}
                        spellCheck={false}
                        value={sourceText}
                        onChange={(e) => {
                          invalidate();
                          setDrafts({ ...drafts, [selected]: e.target.value });
                        }}
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={sourceText === service.text}
                        onClick={saveSource}
                      >
                        {t("composer.saveSource")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={sourceText === service.text}
                        onClick={() => {
                          invalidate();
                          setDrafts((previous) =>
                            Object.fromEntries(
                              Object.entries(previous).filter(
                                ([key]) => key !== selected,
                              ),
                            ),
                          );
                        }}
                      >
                        {t("composer.revertSource")}
                      </button>
                    </div>
                  </details>
                </section>
              )}
            </div>
            {dirty && (
              <p role="status" className="text-amber-800">
                {t("composer.dirty")}
              </p>
            )}
            <button
              className={buttonClass}
              type="button"
              disabled={dirty || !project.services.some((s) => s.enabled)}
              onClick={generate}
            >
              {t("composer.generate")}
            </button>
            {result && (
              <section
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                aria-label={t("composer.result")}
              >
                <p className="font-bold">
                  {t("composer.summary", {
                    services: String(result.composition.serviceCount),
                    routes: String(result.composition.routes.length),
                    components: String(result.composition.componentCount),
                  })}
                </p>
                <label className="block text-xs font-bold">
                  {t("composer.search")}
                  <input
                    className={inputClass}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearch("");
                        setPage(0);
                      }
                    }}
                  />
                </label>
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th className="p-2">{t("composer.route")}</th>
                        <th className="p-2">{t("composer.upstream")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes
                        .slice(currentPage * 25, (currentPage + 1) * 25)
                        .map((r) => (
                          <tr
                            key={`${r.method} ${r.gatewayPath}`}
                            className="border-t border-slate-200"
                          >
                            <td className="break-all p-2">
                              <strong>
                                {r.method} {r.gatewayPath}
                              </strong>
                              <p>{r.operationId}</p>
                            </td>
                            <td className="break-all p-2">
                              {r.namespace} · {r.sourcePath}
                              <p>
                                {r.upstreamServers.length
                                  ? r.upstreamServers.join(", ")
                                  : t("composer.noServer")}
                              </p>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!routes.length && <p>{t("composer.noRoutes")}</p>}
                {lastPage > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!currentPage}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {t("composer.previous")}
                    </button>
                    <span>
                      {t("composer.page", {
                        page: String(currentPage + 1),
                        total: String(lastPage + 1),
                      })}
                    </span>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={currentPage === lastPage}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {t("composer.next")}
                    </button>
                  </div>
                )}
                <p className="font-bold">
                  {t("composer.diagnosticCount", {
                    count: String(result.composition.issueCount),
                    shown: String(result.composition.issues.length),
                  })}
                </p>
                <ul className="max-h-80 space-y-2 overflow-auto text-xs">
                  {result.composition.issues.map((issue, index) => (
                    <li
                      key={index}
                      className={
                        issue.severity === "error"
                          ? "text-red-700"
                          : "text-amber-800"
                      }
                    >
                      <strong>
                        {t(`composer.severity.${issue.severity}`)} ·{" "}
                        {
                          project.services.find(
                            (s) => s.key === issue.serviceKey,
                          )?.name
                        }
                      </strong>
                      <p className="break-all font-mono">{issue.pointer}</p>
                      <p>{t(`composer.issue.${issue.code}`)}</p>
                      <button
                        type="button"
                        className={`${buttonClass} mt-1`}
                        onClick={() => setSelected(issue.serviceKey)}
                      >
                        {t("composer.inspect")}
                      </button>
                    </li>
                  ))}
                </ul>
                {!result.composition.canExport && (
                  <p role="alert" className="text-red-700">
                    {t("composer.blocked")}
                  </p>
                )}
                {output?.error && (
                  <p role="alert" className="text-red-700">
                    {t("composer.error.output")}
                  </p>
                )}
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() => void exportText("inventory")}
                >
                  {t("composer.exportInventory")}
                </button>
                {output && !output.error && (
                  <>
                    <label className="block text-xs font-bold">
                      {t("composer.format")}
                      <select
                        className={inputClass}
                        value={format}
                        onChange={(e) => {
                          clearFeedback();
                          setFormat(e.target.value as SchemaFormat);
                        }}
                      >
                        <option value="yaml">YAML</option>
                        <option value="json">JSON</option>
                      </select>
                    </label>
                    <details>
                      <summary className="cursor-pointer font-bold">
                        {t("composer.preview")}
                      </summary>
                      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-3 text-xs">
                        {truncateJsonPreview(output.text, 12000)}
                      </pre>
                    </details>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={buttonClass}
                        type="button"
                        onClick={() => void exportText("document", true)}
                      >
                        {t("composer.copy")}
                      </button>
                      <button
                        className={buttonClass}
                        type="button"
                        onClick={() => void exportText("document")}
                      >
                        {t("composer.download")}
                      </button>
                      <button
                        className={buttonClass}
                        type="button"
                        onClick={apply}
                      >
                        {t("composer.apply")}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">
                      {t("composer.applyHelp")}
                    </p>
                  </>
                )}
              </section>
            )}
          </fieldset>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-green-800"}
            >
              {t(feedback.key)}
            </p>
          )}
        </div>
      )}
    </details>
  );
});
