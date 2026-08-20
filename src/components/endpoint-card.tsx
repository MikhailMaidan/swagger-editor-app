"use client";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  createEndpointPermalink,
  getEndpointAnchor,
} from "@/lib/endpoint-link";
import {
  createCurlPreview,
  createFetchPreview,
  CurlParameter,
  EndpointParameter,
  EndpointSummary,
  ResponseSummary,
  SchemaDetails as SchemaDetailsSummary,
  selectDefaultResponse,
} from "@/lib/openapi";
import {
  saveRequestHistoryRecord,
  saveServerRequestHistoryRecord,
} from "@/lib/request-history";
import {
  formatJsonBody,
  hasInvalidJsonBody,
  isJsonMediaType,
} from "@/lib/request-body";
import {
  getMissingRequiredParameterKeys,
  getRequestParameterKey,
} from "@/lib/request-parameters";
import { buildRequestUrl, hasSendableRequestBody } from "@/lib/request-url";
import { getResponseDownloadMetadata } from "@/lib/response-download";
import { formatResponseHeaders } from "@/lib/response-headers";
import { getStatusColorClasses } from "@/lib/status-color";
import { getByteSize } from "@/lib/text-encoding";
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
  contentType?: string;
  method: string;
  path: string;
  requestParameters: StructuredRequestParameter[];
  requestBody: string;
  requestValues: MockRequestValue[];
  responseBody: string;
  serverUrl: string;
  status: string;
};

function formatResponseBody(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
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
  signal: AbortSignal,
) {
  try {
    const response = await fetch("/api/try-it-out", {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal,
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
    return signal.aborted ? null : fallback;
  }
}

function getMethodClass(method: string) {
  return methodColorClasses[method] || "bg-slate-100 text-slate-700";
}

function createInitialParameterValues(endpoint: EndpointSummary) {
  return endpoint.parameters.reduce<Record<string, string>>(
    (values, parameter) => {
      values[getRequestParameterKey(parameter)] = parameter.example;
      return values;
    },
    {},
  );
}

function getRequestBody(endpoint: EndpointSummary, contentType: string) {
  return (
    endpoint.requestBodies.find(
      (requestBody) => requestBody.contentType === contentType,
    ) || endpoint.requestBodies[0]
  );
}

function createRequestParameters(
  endpoint: EndpointSummary,
  values: Record<string, string>,
) {
  return endpoint.parameters
    .map<CurlParameter>((parameter) => ({
      location: parameter.location,
      name: parameter.name,
      value: (values[getRequestParameterKey(parameter)] || "").trim(),
    }))
    .filter((parameter) => parameter.value);
}

function groupParameters(parameters: EndpointParameter[]) {
  return parameters.reduce<
    Record<EndpointParameter["location"], EndpointParameter[]>
  >(
    (groups, parameter) => {
      groups[parameter.location].push(parameter);
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

function getMockResponse(
  response: ResponseSummary | undefined,
  fallbackBody: string,
) {
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
        <div className="mt-2">
          {schema.exampleName ? (
            <p className="mb-1 text-xs font-bold text-[color:var(--color-brand-purple)]">
              {t("workspace.namedExample", { name: schema.exampleName })}
            </p>
          ) : null}
          <pre
            aria-label={
              schema.exampleName
                ? t("workspace.namedExample", { name: schema.exampleName })
                : undefined
            }
            className="overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]"
          >
            {schema.example}
          </pre>
        </div>
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
  const requestBodyInputId = useId();
  const groupedParameters = useMemo(
    () => groupParameters(endpoint.parameters),
    [endpoint.parameters],
  );
  const [selectedResponseStatus, setSelectedResponseStatus] = useState(
    () => selectDefaultResponse(endpoint.responses)?.status || "",
  );
  const activeResponse =
    endpoint.responses.find(
      (response) => response.status === selectedResponseStatus,
    ) || selectDefaultResponse(endpoint.responses);
  const activeResponseStatus = activeResponse?.status || "";
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
  const previousResponseStatusRef = useRef(activeResponseStatus);
  const [copiedCurl, setCopiedCurl] = useState("");
  const [copiedEndpointLink, setCopiedEndpointLink] = useState(false);
  const [copiedFetch, setCopiedFetch] = useState("");
  const [copiedRequestUrl, setCopiedRequestUrl] = useState("");
  const [copiedResponseBody, setCopiedResponseBody] = useState("");
  const [copiedResponseHeaders, setCopiedResponseHeaders] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [requestCodeFormat, setRequestCodeFormat] = useState<"curl" | "fetch">(
    "curl",
  );
  const [wasRequestCancelled, setWasRequestCancelled] = useState(false);
  const [hasAttemptedExecution, setHasAttemptedExecution] = useState(false);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const [parameterValues, setParameterValues] = useState(() =>
    createInitialParameterValues(endpoint),
  );
  const missingRequiredParameterKeys = new Set(
    getMissingRequiredParameterKeys(endpoint.parameters, parameterValues),
  );
  const hasMissingRequiredParameters = missingRequiredParameterKeys.size > 0;
  const hasMissingRequiredPathParameters = endpoint.parameters.some(
    (parameter) =>
      parameter.location === "path" &&
      missingRequiredParameterKeys.has(getRequestParameterKey(parameter)),
  );
  const editedParameterKeysRef = useRef(new Set<string>());
  const [selectedRequestContentType, setSelectedRequestContentType] = useState(
    () => endpoint.requestBodies[0]?.contentType || "",
  );
  const activeRequestBody = getRequestBody(
    endpoint,
    selectedRequestContentType,
  );
  const activeRequestContentType = activeRequestBody?.contentType || "";
  const initialRequestBody = activeRequestBody?.schema.example || "";
  const [requestBodyValue, setRequestBodyValue] = useState(initialRequestBody);
  const isRequestBodyRequired = activeRequestBody?.required === true;
  const isRequiredRequestBodyMissing =
    isRequestBodyRequired && !requestBodyValue.trim();
  const isJsonRequestBody = isJsonMediaType(activeRequestContentType);
  const isJsonRequestBodyInvalid = hasInvalidJsonBody(
    activeRequestContentType,
    requestBodyValue,
  );
  const isRequestBodyInvalid =
    isRequiredRequestBodyMissing || isJsonRequestBodyInvalid;
  const editedRequestContentTypesRef = useRef(new Set<string>());
  const requestBodyDraftsRef = useRef<Record<string, string>>({});
  const previousRequestContentTypeRef = useRef(activeRequestContentType);
  const endpointAnchor = useMemo(
    () => getEndpointAnchor(endpoint.method, endpoint.path),
    [endpoint.method, endpoint.path],
  );

  useEffect(() => {
    if (window.location.hash !== `#${endpointAnchor}`) {
      return;
    }

    document
      .getElementById(endpointAnchor)
      ?.scrollIntoView?.({ block: "start" });
  }, [endpointAnchor]);

  useEffect(() => {
    if (previousResponseStatusRef.current === activeResponseStatus) {
      return;
    }

    previousResponseStatusRef.current = activeResponseStatus;
    setMockResult(null);
    setCopiedResponseBody("");
    setCopiedResponseHeaders("");
  }, [activeResponseStatus]);
  useEffect(
    () => () => {
      requestAbortControllerRef.current?.abort();
    },
    [],
  );

  // EndpointCard is keyed by method+path, so editing an endpoint's example
  // body in the schema while keeping its method/path unchanged re-renders
  // this same instance instead of remounting it - without this, the
  // textarea and cURL preview would keep showing the pre-edit example
  // forever. Only auto-sync while the user hasn't typed their own value, and
  // key the effect off the example string itself (not the whole endpoint
  // object, which is a new reference on every keystroke-triggered reparse)
  // so it doesn't wipe out in-progress edits when unrelated schema text
  // changes.
  useEffect(() => {
    const contentTypeChanged =
      previousRequestContentTypeRef.current !== activeRequestContentType;
    previousRequestContentTypeRef.current = activeRequestContentType;

    if (contentTypeChanged) {
      setRequestBodyValue(
        editedRequestContentTypesRef.current.has(activeRequestContentType)
          ? (requestBodyDraftsRef.current[activeRequestContentType] ?? "")
          : initialRequestBody,
      );
      return;
    }

    if (editedRequestContentTypesRef.current.has(activeRequestContentType)) {
      return;
    }

    setRequestBodyValue(initialRequestBody);
  }, [activeRequestContentType, initialRequestBody]);
  useEffect(() => {
    setParameterValues((currentValues) => {
      let changed = false;
      const nextValues = { ...currentValues };
      const activeParameterKeys = new Set<string>();

      endpoint.parameters.forEach((parameter) => {
        const key = getRequestParameterKey(parameter);
        activeParameterKeys.add(key);

        if (
          !editedParameterKeysRef.current.has(key) &&
          nextValues[key] !== parameter.example
        ) {
          nextValues[key] = parameter.example;
          changed = true;
        }
      });

      Object.keys(nextValues).forEach((key) => {
        if (!activeParameterKeys.has(key)) {
          delete nextValues[key];
          editedParameterKeysRef.current.delete(key);
          changed = true;
        }
      });

      return changed ? nextValues : currentValues;
    });
  }, [endpoint.parameters]);
  const requestParameters = useMemo(
    () => createRequestParameters(endpoint, parameterValues),
    [endpoint, parameterValues],
  );
  const currentRequestUrl = useMemo(
    () => buildRequestUrl(endpoint.serverUrl, endpoint.path, requestParameters),
    [endpoint.path, endpoint.serverUrl, requestParameters],
  );
  const currentCurl = useMemo(
    () =>
      createCurlPreview(
        endpoint.method,
        endpoint.path,
        hasSendableRequestBody(endpoint.method, requestBodyValue),
        endpoint.serverUrl,
        requestParameters,
        requestBodyValue,
        activeRequestContentType,
      ),
    [activeRequestContentType, endpoint, requestBodyValue, requestParameters],
  );
  const currentFetch = useMemo(
    () =>
      createFetchPreview(
        endpoint.method,
        endpoint.path,
        hasSendableRequestBody(endpoint.method, requestBodyValue),
        endpoint.serverUrl,
        requestParameters,
        requestBodyValue,
        activeRequestContentType,
      ),
    [activeRequestContentType, endpoint, requestBodyValue, requestParameters],
  );
  const isCurlCopied = copiedCurl === currentCurl && copiedCurl !== "";
  const isFetchCopied = copiedFetch === currentFetch && copiedFetch !== "";
  const isRequestUrlCopied =
    copiedRequestUrl === currentRequestUrl && copiedRequestUrl !== "";
  const formattedResponseBody = useMemo(
    () => (mockResult ? formatResponseBody(mockResult.body) : ""),
    [mockResult],
  );
  const formattedResponseHeaders = useMemo(
    () => (mockResult ? formatResponseHeaders(mockResult.headers) : ""),
    [mockResult],
  );
  const isResponseCopied =
    Boolean(formattedResponseBody) &&
    copiedResponseBody === formattedResponseBody;
  const areResponseHeadersCopied =
    Boolean(formattedResponseHeaders) &&
    copiedResponseHeaders === formattedResponseHeaders;

  async function handleCopyCurl() {
    setCopiedCurl("");
    setCopiedRequestUrl("");
    setCopiedFetch("");

    const copied = await writeTextToClipboard(currentCurl);

    setCopiedCurl(copied ? currentCurl : "");
  }

  async function handleCopyEndpointLink() {
    const permalink = createEndpointPermalink(
      window.location.href,
      endpoint.method,
      endpoint.path,
    );
    const copied = await writeTextToClipboard(permalink);

    setCopiedEndpointLink(copied);
  }

  async function handleCopyFetch() {
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedRequestUrl("");

    const copied = await writeTextToClipboard(currentFetch);

    setCopiedFetch(copied ? currentFetch : "");
  }

  async function handleCopyRequestUrl() {
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedRequestUrl("");

    if (hasMissingRequiredPathParameters) {
      return;
    }

    const copied = await writeTextToClipboard(currentRequestUrl);

    setCopiedRequestUrl(copied ? currentRequestUrl : "");
  }

  async function handleCopyResponse() {
    setCopiedResponseHeaders("");

    if (!navigator.clipboard || !formattedResponseBody) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formattedResponseBody);
      setCopiedResponseBody(formattedResponseBody);
    } catch {
      setCopiedResponseBody("");
    }
  }

  async function handleCopyResponseHeaders() {
    setCopiedResponseBody("");

    if (!navigator.clipboard || !formattedResponseHeaders) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formattedResponseHeaders);
      setCopiedResponseHeaders(formattedResponseHeaders);
    } catch {
      setCopiedResponseHeaders("");
    }
  }

  function handleDownloadResponse() {
    if (!mockResult?.body) {
      return;
    }

    const { contentType, fileName } = getResponseDownloadMetadata(
      mockResult.headers,
      mockResult.status,
    );
    const objectUrl = URL.createObjectURL(
      new Blob([mockResult.body], { type: contentType }),
    );

    try {
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = objectUrl;
      downloadAnchor.download = fileName;
      downloadAnchor.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function handleClearResponse() {
    setMockResult(null);
    setCopiedResponseBody("");
    setCopiedResponseHeaders("");
  }

  function handleParameterValueChange(
    parameter: EndpointParameter,
    value: string,
  ) {
    editedParameterKeysRef.current.add(getRequestParameterKey(parameter));
    setParameterValues((currentValues) => ({
      ...currentValues,
      [getRequestParameterKey(parameter)]: value,
    }));
  }

  function handleRequestContentTypeChange(contentType: string) {
    const requestBody = getRequestBody(endpoint, contentType);
    const nextValue = editedRequestContentTypesRef.current.has(contentType)
      ? (requestBodyDraftsRef.current[contentType] ?? "")
      : requestBody?.schema.example || "";

    setSelectedRequestContentType(contentType);
    setRequestBodyValue(nextValue);
  }

  function handleRequestBodyChange(value: string) {
    editedRequestContentTypesRef.current.add(activeRequestContentType);
    requestBodyDraftsRef.current[activeRequestContentType] = value;
    setRequestBodyValue(value);
  }

  function handleFormatRequestBody() {
    const formattedBody = formatJsonBody(
      activeRequestContentType,
      requestBodyValue,
    );

    if (formattedBody !== null) {
      handleRequestBodyChange(formattedBody);
    }
  }

  function handleResponseStatusChange(status: string) {
    setSelectedResponseStatus(status);
    setMockResult(null);
    setCopiedResponseBody("");
    setCopiedResponseHeaders("");
  }

  function handleResetTryItOut() {
    const defaultRequestBody = endpoint.requestBodies[0];
    const defaultResponseStatus =
      selectDefaultResponse(endpoint.responses)?.status || "";

    editedParameterKeysRef.current.clear();
    editedRequestContentTypesRef.current.clear();
    requestBodyDraftsRef.current = {};
    previousRequestContentTypeRef.current =
      defaultRequestBody?.contentType || "";
    previousResponseStatusRef.current = defaultResponseStatus;
    setParameterValues(createInitialParameterValues(endpoint));
    setSelectedRequestContentType(defaultRequestBody?.contentType || "");
    setRequestBodyValue(defaultRequestBody?.schema.example || "");
    setSelectedResponseStatus(defaultResponseStatus);
    setHasAttemptedExecution(false);
    setWasRequestCancelled(false);
    setMockResult(null);
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedRequestUrl("");
    setCopiedResponseBody("");
    setCopiedResponseHeaders("");
  }

  function handleCancelTryItOut() {
    if (!requestAbortControllerRef.current) {
      return;
    }

    requestAbortControllerRef.current.abort();
    requestAbortControllerRef.current = null;
    setIsExecuting(false);
    setWasRequestCancelled(true);
  }

  async function handleTryItOut() {
    if (isExecuting || isRequestBodyInvalid) {
      return;
    }

    if (hasMissingRequiredParameters) {
      setHasAttemptedExecution(true);
      return;
    }

    const abortController = new AbortController();
    requestAbortControllerRef.current = abortController;
    setIsExecuting(true);
    setWasRequestCancelled(false);
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedRequestUrl("");
    setCopiedResponseBody("");
    setCopiedResponseHeaders("");
    const response = getMockResponse(
      activeResponse,
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
      requestSize: getByteSize(
        JSON.stringify({
          body: requestBodyValue,
          values: requestValues,
        }),
      ),
      responseSize: getByteSize(response.body),
      status: response.status,
      url: buildRequestUrl(
        endpoint.serverUrl,
        endpoint.path,
        requestParameters,
      ),
    };
    const executionResult = await executeTryItOut(
      {
        contentType: activeRequestContentType || undefined,
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
      abortController.signal,
    );

    if (
      !executionResult ||
      requestAbortControllerRef.current !== abortController
    ) {
      return;
    }

    requestAbortControllerRef.current = null;

    let savedToHistory = false;

    if (canSaveHistory) {
      const historyRecord = saveRequestHistoryRecord({
        durationMs: executionResult.durationMs,
        errorDetails: executionResult.errorDetails,
        method: endpoint.method,
        path: endpoint.path,
        requestSize: executionResult.requestSize,
        responseSize: executionResult.responseSize,
        // executionResult.status is the literal string "0" for a network
        // failure - `|| 200` would treat that falsy 0 as "no status" and
        // mislabel a failed request as a fake 200 success in history.
        status: Number(executionResult.status),
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
    <article
      className="scroll-mt-36 rounded-2xl border border-[color:var(--color-brand-border)] p-4"
      id={endpointAnchor}
    >
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
        <button
          aria-label={t("workspace.copyEndpointLinkAriaLabel", {
            method: endpoint.method,
            path: endpoint.path,
          })}
          className="ml-auto h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
          type="button"
          onClick={handleCopyEndpointLink}
        >
          {t("workspace.copyEndpointLink")}
        </button>
        {copiedEndpointLink ? (
          <span className="text-xs font-bold text-emerald-700" role="status">
            {t("workspace.endpointLinkCopied")}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-bold text-[color:var(--color-brand-navy)]">
        {endpoint.summary}
      </p>
      {endpoint.description ? (
        <p className="mt-2 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
          {endpoint.description}
        </p>
      ) : null}
      {endpoint.tags.length > 0 ||
      endpoint.deprecated ||
      endpoint.operationId ||
      endpoint.secured ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {endpoint.operationId ? (
            <span className="rounded-xl bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700">
              {t("workspace.operationId", { id: endpoint.operationId })}
            </span>
          ) : null}
          {endpoint.tags.map((tag) => (
            <span
              className="rounded-xl bg-[color:var(--color-brand-soft)] px-3 py-1 text-xs font-extrabold uppercase text-[color:var(--color-brand-purple)]"
              key={tag}
            >
              {tag}
            </span>
          ))}
          {endpoint.deprecated ? (
            <span className="rounded-xl bg-amber-100 px-3 py-1 text-xs font-extrabold uppercase text-amber-700">
              {t("workspace.deprecatedEndpoint")}
            </span>
          ) : null}
          {endpoint.secured ? (
            <span className="rounded-xl bg-sky-100 px-3 py-1 text-xs font-extrabold uppercase text-sky-700">
              {t("workspace.authRequired", {
                schemes: endpoint.securityRequirements.join(", "),
              })}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {Object.entries(groupedParameters).map(([location, parameters]) => (
          <div key={location}>
            <p className="font-extrabold text-[color:var(--color-brand-navy)]">
              {t(parameterLabelKeys[location as EndpointParameter["location"]])}{" "}
              {t("workspace.parameters")}
            </p>
            <p className="mt-1 font-medium text-[color:var(--color-brand-muted)]">
              {parameters.length > 0
                ? parameters
                    .map((parameter) =>
                      parameter.required
                        ? `${parameter.name} (${t("workspace.required")})`
                        : parameter.name,
                    )
                    .join(", ")
                : t("workspace.none")}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-extrabold text-[color:var(--color-brand-navy)]">
              {t("workspace.requestBody")}
            </p>
            {endpoint.requestBodies[0]?.required ? (
              <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-extrabold uppercase text-red-700">
                {t("workspace.required")}
              </span>
            ) : null}
          </div>
          {endpoint.requestBodies[0]?.description ? (
            <p className="mt-1 font-medium leading-5 text-[color:var(--color-brand-muted)]">
              {endpoint.requestBodies[0].description}
            </p>
          ) : null}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
            {t("workspace.tryItOut")}
          </p>
          {endpoint.parameters.length > 0 ||
          endpoint.requestBodies.length > 0 ||
          endpoint.responses.length > 1 ? (
            <button
              className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isExecuting}
              type="button"
              onClick={handleResetTryItOut}
            >
              {t("workspace.resetTryItOut")}
            </button>
          ) : null}
        </div>
        {endpoint.parameters.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {endpoint.parameters.map((parameter, parameterIndex) => {
              const locationLabel = t(parameterLabelKeys[parameter.location]);
              const parameterKey = getRequestParameterKey(parameter);
              const isRequiredParameterMissing =
                hasAttemptedExecution &&
                missingRequiredParameterKeys.has(parameterKey);
              const parameterErrorId = `${requestBodyInputId}-parameter-${parameterIndex}-error`;

              return (
                <label
                  className="flex flex-col gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]"
                  key={parameterKey}
                >
                  <span>
                    {locationLabel}: {parameter.name}
                    {parameter.required ? (
                      <span className="ml-2 rounded-lg bg-red-100 px-2 py-0.5 text-xs font-extrabold uppercase text-red-700">
                        {t("workspace.required")}
                      </span>
                    ) : null}
                  </span>
                  <input
                    aria-describedby={
                      isRequiredParameterMissing ? parameterErrorId : undefined
                    }
                    aria-invalid={isRequiredParameterMissing || undefined}
                    aria-label={t("workspace.parameterInputLabel", {
                      location: locationLabel,
                      name: parameter.name,
                    })}
                    className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
                    placeholder={
                      parameter.example
                        ? t("workspace.parameterExamplePlaceholder", {
                            value: parameter.example,
                          })
                        : t("workspace.parameterValuePlaceholder")
                    }
                    required={parameter.required}
                    type="text"
                    value={parameterValues[parameterKey] ?? ""}
                    onChange={(event) =>
                      handleParameterValueChange(parameter, event.target.value)
                    }
                  />
                  {parameter.description ? (
                    <span className="text-xs font-medium leading-5 text-[color:var(--color-brand-muted)]">
                      {parameter.description}
                    </span>
                  ) : null}
                  {isRequiredParameterMissing ? (
                    <span
                      className="text-xs font-semibold text-red-700"
                      id={parameterErrorId}
                      role="alert"
                    >
                      {t("workspace.parameterRequired", {
                        name: parameter.name,
                      })}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        ) : null}

        {endpoint.requestBodies.length > 0 ? (
          <div className="mt-3 space-y-3">
            {endpoint.requestBodies.length > 1 ? (
              <label className="flex flex-col gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
                {t("workspace.requestContentType")}
                <select
                  aria-label={t("workspace.requestContentType")}
                  className="h-11 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-4 font-mono text-xs font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
                  value={activeRequestContentType}
                  onChange={(event) =>
                    handleRequestContentTypeChange(event.target.value)
                  }
                >
                  {endpoint.requestBodies.map((requestBody) => (
                    <option
                      key={requestBody.contentType}
                      value={requestBody.contentType}
                    >
                      {requestBody.contentType}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  className="flex flex-wrap items-center gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]"
                  htmlFor={requestBodyInputId}
                >
                  {t("workspace.requestBody")}
                  {isRequestBodyRequired ? (
                    <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-extrabold uppercase text-red-700">
                      {t("workspace.required")}
                    </span>
                  ) : null}
                </label>
                {isJsonRequestBody ? (
                  <button
                    className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      !requestBodyValue.trim() || isJsonRequestBodyInvalid
                    }
                    type="button"
                    onClick={handleFormatRequestBody}
                  >
                    {t("workspace.formatRequestBody")}
                  </button>
                ) : null}
              </div>
              <textarea
                aria-describedby={
                  isRequestBodyInvalid
                    ? `${requestBodyInputId}-error`
                    : undefined
                }
                aria-invalid={isRequestBodyInvalid || undefined}
                aria-label={t("workspace.requestBodyInputLabel")}
                className="min-h-28 rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 font-mono text-xs font-medium leading-5 outline-none transition focus:border-[color:var(--color-brand-purple)]"
                id={requestBodyInputId}
                required={isRequestBodyRequired}
                value={requestBodyValue}
                onChange={(event) =>
                  handleRequestBodyChange(event.target.value)
                }
              />
              {isRequiredRequestBodyMissing ? (
                <span
                  className="text-xs font-semibold text-red-700"
                  id={`${requestBodyInputId}-error`}
                  role="alert"
                >
                  {t("workspace.requestBodyRequired")}
                </span>
              ) : null}
              {isJsonRequestBodyInvalid ? (
                <span
                  className="text-xs font-semibold text-red-700"
                  id={`${requestBodyInputId}-error`}
                  role="alert"
                >
                  {t("workspace.requestBodyInvalidJson")}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {endpoint.responses.length > 1 ? (
          <label className="mt-3 flex flex-col gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
            {t("workspace.responseStatus")}
            <select
              aria-label={t("workspace.responseStatus")}
              className="h-11 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
              value={activeResponseStatus}
              onChange={(event) =>
                handleResponseStatusChange(event.target.value)
              }
            >
              {endpoint.responses.map((response) => (
                <option key={response.status} value={response.status}>
                  {response.status} - {response.description}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
              {requestCodeFormat === "curl"
                ? t("workspace.curl")
                : t("workspace.fetch")}
            </p>
            <div
              aria-label={t("workspace.requestCodeFormat")}
              className="inline-flex h-9 items-center rounded-xl border border-[color:var(--color-brand-border)] bg-white p-1"
              role="group"
            >
              {(["curl", "fetch"] as const).map((format) => (
                <button
                  aria-pressed={requestCodeFormat === format}
                  className={`h-7 rounded-lg px-3 text-xs font-extrabold transition ${
                    requestCodeFormat === format
                      ? "bg-[color:var(--color-brand-purple)] text-white"
                      : "text-[color:var(--color-brand-muted)] hover:bg-[color:var(--color-brand-soft)]"
                  }`}
                  key={format}
                  type="button"
                  onClick={() => setRequestCodeFormat(format)}
                >
                  {format === "curl"
                    ? t("workspace.curl")
                    : t("workspace.fetch")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="h-10 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:border-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)]"
              disabled={hasMissingRequiredPathParameters}
              type="button"
              onClick={handleCopyRequestUrl}
            >
              {t("workspace.copyRequestUrl")}
            </button>
            <button
              className="h-10 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={
                requestCodeFormat === "curl" ? handleCopyCurl : handleCopyFetch
              }
            >
              {requestCodeFormat === "curl"
                ? t("workspace.copyCurl")
                : t("workspace.copyFetch")}
            </button>
            <button
              aria-busy={isExecuting}
              className="h-10 rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 text-sm font-extrabold text-white shadow-[0_12px_24px_rgba(90,45,255,0.18)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={
                isExecuting ||
                isRequestBodyInvalid ||
                (hasAttemptedExecution && hasMissingRequiredParameters)
              }
              type="button"
              onClick={handleTryItOut}
            >
              {isExecuting ? t("workspace.executing") : t("workspace.tryItOut")}
            </button>
            {isExecuting ? (
              <button
                className="h-10 rounded-2xl border border-red-300 bg-white px-4 text-sm font-extrabold text-red-700 transition hover:bg-red-50"
                type="button"
                onClick={handleCancelTryItOut}
              >
                {t("workspace.cancelRequest")}
              </button>
            ) : null}
          </div>
        </div>
        <pre
          aria-label={`${requestCodeFormat === "curl" ? "cURL" : "Fetch"} ${endpoint.method} ${endpoint.path}`}
          className="mt-2 overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]"
        >
          {requestCodeFormat === "curl" ? currentCurl : currentFetch}
        </pre>
        {requestCodeFormat === "curl" && isCurlCopied ? (
          <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
            {t("workspace.curlCopied")}
          </p>
        ) : requestCodeFormat === "fetch" && isFetchCopied ? (
          <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
            {t("workspace.fetchCopied")}
          </p>
        ) : isRequestUrlCopied ? (
          <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
            {t("workspace.requestUrlCopied")}
          </p>
        ) : wasRequestCancelled ? (
          <p
            aria-live="polite"
            className="mt-2 text-sm font-bold text-[color:var(--color-brand-muted)]"
          >
            {t("workspace.requestCancelled")}
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
              className={`rounded-xl px-3 py-1 font-extrabold ${getStatusColorClasses(mockResult.status)}`}
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
            {isResponseCopied ? (
              <span className="font-bold text-emerald-700">
                {t("workspace.responseCopied")}
              </span>
            ) : areResponseHeadersCopied ? (
              <span className="font-bold text-emerald-700">
                {t("workspace.responseHeadersCopied")}
              </span>
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="button"
                onClick={handleClearResponse}
              >
                {t("workspace.clearResponse")}
              </button>
              <button
                className="h-9 rounded-lg border border-[color:var(--color-brand-purple)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!mockResult.body}
                type="button"
                onClick={handleDownloadResponse}
              >
                {t("workspace.downloadResponse")}
              </button>
              <button
                className="h-9 rounded-lg border border-[color:var(--color-brand-purple)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!formattedResponseHeaders}
                type="button"
                onClick={handleCopyResponseHeaders}
              >
                {t("workspace.copyResponseHeaders")}
              </button>
              <button
                className="h-9 rounded-lg border border-[color:var(--color-brand-purple)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!formattedResponseBody}
                type="button"
                onClick={handleCopyResponse}
              >
                {t("workspace.copyResponse")}
              </button>
            </div>
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
          <pre
            aria-label={t("workspace.responseBody")}
            className="mt-3 overflow-x-auto rounded-2xl bg-white p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]"
          >
            {formattedResponseBody}
          </pre>
        </div>
      ) : null}
    </article>
  );
}

export const EndpointCard = memo(EndpointCardComponent);
