"use client";

import {
  AUTH_CHANGE_EVENT,
  AUTH_TOKEN_COOKIE,
  AUTH_USER_COOKIE,
  createDemoToken,
  getUserNameFromToken,
  isTokenValid,
} from "./auth";

type ClientAuthState = {
  isAuthenticated: boolean;
  userName: string;
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

  for (const key of TOKEN_STORAGE_KEYS) {
    const token = window.localStorage.getItem(key);

    if (token) {
      return token;
    }
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
    window.localStorage.removeItem(key);
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
  window.localStorage.setItem(AUTH_TOKEN_COOKIE, token);
  notifyAuthChange();

  return {
    token,
    userName,
  };
}
