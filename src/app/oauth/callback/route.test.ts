import { webcrypto } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { LANGUAGE_COOKIE } from "@/lib/translations";
afterEach(() => vi.unstubAllGlobals());
describe("OAuth callback response", () => {
  it("serves a private, standalone, noncacheable page without reflecting query secrets", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const response = GET(
        new NextRequest(
          "https://app.example/oauth/callback?state=private-state&code=private-code",
        ),
      ),
      html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    const nonce = /<script nonce="([^"]+)">/.exec(html)![1];
    expect(response.headers.get("Content-Security-Policy")).toContain(
      `'nonce-${nonce}'`,
    );
    expect(html).not.toContain("private-code");
    expect(html).not.toContain("private-state");
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });
  it("honors only the existing English/Russian language cookie", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const response = GET(
      new NextRequest("https://app.example/oauth/callback", {
        headers: { Cookie: `${LANGUAGE_COOKIE}=ru` },
      }),
    );
    expect(await response.text()).toContain("Ответ авторизации OAuth");
  });
});
