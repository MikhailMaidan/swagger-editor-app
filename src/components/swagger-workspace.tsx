"use client";

import type { ChangeEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EndpointCard } from "@/components/endpoint-card";
import { useI18n } from "@/components/i18n-provider";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useClientAuthState } from "@/lib/client-auth";
import {
  DEFAULT_OPENAPI_SCHEMA,
  formatOpenApiSchema,
  parseOpenApiSchema,
  SchemaFormat,
} from "@/lib/openapi";
import {
  readSavedSchema,
  readServerSavedSchemas,
  saveSchema,
  saveServerSchemaRecord,
  SavedSchemaRecord,
} from "@/lib/schema-storage";
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

type SwaggerWorkspaceProps = {
  initialIsAuthenticated?: boolean;
};

export function SwaggerWorkspace({
  initialIsAuthenticated = false,
}: SwaggerWorkspaceProps = {}) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [schemaText, setSchemaText] = useState(DEFAULT_OPENAPI_SCHEMA);
  const hasEditedSchemaRef = useRef(false);
  const lastSavedSchemaRef = useRef<SavedSchemaRecord | null>(null);
  const { isAuthenticated } = useClientAuthState({
    isAuthenticated: initialIsAuthenticated,
    userName: "User",
  });
  const [saveMessage, setSaveMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [endpointFilter, setEndpointFilter] = useState("");
  const debouncedSchemaText = useDebouncedValue(
    schemaText,
    SCHEMA_PARSE_DEBOUNCE_MS,
  );
  const parseResult = useMemo(
    () => parseOpenApiSchema(debouncedSchemaText),
    [debouncedSchemaText],
  );
  const detectedFormat = parseResult.ok
    ? parseResult.value.format
    : parseResult.format;
  const targetFormat: SchemaFormat =
    detectedFormat === "yaml" ? "json" : "yaml";
  const endpoints = parseResult.ok ? parseResult.value.endpoints : [];
  const normalizedFilter = endpointFilter.trim().toLowerCase();
  const filteredEndpoints = normalizedFilter
    ? endpoints.filter(
        (endpoint) =>
          endpoint.method.toLowerCase().includes(normalizedFilter) ||
          endpoint.path.toLowerCase().includes(normalizedFilter) ||
          endpoint.summary.toLowerCase().includes(normalizedFilter),
      )
    : endpoints;

  useLayoutEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.style.height = "auto";
    editor.style.height = `${Math.max(editor.scrollHeight, 430)}px`;
  }, [schemaText]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    hasEditedSchemaRef.current = false;

    const savedSchema = readSavedSchema();

    if (savedSchema) {
      lastSavedSchemaRef.current = null;
      setSchemaText(savedSchema);
      return;
    }

    let cancelled = false;

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
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  function handleFormatSwitch() {
    if (!parseResult.ok) {
      return;
    }

    hasEditedSchemaRef.current = true;
    setSchemaText(formatOpenApiSchema(parseResult.value.schema, targetFormat));
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

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      hasEditedSchemaRef.current = true;
      // An imported file is a different document, so the next save must
      // create a new record instead of overwriting whatever was last saved.
      lastSavedSchemaRef.current = null;
      setSchemaText(String(reader.result));
      setSaveMessage("");
      setImportError("");
    };
    reader.onerror = () => {
      setImportError(t("workspace.errors.fileReadFailed"));
    };
    reader.readAsText(file);
  }

  function handleSaveSchema() {
    if (!isAuthenticated || !parseResult.ok) {
      return;
    }

    const savedSchema = saveSchema(schemaText, {
      createdAt: lastSavedSchemaRef.current?.createdAt,
      format: parseResult.value.format,
      id: lastSavedSchemaRef.current?.id,
      title: parseResult.value.title,
      version: parseResult.value.version,
    });

    if (savedSchema) {
      lastSavedSchemaRef.current = savedSchema;
      void saveServerSchemaRecord(savedSchema);
    }

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
          <div className="flex items-center gap-3">
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
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleImportClick}
            >
              {t("workspace.import")}
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
          className="block min-h-[430px] w-full resize-none overflow-y-hidden bg-[#fbfaff] p-5 font-mono text-sm leading-7 text-[color:var(--color-brand-navy)] outline-none"
          value={schemaText}
          aria-label="OpenAPI schema editor"
          wrap="off"
          onChange={(event) => {
            hasEditedSchemaRef.current = true;
            setSchemaText(event.target.value);
            setSaveMessage("");
            setImportError("");
          }}
        />
        {!isAuthenticated ? (
          <p className="border-t border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-soft)] px-5 py-3 text-sm font-semibold text-[color:var(--color-brand-muted)]">
            {t("workspace.signInToSave")}
          </p>
        ) : null}
        {saveMessage ? (
          <p
            className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700"
            role="status"
          >
            {saveMessage}
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
            <p className="mt-2 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.version", {
                version: parseResult.value.version,
              })}
            </p>
          ) : null}
        </div>

        {endpoints.length > 0 ? (
          <input
            className="mt-5 w-full rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] px-4 py-3 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
            type="search"
            aria-label={t("workspace.filterEndpoints")}
            placeholder={t("workspace.filterEndpoints")}
            value={endpointFilter}
            onChange={(event) => setEndpointFilter(event.target.value)}
          />
        ) : null}

        <div className="mt-6 flex flex-col gap-4">
          {endpoints.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.addValidSchema")}
            </div>
          ) : filteredEndpoints.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.noEndpointsMatch")}
            </div>
          ) : (
            filteredEndpoints.map((endpoint) => (
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
