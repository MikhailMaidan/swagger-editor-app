export const SAVED_SCHEMA_STORAGE_KEY = "rsswagger-saved-schema";
export const SERVER_SAVED_SCHEMAS_COOKIE = "rsswagger-server-schemas";
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
    createdAt: currentDate,
    format: meta.format,
    id: createId(),
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

  return window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY);
}

export function saveSchema(schemaText: string, meta?: SavedSchemaMeta) {
  if (typeof window === "undefined") {
    return null;
  }

  window.localStorage.setItem(SAVED_SCHEMA_STORAGE_KEY, schemaText);

  if (!meta) {
    return null;
  }

  return createSavedSchemaRecord(schemaText, meta);
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
