"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_OPENAPI_SCHEMA,
  EndpointParameter,
  EndpointSummary,
  formatOpenApiSchema,
  parseOpenApiSchema,
  SchemaFormat,
} from "@/lib/openapi";

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

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="font-extrabold text-[color:var(--color-brand-navy)]">
            Request body
          </p>
          <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
            {endpoint.requestContentTypes.length > 0
              ? endpoint.requestContentTypes.join(", ")
              : "None"}
          </p>
        </div>
        <div>
          <p className="font-extrabold text-[color:var(--color-brand-navy)]">
            Responses
          </p>
          <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
            {endpoint.responseStatuses.length > 0
              ? endpoint.responseStatuses.join(", ")
              : "None"}
          </p>
        </div>
      </div>
    </article>
  );
}

export function SwaggerWorkspace() {
  const [schemaText, setSchemaText] = useState(DEFAULT_OPENAPI_SCHEMA);
  const parseResult = useMemo(() => parseOpenApiSchema(schemaText), [schemaText]);
  const detectedFormat = parseResult.ok
    ? parseResult.value.format
    : parseResult.format;
  const targetFormat: SchemaFormat =
    detectedFormat === "yaml" ? "json" : "yaml";

  function handleFormatSwitch() {
    if (!parseResult.ok) {
      return;
    }

    setSchemaText(formatOpenApiSchema(parseResult.value.schema, targetFormat));
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
          </div>
        </div>
        <textarea
          className="h-[430px] w-full resize-none bg-[#fbfaff] p-5 font-mono text-sm leading-7 text-[color:var(--color-brand-navy)] outline-none"
          value={schemaText}
          aria-label="OpenAPI schema editor"
          onChange={(event) => setSchemaText(event.target.value)}
        />
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
