import type { NodeMockServerBuild } from "./node-mock-server";
import { downloadTextFile } from "./schema-download";

export type NodeMockServerExport = {
  content: string;
  contentType: "text/javascript;charset=utf-8";
  fileName: string;
};

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return slug || "openapi-schema";
}

export function createNodeMockServerExport(
  build: NodeMockServerBuild,
  schema: { title: string },
): NodeMockServerExport {
  return {
    content: build.source,
    contentType: "text/javascript;charset=utf-8",
    fileName: `rsswag-${slugifyTitle(schema.title)}-mock-server.mjs`,
  };
}

export function downloadNodeMockServerFile(
  build: NodeMockServerBuild,
  schema: { title: string },
) {
  const exported = createNodeMockServerExport(build, schema);

  return downloadTextFile(
    exported.content,
    exported.fileName,
    exported.contentType,
  );
}
