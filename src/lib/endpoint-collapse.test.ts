import { describe, expect, it, vi } from "vitest";
import {
  ENDPOINT_COLLAPSE_STORAGE_KEY,
  readCollapsedEndpointKeys,
  saveCollapsedEndpointKeys,
  setEndpointKeysCollapsed,
  toggleCollapsedEndpointKey,
} from "./endpoint-collapse";

describe("endpoint collapse preferences", () => {
  it("toggles normalized endpoint keys", () => {
    const collapsed = toggleCollapsedEndpointKey([], " get ", " /users/{id} ");

    expect(collapsed).toEqual(["GET /users/{id}"]);
    expect(toggleCollapsedEndpointKey(collapsed, "GET", "/users/{id}")).toEqual(
      [],
    );
  });

  it("collapses or expands a selected set without affecting other keys", () => {
    const collapsed = setEndpointKeysCollapsed(
      ["DELETE /legacy"],
      ["GET /users", "POST /users", "GET /users"],
      true,
    );

    expect(collapsed).toEqual(["DELETE /legacy", "GET /users", "POST /users"]);
    expect(
      setEndpointKeysCollapsed(collapsed, ["GET /users", "POST /users"], false),
    ).toEqual(["DELETE /legacy"]);
  });

  it("persists sanitized keys and clears storage when all are expanded", () => {
    expect(
      saveCollapsedEndpointKeys([
        "GET /users",
        "GET /users",
        "invalid",
        "POST /users",
      ]),
    ).toBe(true);
    expect(readCollapsedEndpointKeys()).toEqual(["GET /users", "POST /users"]);

    expect(saveCollapsedEndpointKeys([])).toBe(true);
    expect(
      window.localStorage.getItem(ENDPOINT_COLLAPSE_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores malformed storage and reports blocked writes", () => {
    window.localStorage.setItem(ENDPOINT_COLLAPSE_STORAGE_KEY, "not-json");
    expect(readCollapsedEndpointKeys()).toEqual([]);

    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "SecurityError");
      });

    try {
      expect(saveCollapsedEndpointKeys(["GET /users"])).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
