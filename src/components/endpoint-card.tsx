"use client";

import { memo, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  createCurlPreview,
  CurlParameter,
  EndpointParameter,
  EndpointSummary,
  SchemaDetails as SchemaDetailsSummary,
} from "@/lib/openapi";
import {
  saveRequestHistoryRecord,
  saveServerRequestHistoryRecord,
} from "@/lib/request-history";
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
  errorDetails: string | null;
  headers: Record<string, string>;
  requestSize: number;
  responseSize: number;
  status: string;
  url: string;
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
      errorDetails:
        typeof data.errorDetails === "string" ? data.errorDetails : null,
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
      url: typeof data.url === "string" ? data.url : fallback.url,
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

function EndpointCardComponent({
  canSaveHistory,
  endpoint,
}: {
  canSaveHistory: boolean;
  endpoint: EndpointSummary;
}) {
  const { t } = useI18n();
  const groupedParameters = useMemo(
    () => groupParameters(endpoint.parameters),
    [endpoint.parameters],
  );
  const [mockResult, setMockResult] = useState<{
    body: string;
    durationMs: number;
    errorDetails: string | null;
    headers: Record<string, string>;
    requestBody: string;
    requestSize: number;
    requestValues: MockRequestValue[];
    responseSize: number;
    savedToHistory: boolean;
    status: string;
    url: string;
  } | null>(null);
  const [isCurlCopied, setIsCurlCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [parameterValues, setParameterValues] = useState(() =>
    createInitialParameterValues(endpoint),
  );
  const [requestBodyValue, setRequestBodyValue] = useState(() =>
    getInitialRequestBody(endpoint),
  );
  const requestParameters = useMemo(
    () => createRequestParameters(endpoint, parameterValues),
    [endpoint, parameterValues],
  );
  const currentCurl = useMemo(
    () =>
      createCurlPreview(
        endpoint.method,
        endpoint.path,
        endpoint.requestBodies.length > 0,
        endpoint.serverUrl,
        requestParameters,
        requestBodyValue,
      ),
    [endpoint, requestBodyValue, requestParameters],
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
    if (isExecuting) {
      return;
    }

    setIsExecuting(true);
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
      errorDetails: null,
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
      url: `${endpoint.serverUrl.replace(/\/$/, "")}${endpoint.path}`,
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

    let savedToHistory = false;

    if (canSaveHistory) {
      const historyRecord = saveRequestHistoryRecord({
        durationMs: executionResult.durationMs,
        errorDetails: executionResult.errorDetails,
        method: endpoint.method,
        path: endpoint.path,
        requestSize: executionResult.requestSize,
        responseSize: executionResult.responseSize,
        status: Number(executionResult.status) || 200,
        summary: endpoint.summary,
        url: executionResult.url,
      });

      if (historyRecord) {
        void saveServerRequestHistoryRecord(historyRecord);
        savedToHistory = true;
      }
    }

    setMockResult({
      ...executionResult,
      requestBody: requestBodyValue,
      requestValues,
      savedToHistory,
    });
    setIsExecuting(false);
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
              aria-busy={isExecuting}
              className="h-10 rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 text-sm font-extrabold text-white shadow-[0_12px_24px_rgba(90,45,255,0.18)] transition hover:translate-y-[-1px] disabled:cursor-wait disabled:opacity-70"
              disabled={isExecuting}
              type="button"
              onClick={handleTryItOut}
            >
              {isExecuting ? t("workspace.executing") : t("workspace.tryItOut")}
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
            <span
              className={`rounded-xl px-3 py-1 font-extrabold ${
                Number(mockResult.status) >= 400 || mockResult.status === "0"
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
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
          <p className="mt-3 break-all font-mono text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {mockResult.url}
          </p>
          {mockResult.errorDetails ? (
            <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-extrabold">{t("history.errorDetails")}</p>
              <p className="mt-1 font-medium">{mockResult.errorDetails}</p>
            </div>
          ) : null}
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

export const EndpointCard = memo(EndpointCardComponent);
