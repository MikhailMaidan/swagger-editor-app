import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "./lib/auth";
import { proxy } from "./proxy";

function createRequest(pathname: string, token?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: token ? { cookie: `${AUTH_TOKEN_COOKIE}=${token}` } : undefined,
  });
}

describe("proxy", () => {
  it("redirects unauthenticated private route users to the main page", () => {
    const response = proxy(createRequest("/history"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("allows valid private route access", () => {
    const response = proxy(
      createRequest("/history", createDemoToken("mikhail@example.com")),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects authenticated users away from auth routes", () => {
    const response = proxy(
      createRequest("/sign-in", createDemoToken("mikhail@example.com")),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("allows public auth routes for unauthenticated users", () => {
    const response = proxy(createRequest("/sign-up"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
