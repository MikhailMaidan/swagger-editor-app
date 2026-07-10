import {
  AUTH_TOKEN_COOKIE,
  getTokenPayload,
  isTokenValid,
} from "./auth";

export function readRequestCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

export function getAuthenticatedUserId(token?: string | null) {
  if (!isTokenValid(token)) {
    return null;
  }

  const payload = getTokenPayload(token);

  return payload?.sub || payload?.email || null;
}

export function getRequestUserId(request: Request) {
  return getAuthenticatedUserId(
    readRequestCookie(request, AUTH_TOKEN_COOKIE),
  );
}
