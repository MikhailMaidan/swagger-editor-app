"use client";

import type {
  ChangeEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
} from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EndpointCard } from "@/components/endpoint-card";
import { useI18n } from "@/components/i18n-provider";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useClientAuthState } from "@/lib/client-auth";
import {
  DEFAULT_OPENAPI_SCHEMA,
  createEndpointStats,
  formatOpenApiSchema,
  parseOpenApiSchema,
  SchemaFormat,
} from "@/lib/openapi";
import type { EndpointSummary } from "@/lib/openapi";
import {
  clearSchemaDraft,
  readSchemaDraft,
  saveSchemaDraft,
} from "@/lib/schema-draft";
import {
  readSavedSchema,
  readServerSavedSchemas,
  saveSchema,
  saveServerSchemaRecord,
  SavedSchemaRecord,
} from "@/lib/schema-storage";
import { changeTextIndentation } from "@/lib/text-indentation";
import { getTextPosition } from "@/lib/text-position";
import { getTextStats } from "@/lib/text-stats";
import type { TranslationKey } from "@/lib/translations";

const schemaErrorKeys: Record<string, TranslationKey> = {
  "Schema info.title is required.": "workspace.errors.infoTitleRequired",
  "Schema must be an object.": "workspace.errors.schemaObject",
  "Schema must include an openapi or swagger version.":
    "workspace.errors.versionRequired",
  "Schema paths object is required.": "workspace.errors.pathsRequired",
};

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "openapi-schema";
}

// Parsing (YAML/JSON + endpoint extraction) is real work for larger
// documents, so it's debounced off the raw keystroke: typing itself stays
// instant since the textarea always renders the undebounced schemaText.
const SCHEMA_PARSE_DEBOUNCE_MS = 200;
const EMPTY_ENDPOINTS: EndpointSummary[] = [];

type SwaggerWorkspaceProps = {
  initialIsAuthenticated?: boolean;
};

export function SwaggerWorkspace({
  initialIsAuthenticated = false,
}: SwaggerWorkspaceProps = {}) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const pendingEditorSelectionRef = useRef<{
    end: number;
    start: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [schemaText, setSchemaText] = useState(DEFAULT_OPENAPI_SCHEMA);
  const [editorCursor, setEditorCursor] = useState({ column: 1, line: 1 });
  const hasEditedSchemaRef = useRef(false);
  const lastSavedSchemaRef = useRef<SavedSchemaRecord | null>(null);
  const { isAuthenticated } = useClientAuthState({
    isAuthenticated: initialIsAuthenticated,
    userName: "User",
  });
  const [saveMessage, setSaveMessage] = useState("");
  const [copiedSchemaText, setCopiedSchemaText] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const [isDraggingSchemaFile, setIsDraggingSchemaFile] = useState(false);
  const [endpointFilter, setEndpointFilter] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [selectedServerUrl, setSelectedServerUrl] = useState("");
  const debouncedSchemaText = useDebouncedValue(
    schemaText,
    SCHEMA_PARSE_DEBOUNCE_MS,
  );
  const parseResult = useMemo(
    () => parseOpenApiSchema(debouncedSchemaText),
    [debouncedSchemaText],
  );
  const schemaStats = useMemo(() => getTextStats(schemaText), [schemaText]);
  const detectedFormat = parseResult.ok
    ? parseResult.value.format
    : parseResult.format;
  const targetFormat: SchemaFormat =
    detectedFormat === "yaml" ? "json" : "yaml";
  const parsedEndpoints = parseResult.ok
    ? parseResult.value.endpoints
    : EMPTY_ENDPOINTS;
  const serverUrls = parseResult.ok ? parseResult.value.serverUrls : [];
  const activeServerUrl =
    selectedServerUrl && serverUrls.includes(selectedServerUrl)
      ? selectedServerUrl
      : parseResult.ok
        ? parseResult.value.serverUrl
        : "";
  const endpoints = useMemo(
    () =>
      parsedEndpoints.map((endpoint) =>
        endpoint.serverUrl === activeServerUrl
          ? endpoint
          : { ...endpoint, serverUrl: activeServerUrl },
      ),
    [activeServerUrl, parsedEndpoints],
  );
  const endpointStats = useMemo(
    () => createEndpointStats(endpoints),
    [endpoints],
  );
  const activeMethod =
    selectedMethod === "all" || endpointStats.methods.includes(selectedMethod)
      ? selectedMethod
      : "all";
  const activeTag =
    selectedTag === "all" || endpointStats.tags.includes(selectedTag)
      ? selectedTag
      : "all";
  const normalizedFilter = endpointFilter.trim().toLowerCase();
  const filteredEndpoints = normalizedFilter
    ? endpoints.filter(
        (endpoint) =>
          endpoint.method.toLowerCase().includes(normalizedFilter) ||
          endpoint.path.toLowerCase().includes(normalizedFilter) ||
          endpoint.summary.toLowerCase().includes(normalizedFilter) ||
          endpoint.operationId.toLowerCase().includes(normalizedFilter) ||
          endpoint.parameters.some(
            (parameter) =>
              parameter.name.toLowerCase().includes(normalizedFilter) ||
              parameter.description.toLowerCase().includes(normalizedFilter),
          ) ||
          endpoint.tags.some((tag) =>
            tag.toLowerCase().includes(normalizedFilter),
          ) ||
          endpoint.securityRequirements.some((requirement) =>
            requirement.toLowerCase().includes(normalizedFilter),
          ),
      )
    : endpoints;
  const methodFilteredEndpoints =
    activeMethod === "all"
      ? filteredEndpoints
      : filteredEndpoints.filter(
          (endpoint) => endpoint.method === activeMethod,
        );
  const tagFilteredEndpoints =
    activeTag === "all"
      ? methodFilteredEndpoints
      : methodFilteredEndpoints.filter((endpoint) =>
          endpoint.tags.includes(activeTag),
        );
  const hasActiveEndpointFilters =
    Boolean(endpointFilter) ||
    selectedMethod !== "all" ||
    selectedTag !== "all";
  const isSchemaCopied =
    copiedSchemaText !== null && copiedSchemaText === schemaText;

  useLayoutEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.style.height = "auto";
    editor.style.height = `${Math.max(editor.scrollHeight, 430)}px`;

    const pendingSelection = pendingEditorSelectionRef.current;

    if (pendingSelection) {
      editor.setSelectionRange(pendingSelection.start, pendingSelection.end);
      pendingEditorSelectionRef.current = null;
    }
  }, [schemaText]);

  useEffect(() => {
    if (isAuthenticated || hasEditedSchemaRef.current) {
      return;
    }

    const draft = readSchemaDraft();

    if (!draft) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled && !hasEditedSchemaRef.current) {
        setSchemaText(draft);
        setEditorCursor({ column: 1, line: 1 });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated && hasEditedSchemaRef.current) {
      saveSchemaDraft(debouncedSchemaText);
    }
  }, [debouncedSchemaText, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    hasEditedSchemaRef.current = false;

    const savedSchema = readSavedSchema();
    let cancelled = false;

    if (savedSchema) {
      lastSavedSchemaRef.current = null;
      queueMicrotask(() => {
        if (!cancelled) {
          setSchemaText(savedSchema);
          setEditorCursor({ column: 1, line: 1 });
        }
      });

      return () => {
        cancelled = true;
      };
    }

    // The server round-trip below can take long enough for the user to
    // start typing before it resolves; applying it unconditionally would
    // silently discard whatever they'd already typed in the meantime.
    void readServerSavedSchemas().then((savedSchemas) => {
      if (cancelled || hasEditedSchemaRef.current) {
        return;
      }

      const latestSchema = savedSchemas[0];

      if (latestSchema) {
        lastSavedSchemaRef.current = latestSchema;
        setSchemaText(latestSchema.schemaText);
        setEditorCursor({ column: 1, line: 1 });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  function applySchemaFormatting(switchFormat: boolean) {
    // Parse the live editor value here instead of the debounced preview value.
    // Otherwise, a quick click after typing could restore an older document.
    const currentParseResult = parseOpenApiSchema(schemaText);

    if (!currentParseResult.ok) {
      return;
    }

    const currentFormat = currentParseResult.value.format;
    const outputFormat: SchemaFormat = switchFormat
      ? currentFormat === "yaml"
        ? "json"
        : "yaml"
      : currentFormat;
    const formattedSchema = formatOpenApiSchema(
      currentParseResult.value.schema,
      outputFormat,
    );

    if (formattedSchema === schemaText) {
      return;
    }

    hasEditedSchemaRef.current = true;
    pendingEditorSelectionRef.current = { end: 0, start: 0 };
    setSchemaText(formattedSchema);
    setEditorCursor({ column: 1, line: 1 });
    setCopiedSchemaText(null);
    setSaveMessage("");
    setImportError("");
  }

  function handleFormatSchema() {
    applySchemaFormatting(false);
  }

  function handleFormatSwitch() {
    applySchemaFormatting(true);
  }

  function handleDownloadSchema() {
    const extension = detectedFormat === "json" ? "json" : "yaml";
    const filename = `${
      parseResult.ok ? slugifyTitle(parseResult.value.title) : "openapi-schema"
    }.${extension}`;
    const mimeType =
      extension === "json" ? "application/json" : "application/yaml";
    const url = URL.createObjectURL(
      new Blob([schemaText], { type: mimeType }),
    );
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopySchema() {
    setCopiedSchemaText(null);
    setSaveMessage("");

    if (!navigator.clipboard) {
      return;
    }

    const schemaToCopy = schemaText;

    try {
      await navigator.clipboard.writeText(schemaToCopy);
      setCopiedSchemaText(schemaToCopy);
    } catch {
      setCopiedSchemaText(null);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function readSchemaFile(file: File) {
    const reader = new FileReader();

    setImportError("");

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setImportError(t("workspace.errors.fileReadFailed"));
        return;
      }

      hasEditedSchemaRef.current = true;
      // An imported file is a different document, so the next save must
      // create a new record instead of overwriting whatever was last saved.
      lastSavedSchemaRef.current = null;
      pendingEditorSelectionRef.current = { end: 0, start: 0 };
      setSchemaText(reader.result);
      setEditorCursor({ column: 1, line: 1 });
      setCopiedSchemaText(null);
      setSaveMessage("");
    };
    reader.onerror = () => {
      setImportError(t("workspace.errors.fileReadFailed"));
    };
    reader.readAsText(file);
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (file) {
      readSchemaFile(file);
    }
  }

  function handleEditorFileDrag(event: ReactDragEvent<HTMLTextAreaElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingSchemaFile(true);
  }

  function handleEditorFileDragLeave() {
    setIsDraggingSchemaFile(false);
  }

  function handleEditorFileDrop(event: ReactDragEvent<HTMLTextAreaElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    setIsDraggingSchemaFile(false);

    const file = event.dataTransfer.files[0];

    if (file) {
      readSchemaFile(file);
    }
  }

  function handleResetEditor() {
    if (!window.confirm(t("workspace.resetEditorConfirm"))) {
      return;
    }

    clearSchemaDraft();
    hasEditedSchemaRef.current = false;
    lastSavedSchemaRef.current = null;
    setSchemaText(DEFAULT_OPENAPI_SCHEMA);
    setEditorCursor({ column: 1, line: 1 });
    setCopiedSchemaText(null);
    setSaveMessage("");
    setImportError("");
    setEndpointFilter("");
    setSelectedMethod("all");
    setSelectedTag("all");
    setSelectedServerUrl("");
  }

  function handleResetEndpointFilters() {
    setEndpointFilter("");
    setSelectedMethod("all");
    setSelectedTag("all");
  }

  function handleEditorSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const editor = event.currentTarget;

    setEditorCursor(getTextPosition(editor.value, editor.selectionStart));
  }

  function handleEditorKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    const isSaveShortcut =
      event.key.toLowerCase() === "s" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey;

    if (isSaveShortcut) {
      if (isAuthenticated) {
        event.preventDefault();
        handleSaveSchema();
      }

      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();

    const editor = event.currentTarget;
    const result = changeTextIndentation(
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
      event.shiftKey,
    );

    setEditorCursor(getTextPosition(result.value, result.selectionStart));

    if (result.value === editor.value) {
      editor.setSelectionRange(result.selectionStart, result.selectionEnd);
      return;
    }

    hasEditedSchemaRef.current = true;
    pendingEditorSelectionRef.current = {
      end: result.selectionEnd,
      start: result.selectionStart,
    };
    setSchemaText(result.value);
    setCopiedSchemaText(null);
    setSaveMessage("");
    setImportError("");
  }

  function handleSaveSchema() {
    if (!isAuthenticated) {
      return;
    }

    // Keep the persisted text and its metadata on the same revision even
    // when save is triggered before the debounced preview has caught up.
    const currentParseResult = parseOpenApiSchema(schemaText);

    if (!currentParseResult.ok) {
      return;
    }

    const savedSchema = saveSchema(schemaText, {
      createdAt: lastSavedSchemaRef.current?.createdAt,
      format: currentParseResult.value.format,
      id: lastSavedSchemaRef.current?.id,
      title: currentParseResult.value.title,
      version: currentParseResult.value.version,
    });

    if (savedSchema) {
      lastSavedSchemaRef.current = savedSchema;
      clearSchemaDraft();
      void saveServerSchemaRecord(savedSchema);
    }

    setCopiedSchemaText(null);
    setSaveMessage(t("workspace.schemaSaved"));
  }

  function getSchemaErrorMessage(error: string) {
    const errorKey = schemaErrorKeys[error];

    return errorKey ? t(errorKey) : error;
  }

  return (
    <section className="swagger-workspace mx-auto grid w-full max-w-[1600px] gap-6">
      <div className="min-h-[560px] overflow-hidden rounded-[28px] border border-[color:var(--color-brand-border)] bg-white shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--color-brand-border)] px-5 py-4">
          <div>
            <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
              {t("workspace.editor")}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
              {t("workspace.openApiSchema")}
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span
              className={`rounded-2xl px-4 py-2 text-sm font-bold ${
                parseResult.ok
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {parseResult.ok ? t("workspace.valid") : t("workspace.invalid")}
            </span>
            <span className="rounded-2xl bg-[color:var(--color-brand-soft)] px-4 py-2 text-sm font-bold uppercase text-[color:var(--color-brand-purple)]">
              {detectedFormat.toUpperCase()}
            </span>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".yaml,.yml,.json,.txt"
              aria-label="Import OpenAPI schema file"
              onChange={handleFileSelected}
            />
            <button
              className="rounded-2xl border border-[color:var(--color-brand-border)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              type="button"
              onClick={handleResetEditor}
            >
              {t("workspace.resetEditor")}
            </button>
            <button
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleImportClick}
            >
              {t("workspace.import")}
            </button>
            <button
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleCopySchema}
            >
              {t("workspace.copySchema")}
            </button>
            <button
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleDownloadSchema}
            >
              {t("workspace.download")}
            </button>
            <button
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:border-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)]"
              disabled={!parseResult.ok}
              type="button"
              onClick={handleFormatSchema}
            >
              {t("workspace.formatSchema")}
            </button>
            <button
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:border-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)]"
              disabled={!parseResult.ok}
              type="button"
              onClick={handleFormatSwitch}
            >
              {t("workspace.convertTo", {
                format: targetFormat.toUpperCase(),
              })}
            </button>
            <button
              className="rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 py-2 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.2)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:bg-none disabled:bg-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)] disabled:shadow-none disabled:hover:translate-y-0"
              disabled={!isAuthenticated || !parseResult.ok}
              type="button"
              onClick={handleSaveSchema}
            >
              {t("workspace.saveSchema")}
            </button>
          </div>
        </div>
        <textarea
          ref={editorRef}
          className={`block min-h-[430px] w-full resize-none overflow-y-hidden bg-[#fbfaff] p-5 font-mono text-sm leading-7 text-[color:var(--color-brand-navy)] outline-none transition-shadow ${
            isDraggingSchemaFile
              ? "ring-2 ring-inset ring-[color:var(--color-brand-purple)]"
              : ""
          }`}
          value={schemaText}
          aria-label="OpenAPI schema editor"
          spellCheck={false}
          wrap="off"
          onDragEnter={handleEditorFileDrag}
          onDragLeave={handleEditorFileDragLeave}
          onDragOver={handleEditorFileDrag}
          onDrop={handleEditorFileDrop}
          onKeyDown={handleEditorKeyDown}
          onChange={(event) => {
            hasEditedSchemaRef.current = true;
            setSchemaText(event.target.value);
            setEditorCursor(
              getTextPosition(event.target.value, event.target.selectionStart),
            );
            setCopiedSchemaText(null);
            setSaveMessage("");
            setImportError("");
          }}
          onSelect={handleEditorSelection}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-[color:var(--color-brand-border)] bg-white px-5 py-2 font-mono text-xs font-semibold text-[color:var(--color-brand-muted)]">
          <span aria-label={t("workspace.editorDocumentStatsLabel")}>
            {t("workspace.editorDocumentStats", {
              lines: String(schemaStats.lineCount),
              size: String(schemaStats.byteSize),
            })}
          </span>
          <span>
            {t("workspace.editorCursorPosition", {
              column: String(editorCursor.column),
              line: String(editorCursor.line),
            })}
          </span>
        </div>
        {!isAuthenticated ? (
          <p className="border-t border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-soft)] px-5 py-3 text-sm font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.signInToSave")}
          </p>
        ) : null}
        {isSchemaCopied || saveMessage ? (
          <p
            className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700"
            role="status"
          >
            {isSchemaCopied ? t("workspace.schemaCopied") : saveMessage}
          </p>
        ) : null}
        {importError ? (
          <p
            className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"
            role="alert"
          >
            {importError}
          </p>
        ) : null}
        {!parseResult.ok ? (
          <p
            className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"
            role="alert"
          >
            {getSchemaErrorMessage(parseResult.error)}
          </p>
        ) : null}
      </div>

      <div
        id="api-viewer"
        className="min-h-[560px] scroll-mt-40 rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-5 shadow-[0_18px_45px_rgba(64,45,137,0.1)]"
      >
        <div>
          <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
            {t("workspace.viewer")}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
            {parseResult.ok ? parseResult.value.title : t("nav.apiReference")}
          </h2>
          {parseResult.ok ? (
            <div className="mt-2 space-y-1 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              <p>
                {t("workspace.version", {
                  version: parseResult.value.version,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[color:var(--color-brand-navy)]">
                  {t("workspace.server")}:
                </span>
                {serverUrls.length > 1 ? (
                  <select
                    aria-label={t("workspace.serverSelector")}
                    className="h-9 min-w-0 max-w-full rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-xs text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                    value={activeServerUrl}
                    onChange={(event) =>
                      setSelectedServerUrl(event.target.value)
                    }
                  >
                    {serverUrls.map((serverUrl) => (
                      <option key={serverUrl} value={serverUrl}>
                        {serverUrl}
                      </option>
                    ))}
                  </select>
                ) : (
                  <code className="break-all">{activeServerUrl}</code>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {parseResult.ok ? (
          <div
            className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5"
            aria-label={t("workspace.endpointStats")}
          >
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.totalEndpoints")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.endpointCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.methods")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.methods.length}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.withRequestBodies")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.requestBodyCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.deprecated")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.deprecatedCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.secured")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.securedCount}
              </p>
            </div>
          </div>
        ) : null}

        {endpoints.length > 0 ? (
          <div className="mt-5 grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="min-w-0 flex-1 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] px-4 py-3 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                type="search"
                aria-label={t("workspace.filterEndpoints")}
                placeholder={t("workspace.filterEndpoints")}
                value={endpointFilter}
                onChange={(event) => setEndpointFilter(event.target.value)}
              />
              {endpointFilter ? (
                <button
                  className="h-11 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                  type="button"
                  onClick={() => setEndpointFilter("")}
                >
                  {t("workspace.clearEndpointFilter")}
                </button>
              ) : null}
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("workspace.methodFilterLabel")}
            >
              {["all", ...endpointStats.methods].map((method) => {
                const active = activeMethod === method;
                const label =
                  method === "all"
                    ? t("workspace.allMethods")
                    : `${method} (${endpointStats.methodCounts[method]})`;

                return (
                  <button
                    aria-pressed={active}
                    className={`endpoint-method-tab h-10 rounded-2xl px-4 text-sm font-extrabold transition ${
                      active
                        ? "bg-[color:var(--color-brand-navy)] text-white"
                        : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-purple)] hover:bg-[color:var(--color-brand-soft)]"
                    }`}
                    key={method}
                    type="button"
                    onClick={() => setSelectedMethod(method)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {endpointStats.tags.length > 0 ? (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={t("workspace.tagFilterLabel")}
              >
                {["all", ...endpointStats.tags].map((tag) => {
                  const active = activeTag === tag;
                  const label =
                    tag === "all"
                      ? t("workspace.allTags")
                      : t("workspace.tagFilterOption", {
                          count: String(endpointStats.tagCounts[tag]),
                          tag,
                        });

                  return (
                    <button
                      aria-pressed={active}
                      className={`h-9 rounded-lg px-3 text-xs font-bold transition ${
                        active
                          ? "bg-[color:var(--color-brand-purple)] text-white"
                          : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                      }`}
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(tag)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                aria-live="polite"
                className="text-sm font-semibold text-[color:var(--color-brand-muted)]"
              >
                {t("workspace.endpointFilterSummary", {
                  total: String(endpoints.length),
                  visible: String(tagFilteredEndpoints.length),
                })}
              </p>
              {hasActiveEndpointFilters ? (
                <button
                  className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                  type="button"
                  onClick={handleResetEndpointFilters}
                >
                  {t("workspace.resetEndpointFilters")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-4">
          {endpoints.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.addValidSchema")}
            </div>
          ) : tagFilteredEndpoints.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.noEndpointsMatch")}
            </div>
          ) : (
            tagFilteredEndpoints.map((endpoint) => (
              <EndpointCard
                canSaveHistory={isAuthenticated}
                key={`${endpoint.method}-${endpoint.path}`}
                endpoint={endpoint}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
