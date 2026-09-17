import { describe, expect, it } from "vitest";
import { getResponseDownloadMetadata } from "./response-download";

describe("response download helpers", () => {
  it("uses the response content type and status in download metadata", () => {
    expect(
      getResponseDownloadMetadata(
        { "Content-Type": "application/problem+json; charset=utf-8" },
        "422",
      ),
    ).toEqual({
      contentType: "application/problem+json; charset=utf-8",
      fileName: "rsswag-response-422.json",
    });
  });

  it("falls back to a text download and sanitizes nonstandard statuses", () => {
    expect(getResponseDownloadMetadata({}, "Default response")).toEqual({
      contentType: "text/plain;charset=utf-8",
      fileName: "rsswag-response-default-response.txt",
    });
  });

  it.each(["constructor", "__proto__"])(
    "uses the text fallback for a malformed Content-Type of %s",
    (contentType) => {
      expect(
        getResponseDownloadMetadata({ "Content-Type": contentType }, "200")
          .fileName,
      ).toBe("rsswag-response-200.txt");
    },
  );

  it("bounds long response labels without truncating the extension or leaving a trailing separator", () => {
    expect(
      getResponseDownloadMetadata(
        { "content-type": "application/problem+json; charset=utf-8" },
        "A".repeat(300),
      ),
    ).toEqual({
      contentType: "application/problem+json; charset=utf-8",
      fileName: `rsswag-response-${"a".repeat(80)}.json`,
    });
    expect(
      getResponseDownloadMetadata(
        { "content-type": "application/xml" },
        `${"B".repeat(79)} / response`,
      ).fileName,
    ).toBe(`rsswag-response-${"b".repeat(79)}.xml`);
  });
});
