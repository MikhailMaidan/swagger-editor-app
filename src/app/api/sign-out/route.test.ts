import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_COOKIE, AUTH_USER_COOKIE } from "@/lib/auth";
import { SERVER_REQUEST_HISTORY_COOKIE } from "@/lib/request-history";
import { SERVER_SAVED_SCHEMAS_COOKIE } from "@/lib/schema-storage";
import { POST } from "./route";

describe("sign-out route", () => {
  it("clears every auth and server-fallback cookie, including httpOnly ones", async () => {
    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });

    for (const cookieName of [
      AUTH_TOKEN_COOKIE,
      AUTH_USER_COOKIE,
      SERVER_SAVED_SCHEMAS_COOKIE,
      SERVER_REQUEST_HISTORY_COOKIE,
    ]) {
      const clearedCookie = response.cookies.get(cookieName);

      expect(clearedCookie?.value).toBe("");
      expect(new Date(clearedCookie?.expires ?? 0).getTime()).toBeLessThan(
        Date.now(),
      );
    }
  });
});
