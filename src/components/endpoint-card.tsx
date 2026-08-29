"use client";

import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import { RequestPresetControls } from "@/components/request-preset-controls";
import { ResponseContractReport } from "@/components/response-contract-report";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  createEndpointPermalink,
  getEndpointAnchor,
} from "@/lib/endpoint-link";
import {
  createCurlPreview,
  createFetchPreview,
  createHttpPreview,
  CurlParameter,
  EndpointParameter,
  EndpointSummary,
  ResponseSummary,
  SchemaDetails as SchemaDetailsSummary,
  SecuritySchemeSummary,
  selectDefaultResponse,
} from "@/lib/openapi";
import {
  isCancelRequestShortcut,
  isRunRequestShortcut,
} from "@/lib/keyboard-shortcut";
import {
  saveRequestHistoryRecord,
  saveServerRequestHistoryRecord,
} from "@/lib/request-history";
import {
  createRequestBodyContractReport,
  formatJsonBody,
  hasInvalidJsonBody,
  isJsonMediaType,
  type RequestBodyContractCode,
} from "@/lib/request-body";
import {
  getMissingRequiredParameterKeys,
  getRequestParameterValidationIssues,
  getRequestParameterKey,
  type RequestParameterValidationCode,
} from "@/lib/request-parameters";
import type { RequestEnvironmentHeader } from "@/lib/request-environments";
import {
  REDACTED_AUTH_VALUE,
  createAuthRequestParameters,
  isAuthRequestParameter,
  mergeRequestAuthentication,
  redactAuthQueryFromUrl,
  type RequestAuthValues,
} from "@/lib/request-auth";
import {
  createRequestPreset,
  getRequestPresetsForEndpoint,
  updateRequestPreset,
  type RequestPreset,
  type RequestPresetDraft,
} from "@/lib/request-presets";
import {
  downloadRequestPreviewFile,
  type RequestPreviewFormat,
} from "@/lib/request-preview-download";
import { buildRequestUrl, hasSendableRequestBody } from "@/lib/request-url";
import { getResponseDownloadMetadata } from "@/lib/response-download";
import { createResponseContractReport } from "@/lib/response-contract";
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

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_OPTIONS_MS = [5_000, 10_000, 30_000] as const;
const EMPTY_ENVIRONMENT_HEADERS: RequestEnvironmentHeader[] = [];
const EMPTY_REQUEST_PRESETS: RequestPreset[] = [];
const EMPTY_REQUEST_AUTH_VALUES: RequestAuthValues = {};
const EMPTY_SECURITY_SCHEMES: SecuritySchemeSummary[] = [];

const parameterLabelKeys: Record<
  EndpointParameter["location"],
  TranslationKey
> = {
  cookie: "workspace.cookie",
  header: "workspace.header",
  path: "workspace.path",
  query: "workspace.query",
};

const parameterValidationMessageKeys: Record<
  RequestParameterValidationCode,
  TranslationKey
> = {
  boolean: "workspace.parameterBoolean",
  enum: "workspace.parameterEnum",
  integer: "workspace.parameterInteger",
  maximum: "workspace.parameterMaximum",
  "max-length": "workspace.parameterMaxLength",
  minimum: "workspace.parameterMinimum",
  "min-length": "workspace.parameterMinLength",
  number: "workspace.parameterNumber",
  pattern: "workspace.parameterPattern",
};

const requestBodyContractMessageKeys: Record<
  RequestBodyContractCode,
  TranslationKey
> = {
  "body-matched": "workspace.contractBodyMatched",
  "body-missing-required": "workspace.contractBodyMissingRequired",
  "body-type-mismatch": "workspace.contractBodyTypeMismatch",
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
  timeoutMs: number;
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
  authValues = EMPTY_REQUEST_AUTH_VALUES,
  canSaveHistory,
  endpoint,
  environmentHeaders = EMPTY_ENVIRONMENT_HEADERS,
  isFavorite = false,
  onDeleteRequestPreset,
  onSaveRequestPreset,
  onToggleFavorite,
  requestPresets = EMPTY_REQUEST_PRESETS,
  securitySchemes = EMPTY_SECURITY_SCHEMES,
}: {
  authValues?: RequestAuthValues;
  canSaveHistory: boolean;
  endpoint: EndpointSummary;
  environmentHeaders?: RequestEnvironmentHeader[];
  isFavorite?: boolean;
  onDeleteRequestPreset?: (presetId: string) => boolean;
  onSaveRequestPreset?: (preset: RequestPreset) => boolean;
  onToggleFavorite?: () => void;
  requestPresets?: RequestPreset[];
  securitySchemes?: SecuritySchemeSummary[];
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
  const [copiedHttp, setCopiedHttp] = useState("");
  const [copiedRequestUrl, setCopiedRequestUrl] = useState("");
  const [copiedResponseBody, setCopiedResponseBody] = useState("");
  const [copiedResponseHeaders, setCopiedResponseHeaders] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const [requestCodeFormat, setRequestCodeFormat] =
    useState<RequestPreviewFormat>("curl");
  const [wasRequestCancelled, setWasRequestCancelled] = useState(false);
  const [hasAttemptedExecution, setHasAttemptedExecution] = useState(false);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const [selectedRequestPresetId, setSelectedRequestPresetId] = useState("");
  const [parameterValues, setParameterValues] = useState(() =>
    createInitialParameterValues(endpoint),
  );
  const authRequestParameters = useMemo(
    () =>
      createAuthRequestParameters(
        securitySchemes,
        authValues,
        endpoint.securityRequirements,
        endpoint.securityRequirementGroups,
      ),
    [authValues, endpoint, securitySchemes],
  );
  const missingRequiredParameterKeys = new Set(
    getMissingRequiredParameterKeys(endpoint.parameters, parameterValues, [
      ...environmentHeaders,
      ...authRequestParameters,
    ]),
  );
  const hasMissingRequiredParameters = missingRequiredParameterKeys.size > 0;
  const parameterValidationIssues = getRequestParameterValidationIssues(
    endpoint.parameters,
    parameterValues,
    [...environmentHeaders, ...authRequestParameters],
  );
  const parameterValidationIssuesByKey = new Map(
    parameterValidationIssues.map((issue) => [issue.key, issue]),
  );
  const hasInvalidRequestParameters = parameterValidationIssues.length > 0;
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
  const requestBodyContractReport = useMemo(
    () =>
      createRequestBodyContractReport(
        activeRequestContentType,
        requestBodyValue,
        activeRequestBody?.schema ?? null,
      ),
    [activeRequestBody?.schema, activeRequestContentType, requestBodyValue],
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
  const endpointRequestPresets = useMemo(
    () =>
      getRequestPresetsForEndpoint(
        requestPresets,
        endpoint.method,
        endpoint.path,
      ),
    [endpoint.method, endpoint.path, requestPresets],
  );
  const activeRequestPresetId = endpointRequestPresets.some(
    (preset) => preset.id === selectedRequestPresetId,
  )
    ? selectedRequestPresetId
    : "";

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
  const endpointRequestParameters = useMemo(
    () => createRequestParameters(endpoint, parameterValues),
    [endpoint, parameterValues],
  );
  const requestParameters = useMemo(
    () =>
      mergeRequestAuthentication(
        endpointRequestParameters,
        environmentHeaders,
        authRequestParameters,
      ),
    [authRequestParameters, endpointRequestParameters, environmentHeaders],
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
  const currentHttp = useMemo(
    () =>
      createHttpPreview(
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
  const isHttpCopied = copiedHttp === currentHttp && copiedHttp !== "";
  const currentRequestCode =
    requestCodeFormat === "curl"
      ? currentCurl
      : requestCodeFormat === "fetch"
        ? currentFetch
        : currentHttp;
  const requestCodeLabel =
    requestCodeFormat === "curl"
      ? t("workspace.curl")
      : requestCodeFormat === "fetch"
        ? t("workspace.fetch")
        : t("workspace.http");
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
  const responseContractReport = useMemo(
    () =>
      mockResult
        ? createResponseContractReport(endpoint.responses, {
            body: mockResult.body,
            headers: mockResult.headers,
            method: endpoint.method,
            status: mockResult.status,
          })
        : null,
    [endpoint.method, endpoint.responses, mockResult],
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
    setCopiedHttp("");

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
    setCopiedHttp("");
    setCopiedRequestUrl("");

    const copied = await writeTextToClipboard(currentFetch);

    setCopiedFetch(copied ? currentFetch : "");
  }

  async function handleCopyHttp() {
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedHttp("");
    setCopiedRequestUrl("");

    const copied = await writeTextToClipboard(currentHttp);

    setCopiedHttp(copied ? currentHttp : "");
  }

  async function handleCopyRequestUrl() {
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedHttp("");
    setCopiedRequestUrl("");

    if (hasMissingRequiredPathParameters) {
      return;
    }

    const copied = await writeTextToClipboard(currentRequestUrl);

    setCopiedRequestUrl(copied ? currentRequestUrl : "");
  }

  function handleDownloadRequestCode() {
    downloadRequestPreviewFile(
      currentRequestCode,
      requestCodeFormat,
      endpoint.method,
      endpoint.path,
    );
  }

  async function handleCopyResponse() {
    setCopiedResponseHeaders("");

    if (!formattedResponseBody) {
      return;
    }

    const copied = await writeTextToClipboard(formattedResponseBody);

    setCopiedResponseBody(copied ? formattedResponseBody : "");
  }

  async function handleCopyResponseHeaders() {
    setCopiedResponseBody("");

    if (!formattedResponseHeaders) {
      return;
    }

    const copied = await writeTextToClipboard(formattedResponseHeaders);

    setCopiedResponseHeaders(copied ? formattedResponseHeaders : "");
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

  function handleRequestTimeoutChange(value: string) {
    setRequestTimeoutMs(Number(value));
  }

  function createCurrentRequestPresetDraft(name: string): RequestPresetDraft {
    const requestBodies = { ...requestBodyDraftsRef.current };

    if (activeRequestContentType) {
      requestBodies[activeRequestContentType] = requestBodyValue;
    }

    return {
      method: endpoint.method,
      name,
      parameterValues: { ...parameterValues },
      path: endpoint.path,
      requestBodies,
      requestContentType: activeRequestContentType,
      responseStatus: activeResponseStatus,
      timeoutMs: requestTimeoutMs,
    };
  }

  function clearTryItOutResult() {
    setHasAttemptedExecution(false);
    setWasRequestCancelled(false);
    setMockResult(null);
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedHttp("");
    setCopiedRequestUrl("");
    setCopiedResponseBody("");
    setCopiedResponseHeaders("");
  }

  function handleApplyRequestPreset(presetId: string) {
    setSelectedRequestPresetId(presetId);

    if (!presetId) {
      return;
    }

    const preset = endpointRequestPresets.find((item) => item.id === presetId);

    if (!preset) {
      return;
    }

    const nextParameterValues = createInitialParameterValues(endpoint);

    editedParameterKeysRef.current.clear();
    endpoint.parameters.forEach((parameter) => {
      const key = getRequestParameterKey(parameter);

      if (Object.hasOwn(preset.parameterValues, key)) {
        nextParameterValues[key] = preset.parameterValues[key];
        editedParameterKeysRef.current.add(key);
      }
    });

    const supportedContentTypes = new Set(
      endpoint.requestBodies.map((requestBody) => requestBody.contentType),
    );
    const nextRequestBodies = Object.entries(preset.requestBodies).reduce<
      Record<string, string>
    >((result, [contentType, value]) => {
      if (supportedContentTypes.has(contentType)) {
        result[contentType] = value;
      }

      return result;
    }, {});
    const nextContentType = supportedContentTypes.has(preset.requestContentType)
      ? preset.requestContentType
      : endpoint.requestBodies[0]?.contentType || "";
    const nextRequestBody = Object.hasOwn(nextRequestBodies, nextContentType)
      ? nextRequestBodies[nextContentType]
      : getRequestBody(endpoint, nextContentType)?.schema.example || "";
    const nextResponseStatus = endpoint.responses.some(
      (response) => response.status === preset.responseStatus,
    )
      ? preset.responseStatus
      : selectDefaultResponse(endpoint.responses)?.status || "";

    requestBodyDraftsRef.current = nextRequestBodies;
    editedRequestContentTypesRef.current = new Set(
      Object.keys(nextRequestBodies),
    );
    previousRequestContentTypeRef.current = nextContentType;
    previousResponseStatusRef.current = nextResponseStatus;
    setParameterValues(nextParameterValues);
    setSelectedRequestContentType(nextContentType);
    setRequestBodyValue(nextRequestBody);
    setSelectedResponseStatus(nextResponseStatus);
    setRequestTimeoutMs(preset.timeoutMs);
    clearTryItOutResult();
  }

  function handleCreateRequestPreset(name: string) {
    if (!onSaveRequestPreset) {
      return false;
    }

    const preset = createRequestPreset(createCurrentRequestPresetDraft(name));

    setSelectedRequestPresetId(preset.id);
    return onSaveRequestPreset(preset);
  }

  function handleUpdateRequestPreset(presetId: string) {
    const preset = endpointRequestPresets.find((item) => item.id === presetId);

    if (!preset || !onSaveRequestPreset) {
      return false;
    }

    return onSaveRequestPreset(
      updateRequestPreset(preset, createCurrentRequestPresetDraft(preset.name)),
    );
  }

  function handleDeleteRequestPreset(presetId: string) {
    if (!onDeleteRequestPreset) {
      return false;
    }

    setSelectedRequestPresetId("");
    return onDeleteRequestPreset(presetId);
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
    setRequestTimeoutMs(DEFAULT_REQUEST_TIMEOUT_MS);
    setSelectedRequestPresetId("");
    clearTryItOutResult();
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

  function handleEndpointKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented) {
      return;
    }

    if (isExecuting && isCancelRequestShortcut(event)) {
      event.preventDefault();
      handleCancelTryItOut();
      return;
    }

    if (!isRunRequestShortcut(event)) {
      return;
    }

    event.preventDefault();
    void handleTryItOut();
  }

  async function handleTryItOut() {
    if (isExecuting || isRequestBodyInvalid) {
      return;
    }

    if (hasMissingRequiredParameters || hasInvalidRequestParameters) {
      setHasAttemptedExecution(true);
      return;
    }

    const abortController = new AbortController();
    requestAbortControllerRef.current = abortController;
    setIsExecuting(true);
    setWasRequestCancelled(false);
    setCopiedCurl("");
    setCopiedFetch("");
    setCopiedHttp("");
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
      value: isAuthRequestParameter(parameter, authRequestParameters)
        ? REDACTED_AUTH_VALUE
        : parameter.value,
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
        timeoutMs: requestTimeoutMs,
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
    const redactedExecutionUrl = redactAuthQueryFromUrl(
      executionResult.url,
      authRequestParameters,
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
        // executionResult.status is the literal string "0" for a network
        // failure - `|| 200` would treat that falsy 0 as "no status" and
        // mislabel a failed request as a fake 200 success in history.
        status: Number(executionResult.status),
        summary: endpoint.summary,
        url: redactedExecutionUrl,
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
      url: redactedExecutionUrl,
    });
    setIsExecuting(false);
  }

  return (
    <article
      className="scroll-mt-36 rounded-2xl border border-[color:var(--color-brand-border)] p-4"
      id={endpointAnchor}
      onKeyDown={handleEndpointKeyDown}
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
        {onToggleFavorite ? (
          <button
            aria-label={t(
              isFavorite
                ? "workspace.removeEndpointFavorite"
                : "workspace.addEndpointFavorite",
              { method: endpoint.method, path: endpoint.path },
            )}
            aria-pressed={isFavorite}
            className={`ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition ${
              isFavorite
                ? "border-amber-300 bg-amber-50 text-amber-600"
                : "border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-amber-300 hover:text-amber-600"
            }`}
            title={t(
              isFavorite
                ? "workspace.removeEndpointFavorite"
                : "workspace.addEndpointFavorite",
              { method: endpoint.method, path: endpoint.path },
            )}
            type="button"
            onClick={onToggleFavorite}
          >
            <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
          </button>
        ) : null}
        <button
          aria-label={t("workspace.copyEndpointLinkAriaLabel", {
            method: endpoint.method,
            path: endpoint.path,
          })}
          className={`${onToggleFavorite ? "" : "ml-auto"} h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]`}
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
          {authRequestParameters.length > 0 ? (
            <span className="rounded-xl bg-emerald-100 px-3 py-1 text-xs font-extrabold uppercase text-emerald-700">
              {t("workspace.requestAuthApplied")}
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-xs font-bold text-[color:var(--color-brand-muted)]">
              {t("workspace.requestTimeout")}
              <select
                aria-label={t("workspace.requestTimeout")}
                className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-navy)] outline-none transition focus:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isExecuting}
                value={requestTimeoutMs}
                onChange={(event) =>
                  handleRequestTimeoutChange(event.target.value)
                }
              >
                {REQUEST_TIMEOUT_OPTIONS_MS.map((timeoutMs) => (
                  <option key={timeoutMs} value={timeoutMs}>
                    {t("workspace.timeoutSeconds", {
                      seconds: String(timeoutMs / 1000),
                    })}
                  </option>
                ))}
              </select>
            </label>
            {endpoint.parameters.length > 0 ||
            endpoint.requestBodies.length > 0 ||
            endpoint.responses.length > 1 ||
            requestTimeoutMs !== DEFAULT_REQUEST_TIMEOUT_MS ? (
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
        </div>
        {onSaveRequestPreset && onDeleteRequestPreset ? (
          <RequestPresetControls
            disabled={isExecuting}
            presets={endpointRequestPresets}
            selectedPresetId={activeRequestPresetId}
            onApply={handleApplyRequestPreset}
            onCreate={handleCreateRequestPreset}
            onDelete={handleDeleteRequestPreset}
            onUpdate={handleUpdateRequestPreset}
          />
        ) : null}
        {endpoint.parameters.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {endpoint.parameters.map((parameter, parameterIndex) => {
              const locationLabel = t(parameterLabelKeys[parameter.location]);
              const parameterKey = getRequestParameterKey(parameter);
              const isRequiredParameterMissing =
                hasAttemptedExecution &&
                missingRequiredParameterKeys.has(parameterKey);
              const validationIssue = hasAttemptedExecution
                ? parameterValidationIssuesByKey.get(parameterKey)
                : undefined;
              const isParameterInvalid =
                isRequiredParameterMissing || Boolean(validationIssue);
              const parameterErrorId = `${requestBodyInputId}-parameter-${parameterIndex}-error`;
              const parameterValue = parameterValues[parameterKey] ?? "";
              const parameterOptions =
                parameter.enumValues && parameter.enumValues.length > 0
                  ? parameter.enumValues
                  : parameter.type === "boolean"
                    ? ["true", "false"]
                    : null;
              const parameterInputLabel = t("workspace.parameterInputLabel", {
                location: locationLabel,
                name: parameter.name,
              });
              const parameterPlaceholder = parameter.example
                ? t("workspace.parameterExamplePlaceholder", {
                    value: parameter.example,
                  })
                : t("workspace.parameterValuePlaceholder");

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
                  {parameterOptions ? (
                    <select
                      aria-describedby={
                        isParameterInvalid ? parameterErrorId : undefined
                      }
                      aria-invalid={isParameterInvalid || undefined}
                      aria-label={parameterInputLabel}
                      className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
                      required={parameter.required}
                      value={parameterValue}
                      onChange={(event) =>
                        handleParameterValueChange(
                          parameter,
                          event.target.value,
                        )
                      }
                    >
                      <option value="">{parameterPlaceholder}</option>
                      {parameterValue &&
                      !parameterOptions.includes(parameterValue) ? (
                        <option disabled value={parameterValue}>
                          {parameterValue}
                        </option>
                      ) : null}
                      {parameterOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-describedby={
                        isParameterInvalid ? parameterErrorId : undefined
                      }
                      aria-invalid={isParameterInvalid || undefined}
                      aria-label={parameterInputLabel}
                      className="h-11 rounded-2xl border border-[color:var(--color-brand-border)] bg-white px-4 text-sm font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
                      inputMode={
                        parameter.type === "integer"
                          ? "numeric"
                          : parameter.type === "number"
                            ? "decimal"
                            : undefined
                      }
                      max={parameter.maximum}
                      maxLength={parameter.maxLength}
                      min={parameter.minimum}
                      minLength={parameter.minLength}
                      placeholder={parameterPlaceholder}
                      required={parameter.required}
                      step={parameter.type === "integer" ? 1 : "any"}
                      type="text"
                      value={parameterValue}
                      onChange={(event) =>
                        handleParameterValueChange(
                          parameter,
                          event.target.value,
                        )
                      }
                    />
                  )}
                  {parameter.description ? (
                    <span className="text-xs font-medium leading-5 text-[color:var(--color-brand-muted)]">
                      {parameter.description}
                    </span>
                  ) : null}
                  {isParameterInvalid ? (
                    <span
                      className="text-xs font-semibold text-red-700"
                      id={parameterErrorId}
                      role="alert"
                    >
                      {isRequiredParameterMissing
                        ? t("workspace.parameterRequired", {
                            name: parameter.name,
                          })
                        : validationIssue
                          ? t(
                              parameterValidationMessageKeys[
                                validationIssue.code
                              ],
                              {
                                ...validationIssue.params,
                                name: parameter.name,
                              },
                            )
                          : null}
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
              {requestBodyContractReport ? (
                <section
                  aria-label={t("workspace.requestBodyContractTitle")}
                  className="border-y border-[color:var(--color-brand-border)] py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs font-extrabold text-[color:var(--color-brand-navy)]">
                      {t("workspace.requestBodyContractTitle")}
                    </h4>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-extrabold ${
                        requestBodyContractReport.result === "pass"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {t(
                        requestBodyContractReport.result === "pass"
                          ? "workspace.contractPassed"
                          : "workspace.contractFailed",
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium leading-5 text-[color:var(--color-brand-muted)]">
                    {t(
                      requestBodyContractMessageKeys[
                        requestBodyContractReport.code
                      ],
                      requestBodyContractReport.params,
                    )}
                  </p>
                </section>
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
              {requestCodeLabel}
            </p>
            <div
              aria-label={t("workspace.requestCodeFormat")}
              className="inline-flex h-9 items-center rounded-xl border border-[color:var(--color-brand-border)] bg-white p-1"
              role="group"
            >
              {(["curl", "fetch", "http"] as const).map((format) => (
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
                    : format === "fetch"
                      ? t("workspace.fetch")
                      : t("workspace.http")}
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
                requestCodeFormat === "curl"
                  ? handleCopyCurl
                  : requestCodeFormat === "fetch"
                    ? handleCopyFetch
                    : handleCopyHttp
              }
            >
              {requestCodeFormat === "curl"
                ? t("workspace.copyCurl")
                : requestCodeFormat === "fetch"
                  ? t("workspace.copyFetch")
                  : t("workspace.copyHttp")}
            </button>
            <button
              aria-label={t("workspace.downloadRequestCodeAriaLabel", {
                format: requestCodeLabel,
                method: endpoint.method,
                path: endpoint.path,
              })}
              className="h-10 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleDownloadRequestCode}
            >
              {t("workspace.downloadRequestCode")}
            </button>
            <button
              aria-busy={isExecuting}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className="h-10 rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 text-sm font-extrabold text-white shadow-[0_12px_24px_rgba(90,45,255,0.18)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={
                isExecuting ||
                isRequestBodyInvalid ||
                (hasAttemptedExecution &&
                  (hasMissingRequiredParameters || hasInvalidRequestParameters))
              }
              type="button"
              onClick={handleTryItOut}
            >
              {isExecuting ? t("workspace.executing") : t("workspace.tryItOut")}
            </button>
            {isExecuting ? (
              <button
                aria-keyshortcuts="Escape"
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
          aria-label={`${requestCodeLabel} ${endpoint.method} ${endpoint.path}`}
          className="mt-2 overflow-x-auto rounded-2xl bg-[#fbfaff] p-3 font-mono text-xs leading-5 text-[color:var(--color-brand-navy)]"
        >
          {currentRequestCode}
        </pre>
        {requestCodeFormat === "curl" && isCurlCopied ? (
          <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
            {t("workspace.curlCopied")}
          </p>
        ) : requestCodeFormat === "fetch" && isFetchCopied ? (
          <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
            {t("workspace.fetchCopied")}
          </p>
        ) : requestCodeFormat === "http" && isHttpCopied ? (
          <p className="mt-2 text-sm font-bold text-emerald-700" role="status">
            {t("workspace.httpCopied")}
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
          {responseContractReport ? (
            <ResponseContractReport
              endpoint={{ method: endpoint.method, path: endpoint.path }}
              report={responseContractReport}
            />
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
