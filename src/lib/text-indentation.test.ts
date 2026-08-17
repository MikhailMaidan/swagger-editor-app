import { describe, expect, it } from "vitest";
import { changeTextIndentation } from "./text-indentation";

describe("text indentation helpers", () => {
  it("inserts two spaces at a collapsed cursor", () => {
    expect(changeTextIndentation("name", 2, 2)).toEqual({
      selectionEnd: 4,
      selectionStart: 4,
      value: "na  me",
    });
  });

  it("indents every line touched by a selection", () => {
    const value = "root:\nchild:\nleaf:";

    expect(changeTextIndentation(value, 2, value.length)).toEqual({
      selectionEnd: value.length + 6,
      selectionStart: 4,
      value: "  root:\n  child:\n  leaf:",
    });
  });

  it("does not indent a trailing line when the selection ends at its start", () => {
    expect(changeTextIndentation("one\ntwo\nthree", 0, 4)).toEqual({
      selectionEnd: 6,
      selectionStart: 2,
      value: "  one\ntwo\nthree",
    });
  });

  it("outdents spaces and tabs while preserving the selected text", () => {
    const value = "  one\n second\n\tthird\nfour";
    const selectionEnd = value.indexOf("four");
    const result = changeTextIndentation(value, 0, selectionEnd, true);

    expect(result).toEqual({
      selectionEnd: selectionEnd - 4,
      selectionStart: 0,
      value: "one\nsecond\nthird\nfour",
    });
  });

  it("moves a cursor inside removed indentation to the line start", () => {
    expect(changeTextIndentation("  child", 1, 1, true)).toEqual({
      selectionEnd: 0,
      selectionStart: 0,
      value: "child",
    });
  });
});
