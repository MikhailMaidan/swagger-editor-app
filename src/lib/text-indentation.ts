const INDENT = "  ";

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
  const firstLineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const effectiveEnd =
    selectionEnd > firstLineStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const lineStarts = [firstLineStart];
  let newlineIndex = value.indexOf("\n", firstLineStart);

  while (newlineIndex !== -1 && newlineIndex < effectiveEnd) {
    lineStarts.push(newlineIndex + 1);
    newlineIndex = value.indexOf("\n", newlineIndex + 1);
  }

  return lineStarts;
}

function getIndentLength(value: string, lineStart: number) {
  if (value[lineStart] === "\t") {
    return 1;
  }

  if (value.startsWith(INDENT, lineStart)) {
    return INDENT.length;
  }

  return value[lineStart] === " " ? 1 : 0;
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
): TextIndentationResult {
  const boundedStart = clampOffset(
    value,
    Math.min(selectionStart, selectionEnd),
  );
  const boundedEnd = clampOffset(
    value,
    Math.max(selectionStart, selectionEnd),
  );

  if (!outdent && boundedStart === boundedEnd) {
    return {
      selectionEnd: boundedStart + INDENT.length,
      selectionStart: boundedStart + INDENT.length,
      value:
        value.slice(0, boundedStart) + INDENT + value.slice(boundedStart),
    };
  }

  const lineStarts = getSelectedLineStarts(value, boundedStart, boundedEnd);

  if (!outdent) {
    let nextValue = value;

    for (const lineStart of lineStarts.toReversed()) {
      nextValue =
        nextValue.slice(0, lineStart) + INDENT + nextValue.slice(lineStart);
    }

    return {
      selectionEnd: boundedEnd + lineStarts.length * INDENT.length,
      selectionStart: boundedStart + INDENT.length,
      value: nextValue,
    };
  }

  const removals = lineStarts
    .map((lineStart) => ({
      length: getIndentLength(value, lineStart),
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
