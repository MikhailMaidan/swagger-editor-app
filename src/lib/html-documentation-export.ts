import type { HtmlDocumentationBuild } from "./html-documentation";
import { downloadTextFile } from "./schema-download";

export type HtmlDocumentationExport = {
  content: string;
  contentType: "text/html;charset=utf-8";
  fileName: string;
};

function slugifyTitle(title: string) {
  const slug = title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/[\uD800-\uDBFF]$/u, "")
    .replace(/-+$/g, "");

  return slug || "openapi-schema";
}

function getExportDate(exportedAt: Date) {
  return Number.isFinite(exportedAt.getTime())
    ? exportedAt.toISOString()
    : new Date(0).toISOString();
}

function revokeObjectUrl(objectUrl: string) {
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Cleanup failures should not change a completed preview action.
  }
}

export function createHtmlDocumentationExport(
  build: HtmlDocumentationBuild,
  schema: { title: string },
  exportedAt = new Date(),
): HtmlDocumentationExport {
  const date = getExportDate(exportedAt).slice(0, 10);

  return {
    content: build.html,
    contentType: "text/html;charset=utf-8",
    fileName: `rsswag-${slugifyTitle(schema.title)}-documentation-${date}.html`,
  };
}

export function downloadHtmlDocumentationFile(
  build: HtmlDocumentationBuild,
  schema: { title: string },
) {
  const exported = createHtmlDocumentationExport(build, schema);

  return downloadTextFile(
    exported.content,
    exported.fileName,
    exported.contentType,
  );
}

export function previewHtmlDocumentation(build: HtmlDocumentationBuild) {
  let objectUrl = "";

  try {
    if (
      typeof window === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return false;
    }

    objectUrl = URL.createObjectURL(
      new Blob([build.html], { type: "text/html;charset=utf-8" }),
    );
    const previewWindow = window.open(objectUrl, "_blank");

    if (!previewWindow) {
      revokeObjectUrl(objectUrl);
      return false;
    }

    try {
      previewWindow.opener = null;
    } catch {
      // Some browsers protect WindowProxy properties; the Blob URL is local.
    }

    window.setTimeout(() => revokeObjectUrl(objectUrl), 60_000);
    return true;
  } catch {
    if (objectUrl) revokeObjectUrl(objectUrl);
    return false;
  }
}
