export const REQUEST_PRESETS_STORAGE_KEY = "rsswag-request-presets-v1";

const MAX_REQUEST_PRESETS = 100;
const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 80;
const MAX_METHOD_LENGTH = 16;
const MAX_PATH_LENGTH = 2048;
const MAX_PARAMETER_VALUES = 100;
const MAX_PARAMETER_KEY_LENGTH = 512;
const MAX_PARAMETER_VALUE_LENGTH = 8192;
const MAX_REQUEST_BODIES = 10;
const MAX_CONTENT_TYPE_LENGTH = 256;
const MAX_REQUEST_BODY_LENGTH = 1024 * 1024;
const MAX_RESPONSE_STATUS_LENGTH = 32;
const REQUEST_TIMEOUT_OPTIONS_MS = new Set([5_000, 10_000, 30_000]);

export type RequestPreset = {
  createdAt: string;
  id: string;
  method: string;
  name: string;
  parameterValues: Record<string, string>;
  path: string;
  requestBodies: Record<string, string>;
  requestContentType: string;
  responseStatus: string;
  timeoutMs: number;
  updatedAt: string;
};

export type RequestPresetDraft = Omit<
  RequestPreset,
  "createdAt" | "id" | "updatedAt"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function readTimestamp(value: unknown) {
  const timestamp = readText(value, 64);
  const date = new Date(timestamp);

  return timestamp && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

function sanitizeStringRecord(
  value: unknown,
  maxEntries: number,
  maxKeyLength: number,
  maxValueLength: number,
) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value)
    .slice(0, maxEntries)
    .reduce<Record<string, string>>((result, [key, item]) => {
      const normalizedKey = key.slice(0, maxKeyLength).trim();

      if (normalizedKey && typeof item === "string") {
        result[normalizedKey] = item.slice(0, maxValueLength);
      }

      return result;
    }, {});
}

function sanitizeRequestPreset(value: unknown): RequestPreset | null {
  if (!isRecord(value)) {
    return null;
  }

  const createdAt = readTimestamp(value.createdAt);
  const id = readText(value.id, MAX_ID_LENGTH).trim();
  const method = readText(value.method, MAX_METHOD_LENGTH).trim().toUpperCase();
  const name = readText(value.name, MAX_NAME_LENGTH).trim();
  const path = readText(value.path, MAX_PATH_LENGTH).trim();
  const updatedAt = readTimestamp(value.updatedAt);

  if (!createdAt || !id || !method || !name || !path || !updatedAt) {
    return null;
  }

  const timeoutMs =
    typeof value.timeoutMs === "number" &&
    REQUEST_TIMEOUT_OPTIONS_MS.has(value.timeoutMs)
      ? value.timeoutMs
      : 10_000;

  return {
    createdAt,
    id,
    method,
    name,
    parameterValues: sanitizeStringRecord(
      value.parameterValues,
      MAX_PARAMETER_VALUES,
      MAX_PARAMETER_KEY_LENGTH,
      MAX_PARAMETER_VALUE_LENGTH,
    ),
    path,
    requestBodies: sanitizeStringRecord(
      value.requestBodies,
      MAX_REQUEST_BODIES,
      MAX_CONTENT_TYPE_LENGTH,
      MAX_REQUEST_BODY_LENGTH,
    ),
    requestContentType: readText(
      value.requestContentType,
      MAX_CONTENT_TYPE_LENGTH,
    ).trim(),
    responseStatus: readText(
      value.responseStatus,
      MAX_RESPONSE_STATUS_LENGTH,
    ).trim(),
    timeoutMs,
    updatedAt,
  };
}

function createId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  return randomUuid
    ? `preset-${randomUuid}`
    : `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDate(value: Date) {
  return Number.isNaN(value.getTime()) ? new Date(0) : value;
}

export function createRequestPreset(
  draft: RequestPresetDraft,
  createdAt = new Date(),
) {
  const timestamp = normalizeDate(createdAt).toISOString();
  const preset = sanitizeRequestPreset({
    ...draft,
    createdAt: timestamp,
    id: createId(),
    updatedAt: timestamp,
  });

  if (!preset) {
    throw new Error("Invalid request preset.");
  }

  return preset;
}

export function updateRequestPreset(
  preset: RequestPreset,
  draft: RequestPresetDraft,
  updatedAt = new Date(),
) {
  const nextPreset = sanitizeRequestPreset({
    ...draft,
    createdAt: preset.createdAt,
    id: preset.id,
    updatedAt: normalizeDate(updatedAt).toISOString(),
  });

  if (!nextPreset) {
    throw new Error("Invalid request preset.");
  }

  return nextPreset;
}

export function getRequestPresetsForEndpoint(
  presets: RequestPreset[],
  method: string,
  path: string,
) {
  const normalizedMethod = method.trim().toUpperCase();
  const normalizedPath = path.trim();

  return presets
    .filter(
      (preset) =>
        preset.method === normalizedMethod && preset.path === normalizedPath,
    )
    .sort(
      (first, second) =>
        Date.parse(second.updatedAt) - Date.parse(first.updatedAt) ||
        first.name.localeCompare(second.name),
    );
}

export function upsertRequestPreset(
  presets: RequestPreset[],
  preset: RequestPreset,
) {
  const presetsById = new Map<string, RequestPreset>();

  [...presets, preset].forEach((item) => {
    const sanitizedPreset = sanitizeRequestPreset(item);

    if (sanitizedPreset) {
      presetsById.set(sanitizedPreset.id, sanitizedPreset);
    }
  });

  return Array.from(presetsById.values())
    .sort(
      (first, second) =>
        Date.parse(second.updatedAt) - Date.parse(first.updatedAt),
    )
    .slice(0, MAX_REQUEST_PRESETS);
}

export function removeRequestPreset(
  presets: RequestPreset[],
  presetId: string,
) {
  return presets.filter((preset) => preset.id !== presetId);
}

export function readRequestPresets() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedPresets = window.localStorage.getItem(
      REQUEST_PRESETS_STORAGE_KEY,
    );

    if (!storedPresets) {
      return [];
    }

    const envelope = JSON.parse(storedPresets) as unknown;

    if (!isRecord(envelope) || envelope.storageVersion !== 1) {
      return [];
    }

    const presets = Array.isArray(envelope.presets) ? envelope.presets : [];

    return presets
      .map(sanitizeRequestPreset)
      .filter((preset): preset is RequestPreset => preset !== null)
      .slice(0, MAX_REQUEST_PRESETS);
  } catch {
    return [];
  }
}

export function saveRequestPresets(presets: RequestPreset[]) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const sanitizedPresets = presets
      .map(sanitizeRequestPreset)
      .filter((preset): preset is RequestPreset => preset !== null)
      .slice(0, MAX_REQUEST_PRESETS);

    if (sanitizedPresets.length === 0) {
      window.localStorage.removeItem(REQUEST_PRESETS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        REQUEST_PRESETS_STORAGE_KEY,
        JSON.stringify({ presets: sanitizedPresets, storageVersion: 1 }),
      );
    }

    return true;
  } catch {
    return false;
  }
}
