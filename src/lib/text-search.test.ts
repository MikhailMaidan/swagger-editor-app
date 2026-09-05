import { describe, expect, it } from "vitest";
import {
  findTextMatches,
  getNextTextMatchIndex,
  getSearchQueryFromSelection,
} from "./text-search";

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

  it.each([
    ["cafe\u0301 cafe", "cafe"],
    ["и\u0306 и", "и"],
    ["का क", "क"],
  ])(
    "does not split combining marks from a whole-word match in %s",
    (value, query) => {
      const start = value.lastIndexOf(query);
      expect(findTextMatches(value, query, false, true)).toEqual([
        { start, end: start + query.length },
      ]);
      expect(findTextMatches(value, query)).toHaveLength(2);
    },
  );

  it("rejects whole-word matches immediately after a combining mark", () => {
    expect(findTextMatches("a\u0301cat cat", "cat", false, true)).toEqual([
      { start: 6, end: 9 },
    ]);
  });

  it("matches a complete accented word and preserves source offsets", () => {
    const query = "cafe\u0301";
    const value = `${query} ${query}ine (${query})`;
    expect(findTextMatches(value, query, true, true)).toEqual([
      { start: 0, end: 5 },
      { start: 16, end: 21 },
    ]);
  });

  it("creates search queries from single-line selections", () => {
    expect(getSearchQueryFromSelection("Alpha beta", 0, 5)).toBe("Alpha");
    expect(getSearchQueryFromSelection("Alpha beta", 10, 6)).toBe("beta");
    expect(getSearchQueryFromSelection("Alpha beta", -5, 50)).toBe(
      "Alpha beta",
    );
    expect(getSearchQueryFromSelection("Alpha beta", 3, 3)).toBeNull();
    expect(getSearchQueryFromSelection("Alpha\nbeta", 0, 10)).toBeNull();
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
