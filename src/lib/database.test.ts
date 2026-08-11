import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteSchemaFromDatabase,
  isDatabaseConfigured,
  readHistoryFromDatabase,
  readHistoryRecordFromDatabase,
  readSchemasFromDatabase,
  saveHistoryToDatabase,
  saveSchemaToDatabase,
} from "./database";

const historyRecord = {
  createdAt: "2026-07-11T08:00:00.000Z",
  durationMs: 42,
  errorDetails: null,
  id: "history-1",
  method: "GET",
  path: "/users/{id}",
  requestSize: 80,
  responseSize: 120,
  status: 200,
  summary: "Get user",
  url: "https://api.example.com/users/42",
};

const savedSchema = {
  createdAt: "2026-07-11T08:00:00.000Z",
  format: "yaml",
  id: "schema-1",
  schemaText: "openapi: 3.0.0",
  title: "Users API",
  updatedAt: "2026-07-11T08:00:00.000Z",
  version: "1.0.0",
};

function configureDatabase() {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co/");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("database", () => {
  it("uses the local fallback when database variables are absent", async () => {
    expect(isDatabaseConfigured()).toBe(false);
    await expect(
      readHistoryFromDatabase("user@example.com"),
    ).resolves.toBeNull();
    await expect(
      readSchemasFromDatabase("user@example.com"),
    ).resolves.toBeNull();
    await expect(
      saveHistoryToDatabase("user@example.com", historyRecord),
    ).resolves.toBe(false);
  });

  it("reads and maps history and schema rows", async () => {
    configureDatabase();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json([
          {
            created_at: historyRecord.createdAt,
            duration_ms: historyRecord.durationMs,
            error_details: null,
            id: historyRecord.id,
            method: historyRecord.method,
            path: historyRecord.path,
            request_size: historyRecord.requestSize,
            response_size: historyRecord.responseSize,
            status: historyRecord.status,
            summary: historyRecord.summary,
            url: historyRecord.url,
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            created_at: savedSchema.createdAt,
            format: savedSchema.format,
            id: savedSchema.id,
            schema_text: savedSchema.schemaText,
            title: savedSchema.title,
            updated_at: savedSchema.updatedAt,
            version: savedSchema.version,
          },
        ]),
      );

    await expect(readHistoryFromDatabase("user@example.com")).resolves.toEqual([
      historyRecord,
    ]);
    await expect(readSchemasFromDatabase("user@example.com")).resolves.toEqual([
      savedSchema,
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain("rest/v1/rsswagger_history");

    const requestHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;

    expect(requestHeaders.get("apikey")).toBe("secret-key");
    expect(requestHeaders.get("Authorization")).toBe("Bearer secret-key");
  });

  it("authenticates as the service role via a bearer token, not just the apikey header", async () => {
    configureDatabase();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }));

    await saveHistoryToDatabase("user@example.com", historyRecord);

    const requestHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;

    expect(requestHeaders.get("Authorization")).toBe("Bearer secret-key");
  });

  it("falls back to the legacy NEXT_PUBLIC_SUPABASE_URL variable name", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://legacy-project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");

    expect(isDatabaseConfigured()).toBe(true);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json([]));

    await readHistoryFromDatabase("user@example.com");

    expect(fetchMock.mock.calls[0][0]).toContain(
      "https://legacy-project.supabase.co",
    );
  });

  it("reads one history record and handles an empty result", async () => {
    configureDatabase();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(
        Response.json([
          {
            created_at: historyRecord.createdAt,
            duration_ms: historyRecord.durationMs,
            error_details: null,
            id: historyRecord.id,
            method: historyRecord.method,
            path: historyRecord.path,
            request_size: historyRecord.requestSize,
            response_size: historyRecord.responseSize,
            status: historyRecord.status,
            summary: historyRecord.summary,
            url: historyRecord.url,
          },
        ]),
      );

    await expect(
      readHistoryRecordFromDatabase("user@example.com", "missing"),
    ).resolves.toBeNull();
    await expect(
      readHistoryRecordFromDatabase("user@example.com", "history-1"),
    ).resolves.toEqual(historyRecord);
  });

  it("writes history and schemas with a server-only API key", async () => {
    configureDatabase();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }));

    await expect(
      saveHistoryToDatabase("user@example.com", historyRecord),
    ).resolves.toBe(true);
    await expect(
      saveSchemaToDatabase("user@example.com", savedSchema),
    ).resolves.toBe(true);

    const historyBody = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    expect(historyBody).toMatchObject({
      error_details: null,
      url: historyRecord.url,
      user_id: "user@example.com",
    });
    expect(fetchMock.mock.calls[1][0]).toContain("rest/v1/rsswagger_schemas");
  });

  it("deletes a schema scoped to both its id and the owning user", async () => {
    configureDatabase();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      deleteSchemaFromDatabase("user@example.com", "schema-1"),
    ).resolves.toBe(true);

    const requestUrl = String(fetchMock.mock.calls[0][0]);
    const requestOptions = fetchMock.mock.calls[0][1] as RequestInit;

    expect(requestUrl).toContain("rest/v1/rsswagger_schemas");
    expect(requestUrl).toContain("id=eq.schema-1");
    expect(requestUrl).toContain("user_id=eq.user%40example.com");
    expect(requestOptions.method).toBe("DELETE");
  });

  it("skips the delete request when the database is not configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      deleteSchemaFromDatabase("user@example.com", "schema-1"),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the database returns an error", async () => {
    configureDatabase();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await expect(readHistoryFromDatabase("user@example.com")).rejects.toThrow(
      "Database read failed",
    );
    await expect(
      saveSchemaToDatabase("user@example.com", savedSchema),
    ).rejects.toThrow("Database write failed");
    await expect(
      deleteSchemaFromDatabase("user@example.com", "schema-1"),
    ).rejects.toThrow("Database delete failed");
  });
});
