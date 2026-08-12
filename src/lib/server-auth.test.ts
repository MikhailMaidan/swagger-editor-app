import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "./auth";
import {
  getAuthenticatedUserId,
  getAuthenticatedUserIdFromCookies,
  getRequestUserId,
  readRequestCookie,
} from "./server-auth";

describe("server auth", () => {
  it("reads encoded cookies and returns the authenticated user id", () => {
    const token = createDemoToken("mikhail@example.com");
    const request = new Request("http://localhost/api/history", {
      headers: {
        cookie: `theme=light; ${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
      },
    });

    expect(readRequestCookie(request, AUTH_TOKEN_COOKIE)).toBe(token);
    expect(getRequestUserId(request)).toBe("mikhail@example.com");
  });

  it("rejects missing and expired tokens", () => {
    expect(getAuthenticatedUserId(null)).toBeNull();
    expect(
      getAuthenticatedUserId(createDemoToken("old@example.com", -10)),
    ).toBeNull();
    expect(
      readRequestCookie(new Request("http://localhost"), AUTH_TOKEN_COOKIE),
    ).toBeNull();
  });

  it("resolves the authenticated user id from a next/headers-style cookie store", () => {
    const token = createDemoToken("mikhail@example.com");
    const cookieStore = {
      get: vi.fn((name: string) =>
        name === AUTH_TOKEN_COOKIE ? { value: token } : undefined,
      ),
    };

    expect(getAuthenticatedUserIdFromCookies(cookieStore)).toBe(
      "mikhail@example.com",
    );
    expect(
      getAuthenticatedUserIdFromCookies({ get: () => undefined }),
    ).toBeNull();
  });
});
