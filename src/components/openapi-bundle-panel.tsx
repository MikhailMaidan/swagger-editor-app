"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  BundleError,
  bundleOpenApiProject,
  mergeBundleFiles,
  parseBundleProject,
  serializeBundleProject,
  serializeOpenApiBundle,
  MAX_BUNDLE_FILES,
  MAX_BUNDLE_FILE_BYTES,
  MAX_BUNDLE_OUTPUT_BYTES,
  MAX_BUNDLE_PROJECT_BYTES,
  type BundleProject,
  type BundleResult,
} from "@/lib/openapi-bundle";
import { findJsonPointerSourceRange } from "@/lib/example-validation";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { parseOpenApiSchema, type SchemaFormat } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
type Feedback = { key: TranslationKey; error: boolean; file?: string };

export const OpenApiBundlePanel = memo(function OpenApiBundlePanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<BundleProject>({
    root: "",
    files: [],
  });
  const [selected, setSelected] = useState("");
  const [newPath, setNewPath] = useState("openapi.yaml");
  const [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BundleResult | null>(null);
  const [format, setFormat] = useState<SchemaFormat>("yaml");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [undo, setUndo] = useState<{ before: string; applied: string } | null>(
    null,
  );
  const [reveal, setReveal] = useState<{
    file: string;
    pointer: string;
  } | null>(null);
  const revision = useRef(0);
  const importRevision = useRef(0);
  const exportRevision = useRef(0);
  const source = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => () => {
      revision.current++;
      importRevision.current++;
      exportRevision.current++;
    },
    [],
  );
  const file = project.files.find((file) => file.path === selected);
  useEffect(() => {
    if (!reveal || !file || reveal.file !== file.path || !source.current)
      return;
    const range = findJsonPointerSourceRange(file.text, reveal.pointer);
    source.current.focus();
    source.current.setSelectionRange(range?.start ?? 0, range?.end ?? 0);
  }, [reveal, file]);
  const output = useMemo(() => {
    if (!result?.document) return { text: "", error: false };
    try {
      return { text: serializeOpenApiBundle(result, format), error: false };
    } catch {
      return { text: "", error: true };
    }
  }, [result, format]);
  const outputValid = useMemo(
    () => (output.text ? parseOpenApiSchema(output.text).ok : false),
    [output.text],
  );
  const matching = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (result?.references ?? []).filter(
      (entry) =>
        (status === "all" ||
          (status === "resolved") === Boolean(entry.outputRef)) &&
        terms.every((term) =>
          `${entry.file} ${entry.pointer} ${entry.reference} ${entry.targetFile ?? ""}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [result, search, status]);

  function fail(error: unknown) {
    setFeedback({
      key: `bundle.error.${error instanceof BundleError ? error.code : "read"}`,
      error: true,
      file: error instanceof BundleError ? error.file : "",
    });
  }
  function invalidate() {
    revision.current++;
    exportRevision.current++;
    setResult(null);
    setFeedback(null);
  }
  function update(next: BundleProject) {
    invalidate();
    setProject(next);
  }
  function addFile(text: string) {
    try {
      const files = mergeBundleFiles(
        project.files,
        [{ path: newPath, text }],
        replace,
      );
      const added = mergeBundleFiles([], [{ path: newPath, text }])[0];
      update({ root: project.root || added.path, files });
      setSelected(added.path);
    } catch (error) {
      fail(error);
    }
  }
  async function importFiles(list: FileList | File[], projectImport = false) {
    const token = ++revision.current;
    const importToken = ++importRevision.current;
    exportRevision.current++;
    setLoading(true);
    setFeedback(null);
    try {
      const chosen = Array.from(list);
      if (projectImport) {
        if (!chosen[0] || chosen[0].size > MAX_BUNDLE_OUTPUT_BYTES)
          throw new BundleError("limit");
        const next = parseBundleProject(await chosen[0].text());
        if (token !== revision.current) return;
        update(next);
        setSelected(next.root || next.files[0]?.path || "");
      } else {
        const accepted = chosen.filter((file) =>
          /\.(json|ya?ml)$/i.test(file.name),
        );
        if (!accepted.length) throw new BundleError("project");
        if (
          accepted.length > MAX_BUNDLE_FILES ||
          accepted.some((file) => file.size > MAX_BUNDLE_FILE_BYTES) ||
          accepted.reduce((sum, file) => sum + file.size, 0) >
            MAX_BUNDLE_PROJECT_BYTES
        )
          throw new BundleError("limit");
        const incoming = await Promise.all(
          accepted.map(async (file) => ({
            path: file.webkitRelativePath || file.name,
            text: await file.text(),
          })),
        );
        if (token !== revision.current) return;
        const files = mergeBundleFiles(project.files, incoming, replace);
        const root =
          project.root ||
          files.find((file) =>
            /(^|\/)(openapi|swagger)\.(json|ya?ml)$/i.test(file.path),
          )?.path ||
          files[0].path;
        update({ root, files });
        setSelected(root);
      }
      setFeedback({ key: "bundle.imported", error: false });
    } catch (error) {
      if (token === revision.current) fail(error);
    } finally {
      if (importToken === importRevision.current) setLoading(false);
    }
  }
  async function exportText(kind: "bundle" | "project", copy: boolean) {
    const token = ++exportRevision.current;
    try {
      const text =
        kind === "project" ? serializeBundleProject(project) : output.text;
      if (!text) return;
      const success = copy
        ? await writeTextToClipboard(text)
        : downloadTextFile(
            text,
            kind === "project"
              ? "rsswag-multi-file-project.json"
              : `openapi-bundle.${format}`,
            kind === "project" || format === "json"
              ? "application/json"
              : "application/yaml",
          );
      if (token === exportRevision.current)
        setFeedback({
          key: success ? "bundle.exported" : "bundle.exportFailed",
          error: !success,
        });
    } catch (error) {
      if (token === exportRevision.current) fail(error);
    }
  }
  function navigate(file: string, pointer = "") {
    setSelected(file);
    setReveal({ file, pointer });
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("bundle.title")}
      </summary>
      {open ? (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-[color:var(--color-brand-muted)]">
            {t("bundle.description")}
          </p>
          <fieldset
            disabled={loading}
            className="min-w-0 space-y-3 disabled:opacity-70"
          >
            <legend className="sr-only">{t("bundle.edit")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">
                {t("bundle.importFiles")}
                <input
                  type="file"
                  multiple
                  accept=".json,.yaml,.yml"
                  className={inputClass}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.length) void importFiles(files);
                  }}
                />
              </label>
              <label className="text-xs font-bold">
                {t("bundle.importFolder")}
                <input
                  type="file"
                  multiple
                  {...{ webkitdirectory: "" }}
                  className={inputClass}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.length) void importFiles(files);
                  }}
                />
              </label>
            </div>
            <p className="text-xs">{t("bundle.importHelp")}</p>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              {t("bundle.replace")}
            </label>
            <label className="block text-xs font-bold">
              {t("bundle.newPath")}
              <input
                value={newPath}
                maxLength={512}
                className={`${inputClass} font-mono`}
                placeholder="schemas/User.yaml"
                onChange={(event) => setNewPath(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => addFile("{}\n")}
              >
                {t("bundle.addFile")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => addFile(getSchemaText())}
              >
                {t("bundle.useEditor")}
              </button>
            </div>
            <p className="text-xs">
              {t("bundle.fileCount", { count: String(project.files.length) })}
            </p>
            {project.files.length ? (
              <>
                <label className="block text-xs font-bold">
                  {t("bundle.root")}
                  <select
                    className={inputClass}
                    value={project.root}
                    onChange={(event) =>
                      update({ ...project, root: event.target.value })
                    }
                  >
                    {!project.root ? (
                      <option value="">{t("bundle.chooseRoot")}</option>
                    ) : null}
                    {project.files.map((file) => (
                      <option key={file.path} value={file.path}>
                        {file.path}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 md:grid-cols-[minmax(150px,1fr)_3fr]">
                  <div>
                    <label className="block text-xs font-bold">
                      {t("bundle.selected")}
                      <select
                        size={Math.min(8, project.files.length + 1)}
                        className={`${inputClass} font-mono`}
                        value={selected}
                        onChange={(event) => {
                          setSelected(event.target.value);
                          setReveal(null);
                        }}
                      >
                        {project.files.map((file) => (
                          <option key={file.path} value={file.path}>
                            {file.path}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={`${buttonClass} mt-2`}
                      disabled={!file}
                      onClick={() => {
                        const files = project.files.filter(
                          (entry) => entry.path !== selected,
                        );
                        update({
                          root:
                            project.root === selected
                              ? (files[0]?.path ?? "")
                              : project.root,
                          files,
                        });
                        setSelected(files[0]?.path ?? "");
                      }}
                    >
                      {t("bundle.removeFile")}
                    </button>
                  </div>
                  {file ? (
                    <label className="min-w-0 text-xs font-bold">
                      {t("bundle.source", { file: file.path })}
                      <textarea
                        ref={source}
                        className={`${inputClass} font-mono`}
                        rows={14}
                        spellCheck={false}
                        value={file.text}
                        onChange={(event) => {
                          try {
                            const files = mergeBundleFiles(
                              project.files,
                              [{ path: file.path, text: event.target.value }],
                              true,
                            );
                            update({ ...project, files });
                            setReveal(null);
                          } catch (error) {
                            fail(error);
                          }
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </>
            ) : null}
            <button
              type="button"
              className={buttonClass}
              disabled={!project.root}
              onClick={() => {
                invalidate();
                setResult(bundleOpenApiProject(project));
              }}
            >
              {t("bundle.build")}
            </button>
            <details className="rounded-lg border border-[color:var(--color-brand-border)] p-3">
              <summary className="cursor-pointer text-xs font-bold">
                {t("bundle.projectSharing")}
              </summary>
              <p className="mt-2 text-xs">{t("bundle.projectHelp")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!project.files.length}
                  onClick={() => void exportText("project", true)}
                >
                  {t("bundle.copyProject")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!project.files.length}
                  onClick={() => void exportText("project", false)}
                >
                  {t("bundle.downloadProject")}
                </button>
              </div>
              <label className="mt-2 block text-xs font-bold">
                {t("bundle.importProject")}
                <input
                  className={inputClass}
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.length) void importFiles(files, true);
                  }}
                />
              </label>
            </details>
          </fieldset>
          {loading ? (
            <p className="text-xs" role="status">
              {t("bundle.loading")}
            </p>
          ) : null}
          {feedback ? (
            <p
              className="break-all text-xs"
              role={feedback.error ? "alert" : "status"}
            >
              {t(feedback.key)}
              {feedback.file ? ` · ${feedback.file}` : ""}
            </p>
          ) : null}
          {result ? (
            <div className="space-y-3">
              <p role="status" className="text-sm font-bold">
                {t(result.document ? "bundle.ready" : "bundle.blocked", {
                  refs: String(result.references.length),
                  files: String(
                    result.files.filter((file) => file.used).length,
                  ),
                  issues: String(result.issues.length),
                })}
              </p>
              {result.issues.length ? (
                <ul
                  aria-label={t("bundle.issues")}
                  className="space-y-2 text-xs"
                >
                  {result.issues.slice(0, 100).map((issue, i) => (
                    <li
                      key={i}
                      className="break-all rounded-lg border border-red-200 bg-red-50 p-2"
                    >
                      <button
                        type="button"
                        className="font-bold underline"
                        onClick={() => navigate(issue.file, issue.pointer)}
                      >
                        {issue.file}
                        {issue.pointer ? `#${issue.pointer}` : ""}
                      </button>
                      : {t(`bundle.error.${issue.code}`)}
                      {issue.reference ? (
                        <code className="block">{issue.reference}</code>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.issues.length > 100 ? (
                <p className="text-xs">{t("bundle.issueLimit")}</p>
              ) : null}
              <p className="text-xs">
                {t("bundle.unused", {
                  files:
                    result.files
                      .filter((file) => !file.used)
                      .map((file) => file.path)
                      .join(", ") || "—",
                })}
              </p>
              <label className="block text-xs font-bold">
                {t("bundle.search")}
                <input
                  type="search"
                  className={inputClass}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className="block text-xs font-bold">
                {t("bundle.filter")}
                <select
                  className={inputClass}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">{t("bundle.all")}</option>
                  <option value="resolved">{t("bundle.resolved")}</option>
                  <option value="unresolved">{t("bundle.unresolved")}</option>
                </select>
              </label>
              <p className="text-xs">
                {t("bundle.matches", { count: String(matching.length) })}
              </p>
              {matching.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="sr-only">
                      {t("bundle.references")}
                    </caption>
                    <thead>
                      <tr>
                        <th className="p-2">{t("bundle.from")}</th>
                        <th className="p-2">{t("bundle.to")}</th>
                        <th className="p-2">{t("bundle.outputRef")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matching.slice(0, 100).map((entry, i) => (
                        <tr key={i}>
                          <td className="break-all p-2">
                            <button
                              type="button"
                              className="text-left underline"
                              onClick={() =>
                                navigate(entry.file, entry.pointer)
                              }
                            >
                              {entry.file}#{entry.pointer}
                            </button>
                          </td>
                          <td className="break-all p-2">
                            {entry.targetFile &&
                            project.files.some(
                              (file) => file.path === entry.targetFile,
                            ) ? (
                              <button
                                type="button"
                                className="text-left underline"
                                onClick={() =>
                                  navigate(
                                    entry.targetFile!,
                                    entry.targetPointer,
                                  )
                                }
                              >
                                {entry.reference}
                              </button>
                            ) : (
                              entry.reference
                            )}
                          </td>
                          <td className="break-all p-2 font-mono">
                            {entry.outputRef ?? t("bundle.unresolved")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {matching.length > 100 ? (
                <p className="text-xs">{t("bundle.tableLimit")}</p>
              ) : null}
              {result.document ? (
                <>
                  <p className="text-xs">
                    {t("bundle.outputHelp", { namespace: result.namespace })}
                  </p>
                  <label className="block text-xs font-bold">
                    {t("bundle.format")}
                    <select
                      className={inputClass}
                      value={format}
                      onChange={(event) => {
                        exportRevision.current++;
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
                      {t("bundle.error.limit")}
                    </p>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("bundle.preview")}
                    </summary>
                    <textarea
                      aria-label={t("bundle.previewText")}
                      className={`${inputClass} font-mono`}
                      readOnly
                      rows={12}
                      value={output.text.slice(0, 50000)}
                    />
                    {output.text.length > 50000 ? (
                      <p className="text-xs">{t("bundle.previewLimit")}</p>
                    ) : null}
                  </details>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!output.text || loading}
                      onClick={() => void exportText("bundle", true)}
                    >
                      {t("bundle.copy")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!output.text || loading}
                      onClick={() => void exportText("bundle", false)}
                    >
                      {t("bundle.download")}
                    </button>
                  </div>
                  <p className="text-xs">{t("bundle.applyHelp")}</p>
                  {!outputValid && output.text ? (
                    <p role="alert" className="text-xs">
                      {t("bundle.invalidOutput")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!outputValid || loading}
                    onClick={() => {
                      const before = getSchemaText();
                      onApply(output.text);
                      setUndo({ before, applied: output.text });
                      setFeedback({ key: "bundle.applied", error: false });
                    }}
                  >
                    {t("bundle.apply")}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {undo ? (
            <button
              type="button"
              className={buttonClass}
              disabled={loading}
              onClick={() => {
                if (getSchemaText() !== undo.applied) {
                  setFeedback({ key: "bundle.undoChanged", error: true });
                  return;
                }
                onApply(undo.before);
                setUndo(null);
                setFeedback({ key: "bundle.restored", error: false });
              }}
            >
              {t("bundle.undo")}
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  );
});
