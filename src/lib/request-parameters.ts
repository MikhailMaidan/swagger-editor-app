import type { EndpointParameter } from "./openapi";

export function getRequestParameterKey(parameter: EndpointParameter) {
  return `${parameter.location}:${parameter.name}`;
}

export function getMissingRequiredParameterKeys(
  parameters: EndpointParameter[],
  values: Record<string, string>,
) {
  return parameters
    .filter(
      (parameter) =>
        parameter.required &&
        !(values[getRequestParameterKey(parameter)] || "").trim(),
    )
    .map(getRequestParameterKey);
}
