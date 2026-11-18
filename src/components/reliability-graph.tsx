"use client";
import { useId, type RefObject } from "react";
import { useI18n } from "./i18n-provider";
import { rlTopological, type RLProject } from "@/lib/reliability-model";
import type { RLNodeState } from "@/lib/reliability-engine";

export function ReliabilityGraph({
  project,
  states,
  selected,
  select,
  svgRef,
}: {
  project: RLProject;
  states: RLNodeState[];
  selected: string;
  select: (id: string) => void;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const { t } = useI18n(),
    marker = `rl-arrow-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const nodes = rlTopological(project.nodes),
    levels = new Map<string, number>(),
    counts = new Map<number, number>(),
    positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const level =
      node.kind === "event"
        ? 0
        : 1 + Math.max(...node.inputs.map((id) => levels.get(id)!));
    const ordinal = counts.get(level) ?? 0;
    levels.set(node.id, level);
    counts.set(level, ordinal + 1);
    positions.set(node.id, { x: 24 + level * 230, y: 20 + ordinal * 76 });
  }
  const width = (Math.max(...levels.values()) + 1) * 230 + 24,
    height = Math.max(...counts.values()) * 76 + 30;
  return (
    <section aria-label={t("rl.graph")} className="space-y-2">
      <h3 className="text-sm font-bold">{t("rl.graph")}</h3>
      <p className="text-xs text-slate-600">{t("rl.graphHelp")}</p>
      <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200 bg-slate-50">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={t("rl.graph")}
        >
          <defs>
            <marker
              id={marker}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
            </marker>
          </defs>
          {nodes.flatMap((node) =>
            node.kind === "event"
              ? []
              : node.inputs.map((parent) => {
                  const from = positions.get(parent)!,
                    to = positions.get(node.id)!;
                  return (
                    <path
                      key={`${parent}-${node.id}`}
                      d={`M${from.x + 196},${from.y + 28} C${from.x + 218},${from.y + 28} ${to.x - 22},${to.y + 28} ${to.x},${to.y + 28}`}
                      fill="none"
                      stroke={
                        states.find((s) => s.id === parent)?.up
                          ? "#94a3b8"
                          : "#ef4444"
                      }
                      strokeWidth="1.5"
                      markerEnd={`url(#${marker})`}
                    />
                  );
                }),
          )}
          {nodes.map((node) => {
            const position = positions.get(node.id)!,
              up = states.find((state) => state.id === node.id)!.up,
              root = project.roots.some((item) => item.node === node.id);
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={t("rl.inspectNode", { name: node.name })}
                aria-pressed={selected === node.id}
                onClick={() => select(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(node.id);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <title>
                  {node.name} · {t(up ? "rl.up" : "rl.down")}
                </title>
                <rect
                  x={position.x}
                  y={position.y}
                  width="196"
                  height="56"
                  rx={node.kind === "event" ? "18" : "7"}
                  fill={up ? "#f0fdf4" : "#fef2f2"}
                  stroke={
                    selected === node.id
                      ? "#7c3aed"
                      : up
                        ? "#16a34a"
                        : "#dc2626"
                  }
                  strokeWidth={selected === node.id || root ? "3" : "1.5"}
                />
                <text
                  x={position.x + 10}
                  y={position.y + 21}
                  fontFamily="system-ui,sans-serif"
                  fontSize="12"
                  fontWeight="600"
                  fill="#172554"
                  pointerEvents="none"
                >
                  {root ? "◆ " : ""}
                  {node.name.length > 24
                    ? `${node.name.slice(0, 23)}…`
                    : node.name}
                </text>
                <text
                  x={position.x + 10}
                  y={position.y + 42}
                  fontFamily="system-ui,sans-serif"
                  fontSize="10"
                  fill={up ? "#166534" : "#991b1b"}
                  pointerEvents="none"
                >
                  {t(up ? "rl.up" : "rl.down")} ·{" "}
                  {node.kind === "event"
                    ? `p=${node.probability}`
                    : node.kind === "at-least"
                      ? `${node.threshold}/${node.inputs.length}`
                      : node.kind.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
