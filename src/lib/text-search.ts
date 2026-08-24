export type TextMatch = {
  end: number;
  start: number;
};

export type TextSearchDirection = "next" | "previous";

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findTextMatches(value: string, query: string): TextMatch[] {
  if (!query) {
    return [];
  }

  const pattern = new RegExp(escapeRegularExpression(query), "giu");

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
