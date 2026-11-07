"use client";
import { useState } from "react";
import { useI18n } from "./i18n-provider";
import { DTSelect, dtPretty } from "./decision-controls";
import {
  dtDecisionRefs,
  dtDependencies,
  type DTProject,
  type DTStatus,
} from "@/lib/decision-model";
import type { DTEvaluation } from "@/lib/decision-engine";
export const dtStatusKey = (status: DTStatus) =>
  status === "error" ? "decision.errorStatus" : (`decision.${status}` as const);
export function DecisionGraph({
  project,
  rootId,
  select,
}: {
  project: DTProject;
  rootId: string;
  select: (id: string) => void;
}) {
  const { t } = useI18n(),
    deps = dtDependencies(project, rootId),
    levels = new Map<string, number>(),
    byLevel = new Map<number, number>();
  function depth(id: string): number {
    if (levels.has(id)) return levels.get(id)!;
    const d = project.decisions.find((d) => d.id === id)!;
    const level =
      1 +
      Math.max(
        0,
        ...dtDecisionRefs(d).map((ref) =>
          ref.kind === "input" ? 0 : depth(ref.id),
        ),
      );
    levels.set(id, level);
    return level;
  }
  deps.decisions.forEach(depth);
  const nodes = [
      ...deps.inputs.map((id) => ({
        key: `input:${id}`,
        id,
        level: 0,
        decision: false,
      })),
      ...deps.decisions.map((id) => ({
        key: `decision:${id}`,
        id,
        level: levels.get(id)!,
        decision: true,
      })),
    ].map((node) => {
      const row = byLevel.get(node.level) ?? 0;
      byLevel.set(node.level, row + 1);
      return { ...node, x: node.level * 190 + 10, y: row * 65 + 15 };
    }),
    lookup = new Map(nodes.map((node) => [node.key, node]));
  const edges = [
    ...new Set(
      deps.decisions.flatMap((id) =>
        dtDecisionRefs(project.decisions.find((d) => d.id === id)!).map((ref) =>
          JSON.stringify([`${ref.kind}:${ref.id}`, `decision:${id}`]),
        ),
      ),
    ),
  ].map((text) => JSON.parse(text) as [string, string]);
  const height = Math.max(
    100,
    ...Array.from(byLevel.values()).map((n) => n * 65 + 20),
  );
  return (
    <details open>
      <summary className="cursor-pointer text-sm font-bold">
        {t("decision.graph")}
      </summary>
      <div className="overflow-x-auto py-3">
        <svg
          viewBox={`0 0 ${(Math.max(1, ...levels.values()) + 1) * 190} ${height}`}
          className="min-w-[640px]"
          aria-hidden="true"
        >
          {edges.map(([from, to]) => {
            const a = lookup.get(from)!,
              b = lookup.get(to)!;
            return (
              <path
                key={`${from}-${to}`}
                d={`M${a.x + 150},${a.y + 19} C${a.x + 170},${a.y + 19} ${b.x - 20},${b.y + 19} ${b.x},${b.y + 19}`}
                fill="none"
                stroke="#a78bfa"
                strokeWidth="2"
              />
            );
          })}
          {nodes.map((node) => (
            <g key={node.key}>
              <rect
                x={node.x}
                y={node.y}
                width="150"
                height="38"
                rx="6"
                fill={
                  node.id === rootId && node.decision
                    ? "#7c3aed"
                    : node.decision
                      ? "#ede9fe"
                      : "#e2e8f0"
                }
              />
              <text
                x={node.x + 8}
                y={node.y + 24}
                fill={node.id === rootId && node.decision ? "white" : "#0f172a"}
                fontSize="12"
              >
                {node.id.slice(0, 20)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {deps.decisions.map((id) => (
          <button
            key={id}
            type="button"
            className="rounded border px-2 py-1 text-xs"
            aria-label={t("decision.selectTable", { id })}
            onClick={() => select(id)}
          >
            {id}
          </button>
        ))}
      </div>
    </details>
  );
}
export function DecisionExplanation({
  evaluation,
}: {
  evaluation: DTEvaluation;
}) {
  const { t } = useI18n(),
    [id, setId] = useState(evaluation.rootId),
    result =
      evaluation.decisions.find((d) => d.decisionId === id) ??
      evaluation.result;
  return (
    <div className="space-y-3">
      <DTSelect
        label={t("decision.traceDecision")}
        value={result.decisionId}
        onChange={setId}
      >
        {evaluation.decisions.map((d) => (
          <option key={d.decisionId} value={d.decisionId}>
            {d.decisionId}: {t(dtStatusKey(d.status))}
          </option>
        ))}
      </DTSelect>
      <p className="text-xs font-bold">{t("decision.output")}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">
        {dtPretty(result.output)}
      </pre>
      <p className="text-xs">
        {t("decision.matchedRows")}: {result.matched.join(", ") || "∅"} ·{" "}
        {t("decision.selected")}: {result.selected.join(", ") || "∅"}
        {result.error
          ? ` · ${result.error} ${result.blockedBy.join(", ")}`
          : ""}
      </p>
      <details>
        <summary className="cursor-pointer text-xs font-bold">
          {t("decision.resolved")}
        </summary>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">
          {dtPretty(result.columns)}
        </pre>
      </details>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th>{t("decision.rule")}</th>
              {result.columns.map((c) => (
                <th key={c.id} className="p-2">
                  {c.id}
                </th>
              ))}
              <th>{t("decision.selected")}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="p-2 font-bold">{row.id}</td>
                {row.cells.map((matched, i) => (
                  <td className="p-2" key={i}>
                    {matched ? "✓" : "×"}
                  </td>
                ))}
                <td className="p-2">
                  {result.selected.includes(row.id) ? "✓" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
