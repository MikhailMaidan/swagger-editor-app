import { describe, expect, it, vi } from "vitest";
import {
  clearRequestHistory,
  mergeRequestHistory,
  parseRequestHistory,
  readRequestHistory,
  REQUEST_HISTORY_STORAGE_KEY,
  saveRequestHistoryRecord,
  saveServerRequestHistoryRecord,
} from "./request-history";

describe("request history storage", () => {
  it("saves newest request records first", () => {
    const firstRecord = saveRequestHistoryRecord({
      durationMs: 12,
      method: "GET",
      path: "/users",
      status: 200,
      summary: "List users",
    });
    const secondRecord = saveRequestHistoryRecord({
      durationMs: 16,
      method: "POST",
      path: "/users",
      status: 201,
      summary: "Create user",
    });

    expect(firstRecord?.id).toBeTruthy();
    expect(secondRecord?.createdAt).toBeTruthy();
    expect(readRequestHistory()).toMatchObject([
      { method: "POST", path: "/users", status: 201 },
      { method: "GET", path: "/users", status: 200 },
    ]);
  });

  it("returns an empty list for broken storage data", () => {
    window.localStorage.setItem(REQUEST_HISTORY_STORAGE_KEY, "not-json");

    expect(readRequestHistory()).toEqual([]);
  });

  it("parses and merges server history records safely", () => {
    const oldRecord = {
      createdAt: "2026-07-06T08:00:00.000Z",
      durationMs: 12,
      id: "old",
      method: "GET",
      path: "/old",
      status: 200,
      summary: "Old",
    };
    const newRecord = {
      ...oldRecord,
      createdAt: "2026-07-06T09:00:00.000Z",
      id: "new",
      path: "/new",
      summary: "New",
    };

    expect(parseRequestHistory(JSON.stringify([oldRecord, null]))).toEqual([
      oldRecord,
    ]);
    expect(mergeRequestHistory([oldRecord, newRecord])).toEqual([
      newRecord,
      oldRecord,
    ]);
  });

  it("syncs saved records to the server history route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
      }),
    );

    try {
      await saveServerRequestHistoryRecord({
        createdAt: "2026-07-06T09:00:00.000Z",
        durationMs: 12,
        id: "server-sync",
        method: "GET",
        path: "/users",
        status: 200,
        summary: "List users",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/history",
        expect.objectContaining({
          method: "POST",
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("clears request history", () => {
    saveRequestHistoryRecord({
      durationMs: 12,
      method: "GET",
      path: "/users",
      status: 200,
      summary: "List users",
    });

    clearRequestHistory();

    expect(readRequestHistory()).toEqual([]);
  });
});
