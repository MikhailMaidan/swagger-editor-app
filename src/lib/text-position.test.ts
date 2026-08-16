import { describe, expect, it } from "vitest";
import { getTextPosition } from "./text-position";

describe("text position helpers", () => {
  it("calculates one-based line and column positions", () => {
    expect(getTextPosition("first\nsecond\nthird", 8)).toEqual({
      column: 3,
      line: 2,
    });
  });

  it("supports mixed newlines and clamps invalid offsets", () => {
    expect(getTextPosition("one\r\ntwo\rthree", 10)).toEqual({
      column: 2,
      line: 3,
    });
    expect(getTextPosition("text", -10)).toEqual({ column: 1, line: 1 });
    expect(getTextPosition("text", 100)).toEqual({ column: 5, line: 1 });
  });
});
