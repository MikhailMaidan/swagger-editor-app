export const SCHEMA_DRAFT_STORAGE_KEY = "rsswagger-schema-draft";

export function readSchemaDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSchemaDraft(schemaText: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(SCHEMA_DRAFT_STORAGE_KEY, schemaText);
    return true;
  } catch {
    // The editor remains usable when storage is unavailable or full.
    return false;
  }
}

export function clearSchemaDraft() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SCHEMA_DRAFT_STORAGE_KEY);
  } catch {
    // Clearing auth or saving a schema must not fail with storage errors.
  }
}
