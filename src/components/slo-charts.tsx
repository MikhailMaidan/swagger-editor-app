"use client";
import { memo } from "react";
import type { SloRun } from "@/lib/slo-studio";
import type { SloRuleStatus } from "@/lib/slo-engine";
import { useI18n } from "./i18n-provider";
export const sloAlertColors: Record<SloRuleStatus, string> = {
  inactive: "#e2e8f0",
  pending: "#f59e0b",
  firing: "#dc2626",
  "no-data": "#94a3b8",
  unknown: "#a78bfa",
  insufficient: "#64748b",
};
export const SloCharts = memo(function SloCharts({
  run,
  index,
  onSelect,
}: {
  run: SloRun;
  index: number;
  onSelect: (i: number) => void;
}) {
  const { t } = useI18n(),
    first = run.points[0].atMs,
    last = run.points.at(-1)!.atMs,
    x = (time: number) =>
      55 + ((time - first) / Math.max(1, last - first)) * 720,
    y = (value: number) => 20 + (100 - Math.max(0, Math.min(100, value))) * 1.4;
  let path = "",
    gap = true;
  for (const p of run.points) {
    if (p.window.remainingPercent === null) {
      gap = true;
      continue;
    }
    path += `${gap ? "M" : "L"}${x(p.atMs)},${y(p.window.remainingPercent)} `;
    gap = false;
  }
  return (
    <div className="space-y-3">
      <svg
        viewBox="0 0 800 190"
        role="img"
        aria-label={t("slo.chart")}
        className="max-h-64 w-full"
      >
        <line x1="55" y1="20" x2="775" y2="20" stroke="#cbd5e1" />
        <line x1="55" y1="160" x2="775" y2="160" stroke="#cbd5e1" />
        <text x="5" y="25" fontSize="11">
          100%
        </text>
        <text x="18" y="164" fontSize="11">
          0%
        </text>
        <path d={path} fill="none" stroke="#7c3aed" strokeWidth="2" />
        {run.points.map((p, i) =>
          p.window.remainingPercent === null ? null : (
            <circle
              key={p.atMs}
              cx={x(p.atMs)}
              cy={y(p.window.remainingPercent)}
              r={i === index ? 4 : 2}
              fill={
                p.window.remainingPercent < 0
                  ? "#dc2626"
                  : p.window.coverage === "complete"
                    ? "#059669"
                    : "#94a3b8"
              }
            />
          ),
        )}
        <line
          x1={x(run.points[index].atMs)}
          x2={x(run.points[index].atMs)}
          y1="12"
          y2="170"
          stroke="#0f172a"
          strokeDasharray="3 3"
        />
      </svg>
      <p className="text-xs text-slate-600">{t("slo.chartHelp")}</p>
      <div
        role="group"
        aria-label={t("slo.alertTimeline")}
        className="space-y-2 overflow-auto"
      >
        {run.points[0].rules.map((r, ruleIndex) => (
          <div
            key={r.id}
            className="grid min-w-[640px] items-center gap-px"
            style={{
              gridTemplateColumns: `130px repeat(${run.points.length}, minmax(3px,1fr))`,
            }}
          >
            <span
              className="truncate pr-2 text-xs font-semibold"
              title={r.name}
            >
              {r.name}
            </span>
            {run.points.map((p, i) => {
              const status = p.rules[ruleIndex].status,
                label = t("slo.inspect", {
                  rule: r.name,
                  time: new Date(p.atMs).toISOString(),
                  status: t(`slo.status.${status}`),
                });
              return (
                <button
                  type="button"
                  key={p.atMs}
                  aria-label={label}
                  title={label}
                  aria-pressed={i === index}
                  tabIndex={i === index ? 0 : -1}
                  className="h-7 rounded-sm outline-offset-2"
                  style={{
                    backgroundColor: sloAlertColors[status],
                    boxShadow:
                      i === index ? "inset 0 0 0 2px #0f172a" : undefined,
                  }}
                  onClick={() => onSelect(i)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      const next = Math.max(
                        0,
                        Math.min(
                          run.points.length - 1,
                          index + (e.key === "ArrowLeft" ? -1 : 1),
                        ),
                      );
                      onSelect(next);
                      (
                        e.currentTarget.parentElement?.children[next + 1] as
                          HTMLButtonElement | undefined
                      )?.focus();
                    }
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(sloAlertColors).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {t(`slo.status.${status as SloRuleStatus}`)}
          </span>
        ))}
      </div>
    </div>
  );
});
