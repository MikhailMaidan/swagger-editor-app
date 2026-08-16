export type TextPosition = {
  column: number;
  line: number;
};

export function getTextPosition(value: string, offset: number): TextPosition {
  const boundedOffset = Math.min(Math.max(offset, 0), value.length);
  const lines = value.slice(0, boundedOffset).split(/\r\n|\r|\n/);

  return {
    column: (lines.at(-1)?.length || 0) + 1,
    line: lines.length,
  };
}
