import type { PostmanCollectionBuild } from "./postman-collection";
import { downloadTextFile } from "./schema-download";

export type PostmanJsonExport = {
  content: string;
  contentType: "application/json";
  fileName: string;
};

export type PostmanEnvironment = {
  _postman_exported_at: string;
  _postman_exported_using: "RSSwag";
  _postman_variable_scope: "environment";
  name: string;
  values: Array<{
    enabled: true;
    key: string;
    type: "default" | "secret";
    value: string;
  }>;
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

function getExportDate(exportedAt: Date) {
  return Number.isFinite(exportedAt.getTime())
    ? exportedAt.toISOString()
    : new Date(0).toISOString();
}

export function createPostmanEnvironment(
  build: PostmanCollectionBuild,
  schema: { title: string },
  exportedAt = new Date(),
): PostmanEnvironment {
  const secretKeys = new Set(build.secretVariableKeys);

  return {
    _postman_exported_at: getExportDate(exportedAt),
    _postman_exported_using: "RSSwag",
    _postman_variable_scope: "environment",
    name: `${schema.title || "OpenAPI Schema"} - RSSwag`,
    values: build.collection.variable.map((variable) => ({
      enabled: true,
      key: variable.key,
      type: secretKeys.has(variable.key) ? "secret" : "default",
      value: variable.value,
    })),
  };
}

export function createPostmanCollectionExport(
  build: PostmanCollectionBuild,
  schema: { title: string },
  exportedAt = new Date(),
): PostmanJsonExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(build.collection, null, 2),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-postman-collection-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function createPostmanEnvironmentExport(
  build: PostmanCollectionBuild,
  schema: { title: string },
  exportedAt = new Date(),
): PostmanJsonExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      createPostmanEnvironment(build, schema, exportedAt),
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-postman-environment-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadPostmanCollectionFile(
  build: PostmanCollectionBuild,
  schema: { title: string },
) {
  const collectionExport = createPostmanCollectionExport(build, schema);

  return downloadTextFile(
    collectionExport.content,
    collectionExport.fileName,
    collectionExport.contentType,
  );
}

export function downloadPostmanEnvironmentFile(
  build: PostmanCollectionBuild,
  schema: { title: string },
) {
  const environmentExport = createPostmanEnvironmentExport(build, schema);

  return downloadTextFile(
    environmentExport.content,
    environmentExport.fileName,
    environmentExport.contentType,
  );
}
