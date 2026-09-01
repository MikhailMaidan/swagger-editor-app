import { downloadTextFile } from "./schema-download";
import type { ApiWorkflowLink, ApiWorkflowReport } from "./openapi-workflows";

export type ApiWorkflowExport = {
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

function getUnresolvedLabel(link: ApiWorkflowLink) {
  if (link.resolution === "external") {
    return `External: ${link.targetLabel}`;
  }

  if (link.resolution === "ambiguous") {
    return `Ambiguous: ${link.targetLabel}`;
  }

  return link.targetLabel
    ? `Unresolved: ${link.targetLabel}`
    : "Unresolved target";
}

export function createApiWorkflowMermaid(report: ApiWorkflowReport) {
  const lines = ["flowchart LR"];
  const nodeIds = new Map(
    report.nodes.map((node, index) => [node.key, `operation${index + 1}`]),
  );

  report.nodes.forEach((node) => {
    lines.push(
      `  ${nodeIds.get(node.key)}["${sanitizeMermaidLabel(`${node.method} ${node.path}`)}"]`,
    );
  });

  report.links.forEach((link, index) => {
    if (link.target) {
      return;
    }

    lines.push(
      `  target${index + 1}["${sanitizeMermaidLabel(getUnresolvedLabel(link))}"]`,
    );
  });

  report.links.forEach((link, index) => {
    const sourceId = nodeIds.get(link.source.key);
    const targetId = link.target
      ? nodeIds.get(link.target.key)
      : `target${index + 1}`;

    if (!sourceId || !targetId) {
      return;
    }

    lines.push(
      `  ${sourceId} -->|"${sanitizeMermaidLabel(`${link.status} ${link.name}`)}"| ${targetId}`,
    );
  });

  const cycleNodeIds = report.nodes
    .filter((node) => node.inCycle)
    .map((node) => nodeIds.get(node.key))
    .filter(Boolean);
  const problemNodeIds = report.links
    .map((link, index) => (link.target ? "" : `target${index + 1}`))
    .filter(Boolean);

  if (cycleNodeIds.length > 0) {
    lines.push(
      "  classDef cycle fill:#fef3c7,stroke:#b45309,color:#78350f",
      `  class ${cycleNodeIds.join(",")} cycle`,
    );
  }

  if (problemNodeIds.length > 0) {
    lines.push(
      "  classDef problem fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d",
      `  class ${problemNodeIds.join(",")} problem`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function createApiWorkflowExport(
  report: ApiWorkflowReport,
  schema: { title: string; version: string },
  exportedAt = new Date(),
): ApiWorkflowExport {
  const exportedAtIso = getExportDate(exportedAt);

  return {
    content: JSON.stringify(
      {
        exportedAt: exportedAtIso,
        schema,
        version: 1,
        workflow: report,
      },
      null,
      2,
    ),
    contentType: "application/json",
    fileName: `rsswag-${slugifyTitle(schema.title)}-workflow-${exportedAtIso.slice(0, 10)}.json`,
  };
}

export function downloadApiWorkflowFile(
  report: ApiWorkflowReport,
  schema: { title: string; version: string },
) {
  const workflowExport = createApiWorkflowExport(report, schema);

  return downloadTextFile(
    workflowExport.content,
    workflowExport.fileName,
    workflowExport.contentType,
  );
}
