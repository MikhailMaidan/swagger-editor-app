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

  it.each([
    {
      sub: { id: "wrong" },
      email: "mikhail@example.com",
      expected: "mikhail@example.com",
    },
    {
      sub: ["wrong"],
      email: "mikhail@example.com",
      expected: "mikhail@example.com",
    },
    { sub: 42, email: "mikhail@example.com", expected: "mikhail@example.com" },
    {
      sub: true,
      email: "mikhail@example.com",
      expected: "mikhail@example.com",
    },
    { sub: "", email: { address: "wrong" }, expected: null },
    { sub: "", email: ["wrong"], expected: null },
    { sub: "", email: 42, expected: null },
    { sub: "", email: true, expected: null },
    { sub: "user-42", email: "mikhail@example.com", expected: "user-42" },
  ])(
    "resolves a usable user id from token claims: %j",
    ({ sub, email, expected }) => {
      const baseToken = createDemoToken("mikhail@example.com");
      const [header, body, signature] = baseToken.split(".");
      const payload = JSON.parse(
        Buffer.from(body, "base64url").toString("utf8"),
      );
      const encodedPayload = Buffer.from(
        JSON.stringify({ ...payload, sub, email }),
      ).toString("base64url");
      const token = `${header}.${encodedPayload}.${signature}`;

      expect(getAuthenticatedUserId(token)).toBe(expected);
      expect(
        getRequestUserId(
          new Request("http://localhost/api/history", {
            headers: { cookie: `${AUTH_TOKEN_COOKIE}=${token}` },
          }),
        ),
      ).toBe(expected);
      expect(
        getAuthenticatedUserIdFromCookies({
          get: () => ({ value: token }),
        }),
      ).toBe(expected);
    },
  );

  it.each(["%", "%E0%A4%A", "%C3%28"])(
    "rejects malformed cookie encoding %s without throwing",
    (value) => {
      const request = new Request("http://localhost/api/history", {
        headers: { cookie: `${AUTH_TOKEN_COOKIE}=${value}` },
      });

      expect(readRequestCookie(request, AUTH_TOKEN_COOKIE)).toBeNull();
      expect(getRequestUserId(request)).toBeNull();
    },
  );

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
