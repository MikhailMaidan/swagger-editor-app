import { downloadTextFile } from "./schema-download";
import type { SchemaModel } from "./schema-models";

export type SchemaModelTypeScriptExport = {
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

function sanitizeComment(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replaceAll("*/", "* /")
    .trim();
}

export function createSchemaModelsTypeScriptExport(
  models: SchemaModel[],
  schema: { title: string; version: string },
): SchemaModelTypeScriptExport {
  const title = sanitizeComment(schema.title) || "OpenAPI schema";
  const version = sanitizeComment(schema.version);
  const sourceLabel = version ? `${title} v${version}` : title;

  return {
    content: `// Generated from ${sourceLabel} by RSSwag.\n\n${models
      .map((model) => model.typeScript)
      .join("\n\n")}\n`,
    contentType: "text/typescript;charset=utf-8",
    fileName: `${slugifyTitle(schema.title)}-models.ts`,
  };
}

export function downloadSchemaModelsTypeScriptFile(
  models: SchemaModel[],
  schema: { title: string; version: string },
) {
  const modelExport = createSchemaModelsTypeScriptExport(models, schema);

  return downloadTextFile(
    modelExport.content,
    modelExport.fileName,
    modelExport.contentType,
  );
}
