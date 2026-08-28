import type { EndpointParameter } from "./openapi";

export function getRequestParameterKey(parameter: EndpointParameter) {
  return `${parameter.location}:${parameter.name}`;
}

export function getMissingRequiredParameterKeys(
  parameters: EndpointParameter[],
  values: Record<string, string>,
  fallbackHeaders: Array<{ name: string; value: string }> = [],
) {
  const fallbackHeaderNames = new Set(
    fallbackHeaders
      .filter((header) => header.value.trim())
      .map((header) => header.name.trim().toLowerCase()),
  );

  return parameters
    .filter(
      (parameter) =>
        parameter.required &&
        !(values[getRequestParameterKey(parameter)] || "").trim() &&
        !(
          parameter.location === "header" &&
          fallbackHeaderNames.has(parameter.name.toLowerCase())
        ),
    )
    .map(getRequestParameterKey);
}
