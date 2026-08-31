import { describe, expect, it, vi } from "vitest";
import {
  createSchemaCheckpoint,
  MAX_SCHEMA_CHECKPOINTS,
  MAX_SCHEMA_CHECKPOINT_SIZE_BYTES,
  readSchemaCheckpoints,
  removeSchemaCheckpoint,
  saveSchemaCheckpoints,
  SCHEMA_CHECKPOINTS_STORAGE_KEY,
  type SchemaCheckpoint,
  type SchemaCheckpointDraft,
  upsertSchemaCheckpoint,
} from "./schema-checkpoints";

const draft: SchemaCheckpointDraft = {
  endpointCount: 2,
  format: "yaml",
  isValid: true,
  name: "Before release",
  schemaText: "openapi: 3.0.0\npaths: {}",
  schemaTitle: "Catalog API",
  schemaVersion: "1.0.0",
};

function createCheckpoint(
  overrides: Partial<SchemaCheckpointDraft> = {},
  createdAt = new Date("2026-08-31T08:00:00.000Z"),
  id = "checkpoint-test",
) {
  const result = createSchemaCheckpoint(
    { ...draft, ...overrides },
    createdAt,
    id,
  );

  if (!result.ok) {
    throw new Error(`Could not create checkpoint: ${result.reason}`);
  }

  return result.value;
}

describe("schema checkpoints", () => {
  it("creates a normalized snapshot with trustworthy metadata", () => {
    const checkpoint = createCheckpoint({
      endpointCount: 2.8,
      name: "  Before release  ",
      schemaText: "é",
    });

    expect(checkpoint).toEqual({
      byteSize: 2,
      createdAt: "2026-08-31T08:00:00.000Z",
      endpointCount: 2,
      format: "yaml",
      id: "checkpoint-test",
      isValid: true,
      name: "Before release",
      schemaText: "é",
      schemaTitle: "Catalog API",
      schemaVersion: "1.0.0",
    });
  });

  it("rejects unnamed, empty, and oversized checkpoints", () => {
    expect(createSchemaCheckpoint({ ...draft, name: "  " })).toEqual({
      ok: false,
      reason: "empty-name",
    });
    expect(createSchemaCheckpoint({ ...draft, schemaText: "" })).toEqual({
      ok: false,
      reason: "empty-schema",
    });
    expect(
      createSchemaCheckpoint({
        ...draft,
        schemaText: "a".repeat(MAX_SCHEMA_CHECKPOINT_SIZE_BYTES + 1),
      }),
    ).toEqual({ ok: false, reason: "too-large" });
  });

  it("keeps the newest bounded checkpoint collection and supports removal", () => {
    let checkpoints: SchemaCheckpoint[] = [];

    for (let index = 0; index < MAX_SCHEMA_CHECKPOINTS + 2; index += 1) {
      checkpoints = upsertSchemaCheckpoint(
        checkpoints,
        createCheckpoint(
          { name: `Checkpoint ${index}` },
          new Date(Date.UTC(2026, 7, index + 1)),
          `checkpoint-${index}`,
        ),
      );
    }

    expect(checkpoints).toHaveLength(MAX_SCHEMA_CHECKPOINTS);
    expect(checkpoints[0].name).toBe("Checkpoint 13");
    expect(checkpoints.at(-1)?.name).toBe("Checkpoint 2");
    expect(removeSchemaCheckpoint(checkpoints, checkpoints[0].id)).toHaveLength(
      MAX_SCHEMA_CHECKPOINTS - 1,
    );
  });

  it("persists versioned checkpoints and sanitizes malformed storage", () => {
    const checkpoint = createCheckpoint();

    expect(saveSchemaCheckpoints([checkpoint])).toBe(true);
    expect(readSchemaCheckpoints()).toEqual([checkpoint]);
    expect(
      JSON.parse(
        window.localStorage.getItem(SCHEMA_CHECKPOINTS_STORAGE_KEY) || "{}",
      ),
    ).toMatchObject({ storageVersion: 1 });

    window.localStorage.setItem(
      SCHEMA_CHECKPOINTS_STORAGE_KEY,
      JSON.stringify({
        checkpoints: [
          null,
          { name: "Incomplete" },
          {
            ...checkpoint,
            byteSize: 999,
            endpointCount: -4,
            format: "xml",
          },
        ],
        storageVersion: 1,
      }),
    );

    expect(readSchemaCheckpoints()).toMatchObject([
      {
        byteSize: new TextEncoder().encode(checkpoint.schemaText).byteLength,
        endpointCount: 0,
        format: "yaml",
      },
    ]);

    window.localStorage.setItem(
      SCHEMA_CHECKPOINTS_STORAGE_KEY,
      JSON.stringify({ checkpoints: [checkpoint], storageVersion: 0 }),
    );
    expect(readSchemaCheckpoints()).toEqual([]);
  });

  it("returns failure instead of throwing when storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "SecurityError");
      });

    try {
      expect(saveSchemaCheckpoints([createCheckpoint()])).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
