export function isJsonMediaType(contentType: string) {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();

  return mediaType === "application/json" || mediaType.endsWith("+json");
}

export type RequestBodyContractCode =
  "body-matched" | "body-missing-required" | "body-type-mismatch";

export type RequestBodyContractReport = {
  code: RequestBodyContractCode;
  params: Record<string, string>;
  result: "fail" | "pass";
};

type RequestBodySchema = {
  properties: string[];
  requiredProperties?: string[];
  type: string;
};

function getJsonValueType(value: unknown) {
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

export function createRequestBodyContractReport(
  contentType: string,
  body: string,
  schema: RequestBodySchema | null,
): RequestBodyContractReport | null {
  if (!body.trim() || !isJsonMediaType(contentType) || !schema) {
    return null;
  }

  const requiredProperties = schema.requiredProperties ?? [];
  const hasDocumentedShape =
    schema.type !== "unknown" ||
    schema.properties.length > 0 ||
    requiredProperties.length > 0;

  if (!hasDocumentedShape) {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }

  const expectedType =
    schema.type === "unknown" &&
    (schema.properties.length > 0 || requiredProperties.length > 0)
      ? "object"
      : schema.type;
  const actualType = getJsonValueType(value);

  if (!matchesSchemaType(expectedType, actualType)) {
    return {
      code: "body-type-mismatch",
      params: { actual: actualType, expected: expectedType },
      result: "fail",
    };
  }

  if (expectedType === "object" && requiredProperties.length > 0) {
    const record = value as Record<string, unknown>;
    const missingProperties = requiredProperties.filter(
      (property) => !(property in record),
    );

    if (missingProperties.length > 0) {
      return {
        code: "body-missing-required",
        params: { properties: missingProperties.join(", ") },
        result: "fail",
      };
    }
  }

  return {
    code: "body-matched",
    params: { type: expectedType },
    result: "pass",
  };
}

export function hasInvalidJsonBody(contentType: string, body: string) {
  if (!body.trim() || !isJsonMediaType(contentType)) {
    return false;
  }

  try {
    JSON.parse(body);
    return false;
  } catch {
    return true;
  }
}

export function formatJsonBody(contentType: string, body: string) {
  if (!body.trim() || !isJsonMediaType(contentType)) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return null;
  }
}
