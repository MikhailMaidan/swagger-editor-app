export const SAVED_SCHEMA_STORAGE_KEY = "rsswagger-saved-schema";
export const SERVER_SAVED_SCHEMAS_COOKIE = "rsswagger-server-schemas";
export const SCHEMA_EDITOR_HANDOFF_STORAGE_KEY =
  "rsswagger-schema-editor-handoff";
export const MAX_SAVED_SCHEMAS = 10;

export type SavedSchemaRecord = {
  id: string;
  title: string;
  version: string;
  format: string;
  schemaText: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedSchemaMeta = {
  title: string;
  version: string;
  format: string;
  id?: string;
  createdAt?: string;
};

function createId() {
  return `${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

export function isSavedSchemaRecord(
  value: unknown,
): value is SavedSchemaRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.version === "string" &&
    typeof record.format === "string" &&
    typeof record.schemaText === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

export function parseSavedSchemas(value?: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);

    return Array.isArray(parsedValue)
      ? parsedValue.filter(isSavedSchemaRecord)
      : [];
  } catch {
    return [];
  }
}

export function sortSavedSchemas(schemas: SavedSchemaRecord[]) {
  return [...schemas].sort(
    (firstSchema, secondSchema) =>
      new Date(secondSchema.updatedAt).getTime() -
      new Date(firstSchema.updatedAt).getTime(),
  );
}

export function mergeSavedSchemas(schemas: SavedSchemaRecord[]) {
  const schemasById = new Map<string, SavedSchemaRecord>();

  schemas.forEach((schema) => {
    schemasById.set(schema.id, schema);
  });

  return sortSavedSchemas(Array.from(schemasById.values())).slice(
    0,
    MAX_SAVED_SCHEMAS,
  );
}

export function createSavedSchemaRecord(
  schemaText: string,
  meta: SavedSchemaMeta,
) {
  const currentDate = new Date().toISOString();

  return {
    // Reusing the caller-supplied id/createdAt turns a resave of the same
    // record into an update instead of a fresh row - without this, every
    // click of "Save schema" on a document already in the list created a
    // duplicate entry, silently pushing older, genuinely different saved
    // schemas out of the capped MAX_SAVED_SCHEMAS list.
    createdAt: meta.createdAt || currentDate,
    format: meta.format,
    id: meta.id || createId(),
    schemaText,
    title: meta.title,
    updatedAt: currentDate,
    version: meta.version,
  };
}

export function readSavedSchema() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearSavedSchema() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SAVED_SCHEMA_STORAGE_KEY);
  } catch {
    // Signing out and resetting the editor remain usable without storage.
  }
}

export function saveSchema(schemaText: string, meta?: SavedSchemaMeta) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    window.localStorage.setItem(SAVED_SCHEMA_STORAGE_KEY, schemaText);
  } catch {
    return null;
  }

  if (!meta) {
    return null;
  }

  return createSavedSchemaRecord(schemaText, meta);
}

export function stageSavedSchemaForEditor(schema: SavedSchemaRecord) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      SCHEMA_EDITOR_HANDOFF_STORAGE_KEY,
      JSON.stringify(schema),
    );
    return true;
  } catch {
    return false;
  }
}

export function takeStagedSavedSchemaForEditor() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedSchema = window.sessionStorage.getItem(
      SCHEMA_EDITOR_HANDOFF_STORAGE_KEY,
    );

    window.sessionStorage.removeItem(SCHEMA_EDITOR_HANDOFF_STORAGE_KEY);

    if (!storedSchema) {
      return null;
    }

    const parsedSchema: unknown = JSON.parse(storedSchema);

    return isSavedSchemaRecord(parsedSchema) ? parsedSchema : null;
  } catch {
    return null;
  }
}

export async function readServerSavedSchemas() {
  try {
    const response = await fetch("/api/schemas");

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      schemas?: unknown;
    };

    return Array.isArray(data.schemas)
      ? data.schemas.filter(isSavedSchemaRecord)
      : [];
  } catch {
    return [];
  }
}

export async function saveServerSchemaRecord(record: SavedSchemaRecord) {
  try {
    await fetch("/api/schemas", {
      body: JSON.stringify(record),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    // Local schema storage is still available if the server sync fails.
  }
}

export async function deleteServerSchemaRecord(id: string) {
  try {
    const response = await fetch(`/api/schemas/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function renameServerSchemaRecord(id: string, title: string) {
  try {
    const response = await fetch(`/api/schemas/${encodeURIComponent(id)}`, {
      body: JSON.stringify({ title }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { schemas?: unknown };
    const schemas = Array.isArray(data.schemas)
      ? data.schemas.filter(isSavedSchemaRecord)
      : [];

    return schemas.find((schema) => schema.id === id) ?? null;
  } catch {
    return null;
  }
}

export async function deleteAllServerSchemaRecords() {
  try {
    const response = await fetch("/api/schemas", {
      method: "DELETE",
    });

    return response.ok;
  } catch {
    return false;
  }
}
