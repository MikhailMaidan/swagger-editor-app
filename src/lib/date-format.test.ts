import { describe, expect, it } from "vitest";
import { formatEuropeanDateTime } from "./date-format";

describe("formatEuropeanDateTime", () => {
  it("uses a day-first 24-hour English format", () => {
    expect(formatEuropeanDateTime("2026-07-12T08:05:03.000Z", "en")).toBe(
      "12/07/2026, 08:05:03",
    );
  });

  it("does not add AM or PM to Russian timestamps", () => {
    const formattedDate = formatEuropeanDateTime(
      "2026-07-12T20:05:03.000Z",
      "ru",
    );

    expect(formattedDate).toContain("20:05:03");
    expect(formattedDate).not.toMatch(/AM|PM/);
  });

  it("formats the stored UTC instant regardless of the host's local timezone", () => {
    // createdAt/updatedAt are always UTC (new Date().toISOString()), and this
    // renders on the server before hydration, so the output must not depend
    // on the server process's local timezone or it will mismatch the client.
    expect(formatEuropeanDateTime("2026-01-01T23:30:00.000Z", "en")).toBe(
      "01/01/2026, 23:30:00",
    );
  });

  it("keeps an invalid date value readable", () => {
    expect(formatEuropeanDateTime("unknown date", "en")).toBe("unknown date");
  });
});
