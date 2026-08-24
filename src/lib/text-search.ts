export type TextMatch = {
  end: number;
  start: number;
};

export type TextSearchDirection = "next" | "previous";

const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCodePointBefore(value: string, index: number) {
  if (index <= 0) {
    return "";
  }

  const trailingCodeUnit = value.charCodeAt(index - 1);
  if (trailingCodeUnit >= 0xdc00 && trailingCodeUnit <= 0xdfff && index >= 2) {
    const leadingCodeUnit = value.charCodeAt(index - 2);
    if (leadingCodeUnit >= 0xd800 && leadingCodeUnit <= 0xdbff) {
      return value.slice(index - 2, index);
    }
  }

  return value[index - 1];
}

function getCodePointAt(value: string, index: number) {
  const codePoint = value.codePointAt(index);
  return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
}

function hasWholeWordBoundaries(value: string, match: TextMatch) {
  return (
    !WORD_CHARACTER_PATTERN.test(getCodePointBefore(value, match.start)) &&
    !WORD_CHARACTER_PATTERN.test(getCodePointAt(value, match.end))
  );
}

export function getSearchQueryFromSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const start = Math.max(
    0,
    Math.min(
      Math.trunc(selectionStart),
      Math.trunc(selectionEnd),
      value.length,
    ),
  );
  const end = Math.max(
    0,
    Math.min(
      Math.max(Math.trunc(selectionStart), Math.trunc(selectionEnd)),
      value.length,
    ),
  );
  const query = value.slice(start, end);

  return query && !/[\r\n\u2028\u2029]/u.test(query) ? query : null;
}

export function findTextMatches(
  value: string,
  query: string,
  caseSensitive = false,
  wholeWord = false,
): TextMatch[] {
  if (!query) {
    return [];
  }

  const pattern = new RegExp(
    escapeRegularExpression(query),
    caseSensitive ? "gu" : "giu",
  );

  const matches = Array.from(value.matchAll(pattern), (match) => ({
    end: match.index + match[0].length,
    start: match.index,
  }));

  return wholeWord
    ? matches.filter((match) => hasWholeWordBoundaries(value, match))
    : matches;
}

export function getNextTextMatchIndex(
  matches: TextMatch[],
  selectionStart: number,
  selectionEnd: number,
  direction: TextSearchDirection,
): number {
  if (matches.length === 0) {
    return -1;
  }

  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);

  if (direction === "next") {
    const nextIndex = matches.findIndex((match) => match.start >= end);

    return nextIndex === -1 ? 0 : nextIndex;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (matches[index].end <= start) {
      return index;
    }
  }

  return matches.length - 1;
}
