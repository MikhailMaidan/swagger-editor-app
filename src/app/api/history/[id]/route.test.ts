import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { SERVER_REQUEST_HISTORY_COOKIE } from "@/lib/request-history";
import { DELETE } from "./route";

const authCookie = `${AUTH_TOKEN_COOKIE}=${createDemoToken("mikhail@example.com")}`;

const remainingRecord = {
  createdAt: "2026-07-07T09:00:00.000Z",
  durationMs: 30,
  id: "keep-me",
  method: "POST",
  path: "/users/{id}",
  requestSize: 90,
  responseSize: 130,
  status: 201,
  summary: "Keep me",
  url: "https://api.example.com/users/42",
  errorDetails: null,
};

const deletedRecord = {
  createdAt: "2026-07-07T10:00:00.000Z",
  durationMs: 24,
  id: "delete-me",
  method: "GET",
  path: "/users/{id}",
  requestSize: 80,
  responseSize: 120,
  status: 200,
  summary: "Delete me",
  url: "https://api.example.com/users/42",
  errorDetails: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("history/[id] route", () => {
  it("returns 401 for an unauthenticated request", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/history/delete-me", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) },
    );

    expect(response.status).toBe(401);
  });

  it("removes only the targeted record from the fallback cookie", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/history/delete-me", {
        headers: {
          cookie: `${authCookie}; ${SERVER_REQUEST_HISTORY_COOKIE}=${encodeURIComponent(
            JSON.stringify([deletedRecord, remainingRecord]),
          )}`,
        },
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toMatchObject([{ id: "keep-me" }]);
    expect(response.headers.get("set-cookie")).toContain(
      SERVER_REQUEST_HISTORY_COOKIE,
    );
  });

  it("scopes the database delete to the authenticated user's id, not a client-supplied one", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await DELETE(
      new Request("http://localhost/api/history/delete-me", {
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
      new Request("http://localhost/api/history/delete-me", {
        headers: {
          cookie: `${authCookie}; ${SERVER_REQUEST_HISTORY_COOKIE}=${encodeURIComponent(
            JSON.stringify([deletedRecord]),
          )}`,
        },
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toEqual([]);
  });
});
