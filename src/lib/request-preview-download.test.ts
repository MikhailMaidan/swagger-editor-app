import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadRequestPreviewFile,
  getRequestPreviewDownloadMetadata,
} from "./request-preview-download";

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

  it("bounds long endpoint filenames while preserving the method and extension", () => {
    const metadata = getRequestPreviewDownloadMetadata(
      "http",
      "GET",
      "/segment".repeat(100),
    );
    expect(metadata.fileName.length).toBeLessThanOrEqual(200);
    expect(metadata.fileName).toMatch(/^rsswag-get-segment/);
    expect(metadata.fileName).toMatch(/\.http$/);
    expect(metadata.fileName).not.toMatch(/-\./);
    expect(metadata.contentType).toBe("text/plain;charset=utf-8");
  });

  it("keeps the endpoint path readable even with an excessively long custom method", () => {
    const metadata = getRequestPreviewDownloadMetadata(
      "fetch",
      "CUSTOM-".repeat(100),
      "/items",
    );
    expect(metadata.fileName.length).toBeLessThanOrEqual(200);
    expect(metadata.fileName).toMatch(/^rsswag-custom-/);
    expect(metadata.fileName).toMatch(/-items\.js$/);
  });
});

describe("request preview download cleanup", () => {
  const createObjectURL = vi.fn<(value: Blob | MediaSource) => string>(),
    revokeObjectURL = vi.fn();
  beforeEach(() => {
    createObjectURL.mockReset().mockReturnValue("blob:request-preview");
    revokeObjectURL.mockReset();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads the original snippet bytes with the existing filename and content type", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const content = "  GET /users HTTP/1.1\r\nHost: example.test\r\n\r\n";
    downloadRequestPreviewFile(content, "http", "GET", "/users/{id}");
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toMatchObject({
      href: "blob:request-preview",
      download: "rsswag-get-users-id.http",
    });
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toBe(content);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:request-preview",
    );
  });

  it("releases the temporary URL when creating the download link fails", () => {
    const error = new Error("link creation blocked");
    vi.spyOn(document, "createElement").mockImplementationOnce(() => {
      throw error;
    });
    expect(() =>
      downloadRequestPreviewFile("curl example.test", "curl", "GET", "/"),
    ).toThrow(error);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:request-preview",
    );
  });

  it.each([false, true])(
    "preserves the download outcome when URL cleanup throws (click fails: %s)",
    (clickFails) => {
      const error = new Error("download click blocked");
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {
          if (clickFails) throw error;
        });
      revokeObjectURL.mockImplementationOnce(() => {
        throw new Error("URL cleanup unavailable");
      });
      const download = () =>
        downloadRequestPreviewFile("fetch('/users')", "fetch", "GET", "/users");
      if (clickFails) expect(download).toThrow(error);
      else expect(download).not.toThrow();
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
        "blob:request-preview",
      );
    },
  );
});
