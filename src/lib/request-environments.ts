import type { CurlParameter } from "./openapi";
import { isPublicHttpServerUrl } from "./server-url";

export const REQUEST_ENVIRONMENTS_STORAGE_KEY =
  "rsswag-request-environments-v1";

const MAX_ENVIRONMENTS = 20;
const MAX_HEADERS_PER_ENVIRONMENT = 30;
const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 80;
const MAX_SERVER_URL_LENGTH = 2048;
const MAX_HEADER_NAME_LENGTH = 256;
const MAX_HEADER_VALUE_LENGTH = 8192;
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type RequestEnvironmentHeader = {
  enabled: boolean;
  id: string;
  name: string;
  value: string;
};

export type RequestEnvironment = {
  headers: RequestEnvironmentHeader[];
  id: string;
  name: string;
  serverUrl: string;
};

export type RequestEnvironmentSettings = {
  activeEnvironmentId: string;
  environments: RequestEnvironment[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createId(prefix: string) {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  return randomUuid
    ? `${prefix}-${randomUuid}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export function isValidRequestHeaderName(name: string) {
  return (
    name.length > 0 &&
    name.length <= MAX_HEADER_NAME_LENGTH &&
    HTTP_HEADER_NAME_PATTERN.test(name)
  );
}

export function isValidRequestHeaderValue(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_HEADER_VALUE_LENGTH &&
    !/[\r\n]/.test(value)
  );
}

function sanitizeHeader(value: unknown): RequestEnvironmentHeader | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value.id, MAX_ID_LENGTH).trim();
  const name = readText(value.name, MAX_HEADER_NAME_LENGTH).trim();
  const headerValue = readText(value.value, MAX_HEADER_VALUE_LENGTH).trim();

  if (
    !id ||
    !isValidRequestHeaderName(name) ||
    !isValidRequestHeaderValue(headerValue)
  ) {
    return null;
  }

  return {
    enabled: value.enabled !== false,
    id,
    name,
    value: headerValue,
  };
}

function sanitizeEnvironment(value: unknown): RequestEnvironment | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value.id, MAX_ID_LENGTH).trim();
  const name = readText(value.name, MAX_NAME_LENGTH).trim();
  const rawServerUrl = readText(value.serverUrl, MAX_SERVER_URL_LENGTH).trim();

  if (!id || !name) {
    return null;
  }

  const headers = Array.isArray(value.headers)
    ? value.headers
        .slice(0, MAX_HEADERS_PER_ENVIRONMENT)
        .map(sanitizeHeader)
        .filter((header): header is RequestEnvironmentHeader => header !== null)
    : [];

  return {
    headers,
    id,
    name,
    serverUrl:
      rawServerUrl && isPublicHttpServerUrl(rawServerUrl) ? rawServerUrl : "",
  };
}

function sanitizeSettings(value: unknown): RequestEnvironmentSettings {
  if (!isRecord(value)) {
    return createEmptyRequestEnvironmentSettings();
  }

  const environments = Array.isArray(value.environments)
    ? value.environments
        .slice(-MAX_ENVIRONMENTS)
        .map(sanitizeEnvironment)
        .filter(
          (environment): environment is RequestEnvironment =>
            environment !== null,
        )
        .filter(
          (environment, index, collection) =>
            collection.findIndex((item) => item.id === environment.id) ===
            index,
        )
    : [];
  const activeEnvironmentId = readText(
    value.activeEnvironmentId,
    MAX_ID_LENGTH,
  ).trim();

  return {
    activeEnvironmentId: environments.some(
      (environment) => environment.id === activeEnvironmentId,
    )
      ? activeEnvironmentId
      : "",
    environments,
  };
}

export function createEmptyRequestEnvironmentSettings(): RequestEnvironmentSettings {
  return {
    activeEnvironmentId: "",
    environments: [],
  };
}

export function createRequestEnvironmentHeader(): RequestEnvironmentHeader {
  return {
    enabled: true,
    id: createId("header"),
    name: "",
    value: "",
  };
}

export function createRequestEnvironment(): RequestEnvironment {
  return {
    headers: [createRequestEnvironmentHeader()],
    id: createId("environment"),
    name: "",
    serverUrl: "",
  };
}

export function getActiveRequestEnvironment(
  settings: RequestEnvironmentSettings,
) {
  return (
    settings.environments.find(
      (environment) => environment.id === settings.activeEnvironmentId,
    ) ?? null
  );
}

export function getEnabledRequestEnvironmentHeaders(
  environment: RequestEnvironment | null,
) {
  if (!environment) {
    return [];
  }

  const headersByName = new Map<string, RequestEnvironmentHeader>();

  environment.headers.forEach((header) => {
    if (
      header.enabled &&
      isValidRequestHeaderName(header.name) &&
      isValidRequestHeaderValue(header.value)
    ) {
      headersByName.set(header.name.toLowerCase(), header);
    }
  });

  return Array.from(headersByName.values());
}

export function mergeRequestEnvironmentHeaders(
  parameters: CurlParameter[],
  environmentHeaders: RequestEnvironmentHeader[],
) {
  const endpointHeaderNames = new Set(
    parameters
      .filter((parameter) => parameter.location === "header")
      .map((parameter) => parameter.name.toLowerCase()),
  );
  const inheritedHeaders = getEnabledRequestEnvironmentHeaders({
    headers: environmentHeaders,
    id: "active",
    name: "Active",
    serverUrl: "",
  })
    .filter((header) => !endpointHeaderNames.has(header.name.toLowerCase()))
    .map<CurlParameter>((header) => ({
      location: "header",
      name: header.name,
      value: header.value,
    }));

  return [...inheritedHeaders, ...parameters];
}

export function upsertRequestEnvironment(
  settings: RequestEnvironmentSettings,
  environment: RequestEnvironment,
) {
  const existingIndex = settings.environments.findIndex(
    (item) => item.id === environment.id,
  );
  const environments = [...settings.environments];

  if (existingIndex >= 0) {
    environments[existingIndex] = environment;
  } else {
    environments.push(environment);
  }

  return sanitizeSettings({
    activeEnvironmentId:
      existingIndex >= 0 ? settings.activeEnvironmentId : environment.id,
    environments,
  });
}

export function removeRequestEnvironment(
  settings: RequestEnvironmentSettings,
  environmentId: string,
) {
  return sanitizeSettings({
    activeEnvironmentId:
      settings.activeEnvironmentId === environmentId
        ? ""
        : settings.activeEnvironmentId,
    environments: settings.environments.filter(
      (environment) => environment.id !== environmentId,
    ),
  });
}

export function readRequestEnvironmentSettings() {
  if (typeof window === "undefined") {
    return createEmptyRequestEnvironmentSettings();
  }

  try {
    const storedSettings = window.localStorage.getItem(
      REQUEST_ENVIRONMENTS_STORAGE_KEY,
    );

    if (!storedSettings) {
      return createEmptyRequestEnvironmentSettings();
    }

    const envelope = JSON.parse(storedSettings) as unknown;

    return isRecord(envelope) && envelope.storageVersion === 1
      ? sanitizeSettings(envelope.settings)
      : createEmptyRequestEnvironmentSettings();
  } catch {
    return createEmptyRequestEnvironmentSettings();
  }
}

export function saveRequestEnvironmentSettings(
  settings: RequestEnvironmentSettings,
) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const sanitizedSettings = sanitizeSettings(settings);

    if (sanitizedSettings.environments.length === 0) {
      window.localStorage.removeItem(REQUEST_ENVIRONMENTS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        REQUEST_ENVIRONMENTS_STORAGE_KEY,
        JSON.stringify({ settings: sanitizedSettings, storageVersion: 1 }),
      );
    }

    return true;
  } catch {
    return false;
  }
}
