import { describe, expect, it } from "vitest";
import {
  corsCheck,
  corsForbiddenRequest,
  corsPreflightCheck,
  corsSafelistedHeader,
  corsUnsafeHeaders,
  corsVisibleHeaders,
} from "./cors-protocol";
import { defaultCorsCase } from "./cors-project";
describe("browser CORS protocol checks", () => {
  it.each([
    ["accept", "application/json", true],
    ["accept", "text/html;q=0.9", true],
    ["accept", 'text/plain;param="x"', false],
    ["accept-language", "en-US,en;q=0.9", true],
    ["accept-language", "en_US", false],
    ["content-type", "Text/Plain; charset=UTF-8", true],
    ["content-type", "application/json", false],
    ["content-type", "text/plain, application/json", false],
    ["content-type", 'text/plain;charset="UTF-8"', false],
    ["range", "bytes=0-100", true],
    ["range", "bytes=10-", true],
    ["range", "bytes=-100", false],
    ["range", "bytes=100-10", false],
    ["range", "bytes=0-1,2-3", false],
    ["x-custom", "ok", false],
  ])("classifies %s: %s", (name, value, expected) =>
    expect(corsSafelistedHeader(name, value)).toBe(expected),
  );
  it("treats values longer than 128 bytes as unsafe and sorts preflight header names", () => {
    expect(corsSafelistedHeader("accept", "a".repeat(129))).toBe(false);
    expect(
      corsUnsafeHeaders({
        authorization: "Bearer test",
        "x-z": "a",
        accept: "*/*",
        "content-type": "application/json",
      }),
    ).toEqual(["authorization", "content-type", "x-z"]);
  });
  it("recognizes forbidden headers and tunneled forbidden methods without banning normal Authorization", () => {
    for (const h of [
      "Origin",
      "Cookie",
      "Host",
      "Sec-Fetch-Site",
      "Proxy-Example",
      "Content-Length",
    ])
      expect(corsForbiddenRequest(h, "x")).toBe(true);
    expect(corsForbiddenRequest("x-http-method-override", "GET, TRACE")).toBe(
      true,
    );
    expect(corsForbiddenRequest("authorization", "Bearer value")).toBe(false);
    expect(corsForbiddenRequest("x-http-method-override", "PATCH")).toBe(false);
  });
  it("requires exact origin serialization, one ACAO value and case-sensitive credential permission", () => {
    const origin = "https://app.example";
    expect(
      corsCheck(origin, "omit", { "access-control-allow-origin": "*" }),
    ).toBeNull();
    expect(
      corsCheck(origin, "include", {
        "access-control-allow-origin": "*",
        "access-control-allow-credentials": "true",
      }),
    ).toBe("wildcard-credentials");
    expect(
      corsCheck(origin, "include", {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "True",
      }),
    ).toBe("credentials-header");
    for (const allowed of [
      `${origin}/`,
      `${origin}, https://other.example`,
      "https://APP.example",
      `\u00a0${origin}`,
    ])
      expect(
        corsCheck(origin, "omit", { "access-control-allow-origin": allowed }),
      ).toBe("origin-mismatch");
    expect(
      corsCheck("null", "omit", { "access-control-allow-origin": "null" }),
    ).toBeNull();
    expect(corsCheck("null", "omit", {})).toBe("missing-origin");
  });
  it("checks the original credentials mode on preflights without sending credentials", () => {
    const c = {
      ...defaultCorsCase(),
      method: "PUT" as const,
      credentials: "include" as const,
    };
    expect(
      corsPreflightCheck(c, 204, {
        "access-control-allow-origin": "https://app.example",
        "access-control-allow-methods": "PUT",
      }).issue,
    ).toBe("credentials-header");
  });
  it("keeps method matching case-sensitive and header matching case-insensitive", () => {
    const c = {
        ...defaultCorsCase(),
        method: "PUT" as const,
        headers: { "x-test": "v" },
      },
      base = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "X-Test",
      };
    expect(
      corsPreflightCheck(c, 204, {
        ...base,
        "access-control-allow-methods": "put",
      }).issue,
    ).toBe("method-denied");
    expect(
      corsPreflightCheck(c, 204, {
        ...base,
        "access-control-allow-methods": "PUT",
      }).issue,
    ).toBeNull();
  });
  it("requires explicit Authorization even with wildcard header permissions", () => {
    const c = {
        ...defaultCorsCase(),
        headers: { authorization: "Bearer demo" },
      },
      base = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
      };
    expect(corsPreflightCheck(c, 204, base).issue).toBe(
      "authorization-explicit",
    );
    expect(
      corsPreflightCheck(c, 204, {
        ...base,
        "access-control-allow-headers": "*, AUTHORIZATION",
      }).issue,
    ).toBeNull();
  });
  it("treats wildcard methods and headers as literal for credentialed requests", () => {
    const c = {
        ...defaultCorsCase(),
        method: "PUT" as const,
        credentials: "include" as const,
        headers: { "x-custom": "v" },
      },
      base = {
        "access-control-allow-origin": cOrigin(),
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "*",
        "access-control-allow-headers": "*",
      };
    expect(corsPreflightCheck(c, 204, base).issue).toBe("method-denied");
    expect(
      corsPreflightCheck(c, 204, {
        ...base,
        "access-control-allow-methods": "PUT",
      }).issue,
    ).toBe("header-denied");
  });
  it("accepts safelisted methods without ACAM, uses default Max-Age, and rejects malformed lists", () => {
    const c = {
        ...defaultCorsCase(),
        method: "POST" as const,
        headers: { "content-type": "application/json" },
      },
      h = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "Content-Type",
      };
    expect(corsPreflightCheck(c, 204, h)).toMatchObject({
      issue: null,
      maxAge: 5,
      methods: [],
    });
    expect(
      corsPreflightCheck(c, 204, {
        ...h,
        "access-control-allow-methods": "bad method",
      }).issue,
    ).toBe("allow-list");
    expect(
      corsPreflightCheck({ ...c, forcePreflight: true }, 204, h).methods,
    ).toEqual(["POST"]);
  });
  it("never exposes Set-Cookie and distinguishes credentialed expose-header wildcards", () => {
    const h = {
      "content-type": "application/json",
      "x-trace": "id",
      "set-cookie": "secret=value",
      "access-control-expose-headers": "*",
    };
    expect(corsVisibleHeaders(h, false, "omit")["x-trace"]).toBe("id");
    expect(corsVisibleHeaders(h, false, "include")["x-trace"]).toBeUndefined();
    expect(
      corsVisibleHeaders(
        { ...h, "access-control-expose-headers": "X-Trace, Set-Cookie" },
        false,
        "include",
      ),
    ).toEqual({ "content-type": "application/json", "x-trace": "id" });
    expect(
      corsVisibleHeaders(h, true, "include")["set-cookie"],
    ).toBeUndefined();
  });
});
const cOrigin = () => "https://app.example";
