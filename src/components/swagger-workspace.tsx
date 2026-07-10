"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { AUTH_CHANGE_EVENT } from "@/lib/auth";
import { getClientAuth } from "@/lib/client-auth";
import {
  createCurlPreview,
  CurlParameter,
  DEFAULT_OPENAPI_SCHEMA,
  EndpointParameter,
  EndpointSummary,
  formatOpenApiSchema,
  parseOpenApiSchema,
  SchemaDetails as SchemaDetailsSummary,
  SchemaFormat,
} from "@/lib/openapi";
import {
  saveRequestHistoryRecord,
  saveServerRequestHistoryRecord,
} from "@/lib/request-history";
import {
  readSavedSchema,
  readServerSavedSchemas,
  saveSchema,
  saveServerSchemaRecord,
} from "@/lib/schema-storage";
import type { TranslationKey } from "@/lib/translations";

const methodColorClasses: Record<string, string> = {
  DELETE: "bg-red-100 text-red-700",
  GET: "bg-emerald-100 text-emerald-700",
  PATCH: "bg-amber-100 text-amber-700",
  POST: "bg-sky-100 text-sky-700",
  PUT: "bg-violet-100 text-violet-700",
};

const parameterLabelKeys: Record<
  EndpointParameter["location"],
  TranslationKey
> = {
  cookie: "workspace.cookie",
  header: "workspace.header",
  path: "workspace.path",
  query: "workspace.query",
};

const schemaErrorKeys: Record<string, TranslationKey> = {
  "Schema info.title is required.": "workspace.errors.infoTitleRequired",
  "Schema must be an object.": "workspace.errors.schemaObject",
  "Schema must include an openapi or swagger version.":
    "workspace.errors.versionRequired",
  "Schema paths object is required.": "workspace.errors.pathsRequired",
};

type MockRequestValue = {
  label: string;
  value: string;
};

type StructuredRequestParameter = {
  location: EndpointParameter["location"];
  name: string;
  value: string;
};

type TryItOutExecutionResult = {
  body: string;
  durationMs: number;
  headers: Record<string, string>;
  requestSize: number;
  responseSize: number;
  status: string;
};

type TryItOutPayload = {
  method: string;
  path: string;
  requestParameters: StructuredRequestParameter[];
  requestBody: string;
  requestValues: MockRequestValue[];
  responseBody: string;
  serverUrl: string;
  status: string;
};

function getTextSize(value: string) {
  return new TextEncoder().encode(value).length;
}

function readResponseHeaders(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>(
    (headers, [header, headerValue]) => {
      if (typeof headerValue === "string") {
        headers[header] = headerValue;
      }

      return headers;
    },
    {},
  );
}

async function executeTryItOut(
  payload: TryItOutPayload,
  fallback: TryItOutExecutionResult,
) {
  try {
    const response = await fetch("/api/try-it-out", {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as Partial<TryItOutExecutionResult>;

    return {
      body: typeof data.body === "string" ? data.body : fallback.body,
      durationMs:
        typeof data.durationMs === "number"
          ? data.durationMs
          : fallback.durationMs,
      headers: readResponseHeaders(data.headers),
      requestSize:
        typeof data.requestSize === "number"
          ? data.requestSize
          : fallback.requestSize,
      responseSize:
        typeof data.responseSize === "number"
          ? data.responseSize
          : fallback.responseSize,
      status: typeof data.status === "string" ? data.status : fallback.status,
    };
  } catch {
    return fallback;
  }
}

function getMethodClass(method: string) {
  return methodColorClasses[method] || "bg-slate-100 text-slate-700";
}

function getParameterKey(parameter: EndpointParameter) {
  return `${parameter.location}:${parameter.name}`;
}

function createInitialParameterValues(endpoint: EndpointSummary) {
  return endpoint.parameters.reduce<Record<string, string>>(
    (values, parameter) => {
      values[getParameterKey(parameter)] = "";
      return values;
    },
    {},
  );
}

function getInitialRequestBody(endpoint: EndpointSummary) {
  return endpoint.requestBodies[0]?.schema.example || "";
}

function createRequestParameters(
  endpoint: EndpointSummary,
  values: Record<string, string>,
) {
  return endpoint.parameters
    .map<CurlParameter>((parameter) => ({
      location: parameter.location,
      name: parameter.name,
      value: (values[getParameterKey(parameter)] || "").trim(),
    }))
    .filter((parameter) => parameter.value);
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

function getMockResponse(endpoint: EndpointSummary, fallbackBody: string) {
  const response =
    endpoint.responses.find((item) => item.status === "200") ||
    endpoint.responses[0];

  return {
    body: response?.schema?.example || fallbackBody,
    status: response?.status || "200",
  };
}

function SchemaDetailsBlock({
  schema,
}: {
  schema: SchemaDetailsSummary | null;
}) {
  const { t } = useI18n();

  if (!schema) {
    return (
      <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
        {t("workspace.none")}
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-1 font-medium text-[color:var(--color-brand-muted)]">
      <p>
        {t("workspace.type")} {schema.type}
      </p>
      <p>
        {t("workspace.properties")}{" "}
        {schema.properties.length > 0
          ? schema.properties.join(", ")
          : t("workspace.none")}
      </p>
      {schema.example ? (
        <pre className="mt-2 overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]">
          {schema.example}
        </pre>
      ) : null}
    </div>
  );
}

function EndpointCard({
  canSaveHistory,
  endpoint,
}: {
  canSaveHistory: boolean;
  endpoint: EndpointSummary;
}) {
  const { t } = useI18n();
  const groupedParameters = groupParameters(endpoint.parameters);
  const [mockResult, setMockResult] = useState<{
    body: string;
    durationMs: number;
    headers: Record<string, string>;
    requestBody: string;
    requestSize: number;
    requestValues: MockRequestValue[];
    responseSize: number;
    savedToHistory: boolean;
    status: string;
  } | null>(null);
  const [isCurlCopied, setIsCurlCopied] = useState(false);
  const [parameterValues, setParameterValues] = useState(() =>
    createInitialParameterValues(endpoint),
  );
  const [requestBodyValue, setRequestBodyValue] = useState(() =>
    getInitialRequestBody(endpoint),
  );
  const requestParameters = createRequestParameters(endpoint, parameterValues);
  const currentCurl = createCurlPreview(
    endpoint.method,
    endpoint.path,
    endpoint.requestBodies.length > 0,
    endpoint.serverUrl,
    requestParameters,
    requestBodyValue,
  );

  async function handleCopyCurl() {
    await navigator.clipboard?.writeText(currentCurl);
    setIsCurlCopied(true);
  }

  function handleParameterValueChange(
    parameter: EndpointParameter,
    value: string,
  ) {
    setParameterValues((currentValues) => ({
      ...currentValues,
      [getParameterKey(parameter)]: value,
    }));
  }

  async function handleTryItOut() {
    const response = getMockResponse(
      endpoint,
      t("workspace.noResponseExample", {
        method: endpoint.method,
        path: endpoint.path,
      }),
    );
    const requestValues = requestParameters.map((parameter) => ({
      label: `${t(parameterLabelKeys[parameter.location])}: ${parameter.name}`,
      value: parameter.value,
    }));
    const fallbackResult = {
      body: response.body,
      durationMs:
        30 + endpoint.parameters.length * 5 + endpoint.requestBodies.length * 8,
      headers: {
        "content-type": "application/json",
      },
      requestSize: getTextSize(
        JSON.stringify({
          body: requestBodyValue,
          values: requestValues,
        }),
      ),
      responseSize: getTextSize(response.body),
      status: response.status,
    };
    const executionResult = await executeTryItOut(
      {
        method: endpoint.method,
        path: endpoint.path,
        requestBody: requestBodyValue,
        requestParameters,
        requestValues,
        responseBody: response.body,
        serverUrl: endpoint.serverUrl,
        status: response.status,
      },
      fallbackResult,
    );

    if (canSaveHistory) {
      const historyRecord = saveRequestHistoryRecord({
        durationMs: executionResult.durationMs,
        method: endpoint.method,
        path: endpoint.path,
        requestSize: executionResult.requestSize,
        responseSize: executionResult.responseSize,
        status: Number(executionResult.status) || 200,
        summary: endpoint.summary,
      });

      if (historyRecord) {
        void saveServerRequestHistoryRecord(historyRecord);
      }
    }

    setMockResult({
      ...executionResult,
      requestBody: requestBodyValue,
      requestValues,
      savedToHistory: canSaveHistory,
    });
  }

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
              {t(parameterLabelKeys[location as EndpointParameter["location"]])}{" "}
              {t("workspace.parameters")}
            </p>
            <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
              {names.length > 0 ? names.join(", ") : t("workspace.none")}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <p className="font-extrabold text-[color:var(--color-brand-navy)]">
            {t("workspace.requestBody")}
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
            {t("workspace.responses")}
          </p>
          {endpoint.responses.length > 0 ? (
            <div className="mt-2 space-y-3">
              {endpoint.responses.map((response) => (
                <div key={response.status}>
                  <p className="font-bold text-[color:var(--color-brand-purple)]">
                    {response.status} - {response.description}
                  </p>
                  <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
                    {t("workspace.content")}{" "}
                    {response.contentTypes.length > 0
                      ? response.contentTypes.join(", ")
                      : t("workspace.none")}
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

      <div className="mt-4 rounded-2xl bg-[#fbfaff] p-4">
        <p className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
          {t("workspace.tryItOut")}
        </p>
        {endpoint.parameters.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {endpoint.parameters.map((parameter) => {
              const locationLabel = t(parameterLabelKeys[parameter.location]);

              return (
                <label
                  className="flex flex-col gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]"
                  key={getParameterKey(parameter)}
                >
                  {locationLabel}: {parameter.name}
                  <input
                    aria-label={t("workspace.parameterInputLabel", {
                      location: locationLabel,
                      name: parameter.name,
                    })}
                    className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
                    placeholder={t("workspace.parameterValuePlaceholder")}
                    type="text"
                    value={parameterValues[getParameterKey(parameter)]}
                    onChange={(event) =>
                      handleParameterValueChange(parameter, event.target.value)
                    }
                  />
                </label>
              );
            })}
          </div>
        ) : null}

        {endpoint.requestBodies.length > 0 ? (
          <label className="mt-3 flex flex-col gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
            {t("workspace.requestBody")}
            <textarea
              aria-label={t("workspace.requestBodyInputLabel")}
              className="min-h-28 rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 font-mono text-xs font-medium leading-5 outline-none transition focus:border-[color:var(--color-brand-purple)]"
              value={requestBodyValue}
              onChange={(event) => setRequestBodyValue(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
            {t("workspace.curl")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="h-10 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleCopyCurl}
            >
              {t("workspace.copyCurl")}
            </button>
            <button
              className="h-10 rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 text-sm font-extrabold text-white shadow-[0_12px_24px_rgba(90,45,255,0.18)] transition hover:translate-y-[-1px]"
              type="button"
              onClick={handleTryItOut}
            >
              {t("workspace.tryItOut")}
            </button>
          </div>
        </div>
        <pre
          aria-label={`cURL ${endpoint.method} ${endpoint.path}`}
          className="mt-2 overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]"
        >
          {currentCurl}
        </pre>
        {isCurlCopied ? (
          <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
            {t("workspace.curlCopied")}
          </p>
        ) : null}
      </div>

      {mockResult ? (
        <div
          className="mt-4 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4"
          role="status"
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-extrabold text-[color:var(--color-brand-navy)]">
              {t("workspace.response")}
            </span>
            <span className="rounded-xl bg-emerald-100 px-3 py-1 font-extrabold text-emerald-700">
              {mockResult.status}
            </span>
            <span className="font-bold text-[color:var(--color-brand-muted)]">
              {mockResult.durationMs} ms
            </span>
            <span className="font-bold text-[color:var(--color-brand-muted)]">
              {t("workspace.requestSize", {
                size: String(mockResult.requestSize),
              })}
            </span>
            <span className="font-bold text-[color:var(--color-brand-muted)]">
              {t("workspace.responseSize", {
                size: String(mockResult.responseSize),
              })}
            </span>
            <span className="font-bold text-[color:var(--color-brand-muted)]">
              {mockResult.savedToHistory
                ? t("workspace.savedToHistory")
                : t("workspace.guestRun")}
            </span>
          </div>
          {Object.keys(mockResult.headers).length > 0 ? (
            <div className="mt-3 rounded-2xl bg-white p-3 text-sm">
              <p className="font-extrabold text-[color:var(--color-brand-navy)]">
                {t("workspace.responseHeaders")}
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs leading-5 text-[color:var(--color-brand-muted)]">
                {Object.entries(mockResult.headers).map(([header, value]) => (
                  <li key={header}>
                    {header}: {value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {mockResult.requestValues.length > 0 || mockResult.requestBody ? (
            <div className="mt-3 rounded-2xl bg-white p-3 text-sm">
              <p className="font-extrabold text-[color:var(--color-brand-navy)]">
                {t("workspace.requestPreview")}
              </p>
              {mockResult.requestValues.length > 0 ? (
                <ul className="mt-2 space-y-1 font-medium text-[color:var(--color-brand-muted)]">
                  {mockResult.requestValues.map((requestValue) => (
                    <li key={requestValue.label}>
                      {requestValue.label}: {requestValue.value}
                    </li>
                  ))}
                </ul>
              ) : null}
              {mockResult.requestBody ? (
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]">
                  {mockResult.requestBody}
                </pre>
              ) : null}
            </div>
          ) : null}
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-white p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]">
            {mockResult.body}
          </pre>
        </div>
      ) : null}
    </article>
  );
}

export function SwaggerWorkspace() {
  const { t } = useI18n();
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
