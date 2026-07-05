export const SAVED_SCHEMA_STORAGE_KEY = "rsswagger-saved-schema";

export function readSavedSchema() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY);
}

export function saveSchema(schemaText: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SAVED_SCHEMA_STORAGE_KEY, schemaText);
}
