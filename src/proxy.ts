import { NextRequest, NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE, AUTH_USER_COOKIE, isTokenValid } from "./lib/auth";

const PRIVATE_ROUTES = ["/history"];
const AUTH_ROUTES = ["/sign-in", "/sign-up"];

function isRouteMatch(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  const hasValidToken = isTokenValid(token);
  const { pathname } = request.nextUrl;

  if (isRouteMatch(pathname, PRIVATE_ROUTES) && !hasValidToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/";

    const response = NextResponse.redirect(url);
    response.cookies.delete(AUTH_TOKEN_COOKIE);
    response.cookies.delete(AUTH_USER_COOKIE);

    return response;
  }

  if (isRouteMatch(pathname, AUTH_ROUTES) && hasValidToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/";

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/history/:path*", "/sign-in", "/sign-up"],
};
