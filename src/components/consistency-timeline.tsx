"use client";
import { useState } from "react";
import { useI18n } from "./i18n-provider";
import { lcPretty } from "./consistency-controls";
import { lcTimelineGeometry } from "@/lib/consistency-export";
import type { LCHistory } from "@/lib/consistency-model";
import type { LCResult } from "@/lib/consistency-engine";
export function ConsistencyTimeline({
  history,
  selected,
  select,
}: {
  history: LCHistory;
  selected: string;
  select: (id: string) => void;
}) {
  const { t } = useI18n(),
    geometry = lcTimelineGeometry(history);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">{t("consistency.timelineHelp")}</p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 900 ${geometry.height}`}
          className="min-w-[640px]"
          aria-hidden="true"
        >
          <text x="180" y="25" fontSize="12">
            0 → {geometry.horizon}
          </text>
          {geometry.rows.map(({ op, x, width, y }) => (
            <g key={op.id}>
              <text x="0" y={y + 14} fontSize="12">
                {op.id} · {op.method}
              </text>
              <rect
                x={x}
                y={y}
                width={width}
                height="20"
                rx="4"
                fill={op.end === null ? "#d97706" : "#7c3aed"}
                stroke={op.id === selected ? "#0f172a" : "none"}
                strokeWidth="3"
                strokeDasharray={op.end === null ? "4 3" : undefined}
              />
              <text x="770" y={y + 14} fontSize="11">
                {op.start}–{op.end ?? "…"}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ol className="flex flex-wrap gap-2">
        {geometry.rows.map(({ op }) => (
          <li key={op.id}>
            <button
              type="button"
              className="rounded border px-3 py-2 text-xs"
              aria-label={t("consistency.inspect", { id: op.id })}
              aria-pressed={selected === op.id}
              onClick={() => select(op.id)}
            >
              {op.id} · {op.client} · {op.method}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
export function ConsistencyAnalysis({ result }: { result: LCResult }) {
  const { t } = useI18n(),
    [position, setPosition] = useState(0),
    current = result.order[Math.min(position, result.order.length - 1)];
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">
        {t("consistency.summary", {
          verdict: t(`consistency.${result.verdict}`),
          states: String(result.states),
          attempts: String(result.attempts),
          completed: String(result.completed),
          pending: String(result.pending),
        })}
      </p>
      <p className="text-xs">
        {t("consistency.reason")}: {result.reason} · memo: {result.memoHits}
      </p>
      {result.order.length > 0 && (
        <div className="space-y-3 rounded-lg bg-violet-50 p-3">
          <h4 className="text-sm font-bold">{t("consistency.witness")}</h4>
          <p className="break-all text-xs">
            {result.order.map((op) => op.id).join(" → ")}
          </p>
          <label className="block text-xs font-semibold">
            {t("consistency.playback")}
            <input
              type="range"
              min="0"
              max={result.order.length - 1}
              value={Math.min(position, result.order.length - 1)}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="block w-full"
            />
          </label>
          {current && (
            <>
              <p className="text-xs font-bold">
                {position + 1}. {current.id}
                {current.pending ? ` · ${t("consistency.inferred")}` : ""}
              </p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">
                {lcPretty(current.output)}
              </pre>
              <p className="text-xs font-bold">{t("consistency.state")}</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">
                {lcPretty(current.after)}
              </pre>
            </>
          )}
        </div>
      )}
      {result.ignored.length > 0 && (
        <p className="break-all text-xs">
          {t("consistency.ignored")}: {result.ignored.join(", ")}
        </p>
      )}
      {result.deadEnd && (
        <details>
          <summary className="cursor-pointer text-xs font-bold">
            {t("consistency.deadEnd")}
          </summary>
          <p className="py-2 text-xs">{t("consistency.deadHelp")}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
            {lcPretty(result.deadEnd)}
          </pre>
        </details>
      )}
      <details>
        <summary className="cursor-pointer text-xs font-bold">
          {t("consistency.edges")}
        </summary>
        <ul className="max-h-64 overflow-auto py-2 text-xs">
          {result.edges.map((edge) => (
            <li key={`${edge.before}:${edge.after}`}>
              {edge.before} → {edge.after}: {edge.reason}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
