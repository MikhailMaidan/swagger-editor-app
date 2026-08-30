import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MOCK_RESPONSE_DELAY_MS,
  DEFAULT_REQUEST_EXECUTION_MODE,
  MOCK_RESPONSE_DELAY_STORAGE_KEY,
  REQUEST_EXECUTION_MODE_STORAGE_KEY,
  readMockResponseDelay,
  readRequestExecutionMode,
  saveMockResponseDelay,
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

  it("persists only supported mock delays and removes the instant default", () => {
    expect(readMockResponseDelay()).toBe(DEFAULT_MOCK_RESPONSE_DELAY_MS);
    expect(saveMockResponseDelay(2_000)).toBe(true);
    expect(readMockResponseDelay()).toBe(2_000);
    expect(window.localStorage.getItem(MOCK_RESPONSE_DELAY_STORAGE_KEY)).toBe(
      "2000",
    );

    expect(saveMockResponseDelay(0)).toBe(true);
    expect(
      window.localStorage.getItem(MOCK_RESPONSE_DELAY_STORAGE_KEY),
    ).toBeNull();

    window.localStorage.setItem(MOCK_RESPONSE_DELAY_STORAGE_KEY, "750");
    expect(readMockResponseDelay()).toBe(0);
  });
});
