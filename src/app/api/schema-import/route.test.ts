import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SCHEMA_IMPORT_SIZE_BYTES } from "@/lib/schema-import";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: lookupMock },
  lookup: lookupMock,
}));

import { POST } from "./route";

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

function createImportRequest(url: unknown) {
  return new Request("http://localhost/api/schema-import", {
    body: JSON.stringify({ url }),
    method: "POST",
  });
}

describe("schema import route", () => {
  it("downloads a public schema and returns import metadata", async () => {
    const schemaText = "openapi: 3.0.0\ninfo:\n  title: Remote API";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(schemaText, {
        headers: {
          "Content-Disposition": 'attachment; filename="public-api.yaml"',
        },
      }),
    );

    try {
      const response = await POST(
        createImportRequest("https://docs.example.com/spec/latest"),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(data).toEqual({
        byteSize: new TextEncoder().encode(schemaText).byteLength,
        fileName: "public-api.yaml",
        schemaText,
        sourceUrl: "https://docs.example.com/spec/latest",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://docs.example.com/spec/latest",
        expect.objectContaining({ redirect: "manual" }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects private, local, credentialed, and malformed URLs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      for (const url of [
        "http://localhost/openapi.yaml",
        "http://192.168.1.5/openapi.yaml",
        "https://user:secret@example.com/openapi.yaml",
        "/openapi.yaml",
        null,
      ]) {
        const response = await POST(createImportRequest(url));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: "invalid-url",
        });
      }

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects public-looking hosts that resolve to private addresses", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "10.0.0.8", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      const response = await POST(
        createImportRequest("https://internal.example.com/openapi.yaml"),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid-url",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("follows public redirects and blocks redirects to local services", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Location: "/v2/openapi.yaml" },
          status: 302,
        }),
      )
      .mockResolvedValueOnce(new Response("openapi: 3.0.0"));

    try {
      const response = await POST(
        createImportRequest("https://docs.example.com/latest"),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sourceUrl).toBe("https://docs.example.com/v2/openapi.yaml");
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(
        new Response(null, {
          headers: { Location: "http://127.0.0.1/private" },
          status: 302,
        }),
      );

      const blockedResponse = await POST(
        createImportRequest("https://docs.example.com/redirect"),
      );

      expect(blockedResponse.status).toBe(400);
      await expect(blockedResponse.json()).resolves.toEqual({
        error: "invalid-url",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects declared and streamed bodies above the size limit", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("small", {
          headers: {
            "Content-Length": String(MAX_SCHEMA_IMPORT_SIZE_BYTES + 1),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(MAX_SCHEMA_IMPORT_SIZE_BYTES + 1).fill(65)),
      );

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await POST(
          createImportRequest("https://docs.example.com/large.yaml"),
        );

        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toEqual({ error: "too-large" });
      }
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports empty documents and remote HTTP failures", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("   "))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    try {
      const emptyResponse = await POST(
        createImportRequest("https://docs.example.com/empty.yaml"),
      );

      expect(emptyResponse.status).toBe(422);
      await expect(emptyResponse.json()).resolves.toEqual({
        error: "empty-schema",
      });

      const missingResponse = await POST(
        createImportRequest("https://docs.example.com/missing.yaml"),
      );

      expect(missingResponse.status).toBe(502);
      await expect(missingResponse.json()).resolves.toEqual({
        error: "http-error",
        status: 404,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("returns a stable error for invalid JSON and network failures", async () => {
    const invalidPayloadResponse = await POST(
      new Request("http://localhost/api/schema-import", {
        body: "not-json",
        method: "POST",
      }),
    );

    expect(invalidPayloadResponse.status).toBe(400);
    await expect(invalidPayloadResponse.json()).resolves.toEqual({
      error: "invalid-url",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("network unavailable"));

    try {
      const response = await POST(
        createImportRequest("https://docs.example.com/openapi.yaml"),
      );

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: "fetch-failed",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
