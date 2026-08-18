import { getByteSize } from "./text-encoding";

export type TextStats = {
  byteSize: number;
  lineCount: number;
};

export function getTextStats(value: string): TextStats {
  let lineCount = 1;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\n") {
      lineCount += 1;
    } else if (value[index] === "\r" && value[index + 1] !== "\n") {
      lineCount += 1;
    }
  }

  return {
    byteSize: getByteSize(value),
    lineCount,
  };
}
