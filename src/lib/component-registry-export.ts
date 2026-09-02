import type { ComponentRegistryReport } from "./component-registry";
import { downloadTextFile } from "./schema-download";

export type ComponentRegistryExport = {
  content: string;
  contentType: "application/json";
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

function getExportDate(exportedAt: Date) {
  return Number.isNaN(exportedAt.getTime())
    ? new Date(0).toISOString()
    : exportedAt.toISOString();
}

function sanitizeMermaidLabel(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', "'")
    .replaceAll("|", "/")
    .trim();
}

export function createComponentRegistryMermaid(
  report: ComponentRegistryReport,
) {
  const lines = ["flowchart LR"];

  if (report.components.length === 0) {
    return `${lines.concat('  empty["No reusable components"]').join("\n")}\n`;
  }

  const nodeIds = new Map(
    report.components.map((component, index) => [
      component.key,
      `component${index + 1}`,
    ]),
  );
  const rootTargets = report.components.filter(
    (component) => component.rootReferenceCount > 0,
  );

  if (rootTargets.length > 0) {
    lines.push('  api["API surface"]');
  }

  report.components.forEach((component) => {
    lines.push(
      `  ${nodeIds.get(component.key)}["${sanitizeMermaidLabel(`${component.kind}: ${component.name}`)}"]`,
    );
  });

  rootTargets.forEach((component) => {
    lines.push(`  api --> ${nodeIds.get(component.key)}`);
  });

  report.components.forEach((component) => {
    component.dependencyKeys.forEach((dependencyKey) => {
      const sourceId = nodeIds.get(component.key);
      const targetId = nodeIds.get(dependencyKey);

      if (sourceId && targetId) {
        lines.push(`  ${sourceId} --> ${targetId}`);
      }
    });
  });

  const unusedNodeIds = report.components
    .filter((component) => !component.reachable)
    .map((component) => nodeIds.get(component.key))
    .filter(Boolean);
  const cycleNodeIds = report.components
    .filter((component) => component.inCycle)
    .map((component) => nodeIds.get(component.key))
    .filter(Boolean);
  const problemNodeIds = report.components
    .filter(
      (component) =>
        component.brokenDependencyCount > 0 ||
        component.externalDependencyCount > 0,
    )
    .map((component) => nodeIds.get(component.key))
    .filter(Boolean);

  if (unusedNodeIds.length > 0) {
    lines.push(
      "  classDef unused fill:#fef3c7,stroke:#b45309,color:#78350f",
      `  class ${unusedNodeIds.join(",")} unused`,
    );
  }

  if (cycleNodeIds.length > 0) {
    lines.push(
      "  classDef cycle fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d",
      `  class ${cycleNodeIds.join(",")} cycle`,
    );
  }

  if (problemNodeIds.length > 0) {
    lines.push(
      "  classDef problem stroke:#7e22ce,stroke-width:3px",
      `  class ${problemNodeIds.join(",")} problem`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function createComponentRegistryExport(
  report: ComponentRegistryReport,
  schema: { title: string; version: string },
  exportedAt = new Date(),
): ComponentRegistryExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        componentRegistry: report,
        exportedAt: exportedAtIso,
        schema,
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-components-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadComponentRegistryFile(
  report: ComponentRegistryReport,
  schema: { title: string; version: string },
) {
  const registryExport = createComponentRegistryExport(report, schema);

  return downloadTextFile(
    registryExport.content,
    registryExport.fileName,
    registryExport.contentType,
  );
}
