import { describe, expect, it } from "vitest";
import {
  buildCookieHeaderValue,
  hasUnresolvedPathParameters,
  normalizePath,
  normalizeServerUrl,
  resolvePathParameters,
} from "./request-url";

describe("request-url helpers", () => {
  it("strips a single trailing slash from a server url", () => {
    expect(normalizeServerUrl("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
    expect(normalizeServerUrl("https://api.example.com")).toBe(
      "https://api.example.com",
    );
  });

  it("ensures a path always starts with a slash", () => {
    expect(normalizePath("users")).toBe("/users");
    expect(normalizePath("/users")).toBe("/users");
  });

  it("substitutes path parameters and leaves unmatched placeholders untouched", () => {
    expect(
      resolvePathParameters("/users/{id}/posts/{postId}", [
        { location: "path", name: "id", value: "42" },
      ]),
    ).toBe("/users/42/posts/{postId}");
  });

  it("encodes substituted path parameter values", () => {
    expect(
      resolvePathParameters("/search/{term}", [
        { location: "path", name: "term", value: "a b/c" },
      ]),
    ).toBe("/search/a%20b%2Fc");
  });

  it("ignores non-path parameters when substituting", () => {
    expect(
      resolvePathParameters("/users/{id}", [
        { location: "query", name: "id", value: "should-not-be-used" },
      ]),
    ).toBe("/users/{id}");
  });

  it("detects unresolved path placeholders", () => {
    expect(hasUnresolvedPathParameters("/users/{id}")).toBe(true);
    expect(hasUnresolvedPathParameters("/users/42")).toBe(false);
  });

  it("builds a semicolon-joined, encoded cookie header value", () => {
    expect(
      buildCookieHeaderValue([
        { location: "cookie", name: "sessionId", value: "abc 123" },
        { location: "cookie", name: "theme", value: "dark" },
        { location: "header", name: "ignored", value: "not-a-cookie" },
      ]),
    ).toBe("sessionId=abc%20123; theme=dark");
  });

  it("returns an empty string when there are no cookie parameters", () => {
    expect(buildCookieHeaderValue([])).toBe("");
  });
});
