"use client";

import { useEffect, useState } from "react";
import {
  AUTH_CHANGE_EVENT,
  AUTH_TOKEN_COOKIE,
  AUTH_USER_COOKIE,
  createDemoToken,
  getUserNameFromToken,
  isTokenValid,
} from "./auth";
import { clearRequestHistory } from "./request-history";
import { clearSchemaDraft } from "./schema-draft";
import { clearSavedSchema } from "./schema-storage";

export type ClientAuthState = {
  isAuthenticated: boolean;
  userName: string;
};

const DEFAULT_CLIENT_AUTH_STATE: ClientAuthState = {
  isAuthenticated: false,
  userName: "User",
};

const COOKIE_LIFETIME = 60 * 60 * 24 * 7;
const TOKEN_STORAGE_KEYS = [AUTH_TOKEN_COOKIE, "authToken", "token"];

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

function writeCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function readStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    for (const key of TOKEN_STORAGE_KEYS) {
      const token = window.localStorage.getItem(key);

      if (token) {
        return token;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function clearClientAuth() {
  if (typeof window === "undefined") {
    return;
  }

  deleteCookie(AUTH_TOKEN_COOKIE);
  deleteCookie(AUTH_USER_COOKIE);

  TOKEN_STORAGE_KEYS.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Cookie cleanup still signs the current page out when storage is blocked.
    }
  });

  // Otherwise the next person to sign in on this browser would inherit the
  // previous user's request history and saved schema.
  clearRequestHistory();
  clearSchemaDraft();
  clearSavedSchema();

  void fetch("/api/sign-out", { method: "POST" }).catch(() => {
    // Client-readable cookies are already cleared above; the httpOnly
    // server-fallback cookies will simply expire on their own if this fails.
  });

  notifyAuthChange();
}

export function getClientAuth(): ClientAuthState {
  const cookieToken = readCookie(AUTH_TOKEN_COOKIE);
  const storedToken = readStoredToken();
  const token = cookieToken || storedToken;

  if (!isTokenValid(token)) {
    if (token) {
      clearClientAuth();
    }

    return {
      isAuthenticated: false,
      userName: "User",
    };
  }

  if (!cookieToken && token) {
    writeCookie(AUTH_TOKEN_COOKIE, token, COOKIE_LIFETIME);
  }

  const cookieUserName = readCookie(AUTH_USER_COOKIE);
  const userName = cookieUserName || getUserNameFromToken(token);

  return {
    isAuthenticated: true,
    userName,
  };
}

export function saveClientAuth(email: string) {
  const token = createDemoToken(email);
  const userName = getUserNameFromToken(token);

  writeCookie(AUTH_TOKEN_COOKIE, token, COOKIE_LIFETIME);
  writeCookie(AUTH_USER_COOKIE, userName, COOKIE_LIFETIME);

  try {
    window.localStorage.setItem(AUTH_TOKEN_COOKIE, token);
  } catch {
    // The cookie remains the primary session source when storage is blocked.
  }

  notifyAuthChange();

  return {
    token,
    userName,
  };
}

export function useClientAuthState(
  initialState: ClientAuthState = DEFAULT_CLIENT_AUTH_STATE,
) {
  const [authState, setAuthState] = useState<ClientAuthState>(initialState);

  useEffect(() => {
    const syncAuthState = () => {
      setAuthState(getClientAuth());
    };

    syncAuthState();

    window.addEventListener(AUTH_CHANGE_EVENT, syncAuthState);
    window.addEventListener("storage", syncAuthState);
    window.addEventListener("focus", syncAuthState);

    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncAuthState);
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener("focus", syncAuthState);
    };
  }, []);

  return authState;
}
