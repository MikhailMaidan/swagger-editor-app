import { AUTH_TOKEN_COOKIE, getTokenPayload, isTokenValid } from "./auth";

export function readRequestCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.split("=").slice(1).join("="));
  } catch {
    // Treat malformed encoding as an absent cookie so API requests can recover.
    return null;
  }
}

export function getAuthenticatedUserId(token?: string | null) {
  if (!isTokenValid(token)) {
    return null;
  }

  const payload = getTokenPayload(token);

  if (typeof payload?.sub === "string" && payload.sub) {
    return payload.sub;
  }

  if (typeof payload?.email === "string" && payload.email) {
    return payload.email;
  }

  return null;
}

export function getRequestUserId(request: Request) {
  return getAuthenticatedUserId(readRequestCookie(request, AUTH_TOKEN_COOKIE));
}

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export function getAuthenticatedUserIdFromCookies(cookieStore: CookieReader) {
  return getAuthenticatedUserId(cookieStore.get(AUTH_TOKEN_COOKIE)?.value);
}
