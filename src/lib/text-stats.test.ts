import { describe, expect, it } from "vitest";
import { getTextStats } from "./text-stats";

describe("text statistics helpers", () => {
  it("treats an empty document as one empty line", () => {
    expect(getTextStats("")).toEqual({ byteSize: 0, lineCount: 1 });
  });

  it("counts CRLF, CR, and LF newlines without double-counting", () => {
    expect(getTextStats("one\r\ntwo\rthree\n")).toEqual({
      byteSize: 15,
      lineCount: 4,
    });
  });

  it("reports the encoded byte size of multibyte text", () => {
    expect(getTextStats("é\n")).toEqual({ byteSize: 3, lineCount: 2 });
  });
});
