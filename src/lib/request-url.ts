export type UrlParameterLocation = "path" | "query" | "header" | "cookie";

export type UrlParameter = {
  location: UrlParameterLocation;
  name: string;
  value: string;
};

export function normalizeServerUrl(serverUrl: string) {
  return serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
}

export function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function resolvePathParameters(
  path: string,
  parameters: UrlParameter[],
) {
  return parameters
    .filter((parameter) => parameter.location === "path")
    .reduce(
      (currentPath, parameter) =>
        currentPath.replaceAll(
          `{${parameter.name}}`,
          encodeURIComponent(parameter.value),
        ),
      normalizePath(path),
    );
}

export function hasUnresolvedPathParameters(path: string) {
  return path.includes("{") || path.includes("}");
}

export function buildQueryString(parameters: UrlParameter[]) {
  return parameters
    .filter((parameter) => parameter.location === "query")
    .map(
      (parameter) =>
        `${encodeURIComponent(parameter.name)}=${encodeURIComponent(
          parameter.value,
        )}`,
    )
    .join("&");
}

export function buildRequestUrl(
  serverUrl: string,
  path: string,
  parameters: UrlParameter[],
) {
  const normalizedPath = resolvePathParameters(path, parameters);
  const query = buildQueryString(parameters);
  const separator = normalizedPath.includes("?") ? "&" : "?";

  return `${normalizeServerUrl(serverUrl)}${normalizedPath}${
    query ? `${separator}${query}` : ""
  }`;
}

export function buildCookieHeaderValue(parameters: UrlParameter[]) {
  return parameters
    .filter((parameter) => parameter.location === "cookie")
    .map(
      (parameter) => `${parameter.name}=${encodeURIComponent(parameter.value)}`,
    )
    .join("; ");
}

// Shared by the cURL preview and the real try-it-out request so they always
// agree on whether a body actually gets sent - GET/HEAD never carry one, and
// an empty textarea shouldn't be presented (or sent) as a fabricated body.
export function hasSendableRequestBody(method: string, requestBody: string) {
  const normalizedMethod = method.toUpperCase();

  return (
    Boolean(requestBody.trim()) &&
    normalizedMethod !== "GET" &&
    normalizedMethod !== "HEAD"
  );
}
