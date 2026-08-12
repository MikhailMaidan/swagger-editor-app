import { describe, expect, it } from "vitest";
import { decodeUtf8, encodeUtf8, getByteSize } from "./text-encoding";

describe("text-encoding helpers", () => {
  it("measures the UTF-8 byte length of a string", () => {
    expect(getByteSize("")).toBe(0);
    expect(getByteSize("hello")).toBe(5);
  });

  it("counts multi-byte characters by their actual UTF-8 byte length, not character count", () => {
    // "é" is 1 character but 2 UTF-8 bytes; a naive `.length` check would say 1.
    expect(getByteSize("é")).toBe(2);
    expect("é".length).toBe(1);
  });

  it("encodes a string to its raw UTF-8 bytes", () => {
    const bytes = encodeUtf8("AB");

    expect(Array.from(bytes)).toEqual([65, 66]);
  });

  it("round-trips encode/decode, including multi-byte characters", () => {
    expect(decodeUtf8(encodeUtf8("Héllo"))).toBe("Héllo");
  });
});
