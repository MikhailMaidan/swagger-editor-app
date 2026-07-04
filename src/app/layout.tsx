import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";
import {
  AUTH_TOKEN_COOKIE,
  AUTH_USER_COOKIE,
  getUserNameFromToken,
  isTokenValid,
} from "@/lib/auth";
import "./globals.css";

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

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AppHeader
          initialIsAuthenticated={isAuthenticated}
          initialUserName={userName}
        />
        <main className="flex flex-1 flex-col">{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
