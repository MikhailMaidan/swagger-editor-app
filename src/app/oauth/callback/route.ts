import { NextRequest } from "next/server";
import { oauthCallbackDocument } from "@/lib/oauth-callback";
import { LANGUAGE_COOKIE } from "@/lib/translations";

export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  const language =
      request.cookies.get(LANGUAGE_COOKIE)?.value === "ru" ? "ru" : "en",
    nonce = crypto.randomUUID();
  return new Response(oauthCallbackDocument(language, nonce), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
  });
}
