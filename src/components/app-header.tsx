"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { AUTH_CHANGE_EVENT } from "@/lib/auth";
import { clearClientAuth, getClientAuth } from "@/lib/client-auth";
import type { TranslationKey } from "@/lib/translations";

type AppHeaderProps = {
  initialIsAuthenticated: boolean;
  initialUserName: string;
};

const navLinks = [
  { href: "/", labelKey: "nav.home", isDesktopOnly: false },
  {
    href: "/api-reference",
    labelKey: "nav.apiReference",
    isDesktopOnly: true,
  },
  { href: "/schemas", labelKey: "nav.schemas", isDesktopOnly: true },
  { href: "/about", labelKey: "nav.about", isDesktopOnly: false },
] satisfies {
  href: string;
  isDesktopOnly: boolean;
  labelKey: TranslationKey;
}[];

const languageOptions = [
  { code: "en", label: "EN", labelKey: "i18n.english" },
  { code: "ru", label: "RU", labelKey: "i18n.russian" },
] satisfies {
  code: "en" | "ru";
  label: string;
  labelKey: TranslationKey;
}[];

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
  const { language, setLanguage, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(
    initialIsAuthenticated,
  );
  const [userName, setUserName] = useState(initialUserName);
  const [isStickyCompact, setIsStickyCompact] = useState(false);

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

  useEffect(() => {
    const syncStickyState = () => {
      setIsStickyCompact(window.scrollY > 12);
    };

    syncStickyState();
    window.addEventListener("scroll", syncStickyState, { passive: true });

    return () => {
      window.removeEventListener("scroll", syncStickyState);
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
      <div
        className={`mx-auto flex max-w-[1600px] flex-nowrap items-center gap-5 rounded-[28px] border px-5 shadow-[0_18px_45px_rgba(64,45,137,0.12)] backdrop-blur transition-all duration-300 lg:px-7 ${
          isStickyCompact
            ? "border-[color:var(--color-brand-purple)] bg-white/98 py-2"
            : "border-[color:var(--color-brand-border)] bg-white/95 py-3"
        }`}
        data-testid="app-header-shell"
      >
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
            className={`object-contain transition-all duration-300 ${
              isStickyCompact
                ? "h-[72px] w-[72px] lg:h-[88px] lg:w-[88px]"
                : "h-[84px] w-[84px] lg:h-[102px] lg:w-[102px]"
            }`}
            priority
          />
          <span className="text-[28px] font-extrabold text-[color:var(--color-brand-navy)] lg:text-[40px]">
            RSSwag
          </span>
        </Link>

        <nav
          className="flex min-w-0 flex-1 items-center justify-center gap-5 overflow-x-auto text-base font-bold leading-none text-[color:var(--color-brand-navy)] md:overflow-visible lg:gap-7"
          aria-label={t("nav.mainNavigation")}
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
                {t(link.labelKey)}
                {isActive ? (
                  <span className="absolute bottom-0 left-0 h-1 w-full rounded-full bg-[color:var(--color-brand-purple)]" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden items-center rounded-2xl border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-soft)] p-1 text-sm font-extrabold text-[color:var(--color-brand-muted)] shadow-inner sm:flex">
            {languageOptions.map((option) => {
              const isActive = language === option.code;

              return (
                <button
                  aria-label={t(option.labelKey)}
                  aria-pressed={isActive}
                  className={`rounded-xl px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-[color:var(--color-brand-purple)]"
                      : ""
                  }`}
                  key={option.code}
                  type="button"
                  onClick={() => setLanguage(option.code)}
                >
                  {option.label}
                </button>
              );
            })}
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
                <span className="hidden sm:inline">{t("history.history")}</span>
              </Link>
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition hover:translate-y-[-1px]"
                type="button"
                onClick={handleSignOut}
              >
                <span className="hidden sm:inline">{t("auth.signOut")}</span>
                <SignOutIcon />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              >
                {t("auth.signIn")}
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition hover:translate-y-[-1px]"
              >
                {t("auth.signUp")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
