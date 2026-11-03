"use client";
import { memo } from "react";
import type { QueuePoint } from "@/lib/queue-studio";
import { useI18n } from "./i18n-provider";
import type { TranslationKey } from "@/lib/translations";
const colors = {
  ready: "#38bdf8",
  delayed: "#a78bfa",
  leased: "#f59e0b",
  done: "#10b981",
  dead: "#dc2626",
  expired: "#64748b",
  cancelled: "#cbd5e1",
} as const;
export const QueueChart = memo(function QueueChart({
  points,
  index,
  onSelect,
}: {
  points: QueuePoint[];
  index: number;
  onSelect: (n: number) => void;
}) {
  const { t } = useI18n();
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((p) => p.summary.retained));
  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label={t("queue.chart")}
        className="overflow-x-auto rounded-lg border border-slate-200 p-2"
      >
        <div className="flex h-40 min-w-[640px] items-end gap-px">
          {points.map((p, i) => (
            <button
              type="button"
              key={p.command}
              aria-label={t("queue.inspect", {
                command: String(p.command),
                time: String(p.atMs),
                reason: t(`queue.reason.${p.reason}` as TranslationKey),
              })}
              title={t("queue.inspect", {
                command: String(p.command),
                time: String(p.atMs),
                reason: t(`queue.reason.${p.reason}` as TranslationKey),
              })}
              aria-pressed={i === index}
              tabIndex={i === index ? 0 : -1}
              className="flex h-full min-w-2 flex-1 flex-col justify-end outline-offset-1"
              style={{ outline: i === index ? "2px solid #0f172a" : undefined }}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  const next = Math.max(
                    0,
                    Math.min(
                      points.length - 1,
                      index + (e.key === "ArrowLeft" ? -1 : 1),
                    ),
                  );
                  onSelect(next);
                  (
                    e.currentTarget.parentElement?.children[next] as
                      HTMLButtonElement | undefined
                  )?.focus();
                }
              }}
            >
              {Object.entries(colors).map(([key, color]) => (
                <span
                  key={key}
                  aria-hidden
                  className="w-full"
                  style={{
                    height: `${(p.summary[key as keyof typeof colors] / max) * 95}%`,
                    backgroundColor: color,
                  }}
                />
              ))}
              <span aria-hidden className="h-1 w-full bg-slate-300" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(colors).map(([key, color]) => (
          <span className="flex items-center gap-1" key={key}>
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {t(`queue.status.${key}` as TranslationKey)}
          </span>
        ))}
      </div>
    </div>
  );
});
