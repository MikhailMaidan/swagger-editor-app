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

export function buildCookieHeaderValue(parameters: UrlParameter[]) {
  return parameters
    .filter((parameter) => parameter.location === "cookie")
    .map(
      (parameter) => `${parameter.name}=${encodeURIComponent(parameter.value)}`,
    )
    .join("; ");
}
