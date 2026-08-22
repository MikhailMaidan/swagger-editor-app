import { describe, expect, it, vi } from "vitest";
import {
  clearSavedSchema,
  createSavedSchemaRecord,
  mergeSavedSchemas,
  parseSavedSchemas,
  readSavedSchema,
  readServerSavedSchemas,
  SAVED_SCHEMA_STORAGE_KEY,
  SCHEMA_EDITOR_HANDOFF_STORAGE_KEY,
  saveSchema,
  saveServerSchemaRecord,
  stageSavedSchemaForEditor,
  takeStagedSavedSchemaForEditor,
} from "./schema-storage";

describe("schema storage", () => {
  it("saves and reads schema text from local storage", () => {
    saveSchema("openapi: 3.0.0");

    expect(window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY)).toBe(
      "openapi: 3.0.0",
    );
    expect(readSavedSchema()).toBe("openapi: 3.0.0");
  });

  it("clears the locally saved schema", () => {
    saveSchema("openapi: 3.0.0");

    clearSavedSchema();

    expect(readSavedSchema()).toBeNull();
  });

  it("creates, parses, and sorts saved schema records", () => {
    const oldSchema = {
      ...createSavedSchemaRecord("openapi: 3.0.0", {
        format: "yaml",
        title: "Old API",
        version: "1.0.0",
      }),
      updatedAt: "2026-07-10T09:00:00.000Z",
    };
    const newSchema = {
      ...createSavedSchemaRecord("openapi: 3.0.0", {
        format: "yaml",
        title: "New API",
        version: "2.0.0",
      }),
      updatedAt: "2026-07-10T10:00:00.000Z",
    };

    expect(parseSavedSchemas(JSON.stringify([oldSchema, null]))).toEqual([
      oldSchema,
    ]);
    expect(mergeSavedSchemas([oldSchema, newSchema])[0]).toMatchObject({
      title: "New API",
      version: "2.0.0",
    });
  });

  it("returns a saved schema record when metadata is provided", () => {
    const record = saveSchema("openapi: 3.0.0", {
      format: "yaml",
      title: "RSSwag Demo API",
      version: "1.0.0",
    });

    expect(record).toMatchObject({
      format: "yaml",
      schemaText: "openapi: 3.0.0",
      title: "RSSwag Demo API",
      version: "1.0.0",
    });
  });

  it("hands a selected saved schema to the editor exactly once", () => {
    const schema = createSavedSchemaRecord("openapi: 3.0.0", {
      format: "yaml",
      title: "Selected API",
      version: "1.0.0",
    });

    expect(stageSavedSchemaForEditor(schema)).toBe(true);
    expect(
      JSON.parse(
        window.sessionStorage.getItem(SCHEMA_EDITOR_HANDOFF_STORAGE_KEY) ||
          "null",
      ),
    ).toEqual(schema);
    expect(takeStagedSavedSchemaForEditor()).toEqual(schema);
    expect(takeStagedSavedSchemaForEditor()).toBeNull();
  });

  it("discards an invalid editor handoff", () => {
    window.sessionStorage.setItem(
      SCHEMA_EDITOR_HANDOFF_STORAGE_KEY,
      JSON.stringify({ id: "incomplete" }),
    );

    expect(takeStagedSavedSchemaForEditor()).toBeNull();
    expect(
      window.sessionStorage.getItem(SCHEMA_EDITOR_HANDOFF_STORAGE_KEY),
    ).toBeNull();
  });

  it("reports browser storage failures instead of throwing while saving", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage full", "QuotaExceededError");
      });

    try {
      expect(
        saveSchema("openapi: 3.0.0", {
          format: "yaml",
          title: "Unsaved API",
          version: "1.0.0",
        }),
      ).toBeNull();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("reuses the same id and original createdAt when resaving with an existing record's id", () => {
    const firstSave = saveSchema("openapi: 3.0.0", {
      format: "yaml",
      title: "RSSwag Demo API",
      version: "1.0.0",
    });
    const secondSave = saveSchema("openapi: 3.0.0\ninfo:\n  title: Edited", {
      createdAt: firstSave?.createdAt,
      format: "yaml",
      id: firstSave?.id,
      title: "Edited API",
      version: "1.1.0",
    });

    expect(secondSave?.id).toBe(firstSave?.id);
    expect(secondSave?.createdAt).toBe(firstSave?.createdAt);
    expect(secondSave?.title).toBe("Edited API");
  });

  it("creates a new id when no existing record is referenced", () => {
    const firstSave = saveSchema("openapi: 3.0.0", {
      format: "yaml",
      title: "First API",
      version: "1.0.0",
    });
    const secondSave = saveSchema("openapi: 3.0.0", {
      format: "yaml",
      title: "Second API",
      version: "1.0.0",
    });

    expect(secondSave?.id).not.toBe(firstSave?.id);
  });

  it("reads saved schemas from the server route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          schemas: [
            {
              createdAt: "2026-07-10T10:00:00.000Z",
              format: "yaml",
              id: "server-schema",
              schemaText: "openapi: 3.0.0",
              title: "Server API",
              updatedAt: "2026-07-10T10:00:00.000Z",
              version: "1.0.0",
            },
          ],
        }),
        {
          status: 200,
        },
      ),
    );

    try {
      await expect(readServerSavedSchemas()).resolves.toMatchObject([
        {
          id: "server-schema",
          title: "Server API",
        },
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("syncs saved schemas to the server route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
      }),
    );

    try {
      await expect(
        saveServerSchemaRecord({
          createdAt: "2026-07-10T10:00:00.000Z",
          format: "yaml",
          id: "schema-sync",
          schemaText: "openapi: 3.0.0",
          title: "Sync API",
          updatedAt: "2026-07-10T10:00:00.000Z",
          version: "1.0.0",
        }),
      ).resolves.toBe(true);

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schemas",
        expect.objectContaining({
          method: "POST",
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports unsuccessful server sync responses", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));

    try {
      await expect(
        saveServerSchemaRecord({
          createdAt: "2026-07-10T10:00:00.000Z",
          format: "yaml",
          id: "schema-sync",
          schemaText: "openapi: 3.0.0",
          title: "Sync API",
          updatedAt: "2026-07-10T10:00:00.000Z",
          version: "1.0.0",
        }),
      ).resolves.toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
