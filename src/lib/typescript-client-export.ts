import { downloadTextFile } from "./schema-download";
import type { TypeScriptClientBuild } from "./typescript-client";

export type TypeScriptClientExport = {
  content: string;
  contentType: "text/typescript;charset=utf-8";
  fileName: string;
};

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "openapi-schema";
}

export function createTypeScriptClientExport(
  build: TypeScriptClientBuild,
  schema: { title: string },
): TypeScriptClientExport {
  return {
    content: build.source,
    contentType: "text/typescript;charset=utf-8",
    fileName: `${slugifyTitle(schema.title)}-client.ts`,
  };
}

export function downloadTypeScriptClientFile(
  build: TypeScriptClientBuild,
  schema: { title: string },
) {
  const clientExport = createTypeScriptClientExport(build, schema);

  return downloadTextFile(
    clientExport.content,
    clientExport.fileName,
    clientExport.contentType,
  );
}
