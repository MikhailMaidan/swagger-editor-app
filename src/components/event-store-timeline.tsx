"use client";
import { memo } from "react";
import { useI18n } from "./i18n-provider";
import type { EventStorePoint } from "@/lib/event-store-studio";
import type { TranslationKey } from "@/lib/translations";
const colors = ["#7c3aed", "#0891b2", "#059669", "#d97706"];
export const EventStoreTimeline = memo(function EventStoreTimeline({
  points,
  index,
  onSelect,
}: {
  points: EventStorePoint[];
  index: number;
  onSelect: (n: number) => void;
}) {
  const { t } = useI18n();
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((p) => p.summary.events)),
    x = (i: number) => 40 + (i / Math.max(1, points.length - 1)) * 720,
    y = (n: number) => 160 - (n / max) * 140,
    ids = points[0].summary.projections.map((p) => p.id),
    path = (read: (p: EventStorePoint) => number) =>
      points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(read(p))}`).join(" ");
  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 800 190"
        role="img"
        aria-label={t("eventStore.timeline")}
        className="max-h-64 w-full"
      >
        <line x1="40" y1="160" x2="760" y2="160" stroke="#cbd5e1" />
        <text x="5" y="25" fontSize="11">
          {max}
        </text>
        <text x="18" y="164" fontSize="11">
          0
        </text>
        <path
          d={path((p) => p.summary.events)}
          fill="none"
          stroke="#0f172a"
          strokeWidth="2"
        />
        {ids.map((id, i) => (
          <path
            key={id}
            d={path(
              (p) => p.summary.projections.find((x) => x.id === id)!.checkpoint,
            )}
            fill="none"
            stroke={colors[i]}
            strokeWidth="2"
            strokeDasharray={i % 2 ? "4 2" : undefined}
          />
        ))}
        <line
          x1={x(index)}
          x2={x(index)}
          y1="12"
          y2="170"
          stroke="#0f172a"
          strokeDasharray="3 3"
        />
      </svg>
      <div className="flex flex-wrap gap-3 text-xs">
        <span>{t("eventStore.events")}: ●</span>
        {ids.map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            <span
              aria-hidden
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: colors[i] }}
            />
            {id}
          </span>
        ))}
      </div>
      <div
        role="group"
        aria-label={t("eventStore.timeline")}
        className="flex gap-px overflow-x-auto"
      >
        {points.map((p, i) => (
          <button
            type="button"
            key={p.command}
            aria-label={t("eventStore.inspect", {
              command: String(p.command),
              reason: t(`eventStore.reason.${p.reason}` as TranslationKey),
            })}
            title={t("eventStore.inspect", {
              command: String(p.command),
              reason: t(`eventStore.reason.${p.reason}` as TranslationKey),
            })}
            aria-pressed={i === index}
            tabIndex={i === index ? 0 : -1}
            className="h-7 min-w-3 flex-1 rounded-sm outline-offset-1"
            style={{
              backgroundColor: !p.accepted
                ? "#dc2626"
                : p.summary.errors
                  ? "#f59e0b"
                  : "#a78bfa",
              boxShadow: i === index ? "inset 0 0 0 2px #0f172a" : undefined,
            }}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const next = Math.max(
                  0,
                  Math.min(
                    points.length - 1,
                    i + (e.key === "ArrowLeft" ? -1 : 1),
                  ),
                );
                onSelect(next);
                (
                  e.currentTarget.parentElement?.children[next] as
                    HTMLButtonElement | undefined
                )?.focus();
              }
            }}
          />
        ))}
      </div>
    </div>
  );
});
