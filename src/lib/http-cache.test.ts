import { describe, expect, it } from "vitest";
import {
  cacheControl,
  cacheDate,
  cacheFreshness,
  cacheHeaders,
  cacheSeconds,
  cacheUrl,
  cacheVary,
  storedCacheHeaders,
} from "./http-cache";
const start = Date.parse("2026-01-01T00:00:00Z");
describe("HTTP cache header primitives", () => {
  it("accepts case-insensitive HTTP dates but rejects rolled-over days and incorrect weekdays", () => {
    expect(cacheDate("thu, 01 jan 2026 00:00:00 gmt")).toBe(start);
    expect(cacheDate("Mon, 30 Feb 2026 00:00:00 GMT")).toBeUndefined();
    expect(cacheDate("Fri, 01 Jan 2026 00:00:00 GMT")).toBeUndefined();
    expect(cacheDate("Thu, 01 Jan 2026 00:00:00 UTC")).toBeUndefined();
  });
  it("parses case-insensitive directives and quoted lists/escapes without splitting their commas", () => {
    const parsed = cacheControl(
      'Public, max-age="60", no-cache="Set-Cookie, X-Private", custom="a\\\"b"',
    );
    expect(parsed.invalid).toBe(false);
    expect(parsed.values.get("no-cache")).toBe("Set-Cookie, X-Private");
    expect(parsed.values.get("custom")).toBe('a"b');
    expect(cacheSeconds(parsed, "max-age")).toBe(60);
  });
  it.each([
    "max-age=60, MAX-AGE=100",
    'max-age="unterminated',
    "public, =bad",
    "max-age=a b",
  ])("flags ambiguous or malformed controls: %s", (source) => {
    expect(cacheControl(source).invalid).toBe(true);
    expect(cacheSeconds(cacheControl(source), "max-age")).toBeUndefined();
  });
  it("bounds overflowing delta-seconds and rejects negative ones", () => {
    expect(
      cacheSeconds(cacheControl("max-age=999999999999999999999"), "max-age"),
    ).toBe(2147483648);
    expect(cacheSeconds(cacheControl("max-age=-1"), "max-age")).toBeUndefined();
  });
  it("normalizes headers atomically, retaining explicit missing/empty distinctions", () => {
    expect(cacheHeaders({ Vary: " Accept-Language ", Empty: "" })).toEqual({
      vary: "Accept-Language",
      empty: "",
    });
    expect(() => cacheHeaders({ Age: "1", age: "2" })).toThrow("headers");
    expect(() => cacheHeaders({ "bad name": "v" })).toThrow("headers");
    expect(() => cacheHeaders({ safe: "injected\r\nX:bad" })).toThrow(
      "headers",
    );
    expect(cacheVary({ vary: "X, x, Accept" })).toEqual(["accept", "x"]);
    expect(cacheVary({ vary: "*" })).toBeNull();
    expect(
      storedCacheHeaders({
        connection: "X-Debug",
        "x-debug": "1",
        "transfer-encoding": "chunked",
        etag: '"v1"',
      }),
    ).toEqual({ etag: '"v1"' });
  });
  it("normalizes URL origins but keeps query ordering significant", () => {
    expect(cacheUrl("https://EXAMPLE.test:443/a?b=2&a=1")).toBe(
      "https://example.test/a?b=2&a=1",
    );
    for (const url of [
      "file:///a",
      "https://user:pass@example.test",
      "https://example.test/#fragment",
    ])
      expect(() => cacheUrl(url)).toThrow("url");
  });
  it("uses corrected age including Date, upstream Age, response delay, and resident time", () => {
    const f = cacheFreshness(
      {
        date: new Date(start - 5000).toUTCString(),
        age: "9",
        "cache-control": "max-age=20",
      },
      start,
      start + 1000,
      start + 4000,
      "private",
      false,
    );
    expect(f).toMatchObject({
      ageMs: 13000,
      lifetimeMs: 20000,
      fresh: true,
      source: "max-age",
    });
    expect(
      cacheFreshness(
        {
          date: new Date(start - 30000).toUTCString(),
          age: "0",
          "cache-control": "max-age=20",
        },
        start,
        start,
        start,
        "private",
        false,
      ).ageMs,
    ).toBe(30000);
  });
  it("gives shared s-maxage precedence, and becomes stale at the exact lifetime boundary", () => {
    const headers = { "cache-control": "max-age=10, s-maxage=60" };
    expect(
      cacheFreshness(headers, start, start, start + 10000, "private", false)
        .fresh,
    ).toBe(false);
    expect(
      cacheFreshness(headers, start, start, start + 10000, "shared", false),
    ).toMatchObject({ fresh: true, source: "s-maxage" });
  });
  it("uses Expires and opt-in bounded Last-Modified heuristics without overriding explicit invalid freshness", () => {
    const headers = {
      date: new Date(start).toUTCString(),
      expires: new Date(start + 60000).toUTCString(),
      "last-modified": new Date(start - 1000000).toUTCString(),
    };
    expect(
      cacheFreshness(headers, start, start, start, "private", true).lifetimeMs,
    ).toBe(60000);
    expect(
      cacheFreshness(
        { ...headers, "cache-control": "max-age=wrong" },
        start,
        start,
        start,
        "private",
        true,
      ),
    ).toMatchObject({ lifetimeMs: 0, source: "invalid" });
    delete (headers as Partial<typeof headers>).expires;
    expect(
      cacheFreshness(headers, start, start, start, "private", false).lifetimeMs,
    ).toBe(0);
    expect(
      cacheFreshness(headers, start, start, start, "private", true).lifetimeMs,
    ).toBe(100000);
    expect(cacheDate("2026-01-01T00:00:00Z")).toBeUndefined();
  });
});
