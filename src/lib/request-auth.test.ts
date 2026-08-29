import { describe, expect, it } from "vitest";
import type { SecuritySchemeSummary } from "./openapi";
import {
  REDACTED_AUTH_VALUE,
  createAuthRequestParameters,
  isAuthRequestParameter,
  mergeRequestAuthentication,
  redactAuthQueryFromUrl,
  type RequestAuthValues,
} from "./request-auth";

function createScheme(
  name: string,
  overrides: Partial<SecuritySchemeSummary>,
): SecuritySchemeSummary {
  return {
    bearerFormat: "",
    description: "",
    location: "",
    name,
    parameterName: "",
    scheme: "",
    type: "unsupported",
    ...overrides,
  };
}

function createCredential(overrides: Partial<RequestAuthValues[string]> = {}) {
  return {
    enabled: true,
    password: "",
    token: "",
    username: "",
    ...overrides,
  };
}

describe("request authentication", () => {
  it("creates API key, bearer, OAuth, and UTF-8 basic parameters", () => {
    const schemes = [
      createScheme("queryKey", {
        location: "query",
        parameterName: "api_key",
        type: "apiKey",
      }),
      createScheme("cookieKey", {
        location: "cookie",
        parameterName: "session_key",
        type: "apiKey",
      }),
      createScheme("bearerAuth", { scheme: "bearer", type: "http" }),
      createScheme("oauth", { type: "oauth2" }),
      createScheme("basicAuth", { scheme: "basic", type: "http" }),
    ];
    const credentials: RequestAuthValues = {
      basicAuth: createCredential({ password: "пароль", username: "mila" }),
      bearerAuth: createCredential({ token: "bearer-token" }),
      cookieKey: createCredential({ token: "cookie-token" }),
      oauth: createCredential({ token: "oauth-token" }),
      queryKey: createCredential({ token: "query-token" }),
    };

    expect(
      createAuthRequestParameters(
        schemes,
        credentials,
        schemes.map((scheme) => scheme.name),
      ),
    ).toEqual([
      { location: "query", name: "api_key", value: "query-token" },
      { location: "cookie", name: "session_key", value: "cookie-token" },
      {
        location: "header",
        name: "Authorization",
        value: "Bearer bearer-token",
      },
      {
        location: "header",
        name: "Authorization",
        value: "Bearer oauth-token",
      },
      {
        location: "header",
        name: "Authorization",
        value: `Basic ${btoa(
          String.fromCharCode(...new TextEncoder().encode("mila:пароль")),
        )}`,
      },
    ]);
  });

  it("selects a fully configured security alternative", () => {
    const schemes = [
      createScheme("headerKey", {
        location: "header",
        parameterName: "X-API-Key",
        type: "apiKey",
      }),
      createScheme("bearerAuth", { scheme: "bearer", type: "http" }),
    ];

    expect(
      createAuthRequestParameters(
        schemes,
        {
          bearerAuth: createCredential({ token: "ready" }),
          headerKey: createCredential({ enabled: false, token: "ignored" }),
        },
        ["headerKey", "bearerAuth"],
        [["headerKey"], ["bearerAuth"]],
      ),
    ).toEqual([
      {
        location: "header",
        name: "Authorization",
        value: "Bearer ready",
      },
    ]);
  });

  it("keeps endpoint values above auth and auth above environment defaults", () => {
    const authParameters = [
      {
        location: "header" as const,
        name: "Authorization",
        value: "Bearer auth-token",
      },
      {
        location: "header" as const,
        name: "X-API-Key",
        value: "auth-key",
      },
    ];
    const result = mergeRequestAuthentication(
      [
        { location: "header", name: "x-api-key", value: "manual-key" },
        { location: "query", name: "page", value: "2" },
      ],
      [
        {
          enabled: true,
          id: "authorization",
          name: "authorization",
          value: "Bearer environment-token",
        },
        {
          enabled: true,
          id: "trace",
          name: "X-Trace-Id",
          value: "trace-1",
        },
      ],
      authParameters,
    );

    expect(result).toEqual([
      { location: "header", name: "Authorization", value: "Bearer auth-token" },
      { location: "header", name: "X-Trace-Id", value: "trace-1" },
      { location: "header", name: "x-api-key", value: "manual-key" },
      { location: "query", name: "page", value: "2" },
    ]);
    expect(isAuthRequestParameter(result[0], authParameters)).toBe(true);
    expect(isAuthRequestParameter(result[1], authParameters)).toBe(false);
  });

  it("redacts query credentials without changing the live parameter", () => {
    const authParameters = [
      { location: "query" as const, name: "api_key", value: "top-secret" },
    ];
    const redactedUrl = redactAuthQueryFromUrl(
      "https://api.example.com/reports?page=2&api_key=top-secret",
      authParameters,
    );

    expect(redactedUrl).toContain(
      `api_key=${encodeURIComponent(REDACTED_AUTH_VALUE)}`,
    );
    expect(redactedUrl).not.toContain("top-secret");
    expect(authParameters[0].value).toBe("top-secret");
  });
});
