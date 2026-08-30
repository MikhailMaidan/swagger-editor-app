import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REQUEST_EXECUTION_MODE,
  REQUEST_EXECUTION_MODE_STORAGE_KEY,
  readRequestExecutionMode,
  saveRequestExecutionMode,
} from "./request-execution-mode";

describe("request execution mode preferences", () => {
  it("defaults to live and persists mock mode", () => {
    expect(readRequestExecutionMode()).toBe(DEFAULT_REQUEST_EXECUTION_MODE);
    expect(saveRequestExecutionMode("mock")).toBe(true);
    expect(readRequestExecutionMode()).toBe("mock");
    expect(
      window.localStorage.getItem(REQUEST_EXECUTION_MODE_STORAGE_KEY),
    ).toBe("mock");

    expect(saveRequestExecutionMode("live")).toBe(true);
    expect(readRequestExecutionMode()).toBe("live");
    expect(
      window.localStorage.getItem(REQUEST_EXECUTION_MODE_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores malformed values and tolerates blocked storage", () => {
    window.localStorage.setItem(REQUEST_EXECUTION_MODE_STORAGE_KEY, "offline");
    expect(readRequestExecutionMode()).toBe("live");

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
      expect(readRequestExecutionMode()).toBe("live");
      expect(saveRequestExecutionMode("mock")).toBe(false);
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });
});
