import { describe, expect, it, vi } from "vitest";
import {
  getSchemaImportDetails,
  importSchemaFromUrl,
  MAX_SCHEMA_IMPORT_SIZE_BYTES,
  RemoteSchemaImportError,
  shouldConfirmSchemaImport,
} from "./schema-import";

describe("schema import validation", () => {
  it("normalizes imported file details for user feedback", () => {
    expect(
      getSchemaImportDetails({ name: " schema.yaml ", size: 42.9 }),
    ).toEqual({
      byteSize: 42,
      fileName: "schema.yaml",
    });
    expect(getSchemaImportDetails({ name: "  ", size: Number.NaN })).toEqual({
      byteSize: 0,
      fileName: "schema",
    });
  });

  it("does not require confirmation up to the size threshold", () => {
    expect(shouldConfirmSchemaImport(0)).toBe(false);
    expect(shouldConfirmSchemaImport(MAX_SCHEMA_IMPORT_SIZE_BYTES)).toBe(false);
    expect(shouldConfirmSchemaImport(Number.NaN)).toBe(false);
  });

  it("requires confirmation above the size threshold", () => {
    expect(shouldConfirmSchemaImport(MAX_SCHEMA_IMPORT_SIZE_BYTES + 1)).toBe(
      true,
    );
  });

  it("loads a validated remote schema through the server route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        byteSize: 78,
        fileName: "openapi.yaml",
        schemaText: "openapi: 3.0.0\ninfo:\n  title: Remote API",
        sourceUrl: "https://docs.example.com/openapi.yaml",
      }),
    );

    try {
      await expect(
        importSchemaFromUrl("  https://docs.example.com/openapi.yaml  "),
      ).resolves.toMatchObject({
        byteSize: 78,
        fileName: "openapi.yaml",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schema-import",
        expect.objectContaining({
          body: JSON.stringify({
            url: "https://docs.example.com/openapi.yaml",
          }),
          method: "POST",
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects invalid URLs before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      await expect(
        importSchemaFromUrl("http://localhost/openapi.yaml"),
      ).rejects.toMatchObject({ code: "invalid-url" });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("preserves structured server errors", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ error: "http-error", status: 404 }, { status: 502 }),
      );

    try {
      await expect(
        importSchemaFromUrl("https://docs.example.com/missing.yaml"),
      ).rejects.toEqual(new RemoteSchemaImportError("http-error", 404));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects malformed success responses and network failures", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ schemaText: "openapi: 3.0.0" }))
      .mockRejectedValueOnce(new TypeError("network unavailable"));

    try {
      await expect(
        importSchemaFromUrl("https://docs.example.com/openapi.yaml"),
      ).rejects.toMatchObject({ code: "invalid-response" });
      await expect(
        importSchemaFromUrl("https://docs.example.com/openapi.yaml"),
      ).rejects.toMatchObject({ code: "fetch-failed" });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
