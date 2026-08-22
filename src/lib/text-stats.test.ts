import { describe, expect, it } from "vitest";
import { getTextStats } from "./text-stats";

describe("text statistics helpers", () => {
  it("treats an empty document as one empty line", () => {
    expect(getTextStats("")).toEqual({
      byteSize: 0,
      characterCount: 0,
      lineCount: 1,
    });
  });

  it("counts CRLF, CR, and LF newlines without double-counting", () => {
    expect(getTextStats("one\r\ntwo\rthree\n")).toEqual({
      byteSize: 15,
      characterCount: 15,
      lineCount: 4,
    });
  });

  it("counts Unicode code points separately from encoded bytes", () => {
    expect(getTextStats("é😀\n")).toEqual({
      byteSize: 7,
      characterCount: 3,
      lineCount: 2,
    });
  });
});
