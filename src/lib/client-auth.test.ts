import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_COOKIE, AUTH_USER_COOKIE, createDemoToken } from "./auth";
import { clearClientAuth, getClientAuth, saveClientAuth } from "./client-auth";

describe("client auth helpers", () => {
  it("saves and reads authenticated client state", () => {
    const authResult = saveClientAuth("mikhail.maidan@example.com");
    const authState = getClientAuth();

    expect(authResult.userName).toBe("Mikhail Maidan");
    expect(window.localStorage.getItem(AUTH_TOKEN_COOKIE)).toBe(
      authResult.token,
    );
    expect(document.cookie).toContain(AUTH_TOKEN_COOKIE);
    expect(document.cookie).toContain(AUTH_USER_COOKIE);
    expect(authState).toEqual({
      isAuthenticated: true,
      userName: "Mikhail Maidan",
    });
  });

  it("clears authentication state", () => {
    saveClientAuth("mikhail@example.com");

    clearClientAuth();

    expect(getClientAuth()).toEqual({
      isAuthenticated: false,
      userName: "User",
    });
    expect(window.localStorage.getItem(AUTH_TOKEN_COOKIE)).toBeNull();
  });

  it("removes an expired token when auth state is read", () => {
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("expired@example.com", -10),
    );

    expect(getClientAuth()).toEqual({
      isAuthenticated: false,
      userName: "User",
    });
    expect(window.localStorage.getItem(AUTH_TOKEN_COOKIE)).toBeNull();
  });
});
