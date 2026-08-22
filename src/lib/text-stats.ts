import { getByteSize } from "./text-encoding";

export type TextStats = {
  byteSize: number;
  characterCount: number;
  lineCount: number;
};

export function getSelectedCharacterCount(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): number {
  const boundedStart = Math.min(
    Math.max(
      Math.trunc(Number.isFinite(selectionStart) ? selectionStart : 0),
      0,
    ),
    value.length,
  );
  const boundedEnd = Math.min(
    Math.max(Math.trunc(Number.isFinite(selectionEnd) ? selectionEnd : 0), 0),
    value.length,
  );
  const start = Math.min(boundedStart, boundedEnd);
  const end = Math.max(boundedStart, boundedEnd);
  let characterCount = 0;

  for (let index = start; index < end; index += 1) {
    const codePoint = value.codePointAt(index);
    characterCount += 1;

    if (codePoint !== undefined && codePoint > 0xffff && index + 1 < end) {
      index += 1;
    }
  }

  return characterCount;
}

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
