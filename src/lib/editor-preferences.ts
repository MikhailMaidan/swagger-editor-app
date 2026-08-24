export const EDITOR_WORD_WRAP_STORAGE_KEY = "rsswagger-editor-word-wrap";
export const EDITOR_FONT_SIZE_STORAGE_KEY = "rsswagger-editor-font-size";
export const EDITOR_INDENT_SIZE_STORAGE_KEY = "rsswagger-editor-indent-size";
export const EDITOR_SCHEMA_SEARCH_MATCH_CASE_STORAGE_KEY =
  "rsswagger-editor-schema-search-match-case";

export type EditorFontSize = "large" | "medium" | "small";
export type EditorIndentSize = 2 | 4;

export const DEFAULT_EDITOR_FONT_SIZE: EditorFontSize = "medium";
export const DEFAULT_EDITOR_INDENT_SIZE: EditorIndentSize = 2;

export function readEditorSearchMatchCasePreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.localStorage.getItem(
        EDITOR_SCHEMA_SEARCH_MATCH_CASE_STORAGE_KEY,
      ) === "true"
    );
  } catch {
    return false;
  }
}

export function saveEditorSearchMatchCasePreference(enabled: boolean): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (enabled) {
      window.localStorage.setItem(
        EDITOR_SCHEMA_SEARCH_MATCH_CASE_STORAGE_KEY,
        "true",
      );
    } else {
      window.localStorage.removeItem(
        EDITOR_SCHEMA_SEARCH_MATCH_CASE_STORAGE_KEY,
      );
    }

    return true;
  } catch {
    // Search still works for the current session when storage is blocked.
    return false;
  }
}

export function readEditorIndentSizePreference(): EditorIndentSize {
  if (typeof window === "undefined") {
    return DEFAULT_EDITOR_INDENT_SIZE;
  }

  try {
    return window.localStorage.getItem(EDITOR_INDENT_SIZE_STORAGE_KEY) === "4"
      ? 4
      : DEFAULT_EDITOR_INDENT_SIZE;
  } catch {
    return DEFAULT_EDITOR_INDENT_SIZE;
  }
}

export function saveEditorIndentSizePreference(
  indentSize: EditorIndentSize,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (indentSize === DEFAULT_EDITOR_INDENT_SIZE) {
      window.localStorage.removeItem(EDITOR_INDENT_SIZE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        EDITOR_INDENT_SIZE_STORAGE_KEY,
        String(indentSize),
      );
    }

    return true;
  } catch {
    // Indentation still works for the current session when storage is blocked.
    return false;
  }
}

function isEditorFontSize(value: string | null): value is EditorFontSize {
  return value === "small" || value === "medium" || value === "large";
}

export function readEditorFontSizePreference(): EditorFontSize {
  if (typeof window === "undefined") {
    return DEFAULT_EDITOR_FONT_SIZE;
  }

  try {
    const storedValue = window.localStorage.getItem(
      EDITOR_FONT_SIZE_STORAGE_KEY,
    );

    return isEditorFontSize(storedValue)
      ? storedValue
      : DEFAULT_EDITOR_FONT_SIZE;
  } catch {
    return DEFAULT_EDITOR_FONT_SIZE;
  }
}

export function saveEditorFontSizePreference(
  fontSize: EditorFontSize,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (fontSize === DEFAULT_EDITOR_FONT_SIZE) {
      window.localStorage.removeItem(EDITOR_FONT_SIZE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, fontSize);
    }

    return true;
  } catch {
    // Font sizing still works for the current session when storage is blocked.
    return false;
  }
}

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
