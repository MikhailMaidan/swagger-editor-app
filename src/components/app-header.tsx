"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import { clearClientAuth, useClientAuthState } from "@/lib/client-auth";
import type { TranslationKey } from "@/lib/translations";

type AppHeaderProps = {
  initialIsAuthenticated: boolean;
  initialUserName: string;
};

export const navLinks = [
  {
    href: "/",
    labelKey: "nav.home",
    isDesktopOnly: false,
    requiresAuth: false,
  },
  {
    href: "/#api-viewer",
    labelKey: "nav.apiReference",
    isDesktopOnly: true,
    requiresAuth: false,
  },
  {
    href: "/schemas",
    labelKey: "nav.schemas",
    isDesktopOnly: true,
    requiresAuth: true,
  },
  {
    href: "/about",
    labelKey: "nav.about",
    isDesktopOnly: false,
    requiresAuth: false,
  },
] satisfies {
  href: string;
  isDesktopOnly: boolean;
  labelKey: TranslationKey;
  requiresAuth: boolean;
}[];

const languageOptions = [
  { code: "en", labelKey: "i18n.english", shortLabelKey: "i18n.enShort" },
  { code: "ru", labelKey: "i18n.russian", shortLabelKey: "i18n.ruShort" },
] satisfies {
  code: "en" | "ru";
  labelKey: TranslationKey;
  shortLabelKey: TranslationKey;
}[];

const COMPACT_SCROLL_POSITION = 28;
const EXPANDED_SCROLL_POSITION = 10;

function ClockIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
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
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
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
  const { isAuthenticated, userName } = useClientAuthState({
    isAuthenticated: initialIsAuthenticated,
    userName: initialUserName,
  });
  const [isStickyCompact, setIsStickyCompact] = useState(false);
  const [activeHash, setActiveHash] = useState("");

  useEffect(() => {
    const syncHash = () => {
      setActiveHash(window.location.hash);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  useEffect(() => {
    let pendingFrame: number | null = null;

    const syncStickyState = () => {
      pendingFrame = null;
      setIsStickyCompact((currentState) => {
        const scrollPosition = window.scrollY;

        if (currentState) {
          return scrollPosition > EXPANDED_SCROLL_POSITION;
        }

        return scrollPosition > COMPACT_SCROLL_POSITION;
      });
    };

    // Scroll fires far more often than the display can repaint, so the
    // handler is coalesced to one check per animation frame instead of
    // running (and re-rendering) on every raw scroll event.
    const handleScroll = () => {
      if (pendingFrame !== null) {
        return;
      }

      pendingFrame = window.requestAnimationFrame(syncStickyState);
    };

    syncStickyState();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);

      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame);
      }
    };
  }, []);

  function handleSignOut() {
    clearClientAuth();
    router.push("/");
    router.refresh();
  }

  function handleViewerLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") {
      return;
    }

    const viewer = document.getElementById("api-viewer");

    if (!viewer) {
      return;
    }

    event.preventDefault();
    window.history.pushState(null, "", "/#api-viewer");
    setActiveHash("#api-viewer");
    viewer.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleHomeLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/" || !activeHash) {
      return;
    }

    event.preventDefault();
    window.history.pushState(null, "", "/");
    setActiveHash("");
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  return (
    <header className="sticky top-0 z-50 min-h-[128px] px-4 pt-5 md:px-8 lg:min-h-[146px] lg:px-10">
      <div
        className={`mx-auto flex max-w-[1600px] transform-gpu flex-nowrap items-center gap-5 rounded-[28px] border px-5 backdrop-blur-md transition-[transform,padding,background-color,border-color,box-shadow] duration-[var(--duration-header)] ease-[var(--ease-header)] motion-reduce:transform-none motion-reduce:transition-none lg:px-7 ${
          isStickyCompact
            ? "-translate-y-2 border-[color:var(--color-brand-purple)] bg-white/98 py-2 shadow-[0_14px_34px_rgba(64,45,137,0.16)]"
            : "translate-y-0 border-[color:var(--color-brand-border)] bg-white/95 py-3 shadow-[0_18px_45px_rgba(64,45,137,0.12)]"
        }`}
        data-sticky-state={isStickyCompact ? "compact" : "expanded"}
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
            className={`object-contain transition-[width,height,transform] duration-[var(--duration-header)] ease-[var(--ease-header)] motion-reduce:transition-none ${
              isStickyCompact
                ? "h-[72px] w-[72px] scale-[0.98] lg:h-[88px] lg:w-[88px]"
                : "h-[84px] w-[84px] scale-100 lg:h-[102px] lg:w-[102px]"
            }`}
            priority
          />
          <span className="text-[28px] font-extrabold tracking-tight text-[color:var(--color-brand-navy)] lg:text-[40px]">
            RSSwag
          </span>
        </Link>

        <nav
          className="flex min-w-0 flex-1 items-center justify-center gap-5 overflow-x-auto text-[19px] font-bold leading-none text-[color:var(--color-brand-navy)] lg:gap-7"
          aria-label={t("nav.mainNavigation")}
        >
          {navLinks
            .filter((link) => !link.requiresAuth || isAuthenticated)
            .map((link) => {
              const isViewerLink = link.href === "/#api-viewer";
              const isActive = isViewerLink
                ? pathname === "/" && activeHash === "#api-viewer"
                : pathname === link.href ||
                  (link.href !== "/" &&
                    !link.href.includes("#") &&
                    pathname.startsWith(link.href));
              const isHomeLink = link.href === "/";
              const shouldShowActive = isActive && !(isHomeLink && activeHash);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={
                    isViewerLink
                      ? handleViewerLinkClick
                      : link.href === "/"
                        ? handleHomeLinkClick
                        : undefined
                  }
                  className={`${link.isDesktopOnly ? "hidden xl:inline-flex" : "inline-flex"} relative h-[53px] shrink-0 items-center justify-center pt-1 transition-colors duration-[var(--duration-header-fast)] ease-[var(--ease-header)] hover:text-[color:var(--color-brand-purple)] motion-reduce:transition-none ${
                    shouldShowActive
                      ? "text-[color:var(--color-brand-purple)]"
                      : ""
                  }`}
                >
                  {t(link.labelKey)}
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-0 left-0 h-1 w-full origin-center scale-x-0 rounded-full bg-[color:var(--color-brand-purple)] opacity-0 transition-[transform,opacity] duration-[var(--duration-header)] ease-[var(--ease-header)] motion-reduce:transition-none ${
                      shouldShowActive ? "scale-x-100 opacity-100" : ""
                    }`}
                  />
                </Link>
              );
            })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden items-center rounded-2xl border border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-soft)] p-1 text-[17px] font-extrabold text-[color:var(--color-brand-muted)] shadow-inner sm:flex">
            {languageOptions.map((option) => {
              const isActive = language === option.code;

              return (
                <button
                  aria-label={t(option.labelKey)}
                  aria-pressed={isActive}
                  className={`cursor-pointer rounded-xl px-4 py-2.5 transition duration-[var(--duration-header-fast)] ease-[var(--ease-header)] hover:bg-white/80 hover:text-[color:var(--color-brand-purple)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                    isActive
                      ? "bg-white text-[color:var(--color-brand-purple)]"
                      : ""
                  }`}
                  key={option.code}
                  type="button"
                  onClick={() => setLanguage(option.code)}
                >
                  {t(option.shortLabelKey)}
                </button>
              );
            })}
          </div>

          {isAuthenticated ? (
            <>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="flex h-[53px] w-[53px] items-center justify-center rounded-2xl bg-[color:var(--color-brand-soft)]">
                  <Image
                    src="/user.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="h-7 w-7"
                  />
                </span>
                <span className="max-w-32 truncate text-[19px] font-extrabold text-[color:var(--color-brand-navy)]">
                  {userName}
                </span>
              </div>
              <Link
                href="/history"
                className="inline-flex h-[58px] items-center justify-center gap-2 rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-[19px] font-extrabold text-[color:var(--color-brand-purple)] transition duration-[var(--duration-header-fast)] ease-[var(--ease-header)] hover:bg-[color:var(--color-brand-soft)] motion-reduce:transition-none"
              >
                <ClockIcon />
                <span className="hidden sm:inline">{t("history.history")}</span>
              </Link>
              <button
                className="inline-flex h-[58px] items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-[19px] font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition duration-[var(--duration-header-fast)] ease-[var(--ease-header)] hover:translate-y-[-1px] motion-reduce:transition-none motion-reduce:transform-none"
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
                className="inline-flex h-[58px] items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-6 text-[19px] font-extrabold text-[color:var(--color-brand-purple)] transition duration-[var(--duration-header-fast)] ease-[var(--ease-header)] hover:bg-[color:var(--color-brand-soft)] motion-reduce:transition-none"
              >
                {t("auth.signIn")}
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex h-[58px] items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-6 text-[19px] font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition duration-[var(--duration-header-fast)] ease-[var(--ease-header)] hover:translate-y-[-1px] motion-reduce:transition-none motion-reduce:transform-none"
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
