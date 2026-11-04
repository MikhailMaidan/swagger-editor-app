"use client";
import { memo, useId } from "react";
import { useI18n } from "./i18n-provider";
import type { SagaDefinition, SagaSnapshot } from "@/lib/saga-model";
import type { TranslationKey } from "@/lib/translations";
export const SagaGraph = memo(function SagaGraph({
  definition,
  snapshot,
  selected,
  onSelect,
}: {
  definition: SagaDefinition;
  snapshot: SagaSnapshot;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n(),
    marker = `saga-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const levels = new Map<string, number>();
  function level(id: string): number {
    if (levels.has(id)) return levels.get(id)!;
    const dependencies = definition.steps.find((s) => s.id === id)!.dependsOn;
    const result = dependencies.length
      ? 1 + Math.max(...dependencies.map(level))
      : 0;
    levels.set(id, result);
    return result;
  }
  const rows = new Map<number, number>(),
    positions = new Map(
      definition.steps.map((s) => {
        const l = level(s.id),
          row = rows.get(l) ?? 0;
        rows.set(l, row + 1);
        return [s.id, { x: l * 220 + 20, y: row * 90 + 20 }];
      }),
    );
  const width = (Math.max(...levels.values()) + 1) * 220 + 20,
    height = Math.max(...rows.values()) * 90 + 20;
  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-xl border border-[color:var(--color-brand-border)] bg-white p-2">
        <svg
          role="img"
          aria-label={t("saga.graph")}
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: Math.min(width, 900), minHeight: 130 }}
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
              <path d="M0,0 L8,4 L0,8" fill="#6b7280" />
            </marker>
          </defs>
          {definition.steps.flatMap((s) =>
            s.dependsOn.map((dep) => {
              const a = positions.get(dep)!,
                b = positions.get(s.id)!;
              return (
                <path
                  key={`${dep}-${s.id}`}
                  d={`M${a.x + 170},${a.y + 28} C${a.x + 195},${a.y + 28} ${b.x - 25},${b.y + 28} ${b.x},${b.y + 28}`}
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="1.5"
                  markerEnd={`url(#${marker})`}
                />
              );
            }),
          )}
          {definition.steps.map((s) => {
            const p = positions.get(s.id)!,
              state = snapshot.steps.find((x) => x.id === s.id)!,
              bad =
                ["unknown", "failed"].includes(state.forward) ||
                ["failed", "unknown", "retained"].includes(state.compensation);
            return (
              <g key={s.id}>
                <rect
                  x={p.x}
                  y={p.y}
                  width="170"
                  height="58"
                  rx="10"
                  fill={
                    bad
                      ? "#fff1f2"
                      : state.forward === "succeeded"
                        ? "#f0fdf4"
                        : "#f8fafc"
                  }
                  stroke={selected === s.id ? "#7c3aed" : "#94a3b8"}
                  strokeWidth={selected === s.id ? 3 : 1}
                />
                <text x={p.x + 10} y={p.y + 22} fontSize="12" fill="#111827">
                  {s.name.slice(0, 23)}
                </text>
                <text x={p.x + 10} y={p.y + 43} fontSize="10" fill="#475569">
                  {t(`saga.state.${state.forward}` as TranslationKey)} /{" "}
                  {t(`saga.state.${state.compensation}` as TranslationKey)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div
        role="group"
        aria-label={t("saga.steps")}
        className="flex flex-wrap gap-2"
      >
        {definition.steps.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={selected === s.id}
            onClick={() => onSelect(s.id)}
            className="rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold aria-pressed:border-violet-600"
          >
            {s.id}: {s.name}
          </button>
        ))}
      </div>
    </div>
  );
});
export const SagaTimeline = memo(function SagaTimeline({
  snapshot,
}: {
  snapshot: SagaSnapshot;
}) {
  const { t } = useI18n(),
    starts = snapshot.journal.filter((j) => j.kind === "started"),
    max = Math.max(snapshot.clock, 1),
    height = Math.max(60, snapshot.steps.length * 44 + 30);
  return (
    <div className="overflow-auto rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2">
      <svg
        role="img"
        aria-label={t("saga.timeline")}
        viewBox={`0 0 800 ${height}`}
        className="min-w-[600px]"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={fraction}>
            <path
              d={`M${150 + fraction * 620},20 V${height - 10}`}
              stroke="#e2e8f0"
            />
            <text
              x={150 + fraction * 620}
              y="12"
              fontSize="10"
              textAnchor="middle"
            >
              {Math.round(max * fraction)}
            </text>
          </g>
        ))}
        {snapshot.steps.map((s, i) => (
          <text key={s.id} x="4" y={i * 44 + 39} fontSize="11">
            {s.id.slice(0, 20)}
          </text>
        ))}
        {starts.map((start) => {
          const end = snapshot.journal.find(
              (j) =>
                j.seq > start.seq &&
                j.stepId === start.stepId &&
                j.phase === start.phase &&
                ["succeeded", "failed", "unknown", "retry-wait"].includes(
                  j.kind,
                ),
            ),
            row = snapshot.steps.findIndex((s) => s.id === start.stepId),
            x = 150 + (start.at / max) * 620,
            duration = (end?.at ?? snapshot.clock) - start.at;
          return (
            <rect
              key={start.seq}
              x={x}
              y={row * 44 + (start.phase === "forward" ? 25 : 41)}
              width={Math.max(2, (duration / max) * 620)}
              height="12"
              rx="2"
              fill={
                end?.kind === "unknown" || end?.kind === "failed"
                  ? "#e11d48"
                  : start.phase === "compensation"
                    ? "#f59e0b"
                    : "#7c3aed"
              }
            >
              <title>
                {start.stepId}: {start.phase} #{start.attempt} ({start.at}–
                {end?.at ?? snapshot.clock} ms)
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
});
