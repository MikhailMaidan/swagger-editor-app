"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AUTH_CHANGE_EVENT } from "@/lib/auth";
import { clearClientAuth, getClientAuth } from "@/lib/client-auth";

type AppHeaderProps = {
  initialIsAuthenticated: boolean;
  initialUserName: string;
};

const navLinks = [
  { href: "/", label: "Home", isDesktopOnly: false },
  { href: "/api-reference", label: "API Reference", isDesktopOnly: true },
  { href: "/schemas", label: "Schemas", isDesktopOnly: true },
  { href: "/about", label: "About", isDesktopOnly: false },
];

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M4.9 5.6A9 9 0 1 1 3 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M3 5v5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M10 12h10m0 0-3-3m3 3-3 3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function AppHeader({
  initialIsAuthenticated,
  initialUserName,
}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(
    initialIsAuthenticated,
  );
  const [userName, setUserName] = useState(initialUserName);

  useEffect(() => {
    const syncAuthState = () => {
      const authState = getClientAuth();

      setIsAuthenticated(authState.isAuthenticated);
      setUserName(authState.userName);
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

  function handleSignOut() {
    clearClientAuth();
    setIsAuthenticated(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 px-4 pt-5 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1600px] flex-nowrap items-center gap-5 rounded-[28px] border border-[color:var(--color-brand-border)] bg-white/95 px-5 py-3 shadow-[0_18px_45px_rgba(64,45,137,0.12)] backdrop-blur lg:px-7">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3"
          aria-label="RSSwag home page"
        >
          <Image
            src="/logo.png"
            alt=""
            width={108}
            height={108}
            className="h-[84px] w-[84px] object-contain lg:h-[102px] lg:w-[102px]"
            priority
          />
          <span className="text-[28px] font-extrabold text-[color:var(--color-brand-navy)] lg:text-[40px]">
            RSSwag
          </span>
        </Link>

        <nav
          className="flex min-w-0 flex-1 items-center justify-center gap-5 overflow-x-auto text-base font-bold leading-none text-[color:var(--color-brand-navy)] md:overflow-visible lg:gap-7"
          aria-label="Main navigation"
        >
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href));

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${link.isDesktopOnly ? "hidden xl:inline-flex" : "inline-flex"} relative h-11 shrink-0 items-center justify-center pt-1 transition-colors hover:text-[color:var(--color-brand-purple)] ${
                  isActive ? "text-[color:var(--color-brand-purple)]" : ""
                }`}
              >
                {link.label}
                {isActive ? (
                  <span className="absolute bottom-0 left-0 h-1 w-full rounded-full bg-[color:var(--color-brand-purple)]" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden items-center rounded-2xl border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-soft)] p-1 text-sm font-extrabold text-[color:var(--color-brand-muted)] shadow-inner sm:flex">
            <button
              className="rounded-xl bg-white px-3 py-2 text-[color:var(--color-brand-purple)]"
              type="button"
              aria-pressed="true"
            >
              EN
            </button>
            <button
              className="rounded-xl px-3 py-2"
              type="button"
              aria-pressed="false"
            >
              RU
            </button>
          </div>

          {isAuthenticated ? (
            <>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--color-brand-soft)]">
                  <Image
                    src="/user.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6"
                  />
                </span>
                <span className="max-w-32 truncate text-base font-extrabold text-[color:var(--color-brand-navy)]">
                  {userName}
                </span>
              </div>
              <Link
                href="/history"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-4 text-base font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              >
                <ClockIcon />
                <span className="hidden sm:inline">History</span>
              </Link>
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition hover:translate-y-[-1px]"
                type="button"
                onClick={handleSignOut}
              >
                <span className="hidden sm:inline">Sign Out</span>
                <SignOutIcon />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition hover:translate-y-[-1px]"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
