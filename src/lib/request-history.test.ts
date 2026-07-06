import { describe, expect, it } from "vitest";
import {
  clearRequestHistory,
  readRequestHistory,
  REQUEST_HISTORY_STORAGE_KEY,
  saveRequestHistoryRecord,
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
