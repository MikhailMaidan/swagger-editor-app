import type { ResponseSummary } from "./openapi";
import { isJsonMediaType } from "./request-body";

export type SchemaMockResponse = {
  body: string;
  generated: boolean;
  headers: Record<string, string>;
  status: string;
};

function createGeneratedPropertyValue(type: string): unknown {
  switch (type.toLowerCase()) {
    case "array":
      return [];
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "object":
      return {};
    case "string":
      return "string";
    default:
      return null;
  }
}

function createGeneratedResponseBody(
  response: ResponseSummary | undefined,
  contentType: string,
) {
  const schema = response?.schema;

  if (!schema) {
    return null;
  }

  const schemaType = schema.type.toLowerCase();

  if (!isJsonMediaType(contentType)) {
    return schemaType === "string" ? "string" : null;
  }

  if (schemaType === "object" || schema.properties.length > 0) {
    return JSON.stringify(
      Object.fromEntries(
        schema.properties.map((property) => [
          property,
          createGeneratedPropertyValue(
            schema.propertyTypes?.[property] ?? "unknown",
          ),
        ]),
      ),
      null,
      2,
    );
  }

  switch (schemaType) {
    case "array":
      return "[]";
    case "boolean":
      return "false";
    case "integer":
    case "number":
      return "0";
    case "string":
      return '"string"';
    default:
      return null;
  }
}

function getRepresentativeStatus(status: string) {
  const normalizedStatus = status.trim();
  const statusRange = normalizedStatus.match(/^([1-5])xx$/i);

  if (statusRange) {
    return `${statusRange[1]}00`;
  }

  if (!normalizedStatus || normalizedStatus.toLowerCase() === "default") {
    return "200";
  }

  return normalizedStatus;
}

function createMockResponseHeaders(
  response: ResponseSummary | undefined,
  contentType: string,
) {
  const headers = (response?.headers ?? []).reduce<Record<string, string>>(
    (result, header) => {
      const existingName = Object.keys(result).find(
        (name) => name.toLowerCase() === header.name.toLowerCase(),
      );

      if (existingName) {
        delete result[existingName];
      }

      result[header.name] = header.value;
      return result;
    },
    Object.create(null) as Record<string, string>,
  );

  if (contentType) {
    Object.keys(headers).forEach((name) => {
      if (name.toLowerCase() === "content-type") {
        delete headers[name];
      }
    });
    headers["content-type"] = contentType;
  }

  return { ...headers };
}

export function createSchemaMockResponse(
  response: ResponseSummary | undefined,
  fallbackBody: string,
): SchemaMockResponse {
  const contentType = response?.contentTypes[0] ?? "";
  const schema = response?.schema;
  const hasExplicitExample = Boolean(
    schema?.hasExplicitExample || schema?.example,
  );
  const generatedBody = hasExplicitExample
    ? null
    : createGeneratedResponseBody(response, contentType);

  return {
    body: hasExplicitExample
      ? (schema?.example ?? "")
      : (generatedBody ?? fallbackBody),
    generated: generatedBody !== null,
    headers: createMockResponseHeaders(response, contentType),
    status: getRepresentativeStatus(response?.status ?? ""),
  };
}

export function waitForMockResponseDelay(
  delayMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  if (delayMs <= 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const handleAbort = () => finish(false);
    const timeoutId = window.setTimeout(() => finish(true), delayMs);

    function finish(completed: boolean) {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
      resolve(completed);
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}
