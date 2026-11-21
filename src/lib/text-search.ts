export type TextMatch = {
  end: number;
  start: number;
};

export type TextSearchDirection = "next" | "previous";

// Combining accents and vowel signs belong to their surrounding word.
const WORD_CHARACTER_CLASS = "[\\p{L}\\p{M}\\p{N}_]";

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const escapedQuery = escapeRegularExpression(query);
  // Reject partial words before they can consume a later valid match.
  const pattern = new RegExp(
    wholeWord
      ? `(?<!${WORD_CHARACTER_CLASS})${escapedQuery}(?!${WORD_CHARACTER_CLASS})`
      : escapedQuery,
    caseSensitive ? "gu" : "giu",
  );

  return Array.from(value.matchAll(pattern), (match) => ({
    end: match.index + match[0].length,
    start: match.index,
  }));
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
  let low = 0;
  let high = matches.length;

  // Matches are nonoverlapping and ordered by source position.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const beforeBoundary =
      direction === "next"
        ? matches[middle].start < end
        : matches[middle].end <= start;
    if (beforeBoundary) low = middle + 1;
    else high = middle;
  }

  if (direction === "next") return low === matches.length ? 0 : low;
  return low === 0 ? matches.length - 1 : low - 1;
}
