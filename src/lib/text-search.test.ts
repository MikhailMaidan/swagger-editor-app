import { describe, expect, it } from "vitest";
import { findTextMatches, getNextTextMatchIndex } from "./text-search";

describe("text search helpers", () => {
  it("finds case-insensitive literal matches", () => {
    expect(findTextMatches("Alpha . alpha ALPHA.", "alpha")).toEqual([
      { end: 5, start: 0 },
      { end: 13, start: 8 },
      { end: 19, start: 14 },
    ]);
    expect(findTextMatches("a.b a-b", "a.b")).toEqual([{ end: 3, start: 0 }]);
    expect(findTextMatches("Alpha . alpha ALPHA.", "alpha", true)).toEqual([
      { end: 13, start: 8 },
    ]);
    expect(findTextMatches("anything", "")).toEqual([]);
  });

  it("matches whole words across ASCII and Unicode text", () => {
    expect(
      findTextMatches("cat cats cat-id _cat cat2 cat", "cat", false, true),
    ).toEqual([
      { end: 3, start: 0 },
      { end: 12, start: 9 },
      { end: 29, start: 26 },
    ]);
    expect(findTextMatches("тест тесты предтест", "тест", false, true)).toEqual(
      [{ end: 4, start: 0 }],
    );
  });

  it("navigates from selections and wraps in both directions", () => {
    const matches = findTextMatches("one two one", "one");

    expect(getNextTextMatchIndex(matches, 0, 0, "next")).toBe(0);
    expect(getNextTextMatchIndex(matches, 0, 3, "next")).toBe(1);
    expect(getNextTextMatchIndex(matches, 8, 11, "next")).toBe(0);
    expect(getNextTextMatchIndex(matches, 8, 11, "previous")).toBe(0);
    expect(getNextTextMatchIndex(matches, 0, 3, "previous")).toBe(1);
    expect(getNextTextMatchIndex([], 0, 0, "next")).toBe(-1);
  });
});
