import { describe, expect, it, vi } from "vitest";
import {
  clearRequestHistory,
  deleteAllServerHistory,
  deleteServerHistoryRecord,
  mergeRequestHistory,
  parseRequestHistory,
  readRequestHistory,
  removeRequestHistoryRecord,
  REQUEST_HISTORY_STORAGE_KEY,
  saveRequestHistoryRecord,
  saveServerRequestHistoryRecord,
  sortRequestHistory,
} from "./request-history";
import type { RequestHistoryRecord } from "./request-history";

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

  it("normalizes nonnumeric statuses before saving history", () => {
    const record = saveRequestHistoryRecord({
      durationMs: 8,
      method: "GET",
      path: "/default-response",
      status: Number.NaN,
      summary: "Default response",
    });

    expect(record?.status).toBe(0);
    expect(readRequestHistory()[0]?.status).toBe(0);
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
      {
        ...oldRecord,
        errorDetails: null,
        requestSize: 0,
        responseSize: 0,
        url: "/old",
      },
    ]);
    const oldHistoryRecord: RequestHistoryRecord = {
      ...oldRecord,
      errorDetails: null,
      requestSize: 0,
      responseSize: 0,
      url: oldRecord.path,
    };
    const newHistoryRecord: RequestHistoryRecord = {
      ...newRecord,
      errorDetails: null,
      requestSize: 0,
      responseSize: 0,
      url: newRecord.path,
    };

    expect(mergeRequestHistory([oldHistoryRecord, newHistoryRecord])).toEqual([
      newHistoryRecord,
      oldHistoryRecord,
    ]);
  });

  it("sorts history by age, duration, or failures without mutating it", () => {
    const records: RequestHistoryRecord[] = [
      {
        createdAt: "2026-07-06T10:00:00.000Z",
        durationMs: 80,
        errorDetails: null,
        id: "newest",
        method: "GET",
        path: "/newest",
        requestSize: 0,
        responseSize: 0,
        status: 200,
        summary: "Newest",
        url: "/newest",
      },
      {
        createdAt: "2026-07-06T09:00:00.000Z",
        durationMs: 30,
        errorDetails: "Server error",
        id: "failed",
        method: "POST",
        path: "/failed",
        requestSize: 0,
        responseSize: 0,
        status: 500,
        summary: "Failed",
        url: "/failed",
      },
      {
        createdAt: "2026-07-06T08:00:00.000Z",
        durationMs: 120,
        errorDetails: null,
        id: "oldest",
        method: "GET",
        path: "/oldest",
        requestSize: 0,
        responseSize: 0,
        status: 200,
        summary: "Oldest",
        url: "/oldest",
      },
    ];

    expect(sortRequestHistory(records).map((record) => record.id)).toEqual([
      "newest",
      "failed",
      "oldest",
    ]);
    expect(
      sortRequestHistory(records, "oldest").map((record) => record.id),
    ).toEqual(["oldest", "failed", "newest"]);
    expect(
      sortRequestHistory(records, "slowest").map((record) => record.id),
    ).toEqual(["oldest", "newest", "failed"]);
    expect(
      sortRequestHistory(records, "fastest").map((record) => record.id),
    ).toEqual(["failed", "newest", "oldest"]);
    expect(
      sortRequestHistory(records, "failures").map((record) => record.id),
    ).toEqual(["failed", "newest", "oldest"]);
    const invalidDurationRecord = {
      ...records[0],
      durationMs: Number.NaN,
      id: "invalid-duration",
    };

    expect(
      sortRequestHistory([...records, invalidDurationRecord], "fastest").at(-1)
        ?.id,
    ).toBe("invalid-duration");
    expect(
      sortRequestHistory([...records, invalidDurationRecord], "slowest").at(-1)
        ?.id,
    ).toBe("invalid-duration");
    expect(records.map((record) => record.id)).toEqual([
      "newest",
      "failed",
      "oldest",
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
        errorDetails: null,
        id: "server-sync",
        method: "GET",
        path: "/users",
        requestSize: 20,
        responseSize: 40,
        status: 200,
        summary: "List users",
        url: "https://api.example.com/users",
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

  it("does not throw when browser storage blocks history cleanup", () => {
    const removeItemSpy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    try {
      expect(() => clearRequestHistory()).not.toThrow();
    } finally {
      removeItemSpy.mockRestore();
    }
  });

  it("removes a single record from the local history without touching the rest", () => {
    const keptRecord = saveRequestHistoryRecord({
      durationMs: 12,
      method: "GET",
      path: "/users",
      status: 200,
      summary: "List users",
    });
    const removedRecord = saveRequestHistoryRecord({
      durationMs: 16,
      method: "POST",
      path: "/users",
      status: 201,
      summary: "Create user",
    });

    removeRequestHistoryRecord(removedRecord?.id ?? "");

    expect(readRequestHistory()).toEqual([keptRecord]);
  });

  it("deletes a record from the server history route", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    try {
      await expect(deleteServerHistoryRecord("server-record")).resolves.toBe(
        true,
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/history/server-record",
        expect.objectContaining({ method: "DELETE" }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports a failed server history deletion instead of throwing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network error"));

    try {
      await expect(deleteServerHistoryRecord("server-record")).resolves.toBe(
        false,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("clears all history on the server", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    try {
      await expect(deleteAllServerHistory()).resolves.toBe(true);

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/history",
        expect.objectContaining({ method: "DELETE" }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports a failed bulk history clear instead of throwing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network error"));

    try {
      await expect(deleteAllServerHistory()).resolves.toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
