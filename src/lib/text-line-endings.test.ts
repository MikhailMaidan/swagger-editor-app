import { describe, expect, it } from "vitest";
import {
  detectTextLineEnding,
  normalizeTextLineEndings,
} from "./text-line-endings";

describe("text line ending helpers", () => {
  it("detects homogeneous, mixed, and single-line documents", () => {
    expect(detectTextLineEnding("single line")).toBe("none");
    expect(detectTextLineEnding("one\ntwo\n")).toBe("lf");
    expect(detectTextLineEnding("one\r\ntwo\r\n")).toBe("crlf");
    expect(detectTextLineEnding("one\rtwo\r")).toBe("cr");
    expect(detectTextLineEnding("one\r\ntwo\nthree\r")).toBe("mixed");
  });

  it("normalizes every newline without changing other text", () => {
    const mixed = "one\r\ntwo\nthree\rfour";

    expect(normalizeTextLineEndings(mixed, "lf")).toBe("one\ntwo\nthree\nfour");
    expect(normalizeTextLineEndings(mixed, "crlf")).toBe(
      "one\r\ntwo\r\nthree\r\nfour",
    );
    expect(normalizeTextLineEndings("single line", "crlf")).toBe("single line");
  });
});
