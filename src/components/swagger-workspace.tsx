"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EndpointCard } from "@/components/endpoint-card";
import { useI18n } from "@/components/i18n-provider";
import { AUTH_CHANGE_EVENT } from "@/lib/auth";
import { getClientAuth } from "@/lib/client-auth";
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
} from "@/lib/schema-storage";
import type { TranslationKey } from "@/lib/translations";

const schemaErrorKeys: Record<string, TranslationKey> = {
  "Schema info.title is required.": "workspace.errors.infoTitleRequired",
  "Schema must be an object.": "workspace.errors.schemaObject",
  "Schema must include an openapi or swagger version.":
    "workspace.errors.versionRequired",
  "Schema paths object is required.": "workspace.errors.pathsRequired",
};

export function SwaggerWorkspace() {
  const { t } = useI18n();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [schemaText, setSchemaText] = useState(DEFAULT_OPENAPI_SCHEMA);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const parseResult = useMemo(
    () => parseOpenApiSchema(schemaText),
    [schemaText],
  );
  const detectedFormat = parseResult.ok
    ? parseResult.value.format
    : parseResult.format;
  const targetFormat: SchemaFormat =
    detectedFormat === "yaml" ? "json" : "yaml";

  useLayoutEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.style.height = "auto";
    editor.style.height = `${Math.max(editor.scrollHeight, 430)}px`;
  }, [schemaText]);

  useEffect(() => {
    const syncAuthAndSavedSchema = () => {
      const authState = getClientAuth();

      setIsAuthenticated(authState.isAuthenticated);

      if (authState.isAuthenticated) {
        const savedSchema = readSavedSchema();

        if (savedSchema) {
          setSchemaText(savedSchema);
          return;
        }

        void readServerSavedSchemas().then((savedSchemas) => {
          const latestSchema = savedSchemas[0];

          if (latestSchema) {
            setSchemaText(latestSchema.schemaText);
          }
        });
      }
    };

    syncAuthAndSavedSchema();

    window.addEventListener(AUTH_CHANGE_EVENT, syncAuthAndSavedSchema);

    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncAuthAndSavedSchema);
    };
  }, []);

  function handleFormatSwitch() {
    if (!parseResult.ok) {
      return;
    }

    setSchemaText(formatOpenApiSchema(parseResult.value.schema, targetFormat));
  }

  function handleSaveSchema() {
    if (!isAuthenticated || !parseResult.ok) {
      return;
    }

    const savedSchema = saveSchema(schemaText, {
      format: parseResult.value.format,
      title: parseResult.value.title,
      version: parseResult.value.version,
    });

    if (savedSchema) {
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
      <div className="min-h-[560px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
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
              className="rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 py-2 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.2)] transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)] disabled:shadow-none"
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
          className="min-h-[430px] w-full resize-none overflow-y-hidden bg-[#fbfaff] p-5 font-mono text-sm leading-7 text-[color:var(--color-brand-navy)] outline-none"
          value={schemaText}
          aria-label="OpenAPI schema editor"
          wrap="off"
          onChange={(event) => {
            setSchemaText(event.target.value);
            setSaveMessage("");
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
        {!parseResult.ok ? (
          <p
            className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"
            role="alert"
          >
            {getSchemaErrorMessage(parseResult.error)}
          </p>
        ) : null}
      </div>

      <div className="min-h-[560px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-5 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
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

        <div className="mt-6 flex flex-col gap-4">
          {parseResult.ok && parseResult.value.endpoints.length > 0 ? (
            parseResult.value.endpoints.map((endpoint) => (
              <EndpointCard
                canSaveHistory={isAuthenticated}
                key={`${endpoint.method}-${endpoint.path}`}
                endpoint={endpoint}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.addValidSchema")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
