"use client";

import { useEffect, useMemo, useState } from "react";
import { AUTH_CHANGE_EVENT } from "@/lib/auth";
import { getClientAuth } from "@/lib/client-auth";
import {
  DEFAULT_OPENAPI_SCHEMA,
  EndpointParameter,
  EndpointSummary,
  formatOpenApiSchema,
  parseOpenApiSchema,
  SchemaDetails as SchemaDetailsSummary,
  SchemaFormat,
} from "@/lib/openapi";
import { readSavedSchema, saveSchema } from "@/lib/schema-storage";

const methodColorClasses: Record<string, string> = {
  DELETE: "bg-red-100 text-red-700",
  GET: "bg-emerald-100 text-emerald-700",
  PATCH: "bg-amber-100 text-amber-700",
  POST: "bg-sky-100 text-sky-700",
  PUT: "bg-violet-100 text-violet-700",
};

const parameterLabels: Record<EndpointParameter["location"], string> = {
  cookie: "Cookie",
  header: "Header",
  path: "Path",
  query: "Query",
};

function getMethodClass(method: string) {
  return methodColorClasses[method] || "bg-slate-100 text-slate-700";
}

function groupParameters(parameters: EndpointParameter[]) {
  return parameters.reduce<Record<EndpointParameter["location"], string[]>>(
    (groups, parameter) => {
      groups[parameter.location].push(parameter.name);
      return groups;
    },
    {
      cookie: [],
      header: [],
      path: [],
      query: [],
    },
  );
}

function SchemaDetailsBlock({
  schema,
}: {
  schema: SchemaDetailsSummary | null;
}) {
  if (!schema) {
    return (
      <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
        None
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-1 font-medium text-[color:var(--color-brand-muted)]">
      <p>Type: {schema.type}</p>
      <p>
        Properties:{" "}
        {schema.properties.length > 0 ? schema.properties.join(", ") : "None"}
      </p>
      {schema.example ? (
        <pre className="mt-2 overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]">
          {schema.example}
        </pre>
      ) : null}
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: EndpointSummary }) {
  const groupedParameters = groupParameters(endpoint.parameters);

  return (
    <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-xl px-3 py-1 text-sm font-extrabold ${getMethodClass(
            endpoint.method,
          )}`}
        >
          {endpoint.method}
        </span>
        <span className="font-mono text-base font-bold text-[color:var(--color-brand-navy)]">
          {endpoint.path}
        </span>
      </div>
      <p className="mt-3 text-sm font-bold text-[color:var(--color-brand-navy)]">
        {endpoint.summary}
      </p>
      {endpoint.description ? (
        <p className="mt-2 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
          {endpoint.description}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {Object.entries(groupedParameters).map(([location, names]) => (
          <div key={location}>
            <p className="font-extrabold text-[color:var(--color-brand-navy)]">
              {parameterLabels[location as EndpointParameter["location"]]}{" "}
              parameters
            </p>
            <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
              {names.length > 0 ? names.join(", ") : "None"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <p className="font-extrabold text-[color:var(--color-brand-navy)]">
            Request body
          </p>
          {endpoint.requestBodies.length > 0 ? (
            <div className="mt-2 space-y-3">
              {endpoint.requestBodies.map((requestBody) => (
                <div key={requestBody.contentType}>
                  <p className="font-bold text-[color:var(--color-brand-purple)]">
                    {requestBody.contentType}
                  </p>
                  <SchemaDetailsBlock schema={requestBody.schema} />
                </div>
              ))}
            </div>
          ) : (
            <SchemaDetailsBlock schema={null} />
          )}
        </div>
        <div>
          <p className="font-extrabold text-[color:var(--color-brand-navy)]">
            Responses
          </p>
          {endpoint.responses.length > 0 ? (
            <div className="mt-2 space-y-3">
              {endpoint.responses.map((response) => (
                <div key={response.status}>
                  <p className="font-bold text-[color:var(--color-brand-purple)]">
                    {response.status} - {response.description}
                  </p>
                  <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
                    Content:{" "}
                    {response.contentTypes.length > 0
                      ? response.contentTypes.join(", ")
                      : "None"}
                  </p>
                  <SchemaDetailsBlock schema={response.schema} />
                </div>
              ))}
            </div>
          ) : (
            <SchemaDetailsBlock schema={null} />
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
          cURL
        </p>
        <pre
          aria-label={`cURL ${endpoint.method} ${endpoint.path}`}
          className="mt-2 overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]"
        >
          {endpoint.curl}
        </pre>
      </div>
    </article>
  );
}

export function SwaggerWorkspace() {
  const [schemaText, setSchemaText] = useState(DEFAULT_OPENAPI_SCHEMA);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const parseResult = useMemo(() => parseOpenApiSchema(schemaText), [schemaText]);
  const detectedFormat = parseResult.ok
    ? parseResult.value.format
    : parseResult.format;
  const targetFormat: SchemaFormat =
    detectedFormat === "yaml" ? "json" : "yaml";

  useEffect(() => {
    const syncAuthAndSavedSchema = () => {
      const authState = getClientAuth();

      setIsAuthenticated(authState.isAuthenticated);

      if (authState.isAuthenticated) {
        const savedSchema = readSavedSchema();

        if (savedSchema) {
          setSchemaText(savedSchema);
        }
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

    saveSchema(schemaText);
    setSaveMessage("Schema saved.");
  }

  return (
    <section className="swagger-workspace mx-auto grid w-full max-w-[1600px] gap-6">
      <div className="min-h-[560px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--color-brand-border)] px-5 py-4">
          <div>
            <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
              Editor
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
              OpenAPI schema
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
              {parseResult.ok ? "Valid" : "Invalid"}
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
              Convert to {targetFormat.toUpperCase()}
            </button>
            <button
              className="rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 py-2 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.2)] transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)] disabled:shadow-none"
              disabled={!isAuthenticated || !parseResult.ok}
              type="button"
              onClick={handleSaveSchema}
            >
              Save schema
            </button>
          </div>
        </div>
        <textarea
          className="h-[430px] w-full resize-none bg-[#fbfaff] p-5 font-mono text-sm leading-7 text-[color:var(--color-brand-navy)] outline-none"
          value={schemaText}
          aria-label="OpenAPI schema editor"
          onChange={(event) => {
            setSchemaText(event.target.value);
            setSaveMessage("");
          }}
        />
        {!isAuthenticated ? (
          <p className="border-t border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-soft)] px-5 py-3 text-sm font-semibold text-[color:var(--color-brand-muted)]">
            Sign in to save and restore schemas.
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
            {parseResult.error}
          </p>
        ) : null}
      </div>

      <div className="min-h-[560px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-5 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <div>
          <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
            Viewer
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
            {parseResult.ok ? parseResult.value.title : "API Reference"}
          </h2>
          {parseResult.ok ? (
            <p className="mt-2 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              Version {parseResult.value.version}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {parseResult.ok && parseResult.value.endpoints.length > 0 ? (
            parseResult.value.endpoints.map((endpoint) => (
              <EndpointCard
                key={`${endpoint.method}-${endpoint.path}`}
                endpoint={endpoint}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              Add a valid OpenAPI schema to populate the viewer.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
