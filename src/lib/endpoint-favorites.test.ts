import { describe, expect, it, vi } from "vitest";
import {
  ENDPOINT_FAVORITES_STORAGE_KEY,
  getEndpointFavoriteKey,
  isEndpointFavorite,
  readEndpointFavorites,
  saveEndpointFavorites,
  toggleEndpointFavorite,
} from "./endpoint-favorites";

describe("endpoint favorites", () => {
  it("normalizes keys and toggles favorites without duplicates", () => {
    expect(getEndpointFavoriteKey(" get ", " /users/{id} ")).toBe(
      "GET /users/{id}",
    );

    const added = toggleEndpointFavorite([], "get", "/users/{id}");

    expect(added).toEqual(["GET /users/{id}"]);
    expect(isEndpointFavorite(added, "GET", "/users/{id}")).toBe(true);
    expect(toggleEndpointFavorite(added, "GET", "/users/{id}")).toEqual([]);
  });

  it("persists a sanitized collection and removes empty storage", () => {
    expect(
      saveEndpointFavorites([
        "GET /users",
        "GET /users",
        "invalid",
        "POST /users",
      ]),
    ).toBe(true);
    expect(
      JSON.parse(
        window.localStorage.getItem(ENDPOINT_FAVORITES_STORAGE_KEY) || "[]",
      ),
    ).toEqual(["GET /users", "POST /users"]);
    expect(readEndpointFavorites()).toEqual(["GET /users", "POST /users"]);

    expect(saveEndpointFavorites([])).toBe(true);
    expect(
      window.localStorage.getItem(ENDPOINT_FAVORITES_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores malformed or unsupported stored values", () => {
    window.localStorage.setItem(ENDPOINT_FAVORITES_STORAGE_KEY, "not-json");
    expect(readEndpointFavorites()).toEqual([]);

    window.localStorage.setItem(
      ENDPOINT_FAVORITES_STORAGE_KEY,
      JSON.stringify([null, 42, "", "PATCH /users", "PATCH /users"]),
    );
    expect(readEndpointFavorites()).toEqual(["PATCH /users"]);
  });

  it("returns failure instead of throwing when storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "SecurityError");
      });

    try {
      expect(saveEndpointFavorites(["GET /users"])).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
