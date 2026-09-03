import { afterEach, describe, expect, it, vi } from "vitest";
import type { HtmlDocumentationBuild } from "./html-documentation";
import {
  createHtmlDocumentationExport,
  downloadHtmlDocumentationFile,
  previewHtmlDocumentation,
} from "./html-documentation-export";
import { downloadTextFile } from "./schema-download";

vi.mock("./schema-download", () => ({
  downloadTextFile: vi.fn(),
}));

const build: HtmlDocumentationBuild = {
  html: "<!doctype html><title>Catalog</title>",
  summary: {
    deprecatedExcludedCount: 0,
    endpointCount: 1,
    methodCount: 1,
    modelCount: 0,
    securitySchemeCount: 0,
  },
};

describe("HTML documentation export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("creates a dated standalone HTML file", () => {
    expect(
      createHtmlDocumentationExport(
        build,
        { title: "Catalog & Orders API" },
        new Date("2026-09-03T10:00:00.000Z"),
      ),
    ).toEqual({
      content: build.html,
      contentType: "text/html;charset=utf-8",
      fileName: "rsswag-catalog-orders-api-documentation-2026-09-03.html",
    });
  });

  it("downloads generated documentation through the shared file helper", () => {
    vi.mocked(downloadTextFile).mockReturnValue(true);

    expect(downloadHtmlDocumentationFile(build, { title: "Catalog API" })).toBe(
      true,
    );
    expect(downloadTextFile).toHaveBeenCalledWith(
      build.html,
      expect.stringMatching(
        /^rsswag-catalog-api-documentation-\d{4}-\d{2}-\d{2}\.html$/,
      ),
      "text/html;charset=utf-8",
    );
  });

  it("opens a Blob preview and revokes it after the loading grace period", () => {
    vi.useFakeTimers();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn().mockReturnValue("blob:documentation");
    const revokeObjectURL = vi.fn();
    const previewWindow = { opener: window } as unknown as Window;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const open = vi.spyOn(window, "open").mockReturnValue(previewWindow);

    try {
      expect(previewHtmlDocumentation(build)).toBe(true);
      expect(open).toHaveBeenCalledWith("blob:documentation", "_blank");
      expect(previewWindow.opener).toBeNull();
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(60_000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:documentation");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it("cleans up when the browser blocks the preview", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = vi.fn().mockReturnValue("blob:blocked");
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(window, "open").mockReturnValue(null);

    try {
      expect(previewHtmlDocumentation(build)).toBe(false);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:blocked");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
