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
});
