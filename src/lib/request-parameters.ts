import type { EndpointParameter } from "./openapi";

type FallbackRequestParameter = {
  location?: EndpointParameter["location"];
  name: string;
  value: string;
};

export type RequestParameterValidationCode =
  | "boolean"
  | "enum"
  | "integer"
  | "maximum"
  | "max-length"
  | "minimum"
  | "min-length"
  | "number"
  | "pattern";

export type RequestParameterValidationIssue = {
  code: RequestParameterValidationCode;
  key: string;
  params: Record<string, string>;
};

export function getRequestParameterKey(parameter: {
  location: EndpointParameter["location"];
  name: string;
}) {
  return `${parameter.location}:${parameter.name}`;
}

function getComparableParameterKey(parameter: {
  location?: EndpointParameter["location"];
  name: string;
}) {
  const location = parameter.location ?? "header";
  const name =
    location === "header"
      ? parameter.name.trim().toLowerCase()
      : parameter.name.trim();

  return `${location}:${name}`;
}

function createFallbackValueMap(
  fallbackParameters: FallbackRequestParameter[],
) {
  const fallbackValues = new Map<string, string>();

  for (const parameter of fallbackParameters) {
    const value = parameter.value.trim();
    if (value) {
      fallbackValues.set(getComparableParameterKey(parameter), value);
    }
  }

  return fallbackValues;
}

function getEffectiveParameterValue(
  parameter: EndpointParameter,
  values: Record<string, string>,
  fallbackValues: Map<string, string>,
) {
  const value = values[getRequestParameterKey(parameter)]?.trim();
  if (value) {
    return value;
  }

  return fallbackValues.get(getComparableParameterKey(parameter)) ?? "";
}

export function getMissingRequiredParameterKeys(
  parameters: EndpointParameter[],
  values: Record<string, string>,
  fallbackParameters: FallbackRequestParameter[] = [],
) {
  const fallbackValues = createFallbackValueMap(fallbackParameters);

  return parameters
    .filter(
      (parameter) =>
        parameter.required &&
        !getEffectiveParameterValue(parameter, values, fallbackValues),
    )
    .map(getRequestParameterKey);
}

function createIssue(
  parameter: EndpointParameter,
  code: RequestParameterValidationCode,
  params: Record<string, string> = {},
): RequestParameterValidationIssue {
  return {
    code,
    key: getRequestParameterKey(parameter),
    params,
  };
}

function validateParameterValue(
  parameter: EndpointParameter,
  value: string,
): RequestParameterValidationIssue | null {
  if (
    parameter.enumValues &&
    parameter.enumValues.length > 0 &&
    !parameter.enumValues.includes(value)
  ) {
    return createIssue(parameter, "enum", {
      values: parameter.enumValues.join(", "),
    });
  }

  if (parameter.type === "boolean" && value !== "true" && value !== "false") {
    return createIssue(parameter, "boolean");
  }

  if (parameter.type === "number" || parameter.type === "integer") {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return createIssue(parameter, "number");
    }

    if (parameter.type === "integer" && !Number.isInteger(numericValue)) {
      return createIssue(parameter, "integer");
    }

    if (parameter.minimum !== undefined && numericValue < parameter.minimum) {
      return createIssue(parameter, "minimum", {
        minimum: String(parameter.minimum),
      });
    }

    if (parameter.maximum !== undefined && numericValue > parameter.maximum) {
      return createIssue(parameter, "maximum", {
        maximum: String(parameter.maximum),
      });
    }
  }

  const characterCount = Array.from(value).length;
  if (
    parameter.minLength !== undefined &&
    characterCount < parameter.minLength
  ) {
    return createIssue(parameter, "min-length", {
      minimum: String(parameter.minLength),
    });
  }

  if (
    parameter.maxLength !== undefined &&
    characterCount > parameter.maxLength
  ) {
    return createIssue(parameter, "max-length", {
      maximum: String(parameter.maxLength),
    });
  }

  if (parameter.pattern) {
    try {
      if (!new RegExp(parameter.pattern).test(value)) {
        return createIssue(parameter, "pattern", {
          pattern: parameter.pattern,
        });
      }
    } catch {
      // Invalid patterns in imported schemas should not make requests unusable.
    }
  }

  return null;
}

export function getRequestParameterValidationIssues(
  parameters: EndpointParameter[],
  values: Record<string, string>,
  fallbackParameters: FallbackRequestParameter[] = [],
) {
  const fallbackValues = createFallbackValueMap(fallbackParameters);

  return parameters.flatMap((parameter) => {
    const value = getEffectiveParameterValue(parameter, values, fallbackValues);
    if (!value) {
      return [];
    }

    const issue = validateParameterValue(parameter, value);
    return issue ? [issue] : [];
  });
}
