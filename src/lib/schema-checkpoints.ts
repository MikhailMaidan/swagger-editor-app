import type { SchemaFormat } from "./openapi";
import { getByteSize } from "./text-encoding";

export const SCHEMA_CHECKPOINTS_STORAGE_KEY = "rsswag-schema-checkpoints-v1";
export const MAX_SCHEMA_CHECKPOINTS = 12;
export const MAX_SCHEMA_CHECKPOINT_SIZE_BYTES = 2 * 1024 * 1024;

const MAX_SCHEMA_CHECKPOINT_TOTAL_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 80;
const MAX_SCHEMA_METADATA_LENGTH = 4096;
const MAX_ENDPOINT_COUNT = 1_000_000;

export type SchemaCheckpoint = {
  byteSize: number;
  createdAt: string;
  endpointCount: number;
  format: SchemaFormat;
  id: string;
  isValid: boolean;
  name: string;
  schemaText: string;
  schemaTitle: string;
  schemaVersion: string;
};

export type SchemaCheckpointDraft = Omit<
  SchemaCheckpoint,
  "byteSize" | "createdAt" | "id"
>;

export type CreateSchemaCheckpointResult =
  | { ok: false; reason: "empty-name" | "empty-schema" | "too-large" }
  | { ok: true; value: SchemaCheckpoint };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function readTimestamp(value: unknown) {
  const timestamp = readText(value, 64);
  const date = new Date(timestamp);

  return timestamp && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

function createId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  return randomUuid
    ? `checkpoint-${randomUuid}`
    : `checkpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeCheckpoint(value: unknown): SchemaCheckpoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const createdAt = readTimestamp(value.createdAt);
  const id = readText(value.id, MAX_ID_LENGTH).trim();
  const name = readText(value.name, MAX_NAME_LENGTH).trim();
  const schemaText =
    typeof value.schemaText === "string" ? value.schemaText : "";
  const byteSize = getByteSize(schemaText);

  if (
    !createdAt ||
    !id ||
    !name ||
    !schemaText ||
    byteSize > MAX_SCHEMA_CHECKPOINT_SIZE_BYTES
  ) {
    return null;
  }

  const endpointCount =
    typeof value.endpointCount === "number" &&
    Number.isFinite(value.endpointCount)
      ? Math.min(
          Math.max(Math.trunc(value.endpointCount), 0),
          MAX_ENDPOINT_COUNT,
        )
      : 0;

  return {
    byteSize,
    createdAt,
    endpointCount,
    format: value.format === "json" ? "json" : "yaml",
    id,
    isValid: value.isValid === true,
    name,
    schemaText,
    schemaTitle: readText(value.schemaTitle, MAX_SCHEMA_METADATA_LENGTH).trim(),
    schemaVersion: readText(
      value.schemaVersion,
      MAX_SCHEMA_METADATA_LENGTH,
    ).trim(),
  };
}

function normalizeSchemaCheckpoints(values: unknown[]) {
  const checkpointsById = new Map<string, SchemaCheckpoint>();

  values.forEach((value) => {
    const checkpoint = sanitizeCheckpoint(value);

    if (!checkpoint) {
      return;
    }

    const existingCheckpoint = checkpointsById.get(checkpoint.id);

    if (
      !existingCheckpoint ||
      Date.parse(checkpoint.createdAt) >
        Date.parse(existingCheckpoint.createdAt)
    ) {
      checkpointsById.set(checkpoint.id, checkpoint);
    }
  });

  const sortedCheckpoints = Array.from(checkpointsById.values()).sort(
    (first, second) =>
      Date.parse(second.createdAt) - Date.parse(first.createdAt),
  );
  const boundedCheckpoints: SchemaCheckpoint[] = [];
  let totalByteSize = 0;

  for (const checkpoint of sortedCheckpoints) {
    if (boundedCheckpoints.length >= MAX_SCHEMA_CHECKPOINTS) {
      break;
    }

    if (
      totalByteSize + checkpoint.byteSize >
      MAX_SCHEMA_CHECKPOINT_TOTAL_SIZE_BYTES
    ) {
      continue;
    }

    boundedCheckpoints.push(checkpoint);
    totalByteSize += checkpoint.byteSize;
  }

  return boundedCheckpoints;
}

export function createSchemaCheckpoint(
  draft: SchemaCheckpointDraft,
  createdAt = new Date(),
  id = createId(),
): CreateSchemaCheckpointResult {
  const name = draft.name.slice(0, MAX_NAME_LENGTH).trim();

  if (!name) {
    return { ok: false, reason: "empty-name" };
  }

  if (!draft.schemaText) {
    return { ok: false, reason: "empty-schema" };
  }

  if (getByteSize(draft.schemaText) > MAX_SCHEMA_CHECKPOINT_SIZE_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  const timestamp = Number.isNaN(createdAt.getTime())
    ? new Date(0).toISOString()
    : createdAt.toISOString();
  const checkpoint = sanitizeCheckpoint({
    ...draft,
    createdAt: timestamp,
    id,
  });

  if (!checkpoint) {
    return { ok: false, reason: "empty-schema" };
  }

  return { ok: true, value: checkpoint };
}

export function upsertSchemaCheckpoint(
  checkpoints: SchemaCheckpoint[],
  checkpoint: SchemaCheckpoint,
) {
  return normalizeSchemaCheckpoints([checkpoint, ...checkpoints]);
}

export function removeSchemaCheckpoint(
  checkpoints: SchemaCheckpoint[],
  checkpointId: string,
) {
  return normalizeSchemaCheckpoints(
    checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId),
  );
}

export function readSchemaCheckpoints() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedCheckpoints = window.localStorage.getItem(
      SCHEMA_CHECKPOINTS_STORAGE_KEY,
    );

    if (!storedCheckpoints) {
      return [];
    }

    const envelope = JSON.parse(storedCheckpoints) as unknown;

    if (!isRecord(envelope) || envelope.storageVersion !== 1) {
      return [];
    }

    return normalizeSchemaCheckpoints(
      Array.isArray(envelope.checkpoints) ? envelope.checkpoints : [],
    );
  } catch {
    return [];
  }
}

export function saveSchemaCheckpoints(checkpoints: SchemaCheckpoint[]) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const normalizedCheckpoints = normalizeSchemaCheckpoints(checkpoints);

    if (normalizedCheckpoints.length === 0) {
      window.localStorage.removeItem(SCHEMA_CHECKPOINTS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        SCHEMA_CHECKPOINTS_STORAGE_KEY,
        JSON.stringify({
          checkpoints: normalizedCheckpoints,
          storageVersion: 1,
        }),
      );
    }

    return true;
  } catch {
    return false;
  }
}
