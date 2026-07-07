import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("try-it-out route", () => {
  it("returns a mock response with request analytics", async () => {
    const response = await POST(
      new Request("http://localhost/api/try-it-out", {
        body: JSON.stringify({
          method: "POST",
          path: "/users/{id}",
          requestBody: JSON.stringify({ name: "Mikhail" }),
          requestValues: [{ label: "Path: id", value: "42" }],
          responseBody: JSON.stringify({ id: "42", name: "Mikhail" }),
          status: "200",
        }),
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      body: '{"id":"42","name":"Mikhail"}',
      headers: {
        "content-type": "application/json",
      },
      status: "200",
    });
    expect(data.requestSize).toBeGreaterThan(0);
    expect(data.responseSize).toBeGreaterThan(0);
    expect(data.durationMs).toBeGreaterThan(0);
  });

  it("rejects broken payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/try-it-out", {
        body: "not-json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps the fallback response when path parameters are missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      const response = await POST(
        new Request("http://localhost/api/try-it-out", {
          body: JSON.stringify({
            method: "GET",
            path: "/users/{id}",
            responseBody: "fallback response",
            serverUrl: "https://example.com",
            status: "200",
          }),
          method: "POST",
        }),
      );
      const data = await response.json();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(data).toMatchObject({
        body: "fallback response",
        status: "200",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("executes a server-side request when a server url is provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 42 }), {
        headers: {
          "Content-Type": "application/json",
          "X-Demo": "server",
        },
        status: 200,
      }),
    );

    try {
      const response = await POST(
        new Request("http://localhost/api/try-it-out", {
          body: JSON.stringify({
            method: "GET",
            path: "/users/{id}",
            requestParameters: [
              { location: "path", name: "id", value: "42" },
              { location: "query", name: "search", value: "alex" },
              { location: "header", name: "X-Trace-Id", value: "trace-1" },
            ],
            responseBody: "fallback",
            serverUrl: "https://example.com",
            status: "200",
          }),
          method: "POST",
        }),
      );
      const data = await response.json();
      const fetchOptions = fetchMock.mock.calls[0][1] as RequestInit;
      const requestHeaders = fetchOptions.headers as Headers;

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/users/42?search=alex",
        expect.objectContaining({
          cache: "no-store",
          method: "GET",
        }),
      );
      expect(requestHeaders.get("X-Trace-Id")).toBe("trace-1");
      expect(data).toMatchObject({
        body: '{"id":42}',
        headers: {
          "content-type": "application/json",
          "x-demo": "server",
        },
        status: "200",
      });
      expect(data.requestSize).toBeGreaterThan(0);
      expect(data.responseSize).toBeGreaterThan(0);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
