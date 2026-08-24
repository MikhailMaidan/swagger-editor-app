export type DetectedLineEnding = "cr" | "crlf" | "lf" | "mixed" | "none";

export type NormalizedLineEnding = "crlf" | "lf";

export function detectTextLineEnding(value: string): DetectedLineEnding {
  const newlinePattern = /\r\n|\r|\n/g;
  let detected: Exclude<DetectedLineEnding, "mixed" | "none"> | null = null;
  let match = newlinePattern.exec(value);

  while (match) {
    const current =
      match[0] === "\r\n" ? "crlf" : match[0] === "\r" ? "cr" : "lf";

    if (detected && detected !== current) {
      return "mixed";
    }

    detected = current;
    match = newlinePattern.exec(value);
  }

  return detected ?? "none";
}

export function normalizeTextLineEndings(
  value: string,
  lineEnding: NormalizedLineEnding,
): string {
  const replacement = lineEnding === "crlf" ? "\r\n" : "\n";

  return value.replace(/\r\n|\r|\n/g, replacement);
}
