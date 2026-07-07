import { describe, expect, it } from "vitest";
import { SERVER_REQUEST_HISTORY_COOKIE } from "@/lib/request-history";
import { GET, POST } from "./route";

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
};

describe("history route", () => {
  it("returns an empty server history list", async () => {
    const response = await GET(new Request("http://localhost/api/history"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toEqual([]);
  });

  it("stores a request history record in a cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/history", {
        body: JSON.stringify(currentRecord),
        headers: {
          cookie: `${SERVER_REQUEST_HISTORY_COOKIE}=${encodeURIComponent(
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

  it("rejects malformed history records", async () => {
    const response = await POST(
      new Request("http://localhost/api/history", {
        body: JSON.stringify({
          method: "GET",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });
});
