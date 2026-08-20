import { describe, expect, it } from "vitest";
import { getRequestPreviewDownloadMetadata } from "./request-preview-download";

describe("request preview download helpers", () => {
  it.each([
    ["curl", "text/x-shellscript;charset=utf-8", "sh"],
    ["fetch", "text/javascript;charset=utf-8", "js"],
    ["http", "text/plain;charset=utf-8", "http"],
  ] as const)(
    "creates %s download metadata",
    (format, contentType, extension) => {
      expect(
        getRequestPreviewDownloadMetadata(format, "GET", "/users/{id}"),
      ).toEqual({
        contentType,
        fileName: `rsswag-get-users-id.${extension}`,
      });
    },
  );

  it("falls back to safe filename parts for blank endpoint values", () => {
    expect(getRequestPreviewDownloadMetadata("http", " ", "/")).toEqual({
      contentType: "text/plain;charset=utf-8",
      fileName: "rsswag-request-root.http",
    });
  });
});
