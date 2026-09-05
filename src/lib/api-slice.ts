import YAML from "yaml";
import { createComponentRegistryReport } from "./component-registry";
import type { EndpointSummary, SchemaFormat } from "./openapi";
import { createApiWorkflowReport } from "./openapi-workflows";
import { getSchemaDownloadMetadata } from "./schema-download";

export type ApiSliceIssue = {
  code:
    | "broken-reference"
    | "external-reference"
    | "linked-operation"
    | "preserved-components"
    | "serialization-error"
    | "path-reference";
  source: string;
  target: string;
};

export type ApiSliceBuild = {
  document: Record<string, unknown>;
  issues: ApiSliceIssue[];
  operationCount: number;
  pathCount: number;
  retainedComponentCount: number;
  removedComponentCount: number;
};

const methods = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerParts(pointer: string) {
  return pointer
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}

// The registry deliberately ignores example payloads and vendor extensions.
// Polymorphic schemas and resource-relative references can have implicit
// dependencies, so keep components conservatively when those are present.
function hasImplicitDependencies(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasImplicitDependencies);
  if (!isRecord(value)) return false;
  if ("discriminator" in value || "$id" in value) return true;
  return Object.entries(value).some(
    ([key, child]) =>
      !key.startsWith("x-") &&
      !["example", "examples", "default", "enum", "const"].includes(key) &&
      hasImplicitDependencies(child),
  );
}

/** Creates an independent document; never changes the editor's parsed schema. */
export function createApiSlice(
  schema: Record<string, unknown>,
  endpoints: EndpointSummary[],
  options: {
    includeDeprecated?: boolean;
    includeWebhooks?: boolean;
    pruneComponents?: boolean;
  } = {},
): ApiSliceBuild {
  let document: Record<string, unknown>;
  try {
    document = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  } catch {
    return {
      document: {},
      issues: [{ code: "serialization-error", source: "#", target: "" }],
      operationCount: 0,
      pathCount: 0,
      retainedComponentCount: 0,
      removedComponentCount: 0,
    };
  }
  const selected = new Set(
    endpoints.map(({ method, path }) => `${method.toLowerCase()} ${path}`),
  );
  const paths = isRecord(document.paths) ? document.paths : {};
  const issues: ApiSliceIssue[] = [];
  let operationCount = 0;
  let pathCount = 0;

  for (const [path, item] of Object.entries(paths)) {
    if (path.startsWith("x-")) continue;
    if (!isRecord(item)) {
      delete paths[path];
      continue;
    }
    let count = 0;
    for (const method of Object.keys(item)) {
      if (!methods.has(method)) continue;
      if (
        selected.has(`${method} ${path}`) &&
        isRecord(item[method]) &&
        (options.includeDeprecated !== false ||
          item[method].deprecated !== true)
      )
        count++;
      else delete item[method];
    }
    // OAS 3.2 custom methods are not exposed by the workspace endpoint picker.
    delete item.additionalOperations;
    if (!count) {
      delete paths[path];
      continue;
    }
    if (typeof item.$ref === "string") {
      issues.push({ code: "path-reference", source: path, target: item.$ref });
    }
    operationCount += count;
    pathCount++;
  }
  document.paths = paths;
  if (!options.includeWebhooks) delete document.webhooks;

  const before = createComponentRegistryReport(document);
  const conservative =
    hasImplicitDependencies(document) ||
    before.references.some(
      (reference) =>
        reference.status === "resolved" &&
        !reference.targetComponentKey &&
        before.components.some((component) =>
          component.pointer.startsWith(`${reference.targetPointer}/`),
        ),
    );
  if (options.pruneComponents !== false && conservative) {
    issues.push({ code: "preserved-components", source: "#", target: "" });
  }
  if (options.pruneComponents !== false && !conservative) {
    for (const component of before.components) {
      if (component.reachable) continue;
      const parts = pointerParts(component.pointer);
      let parent: unknown = document;
      for (const part of parts.slice(0, -1)) {
        parent =
          isRecord(parent) && Object.hasOwn(parent, part)
            ? parent[part]
            : undefined;
      }
      if (isRecord(parent)) delete parent[parts.at(-1)!];
    }
  }
  const after = createComponentRegistryReport(document);
  for (const reference of after.references) {
    if (reference.status === "resolved") continue;
    issues.push({
      code:
        reference.status === "broken"
          ? "broken-reference"
          : "external-reference",
      source: reference.sourcePointer,
      target: reference.reference,
    });
  }
  // Links are implicit operation dependencies, not component $refs. Surface
  // removed targets without silently adding excluded operations back in.
  const retainedEndpoints = endpoints.filter((endpoint) => {
    const item = paths[endpoint.path];
    return isRecord(item) && Object.hasOwn(item, endpoint.method.toLowerCase());
  });
  for (const link of createApiWorkflowReport(document, retainedEndpoints)
    .links) {
    if (link.resolution !== "resolved") {
      issues.push({
        code: "linked-operation",
        source: link.key,
        target: link.targetLabel,
      });
    }
  }
  return {
    document,
    issues,
    operationCount,
    pathCount,
    retainedComponentCount: after.totalCount,
    removedComponentCount: before.totalCount - after.totalCount,
  };
}

export function createApiSliceExport(
  build: ApiSliceBuild,
  title: string,
  format: SchemaFormat,
) {
  const metadata = getSchemaDownloadMetadata(title, format);
  return {
    ...metadata,
    fileName: metadata.fileName.replace(/\.(json|yaml)$/, "-slice.$1"),
    content:
      format === "json"
        ? `${JSON.stringify(build.document, null, 2)}\n`
        : YAML.stringify(build.document, { lineWidth: 0 }),
  };
}
