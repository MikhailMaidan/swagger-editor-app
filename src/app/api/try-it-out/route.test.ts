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
        errorDetails: "Missing path parameter value.",
        status: "0",
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
        errorDetails: null,
        headers: {
          "content-type": "application/json",
          "x-demo": "server",
        },
        status: "200",
        url: "https://example.com/users/42?search=alex",
      });
      expect(data.requestSize).toBeGreaterThan(0);
      expect(data.responseSize).toBeGreaterThan(0);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("executes a real request against a lookalike hostname instead of mistaking it for the demo placeholder", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    try {
      await POST(
        new Request("http://localhost/api/try-it-out", {
          body: JSON.stringify({
            method: "GET",
            path: "/users",
            responseBody: "fallback",
            serverUrl: "https://backend-api.example.com.br",
            status: "200",
          }),
          method: "POST",
        }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "https://backend-api.example.com.br/users",
        expect.anything(),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("skips the network call for the exact demo placeholder host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      const response = await POST(
        new Request("http://localhost/api/try-it-out", {
          body: JSON.stringify({
            method: "GET",
            path: "/users",
            responseBody: "fallback",
            serverUrl: "https://api.example.com",
            status: "200",
          }),
          method: "POST",
        }),
      );
      const data = await response.json();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(data).toMatchObject({ body: "fallback" });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("blocks requests to private and local network addresses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      for (const serverUrl of [
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.5",
        "http://192.168.1.1",
        "http://172.16.0.1",
      ]) {
        const response = await POST(
          new Request("http://localhost/api/try-it-out", {
            body: JSON.stringify({
              method: "GET",
              path: "/",
              responseBody: "fallback",
              serverUrl,
              status: "200",
            }),
            method: "POST",
          }),
        );
        const data = await response.json();

        expect(data).toMatchObject({ body: "fallback" });
      }

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("percent-encodes query string spaces the same way the cURL preview does", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    try {
      await POST(
        new Request("http://localhost/api/try-it-out", {
          body: JSON.stringify({
            method: "GET",
            path: "/users",
            requestParameters: [
              { location: "query", name: "search", value: "Alex Smith" },
            ],
            responseBody: "fallback",
            serverUrl: "https://example.com",
            status: "200",
          }),
          method: "POST",
        }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/users?search=Alex%20Smith",
        expect.anything(),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports the substituted target url when the upstream request throws", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch failed"));

    try {
      const response = await POST(
        new Request("http://localhost/api/try-it-out", {
          body: JSON.stringify({
            method: "GET",
            path: "/users/{id}",
            requestParameters: [
              { location: "path", name: "id", value: "42" },
              { location: "query", name: "search", value: "alex" },
            ],
            responseBody: "fallback",
            serverUrl: "https://example.com",
            status: "200",
          }),
          method: "POST",
        }),
      );
      const data = await response.json();

      expect(data).toMatchObject({
        errorDetails: "fetch failed",
        status: "0",
        url: "https://example.com/users/42?search=alex",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("returns external API errors inside the response data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("User not found", {
        status: 404,
        statusText: "Not Found",
      }),
    );

    try {
      const response = await POST(
        new Request("http://localhost/api/try-it-out", {
          body: JSON.stringify({
            method: "GET",
            path: "/users/404",
            serverUrl: "https://example.com",
          }),
          method: "POST",
        }),
      );
      const data = await response.json();

      expect(data).toMatchObject({
        body: "User not found",
        errorDetails: "404 Not Found",
        status: "404",
        url: "https://example.com/users/404",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
