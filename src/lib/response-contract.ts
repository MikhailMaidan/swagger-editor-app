import type { ResponseSummary, SchemaDetails } from "./openapi";
import { isJsonMediaType } from "./request-body";

const MEDIA_TYPE_PATTERN =
  /^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/;

export type ResponseContractCheckResult = "fail" | "pass" | "skipped";

export type ResponseContractCheckCode =
  | "body-empty"
  | "body-invalid-json"
  | "body-matched"
  | "body-missing-required"
  | "body-not-documented"
  | "body-not-expected"
  | "body-type-mismatch"
  | "content-type-matched"
  | "content-type-mismatch"
  | "content-type-missing"
  | "content-type-not-documented"
  | "status-matched"
  | "status-undocumented";

export type ResponseContractCheck = {
  code: ResponseContractCheckCode;
  params: Record<string, string>;
  result: ResponseContractCheckResult;
  type: "body" | "content-type" | "status";
};

export type ResponseContractReport = {
  checkedCount: number;
  checks: ResponseContractCheck[];
  failedCount: number;
  passedCount: number;
  result: ResponseContractCheckResult;
};

export type ResponseContractEndpoint = {
  method: string;
  path: string;
};

type ResponseContractInput = {
  body: string;
  headers: Record<string, string>;
  method: string;
  status: string;
};

function createCheck(
  type: ResponseContractCheck["type"],
  result: ResponseContractCheckResult,
  code: ResponseContractCheckCode,
  params: Record<string, string> = {},
): ResponseContractCheck {
  return { code, params, result, type };
}

function isHttpStatus(status: string) {
  return /^[1-5]\d{2}$/.test(status);
}

export function findDocumentedResponse(
  responses: ResponseSummary[],
  actualStatus: string,
) {
  const normalizedStatus = actualStatus.trim().toLowerCase();

  if (!isHttpStatus(normalizedStatus)) {
    return null;
  }

  const exactResponse = responses.find(
    (response) => response.status.trim().toLowerCase() === normalizedStatus,
  );

  if (exactResponse) {
    return exactResponse;
  }

  const statusClass = normalizedStatus[0];
  const rangeResponse = responses.find(
    (response) => response.status.trim().toLowerCase() === `${statusClass}xx`,
  );

  return (
    rangeResponse ||
    responses.find(
      (response) => response.status.trim().toLowerCase() === "default",
    ) ||
    null
  );
}

function normalizeMediaType(contentType: string) {
  return contentType.split(";", 1)[0].trim().toLowerCase();
}

function mediaTypeMatches(
  documentedMediaType: string,
  actualMediaType: string,
) {
  if (documentedMediaType === "*/*") {
    return Boolean(actualMediaType);
  }

  if (documentedMediaType.endsWith("/*")) {
    return actualMediaType.startsWith(`${documentedMediaType.slice(0, -1)}`);
  }

  return documentedMediaType === actualMediaType;
}

function mediaTypeSpecificity(mediaType: string) {
  if (mediaType === "*/*") {
    return 0;
  }

  return mediaType.endsWith("/*") ? 1 : 2;
}

// OpenAPI lets a response document both an exact media type and wildcards
// such as `*/*`; the most specific match must win regardless of key order.
function findBestMediaTypeMatch<T>(
  entries: [string, T][],
  actualContentType: string,
) {
  const actualMediaType = normalizeMediaType(actualContentType);
  if (!MEDIA_TYPE_PATTERN.test(actualMediaType)) {
    return undefined;
  }
  let bestMatch: [string, T] | undefined;
  let bestSpecificity = -1;

  for (const entry of entries) {
    const documentedMediaType = normalizeMediaType(entry[0]);
    if (!mediaTypeMatches(documentedMediaType, actualMediaType)) continue;
    const specificity = mediaTypeSpecificity(documentedMediaType);
    if (specificity > bestSpecificity) {
      bestMatch = entry;
      bestSpecificity = specificity;
    }
  }

  return bestMatch;
}

function readContentType(headers: Record<string, string>) {
  const contentTypeEntry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "content-type",
  );

  return (contentTypeEntry?.[1] || "").trim();
}

function createStatusCheck(responses: ResponseSummary[], actualStatus: string) {
  const matchedResponse = findDocumentedResponse(responses, actualStatus);

  return {
    check: matchedResponse
      ? createCheck("status", "pass", "status-matched", {
          actual: actualStatus,
          documented: matchedResponse.status,
        })
      : createCheck("status", "fail", "status-undocumented", {
          actual: actualStatus,
        }),
    matchedResponse,
  };
}

function createContentTypeCheck(
  response: ResponseSummary | null,
  actualContentType: string,
) {
  if (!response || response.contentTypes.length === 0) {
    return createCheck(
      "content-type",
      "skipped",
      "content-type-not-documented",
    );
  }

  const expected = response.contentTypes.join(", ");

  if (!actualContentType) {
    return createCheck("content-type", "fail", "content-type-missing", {
      expected,
    });
  }

  const matchedContentType = findBestMediaTypeMatch(
    response.contentTypes.map((contentType) => [contentType, contentType]),
    actualContentType,
  )?.[0];

  return matchedContentType
    ? createCheck("content-type", "pass", "content-type-matched", {
        actual: normalizeMediaType(actualContentType),
        documented: matchedContentType,
      })
    : createCheck("content-type", "fail", "content-type-mismatch", {
        actual: normalizeMediaType(actualContentType),
        expected,
      });
}

function selectResponseSchema(
  response: ResponseSummary,
  actualContentType: string,
) {
  if (response.schemasByContentType && actualContentType) {
    const matchedSchema = findBestMediaTypeMatch(
      Object.entries(response.schemasByContentType),
      actualContentType,
    );

    if (matchedSchema) {
      return matchedSchema[1];
    }
  }

  return response.schema;
}

function getValueType(value: unknown) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return "integer";
  }

  return typeof value;
}

function matchesSchemaType(expectedType: string, actualType: string) {
  return (
    expectedType === actualType ||
    (expectedType === "number" && actualType === "integer")
  );
}

function hasDocumentedBodyShape(schema: SchemaDetails | null) {
  return Boolean(
    schema &&
    (schema.type !== "unknown" ||
      schema.properties.length > 0 ||
      (schema.requiredProperties?.length ?? 0) > 0),
  );
}

function createBodyCheck(
  response: ResponseSummary | null,
  input: ResponseContractInput,
  actualContentType: string,
) {
  if (!response) {
    return createCheck("body", "skipped", "body-not-documented");
  }

  const status = input.status.trim();
  if (
    input.method.toUpperCase() === "HEAD" ||
    /^1\d{2}$/.test(status) ||
    status === "204" ||
    status === "205" ||
    status === "304"
  ) {
    return createCheck("body", "skipped", "body-not-expected");
  }

  const schema = selectResponseSchema(response, actualContentType);

  if (!hasDocumentedBodyShape(schema)) {
    return createCheck("body", "skipped", "body-not-documented");
  }

  const expectedType =
    schema?.type === "unknown" &&
    (schema.properties.length > 0 ||
      (schema.requiredProperties?.length ?? 0) > 0)
      ? "object"
      : schema?.type || "unknown";

  const parseAsJson =
    isJsonMediaType(actualContentType) || expectedType !== "string";

  if (input.body.length === 0 || (parseAsJson && !input.body.trim())) {
    return createCheck("body", "fail", "body-empty", {
      expected: expectedType,
    });
  }

  let value: unknown = input.body;

  if (parseAsJson) {
    try {
      value = JSON.parse(input.body.replace(/^\uFEFF/, ""));
    } catch {
      return createCheck("body", "fail", "body-invalid-json", {
        expected: expectedType,
      });
    }
  }

  const actualType = getValueType(value);

  if (!matchesSchemaType(expectedType, actualType)) {
    return createCheck("body", "fail", "body-type-mismatch", {
      actual: actualType,
      expected: expectedType,
    });
  }

  const requiredProperties = schema?.requiredProperties ?? [];

  if (expectedType === "object" && requiredProperties.length > 0) {
    const record = value as Record<string, unknown>;
    const missingProperties = requiredProperties.filter(
      (property) => !Object.prototype.hasOwnProperty.call(record, property),
    );

    if (missingProperties.length > 0) {
      return createCheck("body", "fail", "body-missing-required", {
        properties: missingProperties.join(", "),
      });
    }
  }

  return createCheck("body", "pass", "body-matched", {
    type: expectedType,
  });
}

export function createResponseContractReport(
  responses: ResponseSummary[],
  input: ResponseContractInput,
): ResponseContractReport {
  const { check: statusCheck, matchedResponse } = createStatusCheck(
    responses,
    input.status,
  );
  const actualContentType = readContentType(input.headers);
  const checks = [
    statusCheck,
    createContentTypeCheck(matchedResponse, actualContentType),
    createBodyCheck(matchedResponse, input, actualContentType),
  ];
  const passedCount = checks.filter((check) => check.result === "pass").length;
  const failedCount = checks.filter((check) => check.result === "fail").length;
  const checkedCount = passedCount + failedCount;

  return {
    checkedCount,
    checks,
    failedCount,
    passedCount,
    result: failedCount > 0 ? "fail" : checkedCount > 0 ? "pass" : "skipped",
  };
}

export function serializeResponseContractReport(
  report: ResponseContractReport,
  endpoint: ResponseContractEndpoint,
) {
  return `${JSON.stringify(
    {
      endpoint: {
        method: endpoint.method.trim().toUpperCase(),
        path: endpoint.path,
      },
      report,
      version: 1,
    },
    null,
    2,
  )}\n`;
}
