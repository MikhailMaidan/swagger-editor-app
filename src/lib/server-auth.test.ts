import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "./auth";
import {
  getAuthenticatedUserId,
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
});
