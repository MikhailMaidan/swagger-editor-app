export const EDITOR_WORD_WRAP_STORAGE_KEY = "rsswagger-editor-word-wrap";

export function readEditorWordWrapPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(EDITOR_WORD_WRAP_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveEditorWordWrapPreference(enabled: boolean): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (enabled) {
      window.localStorage.setItem(EDITOR_WORD_WRAP_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(EDITOR_WORD_WRAP_STORAGE_KEY);
    }

    return true;
  } catch {
    // Word wrapping still works for the current session when storage is blocked.
    return false;
  }
}
