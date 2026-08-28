import { describe, expect, it, vi } from "vitest";
import {
  createRequestPreset,
  getRequestPresetsForEndpoint,
  readRequestPresets,
  removeRequestPreset,
  REQUEST_PRESETS_STORAGE_KEY,
  saveRequestPresets,
  updateRequestPreset,
  upsertRequestPreset,
  type RequestPresetDraft,
} from "./request-presets";

const draft: RequestPresetDraft = {
  method: "GET",
  name: "Happy path",
  parameterValues: {
    "header:X-Trace-Id": "trace-1",
    "path:id": "42",
  },
  path: "/users/{id}",
  requestBodies: { "application/json": '{"name":"Alex"}' },
  requestContentType: "application/json",
  responseStatus: "200",
  timeoutMs: 30_000,
};

describe("request presets", () => {
  it("creates and updates a normalized request snapshot", () => {
    const preset = createRequestPreset(
      { ...draft, method: " get ", name: " Happy path " },
      new Date("2026-08-28T08:00:00.000Z"),
    );
    const updated = updateRequestPreset(
      preset,
      { ...draft, name: "Updated", timeoutMs: 5_000 },
      new Date("2026-08-28T09:00:00.000Z"),
    );

    expect(preset).toMatchObject({
      createdAt: "2026-08-28T08:00:00.000Z",
      method: "GET",
      name: "Happy path",
    });
    expect(updated).toMatchObject({
      createdAt: preset.createdAt,
      id: preset.id,
      name: "Updated",
      timeoutMs: 5_000,
      updatedAt: "2026-08-28T09:00:00.000Z",
    });
  });

  it("upserts, scopes, sorts, and removes endpoint presets", () => {
    const oldPreset = createRequestPreset(
      draft,
      new Date("2026-08-28T08:00:00.000Z"),
    );
    const postPreset = createRequestPreset(
      { ...draft, method: "POST", name: "Update user" },
      new Date("2026-08-28T09:00:00.000Z"),
    );
    const updatedPreset = updateRequestPreset(
      oldPreset,
      { ...draft, name: "Latest GET" },
      new Date("2026-08-28T10:00:00.000Z"),
    );
    const presets = upsertRequestPreset(
      upsertRequestPreset([oldPreset], postPreset),
      updatedPreset,
    );

    expect(presets).toHaveLength(2);
    expect(
      getRequestPresetsForEndpoint(presets, "get", "/users/{id}").map(
        (preset) => preset.name,
      ),
    ).toEqual(["Latest GET"]);
    expect(removeRequestPreset(presets, updatedPreset.id)).toEqual([
      postPreset,
    ]);
  });

  it("persists and restores versioned presets", () => {
    const preset = createRequestPreset(
      draft,
      new Date("2026-08-28T08:00:00.000Z"),
    );

    expect(saveRequestPresets([preset])).toBe(true);
    expect(readRequestPresets()).toEqual([preset]);
    expect(
      JSON.parse(
        window.localStorage.getItem(REQUEST_PRESETS_STORAGE_KEY) || "{}",
      ),
    ).toMatchObject({ storageVersion: 1 });

    expect(saveRequestPresets([])).toBe(true);
    expect(window.localStorage.getItem(REQUEST_PRESETS_STORAGE_KEY)).toBeNull();
  });

  it("sanitizes malformed storage and unsupported timeout values", () => {
    window.localStorage.setItem(
      REQUEST_PRESETS_STORAGE_KEY,
      JSON.stringify({
        presets: [
          null,
          { name: "Incomplete" },
          {
            ...createRequestPreset(draft, new Date("2026-08-28T08:00:00.000Z")),
            parameterValues: { "path:id": "42", invalid: 12 },
            timeoutMs: 99_000,
          },
        ],
        storageVersion: 1,
      }),
    );

    expect(readRequestPresets()).toMatchObject([
      {
        parameterValues: { "path:id": "42" },
        timeoutMs: 10_000,
      },
    ]);

    window.localStorage.setItem(
      REQUEST_PRESETS_STORAGE_KEY,
      JSON.stringify({ presets: [], storageVersion: 0 }),
    );
    expect(readRequestPresets()).toEqual([]);
  });

  it("returns failure instead of throwing when storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "SecurityError");
      });

    try {
      expect(
        saveRequestPresets([
          createRequestPreset(draft, new Date("2026-08-28T08:00:00.000Z")),
        ]),
      ).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
