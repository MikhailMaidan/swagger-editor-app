import type { SecuritySchemeSummary } from "./openapi";
import type { RequestAuthValues } from "./request-auth";

export const oauthAcceptsToken = (scheme: SecuritySchemeSummary) =>
  scheme.type === "oauth2" ||
  scheme.type === "openIdConnect" ||
  (scheme.type === "http" && scheme.scheme.toLowerCase() === "bearer");
export function applyOAuthRequestToken(
  values: RequestAuthValues,
  schemes: SecuritySchemeSummary[],
  name: string,
  token: string,
): RequestAuthValues | null {
  if (
    !schemes.some((s) => s.name === name && oauthAcceptsToken(s)) ||
    !/^[A-Za-z0-9._~+\/-]+=*$/.test(token) ||
    token.length > 16384
  )
    return null;
  return {
    ...values,
    [name]: { enabled: true, token, username: "", password: "" },
  };
}
export function removeOAuthRequestToken(
  values: RequestAuthValues,
  name: string,
  token: string,
): RequestAuthValues {
  const current = values[name];
  if (
    !current ||
    current.token !== token ||
    !current.enabled ||
    current.username !== "" ||
    current.password !== ""
  )
    return values;
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => key !== name),
  );
}
