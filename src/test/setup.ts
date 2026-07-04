import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, vi } from "vitest";

type CookieMock = {
  get: ReturnType<typeof vi.fn>;
};

type NavigationMock = {
  pathname: string;
  push: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
};

const nextMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  navigation: {
    pathname: "/",
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  },
}));

declare global {
  var __COOKIE_MOCK__: ReturnType<typeof vi.fn>;
  var __NEXT_NAVIGATION_MOCK__: NavigationMock;
}

globalThis.__COOKIE_MOCK__ = nextMocks.cookies;
globalThis.__NEXT_NAVIGATION_MOCK__ = nextMocks.navigation;

vi.mock("next/headers", () => ({
  cookies: nextMocks.cookies,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nextMocks.navigation.pathname,
  useRouter: () => ({
    push: nextMocks.navigation.push,
    refresh: nextMocks.navigation.refresh,
    replace: nextMocks.navigation.replace,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname?: string };
    children: React.ReactNode;
  }) =>
    React.createElement(
      "a",
      {
        href: typeof href === "string" ? href : href.pathname || "#",
        ...props,
      },
      children,
    ),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    priority,
    ...props
  }: {
    src: string | { src?: string };
    alt?: string;
    priority?: boolean;
  }) => {
    void priority;

    return React.createElement("img", {
      alt: alt || "",
      src: typeof src === "string" ? src : src.src || "",
      ...props,
    });
  },
}));

beforeEach(() => {
  const emptyCookieStore: CookieMock = {
    get: vi.fn(),
  };

  nextMocks.cookies.mockResolvedValue(emptyCookieStore);
  nextMocks.navigation.pathname = "/";
  nextMocks.navigation.push.mockClear();
  nextMocks.navigation.refresh.mockClear();
  nextMocks.navigation.replace.mockClear();
  window.localStorage.clear();

  document.cookie.split(";").forEach((cookie) => {
    const cookieName = cookie.split("=")[0].trim();

    if (cookieName) {
      document.cookie = `${cookieName}=; path=/; max-age=0`;
    }
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
