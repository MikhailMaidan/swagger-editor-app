const DEFAULT_INDENT_SIZE = 2;
const MAX_INDENT_SIZE = 8;

export type TextIndentationResult = {
  selectionEnd: number;
  selectionStart: number;
  value: string;
};

function clampOffset(value: string, offset: number) {
  return Math.min(Math.max(offset, 0), value.length);
}

function getSelectedLineStarts(
  value: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const newlinePattern = /\r\n|\r|\n/g;
  let firstLineStart = 0;
  let newline = newlinePattern.exec(value);

  while (newline && newline.index + newline[0].length <= selectionStart) {
    firstLineStart = newline.index + newline[0].length;
    newline = newlinePattern.exec(value);
  }

  const lineStarts = [firstLineStart];

  while (newline) {
    const nextLineStart = newline.index + newline[0].length;

    if (nextLineStart >= selectionEnd) {
      break;
    }

    lineStarts.push(nextLineStart);
    newline = newlinePattern.exec(value);
  }

  return lineStarts;
}

function getIndent(indentSize: number) {
  const width = Number.isFinite(indentSize)
    ? Math.min(Math.max(Math.trunc(indentSize), 1), MAX_INDENT_SIZE)
    : DEFAULT_INDENT_SIZE;

  return " ".repeat(width);
}

function getIndentLength(value: string, lineStart: number, indent: string) {
  if (value[lineStart] === "\t") {
    return 1;
  }

  let length = 0;

  while (length < indent.length && value[lineStart + length] === " ") {
    length += 1;
  }

  return length;
}

function adjustOffsetForRemovals(
  offset: number,
  removals: Array<{ length: number; start: number }>,
) {
  return removals.reduce(
    (adjustedOffset, removal) =>
      adjustedOffset -
      Math.min(removal.length, Math.max(0, offset - removal.start)),
    offset,
  );
}

export function changeTextIndentation(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent = false,
  indentSize = DEFAULT_INDENT_SIZE,
): TextIndentationResult {
  const indent = getIndent(indentSize);
  const boundedStart = clampOffset(
    value,
    Math.min(selectionStart, selectionEnd),
  );
  const boundedEnd = clampOffset(value, Math.max(selectionStart, selectionEnd));

  if (!outdent && boundedStart === boundedEnd) {
    return {
      selectionEnd: boundedStart + indent.length,
      selectionStart: boundedStart + indent.length,
      value: value.slice(0, boundedStart) + indent + value.slice(boundedStart),
    };
  }

  const lineStarts = getSelectedLineStarts(value, boundedStart, boundedEnd);

  if (!outdent) {
    let nextValue = value;

    for (const lineStart of lineStarts.toReversed()) {
      nextValue =
        nextValue.slice(0, lineStart) + indent + nextValue.slice(lineStart);
    }

    return {
      selectionEnd: boundedEnd + lineStarts.length * indent.length,
      selectionStart: boundedStart + indent.length,
      value: nextValue,
    };
  }

  const removals = lineStarts
    .map((lineStart) => ({
      length: getIndentLength(value, lineStart, indent),
      start: lineStart,
    }))
    .filter((removal) => removal.length > 0);
  let nextValue = value;

  for (const removal of removals.toReversed()) {
    nextValue =
      nextValue.slice(0, removal.start) +
      nextValue.slice(removal.start + removal.length);
  }

  return {
    selectionEnd: adjustOffsetForRemovals(boundedEnd, removals),
    selectionStart: adjustOffsetForRemovals(boundedStart, removals),
    value: nextValue,
  };
}
