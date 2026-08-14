import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { SERVER_SAVED_SCHEMAS_COOKIE } from "@/lib/schema-storage";
import { DELETE, GET, POST } from "./route";

const authCookie = `${AUTH_TOKEN_COOKIE}=${createDemoToken("mikhail@example.com")}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const currentSchema = {
  createdAt: "2026-07-10T10:00:00.000Z",
  format: "yaml",
  id: "current-schema",
  schemaText: "openapi: 3.0.0",
  title: "Current API",
  updatedAt: "2026-07-10T10:00:00.000Z",
  version: "1.0.0",
};

const oldSchema = {
  createdAt: "2026-07-10T09:00:00.000Z",
  format: "json",
  id: "old-schema",
  schemaText: '{"openapi":"3.0.0"}',
  title: "Old API",
  updatedAt: "2026-07-10T09:00:00.000Z",
  version: "0.9.0",
};

describe("schemas route", () => {
  it("returns an empty saved schemas list", async () => {
    const response = await GET(
      new Request("http://localhost/api/schemas", {
        headers: { cookie: authCookie },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemas).toEqual([]);
  });

  it("returns 401 for an unauthenticated request", async () => {
    const response = await GET(new Request("http://localhost/api/schemas"));

    expect(response.status).toBe(401);
  });

  it("stores a saved schema record in a cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/schemas", {
        body: JSON.stringify(currentSchema),
        headers: {
          cookie: `${authCookie}; ${SERVER_SAVED_SCHEMAS_COOKIE}=${encodeURIComponent(
            JSON.stringify([oldSchema]),
          )}`,
        },
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemas).toMatchObject([
      { id: "current-schema", title: "Current API" },
      { id: "old-schema", title: "Old API" },
    ]);
    expect(response.headers.get("set-cookie")).toContain(
      SERVER_SAVED_SCHEMAS_COOKIE,
    );
  });

  it("persists a resave's fresh content instead of the stale cookie copy of the same id", async () => {
    const staleCopy = {
      ...currentSchema,
      title: "Stale Title",
      updatedAt: "2026-07-10T08:00:00.000Z",
    };
    const freshEdit = {
      ...currentSchema,
      title: "Fresh Title",
      updatedAt: "2026-07-10T11:00:00.000Z",
    };

    const response = await POST(
      new Request("http://localhost/api/schemas", {
        body: JSON.stringify(freshEdit),
        headers: {
          cookie: `${authCookie}; ${SERVER_SAVED_SCHEMAS_COOKIE}=${encodeURIComponent(
            JSON.stringify([staleCopy]),
          )}`,
        },
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(data.schemas).toMatchObject([
      { id: "current-schema", title: "Fresh Title" },
    ]);
  });

  it("rejects malformed saved schemas", async () => {
    const response = await POST(
      new Request("http://localhost/api/schemas", {
        body: JSON.stringify({
          title: "Broken API",
        }),
        headers: { cookie: authCookie },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("does not duplicate database schemas in the fallback cookie", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json([]),
    );

    const response = await POST(
      new Request("http://localhost/api/schemas", {
        body: JSON.stringify(currentSchema),
        headers: { cookie: authCookie },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 when clearing schemas without authentication", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/schemas", { method: "DELETE" }),
    );

    expect(response.status).toBe(401);
  });

  it("clears every schema from the fallback cookie", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/schemas", {
        headers: {
          cookie: `${authCookie}; ${SERVER_SAVED_SCHEMAS_COOKIE}=${encodeURIComponent(
            JSON.stringify([currentSchema, oldSchema]),
          )}`,
        },
        method: "DELETE",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemas).toEqual([]);
    expect(response.headers.get("set-cookie")).toContain(
      `${SERVER_SAVED_SCHEMAS_COOKIE}=%5B%5D`,
    );
  });

  it("scopes the bulk database delete to the authenticated user's id", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await DELETE(
      new Request("http://localhost/api/schemas", {
        headers: { cookie: authCookie },
        method: "DELETE",
      }),
    );

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestUrl.pathname).toContain("rest/v1/rsswagger_schemas");
    expect(requestUrl.searchParams.get("user_id")).toBe(
      "eq.mikhail@example.com",
    );
    expect(requestUrl.searchParams.has("id")).toBe(false);
  });
});
