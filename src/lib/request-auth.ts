import type { CurlParameter, SecuritySchemeSummary } from "./openapi";
import {
  getEnabledRequestEnvironmentHeaders,
  type RequestEnvironmentHeader,
} from "./request-environments";

export type RequestAuthCredential = {
  enabled: boolean;
  password: string;
  token: string;
  username: string;
};

export type RequestAuthValues = Record<string, RequestAuthCredential>;

export const EMPTY_REQUEST_AUTH_CREDENTIAL: RequestAuthCredential = {
  enabled: false,
  password: "",
  token: "",
  username: "",
};

export const REDACTED_AUTH_VALUE = "[configured]";

export function isSupportedSecurityScheme(scheme: SecuritySchemeSummary) {
  return (
    (scheme.type === "apiKey" &&
      Boolean(scheme.location && scheme.parameterName)) ||
    (scheme.type === "http" &&
      (scheme.scheme === "basic" || scheme.scheme === "bearer")) ||
    scheme.type === "oauth2" ||
    scheme.type === "openIdConnect"
  );
}

export function hasUsableRequestAuthCredential(
  scheme: SecuritySchemeSummary,
  credential: RequestAuthCredential | undefined,
) {
  if (!credential?.enabled || !isSupportedSecurityScheme(scheme)) {
    return false;
  }

  if (scheme.type === "http" && scheme.scheme === "basic") {
    return Boolean(credential.username.trim());
  }

  return Boolean(credential.token.trim());
}

function encodeBasicCredentials(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binaryValue = "";

  bytes.forEach((byte) => {
    binaryValue += String.fromCharCode(byte);
  });

  return globalThis.btoa(binaryValue);
}

function createSchemeParameter(
  scheme: SecuritySchemeSummary,
  credential: RequestAuthCredential,
): CurlParameter | null {
  if (!hasUsableRequestAuthCredential(scheme, credential)) {
    return null;
  }

  if (scheme.type === "apiKey" && scheme.location) {
    return {
      location: scheme.location,
      name: scheme.parameterName,
      value: credential.token.trim(),
    };
  }

  if (scheme.type === "http" && scheme.scheme === "basic") {
    return {
      location: "header",
      name: "Authorization",
      value: `Basic ${encodeBasicCredentials(
        credential.username.trim(),
        credential.password,
      )}`,
    };
  }

  return {
    location: "header",
    name: "Authorization",
    value: `Bearer ${credential.token.trim()}`,
  };
}

export function createAuthRequestParameters(
  schemes: SecuritySchemeSummary[],
  credentials: RequestAuthValues,
  requirementNames: string[],
  requirementGroups: string[][] = [],
) {
  const schemesByName = new Map(schemes.map((scheme) => [scheme.name, scheme]));
  const configuredGroups = requirementGroups.filter(
    (group) => group.length > 0,
  );
  const satisfiedGroup = configuredGroups.find((group) =>
    group.every((name) => {
      const scheme = schemesByName.get(name);
      return (
        scheme && hasUsableRequestAuthCredential(scheme, credentials[name])
      );
    }),
  );
  const selectedNames = satisfiedGroup
    ? satisfiedGroup
    : requirementNames.filter((name) => {
        const scheme = schemesByName.get(name);
        return (
          scheme && hasUsableRequestAuthCredential(scheme, credentials[name])
        );
      });

  return Array.from(new Set(selectedNames)).flatMap((name) => {
    const scheme = schemesByName.get(name);
    const credential = credentials[name];
    const parameter =
      scheme && credential ? createSchemeParameter(scheme, credential) : null;

    return parameter ? [parameter] : [];
  });
}

function getParameterKey(parameter: Pick<CurlParameter, "location" | "name">) {
  const name =
    parameter.location === "header"
      ? parameter.name.toLowerCase()
      : parameter.name;

  return `${parameter.location}:${name}`;
}

export function mergeRequestAuthentication(
  endpointParameters: CurlParameter[],
  environmentHeaders: RequestEnvironmentHeader[],
  authParameters: CurlParameter[],
) {
  const explicitKeys = new Set(endpointParameters.map(getParameterKey));
  const defaultsByKey = new Map<string, CurlParameter>();
  const environmentParameters = getEnabledRequestEnvironmentHeaders({
    headers: environmentHeaders,
    id: "active",
    name: "Active",
    serverUrl: "",
  }).map<CurlParameter>((header) => ({
    location: "header",
    name: header.name,
    value: header.value,
  }));

  [...environmentParameters, ...authParameters].forEach((parameter) => {
    defaultsByKey.set(getParameterKey(parameter), parameter);
  });

  const inheritedParameters = Array.from(defaultsByKey.entries())
    .filter(([key]) => !explicitKeys.has(key))
    .map(([, parameter]) => parameter);

  return [...inheritedParameters, ...endpointParameters];
}

export function isAuthRequestParameter(
  parameter: CurlParameter,
  authParameters: CurlParameter[],
) {
  const parameterKey = getParameterKey(parameter);

  return authParameters.some(
    (authParameter) => getParameterKey(authParameter) === parameterKey,
  );
}

export function redactAuthQueryFromUrl(
  requestUrl: string,
  authParameters: CurlParameter[],
) {
  const queryParameterNames = new Set(
    authParameters
      .filter((parameter) => parameter.location === "query")
      .map((parameter) => parameter.name),
  );

  if (queryParameterNames.size === 0) {
    return requestUrl;
  }

  try {
    const url = new URL(requestUrl);

    queryParameterNames.forEach((name) => {
      if (url.searchParams.has(name)) {
        url.searchParams.set(name, REDACTED_AUTH_VALUE);
      }
    });

    return url.toString();
  } catch {
    return requestUrl;
  }
}
