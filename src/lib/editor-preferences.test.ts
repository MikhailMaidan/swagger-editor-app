import { describe, expect, it, vi } from "vitest";
import {
  EDITOR_WORD_WRAP_STORAGE_KEY,
  readEditorWordWrapPreference,
  saveEditorWordWrapPreference,
} from "./editor-preferences";

describe("editor preferences", () => {
  it("persists and removes the word wrap preference", () => {
    expect(readEditorWordWrapPreference()).toBe(false);
    expect(saveEditorWordWrapPreference(true)).toBe(true);
    expect(readEditorWordWrapPreference()).toBe(true);
    expect(window.localStorage.getItem(EDITOR_WORD_WRAP_STORAGE_KEY)).toBe(
      "true",
    );

    expect(saveEditorWordWrapPreference(false)).toBe(true);
    expect(readEditorWordWrapPreference()).toBe(false);
    expect(
      window.localStorage.getItem(EDITOR_WORD_WRAP_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores malformed stored values", () => {
    window.localStorage.setItem(EDITOR_WORD_WRAP_STORAGE_KEY, "yes");

    expect(readEditorWordWrapPreference()).toBe(false);
  });

  it("keeps the editor usable when storage is unavailable", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    try {
      expect(readEditorWordWrapPreference()).toBe(false);
      expect(saveEditorWordWrapPreference(true)).toBe(false);
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });
});
