import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  EDITOR_FONT_SIZE_STORAGE_KEY,
  EDITOR_WORD_WRAP_STORAGE_KEY,
  readEditorFontSizePreference,
  readEditorWordWrapPreference,
  saveEditorFontSizePreference,
  saveEditorWordWrapPreference,
} from "./editor-preferences";

describe("editor preferences", () => {
  it("persists non-default font sizes and removes the default", () => {
    expect(readEditorFontSizePreference()).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(saveEditorFontSizePreference("large")).toBe(true);
    expect(readEditorFontSizePreference()).toBe("large");
    expect(window.localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY)).toBe(
      "large",
    );

    expect(saveEditorFontSizePreference(DEFAULT_EDITOR_FONT_SIZE)).toBe(true);
    expect(readEditorFontSizePreference()).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(
      window.localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY),
    ).toBeNull();
  });

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
    window.localStorage.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, "huge");

    expect(readEditorWordWrapPreference()).toBe(false);
    expect(readEditorFontSizePreference()).toBe(DEFAULT_EDITOR_FONT_SIZE);
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
      expect(readEditorFontSizePreference()).toBe(DEFAULT_EDITOR_FONT_SIZE);
      expect(saveEditorFontSizePreference("large")).toBe(false);
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });
});
