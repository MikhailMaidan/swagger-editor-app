import type { EndpointParameter, EndpointSummary } from "./openapi";
import {
  createComparableEndpoint,
  type ComparableEndpoint,
} from "./schema-change";

export const SCHEMA_COMPARISON_BASELINE_STORAGE_KEY =
  "rsswag-schema-comparison-baseline-v1";

const MAX_BASELINE_ENDPOINTS = 5000;
const MAX_TEXT_LENGTH = 4096;

export type SchemaComparisonBaseline = {
  capturedAt: string;
  endpoints: ComparableEndpoint[];
  title: string;
  version: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function isParameterLocation(
  value: unknown,
): value is EndpointParameter["location"] {
  return (
    value === "cookie" ||
    value === "header" ||
    value === "path" ||
    value === "query"
  );
}

function sanitizeEndpoint(value: unknown): ComparableEndpoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const method = readText(value.method).trim().toUpperCase();
  const path = readText(value.path).trim();

  if (!method || !path) {
    return null;
  }

  const parameters = Array.isArray(value.parameters)
    ? value.parameters.flatMap((parameter) => {
        if (!isRecord(parameter) || !isParameterLocation(parameter.location)) {
          return [];
        }

        const name = readText(parameter.name).trim();

        return name
          ? [
              {
                location: parameter.location,
                name,
                required: parameter.required === true,
              },
            ]
          : [];
      })
    : [];
  const requestBodies = Array.isArray(value.requestBodies)
    ? value.requestBodies.flatMap((requestBody) => {
        if (!isRecord(requestBody)) {
          return [];
        }

        const contentType = readText(requestBody.contentType)
          .trim()
          .toLowerCase();

        return contentType
          ? [
              {
                contentType,
                required: requestBody.required === true,
              },
            ]
          : [];
      })
    : [];
  const responseStatuses = Array.isArray(value.responseStatuses)
    ? value.responseStatuses
        .filter((status): status is string => typeof status === "string")
        .map((status) => status.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const tags = Array.isArray(value.tags)
    ? value.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  return {
    deprecated: value.deprecated === true,
    description: readText(value.description),
    method,
    operationId: readText(value.operationId).trim(),
    parameters,
    path,
    requestBodies,
    responseStatuses: Array.from(new Set(responseStatuses)).sort(),
    secured: value.secured === true,
    summary: readText(value.summary),
    tags: Array.from(new Set(tags)).sort(),
  };
}

function sanitizeBaseline(value: unknown): SchemaComparisonBaseline | null {
  if (!isRecord(value) || !Array.isArray(value.endpoints)) {
    return null;
  }

  const capturedAt = readText(value.capturedAt);
  const capturedDate = new Date(capturedAt);

  if (!capturedAt || Number.isNaN(capturedDate.getTime())) {
    return null;
  }

  return {
    capturedAt: capturedDate.toISOString(),
    endpoints: value.endpoints
      .slice(0, MAX_BASELINE_ENDPOINTS)
      .map(sanitizeEndpoint)
      .filter((endpoint): endpoint is ComparableEndpoint => endpoint !== null),
    title: readText(value.title),
    version: readText(value.version),
  };
}

export function createSchemaComparisonBaseline(
  endpoints: EndpointSummary[],
  schema: { title: string; version: string },
  capturedAt = new Date(),
): SchemaComparisonBaseline {
  const capturedAtIso = Number.isNaN(capturedAt.getTime())
    ? new Date(0).toISOString()
    : capturedAt.toISOString();

  return {
    capturedAt: capturedAtIso,
    endpoints: endpoints
      .slice(0, MAX_BASELINE_ENDPOINTS)
      .map(createComparableEndpoint),
    title: schema.title,
    version: schema.version,
  };
}

export function readSchemaComparisonBaseline() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedBaseline = window.localStorage.getItem(
      SCHEMA_COMPARISON_BASELINE_STORAGE_KEY,
    );

    if (!storedBaseline) {
      return null;
    }

    const envelope = JSON.parse(storedBaseline) as unknown;

    return isRecord(envelope) && envelope.storageVersion === 1
      ? sanitizeBaseline(envelope.baseline)
      : null;
  } catch {
    return null;
  }
}

export function saveSchemaComparisonBaseline(
  baseline: SchemaComparisonBaseline,
) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(
      SCHEMA_COMPARISON_BASELINE_STORAGE_KEY,
      JSON.stringify({ baseline, storageVersion: 1 }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSchemaComparisonBaseline() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.removeItem(SCHEMA_COMPARISON_BASELINE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
