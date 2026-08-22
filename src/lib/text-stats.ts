import { getByteSize } from "./text-encoding";

export type TextStats = {
  byteSize: number;
  characterCount: number;
  lineCount: number;
};

export function getTextStats(value: string): TextStats {
  let characterCount = 0;
  let lineCount = 1;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    characterCount += 1;

    if (value[index] === "\n") {
      lineCount += 1;
    } else if (value[index] === "\r" && value[index + 1] !== "\n") {
      lineCount += 1;
    }

    if (codePoint !== undefined && codePoint > 0xffff) {
      index += 1;
    }
  }

  return {
    byteSize: getByteSize(value),
    characterCount,
    lineCount,
  };
}
