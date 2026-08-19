import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, AUTH_USER_COOKIE, createDemoToken } from "./auth";
import {
  clearClientAuth,
  getClientAuth,
  saveClientAuth,
  useClientAuthState,
} from "./client-auth";
import {
  REQUEST_HISTORY_STORAGE_KEY,
  saveRequestHistoryRecord,
} from "./request-history";
import { readSchemaDraft, saveSchemaDraft } from "./schema-draft";
import { readSavedSchema, saveSchema } from "./schema-storage";

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

  it("uses cookie authentication when local storage is unavailable", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    try {
      expect(() => saveClientAuth("cookie-user@example.com")).not.toThrow();
      expect(document.cookie).toContain(AUTH_TOKEN_COOKIE);
    } finally {
      setItemSpy.mockRestore();
    }

    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    try {
      expect(getClientAuth()).toEqual({
        isAuthenticated: true,
        userName: "Cookie User",
      });
    } finally {
      getItemSpy.mockRestore();
    }
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

  it("clears the previous user's local request history and saved schema on sign out", () => {
    saveClientAuth("first-user@example.com");
    saveRequestHistoryRecord({
      durationMs: 12,
      method: "GET",
      path: "/users",
      status: 200,
      summary: "List users",
    });
    saveSchemaDraft("openapi: 3.0.0\ninfo:\n  title: Guest Draft");
    saveSchema("openapi: 3.0.0\ninfo:\n  title: First User's API");

    clearClientAuth();

    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toBeNull();
    expect(readSchemaDraft()).toBeNull();
    expect(readSavedSchema()).toBeNull();
  });

  it("asks the server to clear its httpOnly fallback cookies on sign out", () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    try {
      saveClientAuth("mikhail@example.com");
      clearClientAuth();

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sign-out",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      fetchMock.mockRestore();
    }
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

  describe("useClientAuthState", () => {
    it("accepts a server-rendered initial state matching an already-authenticated user", () => {
      saveClientAuth("mikhail.maidan@example.com");

      const { result } = renderHook(() =>
        useClientAuthState({
          isAuthenticated: true,
          userName: "Mikhail Maidan",
        }),
      );

      expect(result.current).toEqual({
        isAuthenticated: true,
        userName: "Mikhail Maidan",
      });
    });

    it("defaults to a signed-out state when no initial state is given", () => {
      const { result } = renderHook(() => useClientAuthState());

      expect(result.current).toEqual({
        isAuthenticated: false,
        userName: "User",
      });
    });

    it("updates when auth state changes elsewhere in the app", async () => {
      const { result } = renderHook(() => useClientAuthState());

      expect(result.current.isAuthenticated).toBe(false);

      saveClientAuth("mikhail.maidan@example.com");

      await waitFor(() =>
        expect(result.current).toEqual({
          isAuthenticated: true,
          userName: "Mikhail Maidan",
        }),
      );

      clearClientAuth();

      await waitFor(() =>
        expect(result.current).toEqual({
          isAuthenticated: false,
          userName: "User",
        }),
      );
    });
  });
});
