import type { EndpointParameter } from "./openapi";

export function getRequestParameterKey(parameter: EndpointParameter) {
  return `${parameter.location}:${parameter.name}`;
}

export function getMissingRequiredParameterKeys(
  parameters: EndpointParameter[],
  values: Record<string, string>,
  fallbackParameters: Array<{
    location?: EndpointParameter["location"];
    name: string;
    value: string;
  }> = [],
) {
  const fallbackParameterKeys = new Set(
    fallbackParameters
      .filter((parameter) => parameter.value.trim())
      .map((parameter) => {
        const location = parameter.location ?? "header";
        const name =
          location === "header"
            ? parameter.name.trim().toLowerCase()
            : parameter.name.trim();

        return `${location}:${name}`;
      }),
  );

  return parameters
    .filter(
      (parameter) =>
        parameter.required &&
        !(values[getRequestParameterKey(parameter)] || "").trim() &&
        !fallbackParameterKeys.has(
          `${parameter.location}:${
            parameter.location === "header"
              ? parameter.name.toLowerCase()
              : parameter.name
          }`,
        ),
    )
    .map(getRequestParameterKey);
}
