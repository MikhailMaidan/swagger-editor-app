"use client";
import { memo } from "react";
import { useI18n } from "./i18n-provider";
import type { FlagDefinition } from "@/lib/flag-model";
import type { FlagPlan } from "@/lib/flag-studio";
export const flagVariantColors = [
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#db2777",
  "#2563eb",
  "#65a30d",
  "#9333ea",
];
export const FlagDependencyGraph = memo(function FlagDependencyGraph({
  definition,
  selected,
  onSelect,
}: {
  definition: FlagDefinition;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n(),
    levels = new Map<string, number>(),
    rows = new Map<number, number>(),
    positions = new Map<string, { x: number; y: number }>();
  function level(id: string): number {
    if (levels.has(id)) return levels.get(id)!;
    const f = definition.flags.find((f) => f.id === id)!,
      n = f.prerequisites.length
        ? 1 + Math.max(...f.prerequisites.map((p) => level(p.flagId)))
        : 0;
    levels.set(id, n);
    return n;
  }
  for (const f of definition.flags) {
    const n = level(f.id),
      row = rows.get(n) ?? 0;
    positions.set(f.id, { x: 20 + n * 220, y: 20 + row * 80 });
    rows.set(n, row + 1);
  }
  const width = (Math.max(...levels.values()) + 1) * 220 + 20,
    height = Math.max(...rows.values()) * 80 + 20;
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
      <svg
        role="group"
        aria-label={t("flag.graph")}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width,
          height,
          maxWidth: "none",
        }}
      >
        <defs>
          <marker
            id="flag-dependency-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10Z" fill="#94a3b8" />
          </marker>
        </defs>
        {definition.flags.flatMap((f) =>
          f.prerequisites.map((p) => {
            const a = positions.get(p.flagId)!,
              b = positions.get(f.id)!;
            return (
              <path
                key={`${f.id}/${p.flagId}`}
                d={`M${a.x + 180},${a.y + 25}C${a.x + 200},${a.y + 25} ${b.x - 20},${b.y + 25} ${b.x},${b.y + 25}`}
                fill="none"
                stroke="#94a3b8"
                markerEnd="url(#flag-dependency-arrow)"
              />
            );
          }),
        )}
        {definition.flags.map((f) => {
          const p = positions.get(f.id)!;
          return (
            <g
              role="button"
              aria-label={t("flag.choose", { name: f.name, id: f.id })}
              aria-pressed={f.id === selected}
              tabIndex={0}
              key={f.id}
              className="cursor-pointer outline-offset-2"
              transform={`translate(${p.x},${p.y})`}
              onClick={() => onSelect(f.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(f.id);
                }
              }}
            >
              <title>
                {f.name} ({f.id})
              </title>
              <rect
                width="180"
                height="50"
                rx="8"
                fill={f.id === selected ? "#ede9fe" : "#f8fafc"}
                stroke={f.id === selected ? "#7c3aed" : "#cbd5e1"}
              />
              <text x="10" y="20" fontSize="12" fontWeight="600">
                {f.name.slice(0, 22)}
              </text>
              <text x="10" y="38" fontSize="10" fill="#64748b">
                {f.id.slice(0, 26)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});
export const FlagCohortChart = memo(function FlagCohortChart({
  plan,
  variantIds,
  stage,
  subject,
  onSelect,
}: {
  plan: FlagPlan;
  variantIds: string[];
  stage: number;
  subject: number;
  onSelect: (stage: number, subject: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("flag.cohortChart")}
      className="space-y-2 overflow-x-auto"
    >
      {plan.stages.map((s, stageIndex) => (
        <div
          className="grid min-w-[640px] items-center gap-px"
          style={{
            gridTemplateColumns: `65px repeat(${plan.count},minmax(4px,1fr))`,
          }}
          key={s.rolloutPpm}
        >
          <span className="text-xs font-semibold">{s.rolloutPpm / 10000}%</span>
          {s.assignments.map((a, i) => (
            <button
              type="button"
              key={i}
              aria-label={t("flag.cohortCell", {
                subject: String(i + 1),
                percent: String(s.rolloutPpm / 10000),
                variant: a.variantId ?? t("flag.off"),
              })}
              title={t("flag.cohortCell", {
                subject: String(i + 1),
                percent: String(s.rolloutPpm / 10000),
                variant: a.variantId ?? t("flag.off"),
              })}
              aria-pressed={stage === stageIndex && subject === i}
              tabIndex={stage === stageIndex && subject === i ? 0 : -1}
              className="h-7 rounded-sm outline-offset-1"
              style={{
                backgroundColor:
                  a.variantId === null
                    ? "#cbd5e1"
                    : flagVariantColors[
                        Math.max(0, variantIds.indexOf(a.variantId))
                      ],
                boxShadow:
                  stage === stageIndex && subject === i
                    ? "inset 0 0 0 2px #0f172a"
                    : undefined,
              }}
              onClick={() => onSelect(stageIndex, i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  const next = Math.max(
                    0,
                    Math.min(
                      plan.count - 1,
                      i + (e.key === "ArrowLeft" ? -1 : 1),
                    ),
                  );
                  onSelect(stageIndex, next);
                  (
                    e.currentTarget.parentElement?.children[next + 1] as
                      HTMLButtonElement | undefined
                  )?.focus();
                }
              }}
            />
          ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-3 text-xs">
        <span>{t("flag.off")}: ◻</span>
        {variantIds.map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: flagVariantColors[i] }}
            />
            {id}
          </span>
        ))}
      </div>
    </div>
  );
});
