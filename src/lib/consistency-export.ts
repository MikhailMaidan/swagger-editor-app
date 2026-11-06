import {
  normalizeLcProject,
  type LCProject,
  type LCHistory,
} from "./consistency-model";
import type { LCResult } from "./consistency-engine";
import { CONSISTENCY_RUNTIME_SOURCE } from "./consistency-runtime-source";
const embedLc = (value: unknown) =>
  JSON.stringify(JSON.stringify(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function generateLcToolkit() {
  return `// RSSwag consistency checker. No network, fixture data, or persistent storage.\n${CONSISTENCY_RUNTIME_SOURCE}\n`;
}
export function generateLcRunner(project: LCProject) {
  return `// Contains private object specifications and operation histories.\n${CONSISTENCY_RUNTIME_SOURCE}\nconst project = normalizeLcProject(JSON.parse(${embedLc(normalizeLcProject(project))}));
const runs = await runConsistencySuite(project);
console.log(consistencyReport(runs));
if (!runs.length) console.error("No consistency histories to check.");
if (typeof process !== "undefined") process.exitCode = runs.length > 0 && runs.every(run => run.expected !== null && run.passed) ? 0 : 1;
`;
}
const xmlLc = (value: string) =>
  value
    .replace(
      /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,
      "",
    )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export function lcTimelineGeometry(history: LCHistory) {
  const min = Math.min(0, ...history.operations.map((op) => op.start)),
    max = Math.max(
      1,
      ...history.operations.map((op) => op.end ?? op.start + 1),
    ),
    horizon = max + Math.max(1, (max - min) * 0.05),
    scale = (value: number) => 180 + (570 * (value - min)) / (horizon - min);
  return {
    horizon,
    rows: [...history.operations]
      .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
      .map((op, i) => ({
        op,
        x: scale(op.start),
        width: Math.max(2, scale(op.end ?? horizon) - scale(op.start)),
        y: 55 + i * 34,
      })),
    height: 95 + history.operations.length * 34,
  };
}
export function exportLcSvg(history: LCHistory, result?: LCResult) {
  const geometry = lcTimelineGeometry(history);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${geometry.height}" role="img"><title>${xmlLc(history.name)}</title><rect width="900" height="${geometry.height}" fill="white"/><text x="12" y="24" font-family="sans-serif" font-size="15">${xmlLc(history.name)} (${xmlLc(result?.verdict ?? history.mode)})</text>${geometry.rows.map(({ op, x, width, y }) => `<text x="12" y="${y + 14}" font-family="sans-serif" font-size="12">${xmlLc(op.id)} · ${xmlLc(op.method)}</text><rect x="${x}" y="${y}" width="${width}" height="20" rx="4" fill="${op.end === null ? "#d97706" : "#7c3aed"}" ${op.end === null ? 'stroke="#92400e" stroke-dasharray="4 3"' : ""}/><text x="770" y="${y + 14}" font-family="sans-serif" font-size="11">${xmlLc(op.client)}</text>`).join("")}</svg>`;
}
