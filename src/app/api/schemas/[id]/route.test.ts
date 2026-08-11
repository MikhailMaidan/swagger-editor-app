import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { SERVER_SAVED_SCHEMAS_COOKIE } from "@/lib/schema-storage";
import { DELETE } from "./route";

const authCookie = `${AUTH_TOKEN_COOKIE}=${createDemoToken("mikhail@example.com")}`;

const remainingSchema = {
  createdAt: "2026-07-10T09:00:00.000Z",
  format: "json",
  id: "keep-me",
  schemaText: '{"openapi":"3.0.0"}',
  title: "Keep Me API",
  updatedAt: "2026-07-10T09:00:00.000Z",
  version: "0.9.0",
};

const deletedSchema = {
  createdAt: "2026-07-10T10:00:00.000Z",
  format: "yaml",
  id: "delete-me",
  schemaText: "openapi: 3.0.0",
  title: "Delete Me API",
  updatedAt: "2026-07-10T10:00:00.000Z",
  version: "1.0.0",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("schemas/[id] route", () => {
  it("returns 401 for an unauthenticated request", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/schemas/delete-me", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) },
    );

    expect(response.status).toBe(401);
  });

  it("removes only the targeted schema from the fallback cookie", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/schemas/delete-me", {
        headers: {
          cookie: `${authCookie}; ${SERVER_SAVED_SCHEMAS_COOKIE}=${encodeURIComponent(
            JSON.stringify([deletedSchema, remainingSchema]),
          )}`,
        },
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemas).toMatchObject([{ id: "keep-me" }]);
    expect(response.headers.get("set-cookie")).toContain(
      SERVER_SAVED_SCHEMAS_COOKIE,
    );
  });

  it("scopes the database delete to the authenticated user's id, not a client-supplied one", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await DELETE(
      new Request("http://localhost/api/schemas/delete-me", {
        headers: { cookie: authCookie },
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) },
    );

    const requestUrl = String(fetchMock.mock.calls[0][0]);

    expect(requestUrl).toContain("id=eq.delete-me");
    expect(requestUrl).toContain("user_id=eq.mikhail%40example.com");
  });

  it("still clears the cookie fallback even if the database delete fails", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    const response = await DELETE(
      new Request("http://localhost/api/schemas/delete-me", {
        headers: {
          cookie: `${authCookie}; ${SERVER_SAVED_SCHEMAS_COOKIE}=${encodeURIComponent(
            JSON.stringify([deletedSchema]),
          )}`,
        },
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemas).toEqual([]);
  });
});
