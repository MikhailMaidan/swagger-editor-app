import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { SERVER_REQUEST_HISTORY_COOKIE } from "@/lib/request-history";
import { DELETE, GET, POST } from "./route";

const authCookie = `${AUTH_TOKEN_COOKIE}=${createDemoToken("mikhail@example.com")}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const currentRecord = {
  createdAt: "2026-07-07T10:00:00.000Z",
  durationMs: 24,
  id: "current-record",
  method: "GET",
  path: "/users/{id}",
  requestSize: 80,
  responseSize: 120,
  status: 200,
  summary: "Current request",
  url: "https://api.example.com/users/42",
  errorDetails: null,
};

const oldRecord = {
  createdAt: "2026-07-07T09:00:00.000Z",
  durationMs: 30,
  id: "old-record",
  method: "POST",
  path: "/users/{id}",
  requestSize: 90,
  responseSize: 130,
  status: 201,
  summary: "Old request",
  url: "https://api.example.com/users/42",
  errorDetails: null,
};

describe("history route", () => {
  it("returns an empty server history list", async () => {
    const response = await GET(
      new Request("http://localhost/api/history", {
        headers: { cookie: authCookie },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toEqual([]);
  });

  it("returns 401 for an unauthenticated request", async () => {
    const response = await GET(new Request("http://localhost/api/history"));

    expect(response.status).toBe(401);
  });

  it("stores a request history record in a cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/history", {
        body: JSON.stringify(currentRecord),
        headers: {
          cookie: `${authCookie}; ${SERVER_REQUEST_HISTORY_COOKIE}=${encodeURIComponent(
            JSON.stringify([oldRecord]),
          )}`,
        },
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toMatchObject([
      { id: "current-record", method: "GET" },
      { id: "old-record", method: "POST" },
    ]);
    expect(response.headers.get("set-cookie")).toContain(
      SERVER_REQUEST_HISTORY_COOKIE,
    );
  });

  it("persists a resubmission's fresh content instead of the stale cookie copy of the same id", async () => {
    const staleCopy = { ...currentRecord, summary: "Stale summary" };
    const freshRecord = { ...currentRecord, summary: "Fresh summary" };

    const response = await POST(
      new Request("http://localhost/api/history", {
        body: JSON.stringify(freshRecord),
        headers: {
          cookie: `${authCookie}; ${SERVER_REQUEST_HISTORY_COOKIE}=${encodeURIComponent(
            JSON.stringify([staleCopy]),
          )}`,
        },
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(data.records).toMatchObject([
      { id: "current-record", summary: "Fresh summary" },
    ]);
  });

  it("rejects malformed history records", async () => {
    const response = await POST(
      new Request("http://localhost/api/history", {
        body: JSON.stringify({
          method: "GET",
        }),
        headers: { cookie: authCookie },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("does not duplicate database records in the fallback cookie", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json([]),
    );

    const response = await POST(
      new Request("http://localhost/api/history", {
        body: JSON.stringify(currentRecord),
        headers: { cookie: authCookie },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 when clearing history without authentication", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/history", { method: "DELETE" }),
    );

    expect(response.status).toBe(401);
  });

  it("clears every record from the fallback cookie", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/history", {
        headers: {
          cookie: `${authCookie}; ${SERVER_REQUEST_HISTORY_COOKIE}=${encodeURIComponent(
            JSON.stringify([currentRecord, oldRecord]),
          )}`,
        },
        method: "DELETE",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toEqual([]);
    expect(response.headers.get("set-cookie")).toContain(
      `${SERVER_REQUEST_HISTORY_COOKIE}=%5B%5D`,
    );
  });

  it("scopes the bulk database delete to the authenticated user's id", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await DELETE(
      new Request("http://localhost/api/history", {
        headers: { cookie: authCookie },
        method: "DELETE",
      }),
    );

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestUrl.pathname).toContain("rest/v1/rsswagger_history");
    expect(requestUrl.searchParams.get("user_id")).toBe(
      "eq.mikhail@example.com",
    );
    expect(requestUrl.searchParams.has("id")).toBe(false);
  });
});
