import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";
import { I18nProvider } from "@/components/i18n-provider";
import {
  AUTH_TOKEN_COOKIE,
  AUTH_USER_COOKIE,
  getUserNameFromToken,
  isTokenValid,
} from "@/lib/auth";
import { isLanguage, LANGUAGE_COOKIE } from "@/lib/translations";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "RSSwag",
  description: "OpenAPI editor and viewer workspace",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  const isAuthenticated = isTokenValid(token);
  const userName =
    cookieStore.get(AUTH_USER_COOKIE)?.value || getUserNameFromToken(token);
  const languageCookie = cookieStore.get(LANGUAGE_COOKIE)?.value ?? null;
  const initialLanguage = isLanguage(languageCookie) ? languageCookie : "en";

  return (
    <html
      lang={initialLanguage}
      className={`h-full antialiased ${inter.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider initialLanguage={initialLanguage}>
          <AppHeader
            initialIsAuthenticated={isAuthenticated}
            initialUserName={userName}
          />
          <main className="flex flex-1 flex-col">{children}</main>
          <AppFooter
            initialIsAuthenticated={isAuthenticated}
            initialUserName={userName}
          />
        </I18nProvider>
      </body>
    </html>
  );
}
