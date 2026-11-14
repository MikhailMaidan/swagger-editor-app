export type TextPosition = {
  column: number;
  line: number;
};

export function getTextOffset(value: string, position: TextPosition): number {
  const targetLine = Math.max(Math.floor(position.line) || 1, 1);
  const targetColumn = Math.max(Math.floor(position.column) || 1, 1);
  const newlinePattern = /\r\n|\r|\n/g;
  let lineStart = 0;

  for (let line = 1; line < targetLine; line += 1) {
    const newline = newlinePattern.exec(value);

    if (!newline) {
      return value.length;
    }

    lineStart = newline.index + newline[0].length;
  }

  const nextNewline = newlinePattern.exec(value);
  const lineEnd = nextNewline?.index ?? value.length;

  return Math.min(lineStart + targetColumn - 1, lineEnd);
}

export function getTextPosition(value: string, offset: number): TextPosition {
  const boundedOffset = Math.min(Math.max(offset, 0), value.length);
  const prefix = value.slice(0, boundedOffset);
  const newlinePattern = /\r\n|\r|\n/g;
  let line = 1;
  let lineStart = 0;
  let newline: RegExpExecArray | null;

  while ((newline = newlinePattern.exec(prefix)) !== null) {
    line += 1;
    lineStart = newline.index + newline[0].length;
  }

  return {
    column: prefix.length - lineStart + 1,
    line,
  };
}
