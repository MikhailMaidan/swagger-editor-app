"use client";

import Image from "next/image";
import Link from "next/link";
import { navLinks } from "@/components/app-header";
import { useI18n } from "@/components/i18n-provider";
import { useClientAuthState } from "@/lib/client-auth";
import type { ClientAuthState } from "@/lib/client-auth";
import type { TranslationKey } from "@/lib/translations";

const GITHUB_REPO_URL = "https://github.com/MikhailMaidan/swagger-editor-app";
const RS_SCHOOL_URL = "https://rs.school/";

type AppFooterProps = {
  initialIsAuthenticated?: boolean;
  initialUserName?: string;
};

function GitHubIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.58 2 12.19c0 4.49 2.87 8.3 6.84 9.64.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.61-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05a9.29 9.29 0 0 1 2.5-.35c.85 0 1.71.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.19C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M7 17 17 7M9 7h8v8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

const resourceLinks = [
  { href: GITHUB_REPO_URL, icon: GitHubIcon, labelKey: "footer.github" },
  { href: RS_SCHOOL_URL, icon: ExternalLinkIcon, labelKey: "footer.course" },
] satisfies { href: string; icon: () => React.JSX.Element; labelKey: TranslationKey }[];

export function AppFooter({
  initialIsAuthenticated,
  initialUserName,
}: AppFooterProps = {}) {
  const { t } = useI18n();
  const authInitialState: ClientAuthState | undefined =
    initialIsAuthenticated === undefined
      ? undefined
      : {
          isAuthenticated: initialIsAuthenticated,
          userName: initialUserName ?? "User",
        };
  const { isAuthenticated } = useClientAuthState(authInitialState);

  return (
    <footer className="px-4 pb-8 pt-10 md:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1600px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              className="flex items-center gap-3"
              aria-label="RSSwag home page"
            >
              <Image
                alt=""
                className="h-9 w-9 object-contain"
                height={36}
                src="/logo.png"
                width={36}
              />
              <span className="text-lg font-extrabold tracking-tight text-[color:var(--color-brand-navy)]">
                RSSwag
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
              {t("footer.tagline")}
            </p>
          </div>

          <div>
            <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
              {t("footer.navigate")}
            </p>
            <nav
              className="mt-4 flex flex-col gap-3 text-sm font-semibold text-[color:var(--color-brand-muted)]"
              aria-label={t("footer.navigation")}
            >
              {navLinks
                .filter((link) => !link.requiresAuth || isAuthenticated)
                .map((link) => (
                  <Link
                    className="w-fit transition hover:text-[color:var(--color-brand-purple)]"
                    href={link.href}
                    key={link.href}
                  >
                    {t(link.labelKey)}
                  </Link>
                ))}
              {isAuthenticated ? (
                <Link
                  className="w-fit transition hover:text-[color:var(--color-brand-purple)]"
                  href="/history"
                >
                  {t("history.history")}
                </Link>
              ) : null}
            </nav>
          </div>

          <div>
            <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
              {t("footer.resources")}
            </p>
            <nav className="mt-4 flex flex-col gap-3 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {resourceLinks.map(({ href, icon: Icon, labelKey }) => (
                <a
                  className="inline-flex w-fit items-center gap-2 transition hover:text-[color:var(--color-brand-purple)]"
                  href={href}
                  key={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon />
                  {t(labelKey)}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-[color:var(--color-brand-border)] pt-6 text-sm font-semibold text-[color:var(--color-brand-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            {t("footer.copyright", { year: String(new Date().getFullYear()) })}
          </p>
        </div>
      </div>
    </footer>
  );
}
