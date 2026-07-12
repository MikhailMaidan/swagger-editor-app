import { describe, expect, it } from "vitest";
import { formatEuropeanDateTime } from "./date-format";

describe("formatEuropeanDateTime", () => {
  it("uses a day-first 24-hour English format", () => {
    expect(formatEuropeanDateTime("2026-07-12T08:05:03", "en")).toBe(
      "12/07/2026, 08:05:03",
    );
  });

  it("does not add AM or PM to Russian timestamps", () => {
    const formattedDate = formatEuropeanDateTime("2026-07-12T20:05:03", "ru");

    expect(formattedDate).toContain("20:05:03");
    expect(formattedDate).not.toMatch(/AM|PM/);
  });

  it("keeps an invalid date value readable", () => {
    expect(formatEuropeanDateTime("unknown date", "en")).toBe("unknown date");
  });
});
